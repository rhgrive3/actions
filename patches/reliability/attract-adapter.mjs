// INKWAVE reliability overlay: menu-attract auto-reset lifetime only.
// Applied to a disposable build tree; the public inkwave-public/ sources are never edited.
//
// While the menus are up the attract camera rotates a throwaway match. When the shot counter or
// the paint coverage trips the auto-reset, `_updateAttract` fades out and, on completion, resets
// the palette and calls `_startAttract()` — which disposes `this.match` and builds a fresh attract
// match. That continuation used to be unguarded, so a newer startup / menu return that began
// during the 400 ms fade was cancelled (while it was still awaiting its own fade on the very same
// original match) or, once it had already created its playing match, had that match disposed by
// the stale reset.
//
// A match-only guard is not enough: `startMatch`/`startNetMatch` call `_beginMatchFlow()` first
// and only then `await this._fade(1, 350)` — during that await `this.match` still points at the
// original attract match, so a match-only capture would match and the stale reset would still
// fire. The operation owner (`Game._matchFlow`) changes as soon as a new startup / menu return
// reserves it, so both the original match and the original operation owner are captured before the
// fade is scheduled, and both must still be identical before any side effect runs.
//
// The palette choice, `_startAttract()` itself, the fade durations, the auto-reset timing
// (`attractT`/`shotT`/coverage) and the music are left exactly as upstream. Only this continuation
// changes.
//
// The single connection is a unique exact anchor. A missing or duplicated anchor (including a
// second application of this overlay, or applying it before the start overlay that installs the
// operation owner) throws so the build fails closed instead of shipping a half-patched main
// module. adaptAttract() returns `code` unchanged for every module except src/main.js.

const MAIN_REL = 'src/main.js';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE reliability attract conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// The one auto-reset continuation in src/main.js.
const RESET_BEFORE = '      this._fade(1, 400).then(() => { this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600); });';

const RESET_AFTER = [
  '      // Pin the auto-reset to the match and operation that scheduled it. A newer startup or',
  '      // menu return changes the operation owner even while `this.match` still points at the',
  '      // original attract match, so both identities are captured before the fade is scheduled.',
  '      const resetMatch = this.match, resetFlow = this._matchFlow;',
  '      this._fade(1, 400).then(() => {',
  '        if (this.match !== resetMatch || this._matchFlow !== resetFlow) return;',
  '        this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600);',
  '      });',
].join('\n');

// The start overlay runs before this one and installs the operation owner the guard compares
// against. Requiring it here keeps a wrong build order from shipping an inert guard.
const FLOW_HELPER = '  _beginMatchFlow() {';

export function adaptAttract(rel, code) {
  if (rel !== MAIN_REL) return code;
  const at = code.indexOf(FLOW_HELPER);
  if (at < 0 || code.indexOf(FLOW_HELPER, at + FLOW_HELPER.length) >= 0) {
    throw new Error('INKWAVE reliability attract conflict (operation owner): the start operation helper must be applied before this overlay. Review composition order; site was not built.');
  }
  return replaceOnce(code, RESET_BEFORE, RESET_AFTER, 'attract auto-reset continuation');
}