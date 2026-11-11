// Splattercolor Screen travel (11.3.0 WeaponSpChimney WallParam).
// StartUpFrame 60: the sheet holds still for 1 s after it spawns.
// TargetSpeedFrame 300: it then takes 5 s to reach MoveSpeed (Inkipedia:
// "it takes 1 second for the sheet to start moving, and 5 more seconds for
// the sheet to reach the full speed"). The ramp shape is not published; a
// linear ramp is assumed (unverified). RunningFrame 560 bounds the travel
// from the start of movement, as before.
export const SCREEN_START_FRAME = 60, SCREEN_RAMP_FRAME = 300, SCREEN_RUN_FRAME = 560;
const FPS = 60;
/** Distance travelled by `age` seconds after spawning, at full speed `speed` (units/s). */
export function screenTravel(age, speed) {
  const ramp = SCREEN_RAMP_FRAME / FPS, run = SCREEN_RUN_FRAME / FPS;
  const t = Math.min(run, Math.max(0, age - SCREEN_START_FRAME / FPS));
  return t <= ramp ? speed * t * t / (2 * ramp) : speed * (ramp / 2 + t - ramp);
}
/** Distance travelled between `age - dt` and `age`. */
export function screenStep(age, dt, speed) {
  return screenTravel(age, speed) - screenTravel(age - dt, speed);
}
