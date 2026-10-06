import { replaceOnce } from './input-adapter.mjs';

export function adaptPadHandoff(rel, code) {
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '    this.padPrev = [];', `    this.padPrev = [];
    this._padIdentity = null; this._padIdentityLost = false; this._padEpoch = 0;
    this._padTakeoverBlocked = new Set(); this._padTakeoverAxes = false;
    window.addEventListener('gamepaddisconnected', e => {
      if (this._padIdentity && e.gamepad && e.gamepad.index === this._padIdentity.index) this._padIdentityLost = true;
    });`, 'pad identity lifecycle');
    code = replaceOnce(code, '    this.pad = pad;', `    const previous = this._padIdentity;
    const identity = pad ? { index: pad.index, id: pad.id, mapping: pad.mapping } : null;
    const changed = identity && (this._platformPadFocusRebase || previous && (this._padIdentityLost || previous.index !== identity.index || previous.id !== identity.id || previous.mapping !== identity.mapping));
    if (identity) this._platformPadFocusRebase = false;
    this._padIdentity = identity; this._padIdentityLost = false;
    if (changed) {
      ++this._padEpoch;
      this.padPrev = []; this.padPressed.clear(); this.padMenuPressed?.clear(); this.padMenuBlocked?.clear();
      this._padTakeoverBlocked.clear(); this._padTakeoverAxes = true;
      pad.buttons.forEach((button, i) => {
        const held = i === 6 || i === 7 ? button.value > 0.3 : !!button.pressed;
        this.padPrev[i] = held;
        if (held) this._padTakeoverBlocked.add(i);
      });
    }
    if (!pad) { this._padTakeoverBlocked.clear(); this._padTakeoverAxes = false; }
    if (this._padTakeoverAxes && pad.axes.every((v, i) => i >= 4 || Math.abs(v || 0) <= 0.14)) this._padTakeoverAxes = false;
    this.pad = pad;`, 'pad direct handoff');
    code = replaceOnce(code, '      const was = this.padPrev[i] || false;',
      '      if (!b.pressed) this._padTakeoverBlocked.delete(i);\n      const was = this._padTakeoverBlocked.has(i) || this.padPrev[i] || false;', 'pad takeover release');
    code = replaceOnce(code, '    const ax = pad.axes;', '    if (this._padTakeoverAxes) return;\n    const ax = pad.axes;', 'pad takeover axis ownership');
    code = replaceOnce(code, '  padButton(i) { ', '  padButton(i) { if (this._padTakeoverBlocked.has(i)) return false; ', 'pad takeover buttons');
    code = replaceOnce(code, '  padValue(i) { ', '  padValue(i) { if (this._padTakeoverBlocked.has(i)) return 0; ', 'pad takeover values');
    code = replaceOnce(code, '  padAxis(i) {', '  padAxis(i) {\n    if (this._padTakeoverAxes) return 0;', 'pad takeover axes');
    code = replaceOnce(code, '    out.x = 0; out.y = 0; out.mag = 0;', '    out.x = 0; out.y = 0; out.mag = 0;\n    if (this._padTakeoverAxes) return out;', 'pad takeover sticks');
  } else if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '    const it = a.intent;', `    const it = a.intent;
    if (this._padInputEpoch !== (inp._padEpoch || 0)) {
      this._padInputEpoch = inp._padEpoch || 0;
      this.padLook.x = this.padLook.y = 0; this.edgeT = 0;
    }`, 'pad handoff filter owner');
  }
  return code;
}
