// A hold that the platform cancels (pointercancel, reset, mouse -> touch handoff) is not a deliberate release.
// Release-triggered actions (Charger / Splatling charge, SUB throw) read the level going false, so the input
// layer reports the cancel for one simulation tick and the controller tells the runner to drop the hold instead.
import { replaceOnce } from './input-adapter.mjs';

export function adaptHoldCancel(rel, code) {
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '  down(code) { return this.keys.has(code); }',
      `  // FIRE / SUB holds ended by a cancel (mouse -> touch handoff, touch pointercancel/reset), not a mouse-up / finger-up.
  holdCancelled(name) { return !!(this._holdCancelled?.has(name) || this.mobile?.wasCancelled?.(name)); }
  down(code) { return this.keys.has(code); }`, 'hold cancel query');
    code = replaceOnce(code, '    this.mobile?.endFrame();\n    this.pressed.clear();',
      '    this.mobile?.endFrame();\n    this._holdCancelled?.clear();\n    this.pressed.clear();', 'hold cancel consumption');
  } else if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '    if (this.mapHeld) { it.fire = false; it.sub = false; }',
      '    if (this.mapHeld) { it.fire = false; it.sub = false; }\n    this._cancelHolds(inp, it);', 'cancelled hold after intent');
    code = replaceOnce(code, '      this.input.mobile?.gyro?.discard();\n      return;\n    }',
      '      this.input.mobile?.gyro?.discard();\n      this._cancelHolds(inp, it);\n      return;\n    }', 'cancelled hold while disabled');
    code = replaceOnce(code, '  // Best enemy near the crosshair for aim assist',
      `  // A cancelled hold drops its charge / bomb aim; a hold that is held again this tick is not cancelled.
  _cancelHolds(inp, it) {
    const fire = !it.fire && !!inp.holdCancelled?.('fire'), sub = !it.sub && !!inp.holdCancelled?.('sub');
    if (fire || sub) this.a.weaponRunner.cancelHold(fire, sub);
  }

  // Best enemy near the crosshair for aim assist`, 'cancelled hold owner');
  } else if (rel === 'src/game/weapons.js') {
    code = replaceOnce(code, '  _empty() {',
      `  // Drop a hold without a release: the charge is discarded (no shot, no ink) and the bomb aim ends without a throw.
  cancelHold(fire, sub) {
    const prev = this.a._prevIntent;
    if (sub) { this.aimingSub = false; if (prev) prev.sub = false; }
    if (!fire) return;
    if (prev) prev.fire = false;
    if (this.charging || this.s3Stored) {
      this.charging = false; this.charge = 0; this.chargeT = 0; this.chargeDinged = false; this.s3Stored = null;
      this.chargeLoop?.stop(0.05); this.chargeLoop = null;
      if (!this.streaming) { this.spinLoop?.stop(0.12); this.spinLoop = null; this.fidelitySplatlingCharge = null; }
    }
  }

  _empty() {`, 'runner cancelled hold');
  }
  return code;
}
