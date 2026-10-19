// Original 2022 HitEf recordings, but not a recovered 11.3.0 SLINK decision tree.
// Select from the *actual admitted damaging weapon ID*, never the attacker's
// currently equipped main. A Charger holding a Splat Bomb must not turn that
// bomb's hit into a Charger critical confirmation.
export function combatFeedbackCue(actor, weaponId, damage, blasterKind = () => null, chargeFraction = null) {
  const source = typeof weaponId === 'string' ? weaponId : '';
  const charger = source === 'charger' || /^charger-0[1-9]$/.test(source) ||
    /^s3-charger-[a-z0-9-]+$/.test(source);
  // Verified gameplay distinction: fully charged direct shots can ring even
  // without splatting, while partially charged one-hit splats need not ring.
  // Do not infer full charge from damage (armor, gear and weapon tuning vary).
  if (charger) return Number.isFinite(chargeFraction) && chargeFraction >= .999 ? 'critical_hit' : 'hit';
  // These direct-hit special announcements have independent public
  // descriptions; source wav's exact trigger is still unverified.
  if (/^s3-slosher-launcher(?:-0[1-9])?$/.test(source) ||
      /^s3-shooter-triplemiddle(?:-0[1-9])?$/.test(source)) return 'critical_hit';
  if (blasterKind(actor, weaponId) === 'direct') return 'critical_hit';
  return 'hit';
}
