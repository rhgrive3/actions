// Native authority building block, deliberately not installed on NetMatch.
// Run in a dedicated native realm/worker: the native event bus and module-local
// gameplay owners must belong to that realm. Commands are requests, never
// witnesses that can assign HP, ink, charge, grounded state or projectile data.
const sessions = new WeakMap(), contacts = new WeakMap(), realms = new WeakMap();
const finite = n => typeof n === 'number' && Number.isFinite(n);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const triple = a => Array.isArray(a) && a.length === 3 && a.every(finite);
const limits = Object.freeze({actors:32, contacts:4096, dt:0.1});
const contextKeys = ['scene','camera','renderer','fx','audio','input','local','netm','mode','time','actors','projectiles','level','physics','paint','match','boss'];
const clone = x => JSON.parse(JSON.stringify(x));

// This is the native ctx.js mulberry32 algorithm. Its seed belongs to the
// authority. A client's reported spread/velocity never advances or seeds it.
function random(seed) {
  let a=seed>>>0;
  return () => { a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296; };
}
function scope(s, fn) {
  if(s.executing) throw Error('Reentrant native authority frame');
  const G=s.api.G, before=contextKeys.map(k=>({present:Object.hasOwn(G,k),value:G[k]})), oldRandom=Math.random;
  s.executing=true;
  for(const k of contextKeys) G[k]=s.context[k];
  Math.random=s.random;
  try { return fn(); }
  finally {
    Math.random=oldRandom;
    for(let i=0;i<contextKeys.length;i++){const k=contextKeys[i],v=before[i];if(v.present)G[k]=v.value;else delete G[k];}
    s.executing=false;
  }
}
function live(s) { return !!s && !s.closed && s.error===null && realms.get(s.api.G)===s; }
function liveContact(s,r) {
  return s.actors.get(r.attacker)?.netLife===r.attackerLife &&
    (r.kind!=='pvp'||s.actors.get(r.victim)?.netLife===r.victimLife);
}
function append(s, data) {
  if(s.pending.size>=limits.contacts) throw Error('Native contact backlog exhausted');
  const token=Object.freeze({});
  const record=Object.freeze({...data,epoch:s.epoch,tick:s.tick,time:s.context.time,serial:++s.serial});
  contacts.set(token,{session:s,record,used:false});s.pending.add(token);
}
function bindDamage(s, actor) {
  const native=actor.damage;
  actor.damage=function(amount,attacker,source,...args){
    if(!s.executing)throw Error('Private native actor outside authority scope');
    const before=this.hp,alive=this.alive,life=this.netLife;
    const result=native.call(this,amount,attacker,source,...args);
    if(alive&&finite(before)&&this.hp<before&&s.actorSet.has(attacker))append(s,{
      kind:'pvp',attacker:attacker.nid,attackerLife:attacker.netLife,
      victim:this.nid,victimLife:life,source,damage:amount,hpBefore:before,hpAfter:this.hp,killed:!this.alive,
    });
    return result;
  };
}
function bindBoss(s,boss) {
  if(!boss)return;
  if(typeof boss.hit!=='function'||typeof boss.applyDamage!=='function'||typeof boss._hitCrab!=='function')throw Error('Native Boss damage owners required');
  let source=null;
  for(const [name,index] of [['hit',3],['splash',5]]){
    const native=boss[name];if(typeof native!=='function')continue;
    boss[name]=function(...args){const old=source;source=args[index];try{return native.apply(this,args);}finally{source=old;}};
  }
  for(const name of ['applyDamage','_hitCrab']){
    const native=boss[name];
    boss[name]=function(...args){
      if(!s.executing)throw Error('Private native Boss outside authority scope');
      const attacker=args[0],object=name==='applyDamage'?this:args[1],amount=args[name==='applyDamage'?1:2],before=object.hp;
      const result=native.apply(this,args);
      if(finite(before)&&object.hp<before&&s.actorSet.has(attacker))append(s,{
        kind:object===this?'boss':'crablet',attacker:attacker.nid,attackerLife:attacker.netLife,
        victim:object===this?-1:object.id,victimLife:0,source:source??'boss-native',damage:amount,hpBefore:before,hpAfter:object.hp,killed:!!object.dead,
      });
      return result;
    };
  }
}
function validCommand(c,a) {
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['nid','owner','life','input','aim','aimPoint'].includes(k)))return false;
  if(c.nid!==a.nid||c.owner!==a.owner||c.life!==a.netLife||!Array.isArray(c.aim)||c.aim.length!==2||!c.aim.every(finite)||c.aimPoint!==undefined&&!triple(c.aimPoint))return false;
  const i=c.input;
  return !!i&&typeof i==='object'&&!Array.isArray(i)&&!Object.keys(i).some(k=>!['fire','squid','sub','jump','special','booyah','move'].includes(k))&&
    (i.booyah===undefined||typeof i.booyah==='boolean')&&
    ['fire','squid','sub','jump','special'].every(k=>typeof i[k]==='boolean')&&Array.isArray(i.move)&&i.move.length===2&&i.move.every(finite)&&Math.hypot(...i.move)<=1+1e-12;
}
function applyCommand(c,a) {
  for(const k of ['fire','squid','sub','jump','special'])a.intent[k]=c.input[k];
  a.intent.booyah=!!c.input.booyah;
  a.intent.move.set(c.input.move[0],0,c.input.move[1]);
  [a.aimYaw,a.aimPitch]=c.aim;
  if(c.aimPoint)a.aimPoint.set(...c.aimPoint);
}

