// Build-only owner feedback pass, 2026-11-04. Runs after every other menu/UI
// adapter (anchors are the final composed text) and before the viewport cache.
//
// - Menus: rapid open/back cannot stack heavy screens (touch releases the
//   outgoing screen synchronously and drops stale leaving screens); backdrop
//   layers stay pinned while a screen scrolls; the focus-leave ink is an ink
//   splat instead of a round dot; the main menu is a tile layout; descriptions
//   the owner asked to remove are not shown; weapons are listed by class.
// - Icons: dedicated Splatana / Brush / Stringer / Brella list icons.
// - Results: the result BGM is preloaded with the jingle and enters over the
//   jingle's quiet tail instead of after the full file plus a cold load.
// - Audio: a synthesized Clam Blitz pickup chime (pitch set by the caller).
const MARKER = 'ZEVANT owner feedback 20261104';

// Ink splat silhouette for button fills (INKWAVE artwork, 100x100 box; the
// core never comes closer than 34 units to the centre, so a 300 % fill still
// covers the button from any arrival side).
const SPLAT_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='" +
  'M91.6 50.0 L91.9 52.7 L91.6 55.5 L92.7 58.5 L95.7 62.2 L94.7 65.2 L88.7 66.0 L84.0 66.8 L81.3 68.1 L79.2 69.5 L77.7 71.2 L76.7 73.4 L76.0 76.0 L75.1 78.6 L73.5 80.7 L71.5 82.2 L69.9 84.5 L68.9 88.3 L66.5 89.9 L63.1 88.7 L60.5 89.0 L58.1 90.9 L55.5 92.1 L52.7 91.8 L50.0 90.3 L47.5 88.3 L45.2 86.5 L43.0 85.3 L40.6 85.0 L37.5 86.9 L33.2 90.7 L30.4 89.8 L30.2 84.4 L29.2 81.1 L26.8 80.2 L24.0 79.7 L21.6 78.4 L20.0 76.3 L19.1 73.7 L18.4 71.1 L17.2 68.9 L15.3 67.1 L12.5 65.6 L8.3 64.2 L4.5 62.2 L5.9 58.8 L10.6 55.2 L14.0 52.4 L15.6 50.0 L16.1 47.8 L15.7 45.5 L15.1 43.1 L14.8 40.6 L14.7 38.0 L14.4 35.3 L12.2 31.4 L8.5 26.0 L9.2 22.7 L14.5 22.8 L19.0 22.9 L22.2 22.2 L25.0 21.5 L27.3 20.4 L29.1 18.7 L30.7 16.5 L32.6 14.6 L34.9 13.7 L37.7 13.9 L40.4 14.3 L42.5 12.4 L44.6 9.1 L47.3 9.6 L50.0 12.1 L52.5 12.1 L55.1 11.2 L57.8 10.7 L60.5 11.0 L63.0 11.6 L65.6 12.4 L68.0 13.4 L70.2 15.0 L72.0 17.1 L73.8 19.0 L77.0 19.2 L80.3 19.7 L80.7 23.1 L80.5 26.6 L81.7 28.8 L83.1 30.9 L83.5 33.5 L83.2 36.2 L83.0 38.8 L83.5 41.0 L85.2 43.0 L87.7 45.0 L90.1 47.4Z M97.5 73.1 A3.2 3.2 0 1 0 91.1 73.1 A3.2 3.2 0 1 0 97.5 73.1Z M63.8 96.6 A2.4 2.4 0 1 0 59.0 96.6 A2.4 2.4 0 1 0 63.8 96.6Z M23.2 92.6 A3.0 3.0 0 1 0 17.2 92.6 A3.0 3.0 0 1 0 23.2 92.6Z M5.1 52.9 A2.0 2.0 0 1 0 1.1 52.9 A2.0 2.0 0 1 0 5.1 52.9Z M56.0 0.1 A2.6 2.6 0 1 0 50.8 0.1 A2.6 2.6 0 1 0 56.0 0.1Z M91.2 23.1 A2.1 2.1 0 1 0 87.0 23.1 A2.1 2.1 0 1 0 91.2 23.1Z' +
  "'/%3E%3C/svg%3E\")";

