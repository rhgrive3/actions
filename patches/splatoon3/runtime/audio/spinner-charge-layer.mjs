// Presentation-only Splatling charge layers. No additional samples, PCM synthesis,
// timers, network packets or per-weapon decoded buffers: reuse the loaded Motor
// recording and its already-authorized Ready cue.
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

export function wrapSpinnerChargeLoop(engine, weaponId, underlying, options = {}) {
  if (!underlying) return underlying;
  const firstAt = spinnerFirstStage(options.actor?.weapon);
  let stopped = false, firstPlayed = false, fullPlayed = false;
  let position = options.pos;
  const cue = (stage) => {
    // Ready is a source-authenticated MP3 already resident for selected loadouts.
    // Missing recordings stay silent, per the real-only audio policy.
    engine.playWeapon?.(weaponId, 'ready', {
      actor: options.actor, pos: options.actor?.isLocal ? undefined : position,
      volume: (options.actor?.isLocal ? 1 : 0.65) * (stage === 1 ? 0.37 : 0.56),
      pitch: stage === 1 ? 0.92 : 1.12, priority: 93,
    });
  };
  return {
    get playing() { return !stopped && underlying.playing !== false; },
    set(update = {}) {
      if (stopped) return;
      if (update.pos !== undefined) position = update.pos;
      if (!Number.isFinite(update.progress)) { underlying.set?.(update); return; }
      const progress = clamp01(update.progress);
      underlying.set?.({ ...update, pitch: spinnerChargePitch(progress) });
      if (underlying.playing === false) return;
      if (!firstPlayed && progress + 1e-6 >= firstAt) {
        firstPlayed = true;
        cue(1);
      }
      if (!fullPlayed && progress + 1e-6 >= 1) {
        fullPlayed = true;
        cue(2);
      }
    },
    stop(fade = 0.06) {
      if (stopped) return;
      stopped = true;
      underlying.stop?.(fade);
    },
  };
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
