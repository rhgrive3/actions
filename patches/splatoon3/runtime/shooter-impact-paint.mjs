// S3 Splattershot (WeaponShooterNormal) floor impact paint (#79).
//
// Source: Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json
// (SHA-256 dfca9f45…cb9, checked against reference/curated-numbers.json), section
// GameParameters.PaintParam (spl__BulletShooterPaintParam):
//   WidthHalfNear 1.93, WidthHalfMiddle 1.93, WidthHalfFar 1.71, DistanceMiddle 1.1,
//   DepthScaleMax 2.24, DepthScaleMin 1.31, DepthScaleMaxBreakFree 2.24, DepthScaleMinBreakFree 1.12.
//
// Sparse weapon rows omit schema defaults. The independently catalogued
// spl__BulletShooterPaintParam default table defines DistanceNear=1.1,
// DistanceFar=20 and DegreeUseDepthScaleMax/Min=10/35 degrees:
// https://splatoonwiki.org/wiki/Template:Shooter_data_S3
// These are internal-paramtable defaults, not film measurements or values
// fabricated by looking at INKWAVE's silhouette.
// Still unverified: detailed BreakFree HEIGHT selector and retail renderer
// texture. Phase 0 selects straight; 1/2 use the matching BreakFree fields.
// Wall impacts are not handled here. The caller only applies this to floor contacts.
import { rollerImpactAngleDegrees } from './roller-impact-paint.mjs';
import { SOURCE_SHOT_PAINT_KIND } from './source-shot-footprint.mjs';

/** Floor contact threshold; the same normal.y >= 0.4 gate used by the Shooter nearest splash. */
export const SHOOTER_FLOOR_NORMAL_Y = 0.4;
export const SHOOTER_PARAMTABLE_DEFAULTS = Object.freeze({
  distanceNear: 1.1, distanceFar: 20,
  degreeUseDepthScaleMax: 10, degreeUseDepthScaleMin: 35,
});
const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;

/** Floor-width half radius (world units) from the sourced near / middle / far bands. */
export function shooterImpactRadius(weapon, projectile, hitPoint) {
  const paint = weapon?.impactPaint;
  if (!paint || !projectile?.start || !hitPoint) return null;
  const distance = projectile.start.distanceTo(hitPoint);
  if (!(distance >= 0)) return null;
  const near = paint.distanceNear ?? SHOOTER_PARAMTABLE_DEFAULTS.distanceNear;
  const middle = paint.distanceMiddle;
  const far = paint.distanceFar ?? SHOOTER_PARAMTABLE_DEFAULTS.distanceFar;
  if (![near, middle, far].every(Number.isFinite) || near < 0 || middle < near || far <= middle) return null;
  if (distance <= near) return paint.widthNear;
  if (distance < middle && middle > near)
    return lerp(paint.widthNear, paint.widthMiddle, clamp01((distance - near) / (middle - near)));
  return lerp(paint.widthMiddle, paint.widthFar, clamp01((distance - middle) / (far - middle)));
}

/** Depth scale (elongation) from the impact angle; grazing impacts use the Max envelope. */
export function shooterImpactDepthScale(weapon, projectile, normal) {
  const paint = weapon?.impactPaint;
  const angle = rollerImpactAngleDegrees(projectile?.vel, normal);
  if (!paint || angle === null) return null;
  // Source-guided InkFlight has its own 60Hz phase; never silently pin it
  // to straight-state when only fidelityPhase (generic projectile) is absent.
  const phase = projectile?.inkProfile ? projectile.inkPhase : projectile?.fidelityPhase;
  const straight = (phase ?? 0) === 0;
  const max = straight ? paint.depthMax : paint.depthMaxBreakFree;
  const min = straight ? paint.depthMin : paint.depthMinBreakFree;
  const lo = paint.degreeUseDepthScaleMax ?? SHOOTER_PARAMTABLE_DEFAULTS.degreeUseDepthScaleMax;
  const hi = paint.degreeUseDepthScaleMin ?? SHOOTER_PARAMTABLE_DEFAULTS.degreeUseDepthScaleMin;
  if (!(hi > lo)) return null;
  return lerp(max, min, clamp01((angle - lo) / (hi - lo)));
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
    return native.call(this, point, radius, team, { ...opts, kind: SOURCE_SHOT_PAINT_KIND, stretchAmt: Math.max(0, depth - 1) });
  };
  try { return callback(); } finally { paint.splat = native; }
}
