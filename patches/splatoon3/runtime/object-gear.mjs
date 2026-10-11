// Fixed shoes-main identity. These are target-column multipliers, never AP curves.
// Leanny/splat3 7280ff9cde8bb1c5dcef46c700c326471584d2e6, 1130
// misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json,
// RowKey ObjectEffect_Up. Missing/default columns are deliberately unmodified.
export const OBJECT_SHREDDER_FLAG = 134217728; // bit27; special-ready owns bit26
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
export function receiveObjectGearSnapshot(actor, owner, flags) {
  actor.s3 ||= {};
  actor.s3.objectGearSnapshot = { owner, life: life(actor), equipped: !!(flags & OBJECT_SHREDDER_FLAG) };
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
