// Issue #264 — authoritative CPU paint ownership parity with the native GPU footprint.
//
// The native paint system answers gameplay queries ("is this spot my ink?", turf coverage, enemy-ink
// movement) from a coarse CPU grid that only evaluated the main blob / roller band. The atlas shader
// additionally unions rays, satellite droplets, fine spatter and wall drips into the normal team ink
// channels, so visible ink could disagree with the grid. This module mirrors those native shapes into
// the grid without changing a single byte of inkwave-public/.
//
// The build adapter (paint-footprint-adapter.mjs) rewrites the native shader hash to the float-stable
// `hsh` used here, redirects `_cpuSplat` to `_cpuSplatOwned`, gates `_emitGrowth` on the submitted
// quad, and appends `installPaintFootprint(...)`. Everything else lives here.
//
// Reference: parent-rejected native prototype 2336ffdd91ce12d8653f4057e23205e364f0d76b (removed
// source only; the geometry was transferred, not copied).
//
// Honest scope (see reports/inkwave-splatoon3-behavior-2026-10-02.md):
//  * The shadowed native grid is authoritative only in the same sense the native body already was:
//    secondary cells are written when their growth quad is actually submitted, so what the CPU owns
//    is a subset of what was presented, never a superset.
//  * The stable shape hash changes ray/satellite/spatter/drip geometry for a fixed seed relative to
//    the previous sin-based hash. Shader tone is preserved through `toneHash`.
//  * `owner` credit for late cells is opt-in via `splat(..., { owner })`; no native call site is
//    rewritten here. When absent, the area still lands in `lateAreaByTeam` / `onLateCredit`.

export const SHAPE_COUNTS = [
  [5, 7, 8, 3],    // shot
  [3, 4, 5, 2],    // charger line
  [7, 9, 10, 4],   // blast
  [10, 12, 14, 5], // bomb / slam / splat-out
  [3, 4, 4, 2],    // trail drip
  [2, 2, 0, 1],    // droplet paint
  [0, 0, 0, 0],    // roller band (body only)
  [0, 0, 0, 0],    // speck (cosmetic)
];
export const CPU_RAY = 1, CPU_ELLIPSE = 2, CPU_CIRCLE = 3, CPU_DRIP = 4;
export const TAU = 6.2831;

// Share a float-stable shape hash with GLSL. The native `sin(n) * 43758.5` amplifies backend sin
// precision differences; this 3-multiply integer-ish hash reproduces within float32 on both sides.
export function shapeHash(seed, seedScale, index, indexScale) {
  const f = Math.fround;
  const n = f(f(f(seed) * f(seedScale)) + f(f(index) * f(indexScale)));
  let x = f(n * f(0.1031));
  x = f(x - Math.floor(x));
  x = f(x * f(x + f(33.33)));
  x = f(x * f(x + x));
  x = f(x + f(0.056));
  return x - Math.floor(x);
}

export function clamp01(x) { return Math.max(0, Math.min(1, x)); }
export function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
export function smoothMin(a, b, k) { const h = clamp01(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); }
// thin tapered ray from (ax,ay) r=ra to (bx,by) r=rb — CPU mirror of the shader's sdRay
export function sdRay(px, py, ax, ay, bx, by, ra, rb) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-8));
  return Math.hypot(pax - bax * h, pay - bay * h) - (ra + (rb - ra) * h);
}

const MARK = Symbol.for('inkwave.paintFootprint.v1');

/**
 * Install the footprint mirroring on a native PaintSystem class.
 * @param {Function} PaintSystem  the native class (already defined, not yet instantiated)
 * @param {object}   opts         { blobWobble, maxQuads }
 * @returns {boolean} true when installed, false when it was already present
 */
