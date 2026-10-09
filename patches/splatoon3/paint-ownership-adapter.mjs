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
    code = "import { paintShapeSeed } from '../../patches/splatoon3/runtime/paint-ownership.mjs';\n" + code;
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
      '      this._advanceSplatOwnership(g);\n      this._emitGrowth(g, Math.min(tn, 3), dT, bodyDone);',
      'advance ownership at the native growth phase');

    code = replaceOnce(code,
      '        const k = f.grid + j * f.nu + i;\n        const prev = this.grid[k];\n        if (prev === val) continue;\n        this.grid[k] = val;',
      '        const k = f.grid + j * f.nu + i;\n' +
      '        const prev = this.grid[k];\n' +
      '        if (!this._paintClaimCell(k, val, orderId || this._paintCurrentOrder, orderState)) continue;\n' +
      '        if (prev === val) continue;\n' +
      '        this.grid[k] = val;',
      'preserve newest paint ownership order');
    code = adaptPaintBodyEdge(rel, code, replaceOnce);
    code = replaceOnce(code,
      '  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind) {',
      '  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind, orderId = 0, orderState = null) {',
      'canonical paint ownership receives network order');
  }

  if (rel === 'src/game/weapons.js') {
    const edits = [
      ["seed: Math.random(), kind: 'roll', stretch: _fwd });", "seed: Math.random(), kind: 'roll', stretch: _fwd, claimOwner: a });", 'roller body ownership credit'],
      ["kind: 'trail' }));", "kind: 'trail', claimOwner: a }));", 'dualies trail ownership credit'],
      ['stretchAmt: 1.2 });', 'stretchAmt: 1.2, claimOwner: a });', 'charger line ownership credit'],
      ['stretchAmt: 0.6 });', 'stretchAmt: 0.6, claimOwner: a });', 'charger impact ownership credit'],
      ['s.paintRadius, b.team, { seed: Math.random() });', 's.paintRadius, b.team, { seed: Math.random(), claimOwner: b.owner });', 'bomb core ownership credit'],
      ['0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });', '0.7 + Math.random() * 0.5, b.team, { seed: Math.random(), claimOwner: b.owner });', 'bomb satellite ownership credit'],
      ["rollerTrailAgeWidth(p, fidelityFlightPaintRadius(p)), p.team, { seed: Math.random() }));", "rollerTrailAgeWidth(p, fidelityFlightPaintRadius(p)), p.team, { seed: Math.random(), claimOwner: p.owner }));", 'projectile trail ownership credit'],
      ['stretchAmt: paint?.stretchAmt ?? 1.25 });', 'stretchAmt: paint?.stretchAmt ?? 1.25, claimOwner: p.owner });', 'slosher impact ownership credit'],
      ['stretchAmt: 0.7 });', 'stretchAmt: 0.7, claimOwner: p.owner });', 'projectile impact ownership credit'],
      ['w.impactRadius, p.team, { seed: Math.random() }', 'w.impactRadius, p.team, { seed: Math.random(), claimOwner: p.owner }', 'blaster burst ownership credit'],
      ["c.team, { seed: Math.random() }));", "c.team, { seed: Math.random(), claimOwner: c.owner }));", 'special rain ownership credit'],
    ];
    for (const [before, after, label] of edits) code = replaceOnce(code, before, after, label);
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
