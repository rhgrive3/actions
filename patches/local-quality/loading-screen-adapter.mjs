// Display-only loading art. The static startup shell (patches/loading-cache/shell.html)
// reuses these classes, so the boot shell and the native loading screen read as one scene.
// Only transform/opacity animate: boot work holds the main thread, the compositor does not.
import { replaceOnce } from './adapter.mjs';

export const LOADING_ART_MARQUEE_REPEAT = 16;
export const loadingArtMarquee = (title) => `${title} • TURF RIOT • NOW LOADING • `.repeat(LOADING_ART_MARQUEE_REPEAT);

const LOADING_ART_CSS = `
/* ZEVANT loading art: native loading screen + static startup shell (.iw-load-shell). */
.iw-load-art { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.iw-load-art > i { position: absolute; display: block; }
.iw-load-art__rays { left: 50%; top: 40%; width: calc(var(--u) * 130); height: calc(var(--u) * 130);
  margin: calc(var(--u) * -65) 0 0 calc(var(--u) * -65); border-radius: 50%;
  background: repeating-conic-gradient(rgba(var(--a-rgb), .16) 0deg 5deg, transparent 5deg 15deg, rgba(var(--b-rgb), .18) 15deg 20deg, transparent 20deg 30deg);
  -webkit-mask-image: radial-gradient(closest-side, #000 10%, transparent 100%); mask-image: radial-gradient(closest-side, #000 10%, transparent 100%);
  animation: iw-load-spin 60s linear infinite; will-change: transform; }
@keyframes iw-load-spin { to { transform: rotate(360deg); } }
.iw-load-art__streaks { inset: 0; overflow: hidden;
  -webkit-mask-image: radial-gradient(ellipse 60% 55% at 50% 42%, transparent 30%, #000 100%); mask-image: radial-gradient(ellipse 60% 55% at 50% 42%, transparent 30%, #000 100%); }
.iw-load-art__streaks::before { content: ''; position: absolute; left: -50%; top: -50%; width: 200%; height: 200%;
  background: repeating-linear-gradient(90deg, transparent 0 110px, rgba(255, 255, 255, .09) 110px 113px, transparent 113px 170px, rgba(var(--a-rgb), .1) 170px 186px, transparent 186px 240px);
  transform: rotate(-24deg); animation: iw-load-streak 1.1s linear infinite; will-change: transform; }
@keyframes iw-load-streak { to { transform: rotate(-24deg) translateX(240px); } }
.iw-load-art__band { left: -6%; right: -6%; height: max(18px, calc(var(--u) * 2.1)); overflow: hidden; display: flex; align-items: center;
  font: 400 max(10px, calc(var(--u) * .95)) / 1 'Titan One', 'IW JP Display', sans-serif; letter-spacing: .2em;
  box-shadow: 0 0 0 3px var(--k), 0 calc(var(--u) * .4) 0 3px rgba(0, 0, 0, .35); rotate: -1.4deg; }
.iw-load-art__band--top { top: calc(var(--u) * 1.6); background: var(--a); color: var(--k); }
/* Tilted the other way so the band dips under the version corner instead of crossing it. */
.iw-load-art__band--bot { bottom: calc(var(--u) * -.6); background: var(--b); color: #fff; rotate: 1.4deg; }
.iw-load-art__band::before { content: attr(data-t); flex: none; white-space: pre; animation: iw-load-marquee 40s linear infinite; will-change: transform; }
.iw-load-art__band--bot::before { animation-direction: reverse; }
@keyframes iw-load-marquee { to { transform: translateX(-50%); } }
.iw-load-art__flash { left: 50%; top: 40%; width: calc(var(--u) * 70); height: calc(var(--u) * 40); margin: calc(var(--u) * -20) 0 0 calc(var(--u) * -35); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 196, 138, .34), rgba(var(--a-rgb), .12) 55%, transparent);
  animation: iw-load-pulse 2.4s ease-in-out infinite alternate; will-change: transform, opacity; }
@keyframes iw-load-pulse { from { opacity: .55; transform: scale(.9); } to { opacity: 1; transform: scale(1.08); } }
:is(.iw-loading, .iw-load-shell) .iw-progress__track {
  box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--k), 0 calc(var(--u) * .45) 0 6px rgba(0, 0, 0, .4), 0 0 calc(var(--u) * 3) calc(var(--u) * .6) rgba(var(--a-rgb), .35), inset 0 3px 6px rgba(0, 0, 0, .5); }
:is(.iw-loading, .iw-load-shell) .iw-progress__track::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, .3) 50%, transparent 62%);
  transform: translateX(-100%); animation: iw-load-sheen 2.6s cubic-bezier(.5, 0, .5, 1) infinite; will-change: transform; }
@keyframes iw-load-sheen { 55%, 100% { transform: translateX(100%); } }
:is(.iw-loading, .iw-load-shell) .iw-progress__fill::after { content: ''; position: absolute; right: 0; top: -30%; bottom: -30%; width: calc(var(--u) * 2.6);
  background: radial-gradient(closest-side, #fff, rgba(255, 214, 160, .7) 45%, transparent); animation: iw-load-head .8s ease-in-out infinite alternate; }
@keyframes iw-load-head { to { opacity: .5; transform: scale(.75); } }
@media (prefers-reduced-motion: reduce) {
  .iw-load-art__rays, .iw-load-art__streaks::before, .iw-load-art__band::before, .iw-load-art__flash,
  :is(.iw-loading, .iw-load-shell) :is(.iw-progress__track, .iw-progress__fill)::after { animation: none !important; }
}
`;

const NATIVE_LOADING_SCREEN = "    const el = h('div', { class: 'iw-screen iw-loading' }, blobs,\n";

export function adaptLoadingScreen(rel, code) {
  if (rel === 'src/ui/menus.js') {
    // Decorative layer only: no text nodes, so .iw-loading textContent and the progress/label owners stay unchanged.
    return replaceOnce(code, NATIVE_LOADING_SCREEN,
      "    const marquee = `${GAME_TITLE} • TURF RIOT • NOW LOADING • `.repeat(" + LOADING_ART_MARQUEE_REPEAT + ");\n" +
      "    const art = h('div', { class: 'iw-load-art', 'aria-hidden': 'true' }, h('i', { class: 'iw-load-art__rays' }), h('i', { class: 'iw-load-art__flash' }),\n" +
      "      h('i', { class: 'iw-load-art__streaks' }), h('i', { class: 'iw-load-art__band iw-load-art__band--top', data: { t: marquee } }),\n" +
      "      h('i', { class: 'iw-load-art__band iw-load-art__band--bot', data: { t: marquee } }));\n" +
      "    const el = h('div', { class: 'iw-screen iw-loading' }, blobs, art,\n",
      'loading screen art layer');
  }
  if (rel === 'styles/ui.css') {
    if (code.includes('.iw-load-art')) throw new Error('INKWAVE loading art stylesheet applied twice');
    return code + LOADING_ART_CSS;
  }
  return code;
}
