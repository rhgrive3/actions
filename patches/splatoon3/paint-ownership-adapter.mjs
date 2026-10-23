import { PAINT_SHAPE_HASH_GLSL } from './runtime/paint-ownership.mjs';

// PR1188: the GPU body edge is the zero crossing of the body SDF
// (r * grow * wob with grow = 1 once grown; AA alpha 0.5 there). The native
// CPU scorer stopped at 0.97 of that edge, leaving a ring of visible,
// unowned ink (WebGL2 probe: 1,864 of 32,313 body cells). Own exactly the
// cells whose centre lies inside the rendered body.
export function adaptPaintBodyEdge(rel, code, replaceOnce) {
  if (rel !== 'src/world/paint.js') return code;
  return replaceOnce(code,
    '          if (d / (r * blobWobble(Math.atan2(py, px), seed)) > 0.97) continue;',
    '          if (d / (r * blobWobble(Math.atan2(py, px), seed)) > 1) continue; // PR1188: GPU body zero crossing',
    'CPU body ownership edge equals the rendered body edge');
}

export function adaptPaintOwnership(rel, code, replaceOnce) {
  if (rel === 'src/world/paint.js') {
    code = "import { notePaintMutation } from '../../patches/splatoon3/runtime/scoring.mjs';\nimport { paintShapeSeed } from '../../patches/splatoon3/runtime/paint-ownership.mjs';\n" + code;
    code = replaceOnce(code,
      'float hsh(float n) { return fract(sin(n) * 43758.5453123); }',
      'float hsh(float n) { return fract(sin(n) * 43758.5453123); }\n' + PAINT_SHAPE_HASH_GLSL,
      'shared exact ancillary shape hash (native tone preserved)');
    code = replaceOnce(code,
      '  float R = vSplat.x, team = vSplat.y, seed = vSplat.z;',
      '  float R = vSplat.x, team = vSplat.y, seed = vSplat.z;\n  float paintSeed = floor(vGrow.w + 0.5);',
      'ancillary shader consumes the CPU packed seed word');
    const streams = [[7.31, 1.93], [3.17, 5.71], [11.3, 2.39], [13.1, 7.7], [5.3, 3.1], [9.9, 1.7],
      [17.9, 4.13], [2.71, 8.09], [6.47, 3.37], [3.7, 11.3], [8.1, 2.9], [4.3, 5.9]];
    for (let stream = 0; stream < streams.length; stream++) {
      const [seedScale, indexScale] = streams[stream];
      code = replaceOnce(code, `hsh(seed * ${seedScale} + fk * ${indexScale})`,
        `paintShapeHash(paintSeed, ${stream}.0, fk)`, `ancillary hash stream ${stream}`);
    }
    code = replaceOnce(code, 'this.aGrow[vi * 4 + 3] = 0;',
      'this.aGrow[vi * 4 + 3] = paintShapeSeed(seed);', 'pack deterministic ancillary seed on every paint vertex');
    code = replaceOnce(code,
      '          if (dx * dx + dy * dy + dz * dz < rs * rs) { this._emitGrowth(g, 3, 1, false); this.growing.splice(i, 1); this._releaseSplatGrowth(g); }',
      '          if (dx * dx + dy * dy + dz * dz < rs * rs) { this._finishSplatOwnership(g); this._emitGrowth(g, 3, 1, false); this.growing.splice(i, 1); this._releaseSplatGrowth(g); }',
      'finish opposing paint ownership before newer paint');
    code = replaceOnce(code,
      '      if (opts.instant) { this._emitGrowth(g, 3, 1, false); this._releaseSplatGrowth(g); growth = null; }',
      '      if (opts.instant) { this._finishSplatOwnership(g); this._emitGrowth(g, 3, 1, false); this._releaseSplatGrowth(g); growth = null; }',
      'finish instant paint ownership');
    code = replaceOnce(code,
      '        this._emitGrowth(g, 3, 1, !!g.dripDur);\n        this.growing[i] = this.growing[this.growing.length - 1]; this.growing.pop(); this._releaseSplatGrowth(g); i--;',
      '        this._finishSplatOwnership(g);\n        this._emitGrowth(g, 3, 1, !!g.dripDur);\n        this.growing[i] = this.growing[this.growing.length - 1]; this.growing.pop(); this._releaseSplatGrowth(g); i--;',
      'finish completed paint ownership');
    code = replaceOnce(code,
      '      this._emitGrowth(g, Math.min(tn, 3), dT, bodyDone);',
      '      this._advanceSplatOwnership(g, Math.min(tn, 3), dT);\n      this._emitGrowth(g, Math.min(tn, 3), dT, bodyDone);',
      'advance ownership at the native growth phase');

    code = replaceOnce(code,
      '        const k = f.grid + j * f.nu + i;\n        const prev = this.grid[k];\n        if (prev === val) continue;\n        this.grid[k] = val;',
      '        const k = f.grid + j * f.nu + i;\n' +
      '        const prev = this.grid[k];\n' +
      '        if (!this._paintClaimPreparedCell(k, val, orderId || this._paintCurrentOrder, orderState)) continue;\n' +
      '        if (prev === val) continue;\n' +
      '        this.grid[k] = val;',
      'preserve newest paint ownership order');
    code = replaceOnce(code,
      '    r.setRenderTarget(this.rt);\n    r.setClearColor(0x000000, 0);\n    r.clear(true, false, false);\n    r.setRenderTarget(prev);\n    r.setClearColor(cc, ca);',
      '    try { r.setRenderTarget(this.rt);r.setClearColor(0x000000, 0);r.clear(true, false, false); }\n    finally { try { r.setRenderTarget(prev); } finally { r.setClearColor(cc, ca); } }\n    this._paintRenderError=null;',
      'paint atlas clear restores renderer even after failure');
    code = replaceOnce(code,
      '    r.autoClear = false;\n    r.setRenderTarget(this.rt);\n    r.render(this.scene, this.cam);\n    r.setRenderTarget(prev);\n    r.autoClear = ac;',
      '    if(this._paintRenderError)throw this._paintRenderError;\n    try { r.autoClear=false;r.setRenderTarget(this.rt);r.render(this.scene,this.cam); }\n    catch(error){this._paintRenderError=error;throw error;}\n    finally { try { r.setRenderTarget(prev); } finally { r.autoClear=ac; } }',
      'paint atlas draw restores target and fails closed before retrying a partial pass');
    code = replaceOnce(code,
      '      const dT = 1 - Math.pow(1 - td, 2.2);',
      '      const dT = g.dripDur ? 1 - Math.pow(1 - td, 2.2) : 1;',
      'non-dripping growth has exact constant phase');
    code = replaceOnce(code,
      '        if (lvl.pointInside(p, 0, f.block)) this.dead[k] = 1;',
      '        if (lvl.pointInsideGrid ? lvl.pointInsideGrid(p, f.block) : lvl.pointInside(p, 0, f.block)) this.dead[k] = 1;',
      'legacy grid reuses a single hash bucket with canonical fallback');
    code = replaceOnce(code, '    if (changed) this.version++;',
      '    if (changed) notePaintMutation(this, claimed > 0);', 'turf-specific coverage invalidation');
    // Only the canonical body loop is batched. Ancillary sparse visitors retain
    // their exact per-cell notifications, including rejected/dead exclusions.
    const bodyStart = code.indexOf('  _cpuSplat('), bodyEnd = code.indexOf('\n  _pushQuad(', bodyStart);
    let body = code.slice(bodyStart, bodyEnd);
    body = replaceOnce(body, '    for (let j = j0; j <= j1; j++) {',
      '    for (let j = j0; j <= j1; j++) {\n      let dirtyMin = Infinity, dirtyMax = -Infinity, dirtyCount = 0;', 'body dirty row accumulator');
    body = replaceOnce(body, '        if (this._inkMark) this._inkMark(f, i, j);   // #895 map-space dirty bounds for the live minimap',
      '        if (this._inkMarkRow) { if (f.turf && !this.dead[k]) { dirtyMin = Math.min(dirtyMin, i); dirtyMax = Math.max(dirtyMax, i); dirtyCount++; } } else if (this._inkMark) this._inkMark(f, i, j);', 'body dirty row accepted cells');
    body = replaceOnce(body, '      }\n    }\n    if (changed)',
      '      }\n      if (dirtyCount && this._inkMarkRow) this._inkMarkRow(f, dirtyMin, dirtyMax, j, dirtyCount);\n    }\n    if (changed)', 'body dirty row flush');
    code = code.slice(0, bodyStart) + body + code.slice(bodyEnd);
    code = adaptPaintBodyEdge(rel, code, replaceOnce);
    code = replaceOnce(code,
      '  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind) {',
      '  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind, orderId = 0, orderState = null) {\n    this._preparePaintOwnership();',
      'canonical paint ownership receives network order');
  }

  if (rel === 'src/game/weapons.js') {
    code=replaceOnce(code,'for (let i = 1; i < pos.count; i++) {','for (let i = 1; i < n; i++) {','native sub preview only accumulates visible line distances');
    code=replaceOnce(code,'new THREE.Color(0.6, 0.6, 0.6);','(this._arcLowInkColor ||= new THREE.Color(0.6, 0.6, 0.6));','reuse native sub preview low-ink colour');

    code = "import { projectileBurstPaintSeed } from '../../patches/splatoon3/runtime/paint-ownership.mjs';\n" + code;
    const edits = [
      ["seed: Math.random(), kind: 'roll', stretch: _fwd });", "seed: Math.random(), kind: 'roll', stretch: _fwd, claimOwner: a });", 'roller body ownership credit'],
      ["kind: 'trail' }));", "kind: 'trail', claimOwner: a }));", 'dualies trail ownership credit'],
      ['stretchAmt: 1.2 });', 'stretchAmt: 1.2, claimOwner: a });', 'charger line ownership credit'],
      ['stretchAmt: 0.6 });', 'stretchAmt: 0.6, claimOwner: a });', 'charger impact ownership credit'],
      ['s.paintRadius, b.team, { seed: Math.random() });', 's.paintRadius, b.team, { seed: Math.random(), claimOwner: b.owner });', 'bomb core ownership credit'],
      ['0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });', '0.7 + Math.random() * 0.5, b.team, { seed: Math.random(), claimOwner: b.owner });', 'bomb satellite ownership credit'],
      ["rollerTrailAgeWidth(p, fidelityFlightPaintRadius(p)), p.team, { seed: Math.random() }));", "rollerTrailAgeWidth(p, fidelityFlightPaintRadius(p)), p.team, { seed: Math.random(), claimOwner: p.owner }));", 'projectile trail ownership credit'],
      ['stretchAmt: paint?.stretchAmt ?? 1.25 });', 'stretchAmt: paint?.stretchAmt ?? 1.25, claimOwner: p.owner });', 'slosher impact ownership credit'],
      ['stretchAmt: 0.7 });', "stretchAmt: 0.7, claimOwner: p.owner, claimMode: (p.s3SpecialWeapon || p.s3PaintNoSpecial) ? 'no-special' : undefined });", 'projectile impact ownership credit'],
      ['w.impactRadius, p.team, { seed: Math.random() }', "w.impactRadius, p.team, { seed: projectileBurstPaintSeed(p, Math.random()), claimOwner: p.owner, claimMode: (p.s3SpecialWeapon || p.s3PaintNoSpecial) ? 'no-special' : undefined }", 'blaster burst ownership credit'],
      ["c.team, { seed: Math.random() }));", "c.team, { seed: Math.random(), claimOwner: c.owner }));", 'special rain ownership credit'],
    ];
    for (const [before, after, label] of edits) {
      if ((label === 'charger line ownership credit' || label === 'charger impact ownership credit') &&
          code.includes("footprint: 'ink-charger'")) {
        // Modern charger stamps already carry claimOwner and the source profile;
        // retaining the obsolete 1.2/0.6 literal anchors would reject the build.
        continue;
      }
      code = replaceOnce(code, before, after, label);
    }
    code = replaceOnce(code,
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius',
      "if (g.hit) p.owner[(p.s3SpecialWeapon || p.s3PaintNoSpecial) ? 'addTurfNoSpecial' : 'addTurf'](G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius",
      'special projectile burst cannot charge its own special gauge');
    code = replaceOnce(code,
      'if (area != null) p.owner.addTurf(area);',
      "if (area != null) p.owner[(p.s3SpecialWeapon || p.s3PaintNoSpecial) ? 'addTurfNoSpecial' : 'addTurf'](area);",
      'special projectile terrain impact preserves no-special credit');
  }

  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code,
      "attacker.addTurf(G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random() }));",
      "G.paint._paintNextOwner = attacker;\n      attacker.addTurf(G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random() }));",
      'splat attacker ownership credit');
    code = replaceOnce(code,
      "area += G.paint.splat(_v.copy(c).setY(c.y + 0.3), sp.radius * 0.72, this.team, { seed: Math.random() });",
      "area += G.paint.splat(_v.copy(c).setY(c.y + 0.3), sp.radius * 0.72, this.team, { seed: Math.random(), claimOwner: this, claimMode: 'no-special' });",
      'Splat Slam body ownership credit');
    code = replaceOnce(code,
      'area += G.paint.splat(_v, 1.1 + Math.random() * 0.6, this.team, { seed: Math.random() });',
      "area += G.paint.splat(_v, 1.1 + Math.random() * 0.6, this.team, { seed: Math.random(), claimOwner: this, claimMode: 'no-special' });",
      'Splat Slam ring ownership credit');
  }
  return code;
}
