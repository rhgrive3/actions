// Build-time-only, behavior-preserving PaintSystem CPU allocation cleanup.
// Protected upstream source stays immutable; fail closed when any anchor changes.
export function adaptPaintHotpath(rel, code, replaceOnce) {
  if (rel !== 'src/world/paint.js') return code;
  const change = (before, after, label) => {
    code = replaceOnce(code, before, after, 'paint hotpath: ' + label);
  };
  // Fixed vertex-attribute names do not need a fresh five-element Array per
  // active paint-atlas GPU flush. The immutable shared list preserves order.
  change('const MAX_QUADS = 6000;',
    "const MAX_QUADS = 6000;\nconst PAINT_GPU_ATTRIBUTE_NAMES = Object.freeze(['aPos', 'aLocal', 'aSplat', 'aStretch', 'aGrow']);",
    'reuse GPU upload attribute list');
  change("for (const name of ['aPos', 'aLocal', 'aSplat', 'aStretch', 'aGrow']) {",
    'for (const name of PAINT_GPU_ATTRIBUTE_NAMES) {',
    'remove per-flush attribute-list allocation');
  // _initGPU previously allocated 6,000 separate temporary JS Arrays (one
  // per quad) only to copy six Uint32 indices into a persistent typed buffer.
  // Write the identical six index values directly with no transient arrays.
  change('    for (let i = 0; i < MAX_QUADS; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);',
    `    for (let i = 0; i < MAX_QUADS; i++) {
      const v = i * 4, at = i * 6;
      idx[at] = v; idx[at + 1] = v + 1; idx[at + 2] = v + 2;
      idx[at + 3] = v; idx[at + 4] = v + 2; idx[at + 5] = v + 3;
    }`,
    'fill identical 6000-quad index buffer without 6000 small arrays');
  // opts.face is a stable input object during one splat; the optional face
  // restriction should be validated once, not for every face of every block.
  // Both the upstream source and #803's pooled-entry production source
  // have this single in-splat anchor. Do not replace or relocate the pool.
  change('    let wall = false;',
    '    const faceOnly = Number.isInteger(opts.face) && opts.face >= 0 ? opts.face : -1;\n    let wall = false;',
    'hoist one optional per-face gate, preserving surrounding entry pool');
  change('if (fid < 0 || (Number.isInteger(opts.face) && opts.face >= 0 && fid !== opts.face)) continue;',
    'if (fid < 0 || (faceOnly >= 0 && fid !== faceOnly)) continue;',
    'reuse stable per-splat face gate');
  // Each quad has two distinct U/V coordinates, shared by four vertices.
  // Unroll contiguous position + local XY writes to avoid adding per-vertex
  // branches; preserve the native arithmetic, Float32 rounding and attributes.
  change(
    `    const q = this.quads++;
    const flags = (f.wall ? 1 : 0) + 2 * kind;
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? u1 : u0, cv = c >= 2 ? v1 : v0;
      const vi = q * 4 + c;
      const px = a.x + a.pad + cu * a.ppm, py = a.y + a.pad + cv * a.ppm;
      this.aPos[vi * 2] = (px / S) * 2 - 1;
      this.aPos[vi * 2 + 1] = (py / S) * 2 - 1;
      this.aLocal[vi * 3] = cu - lu; this.aLocal[vi * 3 + 1] = cv - lv; this.aLocal[vi * 3 + 2] = dn;`,
    `    const q = this.quads++;
    const flags = (f.wall ? 1 : 0) + 2 * kind;
    const x0 = ((a.x + a.pad + u0 * a.ppm) / S) * 2 - 1;
    const x1 = ((a.x + a.pad + u1 * a.ppm) / S) * 2 - 1;
    const y0 = ((a.y + a.pad + v0 * a.ppm) / S) * 2 - 1;
    const y1 = ((a.y + a.pad + v1 * a.ppm) / S) * 2 - 1;
    const xy = q * 8;
    this.aPos[xy] = x0; this.aPos[xy + 1] = y0;
    this.aPos[xy + 2] = x1; this.aPos[xy + 3] = y0;
    this.aPos[xy + 4] = x1; this.aPos[xy + 5] = y1;
    this.aPos[xy + 6] = x0; this.aPos[xy + 7] = y1;
    const du0 = u0 - lu, du1 = u1 - lu, dv0 = v0 - lv, dv1 = v1 - lv;
    const local = q * 12;
    this.aLocal[local] = du0; this.aLocal[local + 1] = dv0;
    this.aLocal[local + 3] = du1; this.aLocal[local + 4] = dv0;
    this.aLocal[local + 6] = du1; this.aLocal[local + 7] = dv1;
    this.aLocal[local + 9] = du0; this.aLocal[local + 10] = dv1;
    for (let c = 0; c < 4; c++) {
      const vi = q * 4 + c;
      this.aLocal[vi * 3 + 2] = dn;`,
    'reuse identical paint quad positions and local coordinates');
  // Exact inner-disc admission: all five sine terms sum to no less
  // than -(0.12+0.08+0.05+0.03+0.018) = -0.298, and the two cos^even
  // spikes are nonnegative. Hence blobWobble >= 0.702 for any seed/angle.
  // With the historical CPU cutoff 0.97, d < 0.68*r guarantees
  // d/(r*blobWobble) < 0.96867 < 0.97; the canonical cutoff 1 is also safe.
  // Do not alter the body boundary, GPU shader, roll band, or claim order.
  const nativeCut = '          if (d / (r * blobWobble(Math.atan2(py, px), seed)) > ';
  const cappedCut = '          if (d / (r * Math.min(1, blobWobble(Math.atan2(py, px), seed))) > ';
  const bodyRatio = [nativeCut, cappedCut].flatMap(prefix => [0.97, 1].map(cut => prefix + cut + ') continue;'))
    .filter(anchor => code.includes(anchor));
  if (bodyRatio.length !== 1) {
    throw new Error('paint hotpath: expected one native/canonical blob wobble cut');
  }
  change(bodyRatio[0],
    bodyRatio[0].replace('if (d /', 'if (d >= r * 0.68 && d /'),
    'skip guaranteed-inside ink body trigonometry');
  // The two narrow spikes are nonnegative and bounded by 0.17 + 0.12.
  // Use those bounds only with a wide floating-point guard; ambiguous edge
  // cells run the exact original additions, multiplication and division.
  const body = `export function blobWobble(ang, seed) {
  return 1 + 0.12 * Math.sin(3 * ang + seed * 6.2831) + 0.08 * Math.sin(5 * ang + seed * 17.0) +
    0.05 * Math.sin(7 * ang + seed * 41.0) + 0.03 * Math.sin(11 * ang + seed * 73.0) + 0.018 * Math.sin(17 * ang + seed * 29.0) +
    0.17 * Math.pow(Math.max(Math.cos(ang - seed * 37.7), 0), 28) + 0.12 * Math.pow(Math.max(Math.cos(ang - seed * 53.3 - 2.1), 0), 36);
}`;
  // A separately adopted width-cap adapter may precede this optimization.
  // Preserve that cap at EVERY bound and at the exact fallback; never add one.
  const capped = bodyRatio[0].includes('Math.min(1,');
  const bound = expression => capped ? `Math.min(1, ${expression})` : expression;
  change(body, `function paintBodyContains(d, r, ang, seed, cutoff) {
  const base = 1 + 0.12 * Math.sin(3 * ang + seed * 6.2831) + 0.08 * Math.sin(5 * ang + seed * 17.0) +
    0.05 * Math.sin(7 * ang + seed * 41.0) + 0.03 * Math.sin(11 * ang + seed * 73.0) + 0.018 * Math.sin(17 * ang + seed * 29.0);
  if (d / (r * ${bound('base')}) < cutoff * (1 - 1e-12)) return true;
  if (d / (r * (${bound('base + 0.29')})) > cutoff * (1 + 1e-12)) return false;
  const withFirst = base + 0.17 * Math.pow(Math.max(Math.cos(ang - seed * 37.7), 0), 28);
  if (d / (r * ${bound('withFirst')}) < cutoff * (1 - 1e-12)) return true;
  if (d / (r * (${bound('withFirst + 0.12')})) > cutoff * (1 + 1e-12)) return false;
  const exact = withFirst + 0.12 * Math.pow(Math.max(Math.cos(ang - seed * 53.3 - 2.1), 0), 36);
  return !(d / (r * ${bound('exact')}) > cutoff);
}

${body}`, 'bounded paint spike evaluation');
  const cutoff = bodyRatio[0].includes('> 0.97') ? '0.97' : '1';
  change(bodyRatio[0].replace('if (d /', 'if (d >= r * 0.68 && d /'),
    `          if (d >= r * 0.68 && !paintBodyContains(d, r, Math.atan2(py, px), seed, ${cutoff})) continue;`,
    'short circuit only proven body spike interiors and exteriors');
  return code;
}
