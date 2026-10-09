// #408: authoritative movement state is independent of the visual 0.35s pose.
// The configured post-shot gate is 4/60s for current S3 Splattershot.
export function shooterMovementRemaining(timer, dt) {
  return Math.max(0, (Number.isFinite(timer) ? timer : 0) - Math.max(0, dt));
}
export function shooterMovementSpeed(timer, regular, firing) {
  return timer > 1e-10 ? firing : regular;
}
