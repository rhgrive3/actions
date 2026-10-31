import {catalogueActionReceipt} from './catalogue-action-receipt.mjs';
// Only a payload descended from a completed native owner tick can wait for a
// delayed birth/contact. The retry retains the original identity and deadline;
// no replay event, claimed hit coordinate or fresh sequence extends its life.
const states=new WeakMap(),AGE=.95,MAX=48;
const claimTargets=new WeakMap();
const now=()=>performance.now()/1000;
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
function live(nm,s){return s&&!nm._disposed&&s.session===nm.s&&s.match===nm.match&&s.id===nm.cfg?.id;}
function targetShape(target){
 const owner=target.owner,spec=target.spec;
 return [target,owner,owner?.net,life(owner),target.subId,target.id,target.kind,target.phase,
  target.seq,target.serial,target.sourceLife,target.activation,target.index,spec,
  target.pos?.x,target.pos?.y,target.pos?.z,target.yaw,target.radius,target.r,
  spec?.wallWidth,spec?.wallHeight,spec?.radius,
  ...['normal','tangent','direction','scale'].flatMap(key=>[target[key]?.x,target[key]?.y,target[key]?.z])];
}
// A claim may precede its genuine source action in the owner FIFO. Waiting
// cannot relocate that old claim to a target which moved into its attack.
// Keep receiver-owned identity/shape, never a sender-provided hit coordinate.
export function bindNativeDeviceHitTarget(nm,actor,target,payload){
 if(!payload||!catalogueActionReceipt(nm,payload,actor))return false;
 const shape=targetShape(target),old=claimTargets.get(payload);
 if(old)return old.nm===nm&&old.session===nm.s&&old.match===nm.match&&old.id===nm.cfg?.id&&
  old.actor===actor&&old.net===actor.net&&old.peer===nm.peers?.get(actor.owner)&&
  old.life===life(actor)&&shape.length===old.shape.length&&shape.every((value,i)=>Object.is(value,old.shape[i]));
 claimTargets.set(payload,{nm,session:nm.s,match:nm.match,id:nm.cfg?.id,actor,net:actor.net,
  peer:nm.peers?.get(actor.owner),life:life(actor),shape});return true;
}
export function deferNativeDeviceHit(nm,actor,payload,replay){
 const receipt=catalogueActionReceipt(nm,payload,actor);if(!receipt||typeof replay!=='function')return false;
 let s=states.get(nm);if(!live(nm,s)){s={session:nm.s,match:nm.match,id:nm.cfg?.id,peers:new Map(),flushing:new Set()};states.set(nm,s);}
 const from=actor.owner;if(s.flushing.has(from))return false;
 let rows=s.peers.get(from);if(!rows)s.peers.set(from,rows=[]);
 if(rows.some(row=>row.payload===payload))return false;
 rows.push({actor,net:actor.net,peer:nm.peers.get(from),life:life(actor),payload,replay,at:now()});
 if(rows.length>MAX)rows.splice(0,rows.length-MAX);return true;
}
export function flushNativeDeviceHits(nm,from){
 const s=states.get(nm);if(!live(nm,s)){states.delete(nm);return;}
 if(s.flushing.has(from))return;
 const rows=s.peers.get(from);if(!rows?.length)return;
 s.peers.delete(from);s.flushing.add(from);const keep=[],t=now();
 try{for(const row of rows){
  const a=row.actor;
  if(t-row.at<0||t-row.at>AGE||nm.byNid?.get(a.nid)!==a||!a.remote||a.owner!==from||a.net!==row.net||
    life(a)!==row.life||nm.peers?.get(from)!==row.peer||!nm.s?._members?.has(from))continue;
  if(row.replay()!==true)keep.push(row);
 }}finally{
  s.flushing.delete(from);
  if(live(nm,s)&&states.get(nm)===s){const added=s.peers.get(from)||[];if(keep.length||added.length)s.peers.set(from,keep.concat(added).slice(-MAX));}
 }
}
export function clearNativeDeviceHits(nm,from){const s=states.get(nm);if(from===undefined)states.delete(nm);else s?.peers.delete(from);}
