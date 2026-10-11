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
