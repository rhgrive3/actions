// While the FIRE trigger is held, the body keeps facing the aim, as in ordinary shooting.
// The sourced Blaster does not refresh firingT during its cooldown wait between shots, so
// firingPose() and fireFacing lapse while the trigger is still held, and a backward walk
// through that wait turned the body to the travel direction. This predicate only lets the
// held trigger select the existing aim branch of Actor._face. It does not change the aim
// angle, the walk speed (moveSpeed reads firingT), or the shot clocks. Rollers and brushes
// keep their rolling heading, and the Brella keeps its own guard rule (brella-guard-facing.mjs).
const OWN_FACING = new Set(['roller', 'brush', 'brella']);

// Owner report 2026-11-10: during Killer Wail 5.1 the main weapon and sub stay
// usable, but Actor._face's special branch turned the body to the travel direction
// for every active special, so strafing while shooting fired sideways. While the
// Wail is active and the player is using the main or sub, the special branch yields
// to the ordinary aim-facing branches (same aim angle and turn rates as shooting).
// Other specials keep their own facing.
const MAIN_USABLE_SPECIALS = new Set(['killerWail']);
export function specialYieldsToMainFacing(a, isSquid) {
  if (isSquid || !a || a.remote || a.alive === false || a.form !== 'kid' || a.superJumpState) return false;
  if (!MAIN_USABLE_SPECIALS.has(a.specialActive?.id)) return false;
  return !!(a.intent?.fire || a.intent?.sub || a.weaponRunner?.firingPose?.() || a.fireFacing > 0);
}

export function heldFireAimFacing(a, isSquid) {
  if (isSquid || !a || a.remote || a.alive === false || a.form !== 'kid') return false;
  if ((a.specialActive && !MAIN_USABLE_SPECIALS.has(a.specialActive.id)) || a.superJumpState || !a.intent?.fire) return false;
  const family = a.weapon?.behaviorKind || a.weapon?.catalogRecord?.family || a.weapon?.kind;
  return !OWN_FACING.has(family);
}
