import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({
  fullRuntime: true,
  extraExports: `
    export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
    export { createRankedStage, RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';
  `,
});

const MAP_IDS = ['tidewater', 'kelpline', 'halyard', 'cargo', 'scorch'];
const closeTo = (a, b, epsilon = 1e-5) => Math.abs(a - b) <= epsilon;

function makeMap(id) {
  const level = new f.Level(f.MAP_LAYOUTS[id]);
  const physics = new f.Physics(level);
  Object.assign(f.G, { level, physics, scene: new f.THREE.Scene(), time: 0 });
  return { level, physics, stage: f.createRankedStage(f.G) };
}

function objectivePoints(stage) {
  return [
    ...stage.zones.map(zone => zone.center),
    stage.rainmaker.center,
    ...stage.rainmaker.checkpoints.flat(),
    ...stage.rainmaker.goals,
    ...stage.clams.spawns,
    ...stage.clams.goals,
  ];
}

function assertMirrorPairs(team0, team1, label) {
  assert.equal(team0.length, team1.length, `${label} count`);
  for (let i = 0; i < team0.length; i++) {
    assert.ok(closeTo(team0[i][0], -team1[i][0]), `${label} x mirror at ${i}`);
    assert.ok(closeTo(team0[i][2], -team1[i][2]), `${label} z mirror at ${i}`);
  }
}

function assertSymmetric(points, label) {
  for (const point of points) {
    assert.ok(points.some(other => closeTo(point[0], -other[0]) && closeTo(point[2], -other[2])),
      `${label} contains the 180-degree mirror of ${point}`);
  }
}

function assertTowerSweepClear(level, stage) {
  const path = stage.tower.path;
  const half = stage.tower.halfSize;
  const point = new f.THREE.Vector3();
  const query = [];
  for (let segment = 1; segment < path.length; segment++) {
    const a = path[segment - 1], b = path[segment];
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = Math.max(1, Math.ceil(distance / 0.2));
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const length = Math.hypot(dx, dz) || 1;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = a[0] + dx * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + dz * t;
      for (const side of [-1, 0, 1]) for (const forward of [-1, 0, 1]) {
        const localX = side * half, localZ = forward * half;
        const px = x + localX * dz / length + localZ * dx / length;
        const pz = z - localX * dx / length + localZ * dz / length;
        for (const lift of [0.005, 0.12, 0.235]) {
          point.set(px, y - 0.12 + lift, pz);
          const ids = level.queryBlocks(px - 0.01, pz - 0.01, px + 0.01, pz + 0.01, query);
          const blocking = ids.find(id => level.pointInBlock(level.blocks[id], point, 0));
          assert.equal(blocking, undefined,
            `${stage.id} tower deck intersects ${level.blocks[blocking]?.tag || blocking} at ${px.toFixed(2)},${point.y.toFixed(2)},${pz.toFixed(2)}`);
        }
      }
    }
  }
}

test('ranked stage coordinates use reachable live floors, symmetric routes, and clear swept tower volumes', () => {
  assert.deepEqual(Object.keys(f.MAP_LAYOUTS).sort(), MAP_IDS.slice().sort());
  for (const id of MAP_IDS) {
    const { level, physics, stage } = makeMap(id);
    assert.equal(stage.id, id);
    assert.match(stage.calibration, /not retail stage collision data/);
    assert.ok(stage.tower.path.length > 2);
    assert.ok(stage.tower.centerIndex > 0 && stage.tower.centerIndex < stage.tower.path.length - 1);
    assert.ok(stage.tower.path.at(-1)[2] > stage.tower.path[0][2], `${id} team 0 advances toward +Z`);
    assertMirrorPairs(stage.rainmaker.checkpoints[0], stage.rainmaker.checkpoints[1], `${id} Rainmaker checkpoints`);
    assertMirrorPairs([stage.rainmaker.goals[0]], [stage.rainmaker.goals[1]], `${id} Rainmaker goals`);
    assertSymmetric(stage.clams.spawns, `${id} clam spawns`);

    for (const [index, point] of objectivePoints(stage).entries()) {
      assert.ok(Number.isFinite(level.groundHeight(point[0], point[2])), `${id} objective ${index} has live floor`);
      const hit = new f.GroundHit();
      physics.groundProbe(point[0], point[1] + 0.2, point[2], 0.8, 0.5, 0.3, hit, false);
      assert.equal(hit.hit, true, `${id} objective ${index} is reachable by the live ground probe`);
    }
    assertTowerSweepClear(level, stage);
  }
});

function paintRenderer(THREE) {
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => null,
    setRenderTarget() {},
    getClearColor: color => color.setHex(0),
    getClearAlpha: () => 1,
    setClearColor() {},
    clear() {},
    THREE,
  };
}

test('zone capture uses the live paint grid and reaches full exposed turf coverage', () => {
  const { level, stage } = makeMap('tidewater');
  const paint = new f.PaintSystem(paintRenderer(f.THREE), level, { atlasSize: 1024, cell: 0.5 });
  f.G.paint = paint;
  const world = new f.RankedWorld({ G: f.G, THREE: f.THREE, Hit: f.Hit }, { mode: 'zones', actors: [] }, stage);

  assert.ok(world._zoneCells.every(cells => cells.length > 0));
  assert.ok(world._zoneCells.every(cells => cells.every(entry => entry.face.n.y > 0.7 && !paint.dead[entry.cell])));
  world.captureZone(0, 0);
  world.captureZone(1, 1);
  const coverage = world.zoneCoverage();
  assert.ok(coverage[0][0] >= 0.7, `team 0 captures ${coverage[0][0] * 100}% of zone 0`);
  assert.ok(coverage[1][1] >= 0.7, `team 1 captures ${coverage[1][1] * 100}% of zone 1`);
  assert.equal(world.towerBlock, undefined, 'zones mode has no physical tower');
  assert.equal(world.zoneGroup.children.length, stage.zones.length);
  world.dispose();
  paint.dispose?.();
});

