// INKWAVE reliability overlay: input lifecycle only.
// Applied to a disposable build tree; the public inkwave-public/ sources are never edited.
// Every connection is a unique exact anchor. A missing or duplicated anchor throws so the
// build fails closed instead of silently shipping a half-patched input module.
//
// adaptInput() returns `code` unchanged for every module except src/core/input.js.

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

export function adaptInput(rel, code) {
  if (rel !== INPUT_REL) return code;
  code = replaceOnce(code, BLUR_BEFORE, BLUR_AFTER, 'blur focus reset');
  code = replaceOnce(code, NOPAD_BEFORE, NOPAD_AFTER, 'gamepad disconnect reset');
  return code;
}
