// #1178/#1179: validate untrusted owner snapshots and boss-hit packets only in the
// disposable composed build. Never modify the locked inkwave-public mirror.
function once(code, before, after, label) {
  const i = code.indexOf(before);
  if (i < 0 || code.indexOf(before, i + before.length) >= 0)
    throw Error('INKWAVE security adapter anchor mismatch: ' + label);
  return code.slice(0, i) + after + code.slice(i + before.length);
}

export function adaptWireSecurity(rel, code) {
  if (rel === 'src/boss/boss.js') {
    code = once(code,
      'if (!attacker || attacker.remote || dmg <= 0 || this.dead) return;',
      'if (!attacker || attacker.remote || !Number.isFinite(dmg) || dmg <= 0 || this.dead) return;',
      'boss local hit finite');
    code = once(code,
      "if (this.dead || this.invuln || !this.visible || this.match.state !== 'playing') return 0;",
      "if (this.dead || this.invuln || !this.visible || this.match.state !== 'playing' || !Number.isFinite(d) || d <= 0 || !Number.isFinite(this.hp) || this.hp <= 0) return 0;",
      'boss damage invariant');
    code = once(code,
      `  remoteHit(d) {
    if (!this.sim) return;
    const atk = G.netm?.byNid.get(d.a);
    if (!atk) return;
    this.log.recv++; this.log.recvDmg += +d.d || 0;
    if (d.c >= 0) { const c = this.crabs.get(d.c); if (c) this._hitCrab(atk, c, d.d, true); return; }
    this.applyDamage(atk, Math.min(+d.d || 0, 2000), !!d.weak, null);
  }`,
      `  remoteHit(d, from) {
    if (!this.sim || !d || this.dead || this.match.state !== 'playing') return;
    // No coercion: strings (including "-Infinity"), NaN and oversized values
    // must not reach either damage sink or alter hit accounting.
    if (typeof d.d !== 'number' || !Number.isFinite(d.d) || d.d <= 0 || d.d > 2000) return;
    if (!Number.isSafeInteger(d.c) || d.c < -1) return;
    const atk = G.netm?.byNid.get(d.a);
    if (!atk || !atk.remote || !atk.alive || atk.owner !== from) return;
    if (d.c >= 0) {
      const c = this.crabs.get(d.c);
      if (!c || c.dead || !Number.isFinite(c.hp) || c.hp <= 0) return;
      this._hitCrab(atk, c, d.d, true);
    } else {
      if (this.invuln || !this.visible || !Number.isFinite(this.hp) || this.hp <= 0) return;
      this.applyDamage(atk, d.d, !!d.weak, null);
    }
    this.log.recv++; this.log.recvDmg += d.d;
  }`,
      'authenticated finite remote boss hit');
    code = once(code,
      '  _hitCrab(attacker, c, dmg, fromNet = false) {\n    if (c.dead) return;',
      `  _hitCrab(attacker, c, dmg, fromNet = false) {
    if (!attacker || !c || c.dead || !Number.isFinite(dmg) || dmg <= 0 ||
        !Number.isFinite(c.hp) || c.hp <= 0 || this.match.state !== 'playing') return;`,
      'crab positive finite damage');
    code = once(code, '    c.hp -= dmg;', '    c.hp = Math.max(0, c.hp - Math.min(dmg, c.hp));', 'bounded crab hp');
  }
  if (rel === 'src/net/netmatch.js') {
    code = once(code,
      "case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d); break;",
      "case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d, from); break;",
      'boss sender propagation');
    code = once(code,
      '      const a = this.byNid.get(s[0]);',
      '      if (!validWireActorSnapshot(s)) continue;\n      const a = this.byNid.get(s[0]);',
      'reject malformed snapshots before interpolation');
    code = once(code,
      '  _tick(from, d) {',
      '  _tick(from, d) {\n    if (!d || !Array.isArray(d.a) || d.a.length > 128) return;',
      'bound tick actor array');
    code = once(code,
      '    const S = n.cur;',
      `    const S = n.cur;
    // Defense in depth: older/corrupt samples must never poison world transforms.
    if (!S || ![S.x, S.y, S.z, S.vx, S.vy, S.vz, S.yaw, S.aimYaw, S.aimPitch,
      S.hp, S.ink, S.sp, S.ch, S.lock, n.err.x, n.err.y, n.err.z].every(Number.isFinite)) return;`,
      'applyRemote finite guard');
    code = once(code,
      'function unpackActor(s, ts) {',
      `// 22 mandatory scalars in the owner packet. Optional adapter-side metadata is
// separately authenticated by its own reader. Never allow coercion of wire types.
function validWireActorSnapshot(s) {
  if (!Array.isArray(s) || s.length < 22 || s.length > 64 ||
      !Number.isSafeInteger(s[0]) || s[0] < 0) return false;
  for (let i = 1; i < 22; i++) if (typeof s[i] !== 'number' || !Number.isFinite(s[i])) return false;
  if (![10, 15, 16].every(i => Number.isSafeInteger(s[i]) && s[i] >= 0)) return false;
  if (s[10] > 0xfffff || s[15] > 1e9 || s[16] > 0x7fffffff) return false;
  for (let i = 1; i <= 3; i++) if (Math.abs(s[i]) > 1e5) return false;
  for (let i = 4; i <= 6; i++) if (Math.abs(s[i]) > 1e4) return false;
  for (let i = 7; i <= 8; i++) if (Math.abs(s[i]) > 1e7) return false;
  if (Math.abs(s[9]) > 4) return false;
  for (let i = 11; i <= 13; i++) if (s[i] < 0 || s[i] > 1e4) return false;
  if (s[14] < 0 || s[14] > 100) return false;
  for (let i = 17; i <= 19; i++) if (Math.abs(s[i]) > 2) return false;
  if (s[20] < -1 || s[20] > 60 || s[21] < 0 || s[21] > 600) return false;
  return true;
}

function unpackActor(s, ts) {`,
      'wire snapshot schema');
  }
  return code;
}