export function createTrustedNativeReplay(api,{isolatedRealm=false,epoch,seed,time=0,world,roster,CharacterClass=api?.Character,commands=null}={}) {
  if(!isolatedRealm||!api?.G||!api.Actor||!api.Projectiles||!api.THREE||typeof CharacterClass!=='function')throw Error('Dedicated native realm and installed native API required');
  if(realms.has(api.G))throw Error('Native realm already leased');
  if(typeof epoch!=='string'||!epoch||!integer(seed)||seed>0xffffffff||!finite(time)||!world?.level||!world.physics||!world.paint||!world.match)throw Error('Trusted world, epoch, time and seed required');
  if(!Array.isArray(roster)||!roster.length||roster.length>limits.actors)throw Error('Invalid trusted roster');
  const ids=new Set();
  for(const r of roster){
    if(!r||!integer(r.nid)||ids.has(r.nid)||typeof r.owner!=='string'||!r.owner||!integer(r.life)||![0,1].includes(r.team)||!integer(r.slot)||typeof r.weapon!=='string'||!api.WEAPONS?.[r.weapon]||!triple(r.position)||!finite(r.yaw))throw Error('Invalid trusted native spawn');
    if(Object.keys(r).some(k=>!['nid','owner','life','team','slot','weapon','position','yaw','loadout','style'].includes(k)))throw Error('Owner result state cannot initialize native replay');
    ids.add(r.nid);
  }
  const token=Object.freeze({}),scene=new api.THREE.Scene(),camera=new api.THREE.PerspectiveCamera();
  camera.position.set(0,10000,0);
  const s={api,epoch,random:random(seed),tick:0,serial:0,actors:new Map(),actorSet:new Set(),pending:new Set(),launches:[],closed:false,error:null,executing:false,commands,offs:[],context:{
    scene,camera,renderer:null,fx:null,audio:null,input:null,local:null,netm:null,mode:'match',time,actors:[],projectiles:null,
    level:world.level,physics:world.physics,paint:world.paint,match:world.match,boss:null,
  },world};
  sessions.set(token,s);realms.set(api.G,s);
  try {
    scope(s,()=>{
      s.context.projectiles=api.G.projectiles=new api.Projectiles(scene);
      for(const r of roster){
        const a=new api.Actor({team:r.team,name:'trusted-native-'+r.nid,weapon:r.weapon,slot:r.slot,isLocal:false,isBot:false,CharacterClass,style:r.style});
        Object.assign(a,{nid:r.nid,owner:r.owner,remote:false});
        if(a.character)a.character.actor=a;
        if(r.loadout){a.s3||={};a.s3.loadout=clone(r.loadout);a.s3RefreshGear?.();}
        s.actors.set(r.nid,a);s.actorSet.add(a);s.context.actors.push(a);scene.add(a.character.root);
        bindDamage(s,a);
        // This trusted callback runs native lifecycle setup, e.g. initial Turf
        // Squid Spawn. It is not supplied by a wire event or owner snapshot.
        if(world.initializeActor)world.initializeActor(a,r,api);
        else a.spawnAt(new api.THREE.Vector3(...r.position),r.yaw);
        if(a.netLife!==r.life)throw Error('Trusted life requires its actual native spawn history');
        commands?.register(a,{owner:r.owner,life:r.life,epoch,firstTick:1});
      }
      s.context.boss=api.G.boss=world.createBoss?.(api.G,api)||null;
      bindBoss(s,s.context.boss);
      if(typeof api.on==='function')s.offs.push(api.on('weapon:fire',e=>{
        if(s.executing&&s.actorSet.has(e.actor)){
          if(s.launches.length>=256)s.launches.shift(); // bounded observation, never a gameplay quota
          s.launches.push(Object.freeze({tick:s.tick,time:api.G.time,nid:e.actor.nid,weapon:e.weapon,charge:e.charge??null,full:e.full??null,muzzle:e.muzzle?.toArray(),dir:e.dir?.toArray()}));
        }
      }));
    });
  } catch(error) { s.error=String(error?.message||error);disposeTrustedNativeReplay(token);throw error; }
  return token;
}

