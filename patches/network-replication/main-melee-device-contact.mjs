import {observeOwnerTick} from './owner-tick-receipt.mjs';
import {flushNativeDeviceHits} from './device-hit-pending.mjs';

// The Splatana slash begins before its projectile. Its dedicated native frame
// records do not enter the generic PvP/Boss proof store and presentation-only
// s3SaberSwing metadata never grants device damage authority.
const receivers=new WeakMap(),senders=new WeakMap(),sourceFrames=new WeakMap();
const installed=Symbol('inkwave.native-main-melee-device');
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const now=()=>performance.now()/1000;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=2000);
const serial=n=>Number.isSafeInteger(n)&&n>0&&n<1e9;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

export function publishNativeMainMeleeFrame(api,actor,melee,ordinal){
 const nm=api.G.netm,record=melee.attack.catalog.r,frame=Math.round(melee.age);
 if(!nm||nm._disposed||nm.mute||nm.match!==api.G.match||actor.remote||actor.owner!==nm.myId||
  nm.byNid?.get(actor.nid)!==actor||Math.abs(frame-melee.age)>1e-8)return;
 let source=sourceFrames.get(melee);
 if(!source){
  let owner=senders.get(actor);
  if(!owner||owner.nm!==nm||owner.life!==life(actor)){owner={nm,life:life(actor),serial:0};senders.set(actor,owner);}
  if(!serial(owner.serial+1))return;
  source={nm,life:life(actor),owner:actor.owner,serial:++owner.serial,frames:new Set()};sourceFrames.set(melee,source);
 }
 if(source.nm!==nm||source.life!==life(actor)||source.owner!==actor.owner||source.frames.has(frame))return;source.frames.add(frame);
 nm._rec(['ev','weapon:melee',{actor:{n:actor.nid},weapon:record.id,life:life(actor),serial:source.serial,
  key:melee.key,ordinal:ordinal%2,frame,muzzle:melee.origin.toArray(),dir:[melee.sy,0,melee.cy]}]);
}

