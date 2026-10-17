// Device ownership at the gameplay boundary; keep physical polling/menu edges intact.
import { replaceOnce } from './input-adapter.mjs';
export function adaptInputOwnership(rel, code) {
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '    this._dev = v;', `    // #1187: masking a still-held old pad is a cancellation, not a release.
    if (this._dev === 'pad' && v !== 'pad') {
      const fire = this.padValue(7) > 0.3, sub = this.padButton(5);
      if (fire || sub) {
        const cancelled = this._holdCancelled || (this._holdCancelled = new Set());
        if (fire) cancelled.add('fire');
        if (sub) cancelled.add('sub');
      }
    }
    this._dev = v;
    if (v !== 'pad') this.padPressed.clear();`, 'drop stale pad gameplay edges on owner change');
    // Wrap after class construction so other overlays can retain exact upstream anchors.
    return code + `
// A connected controller is not necessarily the active input device. Physical
// pollPad still owns device acquisition; menu-blocked holds remain masked.
for (const name of ['padButton', 'padValue', 'padAxis']) {
  const read = Input.prototype[name];
  Input.prototype[name] = function (...args) {
    return this.lastDevice === 'pad' ? read.apply(this, args) : (name === 'padButton' ? false : 0);
  };
}
const ownedPadStick = Input.prototype.padStick;
Input.prototype.padStick = function (ix, iy, out, ...args) {
  if (this.lastDevice !== 'pad') { out.x = out.y = out.mag = 0; return out; }
  return ownedPadStick.call(this, ix, iy, out, ...args);
};
`;
  }
  if (rel === 'src/game/player.js') {
    code = replaceOnce(code, "    const usingPad = !!inp.pad && inp.lastDevice === 'pad';", `    const usingPad = !!inp.pad && inp.lastDevice === 'pad';
    if (!usingPad) { this.padLook.x = this.padLook.y = 0; this.edgeT = 0; }`, 'owned pad filter');
    code = replaceOnce(code, 'if (inp.pad && !mapUp) {', 'if (usingPad && !mapUp) {', 'owned camera axes');
    code = replaceOnce(code, 'if (touch && !mapUp && (touch.lookDX || touch.lookDY)) {', 'if (usingTouch && !mapUp && (touch.lookDX || touch.lookDY)) {', 'owned touch camera axes');
    code = replaceOnce(code, 'if (inp.pad) { inp.padStick(0, 1, _stick, 0.14, 0.95);', 'if (usingPad) { inp.padStick(0, 1, _stick, 0.14, 0.95);', 'owned movement axes');
    // Touch and mobile gyro are relative deltas from the same device owner.
    // Keep both swipe axes live, including button drags, without a mode latch
    // that could erase the first movement after a gyro toggle.
    return code;
  }
  return code;
}
