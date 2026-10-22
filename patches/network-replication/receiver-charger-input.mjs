// Receiver enrollment/input/FIFO connection for the native source driver.
// This connection collects a stronger private proof; it does not replace the
// production damage admission until the remaining action contracts are ready.
import { validNativeChargerInputPacket } from '../splatoon3/runtime/native-charger-input.mjs';
import { createNativeChargerReplay, advanceNativeChargerReplay, nativeChargerReplayState, peekNativeChargerReplayLaunch, commitNativeChargerReplayLaunch, retireNativeChargerReplay } from '../splatoon3/runtime/native-charger-replay.mjs';
const states=new WeakMap(),worlds=new WeakMap(),births=new WeakMap();
export const RECEIVER_CHARGER_INPUT_LIMITS=Object.freeze({actors:32,frames:4096,actorFrames:512,bytes:512*1024,steps:256,births:256,peerBirths:48,history:512,checkpoints:32});
const finite=Number.isFinite,safe=Number.isSafeInteger,life=a=>Math.max(a?.netLife??0,a?.net?.lastLife??0);
const native=a=>a?.remote&&a.weapon?.id==='charger'&&a.weapon.kind==='charger'&&!a.weapon.catalogRecord;
function live(s){return !!s&&!s.closed&&!s.nm._disposed&&s.nm.s===s.session&&s.session.match===s.nm&&s.nm.match===s.match&&s.G.match===s.match&&s.G.projectiles===s.world&&s.G.physics===s.physics&&s.G.level===s.level&&s.nm.cfg?.id===s.epoch&&worlds.get(s.world)?.generation===s.generation;}
function actorLive(s,c){return live(s)&&native(c.actor)&&s.nm.byNid?.get(c.actor.nid)===c.actor&&c.actor.net===c.net&&c.actor.weapon===c.weapon&&c.actor.owner===c.from&&life(c.actor)===c.life&&c.actor.alive&&s.session._members?.has(c.from)&&(!c.peer||s.nm.peers.get(c.from)===c.peer);}
function discard(s,c,reason){
 if(c.reason)return;c.reason=reason;
 s.frames-=c.queue.length;s.bytes-=c.bytes;c.queue.length=0;c.bytes=0;
 if(c.driver)retireNativeChargerReplay(c.driver);c.driver=null;
 s.birthCount-=c.pending.size;c.pending.clear();c.checkpoints.clear();
}
function world(system){
 let w=worlds.get(system);if(w)return w;
 w={generation:0,states:new Set()};worlds.set(system,w);const clear=system.clear;
 if(typeof clear==='function')system.clear=function(...args){w.generation++;for(const s of [...w.states])closeReceiverChargerInputs(s.nm);return clear.apply(this,args);};return w;
}
export function bindReceiverChargerInputs(nm,G,at){
 closeReceiverChargerInputs(nm);
 if(!nm?.match||!G?.projectiles||!G.physics||!G.level||!finite(at))return;
 const w=world(G.projectiles),s={nm,G,session:nm.s,match:nm.match,epoch:nm.cfg?.id,world:G.projectiles,physics:G.physics,level:G.level,generation:w.generation,boundAt:at,channels:new Map(),frames:0,bytes:0,birthCount:0,closed:false};states.set(nm,s);w.states.add(s);
 for(const a of nm.byNid.values()){
  if(!native(a)||!safe(a.nid)||!a.pos?.clone||!a.vel?.clone||!finite(a.yaw))continue;if(s.channels.size>=RECEIVER_CHARGER_INPUT_LIMITS.actors)break;
  // Only bind-time source spawn state is eligible. No later packet can enroll
  // a new life or reset private ink by replacing its actor/body witness.
  s.channels.set(a.nid,{actor:a,net:a.net,weapon:a.weapon,life:life(a),from:a.owner,peer:null,position:a.pos.clone(),velocity:a.vel.clone(),yaw:a.yaw,loadout:a.s3?.loadout,gearKey:null,queue:[],bytes:0,history:new Map(),nextReceived:1,nextExecuted:1,origin:null,lastTime:null,lastBefore:0,lastOrder:0,elapsed:0,driver:null,reason:null,pending:new Map(),checkpoints:new Map(),verified:0,matched:0,committed:0,wait:null});
 }
}
export function observeReceiverChargerInputs(nm,from,packet,G,at){
 const s=states.get(nm);if(!live(s)||G!==s.G||!finite(at)||at<s.boundAt||!validNativeChargerInputPacket(packet?.ci))return false;
 const peer=nm.peers.get(from),points=peer?.physicsPoints;
 if(!safe(packet.u)||points?.at(-2)!==packet.ts||points?.at(-1)!==packet.u)return false;
 for(const batch of packet.ci.slice(1)){
  const c=s.channels.get(batch[0]),a=c?.actor,snap=a?.net?.buf?.at(-1);
  if(!c||c.reason||c.from!==from||batch[1]!==c.life||!actorLive(s,c)||snap?.t!==packet.ts||snap.life!==c.life)continue;
  c.peer=peer;
  const gear=snap.adoption?.gear;
  if(gear){if(c.gearKey!==null&&gear.key!==c.gearKey){discard(s,c,'equipment-transition');continue;}c.gearKey=gear.key;c.loadout=gear.loadout;}
  let next=c.nextReceived,t=c.lastTime,before=c.lastBefore,order=c.lastOrder,size=0,reason=null;const append=[];
  for(const row of batch[3]){
   if(row[0]<next){const old=c.history.get(row[0]);if(!old||old.length!==row.length||old.some((v,i)=>v!==row[i])){reason='input-prefix-mismatch';break;}continue;}
   const epsilon=Number.EPSILON*Math.max(1,Math.abs(row[2]),Math.abs(t||0))*4;
   if(row[0]!==next||t!==null&&Math.abs(row[2]-(t+row[1]))>epsilon||row[15]<before||row[16]<=order||row[2]*60>packet.u+.500000001){reason='input-gap-clock-or-order';break;}
   const copy=Object.freeze(row.slice());append.push(copy);size+=JSON.stringify(copy).length+1;next++;t=row[2];before=row[15];order=row[16];
  }
  if(reason){discard(s,c,reason);continue;}
  if(c.queue.length+append.length>RECEIVER_CHARGER_INPUT_LIMITS.actorFrames||s.frames+append.length>RECEIVER_CHARGER_INPUT_LIMITS.frames||s.bytes+size>RECEIVER_CHARGER_INPUT_LIMITS.bytes){discard(s,c,'input-backlog');continue;}
  if(c.origin===null&&append.length)c.origin=append[0][2]-append[0][1];
  for(const row of append){c.queue.push(row);c.history.set(row[0],row);while(c.history.size>RECEIVER_CHARGER_INPUT_LIMITS.history)c.history.delete(c.history.keys().next().value);}
  c.nextReceived=next;c.lastTime=t;c.lastBefore=before;c.lastOrder=order;c.bytes+=size;s.bytes+=size;s.frames+=append.length;
  const check=batch[4];if(check&&check[1]*60<=packet.u+.500000001){c.checkpoints.set(check[0],{time:check[1],x:snap.x,y:snap.physicalY,z:snap.z,vy:snap.vy,form:snap.f&2?'squid':'kid'});while(c.checkpoints.size>RECEIVER_CHARGER_INPUT_LIMITS.checkpoints)c.checkpoints.delete(c.checkpoints.keys().next().value);}
 }
 return true;
}
function matchBirths(s,c,at){
 for(const [seq,item] of c.pending){
  if(at-item.at>1.4){c.pending.delete(seq);s.birthCount--;continue;}
  if(!c.driver||c.reason||c.verified<item.frameMinimum)continue;
  const d=item.event[3],receipt=peekNativeChargerReplayLaunch(c.driver,{tick:item.event._netTick,charge:d.charge,full:d.full});
  if(!receipt||receipt.frame>c.verified)continue;
  const body=receipt.body,V=s.nm._combatProvenanceTHREE?.Vector3;
  if(!body||typeof V!=='function'||Math.hypot(d.muzzle[0]-body[0],d.muzzle[1]-body[1]-1.05,d.muzzle[2]-body[2])>1.7||Math.abs(d.len-receipt.range)>.011||s.physics.segment(new V(body[0],body[1]+1.05,body[2]),new V(...d.muzzle),undefined,true).hit){c.pending.delete(seq);s.birthCount--;continue;}
  births.set(item.event,{s,c,receipt,used:false});c.matched++;c.pending.delete(seq);s.birthCount--;
 }
}
export function advanceReceiverChargerInputs(nm,G,at,from=null,event=null){
 const s=states.get(nm);if(!live(s)||G!==s.G||!finite(at)||at<s.boundAt)return 0;
 for(const c of s.channels.values()){
  if(c.reason||from&&c.from!==from)continue;
  if(!actorLive(s,c)){discard(s,c,'actor-lifecycle');continue;}
  // Expiry/lifecycle cleanup also runs when there are no source frames to
  // execute, so a missing input prefix cannot pin idle pending requests.
  matchBirths(s,c,at);
 }
 let count=0;
 const owners=from?[from]:[...new Set([...s.channels.values()].map(c=>c.from))];
 for(const owner of owners){
  const peer=nm.peers.get(owner);if(!peer||!finite(peer.sim))continue;
  while(count<RECEIVER_CHARGER_INPUT_LIMITS.steps){
   let selected=null;
   for(const c of s.channels.values()){
    if(c.from!==owner||c.reason||!c.queue.length)continue;
    if(!actorLive(s,c)){discard(s,c,'actor-lifecycle');continue;}
    if(!selected||c.queue[0][16]<selected.queue[0][16])selected=c;
   }
   const c=selected;if(!c)break;const row=c.queue[0],tick=Math.round(row[2]*60),barrier=event?event._netSeq:(peer._lastEventSeq||0);
   c.wait=null;
   if(row[2]*60>peer.sim+.500000001||event&&tick>event._netTick){c.wait='playback-clock';break;}
   if(!safe(barrier)||(event?!(row[15]<barrier):!(row[15]<=barrier))){c.wait='event-barrier';break;}
   if(c.elapsed+row[1]>Math.max(0,at-s.boundAt)+1e-9){c.wait='receiver-elapsed';break;}
   if(!c.driver){c.driver=createNativeChargerReplay(c.actor,{position:c.position,velocity:c.velocity,yaw:c.yaw,time:c.origin,loadout:c.loadout});if(!c.driver){discard(s,c,'source-driver-unavailable');continue;}}
   if(!advanceNativeChargerReplay(c.driver,[row])){discard(s,c,nativeChargerReplayState(c.driver)?.error||'source-replay');continue;}
   const size=JSON.stringify(row).length+1;c.queue.shift();c.bytes-=size;s.bytes-=size;s.frames--;c.elapsed+=row[1];c.nextExecuted++;count++;
   const checkpoint=c.checkpoints.get(row[0]);
   if(checkpoint){
    const actual=nativeChargerReplayState(c.driver),p=actual.position;
    if(Math.abs(actual.time-checkpoint.time)>1e-9||Math.abs(p[0]-checkpoint.x)>.005500001||Math.abs(p[1]-checkpoint.y)>.000500001||Math.abs(p[2]-checkpoint.z)>.005500001||actual.form!==checkpoint.form){discard(s,c,'canonical-body-or-external-transition');continue;}
    c.verified=row[0];c.checkpoints.delete(row[0]);
   }
   matchBirths(s,c,at);
  }
 }
 return count;
}
function validBirth(e){const d=e?.[3];return e?.[1]==='ev'&&e[2]==='weapon:fire'&&safe(e._netSeq)&&safe(e._netTick)&&finite(e[0])&&d?.weapon==='charger'&&finite(d.charge)&&d.charge>=0&&d.charge<=1&&typeof d.full==='boolean'&&finite(d.len)&&d.len>0&&['muzzle','dir'].every(k=>Array.isArray(d[k])&&d[k].length===3&&d[k].every(v=>finite(v)&&Math.abs(v)<=100000))&&Math.abs(Math.hypot(...d.dir)-1)<.02;}
export function observeReceiverChargerBirth(nm,from,e,G,at){
 const s=states.get(nm),c=s?.channels.get(e?.[3]?.actor?.n),peer=nm.peers.get(from);
 if(!live(s)||G!==s.G||!c||c.reason||c.from!==from||!actorLive(s,c)||!validBirth(e)||!peer?.events?.includes(e)||c.pending.has(e._netSeq)||births.has(e))return false;
 if(c.pending.size>=RECEIVER_CHARGER_INPUT_LIMITS.peerBirths||s.birthCount>=RECEIVER_CHARGER_INPUT_LIMITS.births){discard(s,c,'birth-backlog');return false;}
 // Canonical body checkpoints may execute after this same FIFO event. The
 // separate bounded pending birth never blocks normal production playback.
 c.pending.set(e._netSeq,{event:e,at,frameMinimum:c.nextExecuted-1});s.birthCount++;matchBirths(s,c,at);return true;
}
export function peekReceiverChargerBirth(nm,e){const b=births.get(e);return b&&!b.used&&b.s.nm===nm&&actorLive(b.s,b.c)&&!b.c.reason?b.receipt:null;}
export function commitReceiverChargerBirth(nm,e){const b=births.get(e);if(!peekReceiverChargerBirth(nm,e)||!commitNativeChargerReplayLaunch(b.c.driver,b.receipt))return false;b.used=true;b.c.committed++;return true;}
export function receiverChargerInputStatus(nm){
 const s=states.get(nm);if(!s)return {bound:false};
 return {bound:true,closed:s.closed,frames:s.frames,bytes:s.bytes,births:s.birthCount,actors:[...s.channels.values()].map(c=>({nid:c.actor.nid,life:c.life,nextReceived:c.nextReceived,nextExecuted:c.nextExecuted,elapsed:c.elapsed,reason:c.reason,wait:c.wait,verified:c.verified,matched:c.matched,committed:c.committed,replay:c.driver?nativeChargerReplayState(c.driver):null}))};
}
export function retireReceiverChargerInputs(nm,from){const s=states.get(nm);if(!s)return;for(const [id,c] of s.channels)if(c.from===from){discard(s,c,'peer-left');s.channels.delete(id);}}
export function closeReceiverChargerInputs(nm){const s=states.get(nm);if(!s)return;for(const c of s.channels.values())discard(s,c,'closed');s.closed=true;worlds.get(s.world)?.states.delete(s);states.delete(nm);}
