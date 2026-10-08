// #429: Charger stage collision uses its source field radius, not its
// separately tuned player-hit or paint radius. Existing INKWAVE calibration
// is 1 world unit per Nintendo collision unit (inkFlight.js).
export function adaptChargerFieldCollision(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  return replaceOnce(code,
    '    const hit = G.physics.raycast(m, dir, range, _hit, true);',
    "    const fieldRadius = Math.max(0, +w.fieldCollisionRadius || 0);\n" +
    "    const hit = fieldRadius && this.inkFlight?.world && G.physics.level\n" +
    "      ? this.inkFlight.world(m, _v2.copy(m).addScaledVector(dir, range), fieldRadius, _hit)\n" +
    "      : G.physics.raycast(m, dir, range, _hit, true);",
    'charger nonzero stage-hit envelope');
}
