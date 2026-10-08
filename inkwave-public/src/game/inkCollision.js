// Continuous collision, shared by ink heads, paint-only droplets and aim probes.
// Analytic swept sphere vs OBB using the piecewise-quadratic distance to a box.
// This includes rounded edges/corners; it is not an expanded-box approximation.
const EPS = 1e-10;
const O = [0, 0, 0], D = [0, 0, 0], H = [0, 0, 0], P = [0, 0, 0], N = [0, 0, 0];
const cuts = new Float64Array(8);
const ids = [];
export function sweepLevelSphere(level, from, to, radius, out, skipGrates = true) {
  out.hit = false; out.dist = from.distanceTo(to); out.face = -1; out.block = -1;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = out.dist;
  const candidates = level.queryBlocks(Math.min(from.x, to.x) - radius, Math.min(from.z, to.z) - radius,
    Math.max(from.x, to.x) + radius, Math.max(from.z, to.z) + radius, ids);
  let best = Infinity;
  for (const id of candidates) {
    const box = level.blocks[id]; if (!box.solid || skipGrates && box.grate) continue;
    const cx = from.x - box.center.x, cy = from.y - box.center.y, cz = from.z - box.center.z;
    H[0] = box.half.x; H[1] = box.half.y; H[2] = box.half.z;
    let count = 2; cuts[0] = 0; cuts[1] = 1;
    for (let k = 0; k < 3; k++) {
      const axis = box.axes[k]; O[k] = cx * axis.x + cy * axis.y + cz * axis.z;
      D[k] = dx * axis.x + dy * axis.y + dz * axis.z;
      if (Math.abs(D[k]) > EPS) for (let sign = -1; sign <= 1; sign += 2) {
        const t = (sign * H[k] - O[k]) / D[k]; if (t > 0 && t < 1) cuts[count++] = t;
      }
    }
    // At most eight boundaries. In-place insertion sort, no query allocations.
    for (let k = 1; k < count; k++) { const x = cuts[k]; let j = k - 1; while (j >= 0 && cuts[j] > x) { cuts[j + 1] = cuts[j]; j--; } cuts[j + 1] = x; }
    let time = Infinity;
    for (let k = 0; k < count - 1; k++) {
      const lo = cuts[k], hi = cuts[k + 1], mid = (lo + hi) * 0.5;
      let a = 0, b = 0, c = -radius * radius;
      for (let j = 0; j < 3; j++) {
        const q = O[j] + D[j] * mid;
        if (q >= -H[j] && q <= H[j]) continue;
        const v = O[j] - (q > 0 ? H[j] : -H[j]);
        a += D[j] * D[j]; b += 2 * v * D[j]; c += v * v;
      }
      if ((a * lo + b) * lo + c <= EPS) { time = lo; break; }
      const disc = b * b - 4 * a * c;
      if (a > EPS && disc >= -EPS) {
        const t = (-b - Math.sqrt(Math.max(0, disc))) / (2 * a);
        if (t >= lo - EPS && t <= hi + EPS) { time = Math.max(lo, Math.min(hi, t)); break; }
      }
    }
    if (time >= best || time > 1) continue;
    best = time;
    let nlen = 0, faceAxis = 0, faceGap = Infinity;
    for (let k = 0; k < 3; k++) {
      P[k] = O[k] + D[k] * time;
      const q = Math.max(-H[k], Math.min(H[k], P[k])); N[k] = P[k] - q; nlen += N[k] * N[k];
      const gap = H[k] - Math.abs(P[k]); if (gap < faceGap) { faceAxis = k; faceGap = gap; }
    }
    if (nlen < EPS) {
      N.fill(0); N[faceAxis] = P[faceAxis] === 0 ? (D[faceAxis] > 0 ? -1 : 1) : Math.sign(P[faceAxis]);
    } else { nlen = Math.sqrt(nlen); for (let k = 0; k < 3; k++) N[k] /= nlen; }
    // Use the most-aligned geometric face for paint ownership at an edge/corner.
    faceAxis = Math.abs(N[1]) > Math.abs(N[0]) ? 1 : 0;
    if (Math.abs(N[2]) > Math.abs(N[faceAxis])) faceAxis = 2;
    out.normal.set(0, 0, 0);
    for (let k = 0; k < 3; k++) out.normal.addScaledVector(box.axes[k], N[k]);
    out.point.set(from.x + dx * time, from.y + dy * time, from.z + dz * time).addScaledVector(out.normal, -radius);
    out.hit = true; out.dist = time * length; out.block = box.id;
    out.face = box.faces[faceAxis * 2 + (N[faceAxis] > 0 ? 0 : 1)];
    if (out.face >= 0) {
      const f = level.faces[out.face];
      const px = out.point.x - f.origin.x, py = out.point.y - f.origin.y, pz = out.point.z - f.origin.z;
      out.u = px * f.u.x + py * f.u.y + pz * f.u.z; out.v = px * f.v.x + py * f.v.y + pz * f.v.z;
    }
  }
  return out;
}

function sphereEntry(ox, oy, oz, dx, dy, dz, radius) {
  const a = dx * dx + dy * dy + dz * dz, c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const b = ox * dx + oy * dy + oz * dz, disc = b * b - a * c;
  if (a < EPS || disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}
// Capsule axis uses the actor's original radius; only its collision shell grows
// by bulletRadius. Expanding the endpoints too would alter capsule height.
export function capsuleEntry(from, to, base, actorRadius, height, bulletRadius) {
  const lo = base.y + Math.min(actorRadius, height * 0.5), hi = base.y + Math.max(height - actorRadius, height * 0.5);
  const r = actorRadius + bulletRadius, ox = from.x - base.x, oz = from.z - base.z;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const nearY = Math.max(lo, Math.min(hi, from.y));
  if (ox * ox + oz * oz + (from.y - nearY) ** 2 <= r * r) return 0;
  let best = Math.min(sphereEntry(ox, from.y - lo, oz, dx, dy, dz, r), sphereEntry(ox, from.y - hi, oz, dx, dy, dz, r));
  const a = dx * dx + dz * dz, b = ox * dx + oz * dz, c = ox * ox + oz * oz - r * r, disc = b * b - a * c;
  if (a > EPS && disc >= 0) {
    const t = (-b - Math.sqrt(disc)) / a, y = from.y + dy * t;
    if (t >= 0 && t <= 1 && y >= lo && y <= hi) best = Math.min(best, t);
  }
  return best;
}
