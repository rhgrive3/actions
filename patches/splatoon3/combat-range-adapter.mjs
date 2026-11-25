// #280: the 12.9 matching range is distinct from 11.56 combat reticle reach.
// Called after the normal Charger/Splatling HUD projection adapter, so their
// charge-dependent range and shot guide owners remain authoritative.
export function adaptCombatRange(rel, code, replaceOnce) {
  if (rel !== 'src/game/player.js') return code;
  return replaceOnce(code,
    "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n    updateShotGuide(this);",
    "    const reachPoint = this.onTarget && this.onTarget !== G.boss ? _v.copy(start).addScaledVector(fwd, best) : a.aimPoint;\n" +
    "    const liveReach = (w.kind === 'shooter' || w.kind === 'dualies') && typeof G.projectiles?.s3ReticleReach === 'function' ? G.projectiles.s3ReticleReach(a, w, range) : null;\n" +
    "    const isShooterRange = liveReach == null && w.kind === 'shooter' && Number.isFinite(w.combatRange);\n" +
    "    const reticleReach = liveReach ?? (isShooterRange ? w.combatRange : range);\n" +
    "    this.inRange = reachPoint.distanceTo(a.pos) <= reticleReach + (liveReach != null ? 0 : (isShooterRange ? 0 : 0.5));\n" +
    "    updateShotGuide(this);",
    'S3 shooter combat HUD range after charge endpoints');
}