test('tower world installs a live moving collider and carries only riders inside its deck volume', () => {
  const { level, physics, stage } = makeMap('tidewater');
  const actor = {
    nid: 'rider-1', team: 0, slot: 0, alive: true, grounded: true,
    pos: new f.THREE.Vector3(), ground: new f.GroundHit(), smoothY: 0,
    character: { root: { position: new f.THREE.Vector3() } },
  };
  const match = { mode: 'tower', actors: [actor] };
  const world = new f.RankedWorld({ G: f.G, THREE: f.THREE, Physics: f.Physics, Hit: f.Hit }, match, stage);
  const initial = stage.tower.path[stage.tower.centerIndex];
  actor.pos.set(initial[0], initial[1], initial[2] + 0.2);
  physics.groundProbe(actor.pos.x, actor.pos.y + 0.2, actor.pos.z, 0.8, 0.5, 0.3, actor.ground, false);
  assert.equal(actor.ground.hit, true);
  assert.equal(actor.ground.block, world.towerBlockId);
  actor._rankedOnTower = true;

  const targetIndex = Math.min(stage.tower.path.length - 1, stage.tower.centerIndex + 4);
  const target = stage.tower.path[targetIndex];
  const engine = { rule: { state: { position: target.slice(), progress: targetIndex / (stage.tower.path.length - 1) } } };
  world.beforeActors(engine, 1 / 60);
  assert.ok(closeTo(actor.pos.z, target[2] + 0.2, 1e-4), 'the moving deck displaces a grounded rider');
  assert.equal(actor._rankedOnTower, true);

  actor.grounded = false;
  actor.ground.hit = false;
  const jumpTarget = stage.tower.path[Math.min(stage.tower.path.length - 1, targetIndex + 2)];
  engine.rule.state.position = jumpTarget.slice();
  engine.rule.state.progress = Math.min(1, (targetIndex + 2) / (stage.tower.path.length - 1));
  world.beforeActors(engine, 1 / 60);
  assert.equal(actor._rankedOnTower, true, 'jump latch persists while the actor stays over the deck');

  actor.pos.x = jumpTarget[0] + stage.tower.halfSize + 1;
  const beforeExit = actor.pos.clone();
  world.beforeActors(engine, 1 / 60);
  assert.equal(actor._rankedOnTower, false, 'jump latch clears after leaving the deck volume');
  assert.ok(actor.pos.distanceTo(beforeExit) < 1e-6, 'an actor outside the deck is not carried');

  const blockId = world.towerBlockId;
  world.dispose();
  assert.equal(level.blocks.some(block => block.id === blockId && block.tag === 'ranked-tower' && block.solid), false);
});

test('objective visuals stay mode-specific and Rainmaker markers reflect rule state', () => {
  const { level, stage } = makeMap('tidewater');
  const rainmaker = new f.RankedWorld({ G: f.G, THREE: f.THREE }, { mode: 'rainmaker', actors: [] }, stage);
  rainmaker.update({ rule: { state: {
    pos: stage.rainmaker.center.slice(), carrier: null, dropped: false,
    barrier: { active: true, health: 0, max: 1000, team: 1 },
    checkpoint: { passed: [[true, false], [false, false]], goalOpen: [false, true] },
  } } }, 1 / 60);
  assert.equal(rainmaker.towerBlock, undefined);
  assert.equal(rainmaker.zoneGroup.children.length, 0);
  assert.equal(rainmaker.rainmakerMarkers.checkpoints.length, 4);
  assert.equal(rainmaker.rainmakerMarkers.goals.length, 2);
  assert.equal(rainmaker.rainmakerCore.position.y, 1);
  assert.ok(rainmaker.rainmakerShield.scale.x > 1, 'a pressured barrier grows to its collision radius');
  assert.equal(rainmaker.rainmakerShield.material.color.getHex(), rainmaker.teamInk[1]);
  assert.equal(rainmaker.rainmakerMarkers.checkpoints[0].group.userData.passed, true);
  assert.equal(rainmaker.rainmakerMarkers.goals[1].group.userData.open, true);
  rainmaker.dispose();

  const clams = new f.RankedWorld({ G: f.G, THREE: f.THREE }, { mode: 'clams', actors: [] }, stage);
  clams.update({ rule: { state: { clams: [{ id: 'c1', kind: 'small', pos: [1, 0, 1], carrier: null }], inventories: {}, baskets: [] } } }, 1 / 60);
  assert.ok(clams.baskets.length === 2);
  assert.equal(clams.rainmaker, undefined);
  assert.equal(clams.towerBlock, undefined);
  assert.equal(clams._clamMarkers.get('c1').mesh.visible, true);
  clams.dispose();
  assert.equal(level.blocks.some(block => block.tag === 'ranked-tower' && block.solid), false);
});
