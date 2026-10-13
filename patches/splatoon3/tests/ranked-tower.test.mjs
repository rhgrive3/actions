import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerRule } from '../runtime/ranked/tower.mjs';

class FakeEngine {
  constructor() {
    this.mode = 'tower'; this.counts = [100, 100]; this.penalties = [0, 0];
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
  score(team, amount) { this.setCount(team, this.counts[team] - amount); }
  addPenalty(team, amount) { this.penalties[team] += amount; }
  finish(team, reason) { if (this.winner === null) this.winner = team; this.finishReason = reason; }
  event(kind, data) { this.events.push({ kind, data }); }
  special(team, points) { this.specialPoints[team] += points; }
}

const stage = ({ speed = 2, checkpoints = [[], []] } = {}) => ({
  id: 'test',
  tower: {
    path: [[-10, 0, 0], [0, 0, 0], [10, 0, 0]],
    centerIndex: 1,
    checkpoints,
    speed,
    halfSize: 1.4,
  },
});
const rider = (team, pos, id = `${team}`) => ({ id, team, pos: pos.slice(), alive: true, grounded: true });
const actorsAt = (team, pos, count = 1) => Array.from({ length: count }, (_, i) => rider(team, pos, `${team}-${i}`));
const currentPosition = rule => rule.state.position.slice();

test('team 0 advances along negative-to-positive path at fixed speed and sets the count from best progress', () => {
  const engine = new FakeEngine();
  const rule = new TowerRule(engine, stage({ speed: 2 }));
  assert.deepEqual(rule.state.position, [0, 0, 0]);
  rule.update(1, { actors: [rider(0, [0, 2, 0])] });
  assert.deepEqual(rule.state.position, [2, 0, 0]);
  assert.equal(rule.state.controllingTeam, 0);
  assert.equal(engine.counts[0], 80);
  assert.equal(engine.specialPoints[0], 4.5);
  assert.equal(engine.specialPoints[1], 0);
});

test('multiple riders do not speed the tower, while the prior owner retains control during a contest', () => {
  const engine = new FakeEngine();
  const rule = new TowerRule(engine, stage({ speed: 1 }));
  rule.update(1, { actors: actorsAt(0, [0, 2, 0], 2) });
  assert.equal(rule.state.pathDistance, 11);
  const before = currentPosition(rule);
  rule.update(0.5, { actors: [rider(0, before), rider(1, before, 'enemy')] });
  assert.equal(rule.state.pathDistance, 11);
  assert.equal(rule.state.controllingTeam, 0);
  assert.equal(rule.state.riders[0], 1);
  assert.equal(rule.state.riders[1], 1);
});

test('the world ride latch keeps an airborne rider aboard and stores only the rider identity', () => {
  const engine = new FakeEngine();
  const rule = new TowerRule(engine, stage({ speed: 2 }));
  rule.update(0.5, { actors: [{ id: 'jumper', team: 0, pos: [0, 8, 0], alive: true, grounded: false, onTower: true }] });
  assert.equal(rule.state.controllingTeam, 0);
  assert.equal(rule.state.pathDistance, 11);
  assert.deepEqual(rule.state.riderIds, [['jumper'], []]);
  rule.removeActor('jumper');
  assert.deepEqual(rule.state.riderIds, [[], []]);
  assert.deepEqual(rule.state.riders, [0, 0]);
});

test('rider IDs are snapshot-safe strings and numeric actor removal matches them', () => {
  const rule = new TowerRule(new FakeEngine(), stage({ speed: 1 }));
  rule.update(0.1, { actors: [{ id: 17, team: 1, pos: [0, 7, 0], alive: true, grounded: false, ridingTower: true }] });
  assert.deepEqual(rule.state.riderIds, [[], ['17']]);
  rule.removeActor(17);
  assert.deepEqual(rule.state.riderIds, [[], []]);
  assert.deepEqual(rule.state.riders, [0, 0]);
});

test('five empty seconds make the tower neutral; its return is 0.8x and a rider speeds a return at 1.2x', () => {
  const engine = new FakeEngine();
  const rule = new TowerRule(engine, stage({ speed: 2 }));
  rule.update(1, { actors: [rider(0, [0, 2, 0])] });
  rule.update(4.9, { actors: [] });
  assert.equal(rule.state.controllingTeam, 0);
  assert.equal(rule.state.emptySeconds, 4.9);
  assert.equal(rule.state.pathDistance, 12);
  rule.update(0.1, { actors: [] });
  assert.equal(rule.state.controllingTeam, -1);
  rule.update(0.5, { actors: [] });
  assert.equal(rule.state.pathDistance, 11.2);

  // A team riding on its own half returns the tower twice as quickly as the
  // 0.8x unattended return: 1.2 times its ordinary rail speed.
  rule.state.pathDistance = 11;
  rule.state.position = [1, 0, 0];
  rule.state.emptySeconds = 0;
  rule.state.controllingTeam = -1;
  rule.update(0.25, { actors: [rider(1, [1, 2, 0])] });
  assert.equal(rule.state.controllingTeam, 1);
  assert.equal(rule.state.pathDistance, 10.4);
});

test('checkpoint progress accelerates with extra riders, is remembered briefly, then recovers if abandoned', () => {
  const engine = new FakeEngine();
  const checkpoints = [[{ progress: 0.2, count: 5 }], [{ progress: 0.2, count: 5 }]];
  const rule = new TowerRule(engine, stage({ speed: 1, checkpoints }));
  rule.update(2, { actors: [rider(0, [0, 2, 0])] });
  assert.equal(rule.state.pathDistance, 12);
  assert.equal(rule.state.checkpointProgress[0][0], 0);

  rule.update(1, { actors: actorsAt(0, [2, 2, 0], 2) });
  assert.equal(rule.state.checkpointProgress[0][0], 2);
  rule.update(2, { actors: [rider(0, [2, 2, 0]), rider(1, [2, 2, 0], 'enemy')] });
  assert.equal(rule.state.checkpointProgress[0][0], 2);
  rule.update(0.1, { actors: [rider(0, [2, 2, 0])] });
  assert.equal(rule.state.checkpointProgress[0][0], 2.1);
  rule.update(3, { actors: [] });
  assert.equal(rule.state.checkpointProgress[0][0], 2.1, 'progress pauses while the tower stays on its marker');

  rule.update(2.9, { actors: [rider(0, [2, 2, 0])] });
  assert.equal(rule.state.checkpointCleared[0][0], true);
  assert.equal(rule.state.checkpointIndex[0], 1);
  assert.equal(rule.state.checkpointCountBudget[0], 5 / 0.6);
  assert.equal(engine.counts[0], 74); // Route progress and checkpoint seconds share the full 100-count budget.
  assert.equal(engine.events.filter(event => event.kind === 'checkpoint').length, 1);
});

test('checkpoint scoring bypasses cleared markers and a single rider keeps normal travel speed', () => {
  const engine = new FakeEngine();
  const checkpoints = [[{ progress: 0.2, count: 1 }], []];
  const rule = new TowerRule(engine, stage({ speed: 1, checkpoints }));
  rule.update(3, { actors: [rider(0, [0, 2, 0])] });
  assert.equal(rule.state.checkpointCleared[0][0], true);
  assert.equal(rule.state.pathDistance, 12);
  const before = rule.state.pathDistance;
  rule.update(1, { actors: [rider(0, [2, 2, 0])] });
  assert.equal(rule.state.pathDistance, before + 1);
});

test('distance never reaches knockout before the endpoint and the endpoint sets the count to zero', () => {
  const engine = new FakeEngine();
  const rule = new TowerRule(engine, stage({ speed: 10 }));
  rule.update(0.9, { actors: [rider(0, [0, 2, 0])] });
  assert.equal(rule.state.pathDistance, 19);
  assert.equal(engine.counts[0], 10);
  assert.notEqual(engine.winner, 0);

  rule.update(0.1, { actors: [rider(0, [9, 2, 0])] });
  assert.equal(rule.state.pathDistance, 20);
  assert.equal(engine.counts[0], 0);
  assert.equal(engine.winner, 0);
});

test('overtime respects the contested prior owner and ends when the winning team takes control', () => {
  const engine = new FakeEngine();
  engine.counts = [80, 60]; engine.overtimeTeam = 0; engine.overtime = true;
  const rule = new TowerRule(engine, stage({ speed: 1 }));
  rule.update(0.2, { actors: [rider(0, [0, 2, 0])] });
  assert.equal(rule.beginOvertime(), true);
  let position = currentPosition(rule);
  rule.update(0.1, { actors: [rider(0, position), rider(1, position, 'enemy')] });
  rule.updateOvertime(0.1, { actors: [] });
  assert.equal(rule.state.controllingTeam, 0);
  assert.equal(engine.winner, null);

  position = currentPosition(rule);
  rule.update(0.1, { actors: [rider(1, position, 'enemy')] });
  rule.updateOvertime(0.1, { actors: [] });
  assert.equal(engine.winner, 1);
  assert.equal(engine.finishReason, 'tower-retaken');
});

test('overtime begins only while the losing team still owns an unneutralized tower and snapshots are detached', () => {
  const engine = new FakeEngine();
  engine.counts = [100, 90]; engine.overtimeTeam = 0; engine.overtime = true;
  const rule = new TowerRule(engine, stage({ speed: 1 }));
  rule.update(0.1, { actors: [rider(0, [0, 2, 0])] });
  assert.equal(rule.beginOvertime(), true);
  rule.update(5, { actors: [] });
  assert.equal(rule.state.controllingTeam, -1);
  assert.equal(rule.beginOvertime(), false);

  const snapshot = rule.snapshot();
  snapshot.position[0] = 500;
  assert.notEqual(rule.state.position[0], 500);
  const restored = rule.snapshot();
  rule.restore(restored);
  assert.deepEqual(rule.state.position, restored.position);
});

test('bot goals use plain positions and request a ride when control must be taken', () => {
  const rule = new TowerRule(new FakeEngine(), stage());
  const goal = rule.botGoal({ team: 0, pos: [0, 0, -2] });
  assert.deepEqual(goal, { pos: [0, 0, 0], action: 'ride' });
  assert.equal(Array.isArray(goal.pos), true);
});
