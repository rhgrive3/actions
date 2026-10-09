// Splatoon 3 HUD look (presentation only): top-bar squid roster, splatted marks, timer plate,
// special dial colours, timer/Japanese HUD type and the bottom "<name> をたおした!" bar.
//
// Reference: Splatoon 3 screen recording supplied on 2026-10-08 (version not shown;
// Splat Zones, 1280x720 game area). Measurements are recorded in
// reports/inkwave-s3-hud-look-2026-10-08.md. Nothing here reads or writes gameplay,
// scoring, special charge, timers, input or network state; touch hit areas keep the
// layout-editor geometry (only colours and the gauge artwork change on the SP button).

// Squid icon silhouette of the S3 roster (64 box): pointed mantle, side fins at ~48%
// height, straight body and a wavy tentacle edge.
export const S3_SQUID_BADGE = 'M32 2 C34 2 36 3.4 37.8 5.4 L59.6 28 C61.6 30.2 60.6 31.9 58 32.1 L53 32.6 L53 54.5 C53 60 47.4 61 45.4 57 C43.4 61.6 38.2 62 36.6 57.6 C35 62.2 29 62.2 27.4 57.6 C25.8 62 20.6 61.6 18.6 57 C16.6 61 11 60 11 54.5 L11 32.6 L6 32.1 C3.4 31.9 2.4 30.2 4.4 28 L26.2 5.4 C28 3.4 30 2 32 2 Z';
// The badge silhouette ships once as hud/s3-squid-badge.svg (loaded on demand, outside the startup precache)
// instead of a data URI inside the precached HUD stylesheet.
export const S3_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="${S3_SQUID_BADGE}"/></svg>\n`;
const BADGE_MASK = "url('../patches/local-quality/hud/s3-squid-badge.svg')";
const FONT_DIR = '../patches/local-quality/fonts';
const OLD_BADGE = "const BADGE_PATH = 'M32 2.5 C35.5 2.5 43 9 47.5 14.5 C50 14 55 15.5 57 18.5 C58.6 21 57.4 23.6 55.2 24.8 A24.5 24.5 0 1 1 8.8 24.8 C6.6 23.6 5.4 21 7 18.5 C9 15.5 14 14 16.5 14.5 C21 9 28.5 2.5 32 2.5 Z';";

// Measured gauge tooth colours (centre / outline of a lit tooth in the footage).
export const S3_TOOTH = Object.freeze({ fill: '#fac337', edge: '#b56a00' });

const HUD_CSS = `
/* ---- Splatoon 3 HUD look (reports/inkwave-s3-hud-look-2026-10-08.md) ---- */
/* fonts: original condensed chamfered timer numerals, and a kana/kanji subset of Rounded M+ 1c Black (OFL)
   for in-match Japanese. Latin keeps Titan One / Rubik; anything outside the subset falls back to IW JP. */
@font-face { font-family: 'IW S3 Digits'; src: url('${FONT_DIR}/iw-s3-digits.woff2') format('woff2'); unicode-range: U+0020, U+0030-003A; font-display: swap; }
@font-face { font-family: 'IW S3 JP'; src: url('${FONT_DIR}/iw-s3-jp.woff2') format('woff2'); unicode-range: U+3000-30FF, U+4E00-9FFF, U+FF00-FFEF; font-weight: 400 900; font-display: swap; }
:is(.iw-hud, .iw-hud-over) .iw-display { font-family: 'Titan One', 'IW S3 JP', 'IW JP Display', sans-serif; }
:is(.iw-hud, .iw-hud-over) :is(.iw-kcard__txt b, .iw-kcard__txt small, .iw-call__sub, .iw-prompt, .iw-feed__item, .iw-down span, .iw-spl__by, .iw-spl__wn, .iw-spl__ring small),
.iw-squad::after { font-family: 'Rubik', 'IW S3 JP', 'IW JP Body', sans-serif; }
/* roster: squid icons nearly touching, a flat dark timer plate between the teams */
.iw-hud__top { top: calc(var(--u) * .8); gap: calc(var(--u) * 1); }   /* the 1.08 leading-team emphasis must still clear the timer */
.iw-squad { gap: calc(var(--u) * .1); }
.iw-sq { width: calc(var(--u) * 4.3); height: calc(var(--u) * 4.3); }
.iw-sq__badge { filter: drop-shadow(0 0 calc(var(--u) * .1) rgba(0, 0, 0, .5)); }
.iw-sq__shape { overflow: visible; }
.iw-sq__shape .o { stroke: var(--tc); stroke-opacity: .45; stroke-width: 2.6; }   /* soft ink edge, no outline */
.iw-sq__shape .f { fill: var(--tc); stroke: none; }
.iw-sq__shape .g { display: none; }
/* ink body: lighter crown, darker foot and faint blotches, clipped to the squid by a mask (static, no repaint);
   browsers without unprefixed masks keep the plain silhouette rather than a square overlay */
