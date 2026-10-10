// #280: the 12.9 matching range is distinct from 11.56 combat reticle reach.
// Called after the normal Charger/Splatling HUD projection adapter, so their
// charge-dependent range and shot guide owners remain authoritative.
export function adaptCombatRange(rel, code, replaceOnce) {
  if (rel !== 'src/game/player.js') return code;
  return replaceOnce(code,
    "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n    updateShotGuide(this);",
    "    const isShooterRange = w.kind === 'shooter' && Number.isFinite(w.combatRange);\n" +
    "    const reticleReach = isShooterRange ? w.combatRange : range;\n" +
    "    this.inRange = a.aimPoint.distanceTo(a.pos) <= reticleReach + (isShooterRange ? 0 : 0.5);\n" +
    "    updateShotGuide(this);",
    'S3 shooter combat HUD range after charge endpoints');
}
