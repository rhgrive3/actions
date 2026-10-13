import { ZonesRule } from './zones.mjs';
import { TowerRule } from './tower.mjs';
import { RainmakerRule } from './rainmaker.mjs';
import { ClamsRule } from './clams.mjs';

export const RANKED_MODES = Object.freeze(['zones', 'tower', 'rainmaker', 'clams']);
export const isRankedMode = mode => RANKED_MODES.includes(mode);
export const RULE_NAMES = Object.freeze({ zones: 'ガチエリア', tower: 'ガチヤグラ', rainmaker: 'ガチホコバトル', clams: 'ガチアサリ' });
const RULES = { zones: ZonesRule, tower: TowerRule, rainmaker: RainmakerRule, clams: ClamsRule };
const teamOk = t => t === 0 || t === 1;
const pair = (x, max = 100) => Array.isArray(x) && x.length === 2 && x.every(n => Number.isFinite(n) && n >= 0 && n <= max);

// One host owns clock, objective transitions and the result. Rendering and
// actor-owner combat replication never decide the winning side independently.
export class RankedEngine {
  constructor(mode, stage) {
    if (!isRankedMode(mode)) throw new RangeError('Unknown ranked mode');
    this.mode = mode; this.stage = stage;
    this.counts = [100, 100]; this.penalties = [0, 0];
    this.time = 300; this.elapsed = 0; this.leader = -1;
    this.overtime = false; this.overtimeElapsed = 0; this.overtimeTeam = -1;
    this.winner = null; this.reason = null; this.knockout = false;
    this.events = []; this.revision = 0; this.frame = { actors: [], inputs: {} };
    this.rule = new RULES[mode](this, stage);
  }
  setCount(team, value) {
    if (!teamOk(team) || !Number.isFinite(value) || this.winner !== null) return;
    this.counts[team] = Math.max(0, Math.min(this.counts[team], this.mode === 'clams' ? value : Math.ceil(value - 1e-9)));
    if (this.counts[team] < this.counts[1 - team]) {
      if (this.leader !== team) this.event('lead', { team });
      this.leader = team;
    }
    if (this.counts[team] === 0) { this.knockout = true; this.finish(team, 'knockout'); }
    else if (this.overtime && team === this.overtimeTeam && this.counts[team] < this.counts[1 - team]) this.finish(team, 'comeback');
  }
  score(team, amount, options = {}) {
    if (!teamOk(team) || !Number.isFinite(amount) || amount <= 0 || this.winner !== null) return;
    const paid = Math.min(this.penalties[team], amount);
    this.penalties[team] -= paid;
    const main = options.simultaneousLastPenalty && paid > 0 && this.penalties[team] === 0 ? amount - paid + 1 : amount - paid;
    if (main > 0) this.setCount(team, this.counts[team] - main);
  }
  addPenalty(team, amount) {
    if (teamOk(team) && Number.isFinite(amount) && amount > 0) this.penalties[team] += amount;
  }
  resolveTie(team) {
    // The later team loses one count when its objective possession ends.
    // Best-count monotonicity has this one explicit rule exception.
    if (this.winner !== null || !teamOk(team) || this.leader !== 1 - team
      || this.counts[team] !== this.counts[1 - team] || this.counts[team] >= 100) return;
    this.counts[team] = Math.min(100, this.counts[team] + 1);
    this.event('tie-adjust', { team, count: this.counts[team] });
  }
  event(kind, data = {}) {
    this.events.push({ kind, ...data, at: this.elapsed });
    if (this.events.length > 256) this.events.shift();
  }
  special(team, points) { if (teamOk(team) && points > 0 && Number.isFinite(points)) this.event('special-gain', { team, points }); }
  finish(team, reason = 'time') {
    if (this.winner !== null || !teamOk(team)) return;
    this.winner = team; this.reason = reason;
    this.event('finish', { team, reason, knockout: this.knockout });
  }
  leadingTeam() {
    if (this.counts[0] !== this.counts[1]) return this.counts[0] < this.counts[1] ? 0 : 1;
    return teamOk(this.leader) ? this.leader : 0;
  }
  update(dt, frame = this.frame) {
    if (!(dt > 0) || !Number.isFinite(dt) || this.winner !== null) return;
    this.frame = frame;
    // Native clock calls are 60Hz. Splitting arbitrary callers preserves timer
    // and boundary ordering and makes regression tests exercise the same rules.
    let left = dt;
    while (left > 1e-10 && this.winner === null) {
      const step = Math.min(left, 1 / 60, this.overtime ? Infinity : Math.max(this.time, 1e-10));
      this.elapsed += step;
      if (this.overtime) this.overtimeElapsed += step;
      else this.time = Math.max(0, this.time - step);
      this.rule.update(step, frame);
      if (this.winner === null && this.overtime) this.rule.updateOvertime(step, frame);
      else if (this.winner === null && this.time < 1e-9) {
        this.time = 0;
        this.overtimeTeam = 1 - this.leadingTeam();
        // Each rule selects its own opportunity and its own end conditions.
        if (this.rule.beginOvertime()) {
          this.overtime = true; this.overtimeElapsed = 0;
          this.event('overtime', { team: this.overtimeTeam });
        } else this.finish(this.leadingTeam(), 'time');
      }
      this.revision++; left -= step;
      // Edges/hits describe this interval, not every catch-up subinterval.
      if (left > 1e-10) frame = { ...frame, barrierHits: [], inputs: Object.fromEntries(Object.entries(frame.inputs || {}).map(([id, input]) => [id, { ...input, throw: false }])) };
    }
  }
  snapshot() {
    return { schema: 1, mode: this.mode, stage: this.stage.id, revision: this.revision,
      counts: [...this.counts], penalties: [...this.penalties], time: this.time, elapsed: this.elapsed,
      leader: this.leader, overtime: this.overtime, overtimeTeam: this.overtimeTeam,
      overtimeElapsed: this.overtimeElapsed, winner: this.winner, reason: this.reason,
      knockout: this.knockout, rule: this.rule.snapshot() };
  }
  restore(s, { allowOlder = false } = {}) {
    if (!validRankedSnapshot(s, this.mode, this.stage.id) || (!allowOlder && s.revision < this.revision)) return false;
    if (this.mode === 'tower' && ['checkpointProgress', 'checkpointCleared', 'checkpointLossSeconds'].some(k =>
      s.rule[k].some((list, team) => list.length !== this.rule.checkpointData[team].length))) return false;
    if (this.mode === 'zones' && s.rule.zones.length !== this.stage.zones.length) return false;
    // Restore into a candidate first: a malformed rule must not partially
    // replace the clock/result or leave the next host with unusable state.
    const candidate = new RULES[this.mode](this, this.stage);
    try { candidate.restore(structuredClone(s.rule)); } catch { return false; }
    for (const k of ['revision', 'time', 'elapsed', 'leader', 'overtime', 'overtimeTeam', 'overtimeElapsed', 'winner', 'reason', 'knockout']) this[k] = s[k];
    this.counts = [...s.counts]; this.penalties = [...s.penalties];
    this.rule = candidate; this.events.length = 0;
    return true;
  }
  result() {
    if (this.winner === null) throw new Error('Ranked result before completion');
    return { mode: this.mode, winner: this.winner, counts: [...this.counts], penalties: [...this.penalties],
      knockout: this.knockout, reason: this.reason, overtime: this.overtime, elapsed: this.elapsed,
      // Compatibility only for existing result animation; ranked UI reads counts.
      coverage: this.counts.map(n => (100 - n) / 100) };
  }
}

