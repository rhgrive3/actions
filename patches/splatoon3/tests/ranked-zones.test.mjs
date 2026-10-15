import test from 'node:test';
import assert from 'node:assert/strict';
import { ZonesRule } from '../runtime/ranked/zones.mjs';

class FakeEngine {
  constructor() {
    this.mode = 'zones'; this.counts = [100, 100]; this.penalties = [0, 0];
    this.time = 300; this.elapsed = 0; this.overtime = false; this.overtimeElapsed = 0;
    this.overtimeTeam = -1; this.winner = null; this.leader = -1; this.events = []; this.specialPoints = [0, 0];
  }
  setCount(team, value) {
    if (value < this.counts[team]) {
      this.counts[team] = value;
      if (value === 0) this.finish(team, 'knockout');
      else if (this.overtime && value < this.counts[1 - team]) this.finish(team, 'overtime-lead');
      if (this.counts[0] !== this.counts[1]) this.leader = this.counts[0] < this.counts[1] ? 0 : 1;
    }
  }
  score(team, amount, options = {}) {
    const penalty = this.penalties[team];
    if (penalty > 0) {
      const used = Math.min(penalty, amount);
      this.penalties[team] = Math.max(0, penalty - used);
      const overflow = amount - used;
      if (options.simultaneousLastPenalty && this.penalties[team] === 0) this.setCount(team, this.counts[team] - 1);
      if (overflow > 0) this.setCount(team, this.counts[team] - overflow);
    } else this.setCount(team, this.counts[team] - amount);
  }
  addPenalty(team, amount) { this.penalties[team] += amount; }
  finish(team, reason) { if (this.winner === null) this.winner = team; this.finishReason = reason; }
  event(kind, data) { this.events.push({ kind, data }); }
  special(team, points) { this.specialPoints[team] += points; }
}

const stage = count => ({ id: 'test', zones: Array.from({ length: count }, (_, i) => ({ center: [i, 0, 0], size: [2, 2] })) });
const frame = (...ratios) => ({ zoneCoverage: ratios });

test('large-zone paint goals spread by slot and simulation time and skip unsupported floors', () => {
  const engine = new FakeEngine(), large = { zones: [{ center: [0, 0, 0], size: [13, 11] }] };
  const rule = new ZonesRule(engine, large), live = { floorAt: () => 0 };
  const first = rule.botGoal({ team: 0, slot: 0, pos: [0, 0, 0] }, live);
  const second = rule.botGoal({ team: 0, slot: 1, pos: [0, 0, 0] }, live);
  assert.notDeepEqual(first.pos, second.pos);
  engine.elapsed = 3;
  assert.notDeepEqual(rule.botGoal({ team: 0, slot: 0, pos: [0, 0, 0] }, live).pos, first.pos);
  const safe = rule.botGoal({ team: 0, slot: 0, pos: [0, 0, 0] }, { floorAt: (x, z) => x === 0 && z === 0 ? 0 : null });
  assert.deepEqual(safe.pos, [0, 0, 0]);
  assert.deepEqual(large.zones[0].center, [0, 0, 0], 'the zone itself stays fixed');
});

test('one zone captures at 70%, scores continuously, and awards the documented losing-team special rate', () => {
  const engine = new FakeEngine();
  const rule = new ZonesRule(engine, stage(1));
  rule.update(0.6, frame([0.7, 0.3]));
  assert.equal(rule.state.controllingTeam, 0);
  assert.deepEqual(rule.state.zones, [{ team: 0, previousTeam: -1 }]);
  assert.equal(engine.counts[0], 99);
  assert.ok(Math.abs(engine.specialPoints[1] - 2.7) < 1e-10);
  assert.equal(engine.events.filter(event => event.kind === 'zone-capture').length, 1);
});

test('zone scoring consumes one integer count every 36 controlled frames and pauses its fractional clock when neutral', () => {
  const engine = new FakeEngine();
  const rule = new ZonesRule(engine, stage(1));
  for (let frameIndex = 0; frameIndex < 35; frameIndex++)
    rule.update(1 / 60, frame([0.7, 0.3]));
  assert.equal(engine.counts[0], 100);
  assert.ok(Math.abs(rule.state.countClock - 35 / 60) < 1e-9);

  rule.update(0, frame([0.5, 0.5]));
  rule.update(3, frame([0.5, 0.5]));
  assert.ok(Math.abs(rule.state.countClock - 35 / 60) < 1e-9);
  rule.update(1 / 60, frame([0.7, 0.3]));
  assert.equal(engine.counts[0], 99);
  assert.ok(rule.state.countClock < 1e-9);
});

