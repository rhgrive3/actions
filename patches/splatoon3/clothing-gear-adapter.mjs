// PR751 clothing metadata composed after the existing confirmed-hit owner.
export function adaptClothingGear(rel, code, replace) {
  if (rel !== 'src/net/netmatch.js') return code;
  const patch = (before, after, name) => { code = replace(code, before, after, 'clothing gear: ' + name); };
  patch('  if (a.onEnemy) f |= F.enemy;', '  if (a.onEnemy) f |= F.enemy;\n  if (respawnPunisherEquipped(a)) f |= RESPAWN_PUNISHER_FLAG;', 'snapshot bit25');
  patch('      buf.push(snap);', '      receiveClothingSnapshot(a, from, snap.f);\n      buf.push(snap);', 'accepted owner snapshot');
  patch("'splatted', 'respawn', ...KIT_FORWARD];", "'splatted', 'respawn', ...KIT_FORWARD, 'haunt:mark', 'haunt:arm'];", 'Haunt owner events');
  patch('    if (this.replayKitEvent?.(name, e, from)) return;', '    if (this.replayKitEvent?.(name, e, from)) return;\n    if (this.replayHauntEvent?.(name, e, from)) return;', 'Haunt sender validation');
  patch('w: wid, g: victim.s3PendingHitGroup || undefined', 'w: wid, g: victim.s3PendingHitGroup || undefined, rp: respawnPunisherEquipped(attacker)', 'hit equipment snapshot');
  // Existing life/owner admission and ACK listeners remain outside this local scope.
  const hit = 'G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);';
  patch(hit, 'withHitPunisher(atk, d.rp, () => { ' + hit + ' });', 'hit-scoped equipment and finally');
  return "import { respawnPunisherEquipped, receiveClothingSnapshot, withHitPunisher, RESPAWN_PUNISHER_FLAG } from '../../patches/splatoon3/runtime/clothing-gear.mjs';\n" + code;
}
