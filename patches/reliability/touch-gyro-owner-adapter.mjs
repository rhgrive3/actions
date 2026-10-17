// Mobile device gyro follows touch ownership; sensor preferences and mapping stay independent.
import {replaceOnce} from './input-adapter.mjs';
export function adaptTouchGyroOwner(rel, code) {
  if(rel==='src/core/mobile.js')return replaceOnce(code,
    '  onDeviceChange() { this._syncVisible(); }',
    '  onDeviceChange() { this.lookDX = this.lookDY = 0; this.gyro?.discard?.(); this.gyro?.resync?.(); this._gyroOwnerAtReset = this.owner?.lastDevice; this._gyroOwnerResetSerial = (this._gyroOwnerResetSerial || 0) + 1; this._syncVisible(); }',
    'rebase mobile gyro at the device transition');
  if(rel!=='src/game/player.js')return code;
  code=replaceOnce(code, '    if (!this.enabled) {',
    '    if (!this.enabled) {\n      if (inp.mobile) inp.mobile.lookDX = inp.mobile.lookDY = 0;',
    'disabled gameplay discards both touch axes alongside gyro');
  // Existing #276 may precede this adapter: a non-owning phone gyro must not
  // suppress the active gamepad vertical stick either.
  if(code.includes('const gyroActive ='))code=replaceOnce(code,
    'const gyroActive = !!touch?.gyro?.enabled;',
    "const gyroActive = inp.lastDevice === 'touch' && !!touch?.gyro?.enabled;",
    'gyro vertical-stick exclusivity follows touch ownership');
  return replaceOnce(code,'    if (touch && touch.gyro.enabled) {',
    "    if (!usingTouch) {\n      if (touch) touch.lookDX = touch.lookDY = 0;\n      touch?.gyro?.discard?.();\n    }\n    if (usingTouch && touch.gyro.enabled) {",
    'mobile gyro camera admission follows touch ownership');
}
