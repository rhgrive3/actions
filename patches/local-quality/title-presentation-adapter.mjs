// Build-only title redesign. The native Menus owner keeps input, audio unlock,
// confirmation delay, cancellation and screen lifetime. This presentation adds
// no loop, timer, remote asset or renderer dependency.
const MARKER = 'ZEVANT title presentation 20261031';
const TITLE_START = '  _scr_title() {';
const TITLE_END = '\n  // ================================================================ SCREEN: main';

const TITLE_METHOD = `  _scr_title() {
    // ZEVANT title presentation 20261031
    const ja = LANG === 'ja';
    const pressTxt = (m) => t(m === 'pad' ? 'PRESS ANY BUTTON' : m === 'touch' ? 'TAP TO START' : 'PRESS ANY KEY');
    const inputIcons = {
      kbm: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M17 8v5H7m4-4-4 4 4 4"/></svg>',
      pad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h8c3 0 4 2 5 7s-1 7-4 3l-1-1H8l-1 1c-3 4-5 2-4-3s2-7 5-7Z"/><path d="M7 9v5m-2-2.5h4m6-1h.1m3 2h.1"/></svg>',
      touch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12V5a2 2 0 0 1 4 0v6l2-1 5 4-2 7H9l-5-6a2 2 0 0 1 3-2l2 2"/><path d="M4 7a7 7 0 0 1 14-1"/></svg>',
    };
    const inputIcon = h('span', { class: 'iw-launch__input-icon', html: inputIcons[this._input] || inputIcons.kbm });
    const inputText = h('span', { class: 'iw-launch__input-text' }, pressTxt(this._input));
    // The button delegates through the section's one native title handler.
    // Leave the gesture bubbling so outer input/audio listeners retain it.
    const start = h('button', { type: 'button', class: 'iw-launch__start',
      'data-title-start': '1', 'aria-label': ja ? 'はじめる' : 'Start' },
      h('span', { class: 'iw-launch__start-label' }, ja ? 'はじめる' : 'START'),
      h('span', { class: 'iw-launch__start-meta', 'aria-hidden': 'true' }, 'ENTER THE FIELD'),
      h('span', { class: 'iw-launch__start-arrow', 'aria-hidden': 'true',
        html: '<svg viewBox="0 0 32 24"><path d="M2 12h26M18 2l10 10-10 10"/></svg>' }));
    const el = h('section', { class: 'iw-screen iw-title iw-launch',
      'aria-label': GAME_TITLE, onclick: () => this._titleGo() },
      h('div', { class: 'iw-launch__scrim', 'aria-hidden': 'true' }),
      h('div', { class: 'iw-launch__field-lines', 'aria-hidden': 'true' }, h('i'), h('i')),
      h('header', { class: 'iw-launch__top' },
        h('div', { class: 'iw-launch__brand' },
          h('span', { class: 'iw-launch__sigil', 'aria-hidden': 'true',
            html: '<svg viewBox="0 0 40 40"><path d="M7 7h28L16 26h16l-5 7H1l19-19H2Z"/></svg>' }),
          h('span', { class: 'iw-launch__brand-name' }, GAME_TITLE)),
        h('div', { class: 'iw-launch__edition' },
          h('span', null, 'TURF ACTION'), h('span', { class: 'iw-launch__version' }, 'v' + this._version()))),
      h('div', { class: 'iw-launch__body' },
        h('div', { class: 'iw-launch__hero' },
          h('div', { class: 'iw-launch__eyebrow', 'aria-hidden': 'true' }, h('i'), 'MAKE YOUR MARK'),
          h('h1', { class: 'iw-launch__wordmark' }, GAME_TITLE),
          h('p', { class: 'iw-launch__tagline' }, ja ? '塗りかえろ、この一瞬を。' : 'Every move. Your territory.'),
          h('div', { class: 'iw-launch__action' }, start,
            h('p', { class: 'iw-launch__input' }, inputIcon, inputText)))),
      h('footer', { class: 'iw-launch__footer' },
        h('div', { class: 'iw-launch__motto', 'aria-hidden': 'true' },
          h('span', null, 'INK.'), h('span', null, 'MOVE.'), h('span', null, 'REPEAT.')),
        h('div', { class: 'iw-launch__demo' }, h('i', { 'aria-hidden': 'true' }), ja ? 'デモプレイ' : 'DEMO PLAY')));
    return {
      el, noCursor: true,
      afterMount: () => { if (this._input !== 'touch') start.focus({ preventScroll: true }); },
      onInputMode: (m) => {
        inputText.textContent = pressTxt(m);
        inputIcon.innerHTML = inputIcons[m] || inputIcons.kbm;
      },
    };
  }
`;

