// Build-only collision broadphase + segment-capsule distance hotpath.
// Skip XZ-disjoint blocks; compare squared distances before the last sqrt.
// Native collision geometry, step cadence and query order remain unchanged.
// Neither geometry, physics time step, result ordering nor hit tolerances change.
export function adaptCollisionHotpath(rel, code, replaceOnce) {
  // Reject duplicate builds before their retained native anchors can match again.
  if (rel === 'src/world/level.js' && code.includes('if (x0 === x1 && z0 === z1) {')) throw new Error('collision hotpath: level already adapted');
  if (rel === 'src/game/physics.js' && code.includes('const yLo = Math.min(origin.y, ey) - 1e-6;')) throw new Error('collision hotpath: physics already adapted');
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
    // The spatial hash can admit many blocks whose XZ AABB is farther away
    // than the capsule radius. Reject them before four OBB closest-point calls.
    change(
      '        if (pos.y + height < b.aabbMin.y - 0.05 || pos.y > b.aabbMax.y + 0.05) continue;',
      '        if (pos.y + height < b.aabbMin.y - 0.05 || pos.y > b.aabbMax.y + 0.05 || pos.x + radius < b.aabbMin.x - 0.05 || pos.x - radius > b.aabbMax.x + 0.05 || pos.z + radius < b.aabbMin.z - 0.05 || pos.z - radius > b.aabbMax.z + 0.05) continue;',
      'skip XZ-disjoint collideCapsule blocks');
    change(
      '        if (pos.y + height < b.aabbMin.y - 0.05 || pos.y + lift > b.aabbMax.y + 0.05) continue;',
      '        if (pos.y + height < b.aabbMin.y - 0.05 || pos.y + lift > b.aabbMax.y + 0.05 || pos.x + radius < b.aabbMin.x - 0.05 || pos.x - radius > b.aabbMax.x + 0.05 || pos.z + radius < b.aabbMin.z - 0.05 || pos.z - radius > b.aabbMax.z + 0.05) continue;',
      'skip XZ-disjoint collideBody blocks');
    // bodyFits accepts a caller-supplied margin. The original squared test
    // treats negative radii as positive, so retain that conservative range.
    change(
      '      if (pos.y + height < b.aabbMin.y || pos.y + lift > b.aabbMax.y) continue;',
      '      if (pos.y + height < b.aabbMin.y || pos.y + lift > b.aabbMax.y || pos.x + Math.max(radius, Math.abs(radius - margin)) < b.aabbMin.x || pos.x - Math.max(radius, Math.abs(radius - margin)) > b.aabbMax.x || pos.z + Math.max(radius, Math.abs(radius - margin)) < b.aabbMin.z || pos.z - Math.max(radius, Math.abs(radius - margin)) > b.aabbMax.z) continue;',
      'skip XZ-disjoint bodyFits blocks');
    // Preserve authored 7-sample + 8-ternary search, but avoid 23 square roots
    // and temporary Vector3 mutations. Near a rounded-distance tie, compare
    // sqrt values to retain the old branch direction and contact time.
    change(
      `  static segmentCapsuleDist(a, b, base, radius, height, res) {
    // sample-based closest point (short segments; robust enough for projectiles)
    let best = Infinity, bt = 0;
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      _p.copy(a).lerp(b, t);
      const d = Physics.pointCapsuleDist(_p, base, radius, height);
      if (d < best) { best = d; bt = t; }
    }
    // refine
    let lo = Math.max(0, bt - 1 / steps), hi = Math.min(1, bt + 1 / steps);
    for (let k = 0; k < 8; k++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      _p.copy(a).lerp(b, m1); const d1 = Physics.pointCapsuleDist(_p, base, radius, height);
      _p.copy(a).lerp(b, m2); const d2 = Physics.pointCapsuleDist(_p, base, radius, height);
      if (d1 < d2) hi = m2; else lo = m1;
    }
    res.t = (lo + hi) / 2;
    _p.copy(a).lerp(b, res.t);
    res.dist = Physics.pointCapsuleDist(_p, base, radius, height);
    return res;
  }`,
      `  static segmentCapsuleDist(a, b, base, radius, height, res) {
    const yLo = base.y + radius, yHi = base.y + Math.max(radius, height - radius);
    const ax = a.x, ay = a.y, az = a.z, abx = b.x - ax, aby = b.y - ay, abz = b.z - az;
    const bx = base.x, bz = base.z;
    const distance2 = (t) => {
      const px = ax + abx * t, py = ay + aby * t, pz = az + abz * t;
      const y = py < yLo ? yLo : py > yHi ? yHi : py;
      const dx = px - bx, dy = py - y, dz = pz - bz;
      return dx * dx + dy * dy + dz * dz;
    };
    let best = Infinity, bt = 0;
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, d2 = distance2(t);
      // Math.sqrt can round distinct squared distances to a tie.
      const better = d2 < best && (best - d2 > 8 * Number.EPSILON * Math.max(best, d2) ||
        Math.sqrt(d2) < Math.sqrt(best));
      if (better) { best = d2; bt = t; }
    }
    let lo = Math.max(0, bt - 1 / steps), hi = Math.min(1, bt + 1 / steps);
    for (let k = 0; k < 8; k++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const d1 = distance2(m1), d2 = distance2(m2);
      const closer = d1 < d2 && (d2 - d1 > 8 * Number.EPSILON * Math.max(d1, d2) ||
        Math.sqrt(d1) < Math.sqrt(d2));
      if (closer) hi = m2; else lo = m1;
    }
    res.t = (lo + hi) / 2;
    _p.copy(a).lerp(b, res.t);
    res.dist = Physics.pointCapsuleDist(_p, base, radius, height);
    return res;
  }`,
      'inline squared-distance segmentCapsuleDist probes');
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
