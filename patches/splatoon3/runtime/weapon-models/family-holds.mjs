// Behaviour-family hold calibration, applied over the native HOLD entry and
// every per-model override (registry weaponHold), so per-weapon offsets keep
// their relative tuning. Values are INKWAVE kid-space metres, read from the
// official Nintendo weapon movies by eye, not extracted retail joint data:
//   shooter: y7Zl26Zl12n 8.4-11.1 s - the Splattershot fires from the right
//            cheek, elbows bent, the gun pulled in beside the face; INKWAVE held
//            it at the chest with the arms almost straight.
//   blaster: 3RVDozgk6XQ 0.5-6.5 s - the Blaster's rear reservoir sits beside
//            the cheek, the barrel level with the eyes.
// Moving the aim pose moves the rendered muzzle, which is where INKWAVE spawns
// shots. See reports/inkwave-weapon-hold-motion-2026-10-17.md.
export const FAMILY_HOLD_SHIFT = Object.freeze({
  shooter: Object.freeze({ aim: Object.freeze([-0.15, 0.12, -0.09]) }),
  blaster: Object.freeze({ aim: Object.freeze([-0.14, 0.1, -0.06]) }),
});

/** A copy of `hold` with each listed pose position shifted (rotations untouched). */
export function shiftHold(hold, shift) {
  const out = { ...hold };
  for (const [pose, d] of Object.entries(shift)) {
    const h = hold[pose];
    if (!h?.p) continue;
    out[pose] = { ...h, p: [h.p[0] + d[0], h.p[1] + d[1], h.p[2] + d[2]] };
  }
  return out;
}

// Model size per behaviour family, about the right-hand grip (kit.mjs scaleWeaponDef).
// 2026-10-17 owner review: shooters, dualies and brushes read about 30% too small
// against the official movies. The muzzle scales with the model, so shot spawn
// points move outward with it (reports/inkwave-weapon-hold-motion-2026-10-17.md).
export const FAMILY_MODEL_SCALE = Object.freeze({ shooter: 1.3, dualies: 1.3, brush: 1.3 });
