// Flow accumulation and duration are a separate state machine. The selected
// reference profile owns thresholds; battle progression is separate from life resets.
export function createFlow() { return { active: false, remaining: 0, score: 0, idleTime: 0 }; }
export function advanceFlow(state, dt, cfg, alive = true) {
  if (!(Number.isFinite(dt) && dt > 0)) return;
  const wasActive = state.active;
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) state.active = false;
  if (wasActive || !alive || !cfg?.progress) return;
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
export function awardFlow(state, action, value, cfg, bonus = 0) {
  if (state.active) {
    if (action === 'splat' || action === 'assist') state.remaining = Math.min(cfg.maxDuration, state.remaining + cfg.extension);
    return false;
  }
  // `bonus` is already in score units and joins the same gain so a bonus-bearing
  // splat crosses the activation threshold exactly like any other splat award.
  const extra = Number.isFinite(bonus) ? Math.max(0, bonus) : 0;
  const gain = (Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0) + extra;
  state.score += gain;
  if (gain > 0) state.idleTime = 0;
  // Nintendo describes accumulated turf/assists making the next opponent
  // splat more likely to activate Flow. They do not activate it by themselves.
  if (action !== 'splat' || state.score < cfg.threshold) return false;
  state.active = true; state.remaining = cfg.duration; state.score = 0; return true;
}
export function installFlow({ Actor, on, emit, G }, tuning) {
  const cfg = tuning.flow, credits = new WeakMap(), respawning = new WeakMap();
  // #529: one match-global first-splat bonus per battle. G.match is a fresh Match
  // instance per battle, so identity resets it; respawns do not. Event eligibility
  // is claimed before award() applies recipient-specific alive/bot checks.
  let firstSplatMatch = null, firstSplatClaimed = false;
  function state(a) { a.s3 ||= {}; return a.s3.flow || (a.s3.flow = createFlow()); }
  function firstSplatBonus() {
    const p = cfg.progress;
    return p && +p.firstSplatBonus > 0 ? p.firstSplatBonus * cfg.threshold / p.referenceThreshold : 0;
  }
  function award(a, action, value, bonus = 0) {
    if (!a?.alive || a.isBot && cfg.bots === false || G.match?.attract) return false;
    const flow = state(a), before = flow.remaining;
    const activated = awardFlow(flow, action, value, cfg, bonus);
    if (activated) emit('actor:flow', { actor: a, active: true });
    // The official trigger is entering/extending Flow, rather than a passive
    // stream of paint for the entire active period. Radius remains calibration.
    if (activated || flow.remaining > before) {
      const p = a.pos.clone(); p.y += 0.15;
      G.paint.splat(p, cfg.paintRadius, a.team, { kind: 'trail', seed: 0.5 });
    }
    return true;
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
  on('turf', ({ actor, area }) => award(actor, 'turf', area));
  on('damage', ({ victim, attacker, amount, source }) => {
    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;
    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);
    award(attacker, 'damage', amount);
  });
  on('splatted', ({ victim, attacker, cause }) => {
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      let bonus = 0;
      // Environmental deaths may retain recent attacker credit, but are not the
      // first player-caused enemy splat. Attract keeps its existing no-award/no-use
      // behavior; ordinary splat awards still follow their existing path below.
      if (cause !== 'water' && cause !== 'fall' && !G.match?.attract) {
        if (firstSplatMatch !== G.match) { firstSplatMatch = G.match; firstSplatClaimed = false; }
        bonus = firstSplatClaimed ? 0 : firstSplatBonus();
        // Consume the match event independently of whether `award` can credit this
        // actor (for example a simultaneous trade or disabled bot).
        firstSplatClaimed = true;
      }
      award(attacker, 'splat', 1, bonus);
    }
    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow) award(helper, 'assist', 1);
    credits.delete(victim); penalizeFlowDeath(state(victim), cause, cfg);
  });
}
