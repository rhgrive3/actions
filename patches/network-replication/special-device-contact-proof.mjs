import {nativeStormDeviceContact} from './storm-device-contact-proof.mjs';
import {nativeSpecialUseReceipt} from '../splatoon3/runtime/support-replay-admission.mjs';
import {nativeCatalogueSpecialActivation} from '../splatoon3/runtime/special-replay-admission.mjs';
import {catalogueActionReceipt} from './catalogue-action-receipt.mjs';
import {withNativeDeviceProbe} from './native-device-probe.mjs';
import {flushNativeDeviceHits} from './device-hit-pending.mjs';
// A native gauge/use receipt and native attack birth remain separate. A use
// alone is never a projectile, a blast location, or an object-damage permit.
const births=new WeakMap(),sources=new WeakMap(),actions=new WeakMap(),spent=new WeakMap(),projectileSlots=new WeakMap();
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
function live(nm,r,actor,currentLife=true){return r&&r.nm===nm&&r.actor===actor&&r.net===actor.net&&r.owner===actor.owner&&(!currentLife||r.life===life(actor))&&
 r.session===nm.s&&r.match===nm.match&&r.peer===nm.peers?.get(actor.owner)&&nm.byNid?.get(actor.nid)===actor&&nm.s?._members?.has(actor.owner)&&!nm._disposed;}
