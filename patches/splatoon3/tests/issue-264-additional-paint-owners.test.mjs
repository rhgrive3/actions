import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

for (const weapon of ['roller', 'slosher', 'blaster']) test(`native ${weapon} release, flight and landing paint retain temporal credit owners`, async () => {
  let totalLateCredit = 0, sourcedRollerFootprints = 0;
  for (const seed of [0.17, 0.37, 0.71]) {
    const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
    const { G } = f, { paint, face } = makePaintWorld(f), owner = f.make(weapon);
    G.settings = {}; f.setRandom(() => seed);
    owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
    const emissions = [], nativeSplat = paint.splat;
    paint.splat = function (center, radius, team, opts = {}) {
      emissions.push({ owner: opts.claimOwner, kind: opts.kind, footprint: opts.footprint ?? null });
      return nativeSplat.call(this, center, radius, team, opts);
    };
    const method = { roller: 'fireFlick', slosher: 'fireSlosh', blaster: 'fireBlaster' }[weapon];
    G.projectiles[method](owner, owner.weapon);
    const releaseEmissions = emissions.length, releaseTurf = owner.stats.turf, releaseCells = paint.counts[owner.team];
    for (let tick = 0; tick < 120; tick++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
    assert.ok(emissions.length > releaseEmissions, 'native projectiles reach their real floor/timed paint paths');
    if (weapon !== 'blaster') assert.ok(releaseEmissions > 0, 'the independent native release-footprint is exercised');
    assert.ok(emissions.every(e => e.owner === owner), `${weapon} has no unowned scoring emission`);
    if (weapon === 'roller') sourcedRollerFootprints += emissions.filter(e => e.footprint === 'ink-flick').length;
    assert.ok(paint.growing.length > 0);
    assert.ok(paint.growing.every(g => g.paintOwner === owner));
    const before = owner.stats.turf, cellsBefore = paint.counts[owner.team];
    for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
    const lateCredit = owner.stats.turf - before;
    assert.equal(lateCredit, (paint.counts[owner.team] - cellsBefore) * face.cu * face.cv,
      `every native later cell credits its actual owner for seed ${seed}`);
    if (weapon === 'slosher') {
      assert.ok(before > releaseTurf && cellsBefore > releaseCells, 'genuine post-release projectile landings claim additional floor cells');
      assert.equal(before - releaseTurf, (cellsBefore - releaseCells) * face.cu * face.cv,
        'physical delayed landing credit reaches its emitting owner exactly');
      assert.ok(emissions.every(e => e.kind === 'source-shot' || e.kind === 'source-splash'),
        'all native Slosher release and landing masks use their explicit source kind');
      assert.ok(before > 0 && cellsBefore > 0, 'real source body paint already earns positive turf');
      assert.equal(before, cellsBefore * face.cu * face.cv, 'immediate source cells credit the emitting actor exactly');
      assert.equal(lateCredit, 0, 'completed source masks add no procedural ancillary turf');
    }
    totalLateCredit += lateCredit;
  }
  // Source-stencil Roller now claims its bounded body immediately, just like
  // Slosher. The per-emission actor, raster cell and exact m² ledger assertions
  // above remain enabled; generic Blaster must still yield real late credit.
  if (weapon === 'roller') {
    assert.ok(sourcedRollerFootprints > 0, 'the native Roller selected ink-flick at emission');
    assert.equal(totalLateCredit, 0, 'source-stencil Roller never invents late turf');
  } else if (weapon === 'slosher') assert.equal(totalLateCredit, 0);
  else assert.ok(totalLateCredit > 0, `native ${weapon} later cells reach the emitting actor`);
});

for (const sub of ['suction', 'curling']) test(`native ${sub} detonation retains its owner for every core and satellite splat`, async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint } = makePaintWorld(f), owner = f.make('shooter');
  G.settings = {}; f.setRandom(() => 0.37);
  owner.weapon = { ...owner.weapon, sub }; owner.weaponRunner.s3Sub = null;
  owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
  G.projectiles.throwBomb(owner);
  const bomb = G.projectiles.bombs[0];
  assert.equal(bomb.s3Sub.id, sub, 'native throw resolves the selected kit sub');
  bomb.pos.set(0, 0.1, 8);
  const emissions = [], nativeSplat = paint.splat;
  paint.splat = function (center, radius, team, opts = {}) {
    emissions.push(opts.claimOwner);
    return nativeSplat.call(this, center, radius, team, opts);
  };
  G.projectiles._explodeBomb(bomb);
  assert.ok(emissions.length > 1, 'core and source-selected satellites are actually emitted');
  assert.ok(emissions.every(a => a === owner));
  const before = owner.stats.turf;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(owner.stats.turf > before, 'late explosion cells retain their source owner');
});

test('composed native death burst credits its attacker and Splat Slam late paint never charges special', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint } = makePaintWorld(f), attacker = f.make('shooter'), victim = f.make('shooter');
  f.setRandom(() => 0.37);
  victim.team = 1; victim.pos.set(-15, 0, 8);
  victim.splat(attacker);
  assert.ok(paint.growing.length > 0);
  assert.ok(paint.growing.every(g => g.paintOwner === attacker), 'reliability-composed splat retains its actual attacker');
  const burstBody = attacker.stats.turf;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(attacker.stats.turf > burstBody);

  const slam = f.make('shooter'); slam.pos.set(15, 0, 8);
  slam.special = 0;
  // The DieBlastParam radius-5.0 blast also reaches nearby walls; its drips may still
  // be growing (dripDur up to 3.3 s). Judge only the growth the Slam itself emits.
  const burstGrowth = new Set(paint.growing);
  assert.ok([...burstGrowth].every(g => g.paintOwner === attacker), 'remaining death-blast growth stays with the attacker');
  slam._slamImpact(f.SPECIALS.slam);
  const slamGrowth = paint.growing.filter(g => !burstGrowth.has(g));
  assert.ok(slamGrowth.length > 0);
  assert.ok(slamGrowth.every(g => g.paintOwner === slam && g.paintCreditMode === 1),
    'the real native Slam core and ring both use the no-special ledger');
  const slamBody = slam.stats.turf;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(slam.stats.turf > slamBody);
  assert.equal(slam.special, 0, 'ending the special before growth completes cannot recharge it');
});
