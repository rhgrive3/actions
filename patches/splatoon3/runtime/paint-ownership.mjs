const STEP = 1 / 60;
const EPS = 1e-10;
const INSTALLED = Symbol.for('inkwave.issue264.paint-ownership-installed');

// Keep the existing RNG draw at the caller while using one recorded mask seed
// for a catalogue special's core and its larger-radius continuation.
export function projectileBurstPaintSeed(projectile, randomSeed) {
  return projectile?.s3AllSpecial && Number.isFinite(projectile.seed) ? projectile.seed : randomSeed;
}


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

function pointInsideAncillary(mask, x, y, seed, pieceIndex = -1) {
  let px = x, py = y;
  if (mask.sa > 0) {
    const along = px * mask.sdu + py * mask.sdv;
    const scale = along > 0 ? 1 + mask.sa : 1 + 0.25 * mask.sa;
    const perpX = px - along * mask.sdu, perpY = py - along * mask.sdv;
    px = perpX + mask.sdu * (along / scale); py = perpY + mask.sdv * (along / scale);
  }
  const end = pieceIndex < 0 ? mask.pieces.length : pieceIndex + 1;
  for (let n = pieceIndex < 0 ? 0 : pieceIndex; n < end; n++) {
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

function cellIsSolidlyVisible(mask, face, x, y, pieceIndex = -1) {
  const dx = face.cu * 0.32, dy = face.cv * 0.32;
  // A paint cell owns its area when its center or one of four interior samples
  // lies well inside the shader mask. This catches most sub-cell satellites
  // without treating a hand-mirrored antialias width as gameplay truth.
  for (let i = 0; i < 5; i++) {
    const sx = x + (i === 1 || i === 3 ? -dx : i > 1 ? dx : 0);
    const sy = y + (i === 1 || i === 2 ? -dy : i > 2 ? dy : 0);
    if (pointInsideAncillary(mask, sx, sy, mask.seed, pieceIndex)) return true;
  }
  return false;
}

function ensureOwnershipState(paint) {
  if (!(paint._paintOwnershipOrder instanceof Uint32Array) || paint._paintOwnershipOrder.length !== paint.grid.length) {
    paint._paintOwnershipOrder = new Uint32Array(paint.grid.length);
    paint._paintOwnershipSequence = 0;
    paint._paintOrderRecords = [null];
    paint._paintOrderIds = new Map();
  }
  if (!Array.isArray(paint._paintOrderRecords)) paint._paintOrderRecords = [null];
  if (!(paint._paintOrderIds instanceof Map)) paint._paintOrderIds = new Map();
  if (!(paint._paintOrderRunScratch instanceof Float64Array)) paint._paintOrderRunScratch = new Float64Array(64);
  if (!Number.isFinite(paint._paintSimulationAccumulator)) paint._paintSimulationAccumulator = 0;
}

function paintOrderId(paint, order) {
  ensureOwnershipState(paint);
  const clock = order?.clock ?? order?.tick;
  const validNetworkOrder = order && isPaintOrderClock(clock)
    && typeof order.peer === 'string' && order.peer.length > 0
    && Number.isSafeInteger(order.seq) && order.seq >= 1;
  let key, record;
  if (validNetworkOrder) {
    record = { clock, epoch: typeof order.epoch === 'string' ? order.epoch : '', peer: order.peer, seq: order.seq,
      tie: typeof order.tie === 'string' ? order.tie : '', legacy: order.legacy === true };
    key = JSON.stringify([record.legacy, record.epoch, record.clock, record.peer, record.seq, record.tie]);
    const existing = paint._paintOrderIds.get(key);
    if (existing) return existing;
  } else {
    paint._paintOwnershipSequence = (paint._paintOwnershipSequence + 1) >>> 0;
    if (paint._paintOwnershipSequence === 0) paint._paintOwnershipSequence = 1;
    record = { local: true, seq: paint._paintOwnershipSequence, legacy: false };
    key = `local:${record.seq}`;
  }
  const id = paint._paintOrderRecords.length;
  paint._paintOrderRecords.push(record);
  paint._paintOrderIds.set(key, id);
  return id;
}

function paintOrderComesAfter(paint, nextId, previousId) {
  if (nextId === previousId) return true;
  const a = paint._paintOrderRecords[nextId], b = paint._paintOrderRecords[previousId];
  if (!a) return false;
  if (!b) return true;
  if (a.local || b.local) {
    if (a.local && b.local) return a.seq > b.seq;
    return !a.local;
  }
  if (a.legacy !== b.legacy) return !a.legacy;
  if (a.clock !== b.clock) return paintClockComesAfter(a.clock, b.clock);
  if (a.peer !== b.peer) return a.peer > b.peer;
  if (a.seq !== b.seq) return a.seq > b.seq;
  return a.tie > b.tie;
}

function claimPaintCell(paint, index, value, orderId, orderState = null) {
  const current = orderId || paint._paintCurrentOrder || 0;
  const previous = paint._paintOwnershipOrder[index] || 0;
  if (current && previous === current) return false;
  if (current && previous && !paintOrderComesAfter(paint, current, previous)) return false;
  if (current) paint._paintOwnershipOrder[index] = current;
  if (orderState) orderState.accepted = true;
  return true;
}

// Face-space (x, y) box of one ancillary piece. Rays, beads and satellites are
// defined in the stretched space pointInsideAncillary maps samples into; drips
// (type 3) are tested unstretched. The stretch map is linear on each side of the
// travel axis, so the images of the box corners under both scales, together
// with the original corners (the axis crossing maps to itself), bound the image.
const _cellBox = new Float64Array(4);
function pieceCellBox(mask, p, pad) {
  let x0 = p.minX, x1 = p.maxX, y0 = p.minY, y1 = p.maxY;
  if (mask.sa > 0 && p.type !== 3) {
    const ux = mask.sdu, uy = mask.sdv, ahead = 1 + mask.sa, behind = 1 + 0.25 * mask.sa;
    for (let c = 0; c < 4; c++) {
      const cx = c & 1 ? p.maxX : p.minX, cy = c & 2 ? p.maxY : p.minY;
      const along = cx * ux + cy * uy, s = (along > 0 ? ahead : behind) - 1;
      const mx = cx + ux * along * s, my = cy + uy * along * s;
      if (mx < x0) x0 = mx; if (mx > x1) x1 = mx;
      if (my < y0) y0 = my; if (my > y1) y1 = my;
    }
  }
  _cellBox[0] = x0 - pad; _cellBox[1] = x1 + pad; _cellBox[2] = y0 - pad; _cellBox[3] = y1 + pad;
  return _cellBox;
}

function nextVisitStamp(paint) {
  if (!(paint._paintVisitStamp instanceof Uint32Array) || paint._paintVisitStamp.length !== paint.grid.length) {
    paint._paintVisitStamp = new Uint32Array(paint.grid.length);
    paint._paintVisitSerial = 0;
  }
  paint._paintVisitSerial = (paint._paintVisitSerial + 1) >>> 0;
  if (paint._paintVisitSerial === 0) { paint._paintVisitStamp.fill(0); paint._paintVisitSerial = 1; }
  return paint._paintVisitSerial;
}

function claimAncillaryCells(paint, g, tn, dT, contract) {
  const E = g.entries;
  if (g.R <= 0.02 || !Array.isArray(E) || !E.length || g.kind === contract.kind.speck) return 0;
  const value = g.team + 1, order = g.paintOrder || 0;
  let claimed = 0, changed = false;
  for (let n = 0; n < E.length; n += 7) {
    const face = E[n], lu = E[n + 1], lv = E[n + 2], dn = E[n + 3], sdu = E[n + 4], sdv = E[n + 5], sa = E[n + 6];
    if (!face?.atlas || dn >= g.R || face.cu <= 0 || face.cv <= 0) continue;
    const r = Math.sqrt(Math.max(0, g.R * g.R - dn * dn));
    if (r <= 0.02) continue;
    const reach = contract.reach[g.kind] || 1;
    const ext = r * (reach + 1.4 * sa);
    const down = face.wall && g.dripDur ? r * contract.dripReach : 0;
    const i0 = Math.max(0, Math.floor((lu - ext) / face.cu)), i1 = Math.min(face.nu - 1, Math.floor((lu + ext) / face.cu));
    const j0 = Math.max(0, Math.floor((lv - Math.max(ext, down)) / face.cv)), j1 = Math.min(face.nv - 1, Math.floor((lv + ext) / face.cv));
    if (i1 < i0 || j1 < j0) continue;
    const cellArea = face.cu * face.cv;
    const mask = prepareAncillary(g, face, lu, lv, dn, sdu, sdv, sa, tn, dT, contract);
    if (!mask) continue;
    // A cell can only be claimed when one of its five samples lies inside some
    // piece's bounding box (pointInsideAncillary rejects everything else first).
    // Visit exactly the cells whose centre is within a piece box widened by the
    // sample offset and the mask margin, instead of the whole reach square every
    // growth frame. Per-cell evaluation and claims are unchanged.
    const stamp = nextVisitStamp(paint);
    const visit = paint._paintVisitStamp;
    const pad = Math.max(face.cu, face.cv) * 0.32 + mask.margin * (1 + Math.max(0, sa)) + 1e-9;
    const yLo = -Math.max(ext, down);
    for (let n2 = 0; n2 < mask.pieces.length; n2++) {
      const box = pieceCellBox(mask, mask.pieces[n2], pad);
      const bi0 = Math.max(i0, Math.ceil((box[0] + lu) / face.cu - 0.5)), bi1 = Math.min(i1, Math.floor((box[1] + lu) / face.cu - 0.5));
      const bj0 = Math.max(j0, Math.ceil((box[2] + lv) / face.cv - 0.5)), bj1 = Math.min(j1, Math.floor((box[3] + lv) / face.cv - 0.5));
      for (let j = bj0; j <= bj1; j++) {
        const y = (j + 0.5) * face.cv - lv;
        if (y < yLo || y > ext) continue;
        for (let i = bi0; i <= bi1; i++) {
          const x = (i + 0.5) * face.cu - lu;
          const index = face.grid + j * face.nu + i;
          if (x < -ext || x > ext) continue;
          if (visit[index] === stamp) continue;
          const previousOrder = paint._paintOwnershipOrder[index] || 0;
          if (previousOrder && order && !paintOrderComesAfter(paint, order, previousOrder)) { visit[index] = stamp; continue; }
          const previous = paint.grid[index];
          if (previous === value && previousOrder === order) { visit[index] = stamp; continue; }
          // This cell was enumerated from this piece's conservative box.
          // Test only that piece, marking it visited only after a hit. A miss
          // must remain eligible for overlapping pieces later in this stamp.
          if (!cellIsSolidlyVisible(mask, face, x, y, n2)) continue;
          visit[index] = stamp;
          if (previous === value) {
            claimPaintCell(paint, index, value, order);
            continue;
          }
          if (!claimPaintCell(paint, index, value, order)) continue;
          paint.grid[index] = value;
          changed = true;
          // Match the composed native body scorer: walls and occluded cells
          // remain paintable, but never award turf points or special charge.
          if (face.turf && !paint.dead[index]) {
            claimed += cellArea;
            if (previous) paint.counts[previous - 1]--;
            paint.counts[g.team]++;
          }
        }
      }
    }
  }
  if (changed) paint.version++;
  if (claimed > 0 && g.paintOwner && !g.paintOwner.remote) {
    if (g.paintCreditMode === 1) g.paintOwner.addTurfNoSpecial?.(claimed);
    else g.paintOwner.addTurf?.(claimed);
  }
  return claimed;
}

export function installIssue264PaintOwnership(PaintSystem, contract) {
  const proto = PaintSystem?.prototype;
  if (!proto || typeof proto.splat !== 'function' || typeof proto.flush !== 'function' || typeof proto._emitGrowth !== 'function') {
    throw new TypeError('Issue #264 paint ownership requires native splat, flush, and growth methods');
  }
  if (proto[INSTALLED]) return false;
  const nativeSplat = proto.splat, nativeFlush = proto.flush, nativeClear = proto.clear, nativeDispose = proto.dispose;
  const nativeEmitGrowth = proto._emitGrowth;
  // One retained presentation per authoritative stamp, not one quad per face
  // per hidden frame. Growth records and their entry arrays are pooled, so the
  // snapshot must own its entries before a finished record is released/reused.
  proto._emitGrowth = function hiddenAwarePaintGrowth(g, tn, dT, dripOnly, bodyOnly = false) {
    if (!globalThis.document?.hidden || !g.paintOrder) {
      return nativeEmitGrowth.call(this, g, tn, dT, dripOnly, bodyOnly);
    }
    const pending = this._hiddenPaintGrowth || (this._hiddenPaintGrowth = new Map());
    let row = pending.get(g.paintOrder);
    if (!row) {
      row = { g: { ...g, entries: g.entries.slice(), paintOwner: null }, tn, dT, dripOnly, bodyOnly };
      pending.set(g.paintOrder, row);
      this._hiddenPaintInsertions = (this._hiddenPaintInsertions || 0) + 1;
      if (pending.size >= 128 && this._hiddenPaintInsertions >= 64) {
        // Network rendering is already clipped to authoritative owner cells.
        // Only those records may be pruned: local sub-cell visual ink is
        // intentionally retained even if it has never claimed a grid cell.
        // Future growth may re-add a network stamp when it gains a cell.
        const live = new Set(this._paintOwnershipOrder);
        for (const [id, snapshot] of pending) if (snapshot.g.netOrderId && !live.has(id)) pending.delete(id);
        this._hiddenPaintInsertions = 0;
      }

    } else {
      row.tn = tn; row.dT = dT; row.dripOnly = dripOnly; row.bodyOnly = bodyOnly;
    }
    // A final drip-only pass still needs to reconstruct the body which was
    // never submitted while hidden. Emitting the full current mask is safe:
    // chronological replay and the network owner clips preserve later ink.
    row.dripOnly = false;
  };
  proto._resumePaintPresentation = function resumePaintPresentation() {
    if (globalThis.document?.hidden) return;
    const quads = this._hiddenQuads;
    this._hiddenQuads = null;
    if (quads) for (const args of quads) this._pushQuad(...args);
    if (!this._hiddenPaintGrowth?.size) return;
    const pending = this._hiddenPaintGrowth;
    this._hiddenPaintGrowth = null;
    for (const row of pending.values()) nativeEmitGrowth.call(this, row.g, row.tn, row.dT, row.dripOnly, row.bodyOnly);
  };


  proto._paintOrderId = function issue264PaintOrderId(order) { return paintOrderId(this, order); };
  proto._paintOrderComesAfter = function issue264PaintOrderAfter(nextId, previousId) {
    ensureOwnershipState(this);
    return paintOrderComesAfter(this, nextId, previousId);
  };
  proto._paintClaimCell = function issue264ClaimPaintCell(index, value, orderId, orderState) {
    ensureOwnershipState(this);
    return claimPaintCell(this, index, value, orderId, orderState);
  };
  proto._paintOrderRuns = function issue264PaintOrderRuns(face, orderId, u0, u1, v0, v1) {
    ensureOwnershipState(this);
    const padM = (face.atlas.pad - 0.5) / face.atlas.ppm;
    const i0 = Math.max(0, Math.floor(Math.max(0, u0) / face.cu));
    const i1 = Math.min(face.nu - 1, Math.floor(Math.min(face.su, u1) / face.cu));
    const j0 = Math.max(0, Math.floor(Math.max(0, v0) / face.cv));
    const j1 = Math.min(face.nv - 1, Math.floor(Math.min(face.sv, v1) / face.cv));
    let scratch = this._paintOrderRunScratch, runCount = 0;
    for (let j = j0; j <= j1; j++) {
      const row = face.grid + j * face.nu, owners = this._paintOwnershipOrder;
      let i = i0;
      while (i <= i1) {
        while (i <= i1 && owners[row + i] !== orderId) i++;
        if (i > i1) break;
        const start = i++;
        while (i <= i1 && owners[row + i] === orderId) i++;
        const end = i - 1;
        let x0 = Math.max(u0, start * face.cu), x1 = Math.min(u1, (end + 1) * face.cu);
        let y0 = Math.max(v0, j * face.cv), y1 = Math.min(v1, (j + 1) * face.cv);
        if (start === 0) x0 = Math.max(u0, -padM);
        if (end === face.nu - 1) x1 = Math.min(u1, face.su + padM);
        if (j === 0) y0 = Math.max(v0, -padM);
        if (j === face.nv - 1) y1 = Math.min(v1, face.sv + padM);
        if (x1 > x0 && y1 > y0) {
          const offset = runCount * 4;
          if (offset + 4 > scratch.length) {
            const grown = new Float64Array(Math.max(scratch.length * 2, offset + 4));
            grown.set(scratch); this._paintOrderRunScratch = scratch = grown;
          }
          scratch[offset] = x0; scratch[offset + 1] = x1;
          scratch[offset + 2] = y0; scratch[offset + 3] = y1;
          runCount++;
        }
      }
    }
    return runCount;
  };

  proto.splat = function issue264SplatContext(center, radius, team, opts = {}) {
    if (opts.cosmetic) return nativeSplat.call(this, center, radius, team, opts);
    ensureOwnershipState(this);
    const candidate = opts.claimOwner ?? this._paintNextOwner;
    this._paintNextOwner = null;
    const owner = candidate && !candidate.remote && typeof candidate.addTurf === 'function' ? candidate : null;
    const mode = opts.claimMode === 'no-special' ? 1 : 0;
    const callOpts = ('claimOwner' in opts || 'claimMode' in opts) ? { ...opts } : opts;
    if (callOpts !== opts) { delete callOpts.claimOwner; delete callOpts.claimMode; }
    const order = paintOrderId(this, opts.__netOrder);
    const previousOrder = this._paintCurrentOrder, previousContext = this._paintOwnerContext;
    this._paintCurrentOrder = order;
    this._paintOwnerContext = { owner, mode, order, accepted: false };
    try { return nativeSplat.call(this, center, radius, team, callOpts); }
    finally { this._paintCurrentOrder = previousOrder; this._paintOwnerContext = previousContext; }
  };

  proto._advanceSplatOwnership = function issue264AdvanceOwnership(g) {
    if (!g || g.kind === contract.kind.speck || g.R <= 0.02) return 0;
    const tn = Math.min(3, Math.max(0, g.age / Math.max(g.dur, 1e-6)));
    const td = g.dripDur ? Math.min(1, g.age / g.dripDur) : 1;
    const dT = 1 - Math.pow(1 - td, 2.2);
    return claimAncillaryCells(this, g, tn, dT, contract);
  };
  proto._finishSplatOwnership = function issue264FinishOwnership(g) {
    if (!g || g.kind === contract.kind.speck || g.R <= 0.02) return 0;
    return claimAncillaryCells(this, g, 3, 1, contract);
  };
  proto._clearPaintOwnership = function issue264ClearOwnership() {
    if (this._paintOwnershipOrder) this._paintOwnershipOrder.fill(0);
    this._paintOwnershipSequence = 0;
    this._paintOrderRecords = [null];
    this._paintOrderIds?.clear();
    this._paintSimulationAccumulator = 0;
    this._hiddenPaintGrowth = null;
    this._hiddenPaintInsertions = 0;
    this._paintOwnerContext = null;
    this._paintCurrentOrder = 0;
  };
  proto.useFixedPaintClock = function issue264UseFixedPaintClock() {
    ensureOwnershipState(this);
    this._paintUsesFixedClock = true;
  };
  proto.advanceSimulation = function issue264AdvanceSimulation(elapsed) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Invalid paint simulation interval');
    this.useFixedPaintClock();
    this._paintSimulationAccumulator += elapsed;
    let count = 0;
    while (this._paintSimulationAccumulator + EPS >= STEP && count < 240) {
      nativeFlush.call(this, STEP);
      this._paintSimulationAccumulator = Math.max(0, this._paintSimulationAccumulator - STEP);
      count++;
    }
    return count;
  };
  proto.flush = function issue264RenderFlush(dt) {
    this._resumePaintPresentation();
    if (!this._paintUsesFixedClock) return nativeFlush.call(this, dt);
    this._drawQuads();
  };
  if (nativeClear) proto.clear = function issue264Clear(...args) {
    const result = nativeClear.apply(this, args);
    this._clearPaintOwnership();
    return result;
  };
  if (nativeDispose) proto.dispose = function issue264Dispose(...args) {
    const result = nativeDispose.apply(this, args);
    this._clearPaintOwnership();
    this._paintOwnershipOrder = null;
    this._paintOrderRecords = null;
    this._paintOrderIds = null;
    return result;
  };
  Object.defineProperty(proto, INSTALLED, { value: true });
  return true;
}
