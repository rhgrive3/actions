// While the FIRE trigger is held, the body keeps facing the aim, as in ordinary shooting.
// The sourced Blaster does not refresh firingT during its cooldown wait between shots, so
// firingPose() and fireFacing lapse while the trigger is still held, and a backward walk
// through that wait turned the body to the travel direction. This predicate only lets the
// held trigger select the existing aim branch of Actor._face. It does not change the aim
// angle, the walk speed (moveSpeed reads firingT), or the shot clocks. Rollers and brushes
// keep their rolling heading, and the Brella keeps its own guard rule (brella-guard-facing.mjs).
const OWN_FACING = new Set(['roller', 'brush', 'brella']);

export function heldFireAimFacing(a, isSquid) {
  if (isSquid || !a || a.remote || a.alive === false || a.form !== 'kid') return false;
  if (a.specialActive || a.superJumpState || !a.intent?.fire) return false;
  const family = a.weapon?.behaviorKind || a.weapon?.catalogRecord?.family || a.weapon?.kind;
  return !OWN_FACING.has(family);
}
