// Lossless source-frame transport. These are button/pose requests, never proof
// of charge, ink, launch, or damage. Admission belongs to the private replay.
export const NATIVE_CHARGER_INPUT_LIMITS=Object.freeze({actors:32,frames:4096,bytes:512*1024,actorFrames:512,packetFrames:256,packetBytes:24*1024});
const queues=new WeakMap(),active=new WeakMap(),worlds=new WeakMap();
const life=a=>Math.max(a?.netLife??0,a?.net?.lastLife??0);
const native=a=>a?.weapon?.id==='charger'&&a.weapon.kind==='charger'&&!a.weapon.catalogRecord;
const bits=i=>(i?.fire?1:0)|(i?.squid?2:0)|(i?.sub?4:0)|(i?.jump?8:0)|(i?.special?16:0);
const effective=i=>(i?.fire?1:0)|(i?.firePressed?2:0)|(i?.sub?4:0)|(i?.subReleased?8:0);
function live(n,a,G){return !!n&&!n._disposed&&n.s?.match===n&&n.match===G.match&&G.netm===n&&n.byNid?.get(a.nid)===a&&!a.remote&&a.alive&&a.owner===n.myId&&Number.isSafeInteger(a.nid)&&native(a);}
function state(n,G){
 let s=queues.get(n);
 const generation=worlds.get(G.projectiles)||0;
 if(!s||s.session!==n.s||s.match!==n.match||s.epoch!==n.cfg?.id||s.owner!==n.myId||s.world!==G.projectiles||s.level!==G.level||s.physics!==G.physics||s.generation!==generation){
  s={session:n.s,match:n.match,epoch:n.cfg?.id,owner:n.myId,world:G.projectiles,level:G.level,physics:G.physics,generation,actors:new Map(),frames:0,bytes:0,error:null,cursor:0,nextOrder:1};queues.set(n,s);
 }
 for(const [id,c] of s.actors)if(!live(n,c.actor,G)||c.net!==c.actor.net||c.life!==life(c.actor)||c.weapon!==c.actor.weapon){s.frames-=c.rows.length;s.bytes-=c.bytes;s.actors.delete(id);}
 return s;
}
function begin(a,dt,G){
 const n=G.netm;if(!live(n,a,G))return null;
 const s=state(n,G);if(s.error)return null;
 if(!Number.isFinite(dt)||dt<0||dt>1/24+1e-10||!Number.isFinite(G.time)){s.error='Invalid native input frame';return null;}
 let c=s.actors.get(a.nid);
 if(!c){if(s.actors.size>=NATIVE_CHARGER_INPUT_LIMITS.actors){s.error='Native input actor backlog exceeded';return null;}c={actor:a,net:a.net,life:life(a),weapon:a.weapon,next:1,rows:[],bytes:0};s.actors.set(a.nid,c);}
 const f={n,s,c,dt,t:G.time,raw:bits(a.intent),moveX:a.intent.move?.x||0,moveZ:a.intent.move?.z||0,aimYaw:a.aimYaw,aimPitch:a.aimPitch,body:null,resource:false,weapon:null,beforeSeq:n._eventSeq||0};
 if(active.has(a)){s.error='Reentrant native input frame';return null;}
 active.set(a,f);return f;
}
// Called at the actual resource phase, before its first mutation. Some body
// owners intentionally run resources without a WeaponRunner phase that tick.
export function captureNativeChargerResources(a,dt){
 const f=active.get(a);if(!f)return;
 if(f.resource||dt!==f.dt){f.s.error='Ambiguous native resource frame';return;}
 f.resource=true;f.body=[a.pos.x,a.pos.y,a.pos.z,a.vel.y,a.form==='squid'?1:0];
}
function finish(a,f,G){
 if(active.get(a)!==f)return;active.delete(a);
 if(!live(f.n,a,G)||state(f.n,G)!==f.s||f.s.actors.get(a.nid)!==f.c||f.s.error)return;
 // Zero-duration updates do not advance resource/action clocks, but can carry
 // press/release edges and therefore remain real frames in this input log.
 const b=f.body||[a.pos.x,a.pos.y,a.pos.z,a.vel.y,a.form==='squid'?1:0];
 const row=[f.c.next,f.dt,f.t,f.raw,f.weapon,...b,f.aimYaw,f.aimPitch,f.moveX,f.moveZ,f.resource?1:0,f.beforeSeq,f.s.nextOrder];
 if(!row.every((v,i)=>i===4?v===null||Number.isSafeInteger(v):Number.isFinite(v))){f.s.error='Invalid native input value';return;}
 const size=JSON.stringify(row).length+1;
 if(f.c.rows.length>=NATIVE_CHARGER_INPUT_LIMITS.actorFrames||f.s.frames>=NATIVE_CHARGER_INPUT_LIMITS.frames||f.s.bytes+size>NATIVE_CHARGER_INPUT_LIMITS.bytes){f.s.error='Native input backlog exceeded';return;}
 Object.freeze(row);f.c.rows.push(row);f.c.next++;f.c.lastTime=f.t;f.s.nextOrder++;f.c.bytes+=size;f.s.bytes+=size;f.s.frames++;
}
export function installNativeChargerInput({Actor,WeaponRunner,Projectiles,G}){
 const tag=Symbol.for('inkwave.native-charger-input.v1');if(Actor.prototype[tag])return;Object.defineProperty(Actor.prototype,tag,{value:true});
 const update=Actor.prototype.update,weapon=WeaponRunner.prototype.update,clear=Projectiles.prototype.clear;
 Actor.prototype.update=function(dt,...args){const f=begin(this,dt,G);try{return update.call(this,dt,...args);}finally{if(f)finish(this,f,G);}};
 WeaponRunner.prototype.update=function(dt,input,...args){const f=active.get(this.a);if(f){if(f.weapon!==null||dt!==f.dt)f.s.error='Ambiguous native weapon frame';else f.weapon=effective(input);}return weapon.call(this,dt,input,...args);};
 Projectiles.prototype.clear=function(...args){worlds.set(this,(worlds.get(this)||0)+1);return clear.apply(this,args);};
}
export function nativeChargerInputStatus(n,G){const s=state(n,G);return {actors:s.actors.size,frames:s.frames,bytes:s.bytes,error:s.error};}
export function prepareNativeChargerInputs(n,G,maximum=NATIVE_CHARGER_INPUT_LIMITS.packetFrames){
 const s=state(n,G);if(s.error)return {error:s.error};
 const channels=[...s.actors.values()].filter(c=>c.rows.length),chosen=new Map();let frames=0,size=3;
 // Round-robin actor selection prevents a long retained channel from starving
 // the other locally owned actors. Every channel retains an exact prefix.
 if(channels.length){let progress=true;while(progress&&frames<maximum){progress=false;for(let j=0;j<channels.length&&frames<maximum;j++){
  const c=channels[(s.cursor+j)%channels.length],rows=chosen.get(c)||[],row=c.rows[rows.length];if(!row)continue;
  const added=JSON.stringify(row).length+1+(rows.length?0:JSON.stringify([c.actor.nid,c.life,c.weapon.id,[],[c.next-1,c.lastTime]]).length);
  if(size+added>NATIVE_CHARGER_INPUT_LIMITS.packetBytes)continue;
  if(!rows.length)chosen.set(c,rows);rows.push(row);frames++;size+=added;progress=true;
 }}}
 const selections=[...chosen].map(([c,rows])=>({c,rows:Object.freeze(rows)}));
 return {s,selections,frames,payload:selections.length?Object.freeze([2,...selections.map(({c,rows})=>Object.freeze([c.actor.nid,c.life,c.weapon.id,rows,Object.freeze([c.next-1,c.lastTime])]))]):null};
}
export function commitNativeChargerInputs(n,receipt,G){
 if(!receipt?.s||state(n,G)!==receipt.s)return false;
 const s=receipt.s;
 for(const {c,rows} of receipt.selections)if(s.actors.get(c.actor.nid)!==c||rows.some((r,i)=>c.rows[i]!==r))return false;
 for(const {c,rows} of receipt.selections){let size=0;for(const row of rows)size+=JSON.stringify(row).length+1;c.rows.splice(0,rows.length);c.bytes-=size;s.bytes-=size;s.frames-=rows.length;}
 if(receipt.selections.length)s.cursor++;return true;
}
export function forgetNativeChargerInputs(n){queues.delete(n);}
export function validNativeChargerInputPacket(payload){
 if(!Array.isArray(payload)||payload[0]!==2||payload.length<2||payload.length>NATIVE_CHARGER_INPUT_LIMITS.actors+1)return false;
 const ids=new Set();let count=0;
 const bounded=(v,n)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=n;
 const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
 for(let i=1;i<payload.length;i++){
  const batch=payload[i];if(!Array.isArray(batch)||![4,5].includes(batch.length)||!integer(batch[0],Number.MAX_SAFE_INTEGER)||ids.has(batch[0])||!integer(batch[1],Number.MAX_SAFE_INTEGER)||batch[2]!=='charger'||!Array.isArray(batch[3])||!batch[3].length)return false;
  ids.add(batch[0]);let previous=0;
  for(const r of batch[3]){
   if(++count>NATIVE_CHARGER_INPUT_LIMITS.packetFrames||!Array.isArray(r)||r.length!==17||!integer(r[0],Number.MAX_SAFE_INTEGER)||r[0]<1||previous&&r[0]!==previous+1
    ||!bounded(r[1],1/24+1e-10)||r[1]<0||!bounded(r[2],1e12)||r[2]<0||!integer(r[3],31)||r[4]!==null&&!integer(r[4],15)
    ||![5,6,7].every(j=>bounded(r[j],100000))||!bounded(r[8],10000)||!integer(r[9],1)||![10,11].every(j=>bounded(r[j],10000))
    ||![12,13].every(j=>bounded(r[j],1+1e-10))||!integer(r[14],1)||!integer(r[15],10_000_000)||!integer(r[16],Number.MAX_SAFE_INTEGER)||r[16]<1)return false;
   previous=r[0];
  }
  if(batch.length===5&&(!Array.isArray(batch[4])||batch[4].length!==2||!integer(batch[4][0],Number.MAX_SAFE_INTEGER)||batch[4][0]<previous||!bounded(batch[4][1],1e12)||batch[4][1]<batch[3].at(-1)[2]))return false;
 }
 return JSON.stringify(payload).length<=NATIVE_CHARGER_INPUT_LIMITS.packetBytes;
}
