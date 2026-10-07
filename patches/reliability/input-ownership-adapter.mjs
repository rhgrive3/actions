// Device ownership at the gameplay boundary; keep physical polling/menu edges intact.
import { replaceOnce } from './input-adapter.mjs';
export function adaptInputOwnership(rel, code) {
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '    this._dev = v;', `    this._dev = v;
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
    if (!usingPad) { this.padLook.x = this.padLook.y = 0; this.edgeT = 0; }
    const swipeGyroActive = !!touch?.gyro?.enabled;
    touch?._syncSwipePitch?.();
    if (touch && swipeGyroActive) touch.lookDY = 0;`, 'pad filter and touch pitch ownership');
    code = replaceOnce(code, 'if (inp.pad && !mapUp) {', 'if (usingPad && !mapUp) {', 'owned camera axes');
    code = replaceOnce(code, 'if (inp.pad) { inp.padStick(0, 1, _stick, 0.14, 0.95);', 'if (usingPad) { inp.padStick(0, 1, _stick, 0.14, 0.95);', 'owned movement axes');
    return replaceOnce(code, '      rig.pitch -= touch.lookDY * friction * inv;', '      if (!swipeGyroActive) rig.pitch -= touch.lookDY * friction * inv;', 'gyro owns touch pitch');
  }
  if (rel === 'src/core/mobile.js') {
    code = replaceOnce(code, '      this.lookDX += dx * k; this.lookDY += dy * k * 0.9;', '      this._syncSwipePitch();\n      this.lookDX += dx * k;\n      if (!this.gyro.enabled) this.lookDY += dy * k * 0.9;', 'shared swipe and button-drag pitch ownership');
    return replaceOnce(code, '  _gyroBtn() {', `  _syncSwipePitch() {
    const enabled = !!this.gyro.enabled;
    if (this._swipeGyroEnabled !== enabled) this.lookDY = 0;
    this._swipeGyroEnabled = enabled;
  }
  _gyroBtn() { this._syncSwipePitch();`, 'clear queued swipe pitch at gyro transition');
  }
  return code;
}
