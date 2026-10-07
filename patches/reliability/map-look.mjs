// #579 — keep the gamepad look filter current while the Turf Map owns the camera.
// Raw inkwave-public stays immutable; this build adapter only changes ownership
// of the already-existing filter update. While mapUp is true, the right stick,
// padLook and edgeT continue to track the physical pad, but no gameplay camera
// yaw/pitch is emitted. Closing the map therefore cannot replay stale turn state.

const replaceOnce = (code, before, after, label) => {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE reliability patch conflict (map look: ${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
};

const replaceVariantOnce = (code, variants, label) => {
  const found = variants.filter(({ before }) => {
    const at = code.indexOf(before);
    return at >= 0 && code.indexOf(before, at + before.length) < 0;
  });
  if (found.length !== 1) {
    throw new Error(`INKWAVE reliability patch conflict (map look: ${label}): expected exactly one composed connection`);
  }
  return replaceOnce(code, found[0].before, found[0].after, label);
};

export function adaptMapLook(rel, code) {
  if (rel !== 'src/game/player.js') return code;

  code = replaceVariantOnce(code, [
    {
      before: '    if (usingPad && !mapUp) {',
      after: '    if (usingPad) {',
    },
    {
      before: '    if (inp.pad && !mapUp) {',
      after: '    if (inp.pad) {',
    },
  ], 'pad filter ownership');

  code = replaceOnce(code,
    '      if (_stick.mag > 0) lookActive = true;',
    '      if (!mapUp && _stick.mag > 0) lookActive = true;',
    'look activity suppression');

  code = replaceVariantOnce(code, [
    {
      before: '      rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt * (s.padInvertX ? -1 : 1);',
      after: '      if (!mapUp) rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt * (s.padInvertX ? -1 : 1);',
    },
    {
      before: '      rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;',
      after: '      if (!mapUp) rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;',
    },
  ], 'map yaw suppression');

  code = replaceVariantOnce(code, [
    {
      before: '      if (!gyroActive) rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;',
      after: '      if (!mapUp && !gyroActive) rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;',
    },
    {
      before: '      rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;',
      after: '      if (!mapUp) rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;',
    },
  ], 'map pitch suppression');

  return code;
}
