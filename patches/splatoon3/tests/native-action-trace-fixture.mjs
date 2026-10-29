// Fixed-seed native action evidence. Simulation uses actual composed Actor,
// Character/socket, Level, Physics, WeaponRunner, Projectiles and NetMatch.
// A THREE.Scene is retained without a renderer; paint raster/audio are stubs.
import { fixture } from './source-fixture.mjs';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';
// An explicit built module selects the sealed emitted canonical owner; with
// no override the new leaf is exercised from the source checkout.
const emittedCanonical=process.env.INKWAVE_CANONICAL_TRACE_MODULE;
if(emittedCanonical){
 const site=process.env.INKWAVE_BUILT_SITE;if(!site)throw Error('emitted canonical module requires a built site');
 const rel='patches/network-replication/canonical-weapon-actions.mjs',file=path.resolve(site,rel);
 if(path.resolve(emittedCanonical)!==file)throw Error('canonical module is not the selected site artifact');
 const m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 if(hash(JSON.stringify(m.artifacts))!==m.contentHash||hash(fs.readFileSync(file))!==m.artifacts[rel])throw Error('canonical emitted artifact identity mismatch');
}
const canonicalModule=emittedCanonical?await import(pathToFileURL(emittedCanonical)):await import('../../network-replication/canonical-weapon-actions.mjs');
const {createCanonicalWeaponActions}=canonicalModule;
const DT=1/60, vec=v=>v?.toArray?.()??null;
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
const finiteState=(o,keys)=>Object.fromEntries(keys.map(k=>[k,numeric(o?.[k])]));
function runner(a){const w=a.weaponRunner,s=w.catalogState||{};return {
 ...finiteState(w,['charge','cooldown','sinceShoot','firingT','slosh','flick','flickRecover','rollT','lockT','burstFrac','rollsLeft']),
 charging:!!w.charging,streaming:!!w.streaming,rolling:!!w.rolling,roll:clone(s.roll),pending:!!s.pending,
 catalog:{...finiteState(s,['frame','chargeF','paid','reserved','stream','streamF','streamCharge','streamTime','streamElapsed','stop','burst','burstWait','rounds','turret','rolls','rollingFrames']),stored:s.stored?clone(s.stored):null,pending:s.pending?{remaining:numeric(s.pending.remaining)}:null}};}
function actorState(a){return {form:a.form,alive:a.alive,grounded:a.grounded,ink:a.ink,hp:a.hp,lastFire:a.lastFire,inkIdle:a.inkIdle,
 pos:vec(a.pos),vel:vec(a.vel),prevIntent:{...a._prevIntent},
 resources:{...finiteState(a.s3,['recoverStopRemaining','chargerInterruptRecover','chargerKeepRecover']),dodgeInkRemaining:numeric(a.weaponRunner?.s3DodgeInkRemaining)},runner:runner(a)};}
function birth(p){const c=p.catalog,d=c?.descriptor;return {wid:p.wid??null,owner:p.owner?.nid??null,type:p.type,ghost:!!p.ghost,delay:p.delay,life:p.life,
 age:p.age,pos:vec(p.pos),velocity:vec(p.vel),damage:p.damage,radius:p.radius,size:p.size,
 inkMeta:clone(p.inkMeta),unit:d?.unit??null,index:c?.index??null,key:d?.key??null,seed:numeric(p.seed),
 volleyIndex:numeric(p.s3VolleyIndex),actionIndex:numeric(p.s3ActionIndex),
 slosherIndex:numeric(p.fidelitySloshPacketIndex),rollerIndex:numeric(p.fidelityRollerUnitIndex),
 pendingBirth:!!(p._s3SloshBirthPending||p.catalog?.birthPending)};}
function flight(j){return {owner:j.owner?.nid??null,weapon:j.weapon?.id??null,ghost:!!j.ghost,
 charge:numeric(j.charge),chargeT:numeric(j.chargeT),speed:numeric(j.speed),range:numeric(j.range),travel:numeric(j.travel),
 origin:vec(j.origin),position:vec(j.pos),direction:vec(j.dir),seen:j.seen?.size??null,damage:numeric(j.damage)};}
