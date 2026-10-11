// Build-only lossless collision broadphase: skip impossible heights before
// expensive oriented-box slabs, and scan single spatial-hash buckets in place.
// Exact near-boundary queries still use native multi-cell deduplication.
// Neither geometry, physics time step, result ordering nor hit tolerances change.
export function adaptCollisionHotpath(rel, code, replaceOnce) {
  const change = (before, after, label) => {
    code = replaceOnce(code, before, after, 'collision hotpath: ' + label);
  };
  if (rel === 'src/game/physics.js') {
    change(
      '    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;',
      `    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    // Oriented blocks are enclosed by their original Level-generated AABBs.
    // Include a conservative epsilon, including at grazing endpoints.
    // Non-finite reach leaves this test inert rather than rejecting a hit.
    const ey = origin.y + dir.y * maxDist;
    const yLo = Math.min(origin.y, ey) - 1e-6;
    const yHi = Math.max(origin.y, ey) + 1e-6;`,
      'compute vertical reach once per ray');
    change(
      '      if (!b.solid || (skipGrates && b.grate)) continue;\n      // AABB precheck along the segment (cheap)',
      `      if (!b.solid || (skipGrates && b.grate)) continue;
      // Most XZ-candidate blocks cannot overlap the ray vertically.
      // Optional bounds retain compatibility with partial/custom fixtures.
      if (b.aabbMin?.y > yHi || b.aabbMax?.y < yLo) continue;
      // AABB precheck along the segment (cheap)`,
      'discard vertically disjoint raycast blocks');
  }
  if (rel === 'src/world/level.js') {
    change(
      `    const ids = this.queryBlocks(p.x - 0.01, p.z - 0.01, p.x + 0.01, p.z + 0.01, this._qtmp || (this._qtmp = []));
    for (const id of ids) {`,
      `    const x0 = this._hxi(p.x - 0.01), x1 = this._hxi(p.x + 0.01);
    const z0 = this._hzi(p.z - 0.01), z1 = this._hzi(p.z + 0.01);
    if (x0 === x1 && z0 === z1) {
      // No hash cell can contain the same block twice. Preserve the native
      // generation stamp and *all* its blockStamp writes before early exit.
      const ids = this.hash[z0 * this.hw + x0], st = ++this._stamp;
      for (let i = 0; i < ids.length; i++) this.blockStamp[ids[i]] = st;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id === exclude) continue;
        const b = this.blocks[id];
        if (!b.solid) continue;
        if (this.pointInBlock(b, p, pad)) return true;
      }
      return false;
    }
    // Points at a cell boundary still visit/deduplicate all adjacent cells.
    const ids = this.queryBlocks(p.x - 0.01, p.z - 0.01, p.x + 0.01, p.z + 0.01, this._qtmp || (this._qtmp = []));
    for (const id of ids) {`,
      'bypass temporary candidate array for single-cell point probes');
  }
  return code;
}
