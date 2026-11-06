// Shooter / Dualies reticle look and the hit flash, matched to Splatoon 3
// (owner request 2026-11-06, with owner-supplied gameplay captures). Presentation
// only: spread, aim, guides, hit tests and damage are unchanged.
//
// Measurements (1280x720 equivalents):
// - Shooter, owner capture (Splattershot, 999x566 frame, x1.281): one white ring
//   r ~13 px with an ink-coloured edge and a ~3 px white centre dot; four short
//   tangential strokes at about +-43 px horizontally and +-22 px vertically.
// - Official Nintendo screenshots already pinned for #871
//   (reference/shooter-reticle-reference.json): vertical half-span 24 px, stroke
//   3 x 14 px, horizontal half-span 48.7 px and 76.7 px in the two samples. With a
//   24 px zero-spread base, the extra 24.7 / 52.7 px match tan(6 deg) / tan(12 deg)
//   (Splattershot ground / jump spread) times ~240 px. INKWAVE added the cone as
//   projected through the camera (tan / tan(halfFov) * 360 = ~691 px at fov 55), so
//   its strokes sat ~2.9x too far out. The strokes now use 240 px per tangent:
//   0.347 of the projected spread at the stock fov.
// - Dualies, owner capture + owner correction: the two bright rings with the ink
//   edge and a centre dot are the moving ones (the shots' landing guides that
//   INKWAVE already projects per hand); the fixed camera rings stay faint. Ring
//   r ~13, side-by-side spacing ~2.7 radii (+-17.5 px) in the capture. Strokes at
//   ~+-61 px / +-27 px; the 52 px base is fitted to that capture at INKWAVE's
//   idle Dualies spread and is not verified for every Dualies. Where the
//   landing guides sit (INKWAVE's projection) is not changed here.
// - Splatling, owner capture: the two charge stages share one ring; the second
//   stage is shown by a deeper colour over the first, not by a second outer
//   ring. INKWAVE's outer r=16 ring is folded onto the inner r=12 ring, in white
//   shades, not ink colours (owner correction): empty part faint, first stage
//   half-opaque white, second stage solid white over it. Exact opacities are
//   read off one compressed capture, not measured.
// - Charger, owner report: something odd sat in the middle of the sight. The
//   #1058 reach endpoints (a solid 11 px ring and a dashed 17 px ring) are drawn
//   at the reticle centre whenever the aim point is inside the current reach,
//   on top of the centre dot. Splatoon 3's charger sight has no such markers
//   (ring, charge fill, centre dot, laser), so they are no longer drawn.
// - On target (owner capture): an X over the ring; the strokes are not shown.
// - Hit (owner capture): a white star flash at the enemy's body, not an X fixed at
//   the screen centre. Boss fights keep their own centre feedback.
// Pixel sizes come from compressed video frames: about +-1-2 px.
const SVG_NS = 'http://www.w3.org/2000/svg';
export const S3_RETICLE = Object.freeze({
  ringRadius: 13, ringStroke: 2.2, edgeStroke: 4.4, dotSize: 3,
  tickBaseX: 24, tickHalfY: 24, spreadScale: 0.347,
  dualRingCx: 17.5, dualTickBaseX: 52, dualTickHalfY: 27,
  crossInner: 7, crossOuter: 28,
  flashLife: 0.22, flashSize: 46,
});

