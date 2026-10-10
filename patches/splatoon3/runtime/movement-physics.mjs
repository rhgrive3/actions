// Authoritative root physics only. No input, network, Character or visual pose writes.
// Rates are world units/second; duration/age are seconds. Reference decisions and
// deliberately retained calibration are in reports/movement-physics-fidelity-report.md.
export const MOVEMENT_EPSILON = 1e-10;

/** Move a horizontal velocity vector toward the requested S3 ground velocity
 * by a fixed acceleration magnitude. Splatoon 3's published verification
 * reports a 2x ordinary-to-attack/ready acceleration relationship. The active
 * profile maps that relationship to the existing INKWAVE rates 36/72; no
 * WU-to-meter/DU conversion is asserted. Vector approach preserves inertia on
 * 90/180 turns instead of rotating a full-speed vector in place.
 */
export function stepGroundVelocity(vel, moveX, moveZ, targetSpeed, accel, dt) {
  if (!(dt > 0) || !(accel >= 0) || !(targetSpeed >= 0)) return;
  const mh = Math.hypot(moveX, moveZ), mag = Math.min(1, mh);
  const tx = mh > 1e-10 ? moveX / mh * targetSpeed * mag : 0;
  const tz = mh > 1e-10 ? moveZ / mh * targetSpeed * mag : 0;
  const dx = tx - vel.x, dz = tz - vel.z, dist = Math.hypot(dx, dz);
  const step = accel * dt;
  if (!(dist > step) || !(step > 0)) { vel.x = tx; vel.z = tz; return; }
  vel.x += dx / dist * step; vel.z += dz / dist * step;
}

/** Attack/ready state ratio for airborne acceleration and braking. The S3
 * reference gives 2x both rates for main fire, held sub and special (0.02 vs
 * 0.01 m/F^2) and does not exempt the air; the ratio is the already pinned
 * ground 72/36 so the (separately owned) ordinary air baseline is untouched.
 * Same condition as the grounded selection; also holds after entering squid.
 */
export function attackAirRateScale(a, P) {
  const attacking = a.weaponRunner.firingPose?.() || a.intent.sub || a.weaponRunner.aimingSub || a.specialActive;
  const ratio = (P.s3AttackGroundAccel ?? 72) / (P.s3GroundAccel ?? 36);
  return attacking && ratio > 0 ? ratio : 1;
}

/** Actor-vs-actor soft push (Match.update) written world-aware. Upstream added the whole correction to pos after the
 * body was collision-resolved, so a local actor taking 100% of a remote overlap (up to 1.7 radii) could land past the
 * midplane of a thin wall and be resolved out its far side on the next tick. The push now advances in sub-steps well
 * under the wall-detection depth and stops at the last position where the same body capsule still fits the world.
 * Plain fixed step count (no dt): the push is a position correction, not a velocity.
 */
export function softPushActor(physics, P, a, dx, dz) {
  const length = Math.hypot(dx, dz);
  if (!(length > 0) || !physics) return;
  const squid = a.form === 'squid';
  const lift = squid ? P.squidBodyLift : P.stepUp, height = squid ? P.squidHeight : P.height;
  const steps = Math.ceil(length / (P.radius * 0.25)), sx = dx / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    a.pos.x += sx; a.pos.z += sz;
    if (!physics.bodyFits(a.pos, P.radius, lift, height, squid)) { a.pos.x -= sx; a.pos.z -= sz; return; }
  }
}

/** True only while the roller, not its flick/recovery, owns ground movement. */
export function rollingMovementActive(a) {
  const r = a.weaponRunner;
  return a.weapon.kind === 'roller' && !!r.rolling && a.form === 'kid' &&
    a.grounded && !a.specialActive && !a.superJumpState &&
    r.flick < 0 && !(r.flickRecover > MOVEMENT_EPSILON) && !r.aimingSub;
}

/** #466: a dash-turn reversal is a stick more than 90 degrees away from the current
 * world-space travel direction. Both vectors are world-space (Actor._horizontal uses
 * the same comparison). The 90-degree threshold is an INKWAVE choice: the S3 trigger
 * is not published (unverified). A stationary stick or near-zero velocity never qualifies.
 */
export function dashTurnBreakActive(a) {
  const move = a.intent?.move, vel = a.vel;
  const input = move ? Math.hypot(move.x, move.z) : 0;
  const speed = vel ? Math.hypot(vel.x, vel.z) : 0;
  return input > 0.01 && speed > 0.01 && (move.x * vel.x + move.z * vel.z) / (input * speed) < 0;
}

