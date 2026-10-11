import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine, RANKED_MODES } from '../runtime/ranked/engine.mjs';

const stage = {
  id: 'ranked-engine-fixture',
  zones: [{ center: [0, 0, 0], size: [4, 4] }],
  tower: {
    path: [[-10, 0, 0], [0, 0, 0], [10, 0, 0]], centerIndex: 1,
    checkpoints: [[], []], speed: 2, halfSize: 1.4,
  },
  rainmaker: {
    center: [0, 0, 0], checkpoints: [[], []],
    goals: [[10, 0, 0], [-10, 0, 0]], retreatZ: [-5, 5],
  },
  clams: { spawns: [[0, 0, 0]], goals: [[10, 0, 0], [-10, 0, 0]] },
};

const checkpointStage = {
  ...stage,
  id: 'ranked-engine-checkpoint-fixture',
  tower: {
    ...stage.tower,
    checkpoints: [
      [{ progress: 0.25, count: 1 }, { progress: 0.7, count: 2 }],
      [{ progress: 0.5, count: 3 }],
    ],
  },
};

const neutralFrame = {
  actors: [], inputs: {}, zoneCoverage: [[0, 0]], barrierHits: [],
};

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `expected ${actual} to be within 1e-8 of ${expected}`);

test('all four ranked modes start at 300 seconds and share one elapsed clock', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const engine = new RankedEngine(mode, stage);
    assert.equal(engine.time, 300);
    assert.equal(engine.elapsed, 0);
    engine.update(1.25, neutralFrame);
    closeTo(engine.time, 298.75);
    closeTo(engine.elapsed, 1.25);
    assert.equal(engine.overtime, false);
    assert.deepEqual(engine.counts, [100, 100]);
  });
});

function prepareLastFrameScore(engine) {
  engine.counts = [1, 100];
  engine.leader = 0;
  engine.time = 1 / 60;

  if (engine.mode === 'zones') {
    // The zone becomes fully controlled on the final frame and completes its
    // 36-frame count interval at the exact deadline.
    engine.rule.state.countClock = 0.6 - 1 / 60;
    return { ...neutralFrame, zoneCoverage: [[0.7, 0.3]] };
  }
  if (engine.mode === 'tower') {
    engine.rule.state.pathDistance = 19.98;
    engine.rule.state.position = [9.98, 0, 0];
    return { ...neutralFrame, actors: [{ id: 'last-frame-rider', team: 0, pos: [9.98, 2, 0], alive: true, grounded: true, onTower: true }] };
  }
  if (engine.mode === 'rainmaker') {
    engine.rule.state.barrier.active = false;
    engine.rule.state.carrier = 'last-frame-carrier';
    engine.rule.state.carrierTeam = 0;
    return { ...neutralFrame, actors: [{ id: 'last-frame-carrier', team: 0, pos: [10, 0, 0], alive: true, grounded: true }] };
  }

  const basket = engine.rule.state.baskets[0];
  basket.barrierOpen = true;
  basket.openTimer = 10;
  // A small clam crosses the open goal during the final clock interval.
  engine.rule.state.clams = [{
    id: 'last-frame-clam', kind: 'small', team: null, ownerTeam: 0, thrower: 'thrower',
    pos: [10, 0.55, 0], velocity: [0, 0, 0], grounded: false,
    age: 0, expiresIn: 10, persistent: false, counterPower: false, bounces: 0,
  }];
  return neutralFrame;
}

test('a score that reaches knockout on the deadline frame wins before the time result', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const engine = new RankedEngine(mode, stage);
    const frame = prepareLastFrameScore(engine);
    engine.update(1 / 60, frame);
    assert.equal(engine.time, 0);
    assert.equal(engine.winner, 0);
    assert.equal(engine.knockout, true);
    assert.notEqual(engine.reason, 'time');
    assert.equal(engine.overtime, false);
  });
});

