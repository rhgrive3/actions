export function adaptClothingGear(rel, code, replace) {
  if (rel !== 'src/net/netmatch.js') return code;
  const patch = (before, after, name) => { code = replace(code, before, after, 'clothing gear: ' + name); };
  patch('  if (a.onEnemy) f |= F.enemy;', '  if (a.onEnemy) f |= F.enemy;\n  if (respawnPunisherEquipped(a)) f |= RESPAWN_PUNISHER_FLAG;', 'snapshot bit24');
  patch('      buf.push(snap);', '      receiveClothingSnapshot(a, from, snap.f);\n      buf.push(snap);', 'accepted owner snapshot');
  patch("d: r2(dmg), w: wid });", "d: r2(dmg), w: wid, rp: respawnPunisherEquipped(attacker) });", 'hit equipment snapshot');
  patch("case 'hit': this._hit(d); break;", "case 'hit': this._hit(d, from); break;", 'hit sender delivery');
  patch('  _hit(d) {', '  _hit(d, from) {', 'hit sender input');
  patch('    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;', '    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;\n    if (from !== undefined && from !== atk.owner) return;', 'punisher hit owner check');
  patch('    this._applyingHit = true;\n    G.projectiles?.applyHit(atk, v, d.d, d.w);\n    this._applyingHit = false;', '    const applying = this._applyingHit;\n    this._applyingHit = true;\n    try { return withHitPunisher(atk, d.rp, () => {\n    G.projectiles?.applyHit(atk, v, d.d, d.w);\n    }); }\n    finally { this._applyingHit = applying; }', 'hit-scoped equipment and finally');
  return "import { respawnPunisherEquipped, receiveClothingSnapshot, withHitPunisher, RESPAWN_PUNISHER_FLAG } from '../../patches/splatoon3/runtime/clothing-gear.mjs';\n" + code;
}
