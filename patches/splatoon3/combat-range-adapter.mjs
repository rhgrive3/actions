// #280: matching/weapon label range is not the shooter combat reticle reach.
// The ~11.56 level-shot value is a documented S3 reference approximation;
// the reticle must not add the generic half-unit grace on top of it.
export function adaptCombatRange(rel, code, replaceOnce) {
  if (rel !== 'src/game/player.js') return code;
  return replaceOnce(code,
    "    const range = w.kind === 'charger' ? w.rangeMax : w.kind === 'roller' ? 6 : (w.range || 12);\n    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;",
    "    const shooterReach = w.kind === 'shooter' && Number.isFinite(w.combatRange);\n" +
    "    const range = shooterReach ? w.combatRange : w.kind === 'charger' ? w.rangeMax : w.kind === 'roller' ? 6 : (w.range || 12);\n" +
    "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + (shooterReach ? 0 : 0.5);",
    'S3 shooter effective aiming range');
}
