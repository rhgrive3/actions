// Apply after canonical press delivery. Keep physical buttons / menu routing
// intact; only the gameplay consumer maps W3C standard positions to S3 actions.
import { replaceOnce } from './input-adapter.mjs';
export function adaptControls(rel, code) {
  if (rel === 'src/config.js') return replaceOnce(code, '  padSensitivity: 1.0,', '  padSensitivity: 1.0,\n  padInvertX: false,', 'right-stick horizontal inversion default');
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code, "    { key: 'invertY',", "    { key: 'padInvertX', label: 'Invert right-stick horizontal look', type: 'toggle', help: 'Reverse controller left/right look only. Mouse, touch and gyro are unchanged.' },\n    { key: 'invertY',", 'right-stick horizontal inversion setting');
    code = replaceOnce(code, "    const rows = [\n      ['Move',", "    const standardPad = (G.input?.pad?.mapping ?? 'standard') === 'standard';\n    const rows = [\n      ['Move',", 'controller guide mapping');
    code = replaceOnce(code, "['Special', null, K('F', 'or', 'Q'), padGlyph('Y'), T('SP button')]", "['Special', null, K('F', 'or', 'Q'), standardPad ? T('Right stick · press') : padGlyph('Y'), T('SP button')]", 'special control guide');
    code = replaceOnce(code, "['Map', 'hold', K('TAB'), padGlyph('View'), T('MAP button')]", "['Map', mode === 'pad' && standardPad ? 'toggle' : 'hold', K('TAB'), standardPad ? T('Top face · X on Nintendo') : padGlyph('View'), T('MAP button')]", 'map control guide');
    return replaceOnce(code, "    const list = compact ? rows.filter", "    if (mode === 'pad' && standardPad) rows.push(['Camera reset', null, '', T('Left face · Y on Nintendo'), '']);\n    const list = compact ? rows.filter", 'camera reset control guide');
  }
  if (rel === 'src/main.js') return replaceOnce(code, "if (actor?.isLocal && phase === 'charge') this.input.mobile?.setMap(false);", "if (actor?.isLocal && phase === 'charge') { if (this.match?.controller) this.match.controller.padMapOpen = false; this.input.mobile?.setMap(false); }", 'successful jump closes pad map');
  if (rel !== 'src/game/player.js') return code;
  // invertY is the persisted per-profile Right Stick option, not a global camera sign.
  code = replaceOnce(code, 'rig.pitch -= mdy * sens * inv;', 'rig.pitch -= mdy * sens;', 'mouse excludes right-stick vertical inversion');
  code = replaceOnce(code, 'rig.pitch -= touch.lookDY * friction * inv;', 'rig.pitch -= touch.lookDY * friction;', 'touch swipe excludes right-stick vertical inversion');
  code = replaceOnce(code, '    if (!this.enabled) {', '    if (!this.enabled) {\n      this.padMapOpen = false; this.padLook.x = this.padLook.y = 0; this.edgeT = 0;', 'disabled input state');
  code = replaceOnce(code, "    const usingPad = !!inp.pad && inp.lastDevice === 'pad';", "    const standardPad = inp.pad?.mapping === 'standard';\n    if (!standardPad) this.padMapOpen = false;\n    if (standardPad && inp.padPressed.has(3)) { this.padMapOpen = !this.padMapOpen; inp.padPressed.delete(3); }\n    const padMap = standardPad ? !!this.padMapOpen : inp.padButton(8);\n    const gyroActive = !!touch?.gyro?.enabled;\n    if (gyroActive || this._gyroAxisActive !== gyroActive) this.padLook.y = 0;\n    this._gyroAxisActive = gyroActive;\n    const usingPad = !!inp.pad && inp.lastDevice === 'pad';", 'pad map and gyro ownership');
  for (const before of [
    "(G.rig?.mapK ?? 0) > 0.05 || inp.down('Tab') || inp.down('KeyM') || inp.padButton(8) || !!touch?.mapOpen",
    "this.mapHeld = inp.down('Tab') || inp.down('KeyM') || inp.padButton(8) || !!touch?.mapOpen",
  ]) code = replaceOnce(code, before, before.replace('inp.padButton(8)', 'padMap'), 'standard map ownership');
  code = replaceOnce(code, 'inp.padButton(3) || inp.padButton(11)', "(!standardPad && inp.padButton(3)) || inp.padButton(11)", 'standard special ownership');
  code = replaceOnce(code, 'this.padLook.y += (_stick.y * c - this.padLook.y) * k;', 'if (!gyroActive) this.padLook.y += (_stick.y * c - this.padLook.y) * k;', 'gyro vertical stick filter');
  if (code.includes('rig.yaw -= this.padLook.x * yawRate * friction * dt;')) {
    code = replaceOnce(code, 'rig.yaw -= this.padLook.x * yawRate * friction * dt;',
      'rig.yaw -= this.padLook.x * yawRate * friction * dt * (s.padInvertX ? -1 : 1);',
      'independent right-stick horizontal inversion');
  } else {
    code = replaceOnce(code, 'rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;',
      'rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt * (s.padInvertX ? -1 : 1);',
      'independent right-stick horizontal inversion');
  }
  code = replaceOnce(code, 'rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;', 'if (!gyroActive) rig.pitch -= this.padLook.y * 2.4 * ps * friction * dt * inv;', 'gyro owns vertical camera');
  code = replaceOnce(code, '    // ---- move (camera relative)', "    if (standardPad && inp.padPressed.has(2)) { this.resetCamera(); inp.padPressed.delete(2); }\n    // ---- move (camera relative)", 'camera reset gameplay edge');
  code = replaceOnce(code, '    if (this.mapHeld) { it.fire = false; it.sub = false; }', '    if (this.mapHeld) {\n      // Map clicks belong to the selection UI; an independent ZR remains a real hold.\n      it.fire = inp.padValue(7) > 0.3 || inp.padPressed.has(7); it.sub = false;\n    }', 'map input source ownership');
  code = replaceOnce(code, '  // Best enemy near the crosshair', `  // One camera-reset owner: heading follows the actor and pitch returns to neutral.
  // No inferred S3 pitch offset or stick response curve is introduced here.
  resetCamera() {
    this.rig.yaw = this.a.yaw; this.rig.pitch = 0;
    this.padLook.x = this.padLook.y = 0; this.edgeT = 0; this.assist.has = false;
    this.input.mobile?.gyro?.resync?.();
  }

  // Best enemy near the crosshair`, 'camera reset method');
  return code;
}
