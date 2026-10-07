// Turf War is decided at TIME UP, but Match.update kept running every Actor (surface sampling, physics, WeaponRunner, ink,
// Character) plus the O(N^2) soft push for the whole `finish` (2.6 s) and `judge` (~5.1 s) window, and the fixed clock kept
// stepping projectiles. From TIME UP on, actors hold their final pose, shots still in the air are dropped (so nothing can
// change the coverage the judge reads), and only presentation (camera, HUD, environment, FX) keeps running. Boss and
// attract matches keep their own finish sequences untouched; `results` is a separate screen and is not gated here.
export function adaptTimeUpFreeze(rel, code, once) {
  if (rel !== 'src/game/match.js') return code;
  if (code.includes('_timeUpFrozen')) throw new Error('INKWAVE quality patch conflict (time-up freeze): already connected');
  return once(code,
    '    const nm = G.netm;\n    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }',
    '    this._timeUpFrozen = (this.state === \'finish\' || this.state === \'judge\') && !this.bossMode && !this.attract;   // read by the fixed clock\n' +
    '    if (this._timeUpFrozen) { G.projectiles?.clear?.(); return; }   // clear() is O(1) when empty; it also drops late online ghost shots\n' +
    '    const nm = G.netm;\n    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }',
    'time-up freeze');
}
