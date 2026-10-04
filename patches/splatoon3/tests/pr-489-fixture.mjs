// Test-only pinned fixture representing PR #489 (commit 004afacb821ffedd4a1adc7745a6e7aa659c7d9f)
// transformation of runtime/flow.mjs for cross-PR composition verification.
import { replaceOnce } from '../issue-481-adapter.mjs';

export const pr489FlowProgress = Object.freeze({
  referenceThreshold: 100,
  decayPerSecond: 0.2,
  fastDecayAfter: 5,
  fastDecayPerSecond: 3.3,
  deathPenalty: 5,
  environmentDeathPenalty: 10,
});

export function adaptPR489Flow(code) {
  // 1. createFlow includes idleTime
  if (code.includes('export function createFlow() { return { active: false, remaining: 0, score: 0 }; }')) {
    code = replaceOnce(
      code,
      'export function createFlow() { return { active: false, remaining: 0, score: 0 }; }',
      'export function createFlow() { return { active: false, remaining: 0, score: 0, idleTime: 0 }; }',
      'pr489 createFlow'
    );
  }

  // 2. advanceFlow piecewise decay and penalizeFlowDeath
  const advanceFlowOriginal = `export function advanceFlow(state, dt) {
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining <= 0) state.active = false;
}`;
  const advanceFlowPR489 = `export function advanceFlow(state, dt, cfg, alive = true) {
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
}`;
  if (code.includes(advanceFlowOriginal)) {
    code = replaceOnce(code, advanceFlowOriginal, advanceFlowPR489, 'pr489 advanceFlow');
  }

  // 3. awardFlow gain idleTime reset (if main code is unadapted)
  const awardGainOriginal = '  state.score += Math.max(0, value) * (cfg.weights[action] || 0);';
  const awardGainPR489 = `  const gain = Number.isFinite(value) ? Math.max(0, value) * (cfg.weights[action] || 0) : 0;
  state.score += gain;
  if (gain > 0) state.idleTime = 0;`;
  if (code.includes(awardGainOriginal)) {
    code = replaceOnce(code, awardGainOriginal, awardGainPR489, 'pr489 awardFlow gain');
  }

  // 4. installFlow respawning map
  if (!code.includes('respawning = new WeakMap()')) {
    code = replaceOnce(
      code,
      'credits = new WeakMap()',
      'credits = new WeakMap(), respawning = new WeakMap()',
      'pr489 respawning WeakMap'
    );
  }

  // 5. Actor.prototype.reset and respawn state retention
  const mainReset = '  const reset = Actor.prototype.reset;\n  Actor.prototype.reset = function (...args) { const result = reset.apply(this, args); this.s3 ||= {}; this.s3.flow = createFlow(); credits.delete(this); return result; };';
  const post481Reset = '  const reset = Actor.prototype.reset;\n  Actor.prototype.reset = function (...args) { const result = reset.apply(this, args); this.s3 ||= {}; this.s3.flow = createFlow(); credits.delete(this); if (this.s3) this.s3.flowLastSplatTime = null; deadVictimEpochs.delete(this); return result; };';

  const makePr489ResetAndRespawn = (extra = '') => `  const reset = Actor.prototype.reset, respawn = Actor.prototype.respawn;
  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3 ||= {};
    this.s3.flow = respawning.get(this) || createFlow();
    credits.delete(this);${extra}
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
  };`;

  if (code.includes(mainReset)) {
    code = replaceOnce(code, mainReset, makePr489ResetAndRespawn(''), 'pr489 reset & respawn (main)');
  } else if (code.includes(post481Reset)) {
    code = replaceOnce(code, post481Reset, makePr489ResetAndRespawn(' if (this.s3) this.s3.flowLastSplatTime = null; deadVictimEpochs.delete(this);'), 'pr489 reset & respawn (post-481)');
  }

  // 6. Actor.prototype.update advanceFlow call
  if (code.includes('    advanceFlow(flow, dt);\n')) {
    code = replaceOnce(
      code,
      '    advanceFlow(flow, dt);\n',
      '    advanceFlow(flow, dt, cfg, this.alive);\n',
      'pr489 update advanceFlow'
    );
  }

  // 7. on('splatted') penalizeFlowDeath
  const mainDeath = 'victim.s3 ||= {}; victim.s3.flow = createFlow();';
  const pr489Death = 'penalizeFlowDeath(state(victim), cause, cfg);';
  if (code.includes(mainDeath)) {
    code = replaceOnce(code, mainDeath, pr489Death, 'pr489 penalizeFlowDeath');
  }
  if (code.includes("on('splatted', ({ victim, attacker }) => {")) {
    code = replaceOnce(
      code,
      "on('splatted', ({ victim, attacker }) => {",
      "on('splatted', ({ victim, attacker, cause }) => {",
      'pr489 on splatted cause arg'
    );
  }

  return code;
}