const MENU_CSS = `
/* ${MARKER}: menus */
.iw-btn__blob {
  width: 300%; border-radius: 0;
  -webkit-mask: ${SPLAT_MASK} center / 100% 100% no-repeat; mask: ${SPLAT_MASK} center / 100% 100% no-repeat;
  transform: translate(-50%, -50%) scale(0) rotate(-28deg);
}
.iw-btn__blob::after { border-radius: 50%; }
.iw-btn.is-hover:not(.is-focus) .iw-btn__blob { transform: translate(-50%, -50%) scale(.1) rotate(-12deg); }
/* Descriptions the owner asked to remove. */
.iw-main__desc, .iw-mode__blurb, .iw-ss__blurb, .iw-ss__timetext,
.iw-modesel > .iw-head .iw-head__sub, .iw-setup > .iw-head .iw-head__sub { display: none !important; }
/* Stages that cannot be played are not listed at all. */
.iw-native-unavailable { display: none !important; }
/* Touch: only the first rows of weapon cards pop in; the rest appear settled. */
html.iw-touch .iw-wcard.iw-in:nth-child(n+13), .iw-ui.is-touch .iw-wcard.iw-in:nth-child(n+13) { animation: none; }

/* Main menu: game-style tiles. One large Battle tile, Online and Weapons beside
   it, and four square system tiles underneath. Keyboard/pad spatial navigation
   follows the rectangles, so no focus graph changes. */
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu {
  --tile-row: calc(var(--u) * 5.1); --tile-sys: calc(var(--u) * 6.9);
  display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: auto;
  gap: calc(var(--u) * .9); width: calc(var(--u) * 47); align-content: start;
}
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > .iw-btn {
  width: auto; height: auto; min-height: var(--tile-row); margin: 0; min-width: 0;
}
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="play"] {
  grid-column: 1 / 8; grid-row: 1 / 3; flex-direction: column; align-items: flex-start; justify-content: flex-end;
  gap: calc(var(--u) * .6); padding: calc(var(--u) * 1.6) calc(var(--u) * 1.8); font-size: calc(var(--u) * 3.9);
}
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="play"] .iw-btn__icon { width: 1.25em; height: 1.25em; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="play"] .iw-btn__sub { white-space: normal; line-height: 1.25; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] { grid-column: 8 / 13; grid-row: 1; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="loadout"] { grid-column: 8 / 13; grid-row: 2; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="online"], [data-id="loadout"]) {
  display: flex; align-items: center; padding: calc(var(--u) * .8) calc(var(--u) * 1.2); font-size: calc(var(--u) * 2);
}
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] .iw-btn__sub { display: none; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] .iw-btn__live { position: absolute; right: calc(var(--u) * .6); bottom: calc(var(--u) * .45); top: auto; margin: 0; font-size: max(10px, calc(var(--u) * .85)); }
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] .iw-btn__live { right: 6px; bottom: 4px; padding: 2px 6px; font-size: 10px; }
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] { padding-bottom: 18px; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="locker"], [data-id="settings"], [data-id="howto"], [data-id="credits"]) {
  grid-row: 3; min-height: var(--tile-sys); flex-direction: column; justify-content: center; align-items: center;
  gap: calc(var(--u) * .45); padding: calc(var(--u) * .7) calc(var(--u) * .4); text-align: center; font-size: calc(var(--u) * 1.5);
}
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="locker"], [data-id="settings"], [data-id="howto"], [data-id="credits"]) .iw-btn__icon { width: 1.9em; height: 1.9em; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="locker"], [data-id="settings"], [data-id="howto"], [data-id="credits"]) .iw-btn__text { align-items: center; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="locker"], [data-id="settings"], [data-id="howto"], [data-id="credits"]) .iw-btn__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="locker"] { grid-column: 1 / 4; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="settings"] { grid-column: 4 / 7; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="howto"] { grid-column: 7 / 10; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="credits"] { grid-column: 10 / 13; }
html body .iw-ui .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > .iw-btn.is-focus { transform: rotate(0deg) translateY(calc(var(--u) * -.3)) scale(1.035); }
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu {
  --tile-row: 64px; --tile-sys: 84px; width: auto; gap: 12px;
}
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="play"] { font-size: 34px; padding: 18px 20px; }
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="online"], [data-id="loadout"]) { font-size: 21px; padding: 10px 14px; }
:is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="locker"], [data-id="settings"], [data-id="howto"], [data-id="credits"]) { font-size: 15px; padding: 8px 4px; }
@media (orientation: landscape) and (max-height: 500px) {
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu { --tile-row: 50px; --tile-sys: 62px; gap: 8px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="play"] { font-size: 26px; padding: 10px 14px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="play"] .iw-btn__sub { font-size: 12px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="online"], [data-id="loadout"]) { font-size: 17px; padding: 6px 10px; gap: 8px; }
  /* short phones: the live badge keeps only its red dot, in the tile corner */
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] { padding-bottom: 6px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > [data-id="online"] .iw-btn__live { top: 6px; bottom: auto; right: 6px; font-size: 0; gap: 0; padding: 4px; }
  :is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-main.iw-main--tiles.iw-main--tiles .iw-main__menu > :is([data-id="locker"], [data-id="settings"], [data-id="howto"], [data-id="credits"]) { font-size: 12px; gap: 4px; }
}
`;

