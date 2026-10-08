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
const BADGE_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path d='${S3_SQUID_BADGE}'/></svg>`)}")`;
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
/* ink body: lighter crown, darker foot and a few faint blotches, clipped to the squid by a mask (static, no repaint) */
.iw-sq__badge::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 58% 36% at 47% 15%, rgba(255, 255, 255, .34), rgba(255, 255, 255, 0) 72%),
    radial-gradient(circle at 26% 57%, rgba(255, 255, 255, .13) 0 6%, rgba(255, 255, 255, 0) 7.5%),
    radial-gradient(circle at 73% 45%, rgba(0, 0, 0, .1) 0 7%, rgba(0, 0, 0, 0) 8.5%),
    radial-gradient(ellipse 13% 9% at 38% 79%, rgba(0, 0, 0, .13), rgba(0, 0, 0, 0) 100%),
    radial-gradient(circle at 64% 70%, rgba(255, 255, 255, .09) 0 6%, rgba(255, 255, 255, 0) 7.5%),
    linear-gradient(rgba(255, 255, 255, 0) 50%, rgba(0, 0, 0, .2));
  -webkit-mask: ${BADGE_MASK} center / 100% 100% no-repeat; mask: ${BADGE_MASK} center / 100% 100% no-repeat; }
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
.iw-xh .iw-tank.is-swim { --th: max(56px, calc(var(--u) * 7.4)); left: max(14px, calc(var(--u) * 2)); top: calc(var(--th) * -.76); width: max(20px, calc(var(--u) * 2.6)); height: var(--th); translate: none; transition: opacity .2s; }
.iw-xh .iw-tank.is-swim:not(.is-idle) { animation: iw-s3-tank-in .18s ease-out; }
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
    // Splatoon 3 ink tank: a canister (cap, short neck, square shoulders, rounded foot) on dark glass.
    const T = this._tank, c = this.tankCtx, cv = this.tankCanvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = cv.clientWidth || 18, chh = cv.clientHeight || 74;
    const W = Math.round(cw * dpr), H = Math.round(chh * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const L = this._L;
    if (!L.tankCol) { const s = L.ca || '#ff8a14'; L.tankCol = [shade(s, 0.42), s, shade(s, -0.3), shade(s, -0.55)]; }
    const [cLight, cMid, cDark, cDeep] = L.tankCol;
    c.clearRect(0, 0, W, H);
    const pad = 2.5 * dpr, bw = W - pad * 2, capH = Math.max(3 * dpr, (H - pad * 2) * 0.1), top = pad + capH, bh = H - pad - top;
    const T2 = this._tankCache || (this._tankCache = {});
    if (T2.W !== W || T2.H !== H || T2.col !== cMid) {
      T2.W = W; T2.H = H; T2.col = cMid;
      T2.body = new Path2D(); T2.body.roundRect(pad, top, bw, bh, [bw * 0.2, bw * 0.2, bw * 0.45, bw * 0.45]);
      T2.cap = new Path2D(); T2.cap.roundRect(pad + bw * 0.3, pad, bw * 0.4, capH + bw * 0.12, [bw * 0.08, bw * 0.08, 0, 0]);
      T2.g = c.createLinearGradient(pad, 0, pad + bw, 0);
      T2.g.addColorStop(0, cDark); T2.g.addColorStop(0.5, cMid); T2.g.addColorStop(1, cLight);
    }
    const body = T2.body;
    c.fillStyle = 'rgba(16,14,18,.86)';
    c.fill(T2.cap);
    c.fillStyle = 'rgba(16,14,18,.7)';
    c.fill(body);
    c.save();
    c.clip(body);
    const lvl = top + bh * (1 - T.level);
    const amp = (0.8 + T.wobble * 2.5 + Math.abs(T.sloshV) * 1.8) * dpr;
    const tilt = T.slosh * bw * 0.7;
    c.beginPath();
    c.moveTo(pad - 2, H + 2);
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = pad + u * bw;
      c.lineTo(x, lvl + (u - 0.5) * tilt + Math.sin(u * 6.5 + T.t * 7) * amp * 0.5 + Math.sin(u * 11 - T.t * 9.5) * amp * 0.25);
    }
    c.lineTo(pad + bw + 2, H + 2);
    c.closePath();
    c.fillStyle = T2.g;
    c.fill();
    // bright meniscus line and depth toward the foot
    const g2 = c.createLinearGradient(0, lvl, 0, H);
    g2.addColorStop(0, 'rgba(255,255,255,.32)'); g2.addColorStop(0.06, 'rgba(255,255,255,0)'); g2.addColorStop(1, cDeep + '55');
    c.fillStyle = g2;
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = T.bubbles.length - 1; i >= 0; i--) {
      const b = T.bubbles[i];
      b.y += b.v * dt;
      const by = H - pad - b.y * bh;
      if (by < lvl + 2) { T.bubbles.splice(i, 1); continue; }
      c.beginPath(); c.arc(pad + b.x * bw + Math.sin(b.y * 20) * dpr, by, b.r * dpr, 0, TAU); c.fill();
    }
    c.restore();
    if (sub > 0) {
      const sy = top + bh * (1 - sub);
      c.fillStyle = nosub ? '#ff4d5e' : 'rgba(255,255,255,.9)';
      c.fillRect(pad + bw * 0.12, sy - 1 * dpr, bw * 0.76, 2 * dpr);
    }
    // glass edge: dark outer line with a faint light inner line (no white rim)
    c.lineWidth = 2.6 * dpr; c.strokeStyle = 'rgba(8,6,10,.9)'; c.stroke(body); c.stroke(T2.cap);
    c.lineWidth = 1 * dpr; c.strokeStyle = low ? (Math.sin(T.t * 14) > 0 ? '#ff3d5e' : 'rgba(255,255,255,.7)') : 'rgba(255,255,255,.28)'; c.stroke(body);
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.beginPath(); c.roundRect(pad + bw * 0.16, top + bh * 0.08, bw * 0.12, bh * 0.5, bw * 0.06); c.fill();
  }

`;

// Squid form: the tank leaves the reticle and rides beside the player's squid on screen, as in the
// footage (it follows the squid up and down with camera pitch). It shows only while refilling and
// leaves shortly after the tank is full; kid form keeps the existing show-when-not-full rule.
const SWIM_TANK = `    const me = this._local();
    const swimTank = !!(me && me.alive !== false && me.form === 'squid' && !me.superJumpState);
    if (swimTank !== L.swimTank) { L.swimTank = swimTank; this.tank.classList.toggle('is-swim', swimTank); if (!swimTank) this.tank.style.transform = ''; }
    if (swimTank && G.camera && me.pos) {
      const p = this._project(G.camera, me.pos.x, me.pos.y + 0.3, me.pos.z);
      if (p && p.z < 1) {
        const hw = innerWidth / 2, hh = innerHeight / 2;
        const x = Math.max(-hw * 0.8, Math.min(hw * 0.7, p.x * hw)), y = Math.max(-hh * 0.5, Math.min(hh * 0.55, -p.y * hh));   // stays above the bottom splat bar
        this.tank.style.transform = \`translate3d(\${x.toFixed(1)}px,\${y.toFixed(1)}px,0)\`;
      }
    }
`;

export function adaptS3HudLook(rel, code) {
  if (rel === 'src/ui/hud.js') {
    code = section(code, '  _drawTank(dt, sub, low, nosub) {\n', '  // ---------------------------------------------------------------- special gauge', S3_DRAW_TANK, 'S3 canister ink tank');
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