function context(nm,actor){return {nm,actor,net:actor.net,owner:actor.owner,life:life(actor),peer:nm.peers?.get(actor.owner),session:nm.s,match:nm.match};}
export function recordSpecialDeviceBirth(nm,proof,event){
 const actor=nm.byNid?.get(proof.actor),system=nm._combatCrabletSystem;
 if(!actor||!system)return;
 const canonicalUse=event?.[1]==='ev'&&event[2]==='special:use';
 let use=nativeSpecialUseReceipt(nm,actor,proof.ts,proof.cause);
 if(canonicalUse&&use?.seq!==event?._netSeq)use=null;
 const source={weapon:use?.sourceWeapon||Object.freeze({...actor.weapon}),s3:{abilityPoints:{specialPower:use?.specialPowerAP??actor.s3?.abilityPoints?.specialPower??0}},team:actor.team};
 const record={...context(nm,actor),system,source,use,tick:event?._netTick,time:proof.ts,
  canonicalUse,sequence:event?._netSeq};sources.set(proof,record);
 if(event?.[1]!=='p')return;
 let wire;try{wire=JSON.parse(JSON.stringify(event));if(!system.makeCrabletCombatProbe?.(actor,wire))return;}catch{return;}
 record.wire=wire;births.set(proof,record);
}
function useFor(nm,proof,record,actor){
 // The support wrapper publishes a new resource receipt after this birth is
 // recorded. A second native use must not cache the previous activation.
 if(record.canonicalUse&&record.use?.seq===record.sequence)return record.use;
 // An accepted projectile checkpoint has already consumed a source slot.
 // Its use can never be reassigned to buy that birth another contact budget.
 if(record.terminal&&record.use)return record.use;
 // The private birth was admitted while its source life was current. The
 // outer support tick may publish its paid-use receipt after that birth, so
 // resolve the same stored life even if its first valid contact is after respawn.
 const found=nativeSpecialUseReceipt(nm,actor,proof.ts,proof.cause,record.life);
 if(record.canonicalUse&&found?.seq!==record.sequence)return null;
 const use=found||record.use;
 if(use&&use!==record.use){record.use=use;record.source={weapon:use.sourceWeapon,s3:{abilityPoints:{specialPower:use.specialPowerAP}},team:record.source.team};}
 return use||null;
}
export function nativeSpecialDeviceSource(nm,proof){
 const r=sources.get(proof),actor=nm.byNid?.get(proof.actor);
 return live(nm,r,actor,false)&&useFor(nm,proof,r,actor)?r.source:null;
}
export function retainedSpecialDeviceProof(nm,proof){
 const r=sources.get(proof),actor=nm.byNid?.get(proof.actor);
 return live(nm,r,actor,false)&&!!useFor(nm,proof,r,actor);
}
export function retainedSpecialDeviceProofKey(nm,proof){
 const r=sources.get(proof),actor=nm.byNid?.get(proof.actor);
 if(!r?.canonicalUse||!live(nm,r,actor,false))return null;
 const use=useFor(nm,proof,r,actor);
 // Only the original resource-backed use event is canonical. A later raw
 // use/slam with a new sequence cannot retain another copy of the same use.
 // Recheck the bounded private admission list instead of preserving an old
 // cached capability after that source receipt has been retired.
 return use&&r.sequence===use.seq&&nativeSpecialUseReceipt(nm,actor,r.time,proof.cause,r.life)===use?use:null;
}
export function recordSpecialDeviceAction(nm,actor,payload){
 if(payload?.action==='objectHit')return false;
 const receipt=catalogueActionReceipt(nm,payload,actor),use=nativeCatalogueSpecialActivation(nm,actor,payload);
 if(!receipt||!use||receipt.time+ .002<use.time)return false;
 if(nm._combatCrabletSystem?.captureNativeSpecialWorldDeviceBirth?.(actor,payload,receipt,use)===false)return false;
 let rows=actions.get(actor);if(!rows){rows=[];actions.set(actor,rows);}
 const repeating=payload.action==='shot'||payload.action==='cannon'||payload.action==='roll';
 const key=[use.seq,payload.id,payload.activation,payload.action,payload.object||0,payload.index||0,repeating?receipt.tick:payload.tick||0].join(':');
 if(rows.some(r=>live(nm,r,actor)&&r.key===key))return false;
 const data={...payload};delete data.actor;
 rows.push({...context(nm,actor),use,receipt,payload:JSON.parse(JSON.stringify(data)),key});
 // AP 57 Wail alone emits 288 laser rows plus its three lock receipts.
 // Keep a complete native activation while retaining a fixed peer bound.
 while(rows.length>512)rows.shift();
 flushNativeDeviceHits(nm,actor.owner);return true;
}
function paidContact(use,target,result){
 if(!result)return null;
 let targets=spent.get(use);if(!targets){targets=new WeakMap();spent.set(use,targets);}
 let keys=targets.get(target);if(!keys){keys=new Set();targets.set(target,keys);}
 if(keys.has(result.contactKey))return null;
 return {...result,commit:()=>{if(keys.has(result.contactKey)||result.commit&&result.commit()===false)return false;keys.add(result.contactKey);return true;}};
}
function projectileSlot(use,r,p){
 const id=p.wid,slot=id==='trizooka'?`trizooka:${p.s3ActionIndex}:${p.s3VolleyIndex}`:
  id==='tentaMissiles'?`tentaMissiles:${p.s3TentaWire[1]}`:
  id==='inkjet'||id==='crabTank'?`${id}:${p.type}:${r.tick}`:id;
 const gap=id==='inkjet'?60:id==='crabTank'?(p.type==='shot'?4:75):0;
 let rows=projectileSlots.get(use);if(!rows){rows=new Map();projectileSlots.set(use,rows);}
 const valid=()=>{
  const old=rows.get(slot);if(old&&old!==r)return false;
  if(gap)for(const item of rows.values())if(item!==r&&item.mode===p.type&&item.id===id&&Math.abs(item.tick-r.tick)<gap)return false;
  return true;
 };
 if(!Number.isSafeInteger(r.tick)||!valid())return null;
 return {key:`p:${use.seq}:${slot}`,commit(){if(!valid())return false;r.mode=p.type;r.id=id;rows.set(slot,r);return true;}};
}
function projectileContact(nm,proof,target,claimTime,options){
 const r=births.get(proof),actor=nm.byNid?.get(proof.actor);
 if(!live(nm,r,actor,false)||r.system!==nm._combatCrabletSystem)return null;
 const use=useFor(nm,proof,r,actor);if(!use)return null;
 let p;try{const source=Object.assign(Object.create(actor),r.source);p=r.system.makeCrabletCombatProbe(source,r.wire);if(p)p.owner=actor;}catch{return null;}if(!p)return null;
 const slot=projectileSlot(use,r,p);if(!slot)return null;
 const contactKey=slot.key;
 if(options.consumedKeys?.has(contactKey))return null;
 if(r.system.validateNativeSpecialProjectileContext?.(p,use,options.actions||[])===false)return null;
 const burst=(round,device)=>r.system.nativeSpecialProjectileBurstContact?.(round,device,round.pos,{...options,
  // The source update advances a freshly published round on its birth tick.
  // Its first age increment and birth timestamp therefore share that tick.
  elapsed:Math.max(0,claimTime-proof.ts-round.age+1/60),contactKey});
 function terminalContact(terminal){
  if(terminal.kind==='direct')return terminal.target===target?terminal.result:null;
  if(terminal.projectile.wid==='booyahBomb')return burst(terminal.projectile,target);
  return terminal.contacts.get(target)||null;
 }
 let terminal=r.terminal,result=terminal?terminalContact(terminal):null;
 if(!terminal){
  // Only a fully accepted native contact commits a terminal checkpoint.
  // Invalid claims cannot advance this private projectile; a destroyed first
  // device can never disappear from a later re-simulation of the same birth.
  const ageLimit=Math.min(p.life,Math.max(0,claimTime-proof.ts)+.15);
  result=withNativeDeviceProbe(p,()=>{
   try{
    for(let i=0;i<360&&p.age<ageLimit+1e-9;i++){
     const radii=r.system.stepCrabletCombatProbe(p);if(!radii)return null;
     const native=r.system.nativeFidelityDeviceSweep(p),world=native.world,defense=world?.kitDefense;
     const length=p.prev.distanceTo(p.pos),body=Math.min(native.body,native.boss?.dist??Infinity),terrain=world?.hit&&!defense?world.dist:Infinity;
     if(defense&&defense.distance<Math.min(body,terrain)-1e-9){
      if((defense.object||defense.damageTarget)!==target)return null;
      p.pos.copy(defense.point);
      const damage=r.system.deviceCombatProbeDamage(p,target,length>1e-12?defense.distance/length:0),cause=r.system.nativeSpecialProjectileCause(p);
      const hit=damage>0?{damage,projectile:p,cause,contactKey}:null;
      if(hit)terminal={kind:'direct',target,result:hit};return hit;
     }
     const ended=world?.hit||body<=length||radii.done||p.age+1e-9>=p.life;
     if(ended){
      if(world?.hit&&Number.isFinite(world.dist))p.pos.copy(world.point);
      else if(body<=length&&length>1e-12)p.pos.copy(p.prev).lerp(p.pos,body/length);
      const hit=burst(p,target);if(!hit)return null;
      const contacts=new Map();
      // An instantaneous native blast visits the roster once. Seal every
      // native eligible target at that contact, before any target is damaged.
      if(p.wid!=='booyahBomb')for(const device of [...r.system._s3SubObjects||[],...r.system._s3AllSpecialObjects||[],...(r.system.nativeSprinklerDeviceTargets?.()||[])]){
       const contact=burst(p,device);if(contact)contacts.set(device,{...contact,contactKey:contact.contactKey||contactKey});
      }
      terminal={kind:'burst',projectile:p,contacts};
      return {...hit,contactKey:hit.contactKey||contactKey};
     }
    }
   }catch{return null;}
   return null;
  });
 }
 if(!result||!terminal)return null;
 const checkpoint=terminal;
 return paidContact(use,target,{...result,contactKey:result.contactKey||contactKey,commit(){
  if(r.terminal&&r.terminal!==checkpoint||!slot.commit())return false;
  r.terminal=checkpoint;return true;
 }});
}
export function nativeSpecialDeviceContact(nm,proof,target,claimTime,options={}){
 const actor=nm.byNid?.get(proof.actor),source=sources.get(proof);if(!actor||!live(nm,source,actor,false))return null;
 const use=useFor(nm,proof,source,actor);if(!use)return null;
 const spentKeys=spent.get(use)?.get(target),localKeys=options.consumedKeys;
 if(spentKeys?.size)options={...options,consumedKeys:localKeys?.size?new Set([...localKeys,...spentKeys]):spentKeys};
 const rows=actions.get(actor)||[],system=nm._combatCrabletSystem;
 options={...options,actions:rows.filter(r=>live(nm,r,actor,false)&&r.use===use&&r.receipt.time<=claimTime+.002)};
 if(proof.src==='p')return projectileContact(nm,proof,target,claimTime,options);
 if(use.specialId==='storm'){const contact=nativeStormDeviceContact(nm,use,target,options);return contact?paidContact(use,target,contact):null;}
 if(Math.abs(use.time-proof.ts)>.002)return null;
 for(let i=rows.length-1;i>=0;i--){const r=rows[i];
  if(!live(nm,r,actor,false)||r.use!==use||r.receipt.time>claimTime+.002||options.consumedKeys?.has(r.key))continue;
  const result=system?.nativeSpecialActionDeviceContact?.(actor,r.payload,target,r.receipt,use,claimTime,options);
  if(result){const paid=paidContact(use,target,{...result,contactKey:result.contactKey||r.key});if(paid)return paid;}
 }
 // The pose is the packet's final sample: a landing row two source frames
 // after an earlier contact can explain that sample's grounded flag. Keep
 // these same-packet future rows separate from attack/action authority.
 if(options.receipt)options={...options,futureActions:rows.filter(r=>live(nm,r,actor,false)&&r.use===use&&r.receipt.time>claimTime+.002&&r.receipt.packetTime===options.receipt.packetTime)};
 const passive=system?.nativeSpecialPassiveDeviceContact?.(actor,target,use,claimTime,options);
 return passive?paidContact(use,target,passive):null;
}
