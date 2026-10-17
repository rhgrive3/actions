// Movement follows admitted fire, independently of the visual 0.35s pose.
// The 4F post-shot gate is a release tail, not a walking gap between 6F rounds.
export function shooterMovementRemaining(timer, dt) {
  return Math.max(0, (Number.isFinite(timer) ? timer : 0) - Math.max(0, dt));
}
export function shooterMovementSpeed(timer, regular, firing) {
  return timer > 1e-10 ? firing : regular;
}

/** Predict only an emission the native owner can admit in this movement tick.
 * Actor moves before WeaponRunner.update; the scoped dt is set by installGear.
 * Startup and cancellation gates keep their native owner. The allowed due
 * round on a cancellation edge is retained; a retired stream cannot re-arm.
 */
export function shooterShotReady(r, dt = r.s3MovementStepDt || 0) {
  const a = r.a, w = a?.weapon;
  if (w?.kind !== 'shooter' || !(dt > 0) || r.s3ShooterCancelMain ||
      a.form !== 'kid' || a.specialActive || a.superJumpState ||
      !(a.intent?.fire || a.fireBuffer > 0) || a.kidT < (r.s3MovementEmergeDelay ?? 0) ||
      r.cooldown > dt + 1e-10 || a.ink + 1e-10 < w.inkPerShot) return false;
  const delay = a.kidT <= (w.swimFirstShotDelay || 0) + 1e-10 ? 0 : w.firstShotDelay || 0;
  return r.s3ShooterPendingFirst ? r.s3ShooterFirstRemaining <= dt + 1e-10
    : r.s3ShooterHeld || delay <= dt + 1e-10;
}

export function shooterMovementActive(r) {
  if (r.s3ShooterMoveRemaining > 1e-10) return true;
  const a = r.a;
  const heldStream = r.s3ShooterStreamActive && r.s3ShooterHeld && !r.s3ShooterPendingFirst &&
    !r.s3ShooterCancelMain && a?.form === 'kid' && a.intent?.fire && !a.intent?.sub &&
    !a.intent?.squid && !a.specialActive && !a.superJumpState && a.ink + 1e-10 >= a.weapon.inkPerShot;
  return !!heldStream || shooterShotReady(r);
}

// Gameplay shot clocks and source recovery are retained. The native 0.35s
// firingPose/0.5s fireFacing timers also feed visuals, but must not make a
// released backpedal keep facing the reticle or replay Shoot locomotion.
// Read the world-space stick against the camera's aim, NOT the lagging body yaw.
// This read-only predicate releases presentation/facing. Catalog shooters also
// use it to select their post-shot movement gate; it never changes shot clocks.
export function reverseShotRelease(a) {
  if (!a || a.remote || a.alive === false || a.form !== 'kid' ||
      a.specialActive || a.superJumpState) return false;
  const family = a.weapon?.behaviorKind || a.weapon?.catalogRecord?.family || a.weapon?.kind;
  if (!['shooter', 'dualies', 'blaster', 'slosher', 'splatling'].includes(family)) return false;
  const input = a.intent, r = a.weaponRunner, move = input?.move;
  if (!r || !move || input.fire || input.sub || r.aimingSub ||
      r.charging || r.streaming || r.dodge || r.lockT > 0 ||
      r.slosh >= 0 || r.s3BlasterWindup > 0 || r.s3BlasterMoveRemaining > 1e-10 ||
      r.s3ShooterPendingFirst || r.s3DualiesStart > 1e-10) return false;
  const catalog = r.catalogState;
  if (catalog?.pending || catalog?.melee || catalog?.roll || catalog?.lunge ||
      catalog?.stream > 0 || catalog?.chargeF > 0 || catalog?.burst > 0) return false;
  const length = Math.hypot(move.x, move.z), yaw = a.aimYaw;
  return length > .2 && Number.isFinite(yaw) &&
    (move.x * Math.sin(yaw) + move.z * Math.cos(yaw)) < -.2 * length;
}
