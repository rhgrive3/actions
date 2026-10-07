// INKWAVE reliability overlay: input lifecycle only.
// Applied to a disposable build tree; the public inkwave-public/ sources are never edited.
// Every connection is a unique exact anchor. A missing or duplicated anchor throws so the
// build fails closed instead of silently shipping a half-patched input module.
//
// Input polling plus the disconnected PlayerController filter boundary.

const INPUT_REL = 'src/core/input.js';

export function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE reliability input conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// Defect 1: blur cleared held keys and mouse buttons but left the pending key edge, the pending
// mouse edge and the accumulated look deltas behind, so the first frame back could replay a jump
// or shot that happened while the window was inactive. padPressed is a per-frame edge set and is
// dropped too; padPrev is deliberately kept so a button held across the blur is not re-triggered.
const BLUR_BEFORE = "    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });";
const BLUR_AFTER = [
  "    window.addEventListener('blur', () => {",
  '      // Focus left mid-frame: drop held keys, pending key edges, mouse held/pending edges and',
  '      // look deltas so no input from the inactive window is replayed on the next frame.',
  '      this.keys.clear(); this.pressed.clear();',
  '      this.mouse.left = this.mouse.right = false;',
  '      this.mouse.leftPressed = this.mouse.rightPressed = false;',
  '      this.mouse.dx = 0; this.mouse.dy = 0;',
  '      // padPrev stays: a pad button held across the blur must not re-trigger when polling resumes.',
  '      this.padPressed.clear();',
  '    });',
].join('\n');

// Defect 2: with no connected gamepad pollPad() returned before touching padPrev, so a stale held
// button from the previous pad suppressed the first press of the next pad. Clear padPrev when the
// pad goes away so the reconnected pad's first button edge is registered.
const NOPAD_BEFORE = '    this.padPressed.clear();\n    if (!pad) return;';
const NOPAD_AFTER = '    this.padPressed.clear();\n    if (!pad) { this.padPrev = []; return; }';
const S3_NOPAD_BEFORE = '    this.padPressed.clear();\n    if (!pad) {\n      if (padOwned) { this._s3PadCanceled = true; this.padPrev.length = 0; }\n      return;\n    }';
const S3_NOPAD_AFTER = '    this.padPressed.clear();\n    if (!pad && padOwned) { this._s3PadCanceled = true; this.padPrev.length = 0; }\n    if (!pad) { this.padPrev = []; return; }';

export function adaptInput(rel, code) {
  if (rel === 'src/game/player.js') {
    if (code.includes('    const it = a.intent;\n    if (inp._s3PadCanceled) {')) return replaceOnce(code,
      '    const it = a.intent;\n    if (inp._s3PadCanceled) {',
      '    const it = a.intent;\n    // A missing pad cannot retain camera velocity for a later reconnect (#676).\n    if (!inp.pad) { this.padLook.x = this.padLook.y = 0; this.edgeT = 0; }\n    if (inp._s3PadCanceled) {',
      'disconnected pad camera filter');
    return replaceOnce(code, '    const it = a.intent;\n    if (!this.enabled) {',
      '    const it = a.intent;\n    // A missing pad cannot retain camera velocity for a later reconnect (#676).\n    if (!inp.pad) { this.padLook.x = this.padLook.y = 0; this.edgeT = 0; }\n    if (!this.enabled) {',
      'disconnected pad camera filter');
  }
  if (rel !== INPUT_REL) return code;
  code = replaceOnce(code,
    "      this.lastDevice = 'kbm';\n      if (this.onKey && this.onKey(e, false)) return;",
    "      // Keyboard state remains live while an existing touch contact owns its gesture.\n" +
    "      const touchContact = this.lastDevice === 'touch' && this.mobile?.active && !this.mobile._destroyed &&\n" +
    "        ((this.mobile._ptr?.size || 0) > 0 || (this.mobile._stick?.id ?? -1) >= 0);\n" +
    "      if (!touchContact) this.lastDevice = 'kbm';\n      if (this.onKey && this.onKey(e, false)) return;",
    'keyboard preserves live touch contact');
  code = replaceOnce(code,
    '    const pads = navigator.getGamepads ? navigator.getGamepads() : [];',
    '    let pads = [];\n' +
    '    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; }\n' +
    '    catch {\n' +
    '      // Optional browser input may be policy-blocked. Retire buffered pad\n' +
    '      // edges/filter ownership, then run the ordinary no-pad cleanup below.\n' +
    '      this._padEpoch = (this._padEpoch || 0) + 1;\n' +
    '    }', 'optional gamepad capability boundary');
  code = replaceOnce(code, BLUR_BEFORE, BLUR_AFTER, 'blur focus reset');
  code = code.includes(S3_NOPAD_BEFORE)
    ? replaceOnce(code, S3_NOPAD_BEFORE, S3_NOPAD_AFTER, 'gamepad disconnect reset')
    : replaceOnce(code, NOPAD_BEFORE, NOPAD_AFTER, 'gamepad disconnect reset');
  code = replaceOnce(code,
    '    pad.buttons.forEach((b, i) => {',
    '    pad.buttons.forEach((b, i) => {\n' +
    '      // Trigger edges use the same threshold as canonical held fire/swim.\n' +
    '      if (i === 6 || i === 7) b = { pressed: b.value > 0.3 };',
    'canonical gamepad trigger threshold');
  code = replaceOnce(code,
    'if (!this.locked) { this.mouse.left = this.mouse.right = false; this.onUnlock?.(); }',
    'if (!this.locked) { this.mouse.left = this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; this.mouse.dx = this.mouse.dy = 0; this.onUnlock?.(); }',
    'pointer loss cancels pending mouse input');
  return code;
}
