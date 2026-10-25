// Fixed shoes-main identity. These are target-column multipliers, never AP curves.
// Leanny/splat3 7280ff9cde8bb1c5dcef46c700c326471584d2e6, 1130
// misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json,
// RowKey ObjectEffect_Up. Missing/default columns are deliberately unmodified.
// Historical bit27 collides with the Dualies planted-pose flag. Never transmit
// object gear in actor flags. Keep this constant for historical trace checks.
export const OBJECT_SHREDDER_FLAG = 134217728;
export const OBJECT_SHREDDER_RATES = Object.freeze({
  booyahBomb: 1.1, crabTank: 1.3, waveBreaker: 1.25, superChump: 2,
  splashWall: 1.5, sprinkler: 10, beakon: 10, torpedo: 1.3,
});
const life = actor => Math.max(Number.isSafeInteger(actor?.netLife) ? actor.netLife : 0, Number.isSafeInteger(actor?.net?.lastLife) ? actor.net.lastLife : 0);
export function objectShredderEquipped(actor) {
  if (!actor) return false;
  if (typeof actor.s3?.objectHitGear === 'boolean') return actor.s3.objectHitGear;
  if (!actor.remote) return actor.s3?.loadout?.[2]?.main === 'objectShredder';
  const proof = actor.s3?.objectGearSnapshot;
  return !!proof && proof.owner === actor.owner && proof.life === life(actor) && proof.equipped === true;
}
export function receiveObjectGearSnapshot(actor, owner, value) {
  actor.s3 ||= {};
  // Explicit 0/1 from the accepted owner's sidecar. Missing, malformed or
  // old-peer data fails closed, even if actor flags carry a Dualies turret.
  if (value !== 0 && value !== 1) { actor.s3.objectGearSnapshot = null; return; }
  actor.s3.objectGearSnapshot = { owner, life: life(actor), equipped: value === 1 };
}
// Called only inside existing accepted-owner/life admission. A packet contains
// one equipment identity, not an arbitrary damage multiplier. Old peers omit it.
export function withObjectHitGear(actor, value, run) {
  if (!actor) return run();
  actor.s3 ||= {};
  const previous = actor.s3.objectHitGear;
  actor.s3.objectHitGear = value === true;
  try { return run(); }
  finally {
    if (previous === undefined) delete actor.s3.objectHitGear;
    else actor.s3.objectHitGear = previous;
  }
}
export function objectGearRate(actor, target) {
  return objectShredderEquipped(actor) ? OBJECT_SHREDDER_RATES[target] || 1 : 1;
}
