import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: `
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
  export { createRankedStage } from './patches/splatoon3/runtime/ranked/stages.mjs';
  export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
` });
const plain = x => JSON.parse(JSON.stringify(x));
const worlds = ['tidewater', 'kelpline'].map(id => {
  const layout = f.MAP_LAYOUTS[id], level = new f.Level(layout, f.map3ArtColliders(layout));
  return { id, level, physics: new f.Physics(level), source: layout.map3 };
});

test('MAP3 rule targets retain authored storeys and use the opposing home for each attacking team', () => {
  for (const { id, level, source } of worlds) for (const mode of ['zones', 'tower', 'rainmaker', 'clams']) {
    const stage = f.createRankedStage({ level }, mode), engine = new f.RankedEngine(mode, stage);
    assert.equal(engine.mode, mode);
    const sourceGoals = source.rules.rainmaker.goals;
    assert.deepEqual(plain(stage.rainmaker.goals), plain([sourceGoals[1], sourceGoals[0]]));
    assert.deepEqual(plain(stage.clams.goals), plain(source.rules.clams.baskets.slice().reverse()));
    for (const team of [0, 1]) {
      const goal = stage.rainmaker.goals[team], home = source.spawns[team].point;
      assert.ok(goal[2] * home[2] < 0, `${id} team ${team} attacks across center`);
      assert.equal(stage.rainmaker.checkpoints[team].length, 1);
      assert.ok(Math.abs(stage.rainmaker.checkpoints[team][0][2]) < Math.abs(goal[2]));
    }
    const points = [...stage.zones.map(z => z.center), stage.rainmaker.center,
      ...stage.rainmaker.goals, ...stage.rainmaker.checkpoints.flat(), ...stage.clams.goals, ...stage.clams.spawns];
    for (const point of points) {
      const support = level.groundHeight(point[0], point[2], point[1] + .08);
      assert.ok(Number.isFinite(support), `${id}/${mode} must have real support: ${point}`);
      assert.ok(Math.abs(support - point[1]) < 1e-7,
        `${id}/${mode} exact storey has physical support: ${point}`);
    }
    stage.zones.forEach((zone, i) => {
      assert.equal(zone.center[1], source.rules.zones[i].y);
      assert.equal(zone.heightTolerance, .35, 'another storey cannot score into the zone');
    });
    assert.deepEqual(plain(stage.tower.path[Math.floor(stage.tower.path.length / 2)]), plain(stage.tower.path[stage.tower.centerIndex]));
    assert.ok(Math.abs(stage.tower.path[stage.tower.centerIndex][0]) < 1e-8);
    assert.ok(Math.abs(stage.tower.path[stage.tower.centerIndex][2]) < 1e-8);
    const maximum = Math.max(...stage.tower.path.map(p => p[1]));
    assert.ok(maximum <= Math.max(...source.rules.tower.path.map(p => p[1])) + .400001,
      `${id} tower must stay on its authored route under overhead art; got y=${maximum}`);
  }
});

test('actual art and terrain clear the moving tower deck, mast and four rider capsules along both complete routes', t => {
  let samples = 0, capsules = 0, solidProbes = 0;
  const p = new f.THREE.Vector3(), query = [];
  for (const { id, level, physics } of worlds) {
    const { path, halfSize: half } = f.createRankedStage({ level }, 'tower').tower;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz) || 1;
      const n = Math.max(1, Math.ceil(Math.hypot(...b.map((v, k) => v - a[k])) / .2));
      for (let j = 0; j <= n; j++) {
        const fraction = j / n, x = a[0] + dx * fraction, y = a[1] + (b[1] - a[1]) * fraction, z = a[2] + dz * fraction;
        const at = (sx, sy, sz) => p.set(x + sx * dz / length + sz * dx / length, y + sy, z - sx * dx / length + sz * dz / length);
        for (const side of [-1, 0, 1]) for (const forward of [-1, 0, 1]) for (const lift of [-.239, -.12, -.001]) {
          at(side * half, lift, forward * half);
          const ids = level.queryBlocks(p.x - .01, p.z - .01, p.x + .01, p.z + .01, query);
          assert.ok(!ids.some(k => level.blocks[k].solid && level.pointInBlock(level.blocks[k], p, 0)), `${id} deck at ${p.toArray()}`);
          solidProbes++;
        }
        for (const sx of [-.28, 0, .28]) for (const sz of [-.28, 0, .28]) for (const sy of [.01, .8, 2.009]) {
          at(sx, sy, sz);
          const ids = level.queryBlocks(p.x - .01, p.z - .01, p.x + .01, p.z + .01, query);
          assert.ok(!ids.some(k => level.blocks[k].solid && level.pointInBlock(level.blocks[k], p, 0)), `${id} mast at ${p.toArray()}`);
          solidProbes++;
        }
        for (const sx of [-.9, .9]) for (const sz of [-.9, .9]) {
          at(sx, .02, sz);
          assert.ok(physics.bodyFits(p, .35, .35, 1.45, false), `${id} rider at ${p.toArray()}`);
          capsules++;
        }
        samples++;
      }
    }
  }
  t.diagnostic(JSON.stringify({ samples, solidProbes, capsules, scope: 'composed Level/Physics and art colliders; not a human balance test' }));
});