export function installPaintFootprint(PaintSystem, { blobWobble, maxQuads = 6000 } = {}) {
  if (typeof blobWobble !== 'function') throw new Error('paint footprint requires the native blobWobble edge');
  const proto = PaintSystem.prototype;
  if (proto[MARK]) return false;
  Object.defineProperty(proto, MARK, { value: true });

  const K_SHOT = 0, K_LINE = 1, K_TRAIL = 4, K_DROP = 5, K_ROLL = 6;
  const TEAM_COUNT = 2;

  const initGrid = proto._initGrid, clear = proto.clear, drawQuads = proto._drawQuads;

  proto._initGrid = function (...args) {
    const result = initGrid.apply(this, args);
    // Last visible ownership event per cell; rejects growth from an older splat writing over newer ink.
    this.paintOrder = new Uint32Array(this.grid.length);
    this._paintOrder = 0;
    this._pendingCpuGrowth = new Array(maxQuads);
    this._pendingCpuEntry = new Uint32Array(maxQuads);
    this._pendingCpuTn = new Float32Array(maxQuads);
    this._pendingCpuDt = new Float32Array(maxQuads);
    this._pendingCpuMode = new Uint8Array(maxQuads);
    this._pendingCpuCount = 0;
    this._cpuFeature = new Float64Array(16);
    this._cpuBounds = new Float64Array(4);
    this.lateAreaByTeam = new Array(TEAM_COUNT).fill(0);
    return result;
  };

  proto.clear = function (...args) {
    const result = clear.apply(this, args);
    if (this.paintOrder) { this.paintOrder.fill(0); this._paintOrder = 0; }
    if (this._pendingCpuGrowth) { this._pendingCpuGrowth.fill(null); this._pendingCpuCount = 0; }
    if (this.lateAreaByTeam) this.lateAreaByTeam.fill(0);
    return result;
  };

  // CPU growth follows the batch that was actually presented, never a future growth step.
  proto._drawQuads = function (...args) {
    const result = drawQuads.apply(this, args);
    this._commitCpuGrowth();
    return result;
  };

  proto._nextPaintOrder = function () {
    this._paintOrder = (this._paintOrder + 1) >>> 0;
    if (this._paintOrder === 0) this._paintOrder = 1;
    return this._paintOrder;
  };

  // Write one cell and report the newly claimed area exactly once (a re-owned cell reports 0).
  proto._cpuCellWrite = function (f, k, team, order, coveredFraction = 1) {
    const previousOrder = this.paintOrder[k];
    if (previousOrder && order !== previousOrder && ((order - previousOrder) >>> 0) >= 0x80000000) return 0;
    this.paintOrder[k] = order;
    const val = team + 1, prev = this.grid[k];
    if (prev === val) return 0;
    this.grid[k] = val;
    if (f.turf && !this.dead[k]) {
      if (prev) this.counts[prev - 1]--;
      this.counts[team]++;
    }
    return f.cu * f.cv * coveredFraction;
  };

  // Signed distance to the main body edge (blob / stretched blob / roller band). Mirrors the shader.
  proto._cpuBodyDistance = function (px, py, r, seed, sdu, sdv, sa, roll) {
    if (roll) {
      const along = px * sdu + py * sdv, across = -px * sdv + py * sdu;
      const wave = r * (0.03 * Math.sin(along / r * 9 + seed * 30) + 0.018 * Math.sin(along / r * 23 + seed * 11));
      const qa = Math.abs(along) - r * 0.55, qb = Math.abs(across) - r * 0.62 - wave;
      return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * 0.1;
    }
    if (sa > 0) {
      const a = px * sdu + py * sdv, qx = px - a * sdu, qy = py - a * sdv;
      const stretch = a > 0 ? 1 + sa : 1 + 0.25 * sa;
      px = qx + sdu * (a / stretch); py = qy + sdv * (a / stretch);
    }
    return Math.hypot(px, py) - r * blobWobble(Math.atan2(py, px), seed);
  };

  // Authoritative main body: half-cell + AA reach, 5×5 sub-sampled cells, fractional area credit.
  proto._cpuSplatOwned = function (f, lu, lv, r, team, seed, sdu, sdv, sa, kind, order) {
    if (r <= 0.02) return 0;
    if (!order) order = 1;
    const roll = kind === K_ROLL;
    const texel = 1 / Math.max(1, f.atlas?.ppm || this.ppm || 1);
    const aa = 1.5 * texel, cellReach = 0.5 * Math.hypot(f.cu, f.cv) + aa;
    const ext = (roll ? r * (Math.hypot(0.55, 0.62) + 0.1 + 0.05) : r * (1 + sa) * 1.5) + cellReach;
    const i0 = Math.max(0, Math.floor((lu - ext) / f.cu)), i1 = Math.min(f.nu - 1, Math.floor((lu + ext) / f.cu));
    const j0 = Math.max(0, Math.floor((lv - ext) / f.cv)), j1 = Math.min(f.nv - 1, Math.floor((lv + ext) / f.cv));
    if (i1 < i0 || j1 < j0) return 0;
    let claimed = 0, touched = false;
    // Any visible fragment within a cell is close to one of these samples; their covered fraction
    // feeds one-time area credit.
    const sub = 5;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        let hit = false, covered = 0;
        for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) {
          const px = ((i + 0.5 + (sx - 2) * 0.2) * f.cu) - lu;
          const py = ((j + 0.5 + (sy - 2) * 0.2) * f.cv) - lv;
          const sd = this._cpuBodyDistance(px, py, r, seed, sdu, sdv, sa, roll);
          if (sd <= aa) { hit = true; if (sd <= 0) covered++; }
        }
        if (hit) {
          const k = f.grid + j * f.nu + i, before = this.grid[k];
          claimed += this._cpuCellWrite(f, k, team, order, covered / (sub * sub));
          if (this.grid[k] !== before) touched = true;
        }
      }
    }
    if (touched) this.version++;
    return claimed;
  };

  // Broadphase bounds for a feature, in cell indices, using `_cpuFeature` (set by the caller).
  proto._cpuFeatureBounds = function (f, lu, lv, sdu, sdv, sa, stretched) {
    const s = this._cpuFeature, pad = s[5] + 0.5 * Math.hypot(f.cu, f.cv);
    const x0 = s[1] - s[3] - pad, x1 = s[1] + s[3] + pad;
    const y0 = s[2] - s[4] - pad, y1 = s[2] + s[4] + pad;
    let minX = x0, maxX = x1, minY = y0, maxY = y1;
    if (stretched && sa > 0) {
      minX = minY = Infinity; maxX = maxY = -Infinity;
      for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
        let x = ix ? x1 : x0, y = iy ? y1 : y0;
        const a = x * sdu + y * sdv, scale = a > 0 ? 1 + sa : 1 + 0.25 * sa;
        x += sdu * a * (scale - 1); y += sdv * a * (scale - 1);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      // The inverse stretch is piecewise linear; retain its zero-projection seam in the bounds.
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    }
    const b = this._cpuBounds;
    b[0] = Math.max(0, Math.floor((lu + minX) / f.cu));
    b[1] = Math.min(f.nu - 1, Math.floor((lu + maxX) / f.cu));
    b[2] = Math.max(0, Math.floor((lv + minY) / f.cv));
    b[3] = Math.min(f.nv - 1, Math.floor((lv + maxY) / f.cv));
    return b;
  };

  proto._cpuFeatureDistance = function (px, py, s) {
    if (s[0] === CPU_RAY) {
      return Math.min(sdRay(px, py, s[6], s[7], s[8], s[9], s[10], s[11]),
        Math.hypot(px - s[12], py - s[13]) - s[14]);
    }
    if (s[0] === CPU_ELLIPSE) {
      let qx = px - s[6], qy = py - s[7];
      const along = qx * s[8] + qy * s[9];
      qx -= s[8] * along * (1 - 1 / s[10]); qy -= s[9] * along * (1 - 1 / s[10]);
      return Math.hypot(qx, qy) - s[11];
    }
    if (s[0] === CPU_CIRCLE) return Math.hypot(px - s[6], py - s[7]) - s[8];
    const qy = py - s[7], ty = clamp01(-qy / Math.max(s[8], 1e-4));
    const qx = px - s[6] + Math.sin(qy / s[12] * 9 + s[11]) * s[9] * 0.35 * ty;
    const wt = s[9] * (1 - 0.4 * smoothstep(0.05, 0.85, ty));
    const stream = Math.max(Math.abs(qx) - wt, Math.max(qy, -s[8] - qy));
    const bulbY = (qy + s[8] - s[9] * 0.3) * 0.8;
    return smoothMin(stream, Math.hypot(qx, bulbY) - s[10], s[9] * 0.9);
  };

  proto._cpuShapeFeature = function (f, lu, lv, team, order, sdu, sdv, sa, stretched) {
    const s = this._cpuFeature, bounds = this._cpuFeatureBounds(f, lu, lv, sdu, sdv, sa, stretched);
    const val = team + 1, sub = 5;
    if (bounds[1] < bounds[0] || bounds[3] < bounds[2]) return 0;
    let claimed = 0;
    for (let j = bounds[2]; j <= bounds[3]; j++) {
      for (let i = bounds[0]; i <= bounds[1]; i++) {
        const k = f.grid + j * f.nu + i, previousOrder = this.paintOrder[k];
        if (previousOrder && order !== previousOrder && ((order - previousOrder) >>> 0) >= 0x80000000) continue;
        if (previousOrder === order && this.grid[k] === val) continue;
        let hit = false;
        for (let sy = 0; sy < sub && !hit; sy++) for (let sx = 0; sx < sub; sx++) {
          let px = (i + 0.5 + (sx - 2) * 0.2) * f.cu - lu, py = (j + 0.5 + (sy - 2) * 0.2) * f.cv - lv;
          if (stretched && sa > 0) {
            const a = px * sdu + py * sdv, qx = px - a * sdu, qy = py - a * sdv;
            const scale = a > 0 ? 1 + sa : 1 + 0.25 * sa;
            px = qx + sdu * (a / scale); py = qy + sdv * (a / scale);
          }
          if (this._cpuFeatureDistance(px, py, s) <= s[5]) { hit = true; break; }
        }
        if (hit) claimed += this._cpuCellWrite(f, k, team, order);
      }
    }
    return claimed;
  };

  // Mirror rays, satellites, spatter and wall drips of one submitted growth step into the grid.
  proto._cpuSplatGrowth = function (f, lu, lv, dn, R, team, seed, sdu, sdv, sa, kind, tn, dT, dripOnly, order) {
    if (!order || kind < K_SHOT || kind > K_DROP) return 0;
    R = Math.fround(R); seed = Math.fround(seed); sdu = Math.fround(sdu); sdv = Math.fround(sdv);
    sa = Math.fround(sa); tn = Math.fround(tn); dT = Math.fround(dT); dn = Math.fround(dn);
    if (dn >= R) return 0;
    const r = Math.sqrt(Math.max(0, R * R - dn * dn));
    if (r <= 0.02) return 0;
    const fall = clamp01(r / R), counts = SHAPE_COUNTS[kind];
    const texel = 1 / Math.max(1, f.atlas?.ppm || this.ppm || 1);
    const big = kind > K_LINE && kind < K_TRAIL;
    const dirAng = sa > 0 ? Math.atan2(sdv, sdu) : 0;
    const spread = TAU + (2.5 - TAU) * clamp01(sa * 1.2);
    let claimed = 0;
    const s = this._cpuFeature;

    if (!dripOnly) {
      const tb = 1 - Math.pow(1 - clamp01(tn), 4), grow = 0.4 + 0.6 * tb;
      const tsp = 1 - Math.pow(1 - clamp01(tn * 1.4), 3);
      for (let k = 0; k < counts[0]; k++) {
        const fk = k, h1 = shapeHash(seed, 7.31, fk, 1.93), h2 = shapeHash(seed, 3.17, fk, 5.71), h3 = shapeHash(seed, 11.3, fk, 2.39);
        const a = sa > 0 ? dirAng + (h1 - 0.5) * spread : (fk + 0.35 + 0.6 * h1) / counts[0] * TAU + seed * TAU;
        const ux = Math.cos(a), uy = Math.sin(a), edge = r * grow * blobWobble(a, seed);
        const len = r * (0.07 + (big ? 0.5 : 0.4) * h2 * h2 * h2) * tsp, wB = r * (0.055 + 0.06 * h3);
        const tipR = Math.max(r * (0.012 + 0.012 * h3), texel * 0.45);
        const ax = ux * edge * 0.72, ay = uy * edge * 0.72;
        const tipX = ux * (edge + len) - uy * len * 0.18 * (h1 - 0.5);
        const tipY = uy * (edge + len) + ux * len * 0.18 * (h1 - 0.5);
        const beadR = tipR * (1.6 + 1.4 * h2), margin = r * 0.015 + 1.5 * texel;
        s[0] = CPU_RAY; s[1] = (ax + tipX) * 0.5; s[2] = (ay + tipY) * 0.5;
        s[3] = Math.abs(tipX - ax) * 0.5 + Math.max(wB, beadR) + r * 0.015;
        s[4] = Math.abs(tipY - ay) * 0.5 + Math.max(wB, beadR) + r * 0.015; s[5] = margin;
        s[6] = ax; s[7] = ay; s[8] = tipX; s[9] = tipY;
        s[10] = wB; s[11] = tipR; s[12] = tipX; s[13] = tipY; s[14] = beadR;
        claimed += this._cpuShapeFeature(f, lu, lv, team, order, sdu, sdv, sa, true);
      }

      for (let k = 0; k < counts[1]; k++) {
        const fk = k, h1 = shapeHash(seed, 13.1, fk, 7.7), h2 = shapeHash(seed, 5.3, fk, 3.1), h3 = shapeHash(seed, 9.9, fk, 1.7);
        const tl = 0.28 + 0.95 * h2, land = smoothstep(tl, tl + 0.2, tn);
        if (land <= 0) continue;
        const a = sa > 0 ? dirAng + (h1 - 0.5) * spread : h1 * TAU;
        let ux = Math.cos(a), uy = Math.sin(a);
        if (f.wall) { const x = ux * 0.68, y = uy * 0.68 - 0.32, l = Math.hypot(x, y); ux = x / l; uy = y / l; }
        const dist = r * (1.1 + (big ? 1.05 : 0.8) * h2 * h2);
        const rad = r * (0.028 + 0.085 * h3) * fall * (1 - 0.4 * h2) * (big ? 0.8 : 1) * land;
        const el = 1 + (0.5 + 1.6 * sa) * h2, cx = ux * dist, cy = uy * dist;
        s[0] = CPU_ELLIPSE; s[1] = cx; s[2] = cy;
        s[3] = Math.hypot(el * rad * ux, rad * uy) + rad * 0.2;
        s[4] = Math.hypot(el * rad * uy, rad * ux) + rad * 0.2; s[5] = rad * 0.2 + 1.5 * texel;
        s[6] = cx; s[7] = cy; s[8] = ux; s[9] = uy; s[10] = el; s[11] = rad;
        claimed += this._cpuShapeFeature(f, lu, lv, team, order, sdu, sdv, sa, true);
      }

      for (let k = 0; k < counts[2]; k++) {
        const fk = k, h1 = shapeHash(seed, 17.9, fk, 4.13), h2 = shapeHash(seed, 2.71, fk, 8.09), h3 = shapeHash(seed, 6.47, fk, 3.37);
        if (tn < 0.45 + 0.95 * h2) continue;
        const a = sa > 0 ? dirAng + (h1 - 0.5) * spread * 1.15 : h1 * TAU;
        let ux = Math.cos(a), uy = Math.sin(a);
        if (f.wall) { const x = ux * 0.75, y = uy * 0.75 - 0.25, l = Math.hypot(x, y); ux = x / l; uy = y / l; }
        const rad = Math.max(r * (0.011 + 0.02 * h3) * fall, texel * 0.9);
        const cx = ux * r * (1.3 + 1.2 * h2), cy = uy * r * (1.3 + 1.2 * h2);
        s[0] = CPU_CIRCLE; s[1] = cx; s[2] = cy; s[3] = rad; s[4] = rad; s[5] = 1.5 * texel;
        s[6] = cx; s[7] = cy; s[8] = rad;
        claimed += this._cpuShapeFeature(f, lu, lv, team, order, sdu, sdv, sa, true);
      }
    }

    if (f.wall && fall > 0.3 && counts[3] > 0) {
      const nD = Math.min(6, counts[3] + Math.floor(R * 1.2));
      for (let k = 0; k < nD; k++) {
        const fk = k, h1 = shapeHash(seed, 3.7, fk, 11.3), h2 = shapeHash(seed, 8.1, fk, 2.9), h3 = shapeHash(seed, 4.3, fk, 5.9);
        if (k > 1 && h3 < 0.3) continue;
        const x = (h1 * 2 - 1) * r * 0.72, c = Math.sqrt(Math.max(1 - (x / r) * (x / r), 0));
        const yTop = -c * r * 0.7, len = c * r * 0.25 + r * (0.3 + 2.3 * h2 * h2) * fall * dT;
        const w = r * (0.042 + 0.04 * h3) * (0.75 + 0.35 * fall);
        const bulbR = w * (1.2 + 0.35 * h2) * (0.6 + 0.4 * dT), cx = x, cy = yTop - len * 0.5;
        s[0] = CPU_DRIP; s[1] = cx; s[2] = cy;
        s[3] = Math.max(w * 1.45, bulbR) + w * 0.35; s[4] = len * 0.5 + bulbR;
        // The local distance already includes the stream/bulb smooth union; only the outer union
        // with prior ink adds another w * 1.2 / 4 of reach.
        s[5] = w * 0.3 + 1.5 * texel; s[6] = x; s[7] = yTop; s[8] = len; s[9] = w; s[10] = bulbR;
        s[11] = seed * 20 + fk * 2.3; s[12] = r;
        claimed += this._cpuShapeFeature(f, lu, lv, team, order, sdu, sdv, sa, false);
      }
    }
    if (claimed > 0) this.version++;
    return claimed;
  };

  proto._queueCpuGrowth = function (g, entry, tn, dT, dripOnly) {
    if (!g.order || g.kind < K_SHOT || g.kind > K_DROP) return;
    const n = this._pendingCpuCount++;
    this._pendingCpuGrowth[n] = g;
    this._pendingCpuEntry[n] = entry;
    this._pendingCpuTn[n] = tn;
    this._pendingCpuDt[n] = dT;
    this._pendingCpuMode[n] = dripOnly ? 1 : 0;
  };

  proto._commitCpuGrowth = function () {
    const count = this._pendingCpuCount;
    if (!count) return;
    for (let n = 0; n < count; n++) {
      const g = this._pendingCpuGrowth[n], o = this._pendingCpuEntry[n];
      this._pendingCpuGrowth[n] = null;
      if (!g) continue;
      const E = g.entries;
      const claimed = this._cpuSplatGrowth(E[o], E[o + 1], E[o + 2], E[o + 3], g.R, g.team, g.seed,
        E[o + 4], E[o + 5], E[o + 6], g.kind, this._pendingCpuTn[n], this._pendingCpuDt[n],
        this._pendingCpuMode[n] !== 0, g.order);
      if (claimed > 0) {
        this.lateAreaByTeam[g.team] = (this.lateAreaByTeam[g.team] || 0) + claimed;
        // A cell only reports area when its owner actually changed, so this credits once per cell.
        if (g.owner && typeof g.owner.addTurf === 'function') g.owner.addTurf(claimed);
        if (this.onLateCredit) this.onLateCredit(g.team, claimed, g.order, g.owner || null);
      }
    }
    this._pendingCpuCount = 0;
  };

  return true;
}
