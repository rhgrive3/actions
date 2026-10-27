// Conservative pixel rectangles for the canonical RGBA8 profile stamp path.
// No geometry, sampling coordinate, shape, seed, or simulation data is changed.
export const PROFILE_BATCH_LIMIT = 64;

/** Fill caller-owned Int32 rectangles [x, y, width, height]. No allocations. */
export function profilePaintBounds(paint, rectangles) {
  const count = paint.quads, N = paint.size;
  if (!Number.isInteger(count) || count < 1 || count > PROFILE_BATCH_LIMIT ||
      !Number.isInteger(N) || N < 256 || rectangles.length < count * 4) return false;
  const pos = paint.aPos, local = paint.aLocal, splat = paint.aSplat;
  const stretch = paint.aStretch, growth = paint.aGrow;
  if (!pos || !local || !splat || !stretch || !growth ||
      pos.length < count * 8 || local.length < count * 12 || splat.length < count * 16 ||
      stretch.length < count * 12 || growth.length < count * 16) return false;
  for (let q = 0; q < count; q++) {
    const a = q * 16, l = q * 12, v = q * 8, out = q * 4;
    const R = splat[a], flags = splat[a + 3], kind = Math.floor(flags * .5 + .01);
    const dx = stretch[l], dy = stretch[l + 1], amount = stretch[l + 2];
    const age = growth[a], norm = dx * dx + dy * dy;
    if (kind < 10 || kind > 19 || !(R > 0 && R <= 128) ||
        !(amount >= 0 && amount <= 4) || Math.abs(norm - 1) > 1e-5 ||
        !Number.isFinite(age) || !Number.isFinite(flags) || !Number.isFinite(local[l+2]) ||
        !Number.isFinite(splat[a+1]) || !Number.isFinite(splat[a+2]) ||
        !Number.isFinite(growth[a+1]) || !Number.isFinite(growth[a+2]) || !Number.isFinite(growth[a+3])) return false;
    // All per-primitive constants must really be constant at all four corners.
    // A custom/deformed stamp is not eligible for vertex-stage constant reuse.
    for (let k = 1; k < 4; k++) {
      for (let j = 0; j < 4; j++) {
        if (splat[a + k * 4 + j] !== splat[a + j] || growth[a + k * 4 + j] !== growth[a + j]) return false;
      }
      for (let j = 0; j < 3; j++) if (stretch[l + k * 3 + j] !== stretch[l + j]) return false;
      if (local[l + k * 3 + 2] !== local[l + 2]) return false;
    }
    const x0 = pos[v], y0 = pos[v + 1], x1 = pos[v + 2], y1 = pos[v + 5];
    const lx0 = local[l], ly0 = local[l + 1], lx1 = local[l + 3], ly1 = local[l + 7];
    if (!(x1 > x0 && y1 > y0 && lx1 > lx0 && ly1 > ly0) ||
        x0 < -1 || y0 < -1 || x1 > 1 || y1 > 1 ||
        pos[v + 4] !== x1 || pos[v + 6] !== x0 || pos[v + 3] !== y0 || pos[v + 7] !== y1 ||
        local[l + 6] !== lx1 || local[l + 9] !== lx0 || local[l + 4] !== ly0 || local[l + 10] !== ly1 ||
        !Number.isFinite(x0 + x1 + y0 + y1 + lx0 + lx1 + ly0 + ly1)) return false;
    // Canonical _pushQuad clips to the atlas before submission. Hardware
    // viewport-clipped custom triangles can round interpolation differently
    // when split across calls; leave those on the original unsplit batch.
    const px0 = (x0 + 1) * N * .5, py0 = (y0 + 1) * N * .5;
    const width = (x1 - x0) * N * .5, height = (y1 - y0) * N * .5;
    if (!(width >= 8 && height >= 8)) return false; // Small stamps keep the cheap existing batch.
    const scaleX = width / (lx1 - lx0), scaleY = height / (ly1 - ly0);
    // Account for raster subpixel rounding before bounding the existing capped
    // antialias footprint. Four texels plus two output pixels are conservative.
    const texel = Math.max((lx1 - lx0) / (width - 1), (ly1 - ly0) / (height - 1), 1e-5);
    const t = Math.max(0, Math.min(1, age));
    const grow = .4 + .6 * (1 - (1 - t) ** 4);
    // mainInkDistance returns the radius for zero-width profile sections.
    // With an undersampled grazing footprint that constant can enter the AA
    // transition next to a discontinuity. Preserve the full original batch
    // unless even that sentinel is safely outside the capped AA interval.
    const effectiveRadius = Math.sqrt(R * R - local[l+2] * local[l+2]) * grow;
    if (!(effectiveRadius > 2 * texel)) return false;
    const radius = R * (Math.min(1, grow) + 1e-5) * 1.0001 + texel * 4;
    // Invert the actual stretch operator, including Float32 direction norm
    // rounding, rather than assuming exactly unit-length directions.
    const positive = 1 - norm + norm / (1 + amount);
    const negative = 1 - norm + norm / (1 + .25 * amount);
    if (!(positive > .1 && negative > .1)) return false;
    const along0 = -radius / negative, along1 = radius / positive;
    const minX = (Math.min(dx * along0, dx * along1) - Math.abs(dy) * radius) / norm;
    const maxX = (Math.max(dx * along0, dx * along1) + Math.abs(dy) * radius) / norm;
    const minY = (Math.min(dy * along0, dy * along1) - Math.abs(dx) * radius) / norm;
    const maxY = (Math.max(dy * along0, dy * along1) + Math.abs(dx) * radius) / norm;
    const left = Math.max(0, Math.min(N, Math.floor(px0 + (minX - lx0) * scaleX) - 2));
    const bottom = Math.max(0, Math.min(N, Math.floor(py0 + (minY - ly0) * scaleY) - 2));
    const right = Math.max(0, Math.min(N, Math.ceil(px0 + (maxX - lx0) * scaleX) + 2));
    const top = Math.max(0, Math.min(N, Math.ceil(py0 + (maxY - ly0) * scaleY) + 2));
    rectangles[out] = left; rectangles[out + 1] = bottom;
    rectangles[out + 2] = Math.max(0, right - left); rectangles[out + 3] = Math.max(0, top - bottom);
  }
  return true;
}
