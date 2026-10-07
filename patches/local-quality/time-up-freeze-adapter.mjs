// #923 partial, fidelity-safe optimization: after TIME UP, freeze Actor/WeaponRunner/soft-push work,
// but keep Projectiles running. Splatoon 3 allows several already-thrown bombs/specials to resolve after
// the clock reaches zero, so clearing or globally pausing the projectile system would change gameplay.
// Boss and attract matches keep their own finish sequences untouched; results is a separate state.
export function adaptTimeUpFreeze(rel, code, once) {
  if (rel !== 'src/game/match.js') return code;
  if (code.includes('_timeUpFrozen')) throw new Error('INKWAVE quality patch conflict (time-up freeze): already connected');
  return once(code,
    '    const nm = G.netm;\n    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }',
    '    this._timeUpFrozen = (this.state === \'finish\' || this.state === \'judge\') && !this.bossMode && !this.attract;\n' +
    '    if (this._timeUpFrozen) return;   // actors/weapon/soft-push stop; projectile resolution remains owned by the fixed clock\n' +
    '    const nm = G.netm;\n    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }',
    'time-up actor freeze');
}
