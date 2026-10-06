// Map presentation exposes teammate availability, never their respawn clock.
export function adaptMapTeammateStatus(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'map teammate status: ' + label); };
  if (rel === 'src/ui/hud.js') {
    patch('respawn: o.alive ? 0 : Math.ceil(o.respawnTimer || 0), actor: o',
      'dead: !o.alive, actor: o', 'qualitative beacon transport');
    patch('${b.ok ? 1 : 0}|${b.respawn || 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}|${b.name}',
      '${b.ok ? 1 : 0}|${b.dead ? 1 : 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}|${b.name}', 'beacon state key');
    patch("b.ok ? b.name : `${b.name} · ${b.respawn || '…'}`",
      "b.ok ? b.name : `${b.name} · ${b.dead ? '×' : '…'}`", 'beacon label');
    patch("${b.weapon || ''}|${b.ok ? 1 : 0}|${b.respawn || 0}|${M.hover === i ? 1 : 0}",
      "${b.weapon || ''}|${b.ok ? 1 : 0}|${b.dead ? 1 : 0}|${M.hover === i ? 1 : 0}", 'legend state key');
    patch("b.ok ? tr('READY') : b.respawn ? `${b.respawn}s` : tr('BUSY')",
      "b.ok ? tr('READY') : b.dead ? '×' : tr('BUSY')", 'legend label');
  } else if (rel === 'src/ui/diorama.js') {
    patch('greyed with a countdown while splatted', 'greyed with a cross while splatted', 'pin contract comment');
    patch('dead = !o.alive; if (dead) st = String(Math.max(1, Math.ceil(o.respawnTimer || 0)));',
      "dead = !o.alive; if (dead) st = '×';", 'projected pin status');
  }
  return code;
}
