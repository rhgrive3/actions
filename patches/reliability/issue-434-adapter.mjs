// INKWAVE issue #434 build-only adapter: visibility-only backgrounding must clear held/pending
// input exactly like window blur does.
//
// `src/core/input.js` clears held keys and mouse buttons only from `window.blur`. On mobile the
// document can enter `visibilityState === 'hidden'` (app switch, screen lock, tab background)
// without a delivered keyup and without a blur, so a held gameplay key survives into the next
// visible frame and PlayerController re-applies it: movement / squid / jump / sub / special stay
// stuck until the key is pressed and released again. Touch input already resets on
// `visibilitychange`; keyboard, mouse and pad must match.
//
// The public `inkwave-public/` sources are never edited: this rewrites a disposable build tree.
// The anchor is the `keyup` connection, which the other reliability input adapter does not touch,
// so this composes with `adaptInput()` in either order. Wiring into the shared dispatcher
// (`patches/reliability/adapter.mjs`) is the parent's responsibility.

const INPUT_REL = 'src/core/input.js';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Issue-434 input anchor mismatch (${label}): expected exactly one connection.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const KEYUP_BEFORE = "    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });";

const KEYUP_AFTER = [
  KEYUP_BEFORE,
  '    // Issue #434: backgrounding can swallow the keyup and never deliver blur, so held/pending',
  '    // input would be replayed on resume. Clear the same state as the blur path when the document',
  '    // hides; padPrev is kept (like blur) so a button held across backgrounding does not re-trigger.',
  "    document.addEventListener('visibilitychange', () => {",
  "      if (document.visibilityState !== 'hidden') return;",
  '      this.keys.clear(); this.pressed.clear();',
  '      this.mouse.left = this.mouse.right = false;',
  '      this.mouse.leftPressed = this.mouse.rightPressed = false;',
  '      this.mouse.dx = 0; this.mouse.dy = 0;',
  '      this.padPressed.clear();',
  '    });',
].join('\n');

export function adaptIssue434(rel, code) {
  if (rel !== INPUT_REL) return code;
  return replaceOnce(code, KEYUP_BEFORE, KEYUP_AFTER, 'visibilitychange hidden reset');
}
