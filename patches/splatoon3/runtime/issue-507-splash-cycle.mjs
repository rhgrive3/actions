function cycleParameters(weapon) {
  const params = weapon?.nearestPaintCycle;
  const spawn = params?.SplashSpawnParam;
  const paint = params?.SplashPaintParam;
  if (!spawn || !Number.isInteger(spawn.SplitNum) || spawn.SplitNum < 1 ||
      !Array.isArray(spawn.ForceSpawnNearestAddNumArray) ||
      !paint || !Number.isFinite(paint.WidthHalfNearest) || paint.WidthHalfNearest <= 0 ||
      !Number.isFinite(paint.parameterUnitMultiplier) || paint.parameterUnitMultiplier <= 0 ||
      !Number.isFinite(paint.worldUnitScale) || paint.worldUnitScale <= 0) return null;
  const forcedShots = new Set(spawn.ForceSpawnNearestAddNumArray.filter(
    shot => Number.isInteger(shot) && shot > 0 && shot < spawn.SplitNum
  ));
  return {
    splitNum: spawn.SplitNum,
    forcedShots,
    radius: paint.WidthHalfNearest * paint.parameterUnitMultiplier * paint.worldUnitScale,
  };
}

// The source documents the modulo-SplitNum cycle, not lifecycle resets. Keep
// phase on the actor and add no release/death/weapon-change reset hook.
export function recordSuccessfulSplattershotShot(actor, weapon, round, paint) {
  if (!actor || actor.remote || actor.weaponId !== 'shooter' || weapon?.id !== 'shooter' || weapon.kind !== 'shooter') return null;
  if (!round || round.owner !== actor || round.type !== 'shot' || round.ghost) return null;
  const params = cycleParameters(weapon);
  if (!params) return null;

  actor.s3 ||= {};
  const state = actor.s3.splattershotNearestCycle ||= { phase: 0, successfulShots: 0 };
  const shotInCycle = state.phase + 1;
  state.successfulShots++;
  state.phase = shotInCycle % params.splitNum;

  if (shotInCycle !== params.splitNum && !params.forcedShots.has(shotInCycle)) return { shotInCycle, painted: false };

  const ground = actor.ground;
  if (!actor.grounded || !ground?.hit || !Number.isFinite(ground.y) ||
      !Number.isFinite(actor.pos?.x) || !Number.isFinite(actor.pos?.z) || typeof paint?.splat !== 'function') {
    return { shotInCycle, painted: false };
  }

  const center = actor.pos.clone().setY(ground.y);
  const area = paint.splat(center, params.radius, actor.team, { seed: round.seed });
  actor.addTurf?.(area);
  return { shotInCycle, painted: area > 0, radius: params.radius };
}
