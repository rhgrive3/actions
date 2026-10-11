// Original INKWAVE geometry settings, not Nintendo/SplatoonSWEPs parameters.
export const VOLUME_SHAPE = Object.freeze({ thickness: .22, backRatio: .72, upperBias: .28, interiorStep: 8 });

// Pixel-resolution boundary cells, larger completely covered interior tiles.
// All tile perimeters share unit-spaced vertices: no T junctions. Clipped
// triangles preserve holes/islands without polygon containment heuristics.
export function buildInkMesh(rgba, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw Error('Invalid RGBA dimensions');
  const cfg = { ...VOLUME_SHAPE, ...options };
  if (!(cfg.thickness > 0 && cfg.thickness <= 1) || !(cfg.backRatio > 0 && cfg.backRatio <= 2) || !Number.isFinite(cfg.upperBias) || Math.abs(cfg.upperBias) > .8 || !Number.isInteger(cfg.interiorStep) || cfg.interiorStep < 1 || cfg.interiorStep > 32) throw Error('Invalid ink mesh settings');
  const W = width + 2, H = height + 2, alpha = new Float32Array(W * H), distance = new Float32Array(W * H);
  const iso = .5 / 255;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) alpha[(y + 1) * W + x + 1] = rgba[(y * width + x) * 4 + 3] / 255;
  for (let i = 0; i < alpha.length; i++) distance[i] = alpha[i] > iso ? W + H : 0;
  // Chamfer distance, including internal holes and disconnected islands.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - W] + 1, distance[i - W - 1] + Math.SQRT2, distance[i - W + 1] + Math.SQRT2);
  }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
    const i = y * W + x; distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + W] + 1, distance[i + W + 1] + Math.SQRT2, distance[i + W - 1] + Math.SQRT2);
  }
  // Smooth only the derived distance field: medial-axis ridges otherwise turn
  // into star-shaped highlights. The source alpha and contour remain untouched.
  const horizontalBlur = new Float32Array(distance.length), smoothDistance = new Float32Array(distance.length);
  const sigma = Math.max(1.5, Math.min(width, height) / 48), radius = Math.ceil(sigma * 3);
  const weights = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const weightSum = weights.reduce((a, b) => a + b);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += distance[y * W + Math.max(0, Math.min(W - 1, x + k))] * weights[k + radius]; horizontalBlur[y * W + x] = sum / weightSum;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += horizontalBlur[Math.max(0, Math.min(H - 1, y + k)) * W + x] * weights[k + radius]; smoothDistance[y * W + x] = sum / weightSum;
  }
  const sample = (a, x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = iy * W + ix;
    return (a[i] * (1 - fx) + a[Math.min(i + 1, a.length - 1)] * fx) * (1 - fy) + (a[Math.min(i + W, a.length - 1)] * (1 - fx) + a[Math.min(i + W + 1, a.length - 1)] * fx) * fy;
  };
  const xy = [], depths = [], uv = [], front = [], ids = new Map();
  function vertex(x, y, boundary = false) {
    const key = Math.round(x * 1e7) + ':' + Math.round(y * 1e7); if (ids.has(key)) return ids.get(key);
    const id = depths.length, u = (x - .5) / width, v = 1 - (y - .5) / height;
    const d = boundary ? 0 : Math.max(0, sample(distance, x, y) - .45);
    // Narrow necks/membranes stay thin; broad upper lobes inflate smoothly.
    // Distance saturates smoothly, no noise, no lateral displacement.
    const radius = Math.max(0, sample(smoothDistance, x, y) - .45) / Math.min(width, height), rounded = Math.sqrt(1 - Math.exp(-radius * 18)) * (1 - Math.exp(-d * .45));
    const h = cfg.thickness * (.004 + rounded * (1 + cfg.upperBias * (v * 2 - 1)));
    xy.push((u - .5) * width / height, v - .5); depths.push(h); uv.push(u, v); ids.set(key, id); return id;
  }
  function triangle(points) {
    let out = [];
    for (let i = 0; i < 3; i++) {
      const a = points[i], b = points[(i + 1) % 3], aa = alpha[a[1] * W + a[0]], ab = alpha[b[1] * W + b[0]];
      if (aa > iso) out.push([a[0], a[1], false]);
      if ((aa > iso) !== (ab > iso)) { const t = (iso - aa) / (ab - aa); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, true]); }
    }
    // Edge-touching artwork ends at the original image rectangle. Padding is
    // only for contour analysis; extending into adjacent atlas frames would
    // change its silhouette/alpha. Clip polygons, never clamp individual verts.
    for (const [axis, limit, sign] of [[0, .5, 1], [0, width + .5, -1], [1, .5, 1], [1, height + .5, -1]]) {
      const clipped = [];
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[(i + 1) % out.length], insideA = sign * (a[axis] - limit) >= 0, insideB = sign * (b[axis] - limit) >= 0;
        if (insideA) clipped.push(a);
        if (insideA !== insideB) { const t = (limit - a[axis]) / (b[axis] - a[axis]); clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, true]); }
      }
      out = clipped;
    }
    for (let k = 1; k + 1 < out.length; k++) {
      const a0 = out[0], b0 = out[k], c0 = out[k + 1];
      if ((b0[0] - a0[0]) * (c0[1] - a0[1]) - (b0[1] - a0[1]) * (c0[0] - a0[0]) <= 1e-14) continue;
      const a = vertex(...out[0]), b = vertex(...out[k]), c = vertex(...out[k + 1]);
      // Image y is down: reverse winding to make front normals point +z.
      if (a !== b && b !== c && c !== a) front.push(a, c, b);
    }
  }
  const leaves = [], horizontal = new Map(), vertical = new Map();
  function tile(x, y, sx, sy) {
    let full = true, empty = true;
    for (let yy = y; yy <= y + sy; yy++) for (let xx = x; xx <= x + sx; xx++) { const on = alpha[yy * W + xx] > iso; full &&= on; empty &&= !on; }
    if (empty) return;
    if (full) {
      leaves.push([x, y, sx, sy]);
    } else if (sx > 1 || sy > 1) {
      if (sx >= sy && sx > 1) { const h = Math.floor(sx / 2); tile(x, y, h, sy); tile(x + h, y, sx - h, sy); }
      else { const h = Math.floor(sy / 2); tile(x, y, sx, h); tile(x, y + h, sx, sy - h); }
    } else {
      triangle([[x, y], [x + 1, y], [x + 1, y + 1]]);
      triangle([[x, y], [x + 1, y + 1], [x, y + 1]]);
    }
  }
  for (let y = 0; y < H - 1; y += cfg.interiorStep) for (let x = 0; x < W - 1; x += cfg.interiorStep) tile(x, y, Math.min(cfg.interiorStep, W - 1 - x), Math.min(cfg.interiorStep, H - 1 - y));
  // Register all leaf corners on each shared line before tessellating full tiles.
  // Mixed unit cells already use the four lattice corners; no edge midpoint is
  // introduced where the neighbor is coarse. This greatly reduces interior cost.
  const add = (map, line, value) => { if (!map.has(line)) map.set(line, new Set()); map.get(line).add(value); };
  for (const [x, y, sx, sy] of leaves) for (const yy of [y, y + sy]) for (const xx of [x, x + sx]) { add(horizontal, yy, xx); add(vertical, xx, yy); }
  for (let i = 0; i < xy.length; i += 2) {
    const x = Math.round(((xy[i] * height / width + .5) * width + .5) * 1e7) / 1e7;
    const y = Math.round(((.5 - xy[i + 1]) * height + .5) * 1e7) / 1e7;
    if (Number.isInteger(y)) add(horizontal, y, x);
    if (Number.isInteger(x)) add(vertical, x, y);
  }
  const cuts = (map, line, start, end) => [...map.get(line)].filter(x => x >= start && x <= end).sort((a, b) => a - b);
  for (const [x, y, sx, sy] of leaves) {
    const perimeter = [];
    for (const xx of cuts(horizontal, y, x, x + sx).slice(0, -1)) perimeter.push(vertex(xx, y));
    for (const yy of cuts(vertical, x + sx, y, y + sy).slice(0, -1)) perimeter.push(vertex(x + sx, yy));
    for (const xx of cuts(horizontal, y + sy, x, x + sx).slice(1).reverse()) perimeter.push(vertex(xx, y + sy));
    for (const yy of cuts(vertical, x, y, y + sy).slice(1).reverse()) perimeter.push(vertex(x, yy));
    const center = vertex(x + sx / 2, y + sy / 2);
    for (let i = 0; i < perimeter.length; i++) front.push(center, perimeter[(i + 1) % perimeter.length], perimeter[i]);
  }
  const N = depths.length, positions = new Float32Array(N * 6), uvs = new Float32Array(N * 4), indices = [...front], edges = new Map();
  for (let i = 0; i < N; i++) {
    positions.set([xy[i * 2], xy[i * 2 + 1], depths[i] * .5], i * 3);
    positions.set([xy[i * 2], xy[i * 2 + 1], -depths[i] * cfg.backRatio * .5], (i + N) * 3);
    uvs.set(uv.slice(i * 2, i * 2 + 2), i * 2); uvs.set(uv.slice(i * 2, i * 2 + 2), (i + N) * 2);
  }
  for (let i = 0; i < front.length; i += 3) {
    indices.push(front[i] + N, front[i + 2] + N, front[i + 1] + N);
    for (let k = 0; k < 3; k++) { const a = front[i + k], b = front[i + (k + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b); const e = edges.get(key); if (e) e.count++; else edges.set(key, { a, b, count: 1 }); }
  }
  const boundary = new Uint8Array(N * 2);
  let boundaryEdges = 0;
  for (const { a, b, count } of edges.values()) {
    if (count > 2) throw Error('Non-manifold front mesh');
    if (count === 1) { boundary[a] = boundary[b] = boundary[a + N] = boundary[b + N] = 1; indices.push(b, a, a + N, b, a + N, b + N); boundaryEdges++; }
  }
  // Smooth height-field normals, evaluated before simplification. Reusing them
  // avoids triangulation-dependent specular spikes on very skinny edge cells.
  const normals = new Float32Array(positions.length);
  const fieldHeight = (x, y) => {
    x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
    const d = Math.max(0, sample(distance, x, y) - .45), v = 1 - (y - .5) / height;
    return cfg.thickness * (.004 + Math.sqrt(1 - Math.exp(-Math.max(0, sample(smoothDistance, x, y) - .45) / Math.min(width, height) * 18)) * (1 - Math.exp(-d * .45)) * (1 + cfg.upperBias * (v * 2 - 1)));
  };
  const normalized = (offset, nx, ny, nz) => { const length = Math.hypot(nx, ny, nz); normals.set([nx / length, ny / length, nz / length], offset); };
  for (let i = 0; i < N; i++) {
    const x = (uv[i * 2] * width + .5), y = ((1 - uv[i * 2 + 1]) * height + .5);
    const dx = (fieldHeight(x + .75, y) - fieldHeight(x - .75, y)) / 1.5 * height * .5;
    const dy = (fieldHeight(x, y + .75) - fieldHeight(x, y - .75)) / 1.5 * height * .5;
    normalized(i * 3, -dx, dy, boundary[i] ? .08 : 1);
    normalized((i + N) * 3, -dx * cfg.backRatio, dy * cfg.backRatio, boundary[i] ? -.08 : -1);
  }
  const Index = positions.length / 3 <= 65535 ? Uint16Array : Uint32Array;
  return { positions, normals, uvs, indices: new Index(indices), boundaryEdges, boundary, frontIndices: new Index(front), frontVertexCount: N, settings: cfg };
}
