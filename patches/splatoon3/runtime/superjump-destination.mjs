// #412: local jumps commit `to` at admission; current remote snapshots restore
// that same field only after the network owner/life/schema checks. A legacy
// render-only phase has no destination and must never fall back to the last
// grounded point, the transient airborne position, or a stale flight hint.
export function hasCommittedSuperJumpDestination(target) {
  const s = target?.superJumpState, to = s?.to;
  return !!(target?.alive && (s?.phase === 'charge' || s?.phase === 'flight') &&
    to?.isVector3 && Number.isFinite(to.x) && Number.isFinite(to.y) && Number.isFinite(to.z));
}
