// Frozen mathematical oracle from main 31703a9; test-only.
const STEP = 1 / 60;
const EPS = 1e-10;
const INSTALLED = Symbol.for('inkwave.issue264.paint-ownership-installed');

// Keep ordinary clocks numeric on the wire. Decimal strings carry only values
// beyond the safe-integer range, so an accepted causal jump cannot exhaust the
// next local emission or lose precision. Canonical encoding avoids alias IDs.
export function isPaintOrderClock(value) {
  return Number.isSafeInteger(value) && value >= 0
    || typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
      && BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER);
}
export function nextPaintOrderClock(value) {
  if (!isPaintOrderClock(value)) throw new Error('Invalid network paint clock');
  return typeof value === 'number' && value < Number.MAX_SAFE_INTEGER
    ? value + 1 : (BigInt(value) + 1n).toString();
}
export function paintClockComesAfter(a, b) {
  return typeof a === 'number' && typeof b === 'number' ? a > b : BigInt(a) > BigInt(b);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const fract = x => x - Math.floor(x);
const f32 = Math.fround;
const smoothstep = (lo, hi, x) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
// The ancillary mask must not depend on driver-specific sin() or amplified
// floating-point rounding. Quantize once on the CPU, then carry the exact 16-bit
// word in aGrow.w. Every hash intermediate is an integer below 2^24, so highp
// IEEE float arithmetic, including fused multiply/add, gives identical results.
// The power-of-two modulus and byte swap are exact as well. The native body
// wobble and cosmetic tone keep their existing source formulas.
export function paintShapeSeed(seed) { return Math.floor(fract(f32(seed)) * 65536); }
export function paintShapeHash(word, stream, index) {
  let x = (word + stream * 4099 + index * 131) % 65536;
  x = (x * 251 + 13849) % 65536;
  x = (x % 256) * 256 + Math.floor(x / 256);
  x = (x * 251 + 13849) % 65536;
  return x / 65536;
}
export const PAINT_SHAPE_HASH_GLSL = `float paintShapeHash(float word, float stream, float index) {
  float x = mod(word + stream * 4099.0 + index * 131.0, 65536.0);
  x = mod(x * 251.0 + 13849.0, 65536.0);
  x = mod(x, 256.0) * 256.0 + floor(x / 256.0);
  x = mod(x * 251.0 + 13849.0, 65536.0);
  return x / 65536.0;
}`;
const wobble = (a, s) => 1 + 0.12 * Math.sin(3 * a + s * 6.2831) + 0.08 * Math.sin(5 * a + s * 17.0) +
  0.05 * Math.sin(7 * a + s * 41.0) + 0.03 * Math.sin(11 * a + s * 73.0) +
  0.018 * Math.sin(17 * a + s * 29.0) + 0.17 * Math.pow(Math.max(Math.cos(a - s * 37.7), 0), 28) +
  0.12 * Math.pow(Math.max(Math.cos(a - s * 53.3 - 2.1), 0), 36);

function sdRay(px, py, ax, ay, bx, by, ra, rb) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-8), 0, 1);
  return Math.hypot(px - ax - bax * h, py - ay - bay * h) - (ra * (1 - h) + rb * h);
}

function counts(kind, shapes) { return shapes[kind] || [0, 0, 0, 0]; }