// 64x64 list icons, drawn in the existing two-tone weapon icon style
// (outline K, dark DK, light LT, ink = currentColor). INKWAVE artwork.
const ADDED_ICONS = `
// ${MARKER}: Splatana / Brush / Stringer / Brella list icons.
WEAPON_ICONS.splatana = svg(\`<g \${O}>
      <path d="M6.5 52.5 L14 45 L19.5 50.5 L12 58 Q9 61 6 58 Q3.5 55.5 6.5 52.5 Z" fill="\${DK}"/>
      <path d="M11.5 38.5 L25.5 52.5 L29.5 48.5 L15.5 34.5 Z" fill="\${LT}"/>
      <path d="M19 41 L51 7.5 Q59 1.5 58 10.5 L24 46.5 Z" fill="currentColor"/>
    </g>
    <path d="M24.5 40 L52.5 10.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    <path d="M27 50.5 Q33 55 30 60" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="44" cy="31" r="3" class="iw-fa" fill="currentColor" stroke="\${K}" stroke-width="2"/>\`);
WEAPON_ICONS.brush = svg(\`<path d="M33 31 L56 8" stroke="\${K}" stroke-width="10" stroke-linecap="round"/>
    <path d="M33 31 L56 8" stroke="\${DK}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M49 15 L56 8" stroke="\${LT}" stroke-width="3" stroke-linecap="round"/>
    <g \${O}>
      <path d="M22.5 33.5 L30.5 25.5 L38.5 33.5 L30.5 41.5 Z" fill="\${LT}"/>
      <path d="M25 32 Q11 34 6.5 54 Q5.5 59.5 10.5 58 Q29 52 32.5 39.5 Z" fill="currentColor"/>
    </g>
    <path d="M14 47 Q17 41 23 38" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    <circle cx="20" cy="59" r="2.6" fill="currentColor" stroke="\${K}" stroke-width="1.8"/>\`);
WEAPON_ICONS.stringer = svg(\`<path d="M18 5 Q46 32 18 59" fill="none" stroke="\${K}" stroke-width="9" stroke-linecap="round"/>
    <path d="M18 5 Q46 32 18 59" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M18 5 L10.5 32 L18 59" fill="none" stroke="\${K}" stroke-width="1.8" stroke-linejoin="round"/>
    <g \${O}>
      <rect x="27.5" y="25.5" width="9" height="13" rx="3.2" fill="\${DK}"/>
      <path d="M10.5 32 L52 32" fill="none" stroke-width="3"/>
      <path d="M50 25.5 L61 32 L50 38.5 Z" fill="currentColor"/>
      <path d="M10.5 32 L5 27.5 M10.5 32 L5 36.5" fill="none" stroke-width="2.4"/>
    </g>
    <path d="M44 22 L56 17 M44 42 L56 47" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>\`);
WEAPON_ICONS.brella = svg(\`<g \${O}>
      <rect x="29.5" y="2.5" width="5" height="7" rx="1.8" fill="\${DK}"/>
      <path d="M5.5 33 Q7 8 32 7.5 Q57 8 58.5 33 Q52 28.5 45.5 33 Q38.5 28 32 33 Q25.5 28 18.5 33 Q12 28.5 5.5 33 Z" fill="currentColor"/>
      <path d="M32 33 L32 52" fill="none" stroke-width="7"/>
      <path d="M32 52 Q32 59.5 25 59.5 Q20 59.5 20 54" fill="none" stroke-width="7"/>
    </g>
    <path d="M32 33 L32 52" stroke="\${LT}" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 52 Q32 59.5 25 59.5 Q20 59.5 20 54" fill="none" stroke="\${DK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 8.5 Q24 18 18.5 31.5 M32 8.5 Q40 18 45.5 31.5" fill="none" stroke="\${K}" stroke-width="2"/>
    <path d="M13 24 Q17 14.5 26 12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>\`);
`;

