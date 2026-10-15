import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

for (const surface of ['wall', 'occluded-floor']) test(`native ${surface} sourced paint keeps physical ownership bounded without inventing spatter credit`, async () => {
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
  assert.equal(added.length, 0, 'no unsourced late satellite ink on excluded surfaces');
  assert.ok(added.every(i => paint._paintOwnershipOrder[i] === order),
    'ancillary grid writes retain their chronological owner');
  assert.equal(paint.version, version, 'a sourced mask with no new cells never invalidates the cache twice');
  assert.deepEqual(Array.from(paint.counts), [0, 0], 'neither surface contributes to Turf coverage');
  assert.equal(owner.stats.turf, 0, 'excluded ancillary cells cannot award turf points');
  assert.equal(owner.special, 0, 'excluded ancillary cells cannot charge special');
  assert.equal(paint.growing.length, 0, 'the complete native drip/growth lifetime was exercised');
  const finishedVersion = paint.version;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.equal(paint.version, finishedVersion, 'finished growth does not invent another mutation');
});

test('real native Slosher flight credits its source body once at finer supported paint-grid resolution', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, face } = makePaintWorld(f, { cell: 0.125 }), owner = f.make('slosher');
  G.settings = {}; f.setRandom(() => 0.37);
  owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
  const emissions = [], nativeSplat = paint.splat;
  paint.splat = function (center, radius, team, opts = {}) {
    emissions.push({ owner: opts.claimOwner, kind: opts.kind });
    return nativeSplat.call(this, center, radius, team, opts);
  };
  G.projectiles.fireSlosh(owner, owner.weapon);
  let lateCredit = 0, lateCells = 0, physicalLateCredit = 0, physicalLateCells = 0;
  // The real projectile and paint clocks interleave exactly as production does.
  for (let tick = 0; tick < 152; tick++) {
    const bodyBefore = owner.stats.turf, bodyCellsBefore = paint.counts[owner.team];
    G.time += 1 / 60; G.projectiles.update(1 / 60);
    assert.equal(owner.stats.turf - bodyBefore, (paint.counts[owner.team] - bodyCellsBefore) * face.cu * face.cv,
      'each native projectile emission credits exactly its new source-body cells');
    physicalLateCredit += owner.stats.turf - bodyBefore;
    physicalLateCells += paint.counts[owner.team] - bodyCellsBefore;
    const before = owner.stats.turf, cellsBefore = paint.counts[owner.team];
    paint.advanceSimulation(1 / 60);
    const credit = owner.stats.turf - before, cells = paint.counts[owner.team] - cellsBefore;
    assert.equal(credit, cells * face.cu * face.cv, 'each temporal phase credits only its newly claimed floor cells');
    lateCredit += credit; lateCells += cells;
  }
  assert.ok(emissions.length > 1 && emissions.every(e => e.owner === owner), 'real release and landing paths retain the same actor');
  assert.ok(emissions.every(e => e.kind === 'source-shot' || e.kind === 'source-splash'));
  assert.ok(owner.stats.turf > 0 && paint.counts[owner.team] > 0, 'the full real volley claims positive floor ownership');
  assert.equal(owner.stats.turf, paint.counts[owner.team] * face.cu * face.cv);
  assert.ok(physicalLateCredit > 0 && physicalLateCells > 0, 'real delayed projectile landings add source-owned floor credit');
  assert.equal(physicalLateCredit, physicalLateCells * face.cu * face.cv);
  assert.equal(lateCells, 0, 'source masks cannot add procedural late satellite cells, even at finer resolution');
  assert.equal(lateCredit, 0, 'no second credit after the full source body was claimed');
  assert.equal(owner.special, owner.stats.turf);
});
