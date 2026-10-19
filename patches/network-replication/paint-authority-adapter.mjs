export function adaptPaintAuthority(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'paint authority: ' + label); };
  if (rel === 'src/net/netmatch.js') {
    code = "import { packPaintAuthority, admitPaintAuthority, consumePaintAuthority, transferPaintOwner } from '../../patches/network-replication/paint-authority.mjs';\n" + code;
    patch('    const st = o.stretch;',
      '    const authority = packPaintAuthority(this, G.paint, team, o);\n    if (!authority) return false;\n    const st = o.stretch;', 'explicit local producer');
    patch('nextPaintOrder(this, !!o.instant)', '[...nextPaintOrder(this, !!o.instant), authority]', 'owner-bound stamp');
    patch('row.length !== 4 || row[0] !== PAINT_ORDER_TAG', 'row.length !== 5 || row[0] !== PAINT_ORDER_TAG', 'strict authority schema');
    patch('  // Membership, team ownership, the match epoch and sender sequence own admission.',
      '  if (!admitPaintAuthority(nm, from, e)) return false;\n  // Membership, team ownership, the match epoch and sender sequence own admission.', 'validate before replay or HLC reservation');
    patch('// exact victim-burst signature. That is not action provenance: a member can still forge it.',
      '// exact victim-burst shape. The explicit owner/action proof is checked separately above.', 'shape guard is never authority');
    patch('    receivePaintOrder(this, e._netPeer, e);',
      '    receivePaintOrder(this, e._netPeer, e);\n    consumePaintAuthority(this, e);', 'consume exact death stamp after authoritative apply and clock observation');
    patch('      a.owner = this.s.hostId;', '      transferPaintOwner(this, a, this.s.hostId);\n      a.owner = this.s.hostId;', 'invalidate old ownership generation');
  }
  if (rel === 'src/world/paint.js') {
    patch('paintOrder = nm.recSplat(center, radius, team, opts) || null;',
      'paintOrder = nm.recSplat(center, radius, team, opts) || null; if (!paintOrder) return 0;', 'unscoped local paint cannot alter turf or gain');
  }
  if (rel === 'src/boss/bossHazards.js') {
    patch('r, 1, { seed: Math.random() });', 'r, 1, { seed: Math.random(), paintBoss: true });', 'host hazard producer');
  }
  if (rel === 'src/boss/boss.js') {
    patch('killed ? 0 : 1, { seed: Math.random() });', 'killed ? 0 : 1, { seed: Math.random(), paintBoss: true });', 'host crablet producer');
  }
  if (rel === 'patches/splatoon3/runtime/ranked/world.mjs') {
    patch("kind: 'blast', instant: true, face: face.id,", "kind: 'blast', instant: true, face: face.id, paintZone: [index, cell],", 'host zone capture producer');
  }
  if (rel === 'patches/splatoon3/runtime/flow.mjs') {
    patch("{ kind: 'trail', seed: 0.5 }", "{ kind: 'trail', seed: 0.5, claimOwner: a }", 'flow belongs to its actor');
  }
  return code;
}
