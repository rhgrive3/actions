import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine } from '../runtime/ranked/engine.mjs';

const stage = { id: 'air-support', clams: { spawns: [], goals: [[0, 0, 40], [0, 0, -40]] } };
const frame = (floorAt, blocked = () => false) => ({ actors: [], inputs: {}, floorAt, blocked, fallDeathY: -5 });
function setup(team) {
  const e = new RankedEngine('clams', stage);
  e.counts[team] = 70; e.counts[1 - team] = 50; e.leader = 1 - team;
  e.rule.state.scoredPoints[team] = 30; e.rule.state.scoredPoints[1 - team] = 50;
  return e;
}

for (const hz of [30, 60, 120]) for (const team of [0, 1]) {
  test(`three real projectile collisions over a gap cannot pin overtime: ${hz}Hz/team${team}`, () => {
    const e = setup(team), r = e.rule, dt = 1 / hz;
    const c = r._newClam('power', team, [12, 3, 0], { grounded: false, velocity: [2, 0, 0] });
    let contacts = 0;
    const f = frame(() => null, () => ++contacts <= 3);
    e.time = dt; e.update(dt, f);
    assert.equal(e.overtime, true);
    while (c.bounces < 3) e.update(dt, f);
    assert.equal(c.grounded, false, 'collision budget cannot manufacture a floor');
    const replica = new RankedEngine('clams', stage);
    assert.equal(replica.restore(e.snapshot()), true);
    const falling = frame(() => null);
    for (let i = 0; i < hz * 2; i++) { e.update(dt, falling); replica.update(dt, falling); }
    assert.equal(r.state.clams.length, 0);
    assert.equal(e.winner, 1 - team);
    assert.equal(e.reason, 'clam-overtime-power-clams-lost');
    assert.deepEqual(replica.snapshot(), e.snapshot());
  });
}

test('third reflection cannot teleport a Power Clam to a distant lower storey', () => {
  const e = setup(0), r = e.rule;
  const c = r._newClam('power', 0, [0, 3, 0], { grounded: false, bounces: 2, velocity: [2, -1, 0] });
  let contacts = 0;
  const f = frame(() => -3, () => contacts++ === 0);
  e.update(1 / 60, f);
  assert.equal(c.grounded, false);
  assert.equal(c.pos[1], 3, 'reflection preserves the actual collision position');
  for (let i = 0; i < 120; i++) e.update(1 / 60, f);
  assert.equal(c.grounded, true); assert.equal(c.pos[1], -3);
});

test('third reflection still settles at a nearby real floor', () => {
  const e = setup(0), c = e.rule._newClam('small', null, [0, .1, 0],
    { grounded: false, bounces: 2, velocity: [2, -1, 0] });
  e.update(1 / 60, frame(() => 0, () => true));
  assert.equal(c.grounded, true); assert.equal(c.pos[1], 0);
});

for (const hz of [30, 60, 120]) test(`catching a Power Clam over a gap drops carried small clams into gravity, ${hz}Hz`, () => {
  const e = setup(0), r = e.rule;
  const receiver = { id: 'receiver', team: 0, pos: [0, 3, 0], alive: true, grounded: false };
  r.state.inventories.receiver = { team: 0, small: 3, power: false };
  // Genuine flight -> swept capsule catch -> inventory replacement path.
  r._newClam('power', 0, [0, 3.9, -.2], { grounded: false, thrower: 'passer', ownerTeam: 0, velocity: [0, 0, 12] });
  e.update(1 / hz, { ...frame(() => null), actors: [receiver] });
  assert.equal(r.state.inventories.receiver.power, true);
  assert.equal(r.state.inventories.receiver.small, 0);
  const drops = r.state.clams.filter(c => c.kind === 'small');
  assert.equal(drops.length, 3);
  assert.ok(drops.every(c => c.grounded === false), 'airborne inventory cannot create grounded pickups');
  assert.equal(r.state.inventories.receiver.small, 0, 'no same-tick recapture of floating drops');
  for (let i = 0; i < hz * 2; i++) e.update(1 / hz, frame(() => null));
  assert.equal(r.state.clams.length, 0);
});

test('small-clam replacement keeps dry drops and does not snap air drops onto a lower floor', () => {
  for (const [height, grounded] of [[0, true], [3, false]]) {
    const e = setup(0), r = e.rule;
    r.state.inventories.holder = { team: 0, small: 3, power: false };
    r._dropSmallInventory('holder', [0, height, 0], 0, frame(() => 0));
    assert.equal(r.state.clams.length, 3);
    for (const c of r.state.clams) { assert.equal(c.grounded, grounded); assert.equal(c.pos[1], height); }
  }
});
