// Issue #264 build seam: make the authoritative CPU paint ownership agree with the native GPU
// footprint (rays, satellite droplets, fine spatter, wall drips) without touching inkwave-public/.
//
// Anchored seams keep the native source byte-locked. Geometry, fixed-update ownership, exactly-once
// cell accounting, stale-order handling and lifecycle guards live in ./paint-footprint.mjs.
//
// The stable shape hash replaces the native `sin(n) * 43758.5`: it keeps seed agreement between the
// GLSL and the CPU mirror without amplifying backend sin precision. The tone channel keeps the
// original sin hash through `toneHash`, so the rendered ink tone for a given seed is unchanged.
const IMPORT_LINE = "import { installPaintFootprint } from '../../patches/local-quality/paint-footprint.mjs';\n";

const STABLE_HASH = `float hsh(float n) {
  // Keep geometry seeds reproducible on CPU and GPU without amplifying backend sin precision differences.
  float x = fract(n * 0.1031);
  x *= x + 33.33;
  x *= x + x;
  return fract(x + 0.056);
}
float toneHash(float n) { return fract(sin(n) * 43758.5453123); }`;

export function adaptPaintFootprint(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'paint footprint: ' + label); };

  if (rel === 'patches/splatoon3/runtime/clock.mjs') {
    patch('    game.input.endFrame();',
      '    G.paint.advanceCpuOwnership(step);\n    game.input.endFrame();',
      'fixed ownership simulation tick');
    return code;
  }

  // Carry the actor whose existing call site already credits the immediate body area. Late feature
  // cells use the same route; Splat Slam deliberately keeps its no-special-credit method.
  if (rel === 'src/game/actor.js') {
    patch('      burstArea = G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random() });',
      '      burstArea = G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random(), owner: attacker });',
      'attacker late-area owner');
    patch('this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random() }));',
      'this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random(), owner: this }));',
      'Super Jump landing owner');
    patch('area += G.paint.splat(_v.copy(c).setY(c.y + 0.3), sp.radius * 0.72, this.team, { seed: Math.random() });',
      'area += G.paint.splat(_v.copy(c).setY(c.y + 0.3), sp.radius * 0.72, this.team, { seed: Math.random(), owner: this, ownerMethod: \'addTurfNoSpecial\' });',
      'Splat Slam center owner');
    patch('area += G.paint.splat(_v, 1.1 + Math.random() * 0.6, this.team, { seed: Math.random() });',
      'area += G.paint.splat(_v, 1.1 + Math.random() * 0.6, this.team, { seed: Math.random(), owner: this, ownerMethod: \'addTurfNoSpecial\' });',
      'Splat Slam satellite owner');
    return code;
  }

  if (rel === 'src/game/weapons.js') {
    patch("area += G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'roll', stretch: _fwd });",
      "area += G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'roll', stretch: _fwd, owner: a });",
      'Roller owner');
    patch("a.addTurf(G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'trail' }));",
      "a.addTurf(G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'trail', owner: a }));",
      'Dualies trail owner');
    patch('if (g.hit) area += G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2 });',
      'if (g.hit) area += G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2, owner: a });',
      'Charger line owner');
    patch('area += G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 0.6 });',
      'area += G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 0.6, owner: a });',
      'Charger impact owner');
    patch('let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });',
      'let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random(), owner: b.owner });',
      'bomb center owner');
    patch('area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });',
      'area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random(), owner: b.owner });',
      'bomb satellite owner');
    patch('if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));',
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random(), owner: p.owner }));',
      'projectile trail owner');
    patch('area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25 });',
      'area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25, owner: p.owner });',
      'Slosher owner');
    patch('} else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });',
      '} else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7, owner: p.owner });',
      'projectile impact owner');
    patch('if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));',
      'if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random(), owner: p.owner }));',
      'Blaster burst owner');
    patch('if (g.hit && !c.ghost) c.owner.addTurf(G.paint.splat(_v2.copy(g.point).addScaledVector(g.normal, 0.1), 0.45 + Math.random() * 0.35, c.team, { seed: Math.random() }));',
      'if (g.hit && !c.ghost) c.owner.addTurf(G.paint.splat(_v2.copy(g.point).addScaledVector(g.normal, 0.1), 0.45 + Math.random() * 0.35, c.team, { seed: Math.random(), owner: c.owner }));',
      'Ink Storm owner');
    return code;
  }

  if (rel !== 'src/world/paint.js') return code;

  // 1. Float-stable geometry hash shared with the CPU mirror; the tone hash is preserved as-is.
  patch('float hsh(float n) { return fract(sin(n) * 43758.5453123); }', STABLE_HASH, 'stable shape hash');
  patch('  gl_FragColor = vec4(team, 1.0, hsh(seed * 1.73), a);   // premultiplied by the blend: team share, wet, tone',
    '  gl_FragColor = vec4(team, 1.0, toneHash(seed * 1.73), a);   // premultiplied by the blend: team share, wet, tone',
    'preserved tone hash');

  // 2. One ownership order per non-cosmetic splat; cosmetic specks never claim turf.
  patch('    const cosmetic = !!opts.cosmetic;',
    '    const cosmetic = !!opts.cosmetic;\n    const order = cosmetic ? 0 : this._nextPaintOrder();',
    'paint order');

  // 3. The authoritative body now uses the sub-sampled owned writer.
  patch('        if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);',
    '        if (!cosmetic) claimed += this._cpuSplatOwned(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind, order);',
    'owned body writer');

  // 4. Carry deterministic order and the existing local scoring route on the growing entry.
  patch('        entries, R: radius, team, seed, kind, age: 0,',
    '        entries, R: radius, team, seed, kind, order, owner: opts.owner && !opts.owner.remote ? opts.owner : null, ' +
    "ownerMethod: opts.ownerMethod === 'addTurfNoSpecial' ? 'addTurfNoSpecial' : 'addTurf', age: 0,",
    'growth order and native owner');

  // 5. Install the mirroring methods on the class the native module just defined.
  return IMPORT_LINE + code + '\ninstallPaintFootprint(PaintSystem, { blobWobble });\n';
}
