// #280: the 12.9 matching range is distinct from 11.56 combat reticle reach.
// Called after the normal Charger/Splatling HUD projection adapter, so their
// charge-dependent range and shot guide owners remain authoritative.
// Owner report 2026-11-10: with an enemy under the crosshair the reach is
// measured where the aim ray reaches that enemy's body surface (closest
// approach to the body axis minus the hurtbox radius), not at the
// terrain hit behind it (aimPoint). Otherwise an enemy just inside the reach
// lost the on-target X whenever the floor/wall behind it was out of reach.
export function adaptCombatRange(rel, code, replaceOnce) {
  if (rel !== 'src/game/player.js') return code;
  return replaceOnce(code,
    "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n    updateShotGuide(this);",
    "    const isShooterRange = w.kind === 'shooter' && Number.isFinite(w.combatRange);\n" +
    "    const reticleReach = isShooterRange ? w.combatRange : range;\n" +
    "    const reachPoint = this.onTarget && this.onTarget !== G.boss ? _v.copy(start).addScaledVector(fwd, Math.max(0, best - (typeof hurtboxRadius === 'function' ? hurtboxRadius(this.onTarget, PLAYER) : PLAYER.radius))) : a.aimPoint;\n" +
    "    this.inRange = reachPoint.distanceTo(a.pos) <= reticleReach + (isShooterRange ? 0 : 0.5);\n" +
    "    updateShotGuide(this);",
    'S3 shooter combat HUD range after charge endpoints');
}
