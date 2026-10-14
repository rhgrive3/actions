import test from 'node:test';
import assert from 'node:assert/strict';
import { ClamsRule } from '../runtime/ranked/clams.mjs';
import { RankedEngine } from '../runtime/ranked/engine.mjs';

class Engine {
  constructor() {
    this.mode = 'clams';
    this.counts = [100, 100];
    this.penalties = [0, 0];
    this.time = 300;
    this.elapsed = 0;
    this.overtime = false;
    this.overtimeElapsed = 0;
    this.overtimeTeam = -1;
    this.winner = null;
    this.leader = -1;
    this.events = [];
    this.specialEvents = [];
    this.alphaTeam = 0;
  }
  setCount(team, value) {
    if (value >= this.counts[team]) return false;
    this.counts[team] = value;
    if (value <= 0) this.finish(team, 'knockout');
    if (this.counts[0] === this.counts[1] && this.leader < 0) this.leader = team;
    return true;
  }
  score(team, amount) {
    const paid = Math.min(this.penalties[team], amount);
    this.penalties[team] -= paid;
    const overflow = amount - paid;
    if (overflow > 0) this.setCount(team, this.counts[team] - overflow);
  }
  finish(team, reason) {
    this.winner = team;
    this.events.push({ kind: 'finish', data: { team, reason } });
  }
  event(kind, data) { this.events.push({ kind, data }); }
  special(team, points) { this.specialEvents.push({ team, points }); }
}

const point = (id, team, pos, overrides = {}) => ({
  id, team, pos: [...pos], alive: true, grounded: true, ...overrides,
});
const blankFrame = (actors = [], inputs = {}, extra = {}) => ({ actors, inputs, ...extra });
const addGroundClam = (rule, kind = 'small', team = null, pos = [0, 0, 0], extra = {}) => {
  const clam = {
    id: `fixture-${rule.state.nextClamId++}`, kind, team: kind === 'power' ? team : null,
    pos: [...pos], velocity: [0, 0, 0], grounded: true, age: 0,
    expiresIn: null, persistent: false, counterPower: false, thrower: null,
    pass: false, bounces: 0, ...extra,
  };
  rule.state.clams.push(clam);
  return clam;
};
const makeRule = (options = {}) => {
  const engine = new Engine();
  const stage = { id: 'fixture', clams: { spawns: [], goals: [[0, 0, 1.5], [0, 0, -1.5]], ...options.clams } };
  return { engine, rule: new ClamsRule(engine, stage) };
};

test('Splatoon 3 starts with thirty persistent field clams and preserves snapshots as JSON state', () => {
  const { rule } = makeRule({ clams: { spawns: Array.from({ length: 33 }, (_, i) => [i * 3, 0, 0]) } });
  assert.equal(rule.state.clams.length, 30);
  rule.update(20, blankFrame());
  assert.equal(rule.state.clams.length, 33, 'only one group is spawned after twelve seconds');
  assert.ok(rule.state.clams.every(clam => clam.expiresIn === null && clam.persistent));
  const saved = rule.snapshot();
  assert.doesNotThrow(() => JSON.stringify(saved));
  saved.clams.pop();
  assert.equal(rule.state.clams.length, 33, 'snapshot is detached from authoritative state');
});

test('actors within reach can collect clams in the air; eight small clams become one held Power Clam', () => {
  const { rule } = makeRule();
  const grounded = point('p0', 0, [0, 0, 0]);
  const airborne = point('p1', 1, [4, 0, 0], { grounded: false });
  for (let i = 0; i < 7; i++) addGroundClam(rule, 'small', null, [0, 0, 0]);
  addGroundClam(rule, 'small', null, [4, 0, 0]);
  rule.update(1 / 60, blankFrame([grounded, airborne]));
  assert.deepEqual(rule.state.inventories.p0, { team: 0, small: 7, power: false });
  assert.equal(rule.state.inventories.p1.small, 1, 'being airborne does not prohibit pickup within reach');
  rule.state.clams = rule.state.clams.filter(clam => clam.pos[0] !== 0);
  addGroundClam(rule, 'small', null, [0, 0, 0]);
  rule.update(1 / 60, blankFrame([grounded]));
  assert.deepEqual(rule.state.inventories.p0, { team: 0, small: 0, power: true });
  assert.deepEqual(rule.state.generatedPower, [1, 0]);
  assert.equal(rule.totalClams(), 2, 'a Power Clam counts as one against the field cap');
});

