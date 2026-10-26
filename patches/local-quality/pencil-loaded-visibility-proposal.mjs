// LOCAL next-candidate late-composition proposal; not published or browser
// validated. This overlay's final compiler hook restores the
// native aim cluster while registered Pencil ammunition remains loaded.
// No new ammo-number UI, gauge/full state, radius, arcs or gameplay semantics.
// Parent HUD/menu/score/pause visibility and native squid/scope/reach owners
// remain authoritative; this boolean relaxes ONLY the existing #594 idle gate.
export function pencilLoadedReticleEligible(hud,weaponId,registry){
 if(!hud||hud._visible!==true||hud._worldPaused===true||hud._live?.()!==true||
    hud._L?.weapon!==weaponId||hud._L?.kind!=='charger'||typeof weaponId!=='string'||
    !registry||!Object.hasOwn(registry,weaponId))return false;
 const w=registry[weaponId],a=hud._local?.(),view=a?.weapon,r=a?.weaponRunner,s=r?.catalogState;
 const baseId=w?.variantOf||weaponId,base=registry['s3-charger-pencil'];
 if(baseId!=='s3-charger-pencil'||!Object.hasOwn(registry,'s3-charger-pencil')||
    base?.id!=='s3-charger-pencil'||base.kind!=='catalog'||base.behaviorKind!=='charger'||base.modelKind!=='charger'||w?.id!==weaponId||a?.weaponId!==weaponId||
    !view||view.id!==w.id||view.kind!==w.kind||view.behaviorKind!==w.behaviorKind||
    view.modelKind!==w.modelKind||view.variantOf!==w.variantOf||view.catalogRecord!==w.catalogRecord||
    w.kind!=='catalog'||w.behaviorKind!=='charger'||w.modelKind!=='charger'||
    w.catalogRecord!==base.catalogRecord||w.catalogRecord?.id!==baseId||w.catalogRecord.family!=='charger'||
    !a.alive||a.form!=='kid'||a.specialActive||a.superJumpState||r?.a!==a||r.aimingSub||
    r.charging!==false||r.streaming!==false||r.charge!==0||s?.id!==baseId||s.chargeF!==0||s.pending||s.stored)return false;
 // Gear owns an actor-local shallow weapon view and adjusts numeric stats.
 // Match catalog provenance and identity fields, not the canonical object.
 const max=w.catalogRecord.parameters?.WeaponDivideChargerParam?.FullChargeDivideNum;
 return Number.isInteger(max)&&max>1&&Number.isInteger(s.rounds)&&s.rounds>0&&s.rounds<max;
}

// Called only after the full source pipeline has created the exact #594 gate.
// The helper import path exists in this LOCAL candidate, not public production.
export function adaptPencilLoadedVisibility(rel,code){
 if(rel!=='src/ui/hud.js')return code;
 const needle="const retIdle = !(+f.charge > 0.001) && !(L.kind === 'splatling' && !!L.streaming);";
 if(code.split(needle).length!==2)throw Error('Pencil loaded visibility requires one exact native #594 gate');
 return "import { pencilLoadedReticleEligible } from '../../patches/local-quality/pencil-loaded-visibility-proposal.mjs';\n"+
   code.replace(needle,needle.slice(0,-1)+" && !pencilLoadedReticleEligible(this,w,WEAPONS);");
}