// Bound recursive network data before touching authoritative state. Mode-specific
// validation is delegated to each rule's restore; malformed packets never throw.
export function validRankedSnapshot(s, mode = s?.mode, stage = s?.stage) {
  if (!s || s.schema !== 1 || !isRankedMode(mode) || s.mode !== mode || s.stage !== stage || typeof stage !== 'string') return false;
  if (!Number.isSafeInteger(s.revision) || s.revision < 0 || !pair(s.counts) || !pair(s.penalties, 1000)) return false;
  if (!Number.isFinite(s.time) || s.time < 0 || s.time > 300 || !Number.isFinite(s.elapsed) || s.elapsed < 0 || s.elapsed > 900) return false;
  if (![-1, 0, 1].includes(s.leader) || ![-1, 0, 1].includes(s.overtimeTeam) || ![null, 0, 1].includes(s.winner)) return false;
  if (typeof s.overtime !== 'boolean' || typeof s.knockout !== 'boolean' || !Number.isFinite(s.overtimeElapsed) || s.overtimeElapsed < 0 || s.overtimeElapsed > 300.1) return false;
  if (s.reason !== null && (typeof s.reason !== 'string' || s.reason.length > 80)) return false;
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 5000 || depth > 12) return false;
    if (v == null || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string') return v.length < 128;
    if (Array.isArray(v)) return v.length <= 128 && v.every(x => visit(x, depth + 1));
    if (typeof v !== 'object') return false;
    return Object.entries(v).every(([k, x]) => !['__proto__', 'prototype', 'constructor'].includes(k) && k.length < 80 && visit(x, depth + 1));
  };
  return !!s.rule && visit(s.rule, 0) && validRuleState(mode, s.rule);
}

