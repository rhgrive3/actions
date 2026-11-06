// Owner request 2026-11-05: no blast-radius forecast for bombs. The ground
// ring sized to the blast radius under an armed bomb (fx.dangerRing, every
// frame) and the matching ground ring on each fuse beep are removed. The
// bomb's own beep glow (the flashing body) stays. Gameplay, fuse, sound and
// explosion are unchanged. Applied to the final composed fxHooks.js text.
export function adaptBombBlastForecast(rel, code, replaceOnce) {
  if (rel !== 'src/fx/fxHooks.js') return code;
  code = replaceOnce(code,
    '        if (near && r.ground) fx.dangerRing?.(_v.copy(r.gp).addScaledVector(r.gn, 0.02), r.gn, col, R, k);\n',
    '', 'no bomb blast-radius ring');
  return replaceOnce(code,
    "fx.beepPulse?.(b.pos, r.ground ? r.gp : null, r.gn, col, R, k);",
    "fx.beepPulse?.(b.pos, null, r.gn, col, R, k);",
    'no blast-radius ring on fuse beeps');
}
