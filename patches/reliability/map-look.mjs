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

export function adaptMapLook(rel, code) {
  if (rel !== 'src/game/player.js') return code;

  code = replaceOnce(code,
    '    if (inp.pad && !mapUp) {',
    '    if (inp.pad) {',
    'pad filter ownership');

  code = replaceOnce(code,
    `      if (_stick.mag > 0) lookActive = true;
      rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;
      rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;
    }`,
    `      // Turf Map owns presentation only: keep the gameplay filter synchronized
      // with current physical input, but suppress camera output until map close.
      if (!mapUp) {
        if (_stick.mag > 0) lookActive = true;
        rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;
        rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;
      }
    }`,
    'map camera output suppression');

  return code;
}
