// One receiver-owned native flight per admitted main birth. Contact is
// resolved against the actual local device through the installed defense and
// terrain owners. A claimed hit point never enters this computation.
const births=new WeakMap();
import {withNativeDeviceProbe} from './native-device-probe.mjs';
const DIRECT=new Set(['shooter','dualies','splatling','charger']);
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
export const directDeviceFamily=a=>DIRECT.has(a?.weapon?.catalogRecord?.family||a?.weapon?.behaviorKind||a?.weapon?.kind);
export function recordDeviceBirth(nm,proof,event){
  const actor=nm.byNid?.get(proof.actor),system=nm._combatCrabletSystem;
  if(!actor||!system)return;
  const legacy=event?.[1]==='ev'&&event[2]==='weapon:fire'&&actor.weapon?.kind==='charger'&&!actor.weapon.catalogRecord;
  if(!legacy&&event?.[1]!=='p')return;
  let wire;try{wire=JSON.parse(JSON.stringify(event));if(!(legacy?system.makeDeviceChargerProbe?.(proof,actor):system.makeCrabletCombatProbe?.(actor,wire)))return;}catch{return;}
  births.set(proof,{system,actor,net:actor.net,life:proof.fireLife,session:nm.s,match:nm.match,epoch:nm.cfg?.id,
    peer:nm.peers?.get(actor.owner),owner:actor.owner,wire,legacy,yaw:actor.net?.buf?.at(-1)?.yaw});
}
export function nativeDeviceContact(nm,proof,target,claimTime){
  const r=births.get(proof),actor=nm.byNid?.get(proof.actor);
  if(!r||r.actor!==actor||actor.net!==r.net||r.life!==life(actor)||r.system!==nm._combatCrabletSystem||
    r.session!==nm.s||r.match!==nm.match||r.epoch!==nm.cfg?.id||r.peer!==nm.peers?.get(r.owner)||
    actor.owner!==r.owner||!target||target.dead||target.owner?.remote)return null;
  // A native round terminates at its first device or its terminal burst. Once
  // one valid claim commits that prefix, a removed blocker cannot make a new
  // replay of the same birth travel farther. Area contacts retain all targets
  // that existed at that one burst, not only the first claimed recipient.
  if(r.contacts)return r.contacts.find(c=>c.target===target)||null;
  const previous=r.contacts;
  let p;try{p=r.legacy?r.system.makeDeviceChargerProbe(proof,actor):r.system.makeCrabletCombatProbe(actor,r.wire);}catch{return null;}if(!p)return null;
  // This isolated record is never published or stepped by the visual owner.
  // Native defense geometry needs the real attack path; onHit is never called.
  if(p.s3Weapon?.kind==='roller'&&!p.catalog)p.fidelitySectorYaw=r.yaw;
  const ageLimit=Math.min(r.legacy||p.catalog?3.5:p.life,3.5,Math.max(0,claimTime-proof.ts)+.15),delay=Math.max(0,p.delay||0);
  if(!(ageLimit>delay))return null;
  const result=withNativeDeviceProbe(p,()=>{
  if(p.catalog){
    if(p.catalog.r.family==='roller'&&p.catalog.descriptor.key==='horizontal')p.catalog.sectorYaw=r.yaw;
    try{return r.system.nativeCatalogDeviceContact?.(p,target,ageLimit-delay)||null;}catch{return null;}
  }
  try{
    for(let i=0;i<210&&(r.legacy?i/60:p.age)<ageLimit-delay+1e-9;i++){
      let radii;
      if(r.legacy){const row=p.path[i];if(!row)break;p.prev.set(row[0],row[1],row[2]);p.pos.set(row[3],row[4],row[5]);radii={field0:row[6],field1:row[7],pad:row[8],done:i===p.path.length-1};}
      else radii=r.system.stepCrabletCombatProbe(p);if(!radii)return null;
      const native=!r.legacy&&!p.inkProfile?r.system.nativeFidelityDeviceSweep?.(p):null;
      const world=native?.world||r.system.worldCrabletCombatProbe(p.prev,p.pos,radii.field0,radii.field1);
      const defense=native?world.kitDefense:r.system.kitDefenseCandidate?.(p),length=p.prev.distanceTo(p.pos);
      const body=native?Math.min(native.body,native.boss?.dist??Infinity):r.system.deviceCombatProbeBlockDistance?.(p,radii)??Infinity;
      const terrain=world?.hit&&!world.kitDefense?world.dist:Infinity;
      if(defense&&defense.distance<Math.min(terrain,body)-1e-9){
        if((defense.object||defense.damageTarget)!==target)return null;
        const fraction=length>1e-12?defense.distance/length:0;
        p.pos.copy(defense.point);
        const damage=r.system.deviceCombatProbeDamage?.(p,target,fraction);
        if(!Number.isFinite(damage)||damage<=0)return null;
        return {damage,projectile:p};
      }
      if(!r.legacy&&p.s3Weapon?.kind==='blaster'&&!p.s3SpecialWeapon&&
        (world?.hit||body<=length||p.age+1e-10>=p.life)){
        // Native world/Actor/Boss contact and timed expiry all burst. A nearer
        // device takes the terminating direct lane above and has no AoE.
        const stop=Math.min(world?.hit?world.dist:Infinity,body);
        if(Number.isFinite(stop)&&stop<=length){
          if(world?.hit&&world.dist<=body)p.pos.copy(world.point);
          else p.pos.lerpVectors(p.prev,p.pos,length>1e-12?stop/length:0);
        }
        const contacts=r.system.nativeFidelityDeviceBurstContacts?.(p,p.pos)||[];
        const hit=contacts.find(c=>c.target===target);
        return hit?{...hit,contacts}:null;
      }
      if(world?.hit||body<=length||radii.done||p.catalog&&p.catalog.travel+1e-9>=p.catalog.range)break;
    }
  }catch{return null;}
  return null;
  });
  if(!result)return null;
  const contacts=result.contacts||[{...result,target}];
  let committed=false;
  return {...result,commit(){
    if(committed||r.contacts!==previous||nm.byNid?.get(proof.actor)!==r.actor||
      r.actor.net!==r.net||life(r.actor)!==r.life||nm.s!==r.session||nm.match!==r.match||
      r.actor.owner!==r.owner||r.epoch!==nm.cfg?.id||r.peer!==nm.peers?.get(r.owner)||nm._combatCrabletSystem!==r.system)return false;
    committed=true;r.contacts=contacts;return true;
  }};
}
