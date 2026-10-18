import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

for (const weapon of ['charger', 'blaster']) test(`native ${weapon} wall contact and descending paint retain the emitting owner`, async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, face } = makePaintWorld(f, { wall: true }), owner = f.make(weapon);
  G.settings = {}; f.setRandom(() => 0.37);
  owner.pos.y = 3; owner.character.root.position.copy(owner.pos);
  owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 4.05, 10);
  const emissions = [], nativeSplat = paint.splat;
  paint.splat = function (center, radius, team, opts = {}) {
    emissions.push({ owner: opts.claimOwner, point: center.clone(), face: opts.face, kind: opts.kind, footprint: opts.footprint });
    return nativeSplat.call(this, center, radius, team, opts);
  };
  if (weapon === 'charger') G.projectiles.fireCharger(owner, owner.weapon, 1);
  else G.projectiles.fireBlaster(owner, owner.weapon);
  const releaseGrid = Array.from(paint.grid), releaseTurf = owner.stats.turf;
  let sawWallDrop = false;
  for (let tick = 0; tick < 120; tick++) {
    G.time += 1 / 60; G.projectiles.update(1 / 60);
    sawWallDrop ||= !!(G.projectiles._s3ChargerWallDrops?.length || G.projectiles._s3DetachedWallDrops?.length ||
      G.projectiles.list.some(p => p.fidelityWallDrop));
  }
  assert.ok(sawWallDrop, 'a real collided projectile enters its native wall-drop state');
  const wallStamps = emissions.filter(e => e.point.z > 7.5 && e.point.y > 0.3);
  assert.ok(wallStamps.length > 1, 'native impact and descending stamps are emitted on the wall');
  assert.ok(emissions.every(e => e.owner === owner), 'all observed floor/wall stamps retain the same local claimant');
  assert.ok(paint.growing.some(g => g.paintOwner === owner));
  const before = owner.stats.turf, cellsBefore = paint.counts[owner.team];
  const gridBefore = Array.from(paint.grid), versionBefore = paint.version;
  for (let tick = 0; tick < 120; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(gridBefore.some((v,i) => v !== releaseGrid[i]), 'later physical wall-drop emissions claim new ownership');
  if (weapon === 'charger') assert.equal(before, releaseTurf, 'physical wall-only drops add ownership without inventing floor credit');
  else {
    assert.ok(before > releaseTurf, 'Blaster physical flight and burst drops add genuine floor credit');
    assert.ok(emissions.some(e => e.footprint === 'ink-shot') && emissions.some(e => e.footprint === 'ink-blast-rectified'),
      'Blaster retains distinct source flight and burst silhouettes');
  }
  assert.ok(emissions.every(e => e.kind === 'source-shot' || e.kind === 'source-splash'));
  assert.ok(wallStamps.some(e => e.point.y < wallStamps[0].point.y), 'native descending source stamps are exercised');
  assert.ok(before > 0 && cellsBefore > 0, 'native source floor emissions earn positive credit');
  assert.equal(before, cellsBefore * face.cu * face.cv, 'all physical floor credit belongs to the emitting actor exactly');
  assert.ok(gridBefore.filter(Boolean).length > paint.counts[0] + paint.counts[1], 'real wall stamps paint additional unscored cells');
  // Both native paths now emit source masks from the projectile clock. A
  // second procedural drip here would double-paint beyond those source drops.
  assert.deepEqual(Array.from(paint.grid), gridBefore, 'source wall drops are explicit emissions, not later procedural drips');
  assert.equal(paint.version, versionBefore, 'completed source stamps cannot invalidate ownership a second time');
  assert.equal(owner.stats.turf, before, 'completed source stamps cannot add duplicate floor credit');
  assert.equal(owner.stats.turf - before, (paint.counts[owner.team] - cellsBefore) * face.cu * face.cv,
    'only newly claimed eligible floor cells reach the turf ledger; walls remain unscored');
});

test('native Big Bubbler ignition growth retains turf credit without charging special', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { bigBubblerSnapshot } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';" });
  const { G } = f, { paint } = makePaintWorld(f), owner = f.make('roller');
  G.settings = {}; f.setRandom(() => 0.37);
  owner.weapon = { ...owner.weapon, special: 'bubbler' };
  owner.special = owner.specialCost(); owner._startSpecial();
  assert.equal(f.bigBubblerSnapshot().length, 1, 'a real charged activation deploys the native structure');
  for (let tick = 0; tick < 90; tick++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
  assert.equal(f.bigBubblerSnapshot()[0].ignited, true);
  assert.ok(paint.growing.length > 0);
  assert.ok(paint.growing.every(g => g.paintOwner === owner && g.paintCreditMode === 1));
  const before = owner.stats.turf;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(owner.stats.turf > before);
  assert.equal(owner.special, 0, 'the structure ignition and its late paint never refill their own special');
});
