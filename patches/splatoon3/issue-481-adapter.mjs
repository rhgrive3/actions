// Issue #481: Consecutive splat Flow-point award model (Splatoon 3 Ver. 11.3.0).
//
// In unpatched INKWAVE, `award(attacker, 'splat', 1)` awards a flat 1.0 point
// (normalized against cfg.threshold = 3.0), ignoring whether the splat is an
// isolated kill or a rapid multi-splat.
//
// Splatoon 3 Ver. 11.3.0 verification specifies a 100-fp model:
// - Activation threshold: 100 fp, triggered exclusively on a splat event.
// - Accumulated Flow below 75 fp:
//   - Ordinary splat: +23 fp
//   - Consecutive splat (within 5 seconds of previous qualifying splat): +45 fp
// - Accumulated Flow at or above 75 fp:
//   - Ordinary splat: +15 fp
//   - Consecutive splat (within 5 seconds of previous qualifying splat): +35 fp
//
// The existing normalized threshold (cfg.threshold, default 3.0) exactly represents
// the 100-fp domain via `scale = cfg.threshold / 100` (1 fp = 0.03 normalized).
// 75 fp corresponds to `75 * scale = 0.75 * cfg.threshold` (2.25 normalized).
//
// Invariants:
// 1. Clock authority: previous splat timestamp is tracked in G.time (game simulation
//    clock), never render clock / wall-clock / requestAnimationFrame.
// 2. Strict actor locality: each player maintains their own streak timer; other
//    players' splats never contaminate an actor's streak.
// 3. Admission & exclusions: water/fall deaths, self-splats, friendly splats,
//    already-dead attackers, attract mode, and duplicate victim admissions are excluded.
// 4. Boundary resets: actor-local streak is reset on actor reset, respawn, splat,
//    match reset / attract mode, and upon Flow activation.
// 5. Splat-only activation: turf and assist progress continue using their own weights
//    and cannot activate Flow by themselves even if crossing the threshold.
// 6. Composition: composes cleanly with PR #489 decay/death penalties.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-481 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function calculateFlowSplatPoints(currentScore, isConsecutive, cfg) {
  const threshold = Number.isFinite(cfg?.threshold) && cfg.threshold > 0 ? cfg.threshold : 3;
  const scale = threshold / 100;
  const currentFp = currentScore / scale;
  const isHighTier = currentFp >= (75 - 1e-9);
  const points = isHighTier
    ? (isConsecutive ? 35 : 15)
    : (isConsecutive ? 45 : 23);
  const gain = points * scale;
  return { points, gain, scale, isHighTier, isConsecutive: Boolean(isConsecutive) };
}