function prepareAncillary(g, face, lu, lv, dn, sdu, sdv, sa, tn, dT, contract) {
  const R = g.R, r2 = R * R - dn * dn;
  if (r2 <= 0 || R <= 0) return null;
  const r = Math.sqrt(r2), fall = clamp(r / Math.max(R, 1e-3), 0, 1);
  const kind = g.kind, [rayCount, satelliteCount, spatterCount, dripCount] = counts(kind, contract.shapes);
  if (rayCount + satelliteCount + spatterCount + dripCount === 0) return null;
  const pieces = [], seed = f32(g.seed), word = paintShapeSeed(seed), pixel = 1 / Math.max(face.atlas?.ppm || 1, 1);
  const dirAng = sa > 0 ? Math.atan2(sdv, sdu) : 0;
  const spread = 6.2831 + (2.5 - 6.2831) * clamp(sa * 1.2, 0, 1);
  const big = kind > 1.5 && kind < 3.5;
  const bodyGrow = 0.4 + 0.6 * (1 - Math.pow(1 - clamp(tn, 0, 1), 4));
  const bodyEdge = a => r * bodyGrow * wobble(a, seed);

  const tsp = 1 - Math.pow(1 - clamp(tn * 1.4, 0, 1), 3);
  for (let k = 0; k < rayCount; k++) {
    const h1 = paintShapeHash(word, 0, k), h2 = paintShapeHash(word, 1, k), h3 = paintShapeHash(word, 2, k);
    const a = sa > 0 ? dirAng + (h1 - 0.5) * spread : (k + 0.35 + 0.6 * h1) / rayCount * 6.2831 + seed * 6.2831;
    const ux = Math.cos(a), uy = Math.sin(a), edge = bodyEdge(a);
    // Same edge-spike length as the composed paint shader (adapter.mjs, paint.js).
    const len = r * (0.04 + 0.16 * h2 * h2 * h2) * tsp;
    const wB = r * (0.055 + 0.06 * h3), tipR = Math.max(r * (0.012 + 0.012 * h3), pixel * 0.45);
    const ax = ux * edge * 0.72, ay = uy * edge * 0.72;
    const tipX = ux * (edge + len) - uy * len * 0.18 * (h1 - 0.5);
    const tipY = uy * (edge + len) + ux * len * 0.18 * (h1 - 0.5);
    pieces.push({ type: 0, ax, ay, bx: tipX, by: tipY, ra: wB, rb: tipR,
      minX: Math.min(ax, tipX) - wB, maxX: Math.max(ax, tipX) + wB,
      minY: Math.min(ay, tipY) - wB, maxY: Math.max(ay, tipY) + wB });
    const headR = tipR * (1.6 + 1.4 * h2);
    pieces.push({ type: 1, x: tipX, y: tipY, radius: headR,
      minX: tipX - headR, maxX: tipX + headR, minY: tipY - headR, maxY: tipY + headR });
  }

  for (let k = 0; k < satelliteCount; k++) {
    const h1 = paintShapeHash(word, 3, k), h2 = paintShapeHash(word, 4, k), h3 = paintShapeHash(word, 5, k);
    const tl = 0.28 + 0.95 * h2, land = smoothstep(tl, tl + 0.2, tn);
    if (land <= 0) continue;
    const a = sa > 0 ? dirAng + (h1 - 0.5) * spread : h1 * 6.2831;
    let ux = Math.cos(a), uy = Math.sin(a);
    if (face.wall) { const nx = ux * 0.68, ny = uy * 0.68 - 0.32; const l = Math.hypot(nx, ny) || 1; ux = nx / l; uy = ny / l; }
    const dist = r * (1.1 + (big ? 1.05 : 0.8) * h2 * h2);
    const rad = r * (0.028 + 0.085 * h3) * fall * (1 - 0.4 * h2) * (big ? 0.8 : 1) * land;
    const el = 1 + (0.5 + 1.6 * sa) * h2;
    const extent = rad * el;
    pieces.push({ type: 2, x: ux * dist, y: uy * dist, ux, uy, el, radius: rad,
      minX: ux * dist - extent, maxX: ux * dist + extent, minY: uy * dist - extent, maxY: uy * dist + extent });
  }

  for (let k = 0; k < spatterCount; k++) {
    const h1 = paintShapeHash(word, 6, k), h2 = paintShapeHash(word, 7, k), h3 = paintShapeHash(word, 8, k);
    if (tn < 0.45 + 0.95 * h2) continue;
    const a = sa > 0 ? dirAng + (h1 - 0.5) * spread * 1.15 : h1 * 6.2831;
    let ux = Math.cos(a), uy = Math.sin(a);
    if (face.wall) { const nx = ux * 0.75, ny = uy * 0.75 - 0.25; const l = Math.hypot(nx, ny) || 1; ux = nx / l; uy = ny / l; }
    const rad = Math.max(r * (0.011 + 0.02 * h3) * fall, pixel * 0.9), dist = r * (1.3 + 1.2 * h2);
    const x = ux * dist, y = uy * dist;
    pieces.push({ type: 1, x, y, radius: rad, minX: x - rad, maxX: x + rad, minY: y - rad, maxY: y + rad });
  }

  if (face.wall && fall > 0.3 && dripCount > 0) {
    const nD = Math.min(6, dripCount + Math.floor(R * 1.2));
    for (let k = 0; k < nD; k++) {
      const h1 = paintShapeHash(word, 9, k), h2 = paintShapeHash(word, 10, k), h3 = paintShapeHash(word, 11, k);
      if (k > 1 && h3 < 0.3) continue;
      const x0 = (h1 * 2 - 1) * r * 0.72;
      const c = Math.sqrt(Math.max(1 - (x0 / r) * (x0 / r), 0));
      const yTop = -c * r * 0.7;
      const len = c * r * 0.25 + r * (0.3 + 2.3 * h2 * h2) * fall * dT;
      const w = r * (0.042 + 0.04 * h3) * (0.75 + 0.35 * fall);
      pieces.push({ type: 3, x0, yTop, len, w, h2, k, r,
        minX: x0 - w * 2, maxX: x0 + w * 2, minY: yTop - len - w * 2, maxY: yTop + w * 2 });
    }
  }
  return pieces.length ? { pieces, sa, sdu, sdv, margin: pixel * 1.5, seed, dT } : null;
}

