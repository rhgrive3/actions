// Heavy (MainWeaponSetting.WeaponSpeedType "Slow") Roller swing shape, read
// from Nintendo's official Dynamo-type horizontal-swing clip rpGkB4xjYXg
// (60 fps; front and side views, frames ~390-492 and ~282-363): the drum is
// lifted and laid level overhead within ~18-24F, HELD there, slammed down in
// <=3F so the ink leaves as the drum meets the floor in front, rests there
// ~20F, and is lifted back to the carry in ~10F. The 21F-calibrated Splat
// Roller spline stretched over 45F/55F instead coiled for 65% of the windup and
// whipped for ~16F, releasing ink with the drum still at chest height.
// Frame counts are read from the clip; the weapon version, gear and input frame
// of the clip are unknown, and the vertical swing reuses this shape unverified.
export const HEAVY_ROLLER_SWING = Object.freeze({ coilAt: 22 / 60, whip: 3 / 60, rest: 20 / 60, ret: 10 / 60,
  source: 'official clip rpGkB4xjYXg (Dynamo-type horizontal swing); vertical shape inferred' });
/** Presentation length of a heavy swing: its rest and return outlast the gameplay interval. */
export function heavyRollerSwingEnd(windup, interval) {
  const H = HEAVY_ROLLER_SWING, release = Math.max(1e-6, windup);
  return Math.max(release + H.rest, interval) + H.ret;
}
