// Combat lives are distinct from interpolation/teleport discontinuities.
import { replaceOnce } from './input-adapter.mjs';

export function adaptCombatLife(rel, code) {
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'combat life: ' + label);
  };
  if (rel === 'src/game/actor.js') {
    patch('  spawnAt(p, yaw) {\n    this.reset();',
      '  spawnAt(p, yaw) {\n    this.netLife = (this.netLife ?? 0) + 1;\n    this.reset();', 'new life');
  }
  if (rel !== 'src/net/netmatch.js') return code;
  // Keep the legacy actor tuple extensible for unrelated snapshot fields.
  patch("    const msg = { k: 't', ts: r3(now()), a };",
    "    const msg = { k: 't', ts: r3(now()), a, l: Object.fromEntries([...this.byNid.values()].filter(x => !x.remote).map(x => [x.nid, x.netLife ?? 0])) };", 'named owner epochs');
  patch('    this.stats.in++;\n    const p = this._peer(from);',
    '    this.stats.in++;\n    // Ordered WebSocket ticks cannot replay paint or terminal events.\n' +
    '    if (!Number.isFinite(d.ts) || d.ts <= (this.peers.get(from)?.lastTs ?? -Infinity)) return;\n' +
    '    const p = this._peer(from);', 'tick replay admission');
  patch('      buf.push(snap);',
    '      snap.life = d.l?.[a.nid];\n' +
    '      if (!Number.isSafeInteger(snap.life) || snap.life < 0 || snap.life < (a.net.lastLife ?? 0)) continue;\n' +
    '      a.net.lastLife = snap.life;\n      buf.push(snap);', 'accepted owner epoch');
  patch('    a.pos.set(S.x + n.err.x, S.y + n.err.y, S.z + n.err.z);',
    '    a.netLife = S.life;\n    a.pos.set(S.x + n.err.x, S.y + n.err.y, S.z + n.err.z);', 'rendered life');
  patch('    a.netTp = a.net.tp || 0;',
    '    a.netLife = Math.max(a.netLife ?? 0, a.net.lastLife ?? 0);\n    a.netTp = a.net.tp || 0;', 'adoption continuity');
  patch("{ k: 'hit', v: victim.nid, a: attacker.nid,",
    "{ k: 'hit', v: victim.nid, a: attacker.nid, l: victim.netLife, h: (this._hitSeq = (this._hitSeq ?? 0) + 1),", 'observed target life');
  // The clothing adapter may already have threaded the sender and scoped hit
  // metadata. Preserve its exact body rather than replacing that transaction.
  if (code.includes("case 'hit': this._hit(d); break;"))
    patch("case 'hit': this._hit(d); break;", "case 'hit': this._hit(d, from); break;", 'hit sender');
  if (code.includes('  _hit(d) {')) patch('  _hit(d) {', '  _hit(d, from) {', 'sender argument');
  patch('    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;',
    '    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;\n' +
    '    if ((from !== undefined && from !== atk.owner) || !Number.isSafeInteger(d.l) || d.l < 0 || d.l !== v.netLife) return;\n' +
    '    const hitPeer = this._peer(from ?? atk.owner);\n' +
    '    if (!Number.isSafeInteger(d.h) || d.h < 1 || d.h <= (hitPeer.lastHit ?? 0)) return;\n' +
    '    hitPeer.lastHit = d.h;', 'life admission');
  const nativeHit = '    this._applyingHit = true;\n    G.projectiles?.applyHit(atk, v, d.d, d.w);\n    this._applyingHit = false;';
  if (code.includes(nativeHit)) patch(nativeHit,
    '    const applying = this._applyingHit;\n    this._applyingHit = true;\n' +
    '    try { G.projectiles?.applyHit(atk, v, d.d, d.w); }\n    finally { this._applyingHit = applying; }', 'hit transaction');
  return code;
}
