// Flow accumulation and duration are a separate state machine. The selected
// reference profile owns thresholds; battle progression is separate from life resets.
export function createFlow() { return { active: false, remaining: 0, score: 0, idleTime: 0 }; }
export function advanceFlow(state, dt, cfg, alive = true) {
  if (!(Number.isFinite(dt) && dt > 0)) return;
  const wasActive = state.active;
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) state.active = false;
  // Inactive progress follows battle time, including the dead/respawn interval.
  if (wasActive || !cfg?.progress) return;
  const p = cfg.progress, idle = Math.max(0, state.idleTime || 0);
  // Split a step crossing the five-second boundary; variable intervals and the
  // fixed gameplay clock must integrate the same piecewise decay.
  const slowTime = Math.min(dt, Math.max(0, p.fastDecayAfter - idle));
  const lossFp = slowTime * p.decayPerSecond + (dt - slowTime) * p.fastDecayPerSecond;
  state.score = Math.max(0, state.score - lossFp * cfg.threshold / p.referenceThreshold);
  state.idleTime = idle + dt;
}
export function penalizeFlowDeath(state, cause, cfg) {
  if (state.active || !cfg?.progress) return;
  const p = cfg.progress;
  const lossFp = cause === 'water' || cause === 'fall' ? p.environmentDeathPenalty : p.deathPenalty;
  state.score = Math.max(0, state.score - lossFp * cfg.threshold / p.referenceThreshold);
}
export function awardFlow(state, action, value, cfg, capProgress = true) {
  if (state.active) {
    if (action === 'splat' || action === 'assist') state.remaining = Math.min(cfg.maxDuration, state.remaining + cfg.extension);
    return false;
  }
  const gain = Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0;
  const p = cfg.progress;
  const cap = capProgress && Number.isFinite(p?.referenceCap) && p.referenceCap >= 0 && p.referenceThreshold > 0
    ? p.referenceCap * cfg.threshold / p.referenceThreshold : Infinity;
  state.score = Math.min(cap, state.score + gain);
  if (gain > 0) state.idleTime = 0;
  // Nintendo describes accumulated turf/assists making the next opponent
  // splat more likely to activate Flow. They do not activate it by themselves.
  if (action !== 'splat' || state.score < cfg.threshold) return false;
  state.active = true; state.remaining = cfg.duration; state.score = 0; return true;
}
// Shared across repeated installs so an authoritative Match transition is awarded once.
const wipeoutSequences = new WeakMap();
export function awardWipeoutFlow(flow, cfg) {
  if (flow.active) return;
  const gain = (cfg.progress?.wipeoutBonus || 0) * cfg.threshold / cfg.progress?.referenceThreshold;
  if (!(Number.isFinite(gain) && gain > 0)) return;
  // Retain the later ordinary-Turf storage cap while restoring the team award.
  const p = cfg.progress;
  const cap = Number.isFinite(p?.referenceCap) && p.referenceCap >= 0 && p.referenceThreshold > 0
    ? p.referenceCap * cfg.threshold / p.referenceThreshold : Infinity;
  flow.score = Math.min(cap, flow.score + gain); flow.idleTime = 0;
}
export function installFlow({ Actor, on, emit, G }, tuning) {
  const cfg = tuning.flow, credits = new WeakMap(), respawning = new WeakMap();
  function state(a) { a.s3 ||= {}; return a.s3.flow || (a.s3.flow = createFlow()); }
  function award(a, action, value) {
    if (!a?.alive || a.isBot && cfg.bots === false || G.match?.attract) return;
    const flow = state(a), before = flow.remaining;
    // The reference storage limit describes ordinary Turf; the custom Boss
    // economy and non-match tools retain their existing accumulation policy.
    const activated = awardFlow(flow, action, value, cfg, G.match?.mode === 'turf');
    if (activated) emit('actor:flow', { actor: a, active: true });
    // The official trigger is entering/extending Flow, rather than a passive
    // stream of paint for the entire active period. Radius remains calibration.
    if (activated || flow.remaining > before) {
      const p = a.pos.clone(); p.y += 0.15;
      G.paint.splat(p, cfg.paintRadius, a.team, { kind: 'trail', seed: 0.5 });
    }
  }
  const reset = Actor.prototype.reset, respawn = Actor.prototype.respawn;
  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3 ||= {};
    this.s3.flow = respawning.get(this) || createFlow();
    credits.delete(this);
    // Consumers (including the independently installed AP/effect layer) see
    // the restored state before native respawn emits its completion event.
    emit('actor:flow', { actor: this, active: this.s3.flow.active });
    return result;
  };
  Actor.prototype.respawn = function (...args) {
    const prior = respawning.get(this);
    respawning.set(this, state(this));
    try { return respawn.apply(this, args); }
    finally { if (prior) respawning.set(this, prior); else respawning.delete(this); }
  };
  const update = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const flow = state(this), was = flow.active;
    advanceFlow(flow, dt, cfg, this.alive);
    if (was && !flow.active) emit('actor:flow', { actor: this, active: false });
    return update.call(this, dt);
  };
  on('match:state', ({ match, state: phase }) => {
    if (match && phase === 'intro') wipeoutSequences.delete(match);
  });
  on('team:wipeout', ({ match, team, sequence } = {}) => {
    // Client roster inference is not an authoritative online team event.
    // Delay this new bonus online until confirmed ownership/timeline transport exists.
    if (G.netm) return;
    if (!match || match !== G.match || match.mode !== 'turf' || match.attract ||
        match.state !== 'playing' || match.paused || !(match.time > 0) ||
        (team !== 0 && team !== 1) || !Number.isSafeInteger(sequence) || sequence < 1 || !Array.isArray(match.actors)) return;
    const wiped = match.actors.filter(a => a.team === team);
    const teammates = match.actors.filter(a => a.team === 1 - team);
    if (wiped.length !== 4 || teammates.length !== 4 || wiped.some(a => a.alive)) return;
    const seen = wipeoutSequences.get(match) || [0, 0];
    if (sequence <= seen[team]) return;
    seen[team] = sequence; wipeoutSequences.set(match, seen);
    // The verified bonus is team-wide, including a teammate waiting to respawn.
    // It is not a splat/assist: do not activate or extend Flow or paint a burst.
    for (const actor of teammates) if (!(actor.isBot && cfg.bots === false)) awardWipeoutFlow(state(actor), cfg);
  });
  on('turf', ({ actor, area }) => award(actor, 'turf', area));
  // #544: a verified marking producer supplies an accepted, life-scoped event.
  // This is not a damage event and cannot create damage/HP-bar disclosure.
  // Producers are intentionally separate: Flow accepts only their explicit,
  // authoritative mark receipt and never infers assistance from timer/map flags.
  on('assist:mark', ({ helper, victim, source, accepted, victimLife, helperLife } = {}) => {
    if (accepted !== true || !helper?.alive || !victim?.alive || helper === victim ||
        helper.team === victim.team || G.match?.attract ||
        !cfg.assistPoints?.sources?.includes(source) ||
        victimLife !== (victim.netLife ?? 0) || helperLife !== (helper.netLife ?? 0)) return;
    const map = credits.get(victim) || new Map(), prior = map.get(helper);
    const time = typeof prior === 'number' ? prior : prior?.time;
    const damage = prior != null && (typeof prior === 'number' || prior.kind !== 'marking') &&
      G.time >= time && G.time - time <= cfg.assistWindow &&
      (typeof prior === 'number' || (prior.victimLife === victimLife && prior.helperLife === helperLife));
    // A qualifying damage assist wins over marking; one helper gets one award.
    if (!damage) map.set(helper, { time: G.time, victimLife, helperLife, kind: 'marking', source });
    credits.set(victim, map);
  });
  function assistValue(helper, victim) {
    const credit = credits.get(victim)?.get(helper), points = cfg.assistPoints;
    if (credit?.kind !== 'marking' || !points || !(points.damage > 0)) return 1;
    return points.marking / points.damage;
  }
  on('damage', ({ victim, attacker, amount, source }) => {
    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;
    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);
    award(attacker, 'damage', amount);
  });
  on('splatted', (event) => {
    const { victim, attacker, cause } = event;
    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);
    // One victim-authoritative assist list feeds stats, Flow and conditional gear
    // while the current-main death-progress policy remains authoritative.
    const candidates = Array.isArray(event.assists) ? event.assists :
      [...(credits.get(victim) || [])].filter(([, credit]) => G.time - (typeof credit === 'number' ? credit : credit.time) <= cfg.assistWindow).map(([helper]) => helper);
    const helpers = attacker && attacker !== victim && attacker.team !== victim.team
      ? [...new Set(candidates)].filter(helper => helper !== attacker && helper !== victim && helper.team === attacker.team) : [];
    event.assists = helpers;
    for (const helper of helpers) {
      helper.stats.assists = (helper.stats.assists || 0) + 1;
      award(helper, 'assist', assistValue(helper, victim));
      emit('actor:assist', { actor: helper, victim, attacker });
    }
    credits.delete(victim);
    penalizeFlowDeath(state(victim), cause, cfg);
  });
}
