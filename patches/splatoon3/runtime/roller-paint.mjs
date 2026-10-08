// Rolling turf footprint for the Splat Roller (#649).
//
// Splatoon 3 Ver. 11.3.0 (pinned) publishes two endpoints on the Splat Roller
// body and two on the roll weapon; all four already live in
// profile.weaponsFidelityCompletion.weapons.roller:
//   BodyParam.PaintParam.SpeedMax      = 0.132  reference maximum roll speed
//   BodyParam.PaintParam.WidthHalfMax  = 2.8    pinned maximum half width (source units)
//   WeaponRollParam.SpeedNormal        = 0.108  settled roll speed
//   WeaponRollParam.SpeedDash          = 0.132  90F dash roll speed
// profile.calibration.unitConversions.perFrameVelocityToPerSecond is "*60", and
// runtime/weapons-fidelity.mjs already evaluates projectile speed with that same
// factor, so rollSpeed (7.92) is exactly the world speed of SpeedMax and
// rollBaseSpeed (6.48) the world speed of SpeedNormal. installRollerPaint() READS
// that factor from the profile (it is not hard-coded here), parses it fail-closed
// and cross-checks it against the pinned table and the live roll speeds, so the
// speed ratio cannot silently drift away from the reference.
//
// The three body bands keep their upstream offsets and radius at every speed, so
// the roller body is still the only paint that can reach a wall. The
// speed-dependent lateral reach is a side splash, emitted floor-only, because
// Splatoon 3 paints walls with the roller body and the floor with the side
// splashes that grow with movement speed.
//
// Scale shape: SpeedMax and WidthHalfMax are pinned endpoints, not a recovered
// curve. The straight line between "no side splash" and "side splash at the
// existing rollWidth maximum" is a labelled minimal model in the same spirit as
// weapons-fidelity.mjs's `splatlingLaunchSpeed`; it is not a claim about
// recovered Nintendo code, and the absolute side-splash width stays uncalibrated
// until a real capture exists (#189 owns the absolute maximum).
//
// WidthHalfMax is source-unit data: the same BodyParam block carries
// CollisionParam.WidthHalf 1.4 / Radius 0.4, and the raw table publishes no
// source-to-world width conversion. It is therefore bound fail-closed as a
// present, finite pinned value only and is deliberately NOT compared against the
// world-unit rollWidth: such a comparison would enforce nothing and would refuse
// boot if the #189 calibration ever grew past 2 * WidthHalfMax. No width
// conversion is invented here; the anchored maximum stays the live rollWidth.

// Parses profile.calibration.unitConversions.perFrameVelocityToPerSecond (the
// project's existing speed normalisation, e.g. "*60") instead of assuming a
// literal factor.
function parsePerFrameVelocityFactor(conversion) {
  const match = typeof conversion === 'string' ? /^\*\s*(\d+(?:\.\d+)?)$/.exec(conversion.trim()) : null;
  if (!match) throw new Error('Roller paint: unsupported perFrameVelocityToPerSecond ' + JSON.stringify(conversion ?? null));
  const factor = Number(match[1]);
  if (!Number.isFinite(factor) || factor <= 0)
    throw new RangeError('Roller paint: non-positive perFrameVelocityToPerSecond factor');
  return factor;
}

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
  const perFrameToPerSecond = parsePerFrameVelocityFactor(profile?.calibration?.unitConversions?.perFrameVelocityToPerSecond);
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
  if (Math.abs(dashWorld - perFrameToPerSecond * speedMax) > SPEED_TOLERANCE ||
      Math.abs(normalWorld - perFrameToPerSecond * speedNormal) > SPEED_TOLERANCE)
    throw new Error(`Roller paint: roll speeds do not match the pinned S3-to-world *${perFrameToPerSecond} conversion`);
  const maxWidth = finite(weapon?.rollWidth, 'weapons.roller.rollWidth');
  if (maxWidth <= 0) throw new RangeError('Roller paint: rollWidth must be positive');
  // No world-vs-source width guard: WidthHalfMax has no published conversion, so
  // comparing it with rollWidth would be a cross-unit no-op (see the header).
  reference = Object.freeze({ speedMax, widthHalfMax, speedNormal, dashWorld, maxWidth, perFrameToPerSecond });
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
// body band at a standstill and walks out to half the existing rollWidth
// calibration as roll speed reaches the pinned SpeedMax. Only the offset grows;
// the band radius is the native one, so a stopped roller adds no lateral reach.
export function rollerSideSplashOffset(speed, weapon) {
  const bodyEdge = rollerBodyBand(weapon).step;
  const maxHalf = (reference ? reference.maxWidth : weapon.rollWidth) * 0.5;
  return bodyEdge + (maxHalf - bodyEdge) * rollerPaintRatio(speed, weapon);
}

// Replaces the upstream fixed three-band roll paint. Deterministic for a given
// actor, weapon, speed and seed source; only the paint calls differ from
// upstream. The shared scratch vector is passed in so the hot loop keeps its
// single allocation.
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