/** One speed source: WeaponRunner.moveSpeed -> Actor -> existing animation state.
 * Normal roll 6.48 (SpeedNormal 0.108/frame), dash from 90F 7.92 (SpeedDash 0.132/frame).
 * While dashing and turning back, the target is capped at SpeedDashTurnBreak
 * (0.108/frame, 6.48 with the profile scale). The return to SpeedDash on the first
 * non-reversing frame is unverified; the dash state (rollT) is never reset.
 */
export function rollingMovementSpeed(r) {
  const w = r.a.weapon;
  const base = Number.isFinite(w.rollBaseSpeed) ? w.rollBaseSpeed : w.rollSpeed;
  if (r.rollT + MOVEMENT_EPSILON < (w.rollDashTime ?? 0)) return base;
  if (dashTurnBreakActive(r.a)) return Math.min(w.rollSpeed, w.rollDashTurnBreakSpeed ?? base);
  return w.rollSpeed;
}

/** Integral of the existing 1.5*(1-u^2) curve, not a new guessed Nintendo curve.
 * The result is distance consumed in [age, age+dt]. Clipped distance is discarded,
 * never carried forward to teleport through a wall later. No per-tick allocation.
 */
export function dodgeIntervalDistance(distance, duration, age, dt) {
  if (!(dt > 0) || !(duration > 0) || !(distance >= 0)) return 0;
  const u0 = Math.max(0, Math.min(1, age / duration));
  const u1 = Math.max(u0, Math.min(1, (age + dt) / duration));
  // Factor the difference of cubes: stable even for very short intervals.
  return distance * 1.5 * (u1 - u0) * (1 - (u1 * u1 + u1 * u0 + u0 * u0) / 3);
}

/** Interval-average velocity for the collision integrator. Legacy default dt is
 * explicit for external callers; the production owner always supplies its dt.
 */
export function writeDodgeVelocity(r, vel, dt = 1 / 60, offset = 0) {
  const d = r.dodge;
  if (!d) return false;
  const n = Math.hypot(r._dodgeDir.x, r._dodgeDir.z);
  const speed = dt > 0 && n > 0 ? dodgeIntervalDistance(r.a.weapon.rollDist, d.dur, d.t + offset, dt) / dt / n : 0;
  vel.x = r._dodgeDir.x * speed; vel.z = r._dodgeDir.z * speed;
  return true;
}

/** Sole integration entrypoint, called AFTER action admission. Ordinary movement
 * delegates to the unchanged native controller. Fast dodges use the same real
 * controller in spatially bounded slices so a thin wall cannot be skipped.
 */
export function integrateMovement(a, dt, isSquid, jumped, radius) {
  const r = a.weaponRunner, d = r.dodge;
  if (!d || a.climbing || a.specialActive || a.superJumpState || !(dt > 0)) {
    return a._integrateMovementStep(dt, isSquid, jumped);
  }
  const distance = dodgeIntervalDistance(a.weapon.rollDist, d.dur, d.t, dt);
  // Bound by peak velocity, not mean velocity: the front of the curve is fastest.
  const u = Math.max(0, Math.min(1, d.t / d.dur));
  const peakSpeed = 1.5 * a.weapon.rollDist / d.dur * (1 - u * u);
  const activeTime = Math.min(dt, Math.max(0, d.dur - d.t));
  const maxStep = Math.max(.02, radius * .5);
  const steps = Math.max(1, Math.ceil(Math.max(distance, peakSpeed * activeTime) / maxStep));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    writeDodgeVelocity(r, a.vel, step, i * step);
    a._integrateMovementStep(step, isSquid, jumped && i === 0);
  }
  // Expose end-of-tick velocity, rather than the last slice's average. Respect
  // the collision resolver's final normal; never restore an inward component.
  const endU = Math.max(0, Math.min(1, (d.t + dt) / d.dur));
  const n = Math.hypot(r._dodgeDir.x, r._dodgeDir.z);
  const speed = n > 0 ? 1.5 * a.weapon.rollDist / d.dur * (1 - endU * endU) / n : 0;
  a.vel.x = r._dodgeDir.x * speed; a.vel.z = r._dodgeDir.z * speed;
  if (a.contacts.wall) {
    const normal = a.contacts.wallNormal, into = a.vel.x * normal.x + a.vel.z * normal.z;
    if (into < 0) { a.vel.x -= normal.x * into; a.vel.z -= normal.z * into; }
  }
}