@supports (mask-image: none) {
.iw-sq__badge::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 58% 36% at 47% 15%, #ffffff57, #fff0 72%), radial-gradient(circle at 26% 57%, #ffffff21 0 6%, #fff0 7.5%),
    radial-gradient(ellipse 13% 9% at 38% 79%, #00000021, #0000), linear-gradient(#fff0 50%, #0003);
  mask: ${BADGE_MASK} center / 100% 100% no-repeat; }
}
.iw-sq:nth-child(even) .iw-sq__badge::before { transform: scaleX(-1); }
.iw-sq.is-dead .iw-sq__badge::before { opacity: .3; }
.iw-sq__w { left: -9%; right: -9%; top: 27%; bottom: 3%; }
.iw-sq__w svg { filter: drop-shadow(0 0 1px rgba(10, 8, 14, .9)) drop-shadow(0 1px 0 rgba(10, 8, 14, .6)); }
/* splatted: dark silhouette, faded weapon and a large grey X over the whole icon */
.iw-sq.is-dead .iw-sq__shape .f { fill: #29262c; fill-opacity: .86; stroke: none; }
.iw-sq.is-dead .iw-sq__shape .o { stroke: #29262c; stroke-opacity: .5; }
.iw-sq.is-dead .iw-sq__w { opacity: .32; scale: 1; filter: grayscale(1); }
.iw-sq__x { inset: 0; color: transparent; filter: none; }
.iw-sq__x svg { display: none; }
.iw-sq__x::before, .iw-sq__x::after { content: ''; position: absolute; left: 50%; top: 52%; width: 122%; height: 15%; border-radius: calc(var(--u) * .12);
  background: rgba(146, 144, 148, .86); box-shadow: 0 0 0 1px rgba(30, 28, 32, .35); translate: -50% -50%; rotate: 45deg; }
.iw-sq__x::after { rotate: -45deg; }
.iw-sq.is-dead .iw-sq__x { opacity: 1; scale: 1; }
.iw-timer { width: calc(var(--u) * 6.8); height: calc(var(--u) * 3.6); }
.iw-timer__blob { border-radius: calc(var(--u) * .45); background: rgba(16, 14, 18, .9); box-shadow: 0 0 0 1px rgba(255, 255, 255, .05), 0 calc(var(--u) * .1) calc(var(--u) * .3) rgba(0, 0, 0, .35); }
.iw-timer__drip { display: none; }
.iw-timer__txt { font-family: 'IW S3 Digits', 'Titan One', 'IW JP Display', sans-serif; font-size: calc(var(--u) * 2.6); letter-spacing: 0; color: #fff; }
.iw-timer.is-last .iw-timer__blob { background: rgba(16, 14, 18, .9); }
.iw-timer.is-final .iw-timer__blob { animation: iw-s3-timer-final 1s ease-in-out infinite; }
@keyframes iw-s3-timer-final { 50% { box-shadow: 0 0 0 1px rgba(255, 255, 255, .25), 0 0 calc(var(--u) * 1.4) rgba(255, 50, 80, .7); } }

/* special: dark dial, 30 radial teeth lit clockwise from 12 o'clock, team-ink burst behind the icon */
.iw-sp { right: calc(var(--u) * 2.6); top: calc(var(--u) * .9); width: calc(var(--u) * 9.2); height: calc(var(--u) * 9.2); }
.iw-sp__orb { filter: drop-shadow(0 calc(var(--u) * .12) calc(var(--u) * .2) rgba(0, 0, 0, .45)); }
.iw-sp__bg { fill: rgba(30, 26, 28, .9); }
.iw-sp__rim { fill: none; stroke: rgba(8, 6, 6, .85); stroke-width: 1.6; }
.iw-sp__segment { fill: rgba(255, 255, 255, .085); stroke: rgba(0, 0, 0, .5); stroke-width: .8; stroke-linejoin: round; }
.iw-sp__segment.is-filled { fill: ${S3_TOOTH.fill}; stroke: ${S3_TOOTH.edge}; stroke-width: 1.3; }
.iw-sp__burst path { fill: none; stroke: var(--self); stroke-width: 3; stroke-linecap: round; opacity: .9; }
.iw-sp__burst circle { fill: var(--self); }
.iw-sp__icon { top: 50%; width: 36%; height: 36%; }
.iw-sp.is-ready .iw-sp__segment.is-filled { fill: #ffe27a; stroke: #e08a00; }
.iw-sp.is-ready .iw-sp__orb { animation: iw-s3-sp-glow 1s ease-in-out infinite; }
@keyframes iw-s3-sp-glow { 50% { filter: drop-shadow(0 calc(var(--u) * .12) calc(var(--u) * .2) rgba(0, 0, 0, .45)) drop-shadow(0 0 calc(var(--u) * 1.1) ${S3_TOOTH.fill}); } }
.iw-sp__ring { border-color: ${S3_TOOTH.fill}; }
.iw-sp.is-gain .iw-sp__rim { animation: iw-s3-sp-gain .35s ease-out; }
@keyframes iw-s3-sp-gain { 0% { stroke: ${S3_TOOTH.fill}; stroke-width: 3.5; } }
.iw-turf { top: calc(var(--u) * 10.8); }

/* ink tank: canister art everywhere; in squid form it rides beside the squid (JS sets the translate) */
.iw-tank { width: calc(var(--u) * 1.7); height: calc(var(--u) * 5.2); top: calc(var(--u) * -2.6); }
.iw-xh .iw-tank.is-swim { --th: max(58px, calc(var(--u) * 8.2)); left: max(30px, calc(var(--u) * 4.6)); top: calc(var(--th) * -.76); width: max(22px, calc(var(--u) * 3.1)); height: var(--th); translate: none; transition: opacity .2s; }
.iw-xh .iw-tank.is-swim:not(.is-idle) { animation: iw-s3-tank-in .18s ease-out; }
.iw-tank__tube { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; display: none; }
.iw-tank.is-swim .iw-tank__tube { display: block; }
.iw-tank__tube path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.iw-tank__tube .o { stroke: rgba(22, 14, 26, .85); stroke-width: 6px; }
.iw-tank__tube .i { stroke: var(--self); stroke-width: 3.6px; }
@keyframes iw-s3-tank-in { 0% { opacity: 0; scale: .85; } }
/* splat notice: one dark bar at the bottom centre — squid + your-ink splat, then "<name> をたおした!" */
.iw-kcards { bottom: calc(var(--u) * 2.6); gap: calc(var(--u) * .3); }
.iw-kcards .iw-kcard + .iw-kcard { scale: 1; opacity: .92; margin-top: 0; }
.iw-kcard { gap: calc(var(--u) * .45); min-width: calc(var(--u) * 24); padding: calc(var(--u) * .5) calc(var(--u) * 2.6) calc(var(--u) * .5) calc(var(--u) * .8); border-radius: calc(var(--u) * .2);
  background: rgba(16, 14, 18, .88); box-shadow: 0 calc(var(--u) * .1) calc(var(--u) * .3) rgba(0, 0, 0, .3); animation: iw-s3-kill-in .26s cubic-bezier(.2, .8, .3, 1) backwards; }
@keyframes iw-s3-kill-in { 0% { opacity: 0; scale: .85 1; } }
.iw-kcard__w { order: 0; width: calc(var(--u) * 2.7); height: calc(var(--u) * 2.7); margin: calc(var(--u) * -.25) 0; border-radius: 0; background: none; box-shadow: none; color: #fff; rotate: 30deg; }   /* the footage tilts the squid ~30deg clockwise */
.iw-kcard__w svg { width: 100%; height: 100%; filter: none; }
.iw-kcard__splat { order: 1; position: relative; z-index: 0; left: auto; top: auto; flex: none; width: calc(var(--u) * 2.4); height: calc(var(--u) * 2.4); margin-left: calc(var(--u) * -.35); translate: none; rotate: 0deg; scale: 1.25 .95; }
.iw-kcard__txt { order: 2; flex: 1; flex-direction: row; align-items: baseline; justify-content: center; gap: .3em; padding-left: calc(var(--u) * .8); }
.iw-kcard__txt b, .iw-kcard__txt small { font: 900 calc(var(--u) * 1.45) / 1.1 'Rubik', 'IW JP Body', sans-serif; letter-spacing: .02em; color: #fff; }
.iw-kcard--ja .iw-kcard__txt b { order: -1; }
`;

// Touch: the SP button stays the gauge (same position, size and hit area); only its
// artwork becomes the S3 dial — dark disc, measured teeth and colours.
const MOBILE_CSS = `
/* ---- Splatoon 3 colours on the touch SP button: one thin full ring of steps (presentation only; hit area unchanged) ---- */
.iwm-b--special { background: rgba(30, 26, 28, .84); }
.iwm-sp-segment { fill: rgba(255, 255, 255, .2); stroke: none; }
.iwm-sp-segment.is-filled { fill: ${S3_TOOTH.fill}; }
.iwm-b--special .iwm-b__gauge { filter: drop-shadow(0 0 1px rgba(0, 0, 0, .6)); }
.iwm-b--special .iwm-b__ico { width: 46%; height: 46%; }
.iwm-b--special.is-ready .iwm-sp-segment.is-filled { fill: #ffe27a; stroke: #e08a00; }
/* phones: keep the splat bar legible (the HUD unit drops below 7px in landscape) */
html.iw-touch-ui .iw-hud .iw-kcard__txt :is(b, small) { font-size: max(12px, calc(var(--u) * 1.45)); }
html.iw-touch-ui .iw-hud .iw-kcard__w, html.iw-touch-ui .iw-hud .iw-kcard__splat { width: max(18px, calc(var(--u) * 2.7)); height: max(18px, calc(var(--u) * 2.7)); }
`;

function section(code, start, end, after, label) {
  const a = code.indexOf(start), b = code.indexOf(end, a + start.length);
  if (a < 0 || b < a || code.indexOf(start, a + 1) >= 0) throw new Error(`INKWAVE S3 HUD look conflict (${label}): missing boundary`);
  return code.slice(0, a) + after + code.slice(b);
}

function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw new Error(`INKWAVE S3 HUD look conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const S3_DRAW_TANK = `  _drawTank(dt, sub, low, nosub) {
    // Splatoon 3 ink tank (flat ink surface, as in the footage): a near-black bottle (stepped cap: shoulders, neck, nub; straight sides,
    // rounded foot) with a thick frame; the ink is flat team colour inside the frame with one bright
    // meniscus line, and a thin white line marks the sub-weapon cost. No gloss, no bubbles.
    const T = this._tank, c = this.tankCtx, cv = this.tankCanvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = cv.clientWidth || 18, chh = cv.clientHeight || 74;
    const W = Math.round(cw * dpr), H = Math.round(chh * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const L = this._L;
    if (!L.tankCol) { const s = L.ca || '#ff8a14'; L.tankCol = [shade(s, 0.55), shade(s, 0.08), s, s]; }
    const [cLine, cInk] = L.tankCol;
    c.clearRect(0, 0, W, H);
    const T2 = this._tankCache || (this._tankCache = {});
    if (T2.W !== W || T2.H !== H) {
      T2.W = W; T2.H = H;
      const p = 1 * dpr, x0 = p, x1 = W - p, bw = x1 - x0;
      const nub = H * 0.035, neck = H * 0.075, sh = bw * 0.2, yb = p + nub + neck + sh, yEnd = H - p, rf = bw * 0.32;
      const nL = x0 + bw * 0.22, nR = x1 - bw * 0.22, uL = x0 + bw * 0.36, uR = x1 - bw * 0.36;
      const o = new Path2D();
      o.moveTo(x0, yb); o.lineTo(nL - bw * 0.04, yb - sh); o.lineTo(nL, yb - sh); o.lineTo(nL, p + nub);
      o.lineTo(uL, p + nub); o.arcTo(uL, p, uR, p, nub * 0.6); o.arcTo(uR, p, uR, p + nub, nub * 0.6); o.lineTo(uR, p + nub);
      o.lineTo(nR, p + nub); o.lineTo(nR, yb - sh); o.lineTo(nR + bw * 0.04, yb - sh); o.lineTo(x1, yb);
      o.lineTo(x1, yEnd - rf); o.arcTo(x1, yEnd, x1 - rf, yEnd, rf); o.lineTo(x0 + rf, yEnd); o.arcTo(x0, yEnd, x0, yEnd - rf, rf); o.closePath();
      const f = Math.max(2.4 * dpr, bw * 0.13);
      const well = new Path2D(); well.roundRect(x0 + f, yb + f * 0.2, bw - f * 2, yEnd - f - (yb + f * 0.2), [bw * 0.06, bw * 0.06, rf - f * 0.6, rf - f * 0.6]);
      Object.assign(T2, { outline: o, well, wx: x0 + f, ww: bw - f * 2, wy: yb + f * 0.2, wh: yEnd - f - (yb + f * 0.2) });
    }
    c.fillStyle = 'rgba(26,19,27,.92)';
    c.fill(T2.outline);
    c.save();
    c.clip(T2.well);
    c.fillStyle = 'rgba(58,48,58,.55)';
    c.fill(T2.well);
    const lvl = T2.wy + T2.wh * (1 - T.level);
    c.fillStyle = cInk;
    c.fillRect(T2.wx, lvl, T2.ww, H - lvl);
    if (T.level > 0.01) { c.fillStyle = cLine; c.fillRect(T2.wx, lvl - 0.6 * dpr, T2.ww, 1.6 * dpr); }
    c.restore();
    if (sub > 0) {
      const sy = T2.wy + T2.wh * (1 - sub);
      c.fillStyle = nosub ? 'rgba(255,190,200,.95)' : 'rgba(255,255,255,.9)';
      c.fillRect(T2.wx, sy - 0.7 * dpr, T2.ww, 1.4 * dpr);
    }
    c.lineWidth = 1 * dpr; c.strokeStyle = low ? (Math.sin(T.t * 14) > 0 ? '#ff3d5e' : 'rgba(255,255,255,.5)') : 'rgba(255,255,255,.12)';
    c.stroke(T2.outline);
    T.bubbles.length = 0;
  }

`;

// Squid form: the tank leaves the reticle and rides beside the player's squid on screen, as in the
// footage (it follows the squid up and down with camera pitch). It shows only while refilling and
// leaves shortly after the tank is full; kid form keeps the existing show-when-not-full rule.
const SWIM_TANK = `    const me = this._local();
    const swimTank = !!(me && me.alive !== false && me.form === 'squid' && !me.superJumpState);
    if (swimTank !== L.swimTank) { L.swimTank = swimTank; L.tubeGeo = null; this.tank.classList.toggle('is-swim', swimTank); if (!swimTank) this.tank.style.transform = ''; }
    if (swimTank && G.camera && me.pos) {
      const p = this._project(G.camera, me.pos.x, me.pos.y + 0.3, me.pos.z);
      if (p && p.z < 1) {
        const hw = innerWidth / 2, hh = innerHeight / 2;
        const x = Math.max(-hw * 0.8, Math.min(hw * 0.7, p.x * hw)), y = Math.max(-hh * 0.5, Math.min(hh * 0.55, -p.y * hh));   // stays above the bottom splat bar
        this.tank.style.transform = \`translate3d(\${x.toFixed(1)}px,\${y.toFixed(1)}px,0)\`;
        this._s3TankTube(ink, dt);
      }
    }
`;

// The footage joins the squid to the tank foot with a thin team-ink squiggle (dark edged) that writhes while ink flows
// in. Endpoints stay pinned (squid side, tank foot); the wave travels toward the tank and its
// amplitude beats ("doku-doku") while refilling. Tank-local coordinates: the squid sits at
// (-left, -top) because the tank box is offset from the squid point by its CSS left/top.
const TANK_TUBE = `  _s3TankTube(ink, dt) {
    const L = this._L, T = this._tank;
    if (!this._tube) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'iw-tank__tube'); svg.setAttribute('aria-hidden', 'true');
      this._tube = [document.createElementNS(NS, 'path'), document.createElementNS(NS, 'path')];
      this._tube[0].setAttribute('class', 'o'); this._tube[1].setAttribute('class', 'i');
      svg.append(...this._tube); this.tank.prepend(svg);
    }
    const vw = innerWidth, vh = innerHeight;
    // geometry is read once per squid entry / viewport size, never every frame (no layout thrash)
    if (!L.tubeGeo || L.tubeGeo.vw !== vw || L.tubeGeo.vh !== vh)
      L.tubeGeo = { vw, vh, l: this.tank.offsetLeft, t: this.tank.offsetTop, h: this.tank.offsetHeight, w: this.tank.offsetWidth };
    const g = L.tubeGeo;
    const x0 = g.w * 0.1, y0 = g.h * 0.94, x1 = -g.l * 0.72, y1 = -g.t + g.l * 0.08;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const flowing = ink < 0.995;
    L.tubePhase = ((L.tubePhase || 0) + dt * (flowing ? 11 : 3)) % (Math.PI * 2000);
    const beat = flowing ? 0.55 + 0.45 * Math.max(0, Math.sin(T.t * 8.5)) ** 2 : 0.35;
    const amp = Math.min(5, len * 0.07) * beat;
    let d = '';
    for (let i = 0; i <= 18; i++) {
      const u = i / 18, env = Math.sin(Math.PI * u);
      const o = env * amp * (Math.sin(u * 15 + L.tubePhase) + 0.25 * Math.sin(u * 31 + L.tubePhase * 1.6));   // u = 0 is the tank foot: + phase travels into the tank
      d += (i ? 'L' : 'M') + (x0 + dx * u + nx * o).toFixed(1) + ' ' + (y0 + dy * u + ny * o).toFixed(1);
    }
    this._tube[0].setAttribute('d', d); this._tube[1].setAttribute('d', d);
  }

`;

export function adaptS3HudLook(rel, code) {
  if (rel === 'src/ui/hud.js') {
    code = section(code, '  _drawTank(dt, sub, low, nosub) {\n', '  // ---------------------------------------------------------------- special gauge', TANK_TUBE + S3_DRAW_TANK, 'S3 canister ink tank');
    code = once(code, '    L.fullT = ink >= 0.995 && !low && !L.aim ? (L.fullT || 0) + dt : 0;\n    const idle = L.fullT > 1.4;',
      SWIM_TANK + '    L.fullT = ink >= 0.995 && !low && !L.aim ? (L.fullT || 0) + dt : 0;\n    const idle = L.fullT > (swimTank ? 0.35 : 1.4);', 'squid-form tank anchor');
    code = once(code, OLD_BADGE, `const BADGE_PATH = '${S3_SQUID_BADGE}';`, 'S3 roster squid silhouette');
    code = once(code, "    const card = h('div', { class: `iw-kcard iw-kcard--${kind}` },",
      "    const card = h('div', { class: `iw-kcard iw-kcard--${kind}${isJa ? ' iw-kcard--ja' : ''}` },", 'splat bar word order');
    code = once(code, "      h('span', { class: 'iw-kcard__w', html: weaponIcon(kindOf(victim.weaponId)) }),",
      "      h('span', { class: 'iw-kcard__w', html: SQUID }),", 'splat bar squid icon');
    // Anchored on the common expression: the raw upstream line still carries the assist branch.
    return once(code, "isJa ? 'たおした！' : 'SPLATTED'", "isJa ? 'をたおした!' : 'SPLATTED'", 'splat bar Japanese text');
  }
  if (rel === 'styles/hud.css') return code + HUD_CSS;
  if (rel === 'styles/mobile.css') return code + MOBILE_CSS;
  return code;
}
