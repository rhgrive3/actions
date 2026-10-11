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
  // Every paint quad has only two distinct U and V coordinates. Convert
  // those four coordinates once, not again for each of the four vertices.
  // Keep the exact original arithmetic/rounding and attribute order.
  change(
    `    const q = this.quads++;
    const flags = (f.wall ? 1 : 0) + 2 * kind;
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? u1 : u0, cv = c >= 2 ? v1 : v0;
      const vi = q * 4 + c;
      const px = a.x + a.pad + cu * a.ppm, py = a.y + a.pad + cv * a.ppm;
      this.aPos[vi * 2] = (px / S) * 2 - 1;
      this.aPos[vi * 2 + 1] = (py / S) * 2 - 1;`,
    `    const q = this.quads++;
    const flags = (f.wall ? 1 : 0) + 2 * kind;
    const x0 = ((a.x + a.pad + u0 * a.ppm) / S) * 2 - 1;
    const x1 = ((a.x + a.pad + u1 * a.ppm) / S) * 2 - 1;
    const y0 = ((a.y + a.pad + v0 * a.ppm) / S) * 2 - 1;
    const y1 = ((a.y + a.pad + v1 * a.ppm) / S) * 2 - 1;
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? u1 : u0, cv = c >= 2 ? v1 : v0;
      const vi = q * 4 + c;
      this.aPos[vi * 2] = c === 1 || c === 2 ? x1 : x0;
      this.aPos[vi * 2 + 1] = c >= 2 ? y1 : y0;`,
    'reuse identical paint quad atlas coordinates');
  return code;
}
