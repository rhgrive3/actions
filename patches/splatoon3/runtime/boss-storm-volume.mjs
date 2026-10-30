// Conservative vertical broadphase over the existing Boss collision spheres.
// null means geometry is inconclusive: retain legacy rain, do not turn missing
// model data into immunity. This is not an S3 cutoff or a full rain/cover test.
export function bossRainVerticalOverlap(shapes, bottomY, topY) {
  if (!Array.isArray(shapes) || !shapes.length || !Number.isFinite(bottomY) ||
      !Number.isFinite(topY) || bottomY > topY) return null;
  let active = 0, unknown = false;
  for (const shape of shapes) {
    if (shape?.active === false) continue;
    if (shape?.active !== true) { unknown = true; continue; }
    active++;
    const p = shape.pos, r = shape.r;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) ||
        !Number.isFinite(r) || r < 0) { unknown = true; continue; }
    if (p.y + r >= bottomY && p.y - r <= topY) return true;
  }
  return !active || unknown ? null : false;
}