test('grounded spawn groups accelerate below eighteen clams and never exceed the forty-clam cap', () => {
  const { rule } = makeRule({ clams: { spawns: [[1, 0, 1]] } });
  rule.state.clams = [];
  for (let i = 0; i < 18; i++) addGroundClam(rule);
  assert.equal(rule.totalClams(), 18);
  rule.update(4, blankFrame([], {}, { floorAt: () => 2 }));
  assert.equal(rule.totalClams(), 21);
  assert.ok(rule.state.clams.slice(-3).every(clam => clam.grounded && clam.pos[1] === 2));
  rule.state.clams = Array.from({ length: 40 }, (_, i) => ({
    id: `cap-${i}`, kind: 'small', team: null, pos: [10 + i, 0, 10], velocity: [0, 0, 0],
    grounded: true, age: 0, expiresIn: null, persistent: false, counterPower: false,
    thrower: null, pass: false, bounces: 0,
  }));
  rule.update(120, blankFrame());
  assert.equal(rule.totalClams(), 40);
});

test('splatting drops one, two, or three regular clams by inventory bucket and drops a carried Power Clam', () => {
  const { rule, engine } = makeRule();
  rule.state.baskets[0].goal = [100, 0, 100];
  rule.state.inventories = {
    one: { team: 0, small: 1, power: false },
    four: { team: 1, small: 4, power: false },
    seven: { team: 0, small: 7, power: false },
    power: { team: 1, small: 0, power: true },
  };
  rule.update(1 / 60, blankFrame([
    point('one', 0, [0, 1, 0], { alive: false }),
    point('four', 1, [2, 1, 0], { alive: false }),
    point('seven', 0, [4, 1, 0], { alive: false }),
    point('power', 1, [6, 1, 0], { alive: false }),
  ], {}, { floorAt: () => 2 }));
  const drops = engine.events.filter(event => event.kind === 'clam-drop');
  assert.deepEqual(drops.filter(item => item.data.kind === 'small').map(item => item.data.count), [1, 2, 3]);
  assert.equal(drops.find(item => item.data.kind === 'power')?.data.count, 1);
  assert.equal(rule.state.clams.filter(clam => clam.kind === 'small').length, 6);
  assert.equal(rule.state.clams.filter(clam => clam.kind === 'power').length, 1);
  assert.ok(rule.state.clams.every(clam => clam.expiresIn === 10));
  assert.ok(rule.state.clams.every(clam => clam.pos[1] === 2), 'death drops use the supplied ground height');
  assert.ok(Object.values(rule.state.inventories).every(inv => inv.small === 0 && !inv.power));
});

test('a thrown clam follows gravity, obeys blocked collision callbacks, and a teammate can receive a physical pass', () => {
  const { rule, engine } = makeRule();
  rule.state.baskets[0].goal = [100, 0, 100];
  const carrier = point('carrier', 0, [0, 0, 0]);
  const ally = point('ally', 0, [0, 0, 2]);
  rule.state.inventories.carrier = { team: 0, small: 1, power: false };
  rule.update(1 / 60, blankFrame([carrier, ally], { carrier: { throw: true, pass: true, passTo: 'ally', aim: [0, 0, 1] } }));
  const thrown = rule.state.clams.find(clam => clam.thrower === 'carrier');
  assert.ok(thrown);
  assert.ok(thrown.velocity[2] > 0);
  assert.equal(thrown.grounded, false);
  for (let i = 0; i < 20 && rule.state.inventories.ally?.small !== 1; i++) {
    rule.update(1 / 30, blankFrame([carrier, ally]));
  }
  assert.equal(rule.state.inventories.ally.small, 1);
  assert.ok(engine.events.some(event => event.kind === 'clam-pass' && event.data.from === 'carrier' && event.data.actor === 'ally'));

  rule.state.inventories.carrier.small = 1;
  rule.update(1 / 60, blankFrame([carrier], { carrier: { throw: true, aim: [1, 0, 0] } }));
  rule.update(1 / 60, blankFrame([carrier], {}, { blocked: () => true }));
  const impact = rule.state.clams.find(clam => clam.thrower === 'carrier' && clam.kind === 'small');
  assert.ok(impact);
  assert.ok(impact.velocity[0] < 0, 'the wall reverses horizontal motion');
  assert.ok(engine.events.some(event => event.kind === 'clam-collision'));
});

