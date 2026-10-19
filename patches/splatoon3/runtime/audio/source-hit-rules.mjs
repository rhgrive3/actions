// Gameplay-sourced hit audio routing. No Nintendo audio bytes are bundled here.
// A fatal half-charge shot is NOT equivalent to a full-charge critical impact.
const CRITICAL_EXCLUSIONS = new Set(['s3-charger-light','s3-charger-pencil']);
const isChargerId = id => id === 'charger' ||
  /^charger-\d+$/.test(id || '') || /^s3-charger-/.test(id || '');

export function classifySourceCombatHit({attacker,weaponId,hitMeta}={}) {
  // The admitted hit weapon ID, not the currently equipped Charger, owns
  // classification. Bomb and special hits must never borrow Charger metadata.
  const id=typeof weaponId==='string'?weaponId:'';
  const record=attacker?.weapon?.catalogRecord;
  const charger=isChargerId(id);
  const canonical=id.replace(/-0[1-9]$/,'');
  const excluded=CRITICAL_EXCLUSIONS.has(canonical) ||
    record?.sourceActor==='WeaponChargerLight' || record?.sourceActor==='WeaponChargerPencil';
  const charge=Number(hitMeta?.charge);
  // Never infer directness or charge level from killed/damage/attacker aim:
  // projectile collision reports these values on the actual admitted hit.
  return charger&&!excluded&&hitMeta?.chargerDirect===true&&
    Number.isFinite(charge)&&charge>=1-1e-6 ? 'critical' : 'damage';
}

// The source bank validates supplied MP3 SHA-256 and exposes only resident
// authorized buffers. No synthesized replacement or out-of-origin URL is
// accepted for combat:critical, combat:damage or combat:splat events.
export function playResidentCombatRecording(audio,kind,actor,volume) {
  if(!['critical','damage','splat'].includes(kind))return false;
  const id='combat:'+kind;
  if(!audio?.weaponBank?.()?.authorized?.byEvent?.has(id+':fire'))return false;
  return !!audio.playWeapon?.(id,'fire',{actor,volume,priority:kind==='critical'?91:kind==='splat'?90:75});
}
