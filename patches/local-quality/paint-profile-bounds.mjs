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
  const halfN = N * .5;
  for (let q = 0; q < count; q++) {
    const a = q * 16, l = q * 12, v = q * 8, out = q * 4;
    const R = splat[a], s1 = splat[a + 1], s2 = splat[a + 2], flags = splat[a + 3];
    const kind = Math.floor(flags * .5 + .01);
    const dx = stretch[l], dy = stretch[l + 1], amount = stretch[l + 2];
    const age = growth[a], g1 = growth[a + 1], g2 = growth[a + 2], g3 = growth[a + 3];
    const lz = local[l + 2], norm = dx * dx + dy * dy;
    if (kind < 10 || kind > 19 || !(R > 0 && R <= 128) ||
        !(amount >= 0 && amount <= 4) || Math.abs(norm - 1) > 1e-5 ||
        !Number.isFinite(age) || !Number.isFinite(flags) || !Number.isFinite(lz) ||
        !Number.isFinite(s1) || !Number.isFinite(s2) ||
        !Number.isFinite(g1) || !Number.isFinite(g2) || !Number.isFinite(g3)) return false;
    // All per-primitive constants must really be constant at all four corners.
    // A custom/deformed stamp is not eligible for vertex-stage constant reuse.
    if (splat[a + 4] !== R || splat[a + 5] !== s1 || splat[a + 6] !== s2 || splat[a + 7] !== flags ||
        splat[a + 8] !== R || splat[a + 9] !== s1 || splat[a + 10] !== s2 || splat[a + 11] !== flags ||
        splat[a + 12] !== R || splat[a + 13] !== s1 || splat[a + 14] !== s2 || splat[a + 15] !== flags ||
        growth[a + 4] !== age || growth[a + 5] !== g1 || growth[a + 6] !== g2 || growth[a + 7] !== g3 ||
        growth[a + 8] !== age || growth[a + 9] !== g1 || growth[a + 10] !== g2 || growth[a + 11] !== g3 ||
        growth[a + 12] !== age || growth[a + 13] !== g1 || growth[a + 14] !== g2 || growth[a + 15] !== g3 ||
        stretch[l + 3] !== dx || stretch[l + 4] !== dy || stretch[l + 5] !== amount ||
        stretch[l + 6] !== dx || stretch[l + 7] !== dy || stretch[l + 8] !== amount ||
        stretch[l + 9] !== dx || stretch[l + 10] !== dy || stretch[l + 11] !== amount ||
        local[l + 5] !== lz || local[l + 8] !== lz || local[l + 11] !== lz) return false;
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
    const px0 = (x0 + 1) * halfN, py0 = (y0 + 1) * halfN;
    const width = (x1 - x0) * halfN, height = (y1 - y0) * halfN;
    if (!(width >= 8 && height >= 8)) return false; // Small stamps keep the cheap existing batch.
    const dlx = lx1 - lx0, dly = ly1 - ly0;
    const scaleX = width / dlx, scaleY = height / dly;
    // Account for raster subpixel rounding before bounding the existing capped
    // antialias footprint. Four texels plus two output pixels are conservative.
    const tx = dlx / (width - 1), ty = dly / (height - 1);
    const texel = tx >= ty ? (tx >= 1e-5 ? tx : 1e-5) : (ty >= 1e-5 ? ty : 1e-5);
    const t = age <= 0 ? 0 : (age >= 1 ? 1 : age);
    const grow = .4 + .6 * (1 - (1 - t) ** 4);
    // mainInkDistance returns the radius for zero-width profile sections.
    // With an undersampled grazing footprint that constant can enter the AA
    // transition next to a discontinuity. Preserve the full original batch
    // unless even that sentinel is safely outside the capped AA interval.
    const effectiveRadius = Math.sqrt(R * R - lz * lz) * grow;
    if (!(effectiveRadius > 2 * texel)) return false;
    const radius = R * ((grow < 1 ? grow : 1) + 1e-5) * 1.0001 + texel * 4;
    // Invert the actual stretch operator, including Float32 direction norm
    // rounding, rather than assuming exactly unit-length directions.
    const positive = 1 - norm + norm / (1 + amount);
    const negative = 1 - norm + norm / (1 + .25 * amount);
    if (!(positive > .1 && negative > .1)) return false;
    const along0 = -radius / negative, along1 = radius / positive;
    const dxa0 = dx * along0, dxa1 = dx * along1;
    const dya0 = dy * along0, dya1 = dy * along1;
    const absDyR = (dy < 0 ? -dy : dy) * radius, absDxR = (dx < 0 ? -dx : dx) * radius;
    const minX = ((dxa0 < dxa1 ? dxa0 : dxa1) - absDyR) / norm;
    const maxX = ((dxa0 > dxa1 ? dxa0 : dxa1) + absDyR) / norm;
    const minY = ((dya0 < dya1 ? dya0 : dya1) - absDxR) / norm;
    const maxY = ((dya0 > dya1 ? dya0 : dya1) + absDxR) / norm;
    const lRaw = Math.floor(px0 + (minX - lx0) * scaleX) - 2;
    const bRaw = Math.floor(py0 + (minY - ly0) * scaleY) - 2;
    const rRaw = Math.ceil(px0 + (maxX - lx0) * scaleX) + 2;
    const tRaw = Math.ceil(py0 + (maxY - ly0) * scaleY) + 2;
    const left = lRaw <= 0 ? 0 : (lRaw >= N ? N : lRaw);
    const bottom = bRaw <= 0 ? 0 : (bRaw >= N ? N : bRaw);
    const right = rRaw <= 0 ? 0 : (rRaw >= N ? N : rRaw);
    const top = tRaw <= 0 ? 0 : (tRaw >= N ? N : tRaw);
    rectangles[out] = left; rectangles[out + 1] = bottom;
    rectangles[out + 2] = right > left ? right - left : 0;
    rectangles[out + 3] = top > bottom ? top - bottom : 0;
  }
  return true;
}