function state(nm){
 let s=receivers.get(nm);
 if(!s||s.session!==nm.s||s.match!==nm.match||s.epoch!==nm.cfg?.id){
  s={session:nm.s,match:nm.match,epoch:nm.cfg?.id,actors:new WeakMap()};receivers.set(nm,s);
 }
 return s;
}
function live(nm,a,r){
 return !!r&&!nm._disposed&&nm.s===r.session&&nm.match===r.match&&nm.cfg?.id===r.epoch&&
  nm.byNid?.get(a.nid)===a&&a.remote&&a.owner===r.owner&&a.net===r.net&&life(a)===r.life&&
  nm.peers?.get(r.owner)===r.peer&&nm.s?._members?.has(r.owner)&&nm._combatCrabletSystem===r.system&&
  a.weapon?.catalogRecord===r.record;
}
function recordFrame(nm,receipt,event){
 if(event?.[1]!=='ev'||event[2]!=='weapon:melee')return;
 const e=event[3],a=nm.byNid?.get(e?.actor?.n),source=a?.weapon?.catalogRecord;
 const frame=e?.frame,vertical=e?.key==='saber-vertical';
 if(!a?.remote||a.owner!==event._netPeer||!source||source.family!=='splatana'||e.weapon!==source.id||
  !serial(e.serial)||e.life!==life(a)||![0,1].includes(e.ordinal)||
  !['saber-horizontal','saber-vertical'].includes(e.key)||!vector(e.muzzle)||!vector(e.dir)||
  Math.abs(e.dir[1])>1e-9||Math.abs(Math.hypot(...e.dir)-1)>1e-9||
  !Number.isSafeInteger(frame)||frame<0||!Number.isSafeInteger(event._netSeq)||event._netSeq<1||
  !Number.isFinite(event[0])||event[0]>receipt.ts||receipt.ts-event[0]>1.4)return;
 const pose=receipt.poses.get(a.nid),snap=a.net?.buf?.at(-1),system=nm._combatCrabletSystem;
 const bullet=vertical?source.parameters.BulletSaberSlashVerticalParam:source.parameters.BulletSaberSlashHorizontalParam;
 const alive=bullet?.MoveParam?.AliveFrame;
 if(!pose||!snap||!(snap.f&1)||snap.life!==e.life||!system||!Number.isFinite(alive)||frame>=alive||
  distance(e.muzzle,pose)>5)return;
 const s=state(nm);let r=s.actors.get(a);
 if(!live(nm,a,r)){
  r={session:nm.s,match:nm.match,epoch:nm.cfg?.id,owner:a.owner,peer:nm.peers.get(a.owner),net:a.net,
   life:e.life,system,record:source,swings:new Map(),retiredSerial:0};s.actors.set(a,r);
 }
 const at=now();for(const [id,swing]of r.swings)if(at-swing.at>3.5){r.swings.delete(id);r.retiredSerial=Math.max(r.retiredSerial,id);}
 let swing=r.swings.get(e.serial);
 const born=event[0]-frame/60;
 if(!swing){
  if(e.serial<=r.retiredSerial)return;
  swing={at,born,key:e.key,ordinal:e.ordinal,origin:e.muzzle.slice(),direction:e.dir.slice(),frames:new Map(),seen:new Set()};
  r.swings.set(e.serial,swing);while(r.swings.size>64){const id=r.swings.keys().next().value;r.swings.delete(id);r.retiredSerial=Math.max(r.retiredSerial,id);}
 }
 if(swing.frames.has(frame)||swing.key!==e.key||swing.ordinal!==e.ordinal||Math.abs(swing.born-born)>.002||
  distance(swing.origin,e.muzzle)>1e-9||distance(swing.direction,e.dir)>1e-9)return;
 let contacts;try{contacts=system.nativeSaberDeviceContacts?.(a,e)||[];}catch{return;}
 // Capture real receiver geometry at this accepted native frame. A pending
 // claim cannot move a later object into this historical slash.
 swing.frames.set(frame,{time:event[0],contacts});
}

export function installNativeMainMeleeDeviceContact(api){
 const P=api.NetMatch?.prototype;if(!P||P[installed])return;
 api.Projectiles.prototype.nativeMainMeleeDeviceHit=admitNativeMainMeleeDeviceHit;
 Object.defineProperty(P,installed,{value:true});const tick=P._tick;
 P._tick=function(from,packet){
  const result=observeOwnerTick(this,from,packet,()=>tick.call(this,from,packet)),receipt=result.receipt;
  if(receipt&&receipt.ownerSession===this.s&&receipt.ownerMatch===this.match&&receipt.ownerMatchId===this.cfg?.id&&!this._disposed){
   for(const event of receipt.nativeEvents)recordFrame(this,receipt,event);
   flushNativeDeviceHits(this,from);
  }
  return result.result;
 };
}

export function admitNativeMainMeleeDeviceHit(nm,actor,target,damage,cause,receipt){
 const s=receivers.get(nm),r=s?.actors.get(actor);
 if(!receipt||!live(nm,actor,r)||!target||target.dead||target.owner?.remote||
  target.owner?.team===actor.team||!Number.isFinite(damage)||!(damage>0))return null;
 const time=receipt.time,at=now();
 for(const swing of r.swings.values()){
  if(at-swing.at>3.5||swing.seen.has(target))continue;
  for(const frame of swing.frames.values()){
   if(time<frame.time-.002||time>frame.time+1/60+.002)continue;
   const contact=frame.contacts.find(c=>c.target===target&&Math.abs(c.damage-damage)<=.011&&(!cause||cause===c.cause));
   if(!contact)continue;
   swing.seen.add(target);return {damage:contact.damage,cause:contact.cause};
  }
 }
 return null;
}
