// MAP3's raised quays are solid down through the water. The generic legacy
// footprint only includes near-zero deck tops, so it mistakes their adjoining
// low-floor seams for shore. Build a true water-side boundary once per Level;
// this changes cosmetic spray origins, never the sea, terrain or collision.
const EPSILON = 1e-5;

export function createMap3WaterEdges(level) {
  const stage = level?.layout?.map3Playable || level?.layout?.map3;
  if (!stage || level.native) return null;
  const waterY = stage.waterY;
  const rects = stage.floors.filter(f => f.material !== 'grate' && f.bottom <= waterY && f.y > waterY).map(f => f.rect);
  const inside = (x, z) => rects.some(r => x > r[0] && x < r[1] && z > r[2] && z < r[3]);
  const lines = new Map();

  // Split at every rectangle crossing, retain only land-to-water intervals,
  // then merge collinear intervals. Shared and overlapping floor edges vanish.
  function boundary(axis, fixed, from, to, nx, nz) {
    const cuts = [from, to];
    for (const r of rects) {
      const lo = axis === 'x' ? r[2] : r[0], hi = axis === 'x' ? r[3] : r[1];
      if (fixed < lo || fixed > hi) continue;
      for (const at of axis === 'x' ? [r[0], r[1]] : [r[2], r[3]]) if (at > from && at < to) cuts.push(at);
    }
    cuts.sort((a, b) => a - b);
    const key = `${axis}:${fixed}:${nx}:${nz}`;
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1], b = cuts[i];
      if (b - a <= EPSILON) continue;
      const middle = (a + b) / 2, x = axis === 'x' ? middle : fixed, z = axis === 'z' ? middle : fixed;
      if (!inside(x - nx * EPSILON, z - nz * EPSILON) || inside(x + nx * EPSILON, z + nz * EPSILON)) continue;
      if (!lines.has(key)) lines.set(key, { axis, fixed, nx, nz, intervals: [] });
      lines.get(key).intervals.push([a, b]);
    }
  }
  for (const [x0, x1, z0, z1] of rects) {
    boundary('x', z0, x0, x1, 0, -1); boundary('x', z1, x0, x1, 0, 1);
    boundary('z', x0, z0, z1, -1, 0); boundary('z', x1, z0, z1, 1, 0);
  }

  const edges = [];
  for (const { axis, fixed, nx, nz, intervals } of lines.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1] + EPSILON) last[1] = Math.max(last[1], interval[1]);
      else merged.push(interval.slice());
    }
    for (const [a, b] of merged) {
      const n = Math.max(1, Math.floor((b - a) / 1.6));
      for (let i = 0; i < n; i++) {
        const along = a + (b - a) * (i + .5) / n;
        const x = (axis === 'x' ? along : fixed) + nx * .05;
        const z = (axis === 'z' ? along : fixed) + nz * .05;
        // Use the real Level for ramp toes, roofs and structural supports.
        // Water can remain beneath a bridge, but uncollided upward spray must
        // not pass through its deck. This query runs only during edge rebuild.
        if (level.groundHeight(x, z) > waterY || level.groundHeight(x + nx * .55, z + nz * .55) > waterY) continue;
        edges.push({ x, z, nx, nz });
      }
    }
  }
  return edges;
}
