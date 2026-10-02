// Build-copy overlay, applied after the gameplay adapter. A completed touch tap
// must reach the same simulation tick that consumes keyboard/mouse press edges.
import { replaceOnce } from './input-adapter.mjs';

const INTENTS = {
  jump: "inp.wasPressed('Space') || inp.padPressed.has(0) || inp.down('Space') || inp.padButton(0)",
  squid: "inp.wasPressed('ShiftLeft') || inp.wasPressed('ShiftRight') || inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.padValue(6) > 0.3",
  fire: 'inp.mouse.leftPressed || inp.mouse.left || inp.padValue(7) > 0.3',
  sub: "inp.mouse.rightPressed || inp.wasPressed('KeyE') || inp.mouse.right || inp.down('KeyE') || inp.padButton(5)",
  special: "inp.wasPressed('KeyF') || inp.wasPressed('KeyQ') || inp.down('KeyF') || inp.down('KeyQ') || inp.padButton(3) || inp.padButton(11)",
};

export function adaptTouchEdges(rel, code) {
  if (rel === 'src/game/player.js') {
    for (const [id, desktop] of Object.entries(INTENTS)) {
      const before = `    it.${id} = ${desktop} || !!touch?.down('${id}');`;
      const after = `    it.${id} = ${desktop} || !!(touch?.down('${id}') || touch?.wasPressed('${id}'));`;
      code = replaceOnce(code, before, after, `touch ${id} press delivery`);
    }
  } else if (rel === 'src/core/input.js') {
    code = replaceOnce(code,
      '  endFrame() {\n    this.pressed.clear();',
      '  endFrame() {\n    // The fixed gameplay clock calls this after a simulation tick, never a render-only frame.\n    this.mobile?.endFrame();\n    this.pressed.clear();',
      'touch simulation tick consumption');
  }
  return code;
}
