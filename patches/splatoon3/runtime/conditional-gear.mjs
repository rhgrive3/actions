// Match windows and respawn buffs are independent of Flow's activation clock.
export const HEAD_ABILITIES = Object.freeze(['lastDitchEffort', 'comeback', 'openingGambit']);
const INK = ['inkSaverMain', 'inkSaverSub', 'inkRecovery'];
const MOVE = ['runSpeed', 'swimSpeed', 'inkResistance', 'actionIntensify'];
const COMEBACK = [...INK, 'runSpeed', 'swimSpeed', 'specialCharge'];
const EPS = 1e-10;
export function conditionalState(a, match) {
  a.s3 ||= {};
  if (!a.s3.conditionalGear || a.s3.conditionalGear.match !== match) {
    a.s3.conditionalGear = { match, openingEnd: null, comeback: 0, enemyDeath: false };
  }
  return a.s3.conditionalGear;
}
export function conditionalBonus(a, match, cfg) {
  const state = conditionalState(a, match), id = a.s3.loadout?.[0]?.main;
  if (state.openingEnd == null) state.openingEnd = cfg.openingDuration;
  if (!match || match.attract || match.bossMode || match.state !== 'playing') return null;
  if (id === 'lastDitchEffort' && match.time <= cfg.lastDitchWindow + EPS && match.time > 0) return [INK, cfg.lastDitchAP];
  if (id === 'comeback' && state.comeback > EPS) return [COMEBACK, cfg.comebackAP];
  if (id === 'openingGambit' && match.duration - match.time < state.openingEnd - EPS) return [MOVE, cfg.openingAP];
  return null;
}
export function conditionalPoints(a, base, match, cfg) {
  const points = { ...base }, bonus = conditionalBonus(a, match, cfg);
  if (bonus) for (const id of bonus[0]) points[id] = Math.min(57, (points[id] || 0) + bonus[1]);
  return points;
}
export function conditionalKey(a, match, cfg) {
  const bonus = conditionalBonus(a, match, cfg);
  return bonus ? `${bonus[0].join(',')}:${bonus[1]}` : '';
}
export function hostileDeath(a, attacker, cause) {
  return !!attacker && attacker !== a && attacker.team !== a.team && !['water', 'fall', 'out', 'bounds', 'void'].includes(cause);
}
export function installConditionalGear(api, tuning, refresh) {
  const { Actor, G, on } = api, cfg = tuning.conditionalGear, awards = new WeakMap();
  const reset = Actor.prototype.reset, respawn = Actor.prototype.respawn, splat = Actor.prototype.splat, update = Actor.prototype.update;
  Actor.prototype.reset = function (...args) {
    this.s3 ||= {}; delete this.s3.conditionalGear;
    awards.delete(this); const result = reset.apply(this, args); refresh(this); return result;
  };
  Actor.prototype.respawn = function (...args) {
    const state = conditionalState(this, G.match), eligible = state.enemyDeath;
    const result = respawn.apply(this, args);
    // Preserve the opening deadline, never restart the opening window on respawn.
    this.s3.conditionalGear = state; state.enemyDeath = false;
    state.comeback = eligible && this.s3.loadout?.[0]?.main === 'comeback' ? cfg.comebackDuration : 0;
    refresh(this); return result;
  };
  Actor.prototype.splat = function (attacker, cause = 'weapon', ...args) {
    const alive = this.alive, state = conditionalState(this, G.match);
    const result = splat.call(this, attacker, cause, ...args);
    if (alive && !this.alive) {
      state.enemyDeath = hostileDeath(this, attacker, cause);
      // Conservative lifecycle policy: discard an old life buff. Residual
      // Comeback across an environmental death is explicitly unverified.
      state.comeback = 0; refresh(this);
    }
    return result;
  };
  Actor.prototype.update = function (dt) {
    const state = conditionalState(this, G.match);
    if (G.match?.state === 'playing' && !G.match.paused && !G.match.attract) state.comeback = Math.max(0, state.comeback - dt);
    refresh(this); return update.call(this, dt);
  };
  function extend(actor, victim) {
    if (!actor || !victim || actor === victim || actor.team === victim.team) return;
    let receipt = awards.get(victim), life = victim.stats?.deaths || 0;
    if (!receipt || receipt.life !== life) { receipt = { life, actors: new Set() }; awards.set(victim, receipt); }
    if (receipt.actors.has(actor)) return;
    receipt.actors.add(actor);
    if (actor.s3?.loadout?.[0]?.main !== 'openingGambit' || !conditionalBonus(actor, G.match, cfg)) return;
    conditionalState(actor, G.match).openingEnd += cfg.openingExtension; refresh(actor);
  }
  on('splatted', ({ attacker, victim }) => extend(attacker, victim));
  on('actor:assist', ({ actor, victim, attacker }) => {
    if (attacker && attacker !== victim && attacker.team !== victim.team && actor !== attacker && actor?.team === attacker.team) extend(actor, victim);
  });
  on('match:state', ({ match }) => { for (const a of match?.actors || []) refresh(a); });
}