const TITLE_CSS = `
/* ZEVANT title presentation 20261031: static vectors and short entrance motion. */
.iw-screen.iw-launch {
  --launch-lime: #d4fb50; --launch-cyan: #56e5ea; --launch-white: #f4f8f6;
  --launch-pad-x: clamp(24px, 5.2vw, 96px); --launch-pad-y: clamp(22px, 4.7vh, 52px);
  display: flex; flex-direction: column; isolation: isolate; cursor: pointer;
  padding: max(var(--launch-pad-y), env(safe-area-inset-top)) max(var(--launch-pad-x), env(safe-area-inset-right))
    max(var(--launch-pad-y), env(safe-area-inset-bottom)) max(var(--launch-pad-x), env(safe-area-inset-left));
  color: var(--launch-white); font-family: 'Rubik', 'IW JP Body', system-ui, sans-serif;
}
.iw-launch__scrim {
  position: absolute; z-index: -2; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(7,13,19,.98) 0%, rgba(7,13,19,.94) 26%, rgba(7,13,19,.75) 44%, rgba(7,13,19,.12) 76%),
    linear-gradient(0deg, rgba(7,13,19,.86), rgba(7,13,19,0) 25%, rgba(7,13,19,0) 70%, rgba(7,13,19,.7));
}
.iw-launch__field-lines { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.iw-launch__field-lines::before {
  content: ''; position: absolute; right: -3%; top: 15%; width: 38%; height: 69%;
  border: 1px solid rgba(86,229,234,.28); transform: skewX(-17deg);
}
.iw-launch__field-lines i:first-child {
  position: absolute; left: 61%; top: -14%; width: 12px; height: 24%;
  background: var(--launch-lime); transform: rotate(18deg); opacity: .88;
}
.iw-launch__field-lines i:last-child {
  position: absolute; right: 3%; bottom: -14%; width: 6px; height: 35%;
  background: var(--launch-cyan); transform: rotate(18deg); opacity: .7;
}
.iw-launch__top, .iw-launch__footer { display: flex; align-items: center; justify-content: space-between; flex: none; gap: 20px; }
.iw-launch__top { min-height: 32px; }
.iw-launch__brand { display: flex; align-items: center; gap: 10px; }
.iw-launch__sigil { display: block; width: 30px; height: 30px; color: var(--launch-lime); }
.iw-launch__sigil svg { width: 100%; height: 100%; fill: currentColor; }
.iw-launch__brand-name { font-size: 12px; line-height: 1; font-weight: 800; letter-spacing: .24em; }
.iw-launch__edition { display: flex; align-items: center; gap: 18px; font-size: 10px; line-height: 1.5; font-weight: 600; letter-spacing: .17em; white-space: nowrap; }
.iw-launch__version { padding-left: 18px; border-left: 1px solid rgba(244,248,246,.3); color: #c7d2d6; letter-spacing: .05em; }
.iw-launch__body { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; padding: 24px 0; }
.iw-launch__hero { width: min(720px, 65%); padding: 0 0 2vh; animation: iw-launch-enter .68s cubic-bezier(.2,.7,.2,1) both; }
.iw-launch__eyebrow { display: flex; align-items: center; gap: 10px; margin-bottom: clamp(18px, 3.2vh, 34px); color: var(--launch-cyan); font-size: clamp(10px, .9vw, 12px); line-height: 1; font-weight: 700; letter-spacing: .28em; }
.iw-launch__eyebrow i { display: block; width: 24px; height: 2px; background: currentColor; }
.iw-launch__wordmark {
  position: relative; display: inline-block; max-width: 100%; margin: 0 0 0 -.055em; padding-right: .12em;
  font-family: 'Rubik', system-ui, sans-serif; font-size: clamp(68px, 10.4vw, 156px);
  line-height: .95; font-weight: 900; font-style: italic; letter-spacing: -.075em; white-space: nowrap;
  color: var(--launch-white); text-shadow: 3px 3px 0 rgba(86,229,234,.38); -webkit-text-stroke: 0;
}
.iw-launch__wordmark::after {
  content: ''; display: inline-block; width: .065em; height: .68em; margin-left: .13em;
  transform: skewX(-16deg); background: var(--launch-lime);
}
.iw-launch__tagline { margin: 25px 0 0; font-size: clamp(13px, 1.25vw, 18px); line-height: 1.6; font-weight: 700; letter-spacing: .14em; color: #e2eaec; }
.iw-launch__action { width: min(360px, 100%); margin-top: clamp(34px, 6.4vh, 70px); }
.iw-launch__start {
  position: relative; display: flex; align-items: center; width: 100%; min-height: 66px;
  padding: 15px 22px; border: 1px solid var(--launch-lime); border-radius: 2px;
  background: var(--launch-lime); color: #10170c; cursor: pointer; touch-action: manipulation;
  font-family: inherit; text-align: left; transform: skewX(-7deg); -webkit-tap-highlight-color: transparent;
  transition: background-color .16s, border-color .16s, transform .16s;
}
.iw-launch__start-label { font-size: clamp(20px, 1.7vw, 25px); line-height: 1.2; font-weight: 800; letter-spacing: .12em; transform: skewX(7deg); }
.iw-launch__start-meta { margin-left: auto; padding-left: 12px; font-size: 8px; line-height: 1.5; font-weight: 700; letter-spacing: .08em; transform: skewX(7deg); }
.iw-launch__start-arrow { display: block; width: 27px; height: 22px; flex: 0 0 27px; margin-left: 17px; transform: skewX(7deg); transition: translate .18s; }
.iw-launch__start-arrow svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linejoin: miter; }
.iw-launch__start:focus-visible { outline: 3px solid var(--launch-white); outline-offset: 5px; }
.iw-launch__start:active { transform: skewX(-7deg) translateY(2px); }
.iw-launch__input { display: flex; align-items: center; justify-content: center; gap: 9px; margin: 17px 0 0; font-size: 12px; line-height: 1.5; color: #c4cfd2; letter-spacing: .05em; }
.iw-launch__input-icon { display: block; width: 19px; height: 19px; flex: 0 0 19px; color: #d9e4e7; }
.iw-launch__input-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.iw-launch__footer { min-height: 20px; padding-top: 18px; border-top: 1px solid rgba(226,234,236,.17); }
.iw-launch__motto { display: flex; gap: 19px; font-size: 10px; line-height: 1.5; font-weight: 700; letter-spacing: .19em; }
.iw-launch__motto span:first-child { color: var(--launch-lime); }
.iw-launch__demo { display: flex; align-items: center; gap: 8px; font-size: 10px; line-height: 1.5; font-weight: 600; letter-spacing: .16em; color: #d0dce1; }
.iw-launch__demo i { display: block; width: 6px; height: 6px; border: 1px solid var(--launch-cyan); transform: rotate(45deg); }
.iw-launch.is-go .iw-launch__start { background: var(--launch-white); border-color: var(--launch-white); }
.iw-launch.is-go .iw-launch__start-arrow { translate: 5px 0; }
@keyframes iw-launch-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (hover: hover) and (pointer: fine) {
  .iw-launch__start:hover { background: #e3ff8c; border-color: #e3ff8c; }
  .iw-launch__start:hover .iw-launch__start-arrow { translate: 5px 0; }
}
@media (max-width: 760px) and (min-height: 501px) {
  .iw-screen.iw-launch { --launch-pad-x: clamp(24px, 7vw, 40px); --launch-pad-y: clamp(24px, 5vh, 42px); }
  .iw-launch__scrim { background: linear-gradient(90deg, rgba(7,13,19,.5), rgba(7,13,19,.18)),
    linear-gradient(0deg, rgba(7,13,19,.97), rgba(7,13,19,.87) 20%, rgba(7,13,19,.46) 58%, rgba(7,13,19,.62)); }
  .iw-launch__top { align-items: flex-start; }
  .iw-launch__brand-name { font-size: 10px; letter-spacing: .18em; }
  .iw-launch__edition { flex-direction: column; align-items: flex-end; gap: 3px; font-size: 8px; letter-spacing: .1em; }
  .iw-launch__version { padding: 0; border: 0; font-size: 9px; }
  .iw-launch__body { align-items: flex-end; padding: 40px 0 38px; }
  .iw-launch__hero { width: 100%; padding: 0; }
  .iw-launch__eyebrow { margin-bottom: 22px; font-size: 10px; letter-spacing: .2em; }
  .iw-launch__wordmark { font-size: clamp(60px, 16vw, 104px); }
  .iw-launch__tagline { margin-top: 20px; font-size: 13px; letter-spacing: .08em; }
  .iw-launch__action { margin-top: 38px; width: 100%; max-width: 410px; }
  .iw-launch__start { min-height: 64px; }
  .iw-launch__start-meta { font-size: 8px; }
  .iw-launch__input { margin-top: 16px; font-size: 11px; }
  .iw-launch__field-lines::before { top: 12%; right: -14%; width: 72%; height: 36%; }
  .iw-launch__field-lines i:first-child { left: 78%; top: -11%; height: 23%; width: 8px; }
  .iw-launch__field-lines i:last-child { bottom: -15%; height: 30%; width: 4px; }
  .iw-launch__motto { gap: 11px; font-size: 8px; letter-spacing: .13em; }
  .iw-launch__demo { font-size: 9px; letter-spacing: .1em; }
}
@media (max-height: 500px) {
  .iw-screen.iw-launch { --launch-pad-x: clamp(24px, 5vw, 48px); --launch-pad-y: 18px; }
  .iw-launch__top { min-height: 24px; }
  .iw-launch__sigil { width: 23px; height: 23px; }
  .iw-launch__brand-name { font-size: 10px; }
  .iw-launch__edition { font-size: 8px; gap: 12px; }
  .iw-launch__version { padding-left: 12px; }
  .iw-launch__body { padding: 16px 0; }
  .iw-launch__hero { width: 72%; padding: 0; }
  .iw-launch__eyebrow { font-size: 8px; margin-bottom: 12px; }
  .iw-launch__wordmark { font-size: clamp(52px, 9.5vw, 89px); }
  .iw-launch__tagline { margin-top: 12px; font-size: 11px; }
  .iw-launch__action { width: 290px; max-width: 100%; margin-top: 22px; }
  .iw-launch__start { min-height: 48px; padding: 10px 17px; }
  .iw-launch__start-label { font-size: 18px; }
  .iw-launch__start-meta { font-size: 7px; }
  .iw-launch__start-arrow { width: 22px; height: 18px; flex-basis: 22px; margin-left: 12px; }
  .iw-launch__input { margin-top: 9px; font-size: 10px; }
  .iw-launch__input-icon { width: 15px; height: 15px; flex-basis: 15px; }
  .iw-launch__footer { padding-top: 10px; min-height: 15px; }
  .iw-launch__motto, .iw-launch__demo { font-size: 8px; }
}
@media (max-height: 360px) {
  .iw-screen.iw-launch { --launch-pad-y: 12px; }
  .iw-launch__body { padding: 10px 0; }
  .iw-launch__eyebrow { display: none; }
  .iw-launch__wordmark { font-size: 56px; }
  .iw-launch__tagline { margin-top: 9px; }
  .iw-launch__action { margin-top: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .iw-screen.iw-launch, .iw-launch *, .iw-launch *::before, .iw-launch *::after { animation: none !important; transition: none !important; }
}
`;

export function adaptTitlePresentation(rel, code, replaceOnce) {
  if (rel !== 'src/ui/menus.js' && rel !== 'styles/ui.css') return code;
  if (code.includes(MARKER)) throw new Error('ZEVANT title presentation applied twice: ' + rel);
  if (rel === 'styles/ui.css') return code + TITLE_CSS;
  const from = code.indexOf(TITLE_START), to = code.indexOf(TITLE_END, from);
  if (from < 0 || to <= from || code.indexOf(TITLE_START, from + TITLE_START.length) >= 0)
    throw new Error('ZEVANT title presentation: missing or ambiguous native title screen');
  const previous = code.slice(from, to);
  if (!previous.includes('this._titleGo()') || !previous.includes('onInputMode:'))
    throw new Error('ZEVANT title presentation: unexpected title input contract');
  return replaceOnce(code, previous, TITLE_METHOD, 'ZEVANT complete title presentation');
}
