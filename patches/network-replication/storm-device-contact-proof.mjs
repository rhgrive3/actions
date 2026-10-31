import {nativeSpecialUseReceipt} from '../splatoon3/runtime/support-replay-admission.mjs';
import {fidelityThrowVelocity,SUB_SPECIAL_FIDELITY} from '../splatoon3/runtime/sub-special-fidelity.mjs';
import {flushNativeDeviceHits} from './device-hit-pending.mjs';
// A completed owner tick, actual ghostBomb creation and natural native cloud
// creation are three separate capabilities. A JSON cloud/impact is none of them.
const events=new WeakMap(),bombs=new WeakMap(),clouds=new WeakMap(),uses=new WeakMap(),actors=new WeakMap();
const finite=Number.isFinite,safe=Number.isSafeInteger,DT=1/60;
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const signature=e=>JSON.stringify([e,e._netPeer,e._netSeq,e._netTick]);
function live(r){const n=r?.nm,a=r?.actor;return !!r&&!n._disposed&&n.s===r.session&&n.match===r.match&&n.cfg?.id===r.epoch&&
 n._combatCrabletSystem===r.system&&n.byNid?.get(a.nid)===a&&a.remote&&a.owner===r.owner&&a.net===r.net&&
 life(a)>=r.life&&n.peers?.get(r.owner)===r.peer&&n.s?._members?.has(r.owner);}