test('wall collision wins over basket contact and repeated impacts settle on the supplied elevated floor', () => {
  const { rule, engine } = makeRule();
  const actor = point('carrier', 0, [0, 0, 0]);
  rule.state.baskets[0].goal = [0, 0, 0];
  rule.state.inventories.carrier = { team: 0, small: 1, power: false };
  rule.update(1 / 60, blankFrame([actor], { carrier: { throw: true, aim: [0, 0, 1] } }));

  for (let i = 0; i < 3; i++) {
    rule.update(1 / 30, blankFrame([actor], {}, {
      blocked: () => true,
      floorAt: () => 2,
    }));
  }

  assert.equal(rule.state.baskets[0].barrierOpen, false, 'the wall blocks the clam before goal scoring');
  assert.equal(engine.counts[0], 100);
  const clam = rule.state.clams.find(item => item.thrower === 'carrier');
  assert.ok(clam?.grounded);
  assert.equal(clam.pos[1], 2, 'settled clams use the collision frame floor height');
});

test('Power Clam breaks the barrier for twenty points; clams score three and add half their window points as penalty on close', () => {
  const { rule, engine } = makeRule();
  const actor = point('p0', 0, [0, 0, 0]);
  rule.state.inventories.p0 = { team: 0, small: 0, power: true };
  rule.update(1 / 60, blankFrame([actor], { p0: { throw: true, aim: [0, 0, 1] } }));
  rule.update(0.2, blankFrame([actor]));
  assert.deepEqual(engine.counts, [100, 100], 'the drilling Power Clam has not opened the barrier');
  rule.update(1.2, blankFrame([actor]));
  assert.deepEqual(engine.counts, [80, 100]);
  assert.equal(rule.state.baskets[0].barrierOpen, true);
  assert.equal(rule.state.baskets[1].tucked, true, 'the opposite basket is tucked during the scoring window');

  rule.state.baskets[0].openTimer = 1;
  rule.state.inventories.p0.small = 1;
  rule.update(1 / 60, blankFrame([actor], { p0: { throw: true, aim: [0, 0, 1] } }));
  rule.update(0.2, blankFrame([actor]));
  assert.deepEqual(engine.counts, [77, 100]);
  assert.ok(Math.abs(rule.state.baskets[0].openTimer - (1 - 1 / 60 - 0.2 + 3)) < 1e-8, 'a regular clam restores three seconds');
  rule.state.inventories.p0.power = true;
  rule.update(1 / 60, blankFrame([actor], { p0: { throw: true, aim: [0, 0, 1] } }));
  rule.update(0.2, blankFrame([actor]));
  assert.deepEqual(engine.counts, [57, 100]);
  assert.equal(rule.state.baskets[0].openTimer, 10, 'a Power Clam restores ten seconds but the timer stays capped at ten');
  rule.update(10, blankFrame());
  assert.equal(rule.state.baskets[0].barrierOpen, false);
  assert.equal(rule.state.baskets[0].tucked, true);
  assert.equal(rule.state.baskets[1].tucked, false, 'the attacked team can counterattack after the basket closes');
  assert.equal(engine.penalties[0], 21.5, 'half of the 43 scored points is added, including all scoring-window clams');
  const counter = rule.state.clams.find(clam => clam.counterPower);
  assert.equal(counter?.team, 1);
  assert.equal(counter?.persistent, true);
  assert.equal(counter?.expiresIn, null);
});

test('scoreless overtime lasts 180 seconds, then awards a point by total generated Power Clams', () => {
  const { rule, engine } = makeRule();
  rule.state.generatedPower = [3, 2];
  assert.equal(rule.beginOvertime(), true);
  assert.equal(rule.state.overtime.mode, 'scoreless');
  engine.overtime = true;
  rule.update(1, blankFrame());
  assert.equal(rule.state.overtime.elapsed, 0, 'the normal update path does not double-step overtime');
  rule.updateOvertime(179.9, blankFrame());
  assert.equal(engine.winner, null);
  rule.updateOvertime(0.1, blankFrame());
  assert.equal(engine.winner, 0);
  assert.deepEqual(engine.counts, [99, 100]);
  assert.equal(engine.events.find(event => event.kind === 'finish')?.data.reason, 'clam-overtime-power-clam-tiebreak');
});