// Weapon list order: the class order of the in-game weapon list, then the
// existing registration order inside each class (base kit before its variants).
const WEAPON_ORDER_METHOD = `  _weaponOrder() {
    // ${MARKER}: list by weapon class instead of registration batches.
    const base = this.api.weaponOrder || WEAPON_ORDER, W = this._weapons();
    const cache = this._iwSortedWeaponOrder;
    if (cache && cache.base === base && cache.length === base.length && cache.weapons === W) return cache.order;
    const classes = ['shooter', 'blaster', 'roller', 'brush', 'charger', 'slosher', 'splatling', 'dualies', 'brella', 'stringer', 'splatana'];
    const rank = (id) => { const w = W[id], i = classes.indexOf(w?.catalogRecord?.family || w?.kind || ''); return i < 0 ? classes.length : i; };
    const order = base.map((id, i) => [id, rank(id), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((row) => row[0]);
    this._iwSortedWeaponOrder = { base, length: base.length, weapons: W, order };
    return order;
  }`;

// Screens whose DOM is large enough that two copies must never coexist on touch.
const SWAP_GUARD = `      // ${MARKER}: at most one leaving screen; heavy screens leave at once on touch.
      for (const stale of this.layer.querySelectorAll(':scope > .iw-screen.is-leaving')) if (stale !== oe) stale.remove();
      const iwTouch = document.documentElement.classList.contains('iw-touch') || this.el.classList.contains('is-touch');
      const iwHeavy = ['loadout', 'settings', 'locker', 'setup', 'online', 'howto', 'credits'];
      if (opts.pausedBattle || (iwTouch && (iwHeavy.includes(old.name) || iwHeavy.includes(name)))) oe.remove();
`;

const BACKDROP_PIN = `    // ${MARKER}: full-cover backdrop layers stay put while a screen scrolls.
    if (!this._iwBackdropPin) {
      this._iwBackdropPin = (event) => {
        const box = event.target;
        if (!(box instanceof HTMLElement) || !(box.classList.contains('iw-screen') || box.classList.contains('iw-modal'))) return;
        if (!box._iwBackdrops) {
          box._iwBackdrops = [...box.children].filter((child) => {
            if (!(child instanceof HTMLElement) || child.textContent.trim() || child.querySelector('button, input, select, a, [data-nav]')) return false;
            const cs = getComputedStyle(child);
            return (cs.position === 'absolute' || cs.position === 'fixed') && child.offsetWidth >= box.clientWidth * 0.9 && child.offsetHeight >= box.clientHeight * 0.9;
          });
        }
        const y = box.scrollTop;
        for (const layer of box._iwBackdrops) { layer.style.top = y + 'px'; layer.style.bottom = -y + 'px'; }
      };
      this.layer.addEventListener('scroll', this._iwBackdropPin, { capture: true, passive: true });
    }
    this.layer.appendChild(scr.el);`;

const RESULT_MUSIC_OLD = `    G.audio?.play(won ? 'victory_fanfare' : 'defeat_jingle');
    const resultsTimer = this._resultsMusicTimer = setTimeout(() => {
      if (this._resultsMusicTimer !== resultsTimer) return;
      this._resultsMusicTimer = null;
      if (resultsCurrent() && m.state === 'results' && this.menus?.current === 'results' && this._s3JudgeEpoch === judgeEpoch)
        this._playMusic(won ? 'results_win' : 'results_lose');
    }, Math.max(2600, Math.ceil((G.audio?.recordedCueSeconds?.(won ? 'victory_fanfare' : 'defeat_jingle') || 0) * 1000)));`;