function pointInsideAncillary(mask, x, y, seed) {
  let px = x, py = y;
  if (mask.sa > 0) {
    const along = px * mask.sdu + py * mask.sdv;
    const scale = along > 0 ? 1 + mask.sa : 1 + 0.25 * mask.sa;
    const perpX = px - along * mask.sdu, perpY = py - along * mask.sdv;
    px = perpX + mask.sdu * (along / scale); py = perpY + mask.sdv * (along / scale);
  }
  for (let n = 0; n < mask.pieces.length; n++) {
    const p = mask.pieces[n], sx = p.type === 3 ? x : px, sy = p.type === 3 ? y : py;
    if (sx < p.minX - mask.margin || sx > p.maxX + mask.margin || sy < p.minY - mask.margin || sy > p.maxY + mask.margin) continue;
    if (p.type === 0 && sdRay(sx, sy, p.ax, p.ay, p.bx, p.by, p.ra, p.rb) < -mask.margin) return true;
    if (p.type === 1 && Math.hypot(sx - p.x, sy - p.y) - p.radius < -mask.margin) return true;
    if (p.type === 2) {
      let qx = sx - p.x, qy = sy - p.y, along = qx * p.ux + qy * p.uy;
      qx -= p.ux * along * (1 - 1 / p.el); qy -= p.uy * along * (1 - 1 / p.el);
      if (Math.hypot(qx, qy) - p.radius < -mask.margin) return true;
    }
    if (p.type === 3) {
      let qx = sx - p.x0, qy = sy - p.yTop;
      const ty = clamp(-qy / Math.max(p.len, 1e-4), 0, 1);
      qx += Math.sin(qy / p.r * 9 + seed * 20 + p.k * 2.3) * p.w * 0.35 * ty;
      const wt = p.w * (1 + (0.6 - 1) * smoothstep(0.05, 0.85, ty));
      const stream = Math.max(Math.abs(qx) - wt, Math.max(qy, -p.len - qy));
      const tqy = (qy + p.len - p.w * 0.3) * 0.8;
      const bulb = Math.hypot(qx, tqy) - p.w * (1.2 + 0.35 * p.h2) * (0.6 + 0.4 * mask.dT);
      if (stream < -mask.margin || bulb < -mask.margin) return true;
    }
  }
  return false;
}


export {prepareAncillary,pointInsideAncillary};
