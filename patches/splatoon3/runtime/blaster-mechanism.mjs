// S3 Blaster per-shot mechanism (#915) — pure calibration and cycle topology.
// Splatoon 3's appearance notes for the standard Blaster describe two weapon
// animations that occur WITH EVERY SHOT: the left-side lever pulls downward and
// the centre spring throws the front section forward
// (https://splatoonwiki.org/wiki/Blaster, read 2026-10-07). Nintendo does not
// publish the joint curves, so every number below is this rig's explicitly
// internal calibration and is never claimed as Switch frame data — the verified
// requirement is the topology: one lever-down cycle plus one spring-front-
// forward cycle per ACTUAL emitted shot, recovered before the next 50F shot,
// independent of generic whole-weapon recoil.
//
// This module stays free of engine imports: it is loaded natively by tests and
// by runtime/weapon-detail-motion.mjs. The part channels themselves are added
// by runtime/blaster-mechanism-model.mjs through the character-weapons adapter.
// Gameplay (timing, damage, ink, movement, projectiles) is untouched here.

export const BLASTER_MECHANISM = Object.freeze({
  // Internal rig calibration (seconds since the actual emission / radians /
  // weapon units). Cadence reference: standard Blaster fireInterval = 50F.
  leverPeak: 0.55,   // left paddle rotates this far DOWN about the forward axis
  frontPeak: 0.014,  // collar slides this far toward the muzzle (spring throw)
  lever: Object.freeze({ rise0: 0.017, rise1: 0.067, hold: 0.117, fall: 0.30 }),
  front: Object.freeze({ rise0: 0.008, rise1: 0.050, hold: 0.100, fall: 0.26 }),
  settle: 0.30, // owned age expires here; both channels are exact zero before the next shot
});

/** One rest → peak → rest cycle as a pure function of the emission-owned age.
 *  Returns exactly 0 outside (0, fall) so repeats never accumulate offsets. */
export function blasterMechanismCycle(age, { rise0, rise1, hold, fall }) {
  if (!(age > 0) || age >= fall) return 0;
  if (age < rise0) return 0;
  if (age < rise1) { const x = (age - rise0) / (rise1 - rise0); return x * x * (3 - 2 * x); }
  if (age < hold) return 1;
  const x = (age - hold) / (fall - hold);
  return 1 - x * x * (3 - 2 * x);
}
