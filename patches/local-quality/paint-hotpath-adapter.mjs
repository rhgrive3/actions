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
  return code;
}
