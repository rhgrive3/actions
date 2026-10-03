// INKWAVE reliability overlay: intro-timer lifetime only.
// Applied to a disposable build tree; the public inkwave-public/ sources are never edited.
// The turf intro schedules a READY banner and the HUD reveal with two deferred timers. They used
// to test only the current match state, so a timer left over from an older intro (a re-queued
// match, an aborted round, a room switch) still fired into a newer intro and changed its UI early.
// The fix pins each timer to the match that opened the intro and requires that same identity AND
// the intro state. Timings, the cinematic sweep, the look, the boss dispatch and every numeric
// behaviour are left exactly as upstream. Only these two callbacks change.
//
// Every connection is a unique exact anchor. A missing or duplicated anchor (including a second
// application of this overlay) throws so the build fails closed instead of shipping a half-patched
// main module. adaptIntro() returns `code` unchanged for every module except src/main.js.

const MAIN_REL = 'src/main.js';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE reliability intro conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// The two turf-intro timers, adjacent and both keyed off the current match state only.
const TIMERS_BEFORE = [
  "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.banner('ready'); }, 1700);",
  "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);",
].join('\n');

const TIMERS_AFTER = [
  '    // Pin both deferred UI steps to the match that opened this intro: a stale READY/HUD timer',
  '    // from an earlier intro must never fire into a newer match or a later state.',
  '    const m = this.match;',
  "    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.banner('ready'); }, 1700);",
  "    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.setVisible(true); }, 3000);",
].join('\n');

export function adaptIntro(rel, code) {
  if (rel !== MAIN_REL) return code;
  return replaceOnce(code, TIMERS_BEFORE, TIMERS_AFTER, 'intro ready/hud timers');
}