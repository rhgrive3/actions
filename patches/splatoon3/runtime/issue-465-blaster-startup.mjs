// Issue #465 — Splatoon 3 Ver. 11.3.0 Blaster form-specific first-shot startup.
// Reference (Inkipedia — Blaster / Hot Blaster, current Splatoon 3 data):
//   humanoid -> first shot: 14f
//   swim form -> first shot: 24f
//   sustained repeat interval: 50f (unchanged; carried by profile fireInterval)
//   firing -> ability to swim / use sub: 22f (owned separately by #214, untouched)
// The active profile `preDelay` (10/60 s) is only the between-shot wind-up; it is
// NOT the complete first-shot startup. This module supplies the form-specific
// admission so the projectile/recoil release lands on the 14f / 24f boundaries
// instead of the internal 10f timer.
//
// Deliberately narrow:
//   - Does NOT change PLAYER.emergeDelay (the generic swim gate, #311).
//   - Does NOT touch the 22f post-shot swim/sub lock (#214): startup and recovery
//     remain independent timers.
//   - Applies only to the Blaster; shooter / slosher / charger / roller startup
//     paths are not routed through here.

// S3 Blaster first-shot startup expressed in seconds at the fixed 60 Hz step.
export const S3_BLASTER_HUMANOID_STARTUP_S = 14 / 60;
export const S3_BLASTER_SWIM_STARTUP_S = 24 / 60;

// Returns the wind-up duration (seconds) to hold before admitting the next
// Blaster shot, given the actor state at the admission tick:
//   - Just-emerged (swim) admission: the ZR edge is what triggered the emerge,
//     so `a.kidT` already counts the fixed steps elapsed since that edge. Only
//     the remainder of the 24f swim startup is left to wait.
//   - Humanoid fresh edge (`firePressed`): the full 14f raise from the tick the
//     trigger is first admitted.
//   - Sustained repeat (trigger held through cooldown): the profile `preDelay`
//     wind-up inside the unchanged 50f cadence.
// Returns > 0 in every branch so the runner can never deadlock on a zero timer.
export function blasterStartupWindup(a, firePressed, dt, emergeDelay, preDelay) {
  const kidT = a.kidT;
  // The emerge gate (`kidT >= emergeDelay`) first opens within one fixed step of
  // `emergeDelay`; a fresh swim press is admitted on exactly that tick, so a
  // `kidT` still pinned at the gate identifies a shot that began in swim form.
  if (kidT <= emergeDelay + dt) return Math.max(dt, S3_BLASTER_SWIM_STARTUP_S - kidT);
  if (firePressed) return S3_BLASTER_HUMANOID_STARTUP_S;
  return preDelay;
}