export async function nativeTraceFixture(){
 let tick=0;const perf={now:()=>1000000+tick*1000/60};
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true,
  vmPerformance:perf,extraExports:"export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';"});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-18,0,0],[18,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-20,-.5,-20],max:[20,0,20]}]});
 G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.projectiles=new f.Projectiles(G.scene);G.camera=new THREE.PerspectiveCamera();G.camera.position.set(0,3,-3);G.camera.updateMatrixWorld();G.settings={};G.time=0;G.mode='match';G.actors=[];G.netm=null;
 const scene=G.scene,ps=G.projectiles;let current=null;
 const push=ps._push;ps._push=function(p,...args){const row=current?birth(p):null;const result=push.call(this,p,...args);if(row){row.netId=numeric(p._netId);current.births.push(row);}return result;};
 const offHit=f.on('hit',e=>{if(current&&e.attacker===current.actor)current.hits.push({weaponId:e.weaponId,damage:e.damage,victim:e.victim?.nid??null,killed:!!e.killed});});
 const unsubscribe=f.on('weapon:fire',e=>{if(current&&e.actor===current.actor)current.fires.push({weapon:e.weapon,muzzle:vec(e.muzzle),dir:vec(e.dir),charge:numeric(e.charge),hand:numeric(e.hand)});});
 function seed(seed){let x=seed>>>0;f.setRandom(()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/2**32;});}
 function run(id,{seedValue=0x66f1035,hold=120,tail=45,inputAt=null,commandAt=null,startingInk=100}={}){
  tick=0;G.time=0;G.actors=[];ps.clear();seed(seedValue);
  const a=new f.Actor({team:0,name:'trace-owner',weapon:id,isLocal:true,CharacterClass:f.Character});
  a.spawnAt(new THREE.Vector3(0,0,0),0);a.character.actor=a;scene.add(a.character.root);a.grounded=true;a.ground.hit=true;a.kidT=10;a.ink=startingInk;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,15);a.nid=1;a.owner='A';G.actors=[a];
  let packets=[];const senderControl=[];const session={myId:'A',isHost:false,ownerClockVersion:1,_members:new Map([['A',{}],['B',{}]]),tr:{broadcast:m=>{packets.push(clone(m));return true;},sendTo(to,m){senderControl.push({to,msg:clone(m)});return true;}}};
  const net=new f.NetMatch(session,{id:'native-action-trace'}),match={actors:[a],playing:()=>true,state:'playing',canRespawn:()=>false};net.bind(match);G.match=match;G.netm=net;
  const target=f.make('shooter');Object.assign(target,{nid:2,owner:'A',team:1,remote:false,invuln:0});target.pos.set(0,0,3);target.grounded=true;G.actors=[a,target];
  // A native receiver admits the actual sender packets. Its display-only proxy
  // uses the fixture's small Character; no remote Actor update is simulated.
  const proxy=f.make(id);Object.assign(proxy,{nid:1,owner:'A',remote:true});G.actors=[a,target];
  const receiverControl=[];const recvSession={myId:'B',isHost:false,ownerClockVersion:1,_members:new Map([['A',{}],['B',{}]]),tr:{broadcast(){return true;},sendTo(to,m){receiverControl.push({to,msg:clone(m)});return true;}}};
  const receiver=new f.NetMatch(recvSession,{id:'native-action-trace'}),recvMatch={actors:[proxy],playing:()=>true,state:'playing',canRespawn:()=>false};receiver.bind(recvMatch);
  // Exchange the actual per-peer nonce challenge and response over a synchronous
  // in-memory transport. No actor or clock watermark is patched to admit rows.
  const query=receiverControl.find(x=>x.to==='A'&&x.msg.k==='ocq');if(!query)throw Error('receiver clock challenge absent');
  G.netm=net;net.onMessage('B',query.msg);const reply=senderControl.find(x=>x.to==='B'&&x.msg.k==='oca');if(!reply)throw Error('sender clock response absent');
  G.netm=receiver;receiver.onMessage('A',reply.msg);G.match=match;G.netm=net;
  const authority=createCanonicalWeaponActions(f.installedRuntime);authority.register(a,{owner:'A',life:1,epoch:'native-action-trace',firstTick:1});
  const nativeRec=net.recProj;net.recProj=function(p,...args){const result=nativeRec.call(this,p,...args);if(current){const row=birth(p);row.netId=numeric(p._netId);current.wireBirths.push(row);}return result;};
  const initial={...actorState(a),nid:1,owner:'A',weapon:id,loadout:clone(a.s3?.loadout)},targetInitial=actorState(target),frames=[],accepted=[];
  try{
   for(tick=1;tick<=hold+tail;tick++){
    const fire=inputAt?!!inputAt(tick):tick<=hold,override=commandAt?.(tick)||{};
    const input={fire,sub:false,jump:false,squid:false,special:false,move:[0,0],...override},aim=[0,0],aimPoint=[0,1.05,15];
    const command={nid:1,owner:'A',life:1,input,aim,aimPoint};
    const before=actorState(a),targetBefore={hp:target.hp,alive:target.alive},capture=current={actor:a,births:[],wireBirths:[],fires:[],hits:[]};
    const prepared=authority.prepare(command,{tick,from:'A'});if(!prepared.ok)throw Error(id+' prepare '+tick+': '+prepared.reason);
    const applied=authority.apply(prepared.token);if(!applied.ok)throw Error(id+' apply '+tick+': '+applied.reason);
    const oldFlights=new Set(ps._fidelityChargerFlights||[]);G.time=tick*DT;a.update(DT);
    const activeFlights=ps._fidelityChargerFlights||[],flightBirths=activeFlights.filter(j=>!oldFlights.has(j)).map(flight),flightsBeforeStep=activeFlights.map(flight);
    ps.update(DT);const flightsAfterStep=(ps._fidelityChargerFlights||[]).map(flight);
    const after=actorState(a);if(tick%3===0){
     net._sendTick();const packet=packets.at(-1);G.netm=receiver;receiver.onMessage('A',clone(packet));G.netm=net;
     accepted.push({tick,accepted:receiver.peers.get('A')?.lastTs===packet.ts,sourceRow:clone(packet.a?.[0]),snapshot:clone(proxy.net?.buf?.at(-1))});
    }
    frames.push({tick,command,input,aim,aimPoint,before,after,targetBefore,targetAfter:{hp:target.hp,alive:target.alive},births:capture.births,wireBirths:capture.wireBirths,flightBirths,flightsBeforeStep,flightsAfterStep,fires:capture.fires,hits:capture.hits});current=null;
   }
   return {id,seed:seedValue,initial,targetInitial,frames,packets,accepted};
  }finally{current=null;authority.forget(a);receiver.dispose();net.dispose();scene.remove(a.character.root);a.character.dispose();ps.clear();G.actors=[];G.netm=null;}
 }
 return {records:f.MAIN_WEAPON_CATALOG.records.map(({id,family,sourceActor})=>({id,family,sourceActor})),run,close(){unsubscribe();offHit();ps._push=push;f.restoreRandom();}};
}