export const S3_RETICLE_CSS = `
.iw-xh .iw-ret--shooter .iw-ret__tick { --iw-corner-x: calc(${S3_RETICLE.tickBaseX}px + var(--sp, 0) * ${S3_RETICLE.spreadScale}px); }
.iw-xh .iw-ret--shooter > .iw-ret__dot { width: ${S3_RETICLE.dotSize}px; height: ${S3_RETICLE.dotSize}px; margin: -${S3_RETICLE.dotSize / 2}px 0 0 -${S3_RETICLE.dotSize / 2}px; border-radius: .6px; background: #fff; }
.iw-xh .iw-ret--shooter circle.s3-ring { stroke: #fff; stroke-width: ${S3_RETICLE.ringStroke}; fill: none; opacity: 1; }
.iw-xh .iw-ret circle.s3-ring-edge { stroke: var(--self, #ff8a14); stroke-width: ${S3_RETICLE.edgeStroke}; fill: none; opacity: .9; }
.iw-xh .iw-ret--dualies .iw-ret__tick { --iw-dual-x: calc(${S3_RETICLE.dualTickBaseX}px + var(--sp, 0) * ${S3_RETICLE.spreadScale}px); }
.iw-xh .iw-ret--dualies .iw-ret__hand circle.s3-ring { stroke: #fff; stroke-width: ${S3_RETICLE.ringStroke}; fill: none; opacity: 1; }
.iw-xh .iw-ret--dualies .iw-ret__hand .iw-ret__dual-dot { fill: #fff; stroke: none; visibility: visible; }
.iw-xh .iw-ret--dualies .iw-ret__tick:nth-child(3), .iw-xh .iw-ret--dualies .iw-ret__tick:nth-child(4) { --iw-cy: -${S3_RETICLE.dualTickHalfY}px; }
.iw-xh .iw-ret--dualies .iw-ret__tick:nth-child(5), .iw-xh .iw-ret--dualies .iw-ret__tick:nth-child(6) { --iw-cy: ${S3_RETICLE.dualTickHalfY}px; }
.iw-xh .iw-ret--splatling .iw-ret__track { stroke: #fff; stroke-width: 4; opacity: .28; }
.iw-xh .iw-ret--splatling .iw-ret__charge, .iw-xh .iw-ret--splatling.is-full .iw-ret__charge, .iw-xh .iw-ret--splatling.is-streaming .iw-ret__charge,
.iw-xh .iw-ret--splatling.is-first-complete:not(.is-streaming) .iw-ret__charge:not(.iw-ret__charge-second) { stroke: #fff; stroke-width: 4; opacity: .62; }
.iw-xh .iw-ret--splatling .iw-ret__charge.iw-ret__charge-second, .iw-xh .iw-ret--splatling.is-full .iw-ret__charge.iw-ret__charge-second,
.iw-xh .iw-ret--splatling.is-streaming .iw-ret__charge.iw-ret__charge-second { stroke: #fff; opacity: 1; }
.iw-xh .iw-ret--charger::before, .iw-xh .iw-ret--charger::after { display: none; }
.iw-xh .iw-ret g.s3-x { opacity: 0; transition: opacity .06s linear; }
.iw-xh.is-target .iw-ret g.s3-x { opacity: 1; }
.iw-xh.is-target .iw-ret--shooter .iw-ret__tick, .iw-xh.is-target .iw-ret--dualies .iw-ret__tick { opacity: 0; }
.iw-xh .iw-ret g.s3-x path { stroke: #fff; stroke-width: 2.6; stroke-linecap: round; fill: none; }
.iw-xh .iw-ret g.s3-x path.sh { stroke: rgba(0, 0, 0, .35); stroke-width: 4.6; }
.iw-xh.s3-world-hit .iw-hit { visibility: hidden; }
.s3-hitflash { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 3; }
.s3-hitflash svg { position: absolute; left: -${S3_RETICLE.flashSize / 2}px; top: -${S3_RETICLE.flashSize / 2}px; width: ${S3_RETICLE.flashSize}px; height: ${S3_RETICLE.flashSize}px; overflow: visible; filter: drop-shadow(0 0 4px rgba(255, 255, 255, .9)); }
.s3-hitflash path { fill: #fff; }
`;

// Eight-point star: long spikes on the axes, short on the diagonals.
export function hitFlashPath(long = 23, short = 11, waist = 3.2) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? waist : (i % 4 === 0 ? long : short);
    pts.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
  }
  return 'M' + pts.join(' L') + ' Z';
}

function crossGroup(cx = 0) {
  const d = [];
  const k = Math.SQRT1_2, a = S3_RETICLE.crossInner * k, b = S3_RETICLE.crossOuter * k;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) d.push(`M${cx + sx * a} ${sy * a} L${cx + sx * b} ${sy * b}`);
  const path = d.join(' ');
  return `<g class="s3-x"><path class="sh" d="${path}"/><path d="${path}"/></g>`;
}

