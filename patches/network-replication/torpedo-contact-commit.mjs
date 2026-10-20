// Receiver-private GP0 Torpedo capability. Only accepted native birth commit may enroll.
// Unsupported gear/motion retains legacy admission; never promote raw packet fields.
import {beginReceiverTorpedoObservation} from '../splatoon3/runtime/torpedo-receiver-trajectory.mjs';
import {eligibleLimitedTorpedoBirth} from './torpedo-birth-envelope.mjs';
import {gearCurve} from '../splatoon3/runtime/gear.mjs';
const parents=new WeakMap(),children=new WeakMap(),registries=new WeakMap(),worlds=new WeakMap();
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
function retire(r){r.retired=true;r.contacts.length=0;registries.get(r.nm)?.delete(r);worlds.get(r.world)?.delete(r);}
function live(r){if(!r||r.retired)return false;const {nm,G,world,owner}=r;
 const ok=!nm._disposed&&G.projectiles===world&&G.level===r.level&&G.physics===r.physics&&G.match===r.match&&nm.match===r.match&&nm.cfg.id===r.epoch&&
 nm.peers.get(r.from)===r.peer&&nm.s._members.has(r.from)&&nm.byNid.get(owner.nid)===owner&&owner.owner===r.from&&owner.net===r.ownerNet&&owner.remote&&life(owner)===r.life&&owner.alive!==false&&(!r.gearKey||owner.s3?._wireGearKey===r.gearKey&&owner.s3?._wireGearApplied===owner.s3?.loadout);
 if(!ok)retire(r);return ok;
}
export function registerLimitedTorpedo(nm,parent,receipt,event,G,notify){
 if(!parent||parents.has(parent)||!parent.ghost||parent.subId!=='torpedo'||!G.projectiles?._s3SubObjects?.includes(parent)||parent.owner!==nm.byNid.get(receipt.nid))return false;
 const spec=parent.spec,ap=parent.owner.s3?.abilityPoints?.subPower ?? 0;
 const gear=receipt.torpedoGear,speed=gearCurve(ap,spec.throwSpeedTiers.low,spec.throwSpeedTiers.mid,spec.throwSpeedTiers.high);
 const validGear=Number.isInteger(ap)&&ap>=0&&ap<=57&&gear?.ap===ap&&gear.key===parent.owner.s3?._wireGearKey&&parent.owner.s3?._wireGearApplied===parent.owner.s3?.loadout;
 if(!(ap===0&&event[5]?.subPowerAP===0&&(parent.owner.s3?.modifiers?.subPower??1)===1)&&!validGear)return false;
 if(event[5]?.subPowerAP!==ap||parent.owner.s3?.modifiers?.subPower!==speed/spec.throwSpeedTiers.low||!eligibleLimitedTorpedoBirth({receipt,snapshot:receipt.motion,event:event[5],spec,speed:gearCurve(ap,spec.throwSpeedTiers.low,spec.throwSpeedTiers.mid,spec.throwSpeedTiers.high),normalMoveTarget:receipt.normalMoveTarget}))return false;
 const world=G.projectiles;
 let set=registries.get(nm);if(!set){set=new Set();registries.set(nm,set);}
 for(const old of [...set]){if(!live(old))continue;old.contacts=old.contacts.filter(c=>performance.now()/1000-c.at<=.95);if(old.parent.dead&&old.dropCount===0&&!old.contacts.length)retire(old);}
 if(set.size>=160)return false;
 if(!worlds.has(world)){const clear=world.clear,worldRecords=new Set();world.clear=function(...args){for(const r of worldRecords)retire(r);worldRecords.clear();return clear.apply(this,args);};worlds.set(world,worldRecords);}
 const r={gearKey:validGear?receipt.torpedoGear.key:null,nm,G,world,parent,owner:parent.owner,ownerNet:parent.owner.net,from:receipt.from,life:receipt.life,peer:nm.peers.get(receipt.from),match:nm.match,epoch:nm.cfg.id,level:G.level,physics:G.physics,notify,contacts:[],dropCount:0,retired:false,birthAt:performance.now()/1000};
 if(!live(r)||!beginReceiverTorpedoObservation({G},world,parent))return false;parents.set(parent,r);set.add(r);worlds.get(world).add(r);return true;
}
export function registerLimitedDrop(world,drop){const r=parents.get(drop.source);if(drop.kind!=='chase'||!drop.ghost||!live(r)||r.world!==world||!world._s3TorpedoSplashes.includes(drop))return false;children.set(drop,r);r.dropCount++;return true;}
export function retireLimitedDrop(drop){const r=children.get(drop);children.delete(drop);if(r){r.dropCount=Math.max(0,r.dropCount-1);if(r.parent.dead&&!r.dropCount&&!r.contacts.length)retire(r);}}
export function observeLimitedContact(world,drop,victim,damage){const r=children.get(drop);if(!live(r)||r.world!==world||!world._s3TorpedoSplashes.includes(drop)||drop.source!==r.parent||drop.owner!==r.owner||damage!==r.parent.spec.splashDamage||victim.remote||!victim.alive||victim.owner!==r.nm.myId||r.nm.byNid.get(victim.nid)!==victim)return false;
 if(r.contacts.some(c=>c.drop===drop&&c.victim===victim))return false;
 if(r.contacts.length>=48)return false;r.contacts.push({drop,victim,life:life(victim),damage,at:performance.now()/1000});r.notify.call(r.nm,r.from);return true;}
export function consumeLimitedContact(nm,from,d,t){for(const r of registries.get(nm)||[]){if(!live(r)||r.from!==from||r.owner.nid!==d.a||d.m!==r.epoch||d.w!=='torpedo-splash'||d.d!==r.parent.spec.splashDamage)continue;
 r.contacts=r.contacts.filter(c=>t-c.at>=0&&t-c.at<=.95&&c.victim.alive&&life(c.victim)===c.life&&nm.byNid.get(c.victim.nid)===c.victim&&c.victim.owner===nm.myId&&!c.victim.remote);
 const i=r.contacts.findIndex(c=>c.victim.nid===d.v&&c.life===d.l&&c.damage===d.d);if(i<0)continue;r.contacts.splice(i,1);if(r.parent.dead&&!r.dropCount&&!r.contacts.length)retire(r);return true;}return false;}
