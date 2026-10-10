// Authoritative root physics only. No input, network, Character or visual pose writes.
// Rates are world units/second; duration/age are seconds. Reference decisions and
// deliberately retained calibration are in reports/movement-physics-fidelity-report.md.
export const MOVEMENT_EPSILON = 1e-10;
// Independently documented for Splatoon 3 standard Splat Dualies: a 4.0-WU
// dodge movement followed by 1.0-WU of post-roll slide. The 4F slide timing
// and 8-WU/s downward admission are explicit INKWAVE calibrations because
// neither the game-code easing nor the exact aerial dive velocity is public.
// Source: https://splatoonwiki.org/wiki/Template:Dualies_data_S3
export const STANDARD_DUALIES_PHASES = Object.freeze({
  totalDistance: 5, rollDistance: 4, slideDistance: 1,
  slideTime: 4 / 60, aerialMinimumDownwardSpeed: 8,
});

export function activeDualiesRollDistance(w) {
  return w?.kind === 'dualies' && Math.abs((w.rollDist ?? 0) - STANDARD_DUALIES_PHASES.totalDistance) < 1e-7
    ? STANDARD_DUALIES_PHASES.rollDistance : (w?.rollDist ?? 0);
}

export function beginDualiesRoll(r) {
  r.s3DualiesGlide = null;
  const a = r.a;
  if (a?.weapon?.kind !== 'dualies' || a.grounded || !a.vel) return;
  // Downward angle begins on the admitted aerial dodge and is still integrated
  // by the ordinary physics/swept collision owner; never teleport the actor.
  a.vel.y = Math.min(a.vel.y, -STANDARD_DUALIES_PHASES.aerialMinimumDownwardSpeed);
}

export function beginDualiesPostSlide(r, w) {
  if (!r || w?.kind !== 'dualies' || activeDualiesRollDistance(w) === w.rollDist) {
    if (r) r.s3DualiesGlide = null;
    return;
  }
  r.s3DualiesGlide = { elapsed: 0, duration: STANDARD_DUALIES_PHASES.slideTime,
    distance: STANDARD_DUALIES_PHASES.slideDistance };
}


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
  const speed = dt > 0 && n > 0 ? dodgeIntervalDistance(activeDualiesRollDistance(r.a.weapon), d.dur, d.t + offset, dt) / dt / n : 0;
  vel.x = r._dodgeDir.x * speed; vel.z = r._dodgeDir.z * speed;
  return true;
}

/** Sole integration entrypoint, called AFTER action admission. Ordinary movement
 * delegates to the unchanged native controller. Fast dodges use the same real
 * controller in spatially bounded slices so a thin wall cannot be skipped.
 */
export function integrateMovement(a, dt, isSquid, jumped, radius) {
  const r = a.weaponRunner, d = r.dodge;
  if (d && !d.s3DiveInitiated) { d.s3DiveInitiated = true; beginDualiesRoll(r); }
  if (!d || a.climbing || a.specialActive || a.superJumpState || !(dt > 0)) {
    const slide = r.s3DualiesGlide;
    if (!d && slide && !a.climbing && !a.specialActive && !a.superJumpState &&
        a.weapon.kind === 'dualies' && a.form === 'kid' && r.lockT > 0 && a.alive !== false && dt > 0) {
      const remaining = Math.max(0, slide.duration - slide.elapsed);
      const active = Math.min(dt, remaining);
      if (active > MOVEMENT_EPSILON) {
        const moved = dodgeIntervalDistance(slide.distance, slide.duration, slide.elapsed, active);
        const age = Math.max(0, Math.min(1, slide.elapsed / slide.duration));
        const peak = 1.5 * slide.distance / slide.duration * (1 - age * age);
        const count = Math.max(1, Math.ceil(Math.max(moved, peak * active) /
          Math.max(.02, radius * .5)));
        const step = active / count;
        const n = Math.hypot(r._dodgeDir.x, r._dodgeDir.z);
        for (let i = 0; i < count; i++) {
          const speed = n > 0 ? dodgeIntervalDistance(slide.distance, slide.duration,
            slide.elapsed + i * step, step) / step / n : 0;
          a.vel.x = r._dodgeDir.x * speed; a.vel.z = r._dodgeDir.z * speed;
          a._integrateMovementStep(step, isSquid, jumped && i === 0);
        }
        slide.elapsed += active;
      }
      if (slide.elapsed >= slide.duration - MOVEMENT_EPSILON || !remaining) {
        r.s3DualiesGlide = null;
        a.vel.x = a.vel.z = 0;
      }
      if (dt - active > MOVEMENT_EPSILON)
        a._integrateMovementStep(dt - active, isSquid, false);
      return;
    }
    if (slide) r.s3DualiesGlide = null;
    return a._integrateMovementStep(dt, isSquid, jumped);
  }
  const distance = dodgeIntervalDistance(activeDualiesRollDistance(a.weapon), d.dur, d.t, dt);
  // Bound by peak velocity, not mean velocity: the front of the curve is fastest.
  const u = Math.max(0, Math.min(1, d.t / d.dur));
  const peakSpeed = 1.5 * activeDualiesRollDistance(a.weapon) / d.dur * (1 - u * u);
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
  const speed = n > 0 ? 1.5 * activeDualiesRollDistance(a.weapon) / d.dur * (1 - endU * endU) / n : 0;
  a.vel.x = r._dodgeDir.x * speed; a.vel.z = r._dodgeDir.z * speed;
  if (a.contacts.wall) {
    const normal = a.contacts.wallNormal, into = a.vel.x * normal.x + a.vel.z * normal.z;
    if (into < 0) { a.vel.x -= normal.x * into; a.vel.z -= normal.z * into; }
  }
  // The 12F moving roll completes 4WU; the remaining 1WU is applied only
  // after the native 4F post-roll recovery begins. No double movement.
  if (d.t + dt >= d.dur - MOVEMENT_EPSILON && a.weapon.kind === 'dualies'
      && a.alive !== false && !a.specialActive && !a.superJumpState)
    beginDualiesPostSlide(r, a.weapon);
}
