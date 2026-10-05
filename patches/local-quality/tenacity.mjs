// #392: bounded, owner-only passive special source. Rates are the documented
// S3 baseline points/second, not effective (SCU-discounted) actor points.
export const TENACITY_RATES = Object.freeze([0, 3.26, 5.44, 7.59]);
export function advanceTenacity(match, dt, emit) {
  if (!Number.isFinite(dt) || dt <= 0 || match.mode !== 'turf' || match.attract ||
      match.paused || match.state !== 'playing' || !(match.time > 0)) return;
  const actors = match.actors;
  // Snapshot after all native actor updates: roster ordering cannot change the
  // active-player counts seen by different owners in the same tick.
  const counts = [0, 0];
  for (const a of actors) if (a.alive && (a.team === 0 || a.team === 1)) counts[a.team]++;
  for (const a of actors) {
    if (!a.alive || a.remote || a.specialActive || a.s3?.loadout?.[0]?.main !== 'tenacity' ||
        (a.team !== 0 && a.team !== 1)) continue;
    const deficit = Math.max(0, Math.min(3, counts[1 - a.team] - counts[a.team]));
    const cost = a.specialCost(), baseCost = a.s3?.tenacityBaseCost;
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(baseCost) || baseCost <= 0 || !Number.isFinite(a.special)) continue;
    const wasReady = a.specialReady();
    // Gear currently discounts the cost instead of multiplying turf gain.
    // Convert baseline passive points into this coordinate system, otherwise
    // SCU would indirectly accelerate Tenacity despite no rate multiplier.
    a.special = Math.min(cost, a.special + TENACITY_RATES[deficit] * dt * cost / baseCost);
    if (!wasReady && a.specialReady()) emit('special:ready', { actor: a });
  }
}
