// Authoritative root physics only. No input, network, Character or visual pose writes.
// Rates are world units/second; duration/age are seconds. Reference decisions and
// deliberately retained calibration are in reports/movement-physics-fidelity-report.md.
export const MOVEMENT_EPSILON = 1e-10;

/** Move a horizontal velocity vector toward the requested S3 ground velocity
 * by a fixed acceleration magnitude. Splatoon 3 community frame measurements
 * report 0.01 m/F^2 normally and 0.02 m/F^2 while attacking/aiming; at 60 Hz
 * those are 36 and 72 m/s^2. Vector approach preserves inertia on 90/180 turns
 * instead of rotating a full-speed vector in place.
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

/** True only while the roller, not its flick/recovery, owns ground movement. */
export function rollingMovementActive(a) {
  const r = a.weaponRunner;
  return a.weapon.kind === 'roller' && !!r.rolling && a.form === 'kid' &&
    a.grounded && !a.specialActive && !a.superJumpState &&
    r.flick < 0 && !(r.flickRecover > MOVEMENT_EPSILON) && !r.aimingSub;
}

/** One speed source: WeaponRunner.moveSpeed -> Actor -> existing animation state. */
export function rollingMovementSpeed(r) {
  const w = r.a.weapon;
  const base = Number.isFinite(w.rollBaseSpeed) ? w.rollBaseSpeed : w.rollSpeed;
  return r.rollT + MOVEMENT_EPSILON >= (w.rollDashTime ?? 0) ? w.rollSpeed : base;
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