test('an unopposed deadline awards the current count lead when the rule has no overtime opportunity', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const engine = new RankedEngine(mode, stage);
    engine.counts = [90, 100];
    engine.leader = 0;
    engine.time = 1 / 60;
    if (mode === 'clams') engine.rule.state.scoredPoints[0] = 3;
    engine.update(1 / 60, neutralFrame);
    assert.equal(engine.time, 0);
    assert.equal(engine.overtime, false);
    assert.equal(engine.winner, 0);
    assert.equal(engine.reason, 'time');
  });
});

test('an overtime comeback requires a strict count lead and is awarded consistently in every mode', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const engine = new RankedEngine(mode, stage);
    engine.overtime = true;
    engine.overtimeTeam = 1;
    engine.counts = [40, 41];
    engine.leader = 0;

    engine.score(1, 1);
    assert.deepEqual(engine.counts, [40, 40]);
    assert.equal(engine.winner, null);
    engine.score(1, 1);
    assert.deepEqual(engine.counts, [40, 39]);
    assert.equal(engine.winner, 1);
    assert.equal(engine.reason, 'comeback');
  });
});

test('scores pay an existing penalty before lowering the match count', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const engine = new RankedEngine(mode, stage);
    engine.addPenalty(0, 2);
    engine.score(0, 1);
    assert.equal(engine.penalties[0], 1);
    assert.equal(engine.counts[0], 100);
    engine.score(0, 2);
    assert.equal(engine.penalties[0], 0);
    assert.equal(engine.counts[0], 99);
  });

  const zones = new RankedEngine('zones', stage);
  zones.addPenalty(0, 1);
  zones.score(0, 1, { simultaneousLastPenalty: true });
  assert.equal(zones.penalties[0], 0);
  assert.equal(zones.counts[0], 99);
});

function corruptRuleSnapshot(mode, snapshot) {
  const bad = structuredClone(snapshot);
  if (mode === 'zones') bad.rule.zones[0].team = 2;
  else if (mode === 'tower') bad.rule.pathDistance = -1;
  else if (mode === 'rainmaker') bad.rule.carrierTeam = 2;
  else bad.rule.baskets[0].team = 2;
  return bad;
}

function engineState(engine) {
  return { snapshot: engine.snapshot(), events: structuredClone(engine.events) };
}

test('snapshot restore accepts valid state and rejects malformed rule state atomically', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const source = new RankedEngine(mode, stage);
    source.update(0.1, neutralFrame);
    const snapshot = source.snapshot();
    const follower = new RankedEngine(mode, stage);
    assert.equal(follower.restore(snapshot), true);
    assert.deepEqual(follower.snapshot(), snapshot);

    const before = engineState(follower);
    assert.equal(follower.restore(corruptRuleSnapshot(mode, snapshot)), false);
    assert.deepEqual(engineState(follower), before);
  });
});

test('snapshot restore rejects stale revisions and a different match stage without changing local state', async t => {
  for (const mode of RANKED_MODES) await t.test(mode, () => {
    const engine = new RankedEngine(mode, stage);
    engine.update(0.1, neutralFrame);
    const stale = engine.snapshot();
    engine.update(0.1, neutralFrame);
    const before = engineState(engine);

    assert.equal(engine.restore(stale), false);
    assert.deepEqual(engineState(engine), before);

    const wrongStage = structuredClone(stale);
    wrongStage.stage = 'other-ranked-match';
    assert.equal(engine.restore(wrongStage), false);
    assert.deepEqual(engineState(engine), before);
  });
});

test('tower snapshots must match the checkpoint dimensions of the same stage', () => {
  const source = new RankedEngine('tower', checkpointStage);
  source.update(0.1, neutralFrame);
  const snapshot = source.snapshot();
  const follower = new RankedEngine('tower', checkpointStage);
  assert.equal(follower.restore(snapshot), true);
  assert.deepEqual(follower.snapshot(), snapshot);

  const corruptions = [
    bad => { bad.rule.checkpointProgress[0].pop(); },
    bad => { bad.rule.checkpointCleared[1].push(false); },
    bad => { bad.rule.checkpointLossSeconds[0] = []; },
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(snapshot);
    corrupt(bad);
    const before = engineState(follower);
    assert.equal(follower.restore(bad), false);
    assert.deepEqual(engineState(follower), before);
  }
});