function validRuleState(mode, r) {
  const number = x => Number.isFinite(x);
  const vec = x => Array.isArray(x) && x.length === 3 && x.every(number);
  const team = x => [-1, 0, 1, null].includes(x);
  const list = (x, fn) => Array.isArray(x) && x.every(fn);
  const matrix = (x, fn) => Array.isArray(x) && x.length === 2 && x.every(a => list(a, fn));
  const nums = keys => keys.every(k => number(r[k]));
  if (mode === 'zones') return list(r.zones, z => z && team(z.team) && team(z.previousTeam)) && r.zones.length > 0
    && team(r.controllingTeam) && team(r.zoneRunTeam) && typeof r.controlLostPending === 'boolean'
    && team(r.controlLostTeam) && team(r.overtimeTeam)
    && nums(['controlledSeconds', 'countClock', 'controlLostTeam', 'controlLostSeconds', 'neutralSeconds', 'overtimeTeam', 'overtimeElapsed']);
  if (mode === 'tower') return vec(r.position) && r.pathDistance >= 0 && r.progress >= 0 && r.progress <= 1 && team(r.controllingTeam) && team(r.lastController)
    && nums(['progress', 'pathDistance', 'emptySeconds', 'overtimeTeam', 'overtimeElapsed'])
    && ['riders', 'checkpointIndex', 'checkpointCountBudget', 'countProgress', 'bestProgress'].every(k => pair(r[k], 10000))
    && matrix(r.checkpointProgress, number) && matrix(r.checkpointLossSeconds, number)
    && matrix(r.checkpointCleared, x => typeof x === 'boolean') && matrix(r.riderIds, x => typeof x === 'string');
  if (mode === 'rainmaker') return vec(r.pos) && team(r.carrierTeam) && (r.carrier === null || typeof r.carrier === 'string')
    && vec(r.lastGroundedPos) && (r.pickupZ === null || number(r.pickupZ)) && number(r.respawnRemaining) && r.respawnRemaining >= 0 && r.respawnRemaining <= 3
    && r.barrier && typeof r.barrier.active === 'boolean' && number(r.barrier.max) && number(r.barrier.balance)
    && r.charge && number(r.charge.value) && r.charge.value >= 0 && r.charge.value <= 1
    && number(r.charge.seconds) && r.charge.seconds >= 0 && r.charge.seconds <= 1 && typeof r.charge.firing === 'boolean'
    && number(r.charge.delay) && r.charge.delay >= 0 && r.charge.delay <= .1
    && number(r.charge.recovery) && r.charge.recovery >= 0 && r.charge.recovery <= 20 / 60
    && typeof r.charge.wasSwimming === 'boolean'
    && (r.charge.pending === null || r.charge.pending && vec(r.charge.pending.pos) && vec(r.charge.pending.aim)
      && typeof r.charge.pending.actorId === 'string' && [0, 1].includes(r.charge.pending.team)
      && ['charge','damage','blastDamage','outerDamage','radius','nearRadius','directRange','effectiveRange','paintRadius','speed','launchY','recoil','trailRadius'].every(k => number(r.charge.pending[k]) && r.charge.pending[k] >= 0 && r.charge.pending[k] <= 300))
    && r.checkpoint && list(r.checkpoint.passed, x => typeof x === 'boolean') && r.checkpoint.passed.length === 2
    && r.overtime && typeof r.overtime.active === 'boolean'
    && nums(['holderTime', 'holderRemaining', 'dropTimer', 'shotSequence']);
  if (mode === 'clams') return list(r.clams, c => c && ['small', 'power'].includes(c.kind) && vec(c.pos) && vec(c.velocity) && typeof c.grounded === 'boolean')
    && r.inventories && typeof r.inventories === 'object' && !Array.isArray(r.inventories)
    && Object.values(r.inventories).every(i => i && number(i.small) && i.small >= 0 && i.small <= 7 && typeof i.power === 'boolean')
    && list(r.baskets, b => b && [0, 1].includes(b.team) && vec(b.goal) && typeof b.barrierOpen === 'boolean' && number(b.openTimer) && number(b.cooldown)
      && (b.pendingBreak == null || vec(b.pendingBreak.pos) && number(b.pendingBreak.remaining) && b.pendingBreak.remaining >= -1e-8 && b.pendingBreak.remaining <= 1.2 && Number.isSafeInteger(b.pendingBreak.sequence) && b.pendingBreak.sequence >= 0)) && r.baskets.length === 2
    && r.specialDrops && typeof r.specialDrops === 'object' && !Array.isArray(r.specialDrops) && Object.values(r.specialDrops).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000)
    && Number.isSafeInteger(r.nextBreakSequence) && r.nextBreakSequence >= 0 && r.nextBreakSequence <= 100000
    && r.baskets.every((b, i) => b.team === i)
    && pair(r.generatedPower, 10000) && pair(r.scoredPoints, 10000) && r.actorPositions && r.actorTeams
    && Object.values(r.actorPositions).every(vec) && Object.values(r.actorTeams).every(team)
    && r.overtime && typeof r.overtime.active === 'boolean' && nums(['spawnTimer', 'nextClamId', 'nextSpawnIndex']);
  return false;
}
