export function adaptPaintOwnership(rel, code, replaceOnce) {
  if (rel === 'src/world/paint.js') {
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
      ["p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));", "p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random(), claimOwner: p.owner }));", 'projectile trail ownership credit'],
      ['stretchAmt: 1.25 });', 'stretchAmt: 1.25, claimOwner: p.owner });', 'slosher impact ownership credit'],
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
