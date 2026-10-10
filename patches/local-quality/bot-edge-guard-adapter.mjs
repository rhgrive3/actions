// BotBrain._edgeGuard ran two Level.groundHeight() probes (spatial-hash broadphase + containment) for every moving grounded
// bot on every 60 Hz tick, even when the previous probe was safely inland and the bot had hardly moved. An all-clear probe is
// now reused for a short window while the bot has moved little, kept its heading and not sped up (the lookahead is
// speed-dependent). Anything unsafe is never cached, so the full per-tick response near an edge is unchanged; landing,
// respawn, teleport (displacement) and abrupt steering (heading) all invalidate. Reuse limits are project values, not S3 figures.
export function adaptBotEdgeGuard(rel, code, once) {
  if (rel !== 'src/game/bots.js') return code;
  code = once(code,
    'const _stats = { own: 0, enemy: 0, empty: 0, n: 0 };\n',
    'const _stats = { own: 0, enemy: 0, empty: 0, n: 0 };\n' +
    '// _edgeGuard all-clear reuse: seconds, metres moved, heading cosine (~5.7 deg), metres of ground height change, lookahead growth.\n' +
    'const EDGE_REUSE = { age: 0.1, dist: 0.3, cos: 0.995, dy: 0.25, look: 0.12 };\n' +
    'const edgeClearReusable = (c, now, px, py, pz, dx, dz, look, path, pi) => {\n' +
    '  if (!c.ok || c.path !== path || c.pi !== pi) return false;\n' +
    '  const age = now - c.t;\n' +
    '  if (!(age >= 0 && age < EDGE_REUSE.age)) return false;\n' +
    '  const ex = px - c.x, ez = pz - c.z;\n' +
    '  if (ex * ex + ez * ez > EDGE_REUSE.dist * EDGE_REUSE.dist || Math.abs(py - c.y) > EDGE_REUSE.dy) return false;\n' +
    '  return dx * c.dx + dz * c.dz >= EDGE_REUSE.cos && look <= c.look + EDGE_REUSE.look;\n' +
    '};\n',
    'bot edge guard reuse helper');
  code = once(code,
    '    const px = a.pos.x, py = a.pos.y, pz = a.pos.z;\n    const bad = (ux, uz) =>',
    '    const px = a.pos.x, py = a.pos.y, pz = a.pos.z;\n' +
    '    const clear = this._edgeClear || (this._edgeClear = { ok: false, t: 0, x: 0, y: 0, z: 0, dx: 0, dz: 0, look: 0, path: null, pi: -1 });   // one per bot\n' +
    '    if (edgeClearReusable(clear, this.t, px, py, pz, dx, dz, look, this.path, this.pi)) return;\n' +
    '    const bad = (ux, uz) =>',
    'bot edge guard reuse');
  code = once(code,
    '    if (!bad(dx, dz)) return;\n',
    '    if (!bad(dx, dz)) { clear.ok = true; clear.t = this.t; clear.x = px; clear.y = py; clear.z = pz; clear.dx = dx; clear.dz = dz; clear.look = look; clear.path = this.path; clear.pi = this.pi; return; }\n' +
    '    clear.ok = false;\n',
    'bot edge guard remember');
  code = once(code,
    '    if (this.mvMag > 0.05 && a.grounded) this._edgeGuard(a, it.move);\n',
    '    if (this.mvMag > 0.05 && a.grounded) this._edgeGuard(a, it.move);\n' +
    '    else if (this._edgeClear) this._edgeClear.ok = false;   // airborne / stopped: the next landing probes afresh\n',
    'bot edge guard airborne invalidation');
  return once(code,
    '    this.retreatT = 0; this._firing = false;\n  }',
    '    this.retreatT = 0; this._firing = false;\n    if (this._edgeClear) this._edgeClear.ok = false;   // respawn / reset\n  }',
    'bot edge guard reset');
}
