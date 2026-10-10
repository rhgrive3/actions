const ENTRY_POOL_MAX = 64;
const GROWTH_POOL_MAX = 64;
const ENTRY_POOL_MAX_FACES = 256;

export function adaptPaintSplatPool(rel, code, replaceOnce) {
  if (rel !== 'src/world/paint.js') return code;
  code = replaceOnce(code, 'const DRIP_REACH = 3.9;', `const DRIP_REACH = 3.9;
const SPLAT_ENTRY_POOL_MAX = ${ENTRY_POOL_MAX};
const SPLAT_GROWTH_POOL_MAX = ${GROWTH_POOL_MAX};
const SPLAT_ENTRY_POOL_MAX_FACES = ${ENTRY_POOL_MAX_FACES};`, 'splat pool bounds');

  code = replaceOnce(code,
    '    this.growing = [];            // splats still spreading / dripping on screen (the gameplay grid is already updated)',
    '    this.growing = [];            // splats still spreading / dripping on screen (the gameplay grid is already updated)\n' +
    '    this._splatEntryPool = [];\n' +
    '    this._splatGrowthPool = [];\n' +
    '    this._splatPoolsDisposed = false;\n' +
    '    this._splatPoolStats = { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 };',
    'splat pool initialization');

  code = replaceOnce(code, '  clear() {\n    const r = this.renderer;', `  _takeSplatEntries() {
    const pool = this._splatEntryPool;
    if (pool?.length) { this._splatPoolStats.entryArraysReused++; return pool.pop(); }
    this._splatPoolStats.entryArraysCreated++;
    return [];
  }

  _releaseSplatEntries(entries) {
    if (!entries) return;
    const faceCount = entries.length / 7;
    entries.length = 0;
    const pool = this._splatEntryPool;
    if (!this._splatPoolsDisposed && pool && Number.isInteger(faceCount) && faceCount <= SPLAT_ENTRY_POOL_MAX_FACES && pool.length < SPLAT_ENTRY_POOL_MAX) pool.push(entries);
  }

  _takeSplatGrowth() {
    const pool = this._splatGrowthPool;
    if (pool?.length) { this._splatPoolStats.growthRecordsReused++; return pool.pop(); }
    this._splatPoolStats.growthRecordsCreated++;
    return { entries: null, R: 0, team: 0, seed: 0, kind: 0, age: 0, dur: 0, dripDur: 0, cx: 0, cy: 0, cz: 0, paintOwner: null, paintCreditMode: 0, paintOrder: 0, netOrderId: 0 };
  }

  _releaseSplatGrowth(g) {
    if (!g) return;
    this._releaseSplatEntries(g.entries);
    g.entries = null;
    g.R = g.team = g.seed = g.kind = g.age = g.dur = g.dripDur = g.cx = g.cy = g.cz = 0;
    g.paintOwner = null; g.paintCreditMode = 0; g.paintOrder = 0; g.netOrderId = 0;
    const pool = this._splatGrowthPool;
    if (!this._splatPoolsDisposed && pool && pool.length < SPLAT_GROWTH_POOL_MAX) pool.push(g);
  }

  _disposeSplatPools() {
    this._hiddenQuads = null;
    this._splatPoolsDisposed = true;
    if (this.growing) {
      for (let i = 0; i < this.growing.length; i++) this._releaseSplatGrowth(this.growing[i]);
      this.growing.length = 0;
    }
    if (this._splatEntryPool) this._splatEntryPool.length = 0;
    if (this._splatGrowthPool) this._splatGrowthPool.length = 0;
    this._splatEntryPool = null;
    this._splatGrowthPool = null;
  }

  clear() {
    const r = this.renderer;`, 'splat pool lifecycle methods');

  code = replaceOnce(code, '    if (this.growing) this.growing.length = 0;', `    if (this.growing) {
      for (let i = 0; i < this.growing.length; i++) this._releaseSplatGrowth(this.growing[i]);
      this.growing.length = 0;
    }`, 'clear releases splat pools');

  code = replaceOnce(code,
    '    let claimed = 0;\n    const entries = [];\n    let wall = false;',
    '    let claimed = 0;\n    let entries = this._takeSplatEntries();\n    let growth = null;\n    let wall = false;',
    'splat entry lease');

  code = replaceOnce(code,
    '          if (dx * dx + dy * dy + dz * dz < rs * rs) { this._emitGrowth(g, 3, 1, false); this.growing.splice(i, 1); }',
    '          if (dx * dx + dy * dy + dz * dz < rs * rs) { this._emitGrowth(g, 3, 1, false); this.growing.splice(i, 1); this._releaseSplatGrowth(g); }',
    'release forced older growth');

  code = replaceOnce(code, `      const g = {
        entries, R: radius, team, seed, kind, age: 0,
        // the body floods out in ≈ 0.1–0.3 s (bigger = heavier), droplets land up to ~1.3× that later; drips run on
        dur: kind === K_SPECK ? 0.05 : 0.085 + Math.min(0.22, radius * 0.075),
        dripDur: drips ? 1.1 + Math.min(2.2, radius * 1.5) : 0,
        cx: center.x, cy: center.y, cz: center.z,
      };`, `      const g = this._takeSplatGrowth();
      g.entries = entries; entries = null; growth = g;
      g.R = radius; g.team = team; g.seed = seed; g.kind = kind; g.age = 0;
      // the body floods out in ≈ 0.1–0.3 s (bigger = heavier), droplets land up to ~1.3× that later; drips run on
      g.dur = kind === K_SPECK ? 0.05 : 0.085 + Math.min(0.22, radius * 0.075);
      g.dripDur = drips ? 1.1 + Math.min(2.2, radius * 1.5) : 0;
      g.cx = center.x; g.cy = center.y; g.cz = center.z;
      g.paintOwner = this._paintOwnerContext?.owner || null;
      g.paintCreditMode = this._paintOwnerContext?.mode || 0;
      g.paintOrder = this._paintCurrentOrder || 0;`, 'reuse growth record');

  code = replaceOnce(code,
    '      if (opts.instant) this._emitGrowth(g, 3, 1, false);\n      else this.growing.push(g);',
    '      if (opts.instant) { this._emitGrowth(g, 3, 1, false); this._releaseSplatGrowth(g); growth = null; }\n' +
    '      else { this.growing.push(g); growth = null; }',
    'return or retain growth lease');

  const methodStart = code.indexOf('  splat(center, radius, team, opts = {}) {');
  const bodyStart = code.indexOf('    let wall = false;', methodStart);
  const bodyEnd = code.indexOf('    return claimed;\n  }\n\n  // Cosmetic micro-splat', bodyStart);
  if (methodStart < 0 || bodyStart < 0 || bodyEnd < 0) throw new Error('INKWAVE patch conflict (splat pool cleanup): method body anchors missing');
  const body = code.slice(bodyStart, bodyEnd + '    return claimed;'.length)
    .split('\n').map(line => line ? '  ' + line : line).join('\n');
  code = code.slice(0, bodyStart) + `    try {\n${body}\n    } finally {
      if (growth) this._releaseSplatGrowth(growth);
      if (entries) this._releaseSplatEntries(entries);
    }` + code.slice(bodyEnd + '    return claimed;'.length);

  code = replaceOnce(code,
    '        this.growing[i] = this.growing[this.growing.length - 1]; this.growing.pop(); i--;',
    '        this.growing[i] = this.growing[this.growing.length - 1]; this.growing.pop(); this._releaseSplatGrowth(g); i--;',
    'release completed growth');

  code = replaceOnce(code,
    '  dispose() { this.rt.dispose(); this.geo.dispose(); this.mat.dispose(); this.dryMesh.geometry.dispose(); this.dryMesh.material.dispose(); }',
    '  dispose() { this._disposeSplatPools(); this.rt.dispose(); this.geo.dispose(); this.mat.dispose(); this.dryMesh.geometry.dispose(); this.dryMesh.material.dispose(); }',
    'dispose splat pools');

  return code;
}
