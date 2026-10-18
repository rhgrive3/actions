// INKWAVE model coordinates (+Y up, +Z forward), not retail dimensions.
// The cannon socket is the front-face ray sample used by the closed pod's
// existing mark; the shooter socket is the centre of its three muzzle holes.
export const CRAB_TANK_RIG = Object.freeze({
  scale: 0.9,
  offset: Object.freeze([0, 0, -0.05]),
  shooter: Object.freeze({ group: 'clawL', pivot: Object.freeze([0.3, 0.55, 0.3]), muzzle: Object.freeze([0.48, 0.5, 0.907]) }),
  cannon: Object.freeze({ group: 'clawR', pivot: Object.freeze([-0.3, 0.55, 0.3]), muzzle: Object.freeze([-0.4, 0.56, 0.9505855697567009]) }),
});

// Aim is authoritative even while body yaw catches up. A caller can explicitly
// request crosshair convergence by supplying its muzzle; never aim from feet.
export function crabTankAimDirection(actor, out, muzzle = null) {
  const aim = actor?.aimDir;
  if (aim && [aim.x, aim.y, aim.z].every(Number.isFinite) && aim.lengthSq() > 1e-12) out.copy(aim).normalize();
  else {
    const yaw = actor?.aimYaw ?? actor?.yaw ?? 0, pitch = actor?.aimPitch ?? 0, cp = Math.cos(pitch);
    out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
  }
  const target = actor?.aimPoint;
  if (muzzle && target && [target.x, target.y, target.z].every(Number.isFinite)) {
    const x = target.x - muzzle.x, y = target.y - muzzle.y, z = target.z - muzzle.z;
    const fromFeet = (target.x - actor.pos.x) ** 2 + (target.y - actor.pos.y) ** 2 + (target.z - actor.pos.z) ** 2;
    if (fromFeet > 1e-12 && x * out.x + y * out.y + z * out.z > 0 && x * x + y * y + z * z > 1e-12) out.set(x, y, z).normalize();
  }
  return out;
}

// Neutral socket at emission. Recoil is a visual response AFTER a round leaves.
// Optional direction lets a converged barrel and projectile share one axis.
export function crabTankMuzzle(actor, mode, out, direction = null) {
  const gun = CRAB_TANK_RIG[mode];
  if (!gun?.muzzle) throw new RangeError('Unknown Crab Tank firing mode: ' + mode);
  const aim = direction || crabTankAimDirection(actor, out), yaw = Math.atan2(aim.x, aim.z), pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const bodyYaw = actor.yaw || 0, sb = Math.sin(bodyYaw), cb = Math.cos(bodyYaw), scale = CRAB_TANK_RIG.scale;
  const [ox, oy, oz] = CRAB_TANK_RIG.offset, [px, py, pz] = gun.pivot;
  const x = gun.muzzle[0] - px, y = gun.muzzle[1] - py, z = gun.muzzle[2] - pz;
  const bx = ox + scale * px, bz = oz + scale * pz;
  return out.set(actor.pos.x + bx * cb + bz * sb + scale * (x * cy - y * sy * sp + z * sy * cp),
    actor.pos.y + oy + scale * (py + y * cp + z * sp),
    actor.pos.z - bx * sb + bz * cb + scale * (-x * sy - y * cy * sp + z * cy * cp));
}

// The socket rotates together with the barrel. An undamped fixed-point update
// enters a 2-cycle when the target is near the muzzle, so converge with a
// half-step and check the *final muzzle-to-target* residual. No allocation.
export function crabTankShotGeometry(actor, mode, origin, direction) {
  crabTankAimDirection(actor, direction);
  const target = actor?.aimPoint, feet = actor?.pos;
  // A freshly activated tank may still have the default aimPoint at its feet.
  // That is not a valid crosshair target: keep the current aimDir until the
  // actual camera/weapon calculation publishes a forward target.
  const hasTarget = target && feet && [target.x, target.y, target.z].every(Number.isFinite) &&
    ((target.x - feet.x) ** 2 + (target.y - feet.y) ** 2 + (target.z - feet.z) ** 2 > 1e-12);
  if (hasTarget) {
    for (let i = 0; i < 24; i++) {
      crabTankMuzzle(actor, mode, origin, direction);
      const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
      const d = Math.hypot(dx, dy, dz);
      // A point inside/behind the barrel is physically unreachable; keep the
      // valid forward aim axis rather than emitting a NaN or reversing fire.
      if (!(d > 1e-6) || dx * direction.x + dy * direction.y + dz * direction.z <= 0) break;
      const x = dx / d, y = dy / d, z = dz / d;
      const error = (x - direction.x) ** 2 + (y - direction.y) ** 2 + (z - direction.z) ** 2;
      if (error < 1e-18) break;
      direction.set(direction.x + x, direction.y + y, direction.z + z).normalize();
    }
  }
  crabTankMuzzle(actor, mode, origin, direction);
  return origin;
}