test('two zones must both be held; a 50% enemy repaint neutralizes a zone without an immediate penalty', () => {
  const engine = new FakeEngine();
  const rule = new ZonesRule(engine, stage(2));
  rule.update(0, frame([0.7, 0.3], [0.69, 0.31]));
  assert.equal(rule.state.controllingTeam, -1);
  rule.update(0.6, frame([0.7, 0.3], [0.7, 0.3]));
  assert.equal(rule.state.controllingTeam, 0);
  assert.equal(engine.counts[0], 99);
  rule.update(0, frame([0.5, 0.5], [0.7, 0.3]));
  assert.equal(rule.state.controllingTeam, -1);
  assert.equal(engine.penalties[0], 0);
  // The opponent must capture every zone before the lost hold is charged.
  rule.update(0, frame([0.7, 0.3], [0.5, 0.5]));
  rule.update(0, frame([0.3, 0.7], [0.7, 0.3]));
  assert.equal(rule.state.controllingTeam, -1);
  assert.equal(engine.penalties[0], 0);
  rule.update(0, frame([0.3, 0.7], [0.3, 0.7]));
  assert.equal(rule.state.controllingTeam, -1);
  assert.equal(engine.penalties[0], 0);
  rule.update(0, frame([0.3, 0.7], [0.3, 0.7]));
  assert.equal(rule.state.controllingTeam, 1);
  assert.equal(engine.penalties[0], 1); // 0.6s held => ceil(75% of one count).
});

test('fractional hold time rounds only the resulting penalty and the final penalty tick lowers true count too', () => {
  const engine = new FakeEngine();
  const rule = new ZonesRule(engine, stage(1));
  rule.update(0, frame([0.7, 0.3]));
  rule.update(0.8, frame([0.7, 0.3]));
  rule.update(0, frame([0.5, 0.5]));
  rule.update(0, frame([0.3, 0.7]));
  assert.equal(engine.penalties[0], 1); // 0.8s / 0.6s * 0.75 = exactly 1.

  engine.penalties[1] = 1;
  engine.counts[1] = 50;
  rule.update(0.6, frame([0.3, 0.7]));
  assert.equal(engine.penalties[1], 0);
  assert.equal(engine.counts[1], 49);
});

test('overtime accepts a losing team that just lost control, waits through neutral, and ends on retake or ten seconds', () => {
  const engine = new FakeEngine();
  engine.counts = [100, 80]; engine.overtimeTeam = 0; engine.overtime = true;
  const rule = new ZonesRule(engine, stage(1));
  rule.update(0, frame([0.7, 0.3]));
  assert.equal(rule.beginOvertime(), true);
  rule.update(0, frame([0.5, 0.5]));
  rule.updateOvertime(9.9, frame([0.5, 0.5]));
  assert.equal(engine.winner, null);
  rule.update(0, frame([0.7, 0.3]));
  rule.updateOvertime(0.1, frame([0.7, 0.3]));
  assert.equal(engine.winner, null);
  rule.update(0, frame([0.5, 0.5]));
  rule.updateOvertime(10, frame([0.5, 0.5]));
  assert.equal(engine.winner, 1);
  assert.equal(engine.finishReason, 'zones-neutral-timeout');
});

test('overtime ends immediately when the winning team retakes every zone; snapshots are detached', () => {
  const engine = new FakeEngine();
  engine.counts = [100, 80]; engine.overtimeTeam = 0; engine.overtime = true;
  const rule = new ZonesRule(engine, stage(1));
  rule.update(0, frame([0.7, 0.3]));
  assert.equal(rule.beginOvertime(), true);
  rule.update(0, frame([0.5, 0.5]));
  rule.update(0, frame([0.3, 0.7]));
  rule.updateOvertime(1, frame([0.3, 0.7]));
  assert.equal(engine.winner, 1);
  const snapshot = rule.snapshot();
  snapshot.zones[0].team = 0;
  assert.equal(rule.state.zones[0].team, 1);
  rule.restore(rule.snapshot());
  assert.equal(rule.state.controllingTeam, 1);
});
