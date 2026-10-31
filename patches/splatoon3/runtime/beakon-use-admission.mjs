import { observeOwnerTick } from '../../network-replication/owner-tick-receipt.mjs';

// A transport owner may propose a Beakon use, but a catalogue row cannot
// manufacture a jump. Keep its native accepted history and playback capability
// outside actor presentation state and outside sender-controlled JSON fields.
const states=new WeakMap(),capabilities=new WeakMap(),proofs=new WeakMap();
const finite=Number.isFinite,safe=Number.isSafeInteger;
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const clock=()=>performance.now()/1000;
const MAX_EPOCHS=8,MAX_PENDING=24,WAIT=2,HISTORY_SECONDS=12;
// Stable native packed-actor wire bits; the producer/receiver test verifies
// these against the real NET_FLAGS export without importing browser source
// into the catalogue's Node build-time metadata readers.
const NATIVE_ALIVE=1,NATIVE_GROUNDED=16;
const point=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const near=(a,b,e=.075)=>point(a)&&point(b)&&a.every((v,i)=>Math.abs(v-b[i])<=e);
const position=o=>[o.pos.x,o.pos.y,o.pos.z];
const signature=e=>{try{return JSON.stringify([e,e._netPeer,e._netSeq,e._netTick]);}catch{return null;}};
function state(nm){let s=states.get(nm);if(!s||s.session!==nm.s||s.match!==nm.match||s.id!==nm.cfg?.id){s={session:nm.s,match:nm.match,id:nm.cfg?.id,actors:new WeakMap(),events:new WeakMap(),pending:[]};states.set(nm,s);}return s;}
function current(nm,s){return !!s&&states.get(nm)===s&&!nm._disposed&&s.session===nm.s&&s.match===nm.match&&s.id===nm.cfg?.id;}
function actorState(nm,s,actor){const peer=nm.peers?.get(actor.owner);let a=s.actors.get(actor);
 if(!a||a.owner!==actor.owner||a.net!==actor.net||a.life!==life(actor)||a.peer!==peer){a={owner:actor.owner,net:actor.net,life:life(actor),peer,highest:0,epochs:new Map()};s.actors.set(actor,a);}return a;}
function captureSnapshot(nm,s,actor,snap){
 const a=actorState(nm,s,actor),epoch=snap.sjEpoch,jump=snap.adoption?.jump;
 for(const [key,r]of a.epochs)if(snap.t-r.updated>HISTORY_SECONDS)a.epochs.delete(key);
 if(!safe(epoch)||epoch<1||epoch<a.highest)return;
 let r=a.epochs.get(epoch);a.highest=Math.max(a.highest,epoch);
 if(jump){
  if(!(snap.f&NATIVE_ALIVE)||!['charge','flight'].includes(jump.phase)||!point(jump.to)||!point(jump.from)||!finite(jump.elapsed)||jump.elapsed<0)return;
  if(!r){r={epoch,to:jump.to.slice(),first:snap.t-jump.elapsed,updated:snap.t,phase:jump.phase,flight:null,ended:null,land:null,bound:null};a.epochs.set(epoch,r);while(a.epochs.size>MAX_EPOCHS)a.epochs.delete(a.epochs.keys().next().value);}
  if(r.ended||r.bound?.stage==='cancel'||!near(r.to,jump.to,.001)||r.phase==='flight'&&jump.phase==='charge')return;
  if(jump.phase==='flight'){
   if(!finite(jump.duration)||jump.duration<=0||jump.elapsed>jump.duration+1e-6)return;
   if(r.flight&&(!near(r.flight.from,jump.from,.001)||Math.abs(r.flight.duration-jump.duration)>1e-6||jump.elapsed+1e-6<r.flight.elapsed))return;
   r.flight={from:jump.from.slice(),duration:jump.duration,elapsed:jump.elapsed,time:snap.t};
  }
  r.phase=jump.phase;r.updated=snap.t;
 }else if(r?.flight&&!r.ended&&(snap.f&NATIVE_ALIVE)&&(snap.f&NATIVE_GROUNDED)&&
    near(r.to,[snap.x,snap.y,snap.z])&&r.flight.elapsed+Math.max(0,snap.t-r.flight.time)>=r.flight.duration-1/30){
  r.ended={time:snap.t,position:[snap.x,snap.y,snap.z]};r.updated=snap.t;
 }
}
function validEvent(nm,s,record,event){return current(nm,s)&&record.signature===signature(event)&&record.session===nm.s&&record.match===nm.match&&
 nm.s?._members?.has(record.from)&&nm.byNid?.get(record.actor.nid)===record.actor&&record.actor.remote&&record.actor.owner===record.from&&
 record.actor.net===record.net&&life(record.actor)===record.life&&nm.peers?.get(record.from)===record.peer;}
