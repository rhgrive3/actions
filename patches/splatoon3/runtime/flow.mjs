// Flow accumulation and duration are a separate state machine. The selected
// reference profile owns every threshold; death clears state and assist credit.
export function createFlow() { return { active: false, remaining: 0, score: 0 }; }
export function advanceFlow(state, dt) {
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) state.active = false;
}
export function awardFlow(state, action, value, cfg) {
  if (state.active) {
    if (action === 'splat' || action === 'assist') state.remaining = Math.min(cfg.maxDuration, state.remaining + cfg.extension);
    return false;
  }
  state.score += Math.max(0, value) * (cfg.weights[action] || 0);
  // Nintendo describes accumulated turf/assists making the next opponent
  // splat more likely to activate Flow. They do not activate it by themselves.
  if (action !== 'splat' || state.score < cfg.threshold) return false;
  state.active = true; state.remaining = cfg.duration; state.score = 0; return true;
}
export function installFlow({ Actor, on, emit, G }, tuning) {
  const cfg = tuning.flow, credits = new WeakMap();
  function state(a) { a.s3 ||= {}; return a.s3.flow || (a.s3.flow = createFlow()); }
  function award(a, action, value) {
    if (!a?.alive || a.isBot && cfg.bots === false || G.match?.attract) return;
    const flow = state(a), before = flow.remaining;
    const activated = awardFlow(flow, action, value, cfg);
    if (activated) emit('actor:flow', { actor: a, active: true });
    // The official trigger is entering/extending Flow, rather than a passive
    // stream of paint for the entire active period. Radius remains calibration.
    if (activated || flow.remaining > before) {
      const p = a.pos.clone(); p.y += 0.15;
      G.paint.splat(p, cfg.paintRadius, a.team, { kind: 'trail', seed: 0.5 });
    }
  }
  const reset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) { const result = reset.apply(this, args); this.s3 ||= {}; this.s3.flow = createFlow(); credits.delete(this); return result; };
  const update = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const flow = state(this), was = flow.active;
    advanceFlow(flow, dt);
    if (was && !flow.active) emit('actor:flow', { actor: this, active: false });
    return update.call(this, dt);
  };
  on('turf', ({ actor, area }) => award(actor, 'turf', area));
  on('damage', ({ victim, attacker, amount, source }) => {
    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;
    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);
    award(attacker, 'damage', amount);
  });
  on('splatted', (event) => {
    const { victim, attacker } = event;
    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);
    // Victim-authoritative credits are shared with the HUD, stats and network.
    // A Set prevents repeated hits (or duplicate helper IDs) from counting twice.
    const candidates = Array.isArray(event.assists) ? event.assists :
      [...(credits.get(victim) || [])].filter(([, time]) => G.time - time <= cfg.assistWindow).map(([helper]) => helper);
    const helpers = attacker && attacker !== victim && attacker.team !== victim.team
      ? [...new Set(candidates)].filter(helper => helper !== attacker && helper !== victim && helper.team === attacker.team) : [];
    event.assists = helpers;
    for (const helper of helpers) {
      helper.stats.assists = (helper.stats.assists || 0) + 1;
      award(helper, 'assist', 1);
    }
    credits.delete(victim); victim.s3 ||= {}; victim.s3.flow = createFlow();
  });
}
