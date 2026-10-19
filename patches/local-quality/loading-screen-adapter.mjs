// Display-only ZEVANT loading screen. The static startup shell (patches/loading-cache/shell.html)
// uses the same markup classes, so the boot shell and the native loading screen read as one scene.
// Only transform/opacity animate: boot work holds the main thread, the compositor does not.
import { replaceOnce } from './adapter.mjs';

// Angular ZEVANT wordmark, 100 units tall, sheared by the outer group.
const WORDMARK_PATH = 'M0 0H80V18L26 82H80V100H0V82L54 18H0Z' +
  'M94 0H164V18H114V41H154V59H114V82H164V100H94Z' +
  'M178 0H199L221 74L243 0H264L232 100H210Z' +
  'M310 0H332L364 100H343L321 28L299 100H278Z' +
  'M378 0H398L436 64V0H456V100H436L398 36V100H378Z' +
  'M470 0H546V18H518V100H498V18H470Z';
export const WORDMARK_VIEWBOX = '0 0 568 100';
const WORDMARK_SHEAR = 'translate(21 0) skewX(-12)';

/** Inline wordmark; `id` keeps gradient ids unique between the shell and the native screen. */
export function zevantWordmark(id) {
  return `<svg viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true"><defs>` +
    `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#dfe4f0"/><stop offset="1" stop-color="#8e98b2"/></linearGradient></defs>` +
    `<g transform="${WORDMARK_SHEAR}"><path d="${WORDMARK_PATH}" transform="translate(-3 0)" style="fill:var(--a)" opacity=".8"/>` +
    `<path d="${WORDMARK_PATH}" transform="translate(3 0)" style="fill:var(--b)" opacity=".8"/>` +
    `<path d="${WORDMARK_PATH}" fill="url(#${id}-g)"/></g></svg><span class="iw-zl__shine"></span>`;
}
const WORDMARK_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}" preserveAspectRatio="none"><path transform="${WORDMARK_SHEAR}" d="${WORDMARK_PATH}"/></svg>`)}")`;

const LOADING_CSS = `
/* ZEVANT loading screen: native .iw-loading.iw-zl and the static startup shell (.iw-load-shell.iw-zl). */
.iw-zl { background: #05050b; overflow: hidden; color: #fff; }
.iw-zl.iw-loading::after, .iw-zl.iw-load-shell::after { content: ''; position: absolute; inset: 0; pointer-events: none; -webkit-mask-image: none; mask-image: none;
  background: radial-gradient(ellipse 115% 95% at 50% 46%, transparent 50%, rgba(0, 0, 0, .7) 100%); }
.iw-zl__bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.iw-zl__bg > i { position: absolute; display: block; }
.iw-zl__glow { width: 110vmax; height: 110vmax; border-radius: 50%; will-change: transform; }
.iw-zl__glow--a { left: -62vmax; top: -70vmax; background: radial-gradient(closest-side, rgba(var(--a-rgb), .42), rgba(var(--a-rgb), 0)); animation: iw-zl-drift-a 16s ease-in-out infinite alternate; }
.iw-zl__glow--b { right: -62vmax; bottom: -72vmax; background: radial-gradient(closest-side, rgba(var(--b-rgb), .5), rgba(var(--b-rgb), 0)); animation: iw-zl-drift-b 19s ease-in-out infinite alternate; }
@keyframes iw-zl-drift-a { to { transform: translate(14vmax, 9vmax) scale(1.12); } }
@keyframes iw-zl-drift-b { to { transform: translate(-12vmax, -7vmax) scale(1.1); } }
.iw-zl__grid { inset: 0; background-image: linear-gradient(rgba(255, 255, 255, .05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, .05) 1px, transparent 1px);
  background-size: calc(var(--u) * 4) calc(var(--u) * 4); background-position: 50% 50%;
  -webkit-mask-image: radial-gradient(ellipse 62% 58% at 50% 46%, #000, transparent 78%); mask-image: radial-gradient(ellipse 62% 58% at 50% 46%, #000, transparent 78%); }
.iw-zl__beam { top: -60%; bottom: -60%; left: 0; width: 34vw; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .07), transparent);
  transform: translateX(-50vw) skewX(-22deg); animation: iw-zl-beam 7s cubic-bezier(.45, 0, .2, 1) infinite 1s; will-change: transform; }
@keyframes iw-zl-beam { 0% { transform: translateX(-50vw) skewX(-22deg); } 42%, 100% { transform: translateX(150vw) skewX(-22deg); } }
.iw-zl__c { position: absolute; width: calc(var(--u) * 2.2); height: calc(var(--u) * 2.2); border: 0 solid rgba(255, 255, 255, .32); pointer-events: none; }
.iw-zl__c--tl { left: calc(var(--u) * 2.4); top: calc(var(--u) * 2.4); border-width: 1.5px 0 0 1.5px; }
.iw-zl__c--tr { right: calc(var(--u) * 2.4); top: calc(var(--u) * 2.4); border-width: 1.5px 1.5px 0 0; }
.iw-zl__c--bl { left: calc(var(--u) * 2.4); bottom: calc(var(--u) * 2.4); border-width: 0 0 1.5px 1.5px; }
.iw-zl__c--br { right: calc(var(--u) * 2.4); bottom: calc(var(--u) * 2.4); border-width: 0 1.5px 1.5px 0; }
.iw-zl__status { position: absolute; left: calc(var(--u) * 3.6); top: calc(var(--u) * 3.3); display: flex; align-items: center; gap: .9em;
  font: 700 var(--fs-xs) / 1 'Rubik', 'IW JP Body', sans-serif; letter-spacing: .32em; color: rgba(255, 255, 255, .62); }
.iw-zl__dot { width: .62em; height: .62em; background: var(--a); box-shadow: 0 0 .8em rgba(var(--a-rgb), .9); animation: iw-zl-blink 1.1s steps(2, jump-none) infinite; }
@keyframes iw-zl-blink { 50% { opacity: .15; } }
.iw-zl__center { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: max(260px, calc(var(--u) * 46)); max-width: calc(100vw - 48px);
  display: flex; flex-direction: column; align-items: stretch; }
.iw-zl__mark { position: relative; margin: 0; font-size: inherit; line-height: 0; }
.iw-zl__mark svg { display: block; width: 100%; height: auto; overflow: visible; filter: drop-shadow(0 calc(var(--u) * .5) calc(var(--u) * 1.4) rgba(0, 0, 0, .55)); }
.iw-zl__shine { position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  -webkit-mask: ${WORDMARK_MASK} 0 0 / 100% 100% no-repeat; mask: ${WORDMARK_MASK} 0 0 / 100% 100% no-repeat; }
.iw-zl__shine::before { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 28%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .95) 50%, transparent);
  transform: translateX(-110%); animation: iw-zl-shine 4.2s cubic-bezier(.5, 0, .3, 1) infinite 1.1s; will-change: transform; }
