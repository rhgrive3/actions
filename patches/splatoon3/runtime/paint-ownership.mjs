// CPU ownership companion for the native paint fragment shader.
// The shader remains responsible for the animated atlas draw. This evaluates its
// final seeded mask once when a splat is submitted, matching the existing
// immediate CPU-gameplay / animated-GPU-presentation contract.

const OWNER_CAPTURE = Symbol.for('inkwave.issue264.paint-owner-capture');
const OWNER_PUSH = Symbol.for('inkwave.issue264.paint-owner-push');

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const fract = x => x - Math.floor(x);

function smoothstep(lo, hi, x) {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

function hsh(n) {
  return fract(Math.sin(n) * 43758.5453123);
}

function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function sdRay(px, py, ax, ay, bx, by, ra, rb) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-8), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.hypot(dx, dy) - (ra * (1 - h) + rb * h);
}

function normalize(x, y) {
  const l = Math.hypot(x, y);
  return l > 0 ? [x / l, y / l] : [0, 0];
}

function transformPoint(x, y, sdu, sdv, sa) {
  if (sa <= 0) return [x, y];
  const along = x * sdu + y * sdv;
  const scale = along > 0 ? 1 + sa : 1 + 0.25 * sa;
  return [x + sdu * along * (1 / scale - 1), y + sdv * along * (1 / scale - 1)];
}

function kindCounts(kind, contract) {
  return contract.kindShapes[kind] || [0, 0, 0, 0];
}

function shaderDistance(g, entry, px0, py0, contract, blobWobble, includeAncillary, includeDrips) {
  const { f, dn, sdu, sdv, sa } = entry;
  const R = g.R;
  const r2 = R * R - dn * dn;
  if (r2 <= 0) return Infinity;
  const r = Math.sqrt(r2);
  if (r <= 1e-8) return Infinity;
  const fall = clamp(r / Math.max(R, 1e-3), 0, 1);
  const kind = g.kind;
  const [rayCount, satelliteCount, spatterCount, dripCount] = kindCounts(kind, contract);
  const [px, py] = transformPoint(px0, py0, sdu, sdv, sa);

  let sd;
  if (kind === contract.kind.roll) {
    const bx = -sdv, by = sdu;
    const qx = px0 * sdu + py0 * sdv;
    const qy = px0 * bx + py0 * by;
    const wv = r * (0.03 * Math.sin(qx / r * 9 + g.seed * 30) + 0.018 * Math.sin(qx / r * 23 + g.seed * 11));
    const dx = Math.abs(qx) - r * contract.band[0];
    const dy = Math.abs(qy) - (r * contract.band[1] + wv);
    sd = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r * contract.band[2];
  } else if (kind === contract.kind.speck) {
    const a = Math.atan2(py, px);
    sd = Math.hypot(px, py) - r * (1 + 0.12 * Math.sin(3 * a + g.seed * 20));
  } else {
    sd = Math.hypot(px, py) - r * blobWobble(Math.atan2(py, px), g.seed);
  }

  const dirAng = sa > 0 ? Math.atan2(sdv, sdu) : 0;
  const spread = 6.2831 + (2.5 - 6.2831) * clamp(sa * 1.2, 0, 1);
  const big = kind > 1.5 && kind < 3.5;

  if (includeAncillary) for (let k = 0; k < rayCount; k++) {
    const fk = k;
    const h1 = hsh(g.seed * 7.31 + fk * 1.93);
    const h2 = hsh(g.seed * 3.17 + fk * 5.71);
    const h3 = hsh(g.seed * 11.3 + fk * 2.39);
    const a = sa > 0
      ? dirAng + (h1 - 0.5) * spread
      : (fk + 0.35 + 0.6 * h1) / rayCount * 6.2831 + g.seed * 6.2831;
    const ux = Math.cos(a), uy = Math.sin(a);
    const edge = r * blobWobble(a, g.seed);
    const len = r * (0.07 + (big ? 0.5 : 0.4) * h2 * h2 * h2);
    const wB = r * (0.055 + 0.06 * h3);
    const tipR = Math.max(r * (0.012 + 0.012 * h3), (1 / f.atlas.ppm) * 0.45);
    const tipX = ux * (edge + len) + -uy * len * 0.18 * (h1 - 0.5);
    const tipY = uy * (edge + len) + ux * len * 0.18 * (h1 - 0.5);
    const ray = Math.min(
      sdRay(px, py, ux * edge * 0.72, uy * edge * 0.72, tipX, tipY, wB, tipR),
      Math.hypot(px - tipX, py - tipY) - tipR * (1.6 + 1.4 * h2),
    );
    sd = smin(sd, ray, r * 0.06);
  }

  if (includeAncillary) for (let k = 0; k < satelliteCount; k++) {
    const fk = k;
    const h1 = hsh(g.seed * 13.1 + fk * 7.7);
    const h2 = hsh(g.seed * 5.3 + fk * 3.1);
    const h3 = hsh(g.seed * 9.9 + fk * 1.7);
    const a = sa > 0 ? dirAng + (h1 - 0.5) * spread : h1 * 6.2831;
    let ux = Math.cos(a), uy = Math.sin(a);
    if (f.wall) [ux, uy] = normalize(ux * (1 - 0.32), uy * (1 - 0.32) - 0.32);
    const dist = r * (1.1 + (big ? 1.05 : 0.8) * h2 * h2);
    const rad = r * (0.028 + 0.085 * h3) * fall * (1 - 0.4 * h2) * (big ? 0.8 : 1);
    let qx = px - ux * dist, qy = py - uy * dist;
    const elongation = 1 + (0.5 + 1.6 * sa) * h2;
    const along = qx * ux + qy * uy;
    qx -= ux * along * (1 - 1 / elongation);
    qy -= uy * along * (1 - 1 / elongation);
    sd = smin(sd, Math.hypot(qx, qy) - rad, rad * 0.8);
  }

  if (includeAncillary) for (let k = 0; k < spatterCount; k++) {
    const fk = k;
    const h1 = hsh(g.seed * 17.9 + fk * 4.13);
    const h2 = hsh(g.seed * 2.71 + fk * 8.09);
    const h3 = hsh(g.seed * 6.47 + fk * 3.37);
    const a = sa > 0 ? dirAng + (h1 - 0.5) * spread * 1.15 : h1 * 6.2831;
    let ux = Math.cos(a), uy = Math.sin(a);
    if (f.wall) [ux, uy] = normalize(ux * (1 - 0.25), uy * (1 - 0.25) - 0.25);
    const rad = Math.max(r * (0.011 + 0.02 * h3) * fall, (1 / f.atlas.ppm) * 0.9);
    sd = Math.min(sd, Math.hypot(px - ux * r * (1.3 + 1.2 * h2), py - uy * r * (1.3 + 1.2 * h2)) - rad);
  }

  if (includeDrips && f.wall && fall > 0.3 && dripCount > 0) {
    const nDrips = Math.min(6, dripCount + Math.floor(R * 1.2));
    for (let k = 0; k < nDrips; k++) {
      const fk = k;
      const h1 = hsh(g.seed * 3.7 + fk * 11.3);
      const h2 = hsh(g.seed * 8.1 + fk * 2.9);
      const h3 = hsh(g.seed * 4.3 + fk * 5.9);
      if (k > 1 && h3 < 0.3) continue;
      const x = (h1 * 2 - 1) * r * 0.72;
      const c = Math.sqrt(Math.max(1 - (x / r) * (x / r), 0));
      const yTop = -c * r * 0.7;
      const len = c * r * 0.25 + r * (0.3 + 2.3 * h2 * h2) * fall;
      const w = r * (0.042 + 0.04 * h3) * (0.75 + 0.35 * fall);
      let qx = px0 - x, qy = py0 - yTop;
      const ty = clamp(-qy / Math.max(len, 1e-4), 0, 1);
      qx += Math.sin(qy / r * 9 + g.seed * 20 + fk * 2.3) * w * 0.35 * ty;
      const wt = w * (1 + (0.6 - 1) * smoothstep(0.05, 0.85, ty));
      const stream = Math.max(Math.abs(qx) - wt, Math.max(qy, -len - qy));
      const tqx = qx, tqy = (qy + len - w * 0.3) * 0.8;
      const bulb = Math.hypot(tqx, tqy) - w * (1.2 + 0.35 * h2) * (0.6 + 0.4);
      sd = smin(sd, smin(stream, bulb, w * 0.9), w * 1.2);
    }
  }

  return sd;
}

