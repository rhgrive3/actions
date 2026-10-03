// Build-copy input delivery, applied after the gameplay adapter. Existing raw
// edge sets belong to Input/MobileInput and are consumed by the fixed clock.
// Carry the physical jump edge through Actor: deriving it again from simulated
// holds loses release/repress sequences when no tick samples the release.
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
      const padEdges = { squid: [6], fire: [7], sub: [5], special: [3, 11] }[id] || [];
      const pad = padEdges.map(button => ` || inp.padPressed.has(${button})`).join('');
      const edge = id === 'jump' ? `\n    it.jumpPressed = inp.wasPressed('Space') || inp.padPressed.has(0) || !!touch?.wasPressed('jump');` : '';
      const after = `    it.${id} = ${desktop}${pad} || !!(touch?.down('${id}') || touch?.wasPressed('${id}'));${edge}`;
      code = replaceOnce(code, before, after, `touch ${id} press delivery`);
    }
    code = replaceOnce(code,
      '      it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false;',
      '      it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false;\n      it.jumpPressed = false;',
      'disabled controller drops physical jump edge');
  } else if (rel === 'src/game/actor.js') {
    code = replaceOnce(code,
      '    const jumpPressed = intent.jump && !prev.jump;',
      '    // Local input carries its physical edge. Bots/remote intent keep their native fallback.\n' +
      '    const jumpPressed = intent.jumpPressed ?? (intent.jump && !prev.jump);\n' +
      '    if (intent.jumpPressed !== undefined) intent.jumpPressed = false;',
      'consume physical jump edge once');
  } else if (rel === 'src/game/weapons.js') {
    code = replaceOnce(code,
      "a.form === 'squid' || this.aimingSub || !move",
      "a.form === 'squid' || this.aimingSub || a.intent.sub || !move",
      'current sub intent owns admission before runner update');
  } else if (rel === 'src/core/input.js') {
    code = replaceOnce(code,
      '  endFrame() {\n    this.pressed.clear();',
      '  endFrame() {\n    // The fixed gameplay clock calls this after a simulation tick, never a render-only frame.\n    this.mobile?.endFrame();\n    this.pressed.clear();',
      'touch simulation tick consumption');
  }
  return code;
}
