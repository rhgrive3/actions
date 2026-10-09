// INKWAVE issue #480 — camera shake is not a player setting in Splatoon 3.
//
// Narrow build-only adapter (no raw inkwave-public/ mutation). Splatoon 3 does
// not expose a camera-shake strength/disable option; INKWAVE exposes a non-native
// 0-100% "Camera shake" slider whose value is multiplied into CameraRig trauma
// and, because the shaken pose is copied into `gameCam`, changes the gameplay
// camera the aim path consumes.
//
// Fix (fidelity path only, no invented shake amplitude/frequency):
//   * `src/game/cameraRig.js`  — drop the non-native settings multiplier so a
//     fixed trauma input yields an identical `gameCam` regardless of a stale
//     persisted `cameraShake` value. The existing trauma curve and `shakeScale`
//     are preserved untouched.
//   * `src/fx/screenfx.js`     — the same non-native setting must not scale the
//     post FX intensity either; `prefers-reduced-motion` still applies.
//   * `src/ui/menus.js`        — remove the non-native "Camera shake" slider row
//     so the fidelity settings no longer present it as a Splatoon option.
//
// The shared dispatcher (`patches/local-quality/adapter.mjs`) and
// `patches/splatoon3/profile.json` are intentionally NOT edited by this lane.
// Required parent wiring:
//   1. in patches/local-quality/adapter.mjs import adaptIssue480Source from
//      './issue-480-camera-shake-fidelity.mjs'
//   2. add 'issue-480-camera-shake-fidelity.mjs' to IDENTITY_FILES
//   3. call `code = adaptIssue480Source(rel, code);` inside adaptQualitySource
export const REQUIRED_WIRING = 'adaptIssue480Source must be invoked inside adaptQualitySource and issue-480-camera-shake-fidelity.mjs added to IDENTITY_FILES';

export const ISSUE_480_CAMERA_RIG = 'src/game/cameraRig.js';
export const ISSUE_480_SCREENFX = 'src/fx/screenfx.js';
export const ISSUE_480_MENUS = 'src/ui/menus.js';

function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-480 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue480Source(rel, code) {
  if (rel === ISSUE_480_CAMERA_RIG) {
    return replaceOnce(code,
      '    const sh = this.trauma * this.trauma * (s?.cameraShake ?? 1) * this.shakeScale;',
      '    // issue-480: camera shake is not a Splatoon 3 option; keep the fidelity trauma\n' +
      '    // response fixed so a stale non-native cameraShake value cannot change gameCam/aim.\n' +
      '    const sh = this.trauma * this.trauma * this.shakeScale;',
      'cameraRig shake scale');
  }

  if (rel === ISSUE_480_SCREENFX) {
    return replaceOnce(code,
      '    const shake = clamp(G.settings?.cameraShake ?? 1, 0, 1);',
      '    // issue-480: no non-native camera-shake strength setting; reduced-motion still applies below.\n' +
      '    const shake = 1;',
      'screenfx shake scale');
  }

  if (rel === ISSUE_480_MENUS) {
    return replaceOnce(code,
      "    { key: 'cameraShake', label: 'Camera shake', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Screen shake from explosions, slams and hits.' },\n",
      '',
      'menus cameraShake row');
  }

  return code;
}