// The fragment shader discards coverage at alpha <= .002. Estimate its fwidth
// from one atlas texel in each face-space direction, matching the shader's
// atlas-space derivatives without a GPU readback.
export function shaderPaintMaskContains(g, entry, px, py, contract, blobWobble, { ancillary = true, drips = true } = {}) {
  const tx = 1 / entry.f.atlas.ppm;
  const sd = shaderDistance(g, entry, px, py, contract, blobWobble, ancillary, drips);
  if (!Number.isFinite(sd)) return false;
  const fw = Math.max(
    Math.abs(shaderDistance(g, entry, px + tx, py, contract, blobWobble, ancillary, drips) - sd) +
    Math.abs(shaderDistance(g, entry, px, py + tx, contract, blobWobble, ancillary, drips) - sd),
    1e-5,
  );
  const alpha = 1 - smoothstep(-1.5 * fw, 1.5 * fw, sd);
  return alpha > 0.002;
}

function applyShaderOwnership(paint, g, contract, blobWobble) {
  const E = g.entries;
  if (!Array.isArray(E) || !E.length || g.kind === contract.kind.speck) return 0;
  const [rays, satellites, spatter, drips] = kindCounts(g.kind, contract);
  if (rays + satellites + spatter + drips === 0) return 0;

  const value = g.team + 1;
  let claimed = 0;
  for (let n = 0; n < E.length; n += 7) {
    const f = E[n], lu = E[n + 1], lv = E[n + 2], dn = E[n + 3];
    const sdu = E[n + 4], sdv = E[n + 5], sa = E[n + 6];
    if (f?.grid == null || dn >= g.R || !f.atlas?.ppm || f.cu <= 0 || f.cv <= 0) continue;
    const r = Math.sqrt(Math.max(0, g.R * g.R - dn * dn));
    if (r <= 0) continue;

    // Match the native GPU quad's clipped face-space bounds. The fixed bound
    // means work is limited to this splat's affected cells and never rebuilds
    // the map during flush/render frames.
    const ext = r * (contract.reach[g.kind] + 1.4 * sa);
    const down = f.wall && g.dripDur ? r * contract.dripReach : 0;
    const i0 = Math.max(0, Math.floor((lu - ext) / f.cu));
    const i1 = Math.min(f.nu - 1, Math.floor((lu + ext) / f.cu));
    const j0 = Math.max(0, Math.floor((lv - Math.max(ext, down)) / f.cv));
    const j1 = Math.min(f.nv - 1, Math.floor((lv + ext) / f.cv));
    if (i1 < i0 || j1 < j0) continue;
    const cellArea = f.cu * f.cv;
    const entry = { f, dn, sdu, sdv, sa };

    for (let j = j0; j <= j1; j++) {
      const py = (j + 0.5) * f.cv - lv;
      for (let i = i0; i <= i1; i++) {
        const index = f.grid + j * f.nu + i;
        if (paint.grid[index] === value) continue;
        const px = (i + 0.5) * f.cu - lu;
        if (px < -ext || px > ext || py < -Math.max(ext, down) || py > ext) continue;
        if (!shaderPaintMaskContains(g, entry, px, py, contract, blobWobble)) continue;
        const previous = paint.grid[index];
        paint.grid[index] = value;
        claimed += cellArea;
        if (f.turf && !paint.dead[index]) {
          if (previous) paint.counts[previous - 1]--;
          paint.counts[g.team]++;
        }
      }
    }
  }
  if (claimed > 0) paint.version++;
  return claimed;
}

