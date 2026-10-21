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
  assert.ok(f.MAP_LAYOUTS.range, 'practice range remains registered outside battle stage selection');
  assert.deepEqual(
    Object.keys(f.MAP_LAYOUTS).filter(id => id !== 'range').sort(),
    MAP_IDS.slice().sort(),
    'only battle stages are required to provide ranked objectives',
  );
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
  const state = { target: null, viewport: [0, 0, 1024, 1024], scissor: [0, 0, 1024, 1024], scissorTest: false };
  return {
    state,
    scissorClears: [],
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => state.target,
    setRenderTarget(target) { state.target = target; },
    getViewport: out => out.set(...state.viewport),
    setViewport(...args) { state.viewport = args; },
    getScissor: out => out.set(...state.scissor),
    setScissor(...args) { state.scissor = args; },
    getScissorTest: () => state.scissorTest,
    setScissorTest(enabled) { state.scissorTest = enabled; },
    getClearColor: color => color.setHex(0),
    getClearAlpha: () => 1,
    setClearColor() {},
    clear() { if (state.scissorTest) this.scissorClears.push(state.scissor.slice()); },
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

test('a calibrated floor band excludes box tops and other storeys from zone scoring and capture paint', () => {
  const { level, stage } = makeMap('tidewater');
  stage.zones = [{ center: stage.zones[0].center, size: [13, 11] }];
  const paint = new f.PaintSystem(paintRenderer(f.THREE), level, { atlasSize: 1024, cell: 0.5 });
  f.G.paint = paint;
  const api = { G: f.G, THREE: f.THREE, Hit: f.Hit };
  const projected = new f.RankedWorld(api, { mode: 'zones', actors: [] }, stage);
  const otherFloors = projected._zoneCells[0].filter(cell => Math.abs(cell.center.y - stage.zones[0].center[1]) > 0.75)
    .map(cell => cell.cell);
  assert.ok(otherFloors.length > 0, 'the unbounded projected area really contains elevated geometry');
  projected.dispose();
  stage.zones[0].heightTolerance = 0.75;
  const band = new f.RankedWorld(api, { mode: 'zones', actors: [] }, stage);
  assert.ok(band._zoneCells[0].every(cell => Math.abs(cell.center.y - stage.zones[0].center[1]) <= 0.75));
  band.captureZone(0, 0);
  assert.ok(band.zoneCoverage()[0][0] >= 0.99);
  assert.ok(otherFloors.every(cell => paint.grid[cell] === 0), 'capturing the marked floor must not paint another storey');
  band.dispose(); paint.dispose?.();
});

test('moving tower paint face fits every map atlas and follows a Physics support face', () => {
  for (const id of MAP_IDS) {
    const { level, physics, stage } = makeMap(id);
    const paint = new f.PaintSystem(paintRenderer(f.THREE), level, { atlasSize: 1024, maxDensity: 18, cell: 0.25 });
    f.G.paint = paint;
    const world = new f.RankedWorld({ G: f.G, THREE: f.THREE, Physics: f.Physics, Hit: f.Hit }, { mode: 'tower', actors: [] }, stage);
    assert.equal(world.towerPaintReady, true, `${id} has a dynamic tower paint region`);
    const atlas = world.towerPaintFace.atlas;
    for (const face of paint.paintFaces) {
      if (face === world.towerPaintFace || !face.atlas) continue;
      const other = face.atlas;
      const overlaps = atlas.x < other.x + other.w && atlas.x + atlas.w > other.x
        && atlas.y < other.y + other.h && atlas.y + atlas.h > other.y;
      assert.equal(overlaps, false, `${id} dynamic atlas rectangle does not overwrite static face ${face.id}`);
    }
    const p = world.towerBlock.center;
    const support = new f.GroundHit();
    physics.groundProbe(p.x, world._towerDeckTop, p.z, 0.4, 0.5, 0.2, support, false);
    assert.equal(support.hit, true, `${id} tower deck is a Physics floor`);
    assert.equal(support.block, world.towerBlockId);
    assert.equal(support.face, world.towerPaintFace.id, `${id} floor contact resolves to the dynamic paint face`);
    world.dispose();
    paint.dispose?.();
    f.G.paint = null;
  }
});

test('tower world installs a live moving collider and carries only riders inside its deck volume', () => {
  const { level, physics, stage } = makeMap('tidewater');
  const renderer = paintRenderer(f.THREE);
  const paint = new f.PaintSystem(renderer, level, { atlasSize: 1024, cell: 0.25 });
  f.G.paint = paint;
  const actor = {
    nid: 'rider-1', team: 0, slot: 0, alive: true, grounded: true,
    pos: new f.THREE.Vector3(), ground: new f.GroundHit(), smoothY: 0,
    character: { root: { position: new f.THREE.Vector3() } },
  };
  const match = { mode: 'tower', actors: [actor] };
  const world = new f.RankedWorld({ G: f.G, THREE: f.THREE, Physics: f.Physics, Hit: f.Hit }, match, stage);
  assert.equal(world.towerPaintReady, true, 'the tower top is registered as a native paintable turf face');
  assert.equal(level.faces[world.towerPaintFace.id], world.towerPaintFace);
  assert.ok(paint.paintFaces.includes(world.towerPaintFace));
  assert.ok(world.towerInkMesh.visible, 'the dynamic deck samples the native PaintSystem atlas');
  assert.ok(world.towerPaintFace.atlas.h <= paint.size - world.towerPaintFace.atlas.y,
    'the dynamic face uses the unused atlas strip without moving static rectangles');

  const initial = stage.tower.path[stage.tower.centerIndex];
  const face = world.towerPaintFace;
  const splatAt = face.origin.clone()
    .addScaledVector(face.u, face.su * 0.5 + 0.68)
    .addScaledVector(face.v, face.sv * 0.5)
    .addScaledVector(face.n, 0.06);
  const owned = paint.splat(splatAt, 0.58, 0, { face: face.id, seed: 0.37, kind: 'blast', instant: true });
  assert.ok(owned > 0, 'native PaintSystem.splat claims turf cells on the moving floor');
  assert.equal(paint.sampleWorld(face.id, splatAt), 1, 'face sampling sees team ownership');
  assert.ok(paint.coverage()[0] > 0, 'the moving floor contributes to native team turf totals');

  const poleId = world.towerPoleBlockId;
  assert.equal(level.blocks[poleId].tag, 'ranked-tower-pole');
  const poleCenter = level.blocks[poleId].center;
  const poleRay = physics.segment(
    new f.THREE.Vector3(poleCenter.x - 0.6, poleCenter.y, poleCenter.z),
    new f.THREE.Vector3(poleCenter.x + 0.6, poleCenter.y, poleCenter.z),
    new f.Hit(), false,
  );
  assert.equal(poleRay.hit, true, 'the visible central pole has a live Physics collider');
  assert.equal(poleRay.block, poleId);
  assert.equal(level.blocks[poleId].faces.every(id => id === -1), true, 'the pole collider itself is not paintable');

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
  const movedSplatAt = face.origin.clone()
    .addScaledVector(face.u, face.su * 0.5 + 0.68)
    .addScaledVector(face.v, face.sv * 0.5)
    .addScaledVector(face.n, 0.06);
  assert.equal(paint.sampleWorld(face.id, movedSplatAt), 1, 'ink ownership stays on the same local floor cells as the tower moves');

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
  const oldFaceCount = level.faces.length - 1;
  const oldPaintCellCount = paint.grid.length - face.nu * face.nv;
  world.dispose();
  assert.equal(level.blocks.some(block => block.id === blockId && block.tag === 'ranked-tower' && block.solid), false);
  assert.equal(level.blocks.some(block => block.tag === 'ranked-tower-pole' && block.solid), false);
  assert.equal(level.faces.length, oldFaceCount, 'disposing the moving world unregisters its dynamic face');
  assert.equal(paint.grid.length, oldPaintCellCount, 'disposing the moving world restores the prior native paint grid');
  assert.ok(renderer.scissorClears.some(rect => rect[0] === face.atlas.x && rect[1] === face.atlas.y
    && rect[2] === face.atlas.w && rect[3] === face.atlas.h), 'disposal clears the dynamic ink atlas region for a rematch');
  paint.dispose?.();
  f.G.paint = null;
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
