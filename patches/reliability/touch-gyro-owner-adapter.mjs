// Mobile device gyro follows touch ownership; sensor preferences and mapping stay independent.
import {replaceOnce} from './input-adapter.mjs';
export function adaptTouchGyroOwner(rel, code) {
  if(rel==='src/core/mobile.js')return replaceOnce(code,
    '  onDeviceChange() { this._syncVisible(); }',
    '  onDeviceChange() { this.gyro?.discard?.(); this.gyro?.resync?.(); this._syncVisible(); }',
    'rebase mobile gyro at the device transition');
  if(rel!=='src/game/player.js')return code;
  // Existing #276 may precede this adapter: a non-owning phone gyro must not
  // suppress the active gamepad vertical stick either.
  if(code.includes('const gyroActive ='))code=replaceOnce(code,
    'const gyroActive = !!touch?.gyro?.enabled;',
    "const gyroActive = inp.lastDevice === 'touch' && !!touch?.gyro?.enabled;",
    'gyro pitch exclusivity follows touch ownership');
  return replaceOnce(code,'    if (touch && touch.gyro.enabled) {',
    "    if (!usingTouch) touch?.gyro?.discard?.();\n    if (usingTouch && touch.gyro.enabled) {",
    'mobile gyro camera admission follows touch ownership');
}