// Post-process the reticle the HUD just built. Pure DOM edits on its own nodes.
export function restyleReticle(ret, kind) {
  const svg = ret?.querySelector?.('svg.iw-ret__svg');
  if (!svg) return false;
  if (kind === 'shooter') {
    const ring = svg.querySelector('circle.iw-ret__ring');
    if (!ring) return false;
    ring.setAttribute('r', String(S3_RETICLE.ringRadius));
    ring.classList.add('s3-ring');
    if (!svg.querySelector('circle.s3-ring-edge')) {
      const edge = svg.ownerDocument.createElementNS(SVG_NS, 'circle');
      edge.setAttribute('r', String(S3_RETICLE.ringRadius)); edge.setAttribute('class', 's3-ring-edge');
      svg.insertBefore(edge, ring);
    }
    if (!svg.querySelector('g.s3-x')) svg.insertAdjacentHTML('beforeend', crossGroup());
    return true;
  }
  if (kind === 'dualies') {
    const cx = S3_RETICLE.dualRingCx;
    for (const c of svg.querySelectorAll('circle')) {
      const x = Number(c.getAttribute('cx'));
      if (Math.abs(Math.abs(x) - 19.5) < 1e-6) c.setAttribute('cx', String(Math.sign(x) * cx));
      if (Math.abs(Number(c.getAttribute('r')) - 12.8) < 1e-6) c.setAttribute('r', String(S3_RETICLE.ringRadius));
    }
    // The moving (landing guide) rings get the ink edge; the on-target X rides
    // with each of them. The fixed camera rings keep INKWAVE's faint look.
    for (const hand of svg.querySelectorAll('g.iw-ret__hand')) {
      const ring = hand.querySelector('circle.iw-ret__ring');
      if (!ring || hand.querySelector('.s3-ring-edge')) continue;
      const edge = ring.cloneNode(); edge.setAttribute('class', 's3-ring-edge');
      hand.insertBefore(edge, ring); ring.classList.add('s3-ring');
      hand.querySelector('.iw-ret__dual-dot')?.setAttribute('r', '2.2');
      hand.insertAdjacentHTML('beforeend', crossGroup(Number(ring.getAttribute('cx')) || 0));
    }
    return true;
  }
  if (kind === 'splatling') {
    const second = svg.querySelector('circle.iw-ret__charge-second');
    const first = svg.querySelector('circle.iw-ret__charge:not(.iw-ret__charge-second)');
    if (!second || !first) return false;
    const r = first.getAttribute('r');
    for (const c of [...svg.querySelectorAll('circle.iw-ret__track')]) if (c.getAttribute('r') !== r) c.remove();
    second.setAttribute('r', r);
    first.after(second);
    return true;
  }
  return false;
}

export function installS3ReticleLook({ G, HUD, on }) {
  const P = HUD?.prototype;
  if (!P || P._s3ReticleLook) return;
  P._s3ReticleLook = true;
  const doc = globalThis.document;
  if (doc?.head && !doc.getElementById('s3-reticle-look')) {
    const style = doc.createElement('style');
    style.id = 's3-reticle-look'; style.textContent = S3_RETICLE_CSS;
    doc.head.appendChild(style);
  }
  const build = P._buildReticle;
  if (typeof build === 'function') P._buildReticle = function (kind, ...rest) {
    const result = build.call(this, kind, ...rest);
    try { restyleReticle(this.ret, kind); } catch { /* presentation only; a partial DOM keeps INKWAVE's look */ }
    return result;
  };
  const flashes = [];
  on?.('hit', ({ attacker, victim, damage } = {}) => {
    const local = G.match?.local;
    if (!local || attacker !== local || !victim?.pos || victim === local || G.match?.attract || G.match?.mode === 'boss') return;
    if (!(damage > 0)) return;
    flashes.push({ victim, t0: performance.now() / 1000, el: null });
    if (flashes.length > 6) flashes.shift().el?.remove();
  });
  const update = P.update;
  P.update = function (...args) {
    const result = update.apply(this, args);
    const world = !!(G.match && !G.match.attract && G.match.mode !== 'boss');
    if (this.xh && this._s3WorldHit !== world) { this._s3WorldHit = world; this.xh.classList.toggle('s3-world-hit', world); }
    drawFlashes(this, G, flashes);
    return result;
  };
}

function drawFlashes(hud, G, flashes) {
  if (!flashes.length) return;
  const cam = G.camera, layer = hud.downLayer || hud.el, now = performance.now() / 1000;
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], age = now - f.t0;
    if (age > S3_RETICLE.flashLife || !cam || typeof hud._project !== 'function' || !layer) { f.el?.remove(); flashes.splice(i, 1); continue; }
    if (!f.el && globalThis.document) {
      f.el = document.createElement('div');
      f.el.className = 's3-hitflash';
      f.el.innerHTML = `<svg viewBox="-25 -25 50 50" aria-hidden="true"><path d="${hitFlashPath()}"/></svg>`;
      layer.appendChild(f.el);
    }
    const v = f.victim, y = v.pos.y + (v.smoothY || 0) + (v.form === 'squid' ? 0.3 : 0.9);
    const p = hud._project(cam, v.pos.x, y, v.pos.z);
    if (!f.el) continue;
    const vis = p && p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
    const k = age / S3_RETICLE.flashLife, scale = 0.55 + 0.7 * Math.min(1, k * 2.2), opacity = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    f.el.style.opacity = vis ? opacity.toFixed(2) : '0';
    if (vis) f.el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px,0) scale(${scale.toFixed(3)}) rotate(${(k * 20).toFixed(1)}deg)`;
  }
}
