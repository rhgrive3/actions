// Build-only presentation-order corrections, applied to the finished local-quality output.
//
// Charger laser sight: the ribbon used to be placed only inside the 60 Hz gameplay tick (Projectiles._updateBeams),
// i.e. before the frame's camera update. In a rendered frame the order is
//   ticks (controller → computeAim with LAST frame's camera → actors → projectiles: sight placed)
//   → rig.update (camera moves to the new yaw/pitch) → computeAim (aimPoint follows the new camera) → render
// so the sight was always drawn toward the previous frame's crosshair, and on frames without a tick (120 Hz
// displays, frame-cap leftovers) it was not refreshed at all while the camera kept moving. The sight placement is
// now one method, and the frame re-places every visible sight right after the final computeAim, from the same muzzle
// and _aimFrom() ray the shot itself uses. Visibility, charge, pooling and the 60 Hz gameplay state are unchanged.
function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) throw new Error(`INKWAVE quality patch conflict (${label}): expected exactly one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const SIGHT_START = '        const m = this._muzzle(a, _v.set(0, 0, 0));\n        const dir = this._aimFrom(a, m, _dir);\n        const w = a.weapon;\n        const ch = a.weaponRunner.charge;\n';
const SIGHT_END = '        s.visible = true;\n';

export function adaptFrameOrder(rel, code) {
  if (rel === 'src/game/weapons.js') {
    const at = code.indexOf(SIGHT_START), end = code.indexOf(SIGHT_END, at);
    if (at < 0 || end < 0 || code.indexOf(SIGHT_START, at + 1) >= 0) throw new Error('INKWAVE quality patch conflict (charger sight placement): expected exactly one connection');
    const body = code.slice(at, end + SIGHT_END.length);
    code = code.slice(0, at) + '        this._placeSight(a, s);\n' + code.slice(end + SIGHT_END.length);
    const method = body.split('\n').map((line) => line.startsWith('    ') ? line.slice(4) : line).join('\n');
    code = "import { syncChargerSights } from '../../patches/local-quality/charger-sight.mjs';\n" + code;
    return replaceOnce(code,
      '  // bomb/special throw arc preview (local player holding the sub button)\n',
      '  // one charger sight from the actor\'s current muzzle toward its current aim point (the shot\'s own ray)\n' +
      '  _placeSight(a, s) {\n' + method + '  }\n\n' +
      '  // presentation: re-place every visible sight after the frame\'s final camera + aim update\n' +
      '  syncSights() { syncChargerSights(this); }\n\n' +
      '  // bomb/special throw arc preview (local player holding the sub button)\n',
      'charger sight presentation method');
  }
  if (rel === 'src/main.js') {
    return replaceOnce(code,
      "      if (m && m.controller && m.state === 'playing') m.controller.computeAim?.();\n",
      "      if (m && m.controller && m.state === 'playing') m.controller.computeAim?.();\n" +
      "      // charger sights follow this frame's camera/aim, not the tick's (camera → aim → sight → render)\n" +
      '      if (!m || !m.paused) G.projectiles.syncSights?.();\n',
      'charger sight frame order');
  }
  return code;
}
