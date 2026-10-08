// #887 Splat Dualies normal-fire jump-accuracy clock (adapter/runtime layer only).
// Pinned Splatoon 3 Ver. 11.3.0 WeaponManeuverNormal (commit 7280ff9cde8bb1c5dcef46c700c326471584d2e6):
//   Stand_DegSwerve = 2, Jump_DegSwerve = 7.5, Jump_DegBiasMax = 0.4,
//   Jump_DegBiasDecreaseStartFrame = 25, Jump_DegBiasEndFrame = 70.
// The issue explicitly requires: preserve the jump-derived state until the
// reference recovery clock permits decrease (start 25F, complete 70F) and do NOT
// invent the exact interpolation curve between those boundaries.
//
// Design (keeps the curve UNKNOWN, like blaster #684 does for its bias law):
// - A per-runner fixed-simulation clock starts on the leave-ground edge for a
//   normal Dualies jump (humanoid, alive, no dodge/turret/lock, no super jump or
//   special). Squid-form swim jumps never arm it.
// - While the clock is active, _spreadDeg publishes the jump endpoint (7.5,
//   subject to the independent sustained-fire bloom layer exactly as native
//   does), so landing cannot collapse to the 2-degree standing endpoint on the
//   first grounded tick.
// - At the pinned 70F endpoint the clock clears and selection falls back to the
//   native grounded/airborne endpoints.
// - Between 25F and 70F the envelope is HELD at the jump endpoint: this asserts
//   only the pinned boundaries and the no-early-recovery / landed-hold facts,
//   never a specific intermediate value. The interior curve stays UNKNOWN.
// - Firing bias (Jump_DegBiasMax 0.4 / Stand_* rows) is owned by #891 and is NOT
//   rewritten here; this module only owns the envelope hold clock + hook.
// - Post-roll turret (spreadLock = 0) keeps precedence and suppresses the clock.
export function dualiesJumpSpreadConfig(profile) {
  const param = profile?.weaponsFidelityCompletion?.weapons?.dualies?.WeaponParam;
  const hz = Number.isFinite(profile?.referenceHz) ? profile.referenceHz : 60;
  const startF = param?.Jump_DegBiasDecreaseStartFrame;
  const endF = param?.Jump_DegBiasEndFrame;
  const start = Number.isFinite(startF) && hz > 0 ? startF / hz : null;
  const end = Number.isFinite(endF) && hz > 0 ? endF / hz : null;
  const supported = Number.isFinite(start) && Number.isFinite(end) && end > start
    && param?.Jump_DegSwerve === profile?.weapons?.dualies?.spreadAir
    && param?.Stand_DegSwerve === profile?.weapons?.dualies?.spreadGround;
  return { start, end, startF, endF, hz, supported,
    biasMax: param?.Jump_DegBiasMax ?? null };
}

export function dualiesJumpState(runner, weapon, config) {
  if (!config?.supported || !runner || weapon?.kind !== 'dualies')
    return { supported: !!config?.supported, active: false, age: null, frames: null,
      phase: 'idle', holdUntilEnd: false };
  const active = Number.isFinite(runner.s3DualiesJumpT);
  const age = active ? runner.s3DualiesJumpT : null;
  const frames = active ? age * config.hz : null;
  // Pinned boundaries only: held through 25F, UNKNOWN interior, recovered at 70F.
  const phase = !active ? 'idle'
    : frames <= config.startF + 1e-9 ? 'held'
    : frames < config.endF - 1e-9 ? 'recovering-unknown-curve' : 'recovered';
  return { supported: true, active, age, frames, phase,
    holdUntilEnd: active && frames < config.endF - 1e-9 };
}

function dualiesJumpEligible(runner, actor) {
  return !!actor?.alive && actor.form !== 'squid' && !actor.superJumpState
    && !actor.specialActive && actor.weapon?.kind === 'dualies'
    && !runner.dodge && !runner.s3Turret && !(runner.lockT > 1e-10);
}

// Advance/arm the clock BEFORE the native update reads grounded/spread state.
// Grounded-edge start: a runner that has seen ground and is now airborne arms
// at 0. Landing never clears: the clock runs to the 70F endpoint.
export function tickDualiesJumpClock(runner, dt, config) {
  const actor = runner.a;
  if (!config?.supported || !dualiesJumpEligible(runner, actor)) {
    // Turret/dodge/lock/squid/special/dead/weapon-switch suppress: no stale hold.
    runner.s3DualiesJumpT = null;
    runner.s3DualiesJumpWasGrounded = !!actor?.grounded;
    return;
  }
  const grounded = !!actor.grounded;
  if (runner.s3DualiesJumpT == null) {
    if (runner.s3DualiesJumpWasGrounded === true && !grounded) runner.s3DualiesJumpT = 0;
  } else {
    runner.s3DualiesJumpT += dt;
    if (runner.s3DualiesJumpT >= config.end - 1e-12) runner.s3DualiesJumpT = null;
  }
  runner.s3DualiesJumpWasGrounded = grounded;
}

export function resetDualiesJumpClock(runner, actor) {
  runner.s3DualiesJumpT = null;
  runner.s3DualiesJumpWasGrounded = !!actor?.grounded;
}
