// Gameplay-sourced hit audio routing. No Nintendo audio bytes are bundled here.
// A fatal half-charge shot is NOT equivalent to a full-charge critical impact.
const CRITICAL_EXCLUSIONS = new Set(['s3-charger-light','s3-charger-pencil']);
const isChargerId = id => id === 'charger' ||
  /^charger-\d+$/.test(id || '') || /^s3-charger-/.test(id || '');

export function classifySourceCombatHit({attacker,weaponId,hitMeta}={}) {
  const id=String(weaponId||attacker?.weapon?.id||'');
  const record=attacker?.weapon?.catalogRecord;
  const charger=(record?.family==='charger'||attacker?.weapon?.kind==='charger'||isChargerId(id));
  const excluded=CRITICAL_EXCLUSIONS.has(id) ||
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
