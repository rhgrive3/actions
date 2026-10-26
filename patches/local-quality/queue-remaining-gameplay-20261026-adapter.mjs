// Final source transforms for the remaining Library gameplay queue.
// Keep the pinned upstream inputs intact and reject moved/ambiguous anchors.
const MARKER = '// Remaining gameplay queue 20261026\n';
const CHANGES = [
  ['src/game/weapons.js',
    'export class Projectiles {',
    'const REMAINING_SLOSH_COS = Math.cos(0.32), REMAINING_SLOSH_TAN = Math.tan(0.32);\nexport class Projectiles {',
    'initialize constant legacy Slosher lob trigonometry'],
  ['src/game/weapons.js',
    '    const den = 2 * Math.cos(T0) * Math.cos(T0) * (hd * Math.tan(T0) - dy);',
    '    const den = 2 * REMAINING_SLOSH_COS * REMAINING_SLOSH_COS * (hd * REMAINING_SLOSH_TAN - dy);',
    'reuse constant legacy Slosher lob trigonometry in original arithmetic order'],
  ['src/game/player.js',
    '      const d = _v.length();\n      if (d > maxR + 4 || d < 0.5) continue;\n      if (a.pos.distanceTo(e.pos) > maxR) continue;',
    '      const outer = maxR + 4;\n      if (Number.isFinite(_v.x + _v.y + _v.z) && (Math.abs(_v.x) > outer || Math.abs(_v.y) > outer || Math.abs(_v.z) > outer)) continue;\n      const d = _v.length();\n      if (d > outer || d < 0.5) continue;\n      if (a.pos.distanceTo(e.pos) > maxR) continue;',
    'prune finite distant aim assist candidates without changing boundary distance'],
  ['src/game/weapons.js',
    '    this.beams.push({ mesh, t: 0, life: bu.uLife.value, th });',
    '    const beamRecord=mesh.userData._iwBeamRecord||=( {mesh,t:0,life:0,th:0} );\n    beamRecord.t=0;beamRecord.life=bu.uLife.value;beamRecord.th=th;this.beams.push(beamRecord);',
    'restore beam records owned by the existing mesh pool', 2],
  ['src/game/weapons.js',
    '    dir.addScaledVector(_v2, Math.cos(t) * Math.tan(r)).addScaledVector(_v3, Math.sin(t) * Math.tan(r) * 0.55).normalize();',
    '    const tanR = Math.tan(r);\n    dir.addScaledVector(_v2, Math.cos(t) * tanR).addScaledVector(_v3, Math.sin(t) * tanR * 0.55).normalize();',
    'reuse spread tangent'],
  ['src/game/bots.js',
    "      const swimming = e.anim.form === 'swim';\n      const hs = Math.hypot(e.vel.x, e.vel.z);\n      if (swimming && d > 3 && !(hs > 7 && d < 9)) continue;",
    "      const swimming = e.anim.form === 'swim';\n      if (swimming && d > 3 && !(d < 9 && Math.hypot(e.vel.x, e.vel.z) > 7)) continue;",
    'defer swimmer speed until perception needs it'],
  ['src/game/bots.js',
    'if (g && Math.abs(g.y - n.y) < 1.2 && Math.hypot(g.x - n.x, g.z - n.z) < 7) score -= 4;',
    'if (g && Math.abs(g.y - n.y) < 1.2 && Math.abs(g.x - n.x) < 7 && Math.abs(g.z - n.z) < 7 && Math.hypot(g.x - n.x, g.z - n.z) < 7) score -= 4;',
    'prune distant paint goals before exact crowding radius'],
  ['src/game/bots.js',
    'if (Math.hypot(g.x - n.x, g.z - n.z) < 4) s -= 2.5;',
    'if (Math.abs(g.x - n.x) < 4 && Math.abs(g.z - n.z) < 4 && Math.hypot(g.x - n.x, g.z - n.z) < 4) s -= 2.5;',
    'prune distant combat goals before exact crowding radius'],
  ['src/game/weapons.js',
    '    const chargerDrawStart = n;\n    _q.setFromUnitVectors(ZAX, DOWN);',
    '    const chargerDrawStart = n;\n    if (this.chargerDrops.length && n < MAX_BLOBS) _q.setFromUnitVectors(ZAX, DOWN);',
    'skip charger orientation when no bead can be drawn'],
  ['src/game/inkFlight.js',
    '  const h = Math.hypot(dir.x, dir.z);\n  if (distance < 1.5 || distance > maxDistance || h < EPS) return false;',
    '  if (distance < 1.5 || distance > maxDistance) return false;\n  const h = Math.hypot(dir.x, dir.z);\n  if (h < EPS) return false;',
    'defer aim heading until within convergence range'],
  ['src/game/weapons.js',
    '      let vis = p.catalogVisual ? p.vis * g * (1 + 0.3 * Math.sin(g * Math.PI)) : p.fidelitySloshDraw ? fidelitySlosherDrawRadius(p) : (p.vis || p.size) * g * (1 + 0.3 * Math.sin(g * Math.PI));',
    '      const growthPulse = !p.catalogVisual && p.fidelitySloshDraw ? 1 : g === 1 ? 1 : 1 + 0.3 * Math.sin(g * Math.PI);\n      let vis = p.catalogVisual ? p.vis * g * growthPulse : p.fidelitySloshDraw ? fidelitySlosherDrawRadius(p) : (p.vis || p.size) * g * growthPulse;',
    'saturated projectile growth'],
  ['src/game/weapons.js',
    '      const trav = p.start.distanceTo(p.pos);\n      if (Math.abs(_dir.y) < 0.95) _v2.set(-_dir.z, 0, _dir.x).normalize(); else _v2.set(1, 0, 0);\n      _v3.crossVectors(_dir, _v2);\n      const r0 = p.fidelitySloshDraw ? fidelitySlosherDrawRadius(p) : p.vis || p.size, spk = 0.55 + 0.45 * Math.min(1, sp / 25), fade = 1 - 0.45 * Math.min(1, p.age / p.life);',
    '      const trav = p.start.distanceTo(p.pos);\n      const r0 = p.fidelitySloshDraw ? fidelitySlosherDrawRadius(p) : p.vis || p.size, spk = 0.55 + 0.45 * Math.min(1, sp / 25);\n      if (trav < r0 * (tail + 1.15) * spk + r0 * 1.6) continue;\n      if (Math.abs(_dir.y) < 0.95) _v2.set(-_dir.z, 0, _dir.x).normalize(); else _v2.set(1, 0, 0);\n      _v3.crossVectors(_dir, _v2);\n      const fade = 1 - 0.45 * Math.min(1, p.age / p.life);',
    'skip invisible near-muzzle satellite basis'],
  ['src/fx/fx.js',
    '    const px = pos.x + _v3.x * 0.04, py = pos.y + _v3.y * 0.04, pz = pos.z + _v3.z * 0.04;\n    const coneCos = Math.cos(Math.max(0.05, spread) * Math.PI * 0.5);\n    for (let i = 0; i < count; i++) {\n      coneDir(_v3, Math.max(0.05, spread) * Math.PI * 0.5, _v1, coneCos);',
    '    const px = pos.x + _v3.x * 0.04, py = pos.y + _v3.y * 0.04, pz = pos.z + _v3.z * 0.04;\n    const cosMax = Math.cos(Math.max(0.05, spread) * Math.PI * 0.5);\n    let basisReady = false, nx, ny, nz, tx, ty, tz, bx, by, bz;\n    for (let i = 0; i < count; i++) {\n      const z = 1 - rand() * (1 - cosMax), r = Math.sqrt(Math.max(0, 1 - z * z)), phi = rand() * TAU;\n      if (!basisReady || !Object.is(nx, _v3.x) || !Object.is(ny, _v3.y) || !Object.is(nz, _v3.z)) {\n        basis(_v3, _tA, _tB);\n        nx = _v3.x; ny = _v3.y; nz = _v3.z;\n        tx = _tA.x; ty = _tA.y; tz = _tA.z; bx = _tB.x; by = _tB.y; bz = _tB.z; basisReady = true;\n      }\n      const rt = r * Math.cos(phi), rb = r * Math.sin(phi);\n      _v1.copy(_v3).multiplyScalar(z);\n      _v1.x += tx * rt; _v1.y += ty * rt; _v1.z += tz * rt;\n      _v1.x += bx * rb; _v1.y += by * rb; _v1.z += bz * rb;',
    'reuse burst cone basis without exposing shared tangent scratch'],
];

export function adaptRemainingGameplay20261026(rel, code) {
  if (code.includes(MARKER)) return code;
  let changed = false;
  for (const [file, before, after, label, expected = 1] of CHANGES) {
    if (file !== rel) continue;
    const count = code.split(before).length - 1;
    if (count !== expected) throw new Error(`Remaining gameplay ${label}: ${rel}: expected ${expected} anchor(s), got ${count}`);
    code = code.replaceAll(before, after); changed = true;
  }
  return changed ? MARKER + code : code;
}
