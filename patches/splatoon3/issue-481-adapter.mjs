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
// 3. Admission & attribution: legitimate credited environmental splats (e.g. damaged within
//    4s then fell in water) award splat points; unattributed water deaths have no attacker
//    and award nothing. Duplicate splats for the same accepted victim life epoch are ignored.
// 4. Boundary resets: actor-local streak is reset on actor reset, respawn, splat death,
//    match reset / attract mode, and upon Flow activation or expiration.
// 5. Splat-only activation: turf and assist progress continue using their own weights
//    and cannot activate Flow by themselves even if crossing the threshold.
// 6. Composition: narrow hooks compose seamlessly in both orders with PR #489 decay and
//    death persistence/penalties, preserving existing listener assist and victim death logic.

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
  // Keep #768's storage-cap and C30's independent first-splat bonus argument.
  const firstSplatComposed = code.includes('export function awardFlow(state, action, value, cfg, capProgress = true, bonusFp = 0) {');
  const capped = firstSplatComposed || code.includes('export function awardFlow(state, action, value, cfg, capProgress = true) {');
  // 1. Signature for awardFlow to accept isConsecutive without stealing C30's bonusFp slot.
  code = replaceOnce(
    code,
    firstSplatComposed
      ? 'export function awardFlow(state, action, value, cfg, capProgress = true, bonusFp = 0) {'
      : capped ? 'export function awardFlow(state, action, value, cfg, capProgress = true) {' : 'export function awardFlow(state, action, value, cfg) {',
    firstSplatComposed
      ? 'export function awardFlow(state, action, value, cfg, capProgress = true, bonusFp = 0, isConsecutive = false) {'
      : capped ? 'export function awardFlow(state, action, value, cfg, capProgress = true, isConsecutive = false) {' : 'export function awardFlow(state, action, value, cfg, isConsecutive = false) {',
    'awardFlow signature'
  );

  // 2. Stateful splat award calculation in awardFlow (supporting main or PR #489 anchor)
  const unpatchedMainGain = '  state.score += Math.max(0, value) * (cfg.weights[action] || 0);';
  const pr489Gain = `  const gain = Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0;
  state.score += gain;
  if (gain > 0) state.idleTime = 0;`;

  const targetGain = `  let gain = 0;
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
  if (gain > 0 && typeof state.idleTime === 'number') state.idleTime = 0;`;

  if (firstSplatComposed) {
    code = replaceOnce(code,
      '  const gain = Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0;',
      `  let gain = Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0;
  if (action === 'splat') {
    const consecutive = Boolean(isConsecutive || (value && typeof value === 'object' && value.consecutive));
    const scale = (cfg?.threshold ?? 3) / 100;
    const currentFp = state.score / scale;
    const points = currentFp >= (75 - 1e-9) ? (consecutive ? 35 : 15) : (consecutive ? 45 : 23);
    gain = points * scale;
  }`,
      'awardFlow gain with first-splat bonus and storage cap');
  } else if (capped) {
    code = replaceOnce(code, '  const gain = Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0;', targetGain.slice(0, targetGain.indexOf('  state.score += gain;')), 'awardFlow gain with independent storage cap');
  } else if (code.includes(unpatchedMainGain)) {
    code = replaceOnce(code, unpatchedMainGain, targetGain, 'awardFlow gain calculation (main)');
  } else if (code.includes(pr489Gain)) {
    code = replaceOnce(code, pr489Gain, targetGain, 'awardFlow gain calculation (PR489)');
  } else {
    throw new Error('INKWAVE issue-481 patch conflict: unknown awardFlow gain anchor');
  }

  // 3. installFlow deadVictimEpochs bookkeeping
  code = replaceOnce(
    code,
    'const cfg = tuning.flow,',
    'const cfg = tuning.flow, deadVictimEpochs = new WeakMap(),',
    'installFlow deadVictimEpochs'
  );

  // 4. award helper signature and invocation
  code = replaceOnce(
    code,
    firstSplatComposed ? '  function award(a, action, value, bonusFp = 0) {' : '  function award(a, action, value) {',
    firstSplatComposed
      ? '  function award(a, action, value, bonusFp = 0, isConsecutive = false) {'
      : '  function award(a, action, value, isConsecutive = false) {',
    'award helper signature'
  );

  code = replaceOnce(
    code,
    firstSplatComposed
      ? "    const activated = awardFlow(flow, action, value, cfg, G.match?.mode === 'turf', bonusFp);"
      : capped ? "    const activated = awardFlow(flow, action, value, cfg, G.match?.mode === 'turf');" : '    const activated = awardFlow(flow, action, value, cfg);',
    firstSplatComposed
      ? "    const activated = awardFlow(flow, action, value, cfg, G.match?.mode === 'turf', bonusFp, isConsecutive);"
      : capped ? "    const activated = awardFlow(flow, action, value, cfg, G.match?.mode === 'turf', isConsecutive);" : '    const activated = awardFlow(flow, action, value, cfg, isConsecutive);',
    'award helper awardFlow invocation'
  );

  // 5. Actor reset streak clearing (hooking credits.delete without clobbering flow persistence)
  code = replaceOnce(
    code,
    'credits.delete(this);',
    'credits.delete(this); if (this.s3) this.s3.flowLastSplatTime = null; deadVictimEpochs.delete(this);',
    'actor reset streak clear'
  );

  // 6. Respawn streak clearing
  code = replaceOnce(
    code,
    "  on('turf', ({ actor, area }) => award(actor, 'turf', area));",
    "  on('respawn', ({ actor }) => { if (actor?.s3) actor.s3.flowLastSplatTime = null; });\n  on('turf', ({ actor, area }) => award(actor, 'turf', area));",
    'respawn event streak clear'
  );

  // 7. Actor update Flow expiration streak clearing
  code = replaceOnce(
    code,
    "if (was && !flow.active) emit('actor:flow', { actor: this, active: false });",
    "if (was && !flow.active) { if (this.s3) this.s3.flowLastSplatTime = null; emit('actor:flow', { actor: this, active: false }); }",
    'actor update flow expiration streak clear'
  );

  // 8. on('splatted') consecutive splat award and victim life-epoch deduplication
  // Narrowly replaces only the attacker award line, preserving helper assists and victim death handling
  const unpatchedAttackerAward = "    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);";
  const consecutiveAward = firstSplatComposed
    ? "award(attacker, 'splat', 1, 0, isConsecutive);"
    : "award(attacker, 'splat', 1, isConsecutive);";
  let patchedAttackerAward = `    if (victim?.s3) victim.s3.flowLastSplatTime = null;
    let isDuplicate = false;
    if (victim) {
      const victimLife = (typeof victim.netLife === 'number' ? victim.netLife : undefined)
        ?? (typeof victim.net?.lastLife === 'number' ? victim.net.lastLife : undefined);
      const deaths = typeof victim.stats?.deaths === 'number' ? victim.stats.deaths : 0;
      const epoch = victimLife !== undefined ? \`\${victimLife}:\${deaths}\` : String(deaths);
      if (deadVictimEpochs.get(victim) === epoch) {
        isDuplicate = true;
      } else {
        deadVictimEpochs.set(victim, epoch);
      }
    }
    if (attacker && attacker !== victim && attacker.team !== victim?.team && !isDuplicate) {
      const now = G.time;
      const lastTime = attacker.s3?.flowLastSplatTime;
      const isConsecutive = typeof lastTime === 'number' && Number.isFinite(lastTime) && now >= lastTime && (now - lastTime) <= 5.0;
      attacker.s3 ||= {};
      attacker.s3.flowLastSplatTime = now;
      ${consecutiveAward}
      if (attacker.s3.flow?.active) {
        attacker.s3.flowLastSplatTime = null;
      }
    }`;

  if (code.includes('  function splat427(attacker, victim, term) {')) {
    // #427 factors accepted splat awards out of the death listener. Retirement
    // still belongs to every death, including an environment death with no killer.
    const retire = '    if (victim?.s3) victim.s3.flowLastSplatTime = null;';
    code = replaceOnce(code, '    const { victim, attacker, cause } = event;',
      '    const { victim, attacker, cause } = event;\n' + retire, 'all deaths retire the victim streak');
    patchedAttackerAward = patchedAttackerAward.replace(retire + '\n', '');
  }
  code = replaceOnce(code, unpatchedAttackerAward, patchedAttackerAward, 'on splatted consecutive award and dedup');

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
