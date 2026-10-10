// Continuous time-of-impact primitives, independent of weapon tuning and render Hz.
// Radii may grow linearly within one fixed tick. Expanded-box corner false positives
// are avoided by solving the true distance to the OBB (rounded Minkowski boundary).
const E = 1e-10;

// The solver is synchronous and non-reentrant. One module-level cut buffer avoids
// creating interval arrays for every projectile/block pair after module load.
const CUTS = new Float64Array(8);

function insertCut(value, count) {
  let i = count;
  while (i > 0 && CUTS[i - 1] > value) {
    CUTS[i] = CUTS[i - 1];
    i--;
  }
  CUTS[i] = value;
  return count + 1;
}

function firstRoot(A, B, C, lo, hi) {
  if ((A * lo + B) * lo + C <= E) return lo;
  if (Math.abs(A) < E) {
    if (Math.abs(B) < E) return null;
    const t = -C / B;
    return t >= lo - E && t <= hi + E ? Math.max(lo, Math.min(hi, t)) : null;
  }
  const disc = B * B - 4 * A * C;
  if (disc < -E) return null;
  const s = Math.sqrt(Math.max(0, disc));
  let t0 = (-B - s) / (2 * A);
  let t1 = (-B + s) / (2 * A);
  if (t0 > t1) {
    const swap = t0;
    t0 = t1;
    t1 = swap;
  }
  if (t0 >= lo - E && t0 <= hi + E) return Math.max(lo, Math.min(hi, t0));
  if (t1 >= lo - E && t1 <= hi + E) return Math.max(lo, Math.min(hi, t1));
  return null;
}

function roundedBoxEntryScalar(ox, oy, oz, dx, dy, dz, hx, hy, hz, radius0, radius1) {
  let count = 2;
  CUTS[0] = 0;
  CUTS[1] = 1;
  const dr = radius1 - radius0;

  if (Math.abs(dx) > E) {
    let t = (-hx - ox) / dx;
    if (t > E && t < 1 - E) count = insertCut(t, count);
    t = (hx - ox) / dx;
    if (t > E && t < 1 - E) count = insertCut(t, count);
  }
  if (Math.abs(dy) > E) {
    let t = (-hy - oy) / dy;
    if (t > E && t < 1 - E) count = insertCut(t, count);
    t = (hy - oy) / dy;
    if (t > E && t < 1 - E) count = insertCut(t, count);
  }
  if (Math.abs(dz) > E) {
    let t = (-hz - oz) / dz;
    if (t > E && t < 1 - E) count = insertCut(t, count);
    t = (hz - oz) / dz;
    if (t > E && t < 1 - E) count = insertCut(t, count);
  }

  for (let i = 0; i < count - 1; i++) {
    const lo = CUTS[i], hi = CUTS[i + 1], mid = (lo + hi) / 2;
    let A = -dr * dr, B = -2 * radius0 * dr, C = -radius0 * radius0;
    let v = ox + dx * mid;
    if (v < -hx || v > hx) {
      const a = dx, b = ox - (v > hx ? hx : -hx);
      A += a * a; B += 2 * a * b; C += b * b;
    }
    v = oy + dy * mid;
    if (v < -hy || v > hy) {
      const a = dy, b = oy - (v > hy ? hy : -hy);
      A += a * a; B += 2 * a * b; C += b * b;
    }
    v = oz + dz * mid;
    if (v < -hz || v > hz) {
      const a = dz, b = oz - (v > hz ? hz : -hz);
      A += a * a; B += 2 * a * b; C += b * b;
    }
    const t = firstRoot(A, B, C, lo, hi);
    if (t !== null) return t;
  }
  return null;
}

// Distance from moving point to an axis-aligned box. Zero half-sizes also cover
// points and axis-aligned segments, so the same solver provides capsule entry.
export function roundedBoxEntry(origin, delta, half, radius0, radius1 = radius0) {
  return roundedBoxEntryScalar(
    origin[0], origin[1], origin[2], delta[0], delta[1], delta[2],
    half[0], half[1], half[2], radius0, radius1,
  );
}

export function capsuleEntry(from, to, base, bodyRadius, height, bulletRadius0, bulletRadius1 = bulletRadius0) {
  const h = Math.max(0, height - 2 * bodyRadius) / 2;
  return roundedBoxEntryScalar(
    from.x - base.x, from.y - base.y - bodyRadius - h, from.z - base.z,
    to.x - from.x, to.y - from.y, to.z - from.z,
    0, h, 0, bodyRadius + bulletRadius0, bodyRadius + bulletRadius1,
  );
}

