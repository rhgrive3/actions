import { replaceOnce } from './input-adapter.mjs';

// One map lifetime for touch, keyboard and both pad mappings. Run after the
// navigation adapters so dead-time target selection reads the same latch.
export function adaptMapToggle(rel, code) {
  const patch = (before, after, label) => { code = replaceOnce(code, before, after, 'map toggle: ' + label); };
  if (rel === 'src/core/input.js') {
    patch("      if (!touchContact) this.lastDevice = 'kbm';\n      if (this.onKey && this.onKey(e, false)) return;",
      "      this._mapToggleKey = e.code === 'Tab' || e.code === 'KeyM';\n      if (!touchContact) this.lastDevice = 'kbm';\n      this._mapToggleKey = false;\n      if (this.onKey && this.onKey(e, false)) return;", 'recognize map key before device acquisition');
    patch("if (this.navigationDevice !== priorNavigationDevice && this.navigationDevice !== 'touch' && this.mobile?.mapOpen) this.mobile.setMap(false);",
      "if (priorNavigationDevice === 'touch' && this.navigationDevice !== 'touch' && this.mobile?.mapOpen && this.mobile._mapOwner === 'touch' && !this._mapToggleKey && !this.padPressed.has(this.pad?.mapping === 'standard' ? 3 : 8)) this.mobile.setMap(false);", 'handoff does not double-toggle an explicit map edge');
  }
  if (rel === 'src/core/mobile.js') {
    patch('    this.mapOpen = !!open;', '    this.mapOpen = !!open;\n    this.onMapChange?.(this.mapOpen);', 'notify gameplay before releasing pointers');
  }
  if (rel === 'src/main.js') {
    patch("if (e.code === 'Escape' || e.code === 'KeyP') { this.pause(); return true; }",
      "if (e.code === 'Escape' && this.match?.controller?.mapHeld) { this.match.controller.setTurfMap(false); return true; }\n      if (e.code === 'Escape' || e.code === 'KeyP') { this.pause(); return true; }", 'Escape closes map first');
    patch('if (this.match?.controller) this.match.controller.padMapOpen = false;',
      'this.match?.controller?.setTurfMap(false);', 'successful jump closes shared map');
  }
  if (rel === 'src/ui/menus.js') {
    patch("mode === 'pad' && standardPad ? 'toggle' : 'hold'", "'toggle'", 'control guide');
  }
  if (rel === 'src/ui/hud.js') {
    code = code.replaceAll('release [TAB] to cancel', 'press [TAB] or [M] to close');
  }
  if (rel !== 'src/game/player.js') return code;
  patch('    this.mapHeld = false;', '    this.mapHeld = false;\n    if (input?.mobile) input.mobile.onMapChange = open => (G.match?.controller?.input === input ? G.match.controller : this).setTurfMap(open);', 'touch shares controller latch');
  patch('    if (this.updateRespawnNavigation()) return;', '    this.updateMapInput();\n    if (this.updateRespawnNavigation()) return;', 'map edge before navigation');
  patch(`    if (!standardPad) this.padMapOpen = false;
    if (standardPad && inp.padPressed.has(3)) { this.padMapOpen = !this.padMapOpen; inp.padPressed.delete(3); }
    const padMap = standardPad ? !!this.padMapOpen : inp.padButton(8);`, '', 'retire live pad latch');
  patch("(G.rig?.mapK ?? 0) > 0.05 || inp.down('Tab') || inp.down('KeyM') || padMap || !!touch?.mapOpen",
    '(G.rig?.mapK ?? 0) > 0.05 || this.mapHeld', 'camera follows latch');
  patch("    this.mapHeld = inp.down('Tab') || inp.down('KeyM') || padMap || !!touch?.mapOpen;", '', 'retain shared state');
  patch(`      // Map clicks belong to the selection UI; an independent ZR remains a real hold.
      it.fire = inp.padValue(7) > 0.3 || inp.padPressed.has(7); it.sub = false;`,
    '      this.cancelForMapTakeover();\n      it.fire = it.sub = false;', 'all map gameplay holds cancelled');
  patch(`    const inp = this.input;
    const touch = inp.mobile?.active && inp.mobile.root ? inp.mobile : null;
    return !!(inp.down('Tab') || inp.down('KeyM') ||
      (inp.lastDevice === 'pad' && (inp.pad?.mapping === 'standard' ? this.padMapOpen : inp.padButton(8))) || touch?.mapOpen);`,
    '    return this.mapHeld;', 'dead navigation shares latch');
  patch(`    if (this._respawnNavigationActive || !a.alive) {
      if (!standard) this.padMapOpen = false;
      if (standard && inp.padPressed.has(3)) { this.padMapOpen = !this.padMapOpen; inp.padPressed.delete(3); }
    }`, '', 'consume each pad edge once');
  patch('  respawnMapOpen() {', `${METHODS}\n  respawnMapOpen() {`, 'shared transitions');
  return "import { cancelMapGameplay } from '../../patches/reliability/menu-takeover.mjs';\n" + code;
}

const METHODS = `  cancelForMapTakeover() { cancelMapGameplay(this); }

  setTurfMap(open, owner = this.input.navigationDevice) {
    open = !!open;
    if (this.mapHeld === open) return;
    // Pin contacts belong to one map lifetime, even when close/reopen happens
    // before the diorama receives another presentation frame.
    this._turfMapEpoch = (this._turfMapEpoch ?? 0) + 1;
    // A UI takeover is cancellation, including open/close within one tick.
    this.cancelForMapTakeover();
    this.mapHeld = this.padMapOpen = open;
    if (this.input.mobile) this.input.mobile._mapOwner = open ? owner : null;
    this.input.mobile?.setMap(open);
    if (!open) { this.pendingRespawnJump = null; this.padJumpTarget = null; this.padJumpIndex = -1; }
  }

  updateMapInput() {
    const inp = this.input;
    if (this.menuBlocked || this.navigationEnabled === false || (!this.enabled && !this.navigationEnabled)) {
      this.setTurfMap(false); return;
    }
    const button = inp.pad?.mapping === 'standard' ? 3 : 8;
    const keyboard = inp.wasPressed('Tab') || inp.wasPressed('KeyM');
    const toggle = keyboard || inp.padPressed.has(button);
    const cancel = this.mapHeld && inp.pad?.mapping === 'standard' && inp.padPressed.has(0);
    if (toggle || cancel) {
      inp.pressed.delete('Tab'); inp.pressed.delete('KeyM'); inp.padPressed.delete(button);
      if (cancel) inp.consumePadMenuButton?.(0);
      this.setTurfMap(cancel ? false : !this.mapHeld, keyboard ? 'kbm' : 'pad');
    }
  }
`;
