import {flushNativeDeviceHits} from './device-hit-pending.mjs';
// These records descend only from a completed receiver birth. Neither a later
// sub phase nor an objectHit payload can enroll an object or supply its path.
const births=new WeakMap(),objects=new WeakMap();
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const now=()=>performance.now()/1000;
function live(r){
 const n=r?.nm,a=r?.actor;
 return !!r&&!n._disposed&&n.s===r.session&&n.match===r.match&&n.cfg?.id===r.epoch&&
  n._combatCrabletSystem===r.system&&n.byNid?.get(a.nid)===a&&a.remote&&a.owner===r.owner&&a.net===r.net&&
  life(a)>=r.life&&n.peers?.get(r.owner)===r.peer&&n.s?._members?.has(r.owner);
}
export function recordSubDeviceBirth(nm,proof,event,object,receipt){
 const actor=nm.byNid?.get(proof.actor),system=nm._combatCrabletSystem;
 if(!actor||!system||!object?.ghost||object.owner!==actor||receipt.life!==proof.fireLife||objects.has(object))return false;
 const native=receipt.sourceKind==='native-bomb';
 let snapshot;
 try{snapshot=native?null:system.captureSubDeviceProbe?.(object);}catch{return false;}
 if(!native&&!snapshot)return false;
 const r={nm,system,actor,owner:actor.owner,net:actor.net,life:life(actor),session:nm.s,match:nm.match,epoch:nm.cfg?.id,
  peer:nm.peers?.get(actor.owner),proof,object,native,snapshot,contacts:[],contactAt:-Infinity,born:receipt.eventTime,
  source:Object.freeze({weapon:Object.freeze({...actor.weapon})}),recordedAt:now(),ageOffset:native?0:Math.max(0,receipt.packetTime-receipt.eventTime)};
 if(!live(r))return false;
 births.set(proof,r);objects.set(object,r);return true;
}
export const hasNativeSubDeviceBirth=object=>{const r=objects.get(object);return !!r?.native&&live(r);};
export const nativeSubDeviceSource=(nm,proof)=>{const r=births.get(proof);return r?.nm===nm&&live(r)?r.source:null;};
// Only native collision/trigger owners call this. Capture the actual local
// target and damage at contact, before a delayed claim or target movement.
export function observeSubDeviceContact(object,target,damage,cause,contactKey,age=object?.age){
 const r=objects.get(object);
 if(!live(r)||!target||target.dead||target.owner?.remote||!(damage>0)||!Number.isFinite(damage)||
  !Number.isFinite(age)||age<0||typeof contactKey!=='string'||contactKey.length>100)return false;
 if(r.contacts.some(c=>c.target===target&&c.contactKey===contactKey))return false;
 r.contacts.push({target,damage,cause,contactKey,projectile:object,time:r.born+age+r.ageOffset});
 if(r.contacts.length>192)r.contacts.splice(0,r.contacts.length-192);
 r.contactAt=now();flushNativeDeviceHits(r.nm,r.owner);return true;
}
export function retainedSubDeviceProof(proof){
 const r=births.get(proof);if(!live(r))return false;
 if(now()-r.contactAt<=.95)return true;
 return r.native?r.system.bombs?.includes(r.object)===true:
  (r.object.subId==='inkMine'||now()-r.recordedAt<=10)&&!r.object.dead&&r.system._s3SubObjects?.includes(r.object)===true;
}
// Identity comes only from completed native creation. Wire serials and raw
// objectHit rows cannot claim another reserved persistent-proof slot.
export const retainedSubDeviceProofKey=proof=>retainedSubDeviceProof(proof)?births.get(proof).object:null;
export function nativeSubDeviceContact(nm,proof,target,claimTime,{consumedKeys,damage,cause}={}){
 const r=births.get(proof);
 if(!live(r)||r.nm!==nm||!target||target.dead||target.owner?.remote||!Number.isFinite(claimTime))return null;
 let contacts=r.contacts,generated=null,previous=r.snapshot;
 if(!r.native&&r.object.subId!=='inkMine'){
  const age=Math.min(10,Math.max(0,claimTime-r.born)+.15);
  try{generated=r.system.nativeSubDeviceProbeContacts?.(previous,target,age)||[];contacts=r.contacts.concat(generated);}catch{return null;}
 }
 for(const c of contacts){
  const time=c.time??r.born+c.age;
  if(c.target!==target||!Number.isFinite(time)||time>claimTime+.15||claimTime-time>.95||
   consumedKeys?.has(c.contactKey)||Number.isFinite(damage)&&Math.abs(damage-c.damage)>.011||cause&&c.cause&&cause!==c.cause)continue;
  if(!generated?.checkpoint)return c;
  let committed=false;
  return {...c,commit(){
    if(committed||!live(r)||r.snapshot!==previous)return false;
    committed=true;r.snapshot=generated.checkpoint;
    // An accepted contact seals the complete native prefix, including every
    // target present in each blast. Destroying its first blocker cannot make
    // the same projectile reach a new target on a later probe.
    r.contacts=contacts.filter(row=>claimTime-(row.time??r.born+row.age)<=.95).slice(-2048);
    return true;
  }};
 }
 return null;
}