export function sweptWorldHit(physics, from, to, r0, r1, out, skipGrates = true) {
  const level = physics?.level;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (!level?.queryBlocks || !level.blocks) return physics.segment(from, to, out, skipGrates);
  out.hit = false; out.dist = len; out.block = -1; out.face = -1;
  const r = Math.max(r0, r1);
  const ids = level.queryBlocks(
    Math.min(from.x, to.x) - r, Math.min(from.z, to.z) - r,
    Math.max(from.x, to.x) + r, Math.max(from.z, to.z) + r,
    physics._wfSweepIds || (physics._wfSweepIds = []),
  );
  let best = Infinity, chosenBlock = null, chosenIndex = -1;
  let bestOx = 0, bestOy = 0, bestOz = 0, bestDx = 0, bestDy = 0, bestDz = 0;
  let bestHx = 0, bestHy = 0, bestHz = 0;

  for (let i = 0; i < ids.length; i++) {
    const index = ids[i];
    const b = level.blocks[index];
    if (!b?.solid || (skipGrates && b.grate)) continue;
    const rx = from.x - b.center.x, ry = from.y - b.center.y, rz = from.z - b.center.z;
    const a0 = b.axes[0], a1 = b.axes[1], a2 = b.axes[2];
    const ox = rx * a0.x + ry * a0.y + rz * a0.z;
    const oy = rx * a1.x + ry * a1.y + rz * a1.z;
    const oz = rx * a2.x + ry * a2.y + rz * a2.z;
    const localDx = dx * a0.x + dy * a0.y + dz * a0.z;
    const localDy = dx * a1.x + dy * a1.y + dz * a1.z;
    const localDz = dx * a2.x + dy * a2.y + dz * a2.z;
    const hx = b.half.x, hy = b.half.y, hz = b.half.z;
    const t = roundedBoxEntryScalar(ox, oy, oz, localDx, localDy, localDz, hx, hy, hz, r0, r1);
    if (t !== null && (t < best - E || (Math.abs(t - best) < E && index < chosenIndex))) {
      best = t; chosenBlock = b; chosenIndex = index;
      bestOx = ox; bestOy = oy; bestOz = oz;
      bestDx = localDx; bestDy = localDy; bestDz = localDz;
      bestHx = hx; bestHy = hy; bestHz = hz;
    }
  }
  if (!chosenBlock) return out;

  const qx = bestOx + bestDx * best, qy = bestOy + bestDy * best, qz = bestOz + bestDz * best;
  let cx = Math.max(-bestHx, Math.min(bestHx, qx));
  let cy = Math.max(-bestHy, Math.min(bestHy, qy));
  let cz = Math.max(-bestHz, Math.min(bestHz, qz));
  let nx = qx - cx, ny = qy - cy, nz = qz - cz;
  const nlen = Math.hypot(nx, ny, nz);
  let axis = 0;
  if (nlen < E) {
    // Initial overlap must stop the shot instead of letting it escape through a wall.
    let gap = bestHx - Math.abs(qx);
    const gapY = bestHy - Math.abs(qy), gapZ = bestHz - Math.abs(qz);
    if (gapY < gap) { gap = gapY; axis = 1; }
    if (gapZ < gap) axis = 2;
    nx = 0; ny = 0; nz = 0;
    if (axis === 0) {
      nx = qx === 0 ? (bestDx > 0 ? -1 : 1) : Math.sign(qx);
      cx = nx * bestHx;
    } else if (axis === 1) {
      ny = qy === 0 ? (bestDy > 0 ? -1 : 1) : Math.sign(qy);
      cy = ny * bestHy;
    } else {
      nz = qz === 0 ? (bestDz > 0 ? -1 : 1) : Math.sign(qz);
      cz = nz * bestHz;
    }
  } else {
    nx /= nlen; ny /= nlen; nz /= nlen;
    if (Math.abs(ny) > Math.abs(nx)) axis = 1;
    if (Math.abs(nz) > Math.abs(axis === 0 ? nx : ny)) axis = 2;
  }

  out.hit = true; out.dist = best * len; out.block = chosenIndex;
  const axes = chosenBlock.axes;
  out.normal.set(0, 0, 0);
  out.point.copy(chosenBlock.center);
  out.normal.addScaledVector(axes[0], nx); out.point.addScaledVector(axes[0], cx);
  out.normal.addScaledVector(axes[1], ny); out.point.addScaledVector(axes[1], cy);
  out.normal.addScaledVector(axes[2], nz); out.point.addScaledVector(axes[2], cz);
  const axisNormal = axis === 0 ? nx : axis === 1 ? ny : nz;
  out.face = chosenBlock.faces?.[axis * 2 + (axisNormal > 0 ? 0 : 1)] ?? -1;
  const face = level.faces?.[out.face];
  if (face) {
    const x = out.point.x - face.origin.x, y = out.point.y - face.origin.y, z = out.point.z - face.origin.z;
    out.u = x * face.u.x + y * face.u.y + z * face.u.z;
    out.v = x * face.v.x + y * face.v.y + z * face.v.z;
  }
  return out;
}