const RESULT_MUSIC_NEW = `    G.audio?.play(won ? 'victory_fanfare' : 'defeat_jingle');
    // ${MARKER}: load the result recording while the jingle plays and enter
    // over the jingle's quiet tail (victory audible to ~5.3 s of 5.8 s, defeat
    // to ~5.9 s of 6.9 s) with a short fade, instead of after the whole file
    // plus a cold media load and a 1.2 s fade from silence.
    try { G.music?.preloadFile?.(won ? 'results_win' : 'results_lose'); } catch (e) { /* recording stays optional */ }
    const resultsTimer = this._resultsMusicTimer = setTimeout(() => {
      if (this._resultsMusicTimer !== resultsTimer) return;
      this._resultsMusicTimer = null;
      if (resultsCurrent() && m.state === 'results' && this.menus?.current === 'results' && this._s3JudgeEpoch === judgeEpoch)
        this._playMusic(won ? 'results_win' : 'results_lose', 0.35);
    }, Math.max(2600, Math.ceil(((G.audio?.recordedCueSeconds?.(won ? 'victory_fanfare' : 'defeat_jingle') || 0) - (won ? 0.6 : 1.0)) * 1000)));`;

const CLAM_SOUND = `// ${MARKER}: Clam Blitz pickup chime. The caller raises pitch per held clam.
def('clam_pickup', { gain: 0.24, max: 3, jitter: 0, reverb: 0.08, minGap: 0.04, build(v, p) { uiNote(v, 0, 86, p, 0.5); uiNote(v, 0.055, 93, p, 0.42); v.tone({ t: 0.055, type: 'triangle', f: mtof(98) * p, a: 0.001, d: 0.12, peak: 0.1 }); } });
`;

export function adaptUiFeedback20261104(rel, code, replaceOnce) {
  const once = (before, after, label) => { code = replaceOnce(code, before, after, MARKER + ' ' + label); };
  if (rel === 'styles/ui.css') {
    if (code.includes(MARKER)) throw new Error(MARKER + ' applied twice: ' + rel);
    return code + '\n' + MENU_CSS;
  }
  if (rel === 'src/ui/ui-icons.js') {
    if (code.includes(MARKER)) throw new Error(MARKER + ' applied twice: ' + rel);
    once('export const weaponIcon = (idOrKind) => {\n  const weapon = WEAPONS[idOrKind];\n  const family = weapon?.modelKind || weapon?.kind || idOrKind;',
      ADDED_ICONS + 'export const weaponIcon = (idOrKind) => {\n  const weapon = WEAPONS[idOrKind];\n  const added = weapon?.catalogRecord?.family;\n  const family = added && WEAPON_ICONS[added] ? added : weapon?.modelKind || weapon?.kind || idOrKind;', 'family list icons');
    return code;
  }
  if (rel === 'src/main.js') {
    once(RESULT_MUSIC_OLD, RESULT_MUSIC_NEW, 'result music hand-off');
    return code;
  }
  if (rel === 'src/audio/audio.js') {
    once("def('ui_confirm', {", CLAM_SOUND + "def('ui_confirm', {", 'clam pickup chime');
    return code;
  }
  if (rel !== 'src/ui/menus.js') return code;
  if (code.includes(MARKER)) throw new Error(MARKER + ' applied twice: ' + rel);
  once('  _weaponOrder() { return this.api.weaponOrder || WEAPON_ORDER; }', WEAPON_ORDER_METHOD, 'weapon class order');
  once("      if (opts.pausedBattle) oe.remove();\n", SWAP_GUARD, 'screen swap release');
  once('    this.layer.appendChild(scr.el);', BACKDROP_PIN, 'backdrop pin');
  once("class: 'iw-screen iw-main' }", "class: 'iw-screen iw-main iw-main--tiles' }", 'main tiles');
  once('      desc,\n      h(\'div\', { class: \'iw-main__side\' }', "      h('div', { class: 'iw-main__side' }", 'main description');
  // Rapid taps on touch: a push navigation in the first 160 ms after the last
  // screen change is the same gesture landing twice, not a new request.
  once('    if (name === prev && !force) return;',
    "    if (name === prev && !force) return;\n    if (opts.push && prev && (document.documentElement.classList.contains('iw-touch') || this.el.classList.contains('is-touch')) && performance.now() - (this._shownAt || 0) < 160) return;",
    'touch double navigation');
  return code;
}
