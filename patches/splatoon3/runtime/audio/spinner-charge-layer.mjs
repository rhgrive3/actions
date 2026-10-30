// Presentation-only Splatling charge state/threshold helpers. Actual authored
// recordings are owned by spinner-charge-clips.mjs and spinner-charge-control.mjs.
// This module never changes the gameplay timing, ballistics or network packets.
const clamp01 = value => Math.max(0, Math.min(1, value));

export function spinnerFirstStage(weapon) {
  const param = weapon?.catalogRecord?.parameters?.WeaponParam;
  const first = param?.ChargeFrame_First;
  const full = param?.ChargeFrame_Second ?? param?.ChargeFrameFullCharge;
  return Number.isFinite(first) && Number.isFinite(full) && first > 0 && first < full
    ? first / full : 2 / 3;
}

export function spinnerChargePitch(progress) {
  // The motor source is one recording. A small smoothed playback-rate sweep
  // follows charge progress instead of allocating another voice every frame.
  return 0.88 + 0.32 * clamp01(progress);
}

// The S3 catalogue replaces the legacy WeaponRunner and has no local motor
// loop of its own. Follow its post-update public charge/stream state, never
// mutate gameplay timing or the charge gauge.
export function syncCatalogSpinnerCharge(engine, runner) {
  const actor = runner?.a, weapon = actor?.weapon;
  if (!actor || weapon?.catalogRecord?.family !== 'splatling') return;
  // Host migration must release the former local voice. The remote netmatch
  // audio owner uses independent replica handles.
  if (actor.remote) {
    runner.spinLoop?.stop?.(0.055);
    runner.spinLoop = null;
    runner._spinnerAudioPhase = null;
    return;
  }
  const near = actor.isLocal || actor._nearCamera?.();
  const active = near && actor.alive !== false && actor.form === 'kid' &&
    !actor.specialActive && !actor.superJumpState && !runner.aimingSub;
  const phase = active ? (runner.streaming ? 'spin' : runner.charging ? 'charge' : null) : null;
  const now = engine.ctx?.currentTime ?? 0;
  const retry = phase && (!runner.spinLoop || runner.spinLoop.playing === false) &&
    now >= (runner._spinnerAudioRetryAt || 0);
  if (phase !== runner._spinnerAudioPhase || retry) {
    runner.spinLoop?.stop?.(0.055);
    runner.spinLoop = null;
    runner._spinnerAudioPhase = phase;
    runner._spinnerAudioRetryAt = now + 1;
    if (phase) runner.spinLoop = engine.loopWeapon?.(weapon.id, phase, {
      actor, pos: actor.isLocal ? undefined : actor.pos,
      volume: actor.isLocal ? 0.56 : 0.36,
      pitch: phase === 'charge' ? spinnerChargePitch(0) : 1,
      priority: actor.isLocal ? 86 : 56,
    });
  }
  if (phase === 'charge') runner.spinLoop?.set?.({
    progress: runner.charge, pos: actor.isLocal ? undefined : actor.pos,
  });
  else if (phase === 'spin') runner.spinLoop?.set?.({
    pos: actor.isLocal ? undefined : actor.pos,
  });
}