export function stageNativeStormDeviceBirth(nm,from,event,packetTime,ownerTick){
 if(event?.[1]!=='b'||event[3]!=='storm'||!safe(ownerTick)||!finite(packetTime))return false;
 const actor=nm.byNid?.get(event[2]),peer=nm.peers?.get(from),snap=actor?.net?.buf?.at(-1);
 if(!actor?.remote||actor.owner!==from||actor.weapon?.special!=='storm'||!peer||!nm.s?._members?.has(from)||
  snap?.t!==packetTime||!(snap.f&1)||snap.life!==life(actor)||![snap.x,snap.y,snap.z,snap.vx,snap.vy,snap.vz,snap.aimYaw,snap.aimPitch].every(finite)||
  event._netPeer!==from||!safe(event._netSeq)||event._netSeq<1||event._netSeq!==event.at(-1)||
  !safe(event._netTick)||event._netTick<0||event._netTick!==event.at(-2)||event._netTick>ownerTick||
  !finite(event[0])||event[0]>packetTime||packetTime-event[0]>1.4||!event.slice(4,10).every(finite))return false;
 events.set(event,{nm,actor,owner:from,net:actor.net,life:life(actor),peer,session:nm.s,match:nm.match,epoch:nm.cfg?.id,
  system:nm._combatCrabletSystem,snapshot:{...snap},packetTime,time:event[0],tick:event._netTick,seq:event._netSeq,signature:signature(event)});
 return true;
}
function nativeLaunch(r,event,use,bomb){
 const V=bomb.pos.constructor,s=r.snapshot,ap=use.stormPower;
 if(!ap||!finite(ap.duration)||!finite(ap.throwScale)||!finite(event[10]?.stormDuration)||Math.abs(event[10].stormDuration-ap.duration)>.001)return false;
 const pos=new V(event[4],event[5],event[6]),anchor=new V(s.x,s.y+1.45,s.z),lag=Math.max(0,r.packetTime-r.time);
 if(pos.distanceTo(anchor)>.04+Math.hypot(s.vx,s.vy,s.vz)*lag)return false;
 const a=Object.create(r.actor);a.vel=new V(s.vx,s.vy,s.vz);a.aimYaw=s.aimYaw;a.aimPitch=s.aimPitch;
 const wire=new V(event[7],event[8],event[9]),speed=SUB_SPECIAL_FIDELITY.storm.spawnSpeedZ*ap.throwScale;
 const native=()=>fidelityThrowVelocity(a,'storm',new V(),speed),tolerance=.05;
 if(native().distanceTo(wire)<=tolerance)return true;
 // The packet's final aim may follow the throw. Recover only a legal native
 // heading; speed, inheritance, vertical clamp and AP remain source-owned.
 const p=SUB_SPECIAL_FIDELITY.storm,x=wire.x-s.vx*p.inheritX,z=wire.z-s.vz*p.inheritX,h=Math.hypot(x,z);
 const addY=Math.min(Math.max(0,s.vy)*p.inheritYPlus,p.inheritYMax),phi=Math.atan2(p.spawnSpeedY,speed),norm=Math.hypot(speed,p.spawnSpeedY);
 a.aimYaw=Math.atan2(x,z);const pitches=[Math.atan2(wire.y-addY,h)-phi];
 if(h<=norm+tolerance){const angle=Math.acos(Math.max(-1,Math.min(1,h/norm)));pitches.push(angle-phi,-angle-phi);}
 for(const pitch of pitches)if(pitch>=-1.052&&pitch<=1.152){a.aimPitch=Math.max(-1.05,Math.min(1.15,pitch));if(native().distanceTo(wire)<=tolerance)return true;}
 return false;
}
export function authorizeNativeStormDeviceBirth(nm,from,event){
 const r=events.get(event);
 if(!live(r)||r.nm!==nm||r.owner!==from||life(r.actor)!==r.life||r.actor.weapon?.special!=='storm'||r.signature!==signature(event))return false;
 const use=nativeSpecialUseReceipt(nm,r.actor,r.time,'storm',r.life);
 if(!use||uses.has(use)||r.seq<=use.seq||r.tick<use.tick||r.time+.002<use.time)return false;
 if(r.authorizedUse!==use){if(!nativeLaunch(r,event,use,{pos:r.actor.pos}))return false;r.authorizedUse=use;}
 return true;
}
export function commitNativeStormDeviceBirth(nm,from,event,bomb){
 const r=events.get(event),authorized=authorizeNativeStormDeviceBirth(nm,from,event);events.delete(event);
 if(!authorized||!bomb?.ghost||bomb.kind!=='storm'||bomb.owner!==r.actor||bomb._netBorn!==r.time||
  bomb._netBornTick!==r.tick||bomb._netPeer!==r.peer||bombs.has(bomb))return false;
 const use=r.authorizedUse;r.use=use;r.bomb=bomb;r.contacts=new WeakMap();r.source=Object.freeze({weapon:use.sourceWeapon});
 bombs.set(bomb,r);uses.set(use,r);
 let rows=actors.get(r.actor)||[];rows=rows.filter(v=>live(v)&&(v.system.bombs.includes(v.bomb)||v.cloud&&v.system.clouds.includes(v.cloud)||performance.now()/1000-(v.contactAt??-Infinity)<=.95));
 rows.push(r);actors.set(r.actor,rows.slice(-8));return true;
}
export function attachNativeStormDeviceCloud(system,bomb,cloud){
 const r=bombs.get(bomb);
 if(!live(r)||system!==r.system||!cloud||cloud.owner!==r.actor||cloud._netPeer!==r.peer||
  cloud._netBornTick!==r.tick+bomb._netSteps-1||cloud.dur!==r.use.stormPower.duration||r.cloud)return false;
 r.cloud=cloud;clouds.set(cloud,r);return true;
}
export function hasNativeStormDeviceCloud(cloud){const r=clouds.get(cloud);return live(r)&&r.cloud===cloud&&cloud.ghost===true;}
export function observeNativeStormDeviceContacts(system,cloud,radius,damageAtDistance){
 const r=clouds.get(cloud);if(!hasNativeStormDeviceCloud(cloud)||r.system!==system||typeof damageAtDistance!=='function')return false;
 const tick=cloud._netBornTick+cloud._netSteps-1;if(!safe(tick)||tick<r.tick)return false;
 const actor=r.actor,center=cloud.group.position,options={pierceLOS:true};let added=false;
 for(const target of [...system._s3SubObjects||[],...system._s3AllSpecialObjects||[],...(system.nativeSprinklerDeviceTargets?.()||[])]){
  const damage=system.nativeSubDeviceAreaContact?.(actor,target,center,radius,damageAtDistance,options)??
    system.nativeSpecialDeviceAreaContact?.(actor,target,center,radius,damageAtDistance,options);
  if(!(damage>0)||!finite(damage))continue;
  let contacts=r.contacts.get(target);if(!contacts){contacts=new Map();r.contacts.set(target,contacts);}
  if(contacts.has(tick))continue;
  contacts.set(tick,{damage,projectile:actor,cause:'InkStorm',contactKey:`storm:${r.use.seq}:${tick}`,used:false});
  r.contactAt=performance.now()/1000;
  for(const frame of contacts.keys())if(frame<tick-96)contacts.delete(frame);
  added=true;
 }
 // Publish the full native frame's contacts before any pending HP callback.
 if(added)flushNativeDeviceHits(r.nm,r.owner);
 return added;
}
function contactFor(r,nm,target,options){
 const receipt=options.receipt,tick=receipt?.tick;
 if(!live(r)||r.nm!==nm||receipt?.actor!==r.actor||receipt.nm!==nm||!safe(tick)||!r.cloud||!target||target.dead||target.owner?.remote||
  performance.now()/1000-(r.contactAt??-Infinity)>.95)return null;
 const contact=r.contacts.get(target)?.get(tick);
 if(!contact||contact.used||options.consumedKeys?.has(contact.contactKey)||!finite(options.damage)||
  Math.abs(options.damage-contact.damage)>.011||options.cause&&options.cause!=='InkStorm')return null;
 return {...contact,commit(){if(contact.used||!live(r))return false;contact.used=true;return true;}};
}
export function nativeStormDeviceContact(nm,use,target,options={}){
 const r=uses.get(use);return r?.use===use?contactFor(r,nm,target,options):null;
}
// Device-only entry for a legitimately held canister whose original generic
// use proof has expired. Every returned value still comes from an admitted
// native birth and actual receiver cloud frame, with one shared atomic spend.
export function nativeStormDeviceContactForActor(nm,actor,target,options={}){
 if(options.receipt?.actor!==actor)return null;
 for(const r of actors.get(actor)||[]){const contact=contactFor(r,nm,target,options);if(contact)return contact;}
 return null;
}