test('RankedEngine gives scoreless overtime 180 real seconds and advances both overtime clocks once', () => {
  const engine = new RankedEngine('clams', {
    id: 'clams-engine-ot',
    clams: { spawns: [], goals: [[0, 0, 1], [0, 0, -1]] },
  });
  engine.time = 0.1;
  engine.update(180);

  assert.equal(engine.overtime, true);
  assert.equal(engine.winner, null, '179.9 seconds of actual overtime is not enough to finish');
  assert.ok(Math.abs(engine.overtimeElapsed - 179.9) < 1e-7);
  assert.ok(Math.abs(engine.rule.state.overtime.elapsed - engine.overtimeElapsed) < 1e-7,
    'the engine and ClamsRule clocks stay aligned despite update() plus updateOvertime()');

  engine.update(0.1);
  assert.equal(engine.winner, 0);
  assert.equal(engine.reason, 'clam-overtime-power-clam-tiebreak');
  assert.ok(Math.abs(engine.overtimeElapsed - 180) < 1e-7);
  assert.ok(Math.abs(engine.rule.state.overtime.elapsed - 180) < 1e-7);
});

test('RankedEngine generates field clams every four seconds throughout scoreless overtime', () => {
  const engine = new RankedEngine('clams', {
    id: 'clams-engine-ot-spawns',
    clams: { spawns: Array.from({length:33}, (_,i)=>[i*3,0,0]), goals: [[0, 0, 1], [0, 0, -1]] },
  });
  assert.equal(engine.rule.state.clams.length, 30);
  engine.time = 0.1;
  engine.update(0.1);
  assert.equal(engine.overtime, true);

  engine.update(3.9);
  assert.equal(engine.rule.state.clams.length, 30, 'the interval is not shortened below four seconds');
  engine.update(0.1);
  assert.equal(engine.rule.state.clams.length, 33, 'scoreless overtime uses the four-second quick spawn interval');
});

test('comeback overtime gives the losing team twenty seconds to open its basket and ends at the exact deadline', () => {
  const { rule, engine } = makeRule();
  engine.counts = [40, 70];
  rule.state.scoredPoints = [60, 30];
  rule.state.inventories.lastChance = { team: 1, small: 0, power: true };
  assert.equal(rule.beginOvertime(), true);
  assert.equal(rule.state.overtime.losingTeam, 1);
  assert.equal(rule.state.overtime.opportunityTimer, 20);
  rule.updateOvertime(19.9, blankFrame());
  assert.equal(engine.winner, null);
  rule.updateOvertime(0.1, blankFrame());
  assert.equal(engine.winner, 0);
  assert.equal(engine.events.find(event => event.kind === 'finish')?.data.reason, 'clam-overtime-open-window-expired');
});

test('RankedEngine applies the twenty-second comeback deadline on real overtime time', () => {
  const engine = new RankedEngine('clams', {
    id: 'clams-engine-comeback-ot',
    clams: { spawns: [], goals: [[0, 0, 1], [0, 0, -1]] },
  });
  engine.time = 0.1;
  engine.counts = [40, 70];
  engine.rule.state.scoredPoints = [60, 30];
  engine.rule.state.inventories.lastChance = { team: 1, small: 0, power: true };
  engine.update(0.1);

  assert.equal(engine.overtime, true);
  assert.equal(engine.rule.state.overtime.opportunityTimer, 20);
  engine.update(19.9);
  assert.equal(engine.winner, null);
  assert.ok(Math.abs(engine.overtimeElapsed - 19.9) < 1e-7);
  assert.ok(Math.abs(engine.rule.state.overtime.elapsed - engine.overtimeElapsed) < 1e-7);

  engine.update(0.1);
  assert.equal(engine.winner, 0);
  assert.equal(engine.reason, 'clam-overtime-open-window-expired');
  assert.ok(Math.abs(engine.overtimeElapsed - 20) < 1e-7);
  assert.ok(Math.abs(engine.rule.state.overtime.elapsed - 20) < 1e-7);
});