export function adaptIssue481Flow(code) {
  // 1. Signature for awardFlow to accept isConsecutive
  code = replaceOnce(
    code,
    'export function awardFlow(state, action, value, cfg) {',
    'export function awardFlow(state, action, value, cfg, isConsecutive = false) {',
    'awardFlow signature'
  );

  // 2. Stateful splat award calculation in awardFlow
  code = replaceOnce(
    code,
    '  state.score += Math.max(0, value) * (cfg.weights[action] || 0);',
    `  let gain = 0;
  if (action === 'splat') {
    const consecutive = Boolean(isConsecutive || (value && typeof value === 'object' && value.consecutive));
    const scale = (cfg?.threshold ?? 3) / 100;
    const currentFp = state.score / scale;
    const points = currentFp >= (75 - 1e-9) ? (consecutive ? 35 : 15) : (consecutive ? 45 : 23);
    gain = points * scale;
  } else {
    gain = Number.isFinite(value) ? Math.max(0, value) * (cfg?.weights?.[action] || 0) : 0;
  }
  state.score += gain;
  if (gain > 0 && typeof state.idleTime === 'number') state.idleTime = 0;`,
    'awardFlow splat points calculation'
  );

  // 3. installFlow state bookkeeping (credits and per-life deduplication)
  code = replaceOnce(
    code,
    '  const cfg = tuning.flow, credits = new WeakMap();',
    '  const cfg = tuning.flow, credits = new WeakMap(), deadThisLife = new WeakSet();',
    'installFlow credits and deadThisLife'
  );

  // 4. award helper signature and call
  code = replaceOnce(
    code,
    '  function award(a, action, value) {',
    '  function award(a, action, value, isConsecutive = false) {',
    'award helper signature'
  );

  code = replaceOnce(
    code,
    '    const activated = awardFlow(flow, action, value, cfg);',
    '    const activated = awardFlow(flow, action, value, cfg, isConsecutive);',
    'award helper awardFlow invocation'
  );

  // 5. Actor reset and respawn streak clearing
  code = replaceOnce(
    code,
    '  Actor.prototype.reset = function (...args) { const result = reset.apply(this, args); this.s3 ||= {}; this.s3.flow = createFlow(); credits.delete(this); return result; };',
    `  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3 ||= {};
    this.s3.flow = createFlow();
    this.s3.flowLastSplatTime = null;
    credits.delete(this);
    deadThisLife.delete(this);
    return result;
  };
  const respawn = Actor.prototype.respawn;
  if (respawn) {
    Actor.prototype.respawn = function (...args) {
      const result = respawn.apply(this, args);
      if (this.s3) this.s3.flowLastSplatTime = null;
      deadThisLife.delete(this);
      return result;
    };
  }`,
    'actor reset and respawn streak reset'
  );

  // 6. Actor update Flow expiration streak clearing
  code = replaceOnce(
    code,
    '    if (was && !flow.active) emit(\'actor:flow\', { actor: this, active: false });',
    '    if (was && !flow.active) { if (this.s3) this.s3.flowLastSplatTime = null; emit(\'actor:flow\', { actor: this, active: false }); }',
    'actor update flow expiration streak clear'
  );

  // 7. Authoritative splatted listener with 5-second window, exclusions, and attribution
  const unpatchedSplatted = `  on('splatted', ({ victim, attacker }) => {
    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);
    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow) award(helper, 'assist', 1);
    credits.delete(victim); victim.s3 ||= {}; victim.s3.flow = createFlow();
  });`;

  const patchedSplatted = `  on('splatted', ({ victim, attacker, cause }) => {
    const isWaterOrFall = cause === 'water' || cause === 'fall';
    const isDuplicate = victim ? deadThisLife.has(victim) : false;
    if (victim) deadThisLife.add(victim);

    if (attacker && attacker !== victim && attacker.team !== victim?.team && attacker.alive && !isWaterOrFall && !isDuplicate && !G.match?.attract) {
      const now = G.time;
      const lastTime = attacker.s3?.flowLastSplatTime;
      // Actor-local 5-second window: within 5 seconds of previous qualifying splat at G.time
      const isConsecutive = typeof lastTime === 'number' && Number.isFinite(lastTime) && now >= lastTime && (now - lastTime) <= 5.0;
      attacker.s3 ||= {};
      attacker.s3.flowLastSplatTime = now;
      award(attacker, 'splat', 1, isConsecutive);
      if (attacker.s3.flow?.active) {
        attacker.s3.flowLastSplatTime = null;
      }
    }
    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow) award(helper, 'assist', 1);
    credits.delete(victim);
    if (victim) {
      victim.s3 ||= {};
      victim.s3.flow = createFlow();
      victim.s3.flowLastSplatTime = null;
    }
  });`;

  code = replaceOnce(code, unpatchedSplatted, patchedSplatted, 'on splatted consecutive handling');

  return code;
}

export function adaptIssue481(rel, code) {
  const normalized = rel.replace(/^(\.\/|\/)?(patches\/splatoon3\/)?/, '');
  if (normalized === 'runtime/flow.mjs' || rel === 'patches/splatoon3/runtime/flow.mjs') {
    return adaptIssue481Flow(code);
  }
  return code;
}

export const adaptIssue481Source = adaptIssue481;
