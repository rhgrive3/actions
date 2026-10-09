import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

for (const surface of ['wall', 'occluded-floor']) test(`native ${surface} body and ancillary paint change ownership without turf or special credit`, async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, V } = makePaintWorld(f, { wall: surface === 'wall', occluded: surface === 'occluded-floor' });
  const owner = f.make('shooter'), onWall = surface === 'wall';
  const face = onWall ? 1 : 0;
  const point = onWall ? V(0, 10, 8) : V(0, 0, 5), normal = onWall ? V(0, 0, -1) : V(0, 1, 0);
  f.G.projectiles.inkFlight.paint({ owner, team: 0, ghost: false, seed: 0.37 }, { face, point, normal },
    { radius: 2.7, stretch: 0 }, V(1, 0, 0), 'shot');
  const growth = paint.growing[0];
  assert.ok(growth && growth.paintOwner === owner, 'the native source keeps its actual claimant');
  assert.equal(owner.stats.turf, 0, 'the composed body scorer excludes this surface');
  assert.equal(owner.special, 0);
  const bodyGrid = Array.from(paint.grid), version = paint.version, order = growth.paintOrder;
  assert.ok(bodyGrid.some(Boolean), 'the excluded surface still receives real body paint');
  if (!onWall) assert.ok(bodyGrid.every((v, i) => !v || paint.dead[i]), 'the fixture exercises the native initialized occlusion mask');
  const finishTicks = Math.ceil(Math.max(growth.dur * 1.75, growth.dripDur) * 60) + 1;
  for (let tick = 0; tick < finishTicks; tick++) paint.advanceSimulation(1 / 60);
  const added = [];
  for (let i = 0; i < paint.grid.length; i++) if (!bodyGrid[i] && paint.grid[i]) added.push(i);
  assert.ok(added.length > 0, 'real ancillary ownership grows on the excluded surface');
  assert.ok(added.every(i => paint._paintOwnershipOrder[i] === order),
    'ancillary grid writes retain their chronological owner');
  assert.ok(paint.version > version, 'non-scoring paint changes still invalidate cached surface reads');
  assert.deepEqual(Array.from(paint.counts), [0, 0], 'neither surface contributes to Turf coverage');
  assert.equal(owner.stats.turf, 0, 'excluded ancillary cells cannot award turf points');
  assert.equal(owner.special, 0, 'excluded ancillary cells cannot charge special');
  assert.equal(paint.growing.length, 0, 'the complete native drip/growth lifetime was exercised');
  const finishedVersion = paint.version;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.equal(paint.version, finishedVersion, 'finished growth does not invent another mutation');
});

test('real native Slosher flight awards positive late floor cells at finer supported paint-grid resolution', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, face } = makePaintWorld(f, { cell: 0.125 }), owner = f.make('slosher');
  G.settings = {}; f.setRandom(() => 0.37);
  owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
  const emissions = [], nativeSplat = paint.splat;
  paint.splat = function (center, radius, team, opts = {}) {
    emissions.push(opts.claimOwner);
    return nativeSplat.call(this, center, radius, team, opts);
  };
  G.projectiles.fireSlosh(owner, owner.weapon);
  let lateCredit = 0, lateCells = 0;
  // The real projectile and paint clocks interleave exactly as production does.
  for (let tick = 0; tick < 152; tick++) {
    G.time += 1 / 60; G.projectiles.update(1 / 60);
    const before = owner.stats.turf, cellsBefore = paint.counts[owner.team];
    paint.advanceSimulation(1 / 60);
    const credit = owner.stats.turf - before, cells = paint.counts[owner.team] - cellsBefore;
    assert.equal(credit, cells * face.cu * face.cv, 'each temporal phase credits only its newly claimed floor cells');
    lateCredit += credit; lateCells += cells;
  }
  assert.ok(emissions.length > 1 && emissions.every(a => a === owner), 'real release and landing paths retain the same actor');
  assert.ok(lateCells > 0 && lateCredit > 0, 'finer sampling exercises genuine positive native Slosher ancillary credit');
  assert.equal(owner.special, owner.stats.turf);
});
