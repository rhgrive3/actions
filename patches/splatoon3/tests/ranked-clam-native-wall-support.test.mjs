import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

const f = await sourceLoadedActorFixture({ extraExports:
  "export { RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';" });

for (const hz of [30, 60, 120]) test(`real Level/Physics wall ricochets above a gap retain gravity until water loss, ${hz}Hz`, () => {
  const { G } = f;
  G.netm = null;
  // Narrow opposing solid walls, with an actual open gap between them. The
  // dimensions are a controlled regression stage, not a retail stage claim.
  G.level = new f.Level({ bounds: { minX: -10, maxX: 10, minZ: -50, maxZ: 50 },
    spawnPads: [[-5, 0, 0], [5, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-.06, -8, -1], max: [-.02, 8, 1] },
      { kind: 'box', min: [.02, -8, -1], max: [.06, 8, 1] },
    ] });
  G.physics = new f.Physics(G.level);
  const stage = { id: 'native-wall-gap', clams: { spawns: [], goals: [[0, 0, 40], [0, 0, -40]] } };
  const m = { actors: [], mode: 'clams', ranked: new f.RankedEngine('clams', stage) };
  G.match = m;
  const world = m.rankedWorld = new f.RankedWorld(f, m, stage);
  try {
    const e = m.ranked, r = e.rule;
    const c = r._newClam('power', 0, [0, 3, 0], { grounded: false, velocity: [4, 0, 0] });
    const frame = { actors: [], inputs: {}, fallDeathY: f.PLAYER.fallDeathY,
      floorAt: (...args) => world.floorAt(...args), blocked: (...args) => world.blocked(...args) };
    assert.equal(frame.floorAt(0, 0, 3), null);
    for (let i = 0; i < hz * 3 && c.bounces < 3; i++) e.update(1 / hz, frame);
    assert.ok(c.bounces >= 3, 'real segment/OBB collisions exercise the rebound cap');
    assert.equal(c.grounded, false, 'the real open gap cannot become support');
    for (let i = 0; i < hz * 3 && r.state.clams.length; i++) e.update(1 / hz, frame);
    assert.equal(r.state.clams.length, 0);
    assert.ok(e.events.some(e => e.kind === 'clam-lost'));
  } finally { world.dispose(); f.reset(); }
});
