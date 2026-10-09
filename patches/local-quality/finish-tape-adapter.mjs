// Issue #580: a normal Turf War ended with a custom two-team-splat "TIME'S UP!" card.
// Splatoon 3 punctuates 0:00 with its battle-finish **tape** (the visual lockout that says
// "battle over" before Judd), and the finish treatment must stay dominant until the judge
// hand-over. This is presentation only: the authoritative playing -> finish -> judge progression,
// the timer, score, projectile and online ordering are untouched, and the post-TIME-UP
// simulation questions stay with #410 / #121.
//
// Scope guard - Boss Battle keeps its own ending. `banner()` already returns early for boss
// mode (`if (kind === 'timesup' && this.boss.timesUp()) { ...; return; }`), and hud-boss.js
// owns the SUNK! / TIME'S UP `.iw-bend` ending, so this adapter only rewrites the *non-boss*
// branch that main.js reaches through `hud.banner('timesup')` at state === 'finish'.
// hud-boss.js is therefore never touched by this adapter.
//
// The finish treatment is deliberately team-neutral (no --self / --enemy, no camera side), so
// Alpha and Bravo read the same battle-end lockout.
//
// Build-only adapter over raw inkwave-public; parent wires it into
// patches/local-quality/adapter.mjs alongside the other local-quality adapters. No side effects.

export function replaceOnceFinish(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    // Namespace matches the other local-quality adapters wired through adaptQualitySource
    // (landing-rigidity / lobby-resource), so the shared double-apply guards in
    // tests/runtime-ui.test.mjs and tests/quality.test.mjs (/quality patch conflict/) still apply.
    throw new Error(`INKWAVE quality patch conflict (finish tape: ${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const FINISH_CSS = `

/* ---- Issue #580: Splatoon 3 Finish tape (normal battle end; boss keeps its own .iw-bend ending) ---- */
.iw-bn--finish { left: 0; top: 50%; width: 100%; transform: none; translate: 0 -50%; isolation: auto;
  animation: iw-bn-fin 2.6s var(--spring) both; }
@keyframes iw-bn-fin { 0% { opacity: 0; translate: -102vw -50%; } 62% { opacity: 1; translate: 1.5vw -50%; } 78% { translate: 0 -50%; } 100% { opacity: 1; translate: 0 -50%; } }
.iw-bn__tape { position: absolute; left: 0; right: 0; top: 50%; translate: 0 -50%; rotate: -4deg; overflow: hidden;
  padding: calc(var(--u) * 1.15) 0; background: repeating-linear-gradient(115deg, var(--k) 0 calc(var(--u) * 2.6), #fff calc(var(--u) * 2.6) calc(var(--u) * 5.2));
  box-shadow: 0 calc(var(--u) * .5) 0 rgba(0, 0, 0, .35); }
.iw-bn__fin-text { position: relative; color: #fff; font-size: calc(var(--u) * 8.5); line-height: 1; letter-spacing: .04em; text-align: center;
  -webkit-text-stroke: calc(var(--u) * .5) var(--k); paint-order: stroke fill; }
`;

export function adaptFinishTape(rel, code) {
  // ---- src/ui/hud.js: the banner itself + its lifetime + the judge hand-over
  if (rel === 'src/ui/hud.js') {
    // 1) the reference word on the battle-end banner is FINISH!, not TIME'S UP!
    code = replaceOnceFinish(code,
      `const defaults = { ready: 'READY?', go: 'GO!', one_minute: '1 minute left!', timesup: "TIME'S UP!", special: 'SPECIAL!', custom: '' };`,
      `const defaults = { ready: 'READY?', go: 'GO!', one_minute: '1 minute left!', timesup: 'FINISH!', special: 'SPECIAL!', custom: '' };`,
      'finish banner default label');

    // 2) the two-splat TIME'S UP card becomes the full-width Finish tape (team-neutral)
    code = replaceOnceFinish(code,
      `    } else if (k === 'timesup') {
      el = h('div', { class: 'iw-bn iw-bn--timesup' },
        h('div', { class: 'iw-bn__splat b', html: splatSVG({ seed: 8, cls: 'iw-fenemy', r: 60, arms: 9, drops: 6 }) }),
        h('div', { class: 'iw-bn__splat', html: splatSVG({ seed: 13, cls: 'iw-fself', r: 60, arms: 10, drops: 7 }) }),
        h('div', { class: 'iw-bn__text iw-display' }, label));`,
      `    } else if (k === 'timesup') {
      // Splatoon 3 battle-end: the Finish tape that locks the round, held until the judge.
      // Team-neutral by design - Alpha and Bravo read the same treatment.
      el = h('div', { class: 'iw-bn iw-bn--finish' },
        h('div', { class: 'iw-bn__tape' },
          h('div', { class: 'iw-bn__fin-text iw-display' }, label)));`,
      'finish tape markup');

    // 3) every other banner self-removes; the finish tape must survive into the judge phase
    code = replaceOnceFinish(code,
      `    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 4000);`,
      `    // the Finish tape is the battle-end lockout: it holds the screen until the judge hand-over
    if (k !== 'timesup') {
      el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
      setTimeout(() => el.remove(), 4000);
    }`,
      'finish tape lifetime');

    // 4) the removal helper
    code = replaceOnceFinish(code,
      `  banner(kind = 'custom', text) {`,
      `  /** Issue #580: drop the Finish tape when the judge / results hand-over takes the screen. */
  clearFinishTape() { this.bannerLayer.querySelectorAll('.iw-bn--finish').forEach((b) => b.remove()); }

  banner(kind = 'custom', text) {`,
      'clearFinishTape method');

    // 5) cleared exactly at the judge transition (state order itself is untouched)
    const statePrefix = `        if (state === 'finish' || state === 'judge') {`;
    code = replaceOnceFinish(code, statePrefix,
      `        if (state === 'judge') this.clearFinishTape();
${statePrefix}`,
      'finish tape cleared at judge');

    // 6) and again for a fresh round / attract, so no tape survives into the next match
    code = replaceOnceFinish(code,
      `    this.kcards.innerHTML = ''; this.callouts.innerHTML = ''; this.tpops.innerHTML = ''; this.downLayer.innerHTML = ''; this._downs = [];`,
      `    this.kcards.innerHTML = ''; this.callouts.innerHTML = ''; this.tpops.innerHTML = ''; this.downLayer.innerHTML = ''; this._downs = [];
    this.clearFinishTape();`,
      'finish tape cleared on new round');

    return code;
  }

  // ---- styles/hud.css: the tape itself (append-only, so it can never fight an existing rule)
  if (rel === 'styles/hud.css') {
    if (code.includes('.iw-bn--finish')) throw new Error('INKWAVE quality patch conflict (finish tape: css already patched): expected exactly one connection');
    return code + FINISH_CSS;
  }

  return code;
}