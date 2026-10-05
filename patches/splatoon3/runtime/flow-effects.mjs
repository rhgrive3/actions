// Flow grants temporary ability points, not a second set of speed multipliers.
// Permanent equipment, runner state, resource clocks and Flow lifetime stay owned
// by their existing systems. The source/measurement limits are in the report.
export const FLOW_ABILITIES = Object.freeze(['runSpeed', 'swimSpeed', 'inkResistance', 'actionIntensify']);
export function flowAbilityPoints(points, active, bonus) {
  const result = { ...points };
  if (active) for (const id of FLOW_ABILITIES) result[id] = Math.min(57, (result[id] || 0) + bonus);
  return result;
}
const applied = new WeakMap();
export function refreshFlowEffects(actor, api, tuning, abilityPoints, gearCurve) {
  const s = actor.s3, m = s?.modifiers, weapon = actor.weapon;
  if (!m || !weapon) return;
  const active = !!s.flow?.active, previous = applied.get(actor);
  if (previous?.active === active && previous.modifiers === m && previous.weapon === weapon) return;
  const ap = flowAbilityPoints(abilityPoints(s.loadout), active, tuning.flow.abilityPoints);
  const extra = tuning.gearExtra, base = api.WEAPONS[actor.weaponId];
  for (const id of FLOW_ABILITIES) m[id] = gearCurve(ap[id] || 0, ...tuning.gear[id]);
  m.enemyMoveSpeed = m.inkResistance * 60;
  for (const [name, scale] of [['enemyShotSpeed', 60], ['enemyDamageCap', 100], ['enemyDamageRate', 6000], ['enemyJumpVelocity', 60]]) {
    m[name] = gearCurve(ap.inkResistance || 0, ...extra[name]) * scale;
  }
  // The equipment/grace patch owns these curves and exposure integration.
  // Consume them when installed; never invent a second grace or damage clock.
  if (extra.enemyActionSpeedScale) m.enemyActionSpeedScale = gearCurve(ap.inkResistance || 0, ...extra.enemyActionSpeedScale);
  if (extra.enemyInkGraceFrames) m.enemyInkGrace = Math.ceil(gearCurve(ap.inkResistance || 0, ...extra.enemyInkGraceFrames) - 1e-10) / tuning.resources.enemyInkReferenceHz;
  m.rollRetention = gearCurve(ap.actionIntensify || 0, ...extra.rollRetention);
  m.surgeChargeScale = m.actionIntensify;
  m.runSpeedFiring = gearCurve(ap.runSpeed || 0, ...(base.runSpeedFiringCurve || extra.runSpeedFiring));
  m.actionAirSpread = gearCurve(ap.actionIntensify || 0, ...(base.actionAirSpreadCurve || extra.actionAirSpread));
  if (Number.isFinite(base.spreadAir) && Number.isFinite(base.spreadGround)) {
    // Always derive from the pristine weapon, so extension/re-entry cannot
    // repeatedly shrink spread. Preserve the actor-local weapon identity.
    weapon.spreadAir = base.spreadGround + (base.spreadAir - base.spreadGround) * (1 - m.actionAirSpread);
  }
  applied.set(actor, { active, modifiers: m, weapon });
}