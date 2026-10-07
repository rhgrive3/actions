// Build-only Splatoon 3 fidelity presentation. The reference profile exposes
// motion-control sensitivity and the gyro ON/OFF toggle only; Splatoon 3 has no
// independent motion-axis inversion setting. This adapter removes the two
// gyroInvert rows from the Touch settings UI and stops MobileInput.applySettings
// from handing persisted gyroInvertX/Y values to Gyro.configure, so a saved
// non-native sign can never become active again (migration by omission; the
// stored key is simply never read on the gyro path).
// Native yaw/pitch integration, the sensitivity curve, permission prompts and
// gyro listener lifetime (gyro-adapter.mjs) are untouched, as are right-stick
// and mouse inversion and the camera-reset controls.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`Reliability gyro-invert anchor mismatch: ${rel}`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptGyroInvert(rel, code) {
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code,
      "  { key: 'gyroInvertY', label: 'Gyro vertical', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Normal: tilt the top toward you to look up (like a window). Invert flips it.' },\n",
      '', rel);
    return replaceOnce(code,
      "  { key: 'gyroInvertX', label: 'Gyro horizontal', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Normal: turn the device left to look left.' },\n",
      '', rel);
  }
  if (rel === 'src/core/mobile.js') {
    return replaceOnce(code,
      '    this.gyro.configure({ sens: s.gyroSens, invX: s.gyroInvertX, invY: s.gyroInvertY });',
      '    this.gyro.configure({ sens: s.gyroSens });',
      rel);
  }
  return code;
}
