// Coarse paint observations share the existing perception epoch. Movement,
// aiming, immediate ground-ink reactions and authoritative paint stay per tick.
export function adaptBotPaintObservation(rel, code) {
  if (rel !== 'src/game/bots.js') return code;
  const patch = (before, after, label) => {
    const at = code.indexOf(before);
    if (at < 0 || code.indexOf(before, at + before.length) !== -1) throw new Error(`INKWAVE bot paint observation conflict (${label})`);
    code = code.slice(0, at) + after + code.slice(at + before.length);
  };
  patch('  reset() {', '  reset() {\n    this._paintObservation = null; this._paintObservationEpoch = 0;', 'reset');
  patch('      this._perceive();', '      this._paintObservationEpoch++;\n      this._perceive();', 'Turf perception');
  patch('this._bossPerceive(boss);', 'this._paintObservationEpoch++; this._bossPerceive(boss);', 'Boss perception');
  for (const head of ['if (!a.alive) {', 'if (a.superJumpState) {', 'if (!G.match || !G.match.playing()) {']) {
    patch(head, head + ' this._paintObservation = null;', 'inactive observation');
  }
  patch('G.paint.regionStats(a.pos.x + Math.sin(wantYaw) * 4, a.pos.y, a.pos.z + Math.cos(wantYaw) * 4, 3, a.team, _stats)',
    "this._observePaintRegion('turf', a.pos.x + Math.sin(wantYaw) * 4, a.pos.y, a.pos.z + Math.cos(wantYaw) * 4, 3)", 'Turf scan');
  patch('G.paint.regionStats(a.pos.x + Math.sin(aheadYaw) * 3, a.pos.y, a.pos.z + Math.cos(aheadYaw) * 3, 2.5, a.team, _stats)',
    "this._observePaintRegion('boss', a.pos.x + Math.sin(aheadYaw) * 3, a.pos.y, a.pos.z + Math.cos(aheadYaw) * 3, 2.5)", 'Boss scan');
  patch('  update(dt) {', `  _observePaintRegion(kind, x, y, z, radius) {
    const a = this.a, old = this._paintObservation;
    const dx = x - (old?.x ?? x), dy = y - (old?.y ?? y), dz = z - (old?.z ?? z);
    if (old && old.epoch === this._paintObservationEpoch && old.paint === G.paint &&
        old.team === a.team && old.kind === kind && old.mode === this.mode &&
        dx * dx + dy * dy + dz * dz < radius * radius * .25) return old;
    const stats = G.paint.regionStats(x, y, z, radius, a.team, _stats);
    const out = old || (this._paintObservation = {});
    out.epoch = this._paintObservationEpoch; out.paint = G.paint;
    out.team = a.team; out.kind = kind; out.mode = this.mode;
    out.x = x; out.y = y; out.z = z;
    out.n = stats.n; out.own = stats.own; out.enemy = stats.enemy;
    return out;
  }

  update(dt) {`, 'observation method');
  return code;
}
