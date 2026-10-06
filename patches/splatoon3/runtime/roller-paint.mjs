// Rolling turf footprint for the Splat Roller (#649).
//
// Pinned Splatoon 3 Ver. 11.3.0 values this module consumes, all already in
// profile.weaponsFidelityCompletion.weapons.roller:
//   BodyParam.PaintParam.SpeedMax      = 0.132  reference maximum roll speed
//   BodyParam.PaintParam.WidthHalfMax  = 2.8    maximum painted half width
//   BodyParam.CollisionParam.WidthHalf = 1.4    roller-body contact half width
//   WeaponRollParam.SpeedNormal        = 0.108  settled roll speed
//   WeaponRollParam.SpeedDash          = 0.132  90F dash roll speed
// profile.calibration.unitConversions maps per-frame velocity with "*60" and
// runtime/weapons-fidelity.mjs already evaluates projectile speed as
// 60 * SpawnSpeedBase, so rollSpeed (7.92) is exactly the world speed of
// SpeedMax and rollBaseSpeed (6.48) the world speed of SpeedNormal.
// installRollerPaint() re-derives that factor from the pinned table and refuses
// to install when the profile stops matching, so the speed ratio below cannot
// silently drift away from the reference.
//
// WidthHalfMax is the documented maximum painted half width; it is consumed as
// the upper bound of the footprint anchored onto the existing w.rollWidth
// calibration rather than as a second absolute maximum width (#189 owns that).
// Roller-body contact geometry is untouched: the three body bands keep their
// upstream offsets and radius at every speed, so only the body can paint a wall.
// The speed-dependent lateral reach is the side splash, emitted as floor-only
// paint, because Splatoon 3 paints walls with the roller body and floor with the
// side splashes that grow with movement speed.
//
// Scale shape: SpeedMax and WidthHalfMax are pinned endpoints, not a curve. The
// straight line between "no side splash" and "side splash at the band radius" is
// a labelled minimal model in the same spirit as weapons-fidelity.mjs's
// `splatlingLaunchSpeed`; it is not a claim about recovered Nintendo code, and
// the absolute side-splash width stays uncalibrated until a real capture exists.
const PER_FRAME_TO_PER_SECOND = 60;
// Native roll band radius, copied from the upstream _roller() this module owns.
const BAND_RADIUS = 0.62;
const SPEED_TOLERANCE = 1e-6;

let reference = null;

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new RangeError('Roller paint reference: invalid ' + label);
  return value;
};

// Fail-closed binding. Nothing is read from a default table, so a profile that
// stops carrying the pinned 11.3.0 Roller values fails the boot instead of
// silently falling back to a fixed-width stripe.
export function installRollerPaint(profile, rollerWeapon) {
  const roller = profile?.weaponsFidelityCompletion?.weapons?.roller;
  if (!roller) throw new Error('Roller paint: pinned completion table has no roller entry');
  const paint = roller.BodyParam?.PaintParam, roll = roller.WeaponRollParam;
  const speedMax = finite(paint?.SpeedMax, 'PaintParam.SpeedMax');
  const widthHalfMax = finite(paint?.WidthHalfMax, 'PaintParam.WidthHalfMax');
  const speedNormal = finite(roll?.SpeedNormal, 'WeaponRollParam.SpeedNormal');
  const speedDash = finite(roll?.SpeedDash, 'WeaponRollParam.SpeedDash');
  // SpeedMax is the dash speed in this table. If that stops holding, the
  // "maximum width at maximum speed" anchor below would be meaningless.
  if (Math.abs(speedDash - speedMax) > SPEED_TOLERANCE)
    throw new Error('Roller paint: PaintParam.SpeedMax differs from WeaponRollParam.SpeedDash');
  // The live weapon definition owns rollWidth: the maximum painted width stays
  // the upstream/#189 calibration instead of a second number kept in the profile.
  const weapon = rollerWeapon || profile.weapons?.roller;
  const dashWorld = finite(weapon?.rollSpeed, 'weapons.roller.rollSpeed');
  const normalWorld = finite(weapon?.rollBaseSpeed, 'weapons.roller.rollBaseSpeed');
  if (Math.abs(dashWorld - PER_FRAME_TO_PER_SECOND * speedMax) > SPEED_TOLERANCE ||
      Math.abs(normalWorld - PER_FRAME_TO_PER_SECOND * speedNormal) > SPEED_TOLERANCE)
    throw new Error('Roller paint: roll speeds do not match the pinned S3-to-world *60 conversion');
  const maxWidth = finite(weapon?.rollWidth, 'weapons.roller.rollWidth');
  if (maxWidth <= 0) throw new RangeError('Roller paint: rollWidth must be positive');
  reference = Object.freeze({ speedMax, widthHalfMax, speedNormal, dashWorld, maxWidth });
  return reference;
}

// Read-only view for regressions and diagnostics.
export function rollerPaintReference() { return reference; }

// 0 at a standstill, 1 at the pinned SpeedMax reference point (the 90F dash).
export function rollerPaintRatio(speed, weapon) {
  const max = reference ? reference.dashWorld : weapon?.rollSpeed;
  if (!Number.isFinite(max) || max <= 0) return 1;
  const s = Number.isFinite(speed) ? speed : 0;
  return s <= 0 ? 0 : s >= max ? 1 : s / max;
}

// Roller-body contact geometry. Deliberately speed independent: it is the only
// paint that may reach a wall, and #578 owns the contact width.
export function rollerBodyBand(weapon) {
  return { radius: BAND_RADIUS, step: weapon.rollWidth * 0.33 };
}

// Lateral distance of one side splash from the roll centre. It rests on the outer
// body band at a standstill and walks out to the maximum half width (WidthHalfMax,
// anchored on the existing w.rollWidth calibration) as roll speed reaches the
// pinned SpeedMax. Only the offset grows; the band radius is the native one, so a
// stopped roller adds no lateral reach at all.
export function rollerSideSplashOffset(speed, weapon) {
  const bodyEdge = rollerBodyBand(weapon).step;
  const maxHalf = (reference ? reference.maxWidth : weapon.rollWidth) * 0.5;
  return bodyEdge + (maxHalf - bodyEdge) * rollerPaintRatio(speed, weapon);
}

// Replaces the upstream fixed three-band roll paint. Deterministic for a given
// actor, weapon and speed; only the paint calls differ from upstream. The shared
// scratch vector is passed in so the hot loop keeps its single allocation.
export function rollerRollPaint(actor, weapon, speed, fx, fz, rx, rz, forward, scratch, paint) {
  const band = rollerBodyBand(weapon);
  let area = 0;
  for (let i = -1; i <= 1; i++) {
    const off = i * band.step;
    scratch.set(actor.pos.x + fx * 0.75 + rx * off, actor.pos.y + 0.35, actor.pos.z + fz * 0.75 + rz * off);
    area += paint.splat(scratch, band.radius, actor.team, { seed: Math.random(), kind: 'roll', stretch: forward });
  }
  if (rollerPaintRatio(speed, weapon) > 0) {
    const off = rollerSideSplashOffset(speed, weapon);
    for (const side of [-1, 1]) {
      const lateral = side * off;
      scratch.set(actor.pos.x + fx * 0.75 + rx * lateral, actor.pos.y + 0.35, actor.pos.z + fz * 0.75 + rz * lateral);
      area += paint.splat(scratch, band.radius, actor.team, { seed: Math.random(), kind: 'roll', stretch: forward, floorOnly: true });
    }
  }
  return area;
}