test('the losing side loses overtime when its last Power Clam expires before the twenty-second opening window', () => {
  const { rule, engine } = makeRule();
  engine.counts = [40, 70];
  rule.state.scoredPoints = [60, 30];
  addGroundClam(rule, 'power', 1, [20, 0, 20], { expiresIn: 0.05 });
  assert.equal(rule.beginOvertime(), true);
  rule.updateOvertime(0.1, blankFrame());
  assert.equal(engine.winner, 0);
  assert.equal(engine.events.find(event => event.kind === 'finish')?.data.reason, 'clam-overtime-power-clams-lost');
});

test('an open scoring window can sustain overtime even when the losing side has no held Power Clam', () => {
  const { rule, engine } = makeRule();
  engine.counts = [40, 70];
  rule.state.scoredPoints = [60, 30];
  rule.state.baskets[1].barrierOpen = true;
  rule.state.baskets[1].openTimer = 0.2;
  rule.state.baskets[1].chancePoints = 20;
  assert.equal(rule.beginOvertime(), true);
  assert.equal(rule.state.overtime.opportunityTimer, null);
  rule.updateOvertime(0.1, blankFrame());
  assert.equal(engine.winner, null, 'the open scoring opportunity remains active');
  rule.updateOvertime(0.1, blankFrame());
  assert.equal(engine.winner, 0, 'overtime ends when the open basket closes');
  assert.equal(engine.events.find(event => event.kind === 'finish')?.data.reason, 'clam-overtime-chance-ended');
});

test('opening the comeback basket inside twenty seconds clears the opening deadline; losing the chance still ends overtime', () => {
  const { rule, engine } = makeRule();
  engine.counts = [40, 70];
  rule.state.scoredPoints = [60, 30];
  rule.state.inventories.lastChance = { team: 1, small: 0, power: true };
  rule.beginOvertime();
  const actor = point('lastChance', 1, [0, 0, 0]);
  rule.updateOvertime(17, blankFrame([actor], { lastChance: { throw: true, aim: [0, 0, -1] } }));
  rule.updateOvertime(0.2, blankFrame([actor]));
  rule.updateOvertime(1.2, blankFrame([actor]));
  assert.equal(engine.winner, null);
  assert.equal(rule.state.baskets[1].barrierOpen, true);
  assert.equal(rule.state.overtime.opportunityTimer, null);
  rule.updateOvertime(10, blankFrame());
  assert.equal(engine.winner, 0, 'the losing team did not take the lead before its scoring window ended');
  assert.equal(engine.events.find(event => event.kind === 'finish')?.data.reason, 'clam-overtime-chance-ended');
});

test('bot goals choose reachable clams, scoring throws, and defense at a threatened basket', () => {
  const { rule } = makeRule();
  const actor = point('bot', 0, [0, 0, 0]);
  const clam = addGroundClam(rule, 'small', null, [2, 0, 0]);
  const collectGoal = rule.botGoal(actor, blankFrame([actor]));
  assert.equal(collectGoal.action, 'collect');
  assert.deepEqual(collectGoal.pos, clam.pos);
  assert.deepEqual(collectGoal.aim, clam.pos, 'bot goals expose world-space points to ranked steering');
  rule.state.inventories.bot = { team: 0, small: 0, power: true };
  assert.equal(rule.botGoal(actor, blankFrame([actor])).action, 'throw');
  rule.state.baskets[0].tucked = true;
  assert.equal(rule.botGoal(actor, blankFrame([actor])).action, 'carry', 'a bot waits when its attacking basket is tucked');
  rule.state.baskets[0].tucked = false;
  rule.state.baskets[1].barrierOpen = true;
  assert.equal(rule.botGoal(actor, blankFrame([actor])).action, 'defend');
});

test('restore and removeActor preserve detached authority and drop the carried object', () => {
  const { rule } = makeRule();
  const actor = point('p0', 0, [3, 1, 2]);
  rule.state.inventories.p0 = { team: 0, small: 2, power: false };
  rule.update(1 / 60, blankFrame([actor]));
  const snapshot = rule.snapshot();
  const restored = makeRule().rule;
  restored.restore(snapshot);
  restored.removeActor('p0');
  assert.equal(restored.state.inventories.p0, undefined);
  assert.equal(restored.state.clams.filter(clam => clam.kind === 'small').length, 2);
  assert.notEqual(restored.state.clams, snapshot.clams);
});
