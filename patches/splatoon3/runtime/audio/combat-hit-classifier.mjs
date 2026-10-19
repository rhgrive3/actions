// Source recorded HitEf_CriticalHit and HitEf_Damage identities are verified.
// Exact proprietary retail SLINK conditions are not, so restrict this decision
// to explicitly admitted charge metadata. Never infer a shot's charge from HP,
// lethal outcome, current weapon selection or damage thresholds.
export function sourceChargerHitCue(weaponId,charge){
  if(typeof weaponId!=='string')return null;
  const isCharger=weaponId==='charger'||/^charger-0[1-9]$/.test(weaponId)||
    /^s3-charger-[a-z0-9-]+$/.test(weaponId);
  if(!isCharger)return null;
  // Bamboo and R-PEN have separate hit-confirm presentation. Their source
  // MP3 trigger remains unresolved, so do not fabricate a CriticalHit signal.
  const base=weaponId.replace(/-0[1-9]$/,'');
  const excluded=base==='s3-charger-light'||base==='s3-charger-pencil';
  return !excluded&&Number.isFinite(charge)&&charge>=1?'combat:critical':'combat:damage';
}
