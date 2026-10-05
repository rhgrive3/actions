// Authoritative paint events (#522):
// Binds minimal owner/action provenance at network recording boundary,
// and enforces strict admission at event playback boundary.
// Rejects malformed, duplicate, stale, and ownership-mismatched paint events.
// Preserves legitimate emitters (projectiles, bombs, storm, actor deathburst,
// spawn, and host-owned boss paint).

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE quality patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptPaintAuthority(rel, code) {
  if (rel === 'src/net/netmatch.js') {
    // 1. Thread provenance and monotonic sequence number in recSplat
    const recSplatBefore =
      '  recSplat(c, radius, team, o) {\n' +
      '    if (this.applying || this.mute > 0 || o.cosmetic) return;\n' +
      '    const st = o.stretch;\n' +
      "    this._rec(['s', r2(c.x), r2(c.y), r2(c.z), r2(radius), team, r3(o.seed ?? Math.random()), o.kind ?? 0,\n" +
      '      st ? r3(st.x) : 0, st ? r3(st.y) : 0, st ? r3(st.z) : 0, st ? r2(o.stretchAmt ?? 1) : 0]);\n' +
      '  }';

    const recSplatAfter =
      '  recSplat(c, radius, team, o) {\n' +
      '    if (this.applying || this.mute > 0 || o.cosmetic) return;\n' +
      '    let nid = o.actor?.nid !== undefined ? o.actor.nid : (o.owner?.nid !== undefined ? o.owner.nid : (o.nid !== undefined ? o.nid : (o.isHost ? -1 : undefined)));\n' +
      '    if (nid === undefined) return;\n' +
      '    const seq = ++(this._paintSeq || (this._paintSeq = 0));\n' +
      '    const st = o.stretch;\n' +
      "    this._rec(['s', r2(c.x), r2(c.y), r2(c.z), r2(radius), team, r3(o.seed ?? Math.random()), o.kind ?? 0,\n" +
      '      st ? r3(st.x) : 0, st ? r3(st.y) : 0, st ? r3(st.z) : 0, st ? r2(o.stretchAmt ?? 1) : 0, nid, seq]);\n' +
      '  }';

    code = replaceOnce(code, recSplatBefore, recSplatAfter, 'netmatch recSplat provenance');

    // 2. Authoritative admission at network playback boundary in _play
    const playSplatBefore =
      "      case 's': {\n" +
      '        this.applying = true;\n' +
      '        const st = e[9] || e[10] || e[11] ? _v2.set(e[9], e[10], e[11]) : undefined;\n' +
      '        const opts = { seed: e[7] };\n' +
      '        if (e[8]) opts.kind = e[8];\n' +
      '        if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }\n' +
      '        G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);\n' +
      '        this.applying = false;\n' +
      '        break;\n' +
      '      }';

    const playSplatAfter =
      "      case 's': {\n" +
      '        // Authoritative paint admission (#522):\n' +
      '        // 1. Structural / malformed check\n' +
      '        if (!Number.isFinite(e[2]) || !Number.isFinite(e[3]) || !Number.isFinite(e[4]) ||\n' +
      '            !Number.isFinite(e[5]) || e[5] <= 0 || (e[6] !== 0 && e[6] !== 1)) break;\n' +
      '        const nid = e[13];\n' +
      '        const seq = e[14];\n' +
      '        if (!Number.isInteger(nid) || !Number.isInteger(seq) || seq <= 0) break;\n' +
      '\n' +
      '        // 2. Duplicate / stale sequence check per peer\n' +
      '        const peer = this.peers.get(from);\n' +
      '        if (!peer) break;\n' +
      '        if (seq <= (peer._lastPaintSeq ?? 0)) break;\n' +
      '\n' +
      '        // 3. Ownership provenance check\n' +
      '        if (nid === -1) {\n' +
      '          // Host-authoritative boss/hazard paint: only accepted from host\n' +
      '          if (from !== this.s.hostId) break;\n' +
      '        } else {\n' +
      '          // Actor-authoritative paint: sender must currently own referenced actor\n' +
      '          const a = this.byNid.get(nid);\n' +
      '          if (!a || a.owner !== from) break;\n' +
      '        }\n' +
      '\n' +
      '        peer._lastPaintSeq = seq;\n' +
      '        this.applying = true;\n' +
      '        const st = e[9] || e[10] || e[11] ? _v2.set(e[9], e[10], e[11]) : undefined;\n' +
      '        const opts = { seed: e[7] };\n' +
      '        if (e[8]) opts.kind = e[8];\n' +
      '        if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }\n' +
      '        G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);\n' +
      '        this.applying = false;\n' +
      '        break;\n' +
      '      }';

    code = replaceOnce(code, playSplatBefore, playSplatAfter, 'netmatch play splat admission');
    return code;
  }

  if (rel === 'src/game/weapons.js') {
    // 1. Bomb explosion paint: pass actor: b.owner
    code = replaceOnce(code,
      'let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });',
      'let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random(), actor: b.owner });',
      'weapons bomb explode core paint');

    code = replaceOnce(code,
      'area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });',
      'area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random(), actor: b.owner });',
      'weapons bomb explode spread paint');

    // 2. Projectile trail paint: pass actor: p.owner
    code = replaceOnce(code,
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));',
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random(), actor: p.owner }));',
      'weapons projectile trail paint');

    // 3. Projectile impact paint: pass actor: p.owner
    code = replaceOnce(code,
      'area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25 });',
      'area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25, actor: p.owner });',
      'weapons slosh impact paint');

    code = replaceOnce(code,
      'else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });',
      'else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7, actor: p.owner });',
      'weapons shot impact paint');

    // 4. Blaster burst paint: pass actor: p.owner
    code = replaceOnce(code,
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));',
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random(), actor: p.owner }));',
      'weapons blaster burst paint');

    // 5. Charger line and impact paint: pass actor: a
    code = replaceOnce(code,
      'if (g.hit) area += G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2 });',
      'if (g.hit) area += G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2, actor: a });',
      'weapons charger line paint');

    code = replaceOnce(code,
      'area += G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 0.6 });',
      'area += G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 0.6, actor: a });',
      'weapons charger impact paint');

    return code;
  }

  if (rel === 'src/game/actor.js') {
    // 1. Victim-owner deathburst: pass actor: this (victim owner paints attacker's ink)
    code = replaceOnce(code,
      'attacker.addTurf(G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random() }));',
      'attacker.addTurf(G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random(), actor: this }));',
      'actor deathburst paint');

    // 2. Super Jump landing: pass actor: this
    code = replaceOnce(code,
      'this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random() }));',
      'this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random(), actor: this }));',
      'actor superjump landing paint');

    // 3. Special slam impact: pass actor: this
    code = replaceOnce(code,
      'area += G.paint.splat(_v.copy(c).setY(c.y + 0.3), sp.radius * 0.72, this.team, { seed: Math.random() });',
      'area += G.paint.splat(_v.copy(c).setY(c.y + 0.3), sp.radius * 0.72, this.team, { seed: Math.random(), actor: this });',
      'actor special slam center paint');

    code = replaceOnce(code,
      'area += G.paint.splat(_v, 1.1 + Math.random() * 0.6, this.team, { seed: Math.random() });',
      'area += G.paint.splat(_v, 1.1 + Math.random() * 0.6, this.team, { seed: Math.random(), actor: this });',
      'actor special slam ring paint');

    return code;
  }

  if (rel === 'src/boss/boss.js') {
    // Boss crablet burst: pass isHost: true
    code = replaceOnce(code,
      'if (g > -5 && !this.nav.inPad(x, z, 0.3)) G.paint?.splat(_v.set(x, g + 0.1, z), killed ? 1.3 : 1.7, killed ? 0 : 1, { seed: Math.random() });',
      'if (g > -5 && !this.nav.inPad(x, z, 0.3)) G.paint?.splat(_v.set(x, g + 0.1, z), killed ? 1.3 : 1.7, killed ? 0 : 1, { seed: Math.random(), isHost: true });',
      'boss crablet burst host paint');
    return code;
  }

  if (rel === 'src/boss/bossHazards.js') {
    // Boss hazards: pass isHost: true
    code = replaceOnce(code,
      'P.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.08), r, 1, { seed: Math.random() });',
      'P.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.08), r, 1, { seed: Math.random(), isHost: true });',
      'boss hazards ground paint');
    return code;
  }

  return code;
}