function replay(nm,s,entry){
 if(!validEvent(nm,s,entry.record,entry.event))return false;
 const scope={nm,s,...entry,waiting:false};capabilities.set(entry.payload,scope);
 try{const result=entry.run();if(result!==true&&scope.waiting&&clock()-entry.at<WAIT&&s.pending.length<MAX_PENDING)s.pending.push(entry);return result;}
 finally{capabilities.delete(entry.payload);}
}
function flush(nm,s){const pending=s.pending;s.pending=[];for(const p of pending)if(clock()-p.at<WAIT)replay(nm,s,p);}
export function observeBeakonTick(nm,from,packet,run){
 const observed=observeOwnerTick(nm,from,packet,run),receipt=observed.receipt;
 if(!receipt||receipt.ownerSession!==nm.s||receipt.ownerMatch!==nm.match||receipt.ownerMatchId!==nm.cfg?.id||nm._disposed)return observed.result;
 const s=state(nm),peer=nm.peers?.get(from);if(!peer)return observed.result;
 for(const actor of receipt.actors||[]){const snap=actor?.net?.buf?.at(-1);
  if(actor.remote&&actor.owner===from&&snap?.t===packet.ts&&snap.life===life(actor)&&snap.adoption?.life===snap.life)captureSnapshot(nm,s,actor,snap);}
 for(const event of receipt.nativeEvents||[]){
  if(event[1]==='ev'&&event[2]==='superjump:land'){
   const actor=nm.byNid?.get(event[3]?.actor?.n),a=actor&&s.actors.get(actor);
   if(!a||a.owner!==from||a.net!==actor.net||a.life!==life(actor)||a.peer!==peer||!point(event[3]?.pos))continue;
   // An event-only packet may precede the final body sample. Keep the native
   // event, but it grants no consumption until the body proves the endpoint.
   // Choose one latest matching epoch; one native landing cannot fund two uses.
   for(const r of [...a.epochs.values()].reverse())if(r.flight&&near(r.to,event[3].pos)&&
     event[0]>=r.flight.time-.075&&event[0]-r.flight.time<=r.flight.duration-r.flight.elapsed+WAIT&&
     r.flight.elapsed+Math.max(0,event[0]-r.flight.time)>=r.flight.duration-1/30){
    r.land={time:event[0],sequence:event._netSeq??event[5]??null};break;
   }
   continue;
  }
  if(event[1]!=='ac'||event[2]!=='sub'||event[5]?.phase!=='beakonUseProposal')continue;
  const actor=nm.byNid?.get(event[3]);if(!actor?.remote||actor.owner!==from||event[4]!==life(actor)||event[5].life!==event[4])continue;
  const sig=signature(event);if(sig===null)continue;
  s.events.set(event,{actor,net:actor.net,peer,from,life:life(actor),session:nm.s,match:nm.match,signature:sig,time:event[0],sequence:event._netSeq??event[7]??null});
 }
 flush(nm,s);return observed.result;
}
export function withBeakonUseAdmission(nm,from,event,payload,run){
 const s=states.get(nm),record=s?.events.get(event);if(!record||record.from!==from||!validEvent(nm,s,record,event))return false;
 s.events.delete(event);return replay(nm,s,{record,event,payload,run,at:clock()});
}
export function beakonUseProof(nm,actor,beacon,payload){
 const scope=capabilities.get(payload);if(!scope||scope.nm!==nm||scope.record.actor!==actor||!validEvent(nm,scope.s,scope.record,scope.event)||
  !safe(payload.jumpEpoch)||payload.jumpEpoch<1||!safe(payload.reservationId)||payload.reservationId<1||
  !beacon?.owner||beacon.owner.remote||payload.targetOwnerLife!==life(beacon.owner))return null;
 const a=scope.s.actors.get(actor),r=a?.epochs.get(payload.jumpEpoch);
 if(!r){scope.waiting=true;return null;}
 const t=scope.record.time;if(!finite(t)||t<r.first-.075||t-r.updated>HISTORY_SECONDS)return null;
 const bound=r.bound,identity=bound&&bound.beacon===beacon&&bound.reservationId===payload.reservationId&&bound.owner===beacon.owner.owner&&bound.ownerLife===life(beacon.owner);
 if(payload.stage==='reserve'){
  if(bound&&!identity||bound&&bound.stage!=='reserve'||!bound&&!near(r.to,position(beacon),.15))return null;
 }else{
  if(!identity)return null;
  if(payload.stage==='cancel'){if(bound.stage==='land')return null;}
  else if(payload.stage==='land'){
   if(bound.stage==='cancel')return null;
   if(!r.ended||!r.land){scope.waiting=true;return null;}
   if(t<r.land.time-.002||t-r.land.time>WAIT||scope.record.sequence!==null&&r.land.sequence!==null&&scope.record.sequence<=r.land.sequence)return null;
  }else return null;
 }
 const proof={};proofs.set(proof,{scope,r,beacon,payload});return proof;
}
export function commitBeakonUseProof(proof){
 const p=proofs.get(proof);if(!p)return;proofs.delete(proof);
 const {r,beacon,payload}=p;
 if(!r.bound)r.bound={beacon,reservationId:payload.reservationId,owner:beacon.owner.owner,ownerLife:life(beacon.owner),stage:'reserve'};
 r.bound.stage=payload.stage;
}
export function clearBeakonUseAdmission(nm){states.delete(nm);}