@keyframes iw-zl-shine { 0% { transform: translateX(-110%); } 34%, 100% { transform: translateX(400%); } }
/* Entrance plays once, on the boot shell; the native screen then takes over without re-entering. */
.iw-load-shell .iw-zl__mark { animation: iw-zl-in .9s cubic-bezier(.2, .8, .2, 1) backwards; }
.iw-load-shell .iw-zl__rule { animation: iw-zl-rule 1.1s cubic-bezier(.2, .8, .2, 1) backwards .25s; }
.iw-load-shell :is(.iw-zl__meta, .iw-zl__bar) { animation: iw-zl-fade .8s ease backwards .45s; }
@keyframes iw-zl-in { from { opacity: 0; transform: translateY(calc(var(--u) * 1.2)) scale(.97); } }
.iw-zl__rule { display: block; height: 2px; margin-top: calc(var(--u) * 2.2); background: linear-gradient(90deg, transparent, var(--a) 20%, var(--b) 80%, transparent); opacity: .9; }
@keyframes iw-zl-rule { from { transform: scaleX(0); opacity: 0; } }
.iw-zl__meta { display: flex; justify-content: space-between; align-items: baseline; gap: 1em; margin-top: calc(var(--u) * 4.2); }
@keyframes iw-zl-fade { from { opacity: 0; } }
.iw-zl__label { margin: 0; min-width: 0; font: 700 var(--fs-xs) / 1.4 'Rubik', 'IW JP Body', sans-serif; letter-spacing: .26em; text-transform: uppercase; color: rgba(255, 255, 255, .66);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iw-zl__label.is-in { animation: iw-zl-fade .3s; }
.iw-zl__pct { flex: none; font: 800 max(15px, calc(var(--u) * 1.7)) / 1 'Rubik', sans-serif; letter-spacing: .04em; font-variant-numeric: tabular-nums; color: #fff; }
.iw-zl__bar { position: relative; height: max(10px, calc(var(--u) * 1.2)); margin-top: calc(var(--u) * .6); overflow: hidden;
  background: linear-gradient(rgba(255, 255, 255, .13), rgba(255, 255, 255, .13)) 0 50% / 100% 2px no-repeat; }
.iw-zl__fill { position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; transform: translateX(-100%); will-change: transform;
  background: linear-gradient(90deg, rgba(var(--a-rgb), 0), var(--a) 55%, #fff); box-shadow: 0 0 calc(var(--u) * .8) rgba(var(--a-rgb), .9); }
.iw-zl__fill::after { content: ''; position: absolute; right: calc(var(--u) * -.6); top: 50%; width: calc(var(--u) * 1.2); height: calc(var(--u) * 1.2); margin-top: calc(var(--u) * -.6);
  border-radius: 50%; background: radial-gradient(closest-side, #fff, rgba(var(--a-rgb), .7) 45%, transparent); }
.iw-zl__tip { position: absolute; left: 50%; bottom: calc(var(--u) * 5); transform: translateX(-50%); width: min(calc(var(--u) * 60), calc(100vw - 48px));
  display: flex; align-items: baseline; gap: calc(var(--u) * 1.4); padding-top: calc(var(--u) * 1.3); border-top: 1px solid rgba(255, 255, 255, .14); animation: iw-zl-fade .8s ease backwards .6s; }
.iw-zl__tag { flex: none; font: 800 var(--fs-xs) / 1.5 'Rubik', 'IW JP Body', sans-serif; letter-spacing: .28em; color: var(--a); text-transform: uppercase; }
.iw-zl__tip .iw-tip__text { font: 500 var(--fs-s) / 1.55 'Rubik', 'IW JP Body', sans-serif; color: rgba(255, 255, 255, .8); }
.iw-zl__tip .iw-tip__text.is-in { animation: iw-zl-tip .5s cubic-bezier(.2, .8, .2, 1); }
@keyframes iw-zl-tip { from { opacity: 0; transform: translateY(calc(var(--u) * .5)); } }
.iw-zl > .iw-corner { bottom: calc(var(--u) * 3.1); right: calc(var(--u) * 5.4); letter-spacing: .2em; color: rgba(255, 255, 255, .42); text-shadow: none; }
@media (prefers-reduced-motion: reduce) {
  .iw-zl__glow, .iw-zl__beam, .iw-zl__dot, .iw-zl__shine::before { animation: none !important; }
}
`;

const NATIVE_LOADING_START = "    const fill = h('div', { class: 'iw-progress__fill' }";
// The version line is kept verbatim (localization wraps it), only its entrance class is dropped.
const NATIVE_LOADING_END = "      h('div', { class: 'iw-corner iw-corner--br iw-in' }, ";

export function adaptLoadingScreen(rel, code) {
  if (rel === 'src/config.js') {
    // Loading, title, main menu and credits logos carry the title only.
    return replaceOnce(code, "export const GAME_SUBTITLE = 'Turf Riot';", "export const GAME_SUBTITLE = '';", 'logo subtitle removed');
  }
  if (rel === 'src/ui/menus.js') {
    const start = code.indexOf(NATIVE_LOADING_START), end = code.indexOf(NATIVE_LOADING_END, start);
    const next = code.indexOf('\n  _scr_', start);
    if (start < 0 || end < 0 || next < end || code.indexOf(NATIVE_LOADING_START, start + 1) >= 0) {
      throw new Error('INKWAVE quality patch conflict (loading screen layout): expected exactly one connection');
    }
    // Same owners for tick()/setLabel()/setTip(): fill transform, pctEl text, label text, tipText HTML.
    const screen = `    const fill = h('i', { class: 'iw-zl__fill' });
    const pctEl = h('span', { class: 'iw-zl__pct' }, '0%');
    const label = h('div', { class: 'iw-zl__label' }, this._loading.label);
    const tipText = h('div', { class: 'iw-tip__text' });
    const tip = h('div', { class: 'iw-zl__tip' }, h('span', { class: 'iw-zl__tag' }, 'TIP'), tipText);
    const bg = h('div', { class: 'iw-zl__bg', 'aria-hidden': 'true' }, h('i', { class: 'iw-zl__glow iw-zl__glow--a' }), h('i', { class: 'iw-zl__glow iw-zl__glow--b' }),
      h('i', { class: 'iw-zl__grid' }), h('i', { class: 'iw-zl__beam' }));
    const corners = ['tl', 'tr', 'bl', 'br'].map((c) => h('i', { class: 'iw-zl__c iw-zl__c--' + c, 'aria-hidden': 'true' }));
    const el = h('div', { class: 'iw-screen iw-loading iw-zl' }, bg, corners,
      h('div', { class: 'iw-zl__status', 'aria-hidden': 'true' }, h('i', { class: 'iw-zl__dot' }), 'NOW LOADING'),
      h('div', { class: 'iw-zl__center' },
        h('div', { class: 'iw-zl__mark', role: 'img', 'aria-label': GAME_TITLE, html: ${JSON.stringify(zevantWordmark('zvl'))} }),
        h('i', { class: 'iw-zl__rule' }),
        h('div', { class: 'iw-zl__meta' }, label, pctEl),
        h('div', { class: 'iw-zl__bar' }, fill)),
      tip,
`;
    const lineEnd = code.indexOf('\n', end) + 1;
    const version = code.slice(end, lineEnd).replace(" iw-in' }, ", "' }, ");
    if (!lineEnd || !version.trimEnd().endsWith('));')) throw new Error('INKWAVE quality patch conflict (loading screen layout): version line changed');
    return code.slice(0, start) + screen + version + code.slice(lineEnd);
  }
  if (rel === 'styles/ui.css') {
    if (code.includes('.iw-zl ')) throw new Error('INKWAVE loading screen stylesheet applied twice');
    return code + LOADING_CSS;
  }
  return code;
}