function captureGrowth(state, g) {
  const frame = state.frames[state.frames.length - 1];
  if (!frame || frame.growth || !g || !Array.isArray(g.entries) || !g.entries.length) return;
  if (g.team !== frame.team || g.R !== frame.radius || g.cx !== frame.x || g.cy !== frame.y || g.cz !== frame.z) return;
  if (g.kind === frame.contract.kind.speck) return;
  frame.growth = g;
  frame.claimed += applyShaderOwnership(frame.paint, g, frame.contract, frame.blobWobble);
}

function ensureCapture(paint, contract, blobWobble) {
  let state = paint[OWNER_CAPTURE];
  if (!state) {
    state = { frames: [], emit: null };
    Object.defineProperty(paint, OWNER_CAPTURE, { value: state });
  }
  if (!state.emit || paint._emitGrowth !== state.emit) {
    const nativeEmit = paint._emitGrowth;
    const emit = function issue264CaptureGrowth(g, ...args) {
      const result = nativeEmit.call(this, g, ...args);
      captureGrowth(state, g);
      return result;
    };
    Object.defineProperty(paint, '_emitGrowth', { value: emit, writable: true, configurable: true });
    state.emit = emit;
  }

  const growing = paint.growing;
  if (Array.isArray(growing) && !growing[OWNER_PUSH]) {
    const pushState = { nativePush: growing.push, owner: state };
    const push = function issue264CapturePush(...records) {
      const result = pushState.nativePush.apply(this, records);
      for (const g of records) captureGrowth(pushState.owner, g);
      return result;
    };
    Object.defineProperty(growing, OWNER_PUSH, { value: pushState });
    growing.push = push;
  }
  state.contract = contract;
  state.blobWobble = blobWobble;
  return state;
}

export function installIssue264PaintOwnership(PaintSystem, contract, blobWobble) {
  const proto = PaintSystem?.prototype;
  if (!proto || typeof proto.splat !== 'function' || typeof proto._emitGrowth !== 'function') {
    throw new TypeError('Issue #264 paint ownership requires native splat and growth methods');
  }
  if (!contract?.kindShapes || typeof blobWobble !== 'function') {
    throw new TypeError('Issue #264 paint ownership requires the native shader contract');
  }
  const installed = Symbol.for('inkwave.issue264.paint-ownership-installed');
  if (proto[installed]) return false;

  const nativeSplat = proto.splat;
  proto.splat = function issue264SplatOwnership(center, radius, team, opts = {}) {
    if (opts.cosmetic || !Array.isArray(this.growing)) return nativeSplat.call(this, center, radius, team, opts);
    const state = ensureCapture(this, contract, blobWobble);
    const frame = {
      paint: this, contract, blobWobble, team, radius,
      x: center.x, y: center.y, z: center.z, growth: null, claimed: 0,
    };
    state.frames.push(frame);
    try {
      return nativeSplat.call(this, center, radius, team, opts) + frame.claimed;
    } finally {
      state.frames.pop();
    }
  };
  Object.defineProperty(proto, installed, { value: true });
  return true;
}
