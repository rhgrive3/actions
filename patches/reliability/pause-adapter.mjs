// Menu routing has its own physical pad edges; gameplay edges survive render-only frames.
import { replaceOnce } from './input-adapter.mjs';

export function adaptPause(rel, code) {
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '    this.padPressed = new Set();',
      '    this.padPressed = new Set();\n    this.padMenuPressed = new Set();\n    this.padMenuBlocked = new Set();', 'pause menu pad edge channel');
    code = replaceOnce(code, '      this.padPressed.clear();',
      '      this.padPressed.clear(); this.padMenuPressed.clear();', 'blur menu pad edges');
    code = replaceOnce(code, '    this.pad = pad;\n    this.padPressed.clear();',
      '    this.pad = pad;\n    this.padPressed.clear();\n    this.padMenuPressed.clear();', 'fresh menu pad edges');
    code = replaceOnce(code, "      if (b.pressed && !was) { this.padPressed.add(i); this.lastDevice = 'pad'; }",
      "      if (!b.pressed) this.padMenuBlocked.delete(i);\n      if (b.pressed && !was) { this.padPressed.add(i); this.padMenuPressed.add(i); this.lastDevice = 'pad'; }", 'deliver physical menu pad edge');
    code = replaceOnce(code, '    if (!pad) { this.padPrev = []; return; }',
      '    if (!pad) { this.padPrev = []; this.padMenuBlocked.clear(); return; }', 'disconnect menu button ownership');
    code = replaceOnce(code, '  padButton(i) { return !!(this.pad && this.pad.buttons[i] && this.pad.buttons[i].pressed); }',
      '  consumePadMenuButton(i) { this.padPressed.delete(i); this.padMenuBlocked.add(i); }\n  padButton(i) { return !this.padMenuBlocked.has(i) && !!(this.pad && this.pad.buttons[i] && this.pad.buttons[i].pressed); }', 'mask menu-owned pad holds');
    code = replaceOnce(code, '  padValue(i) { return this.pad && this.pad.buttons[i] ? this.pad.buttons[i].value : 0; }',
      '  padValue(i) { return !this.padMenuBlocked.has(i) && this.pad && this.pad.buttons[i] ? this.pad.buttons[i].value : 0; }', 'mask menu-owned pad values');
  } else if (rel === 'src/main.js') {
    code = replaceOnce(code, '      if (this.match.controller) this.match.controller.enabled = false;',
      '      if (this.match.controller) { this.match.controller.cancelForMenuTakeover?.(); this.match.controller.menuBlocked = true; this.match.controller.enabled = false; }', 'online pause input ownership');
    code = replaceOnce(code, '    if (this.match.controller) this.match.controller.enabled = true;',
      '    if (this.match.controller) { this.match.controller.menuBlocked = false; this.match.controller.enabled = true; }', 'resume input ownership');
    code = replaceOnce(code, '    const pp = inp.padPressed;',
      '    const pp = new Set(inp.padMenuPressed);\n    inp.padMenuPressed.clear();', 'consume menu pad presses independently');
    code = replaceOnce(code, '      const nav = (d) => this.menus.nav?.(d);',
      '      // A routed menu press owns both its edge and hold until physical release.\n      for (const i of [0, 1, 2, 4, 5, 12, 13, 14, 15]) if (pp.has(i)) inp.consumePadMenuButton(i);\n      const nav = (d) => this.menus.nav?.(d);', 'consume menu-owned gameplay edges');
  } else if (rel === 'src/game/player.js') {
    if (code.includes('const menuGameplayUpdate =')) throw new Error('pause adapter conflict: already installed');
    code = replaceOnce(code, 'export class PlayerController {', 'export class PlayerController {', 'menu takeover controller');
    code = "import { cancelMenuGameplay, rearmMenuGameplay } from '../../patches/reliability/menu-takeover.mjs';\n" + code;
    code += `
const menuGameplayUpdate = PlayerController.prototype.update;
PlayerController.prototype.cancelForMenuTakeover = function () { cancelMenuGameplay(this); };
PlayerController.prototype.update = function (...args) {
  try { return menuGameplayUpdate.apply(this,args); }
  finally { rearmMenuGameplay(this); }
};
`;
  } else if (rel === 'src/game/match.js') {
    code = replaceOnce(code, "    this.controller.enabled = this.state === 'playing' && !this.paused && this.local.alive;",
      "    this.controller.enabled = this.state === 'playing' && !this.paused && this.local.alive && !this.controller.menuBlocked;", 'persistent local menu input suppression');
  }
  return code;
}
