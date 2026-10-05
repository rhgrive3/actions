// Boss-only transport admission. Player hit and paint protocols remain native.
function once(code, before, after) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('Boss hit anchor conflict');
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptBossHit(rel, code) {
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
    if (!Number.isFinite(d.d) || d.d <= 0 || (d.weak !== 0 && d.weak !== 1)) return false;
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
