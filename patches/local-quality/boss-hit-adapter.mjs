// Boss-only transport admission. Player hit and paint protocols remain native.
function once(code, before, after) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('Boss hit anchor conflict');
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptBossHit(rel, code) {
  if (rel === 'src/boss/boss.js') {
    // #1179: the transport guard is not a substitute for authoritative HP invariants.
    code = once(code,
      "    if (!this.sim) return;\n    const atk = G.netm?.byNid.get(d.a);",
      "    if (!this.sim || !d || typeof d.d !== 'number' || !Number.isFinite(d.d) || d.d <= 0 || d.d > 2000 || !Number.isSafeInteger(d.c) || d.c < -1 || (d.weak !== 0 && d.weak !== 1)) return;\n    const atk = G.netm?.byNid.get(d.a);");
    code = once(code,
      '    if (!atk) return;\n    this.log.recv++;',
      "    if (!atk || !atk.remote || atk.alive === false || this.dead || this.invuln || !this.visible || this.match?.state !== 'playing' || !Number.isFinite(this.hp)) return;\n    if (d.c >= 0 && (!this.crabs.get(d.c) || this.crabs.get(d.c).dead)) return;\n    this.log.recv++;");
    code = once(code,
      "    if (this.dead || this.invuln || !this.visible || this.match.state !== 'playing') return 0;",
      "    if (this.dead || this.invuln || !this.visible || this.match.state !== 'playing' || typeof d !== 'number' || !Number.isFinite(d) || d <= 0 || !Number.isFinite(this.hp) || this.hp <= 0) return 0;");
    code = once(code,
      '  _hitCrab(attacker, c, dmg, fromNet = false) {\n    if (c.dead) return;',
      "  _hitCrab(attacker, c, dmg, fromNet = false) {\n    if (!attacker || !c || c.dead || typeof dmg !== 'number' || !Number.isFinite(dmg) || dmg <= 0 || !Number.isFinite(c.hp) || c.hp <= 0) return;");
    code = once(code, '    c.hp -= dmg;', '    c.hp = Math.max(0, c.hp - dmg);');
    return code;
  }
  if (rel !== 'src/net/netmatch.js') return code;
  code = once(code,
    "case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d); break;",
    "case 'bhit': if (this.isHost && this._acceptBossHit(from, d)) this.match.boss.remoteHit(d); break;");
  code = once(code,
    '    if (this.isHost || attacker.nid === undefined) return;',
    '    if (this.isHost || !attacker || attacker.remote || attacker.owner !== this.myId || attacker.nid === undefined || !Number.isFinite(d) || d <= 0) return;');
  code = once(code,
    "{ k: 'bhit', a: attacker.nid, d: r2(d), weak: weak ? 1 : 0, w, c: crab }",
    "{ k: 'bhit', a: attacker.nid, d: r2(d), weak: weak ? 1 : 0, w, c: crab, m: this.cfg.id, l: attacker.netLife ?? 0, q: (this._bossHitSeq = (this._bossHitSeq ?? 0) + 1) }");
  code = once(code, '  sendBossHit(attacker, d, weak, w, crab = -1) {', `  _acceptBossHit(from, d) {
    const boss = this.match?.boss, actor = this.byNid.get(d.a);
    if (!boss?.sim || G.netm !== this || !actor?.remote || actor.owner !== from || from === this.myId) return false;
    if (typeof this.cfg.id !== 'string' || typeof d.m !== 'string' || d.m !== this.cfg.id) return false;
    if (typeof d.d !== 'number' || !Number.isFinite(d.d) || d.d <= 0 || d.d > 2000 || (d.weak !== 0 && d.weak !== 1)) return false;
    if (!Number.isSafeInteger(d.c) || d.c < -1 || (d.c >= 0 && !boss.crabs.has(d.c))) return false;
    if (typeof d.w !== 'string' && !(typeof d.w === 'number' && Number.isFinite(d.w))) return false;
    const life = Math.max(actor.netLife ?? 0, actor.net?.lastLife ?? 0);
    if (!Number.isSafeInteger(d.l) || d.l < 0 || d.l !== life || !Number.isSafeInteger(d.q) || d.q < 1) return false;
    // This peer belongs to this NetMatch/session; respawn does not rewind its sequence.
    const peer = this._peer(from);
    if (d.q <= (peer.lastBossHit ?? 0)) return false;
    peer.lastBossHit = d.q;
    return true;
  }

  sendBossHit(attacker, d, weak, w, crab = -1) {`);
  return code;
}
