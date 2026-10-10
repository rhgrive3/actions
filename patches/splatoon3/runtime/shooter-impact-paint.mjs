// S3 Splattershot (WeaponShooterNormal) floor impact paint (#79).
//
// Source: Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json
// (SHA-256 dfca9f45…cb9, checked against reference/curated-numbers.json), section
// GameParameters.PaintParam (spl__BulletShooterPaintParam):
//   WidthHalfNear 1.93, WidthHalfMiddle 1.93, WidthHalfFar 1.71, DistanceMiddle 1.1,
//   DepthScaleMax 2.24, DepthScaleMin 1.31, DepthScaleMaxBreakFree 2.24, DepthScaleMinBreakFree 1.12.
//
// Values that the record does NOT provide are provisional and stay 未確認:
//  * Far-band anchor. The record has no far distance; INKWAVE uses the weapon's own
//    range as the far end of the Middle->Far interpolation.
//  * Impact-angle thresholds. The record has no DegreeUse* fields. The Splat Roller
//    schema defaults (10 / 35 degrees, see roller-impact-paint.mjs #674) are used
//    provisionally. They are not validated for Shooter.
//  * Phase mapping. Phase 0 (straight) selects the straight envelope and phases 1/2
//    select BreakFree, following the Roller convention of #611. Not validated for Shooter.
// Wall impacts are not handled here. The caller only applies this to floor contacts.
import { rollerImpactAngleDegrees } from './roller-impact-paint.mjs';

/** Floor contact threshold; the same normal.y >= 0.4 gate used by the Shooter nearest splash. */
export const SHOOTER_FLOOR_NORMAL_Y = 0.4;
const PROVISIONAL_DEGREE_MAX = 10;
const PROVISIONAL_DEGREE_MIN = 35;
const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;

/** Floor-width half radius (world units) from the sourced near / middle / far bands. */
export function shooterImpactRadius(weapon, projectile, hitPoint) {
  const paint = weapon?.impactPaint;
  if (!paint || !projectile?.start || !hitPoint) return null;
  const distance = projectile.start.distanceTo(hitPoint);
  if (!(distance >= 0)) return null;
  if (distance <= paint.distanceMiddle) return paint.widthNear;
  const far = weapon.range;
  if (!(far > paint.distanceMiddle)) return paint.widthFar;
  return lerp(paint.widthMiddle, paint.widthFar, clamp01((distance - paint.distanceMiddle) / (far - paint.distanceMiddle)));
}

/** Depth scale (elongation) from the impact angle; grazing impacts use the Max envelope. */
export function shooterImpactDepthScale(weapon, projectile, normal) {
  const paint = weapon?.impactPaint;
  const angle = rollerImpactAngleDegrees(projectile?.vel, normal);
  if (!paint || angle === null) return null;
  const straight = (projectile.fidelityPhase ?? 0) === 0;
  const max = straight ? paint.depthMax : paint.depthMaxBreakFree;
  const min = straight ? paint.depthMin : paint.depthMinBreakFree;
  return lerp(max, min, clamp01((angle - PROVISIONAL_DEGREE_MAX) / (PROVISIONAL_DEGREE_MIN - PROVISIONAL_DEGREE_MAX)));
}

/**
 * Run the existing impact path while replacing only its first gameplay splat, as
 * withRollerImpactPaint does. Native FX, audio, events and the Math.random draw
 * order are preserved. The footprint is deterministic, so the native 0.85..1.15
 * radius jitter no longer changes the gameplay area.
 */
export function withShooterImpactPaint(game, projectile, hit, weapon, callback) {
  const radius = shooterImpactRadius(weapon, projectile, hit?.point);
  const depth = shooterImpactDepthScale(weapon, projectile, hit?.normal);
  const paint = game?.paint;
  if (!(radius > 0) || !(depth > 0) || typeof paint?.splat !== 'function') return callback();
  const native = paint.splat;
  let replaced = false;
  paint.splat = function (point, nativeRadius, team, opts = {}) {
    if (replaced) return native.call(this, point, nativeRadius, team, opts);
    replaced = true;
    return native.call(this, point, radius, team, { ...opts, stretchAmt: Math.max(0, depth - 1) });
  };
  try { return callback(); } finally { paint.splat = native; }
}