export function advanceTrustedNativeReplay(token,frame,authorization) {
  const s=sessions.get(token);
  if(!live(s))return {ok:false,reason:'retired-native-replay'};
  if(!frame||frame.tick!==s.tick+1||!finite(frame.dt)||frame.dt<=0||frame.dt>limits.dt||!Array.isArray(frame.commands)||frame.commands.length!==s.actors.size||Object.keys(frame).some(k=>!['tick','dt','commands'].includes(k)))return {ok:false,reason:'invalid-native-frame'};
  if(!authorization?.owners||typeof authorization.owners.get!=='function')return {ok:false,reason:'authenticated-command-owners-required'};
  const seen=new Set(),prepared=[];
  // Validate the entire request before applying even the first actor's input.
  for(const c of frame.commands){
    const a=s.actors.get(c?.nid);
    if(!a||seen.has(c.nid)||!validCommand(c,a)||authorization.owners.get(c.nid)!==a.owner)return {ok:false,reason:'invalid-native-command'};
    seen.add(c.nid);
    if(s.commands){const p=s.commands.prepare(c,{tick:frame.tick,from:authorization.owners.get(c.nid)});if(!p?.ok)return {ok:false,reason:p?.reason||'canonical-command-rejected'};prepared.push(p.token);}
  }
  s.tick=frame.tick;s.context.time+=frame.dt;
  try {
    scope(s,()=>{
      if(s.commands){for(const t of prepared)if(!s.commands.apply(t))throw Error('Canonical command commit rejected');}
      else for(const c of frame.commands)applyCommand(c,s.actors.get(c.nid));
      s.world.beforeActors?.(s.context.actors,frame.dt,s.api);
      for(const a of s.context.actors)a.update(frame.dt);
      s.world.afterActors?.(s.context.actors,frame.dt,s.api);
      s.context.projectiles.update(frame.dt);
      s.world.afterProjectiles?.(s.context.actors,frame.dt,s.api);
    });
  }catch(error){s.error=String(error?.message||error);s.pending.clear();return {ok:false,reason:s.error};}
  return {ok:true,tick:s.tick,contacts:s.pending.size};
}

// The claim only selects an already executed native effect. It never mints an
// effect from fire metadata, proximity, reported resources or a damage ceiling.
export function peekTrustedNativeContact(token,claim) {
  const s=sessions.get(token);
  if(!live(s)||!claim||Object.keys(claim).some(k=>!['epoch','tick','kind','attacker','attackerLife','victim','victimLife','source','damage'].includes(k)))return null;
  for(const t of s.pending){const c=contacts.get(t),r=c.record;
    if(!c.used&&liveContact(s,r)&&['epoch','tick','kind','attacker','attackerLife','victim','victimLife','source','damage'].every(k=>Object.is(claim[k],r[k])))return t;
  }
  return null;
}
export function commitTrustedNativeContact(token,receipt) {
  const s=sessions.get(token),c=contacts.get(receipt);
  if(!live(s)||!c||c.session!==s||c.used||!s.pending.has(receipt)||!liveContact(s,c.record))return null;
  c.used=true;s.pending.delete(receipt);return clone(c.record);
}
export function inspectTrustedNativeReplay(token) {
  const s=sessions.get(token);if(!s)return null;
  return clone({epoch:s.epoch,tick:s.tick,time:s.context.time,closed:s.closed,error:s.error,contacts:s.pending.size,effects:[...s.pending].map(t=>contacts.get(t).record),launches:s.launches,
    boss:s.context.boss?{hp:s.context.boss.hp,dead:s.context.boss.dead,crablets:[...s.context.boss.crabs.values()].map(c=>({id:c.id,hp:c.hp,dead:c.dead}))}:null,
    actors:[...s.actors.values()].map(a=>{const spawn=a.s3?.squidSpawn;return {nid:a.nid,owner:a.owner,life:a.netLife,weapon:a.weapon.id,ink:a.ink,hp:a.hp,alive:a.alive,form:a.form,position:a.pos.toArray(),velocity:a.vel.toArray(),yaw:a.yaw,grounded:a.grounded,aimPoint:a.aimPoint.toArray(),charge:a.weaponRunner.charge,chargeT:a.weaponRunner.chargeT,cooldown:a.weaponRunner.cooldown,lastFire:a.lastFire,special:a.special,
      squidSpawn:spawn?{phase:spawn.phase,wait:spawn.wait??0,t:spawn.t??0,playWait:spawn.playWait??0,target:spawn.target,from:spawn.from,to:spawn.to}:null,
      pose:Object.fromEntries(['hips','spine','chest','head','footL','footR'].flatMap(k=>{const b=a.character.bones?.[k];return b?[[k,{position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()}]]:[])),
    };})});
}
export function disposeTrustedNativeReplay(token) {
  const s=sessions.get(token);if(!s||s.closed)return;
  s.pending.clear();s.closed=true;
  for(const off of s.offs)off();s.offs.length=0;
  try{scope(s,()=>{s.context.projectiles?.clear();for(const a of s.actors.values())a.character?.dispose?.();});}
  finally{if(realms.get(s.api.G)===s)realms.delete(s.api.G);}
}
