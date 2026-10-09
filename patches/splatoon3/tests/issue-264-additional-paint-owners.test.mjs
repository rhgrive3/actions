import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

for (const weapon of ['roller', 'slosher', 'blaster']) test(`native ${weapon} release, flight and landing paint retain temporal credit owners`, async () => {
  let totalLateCredit = 0;
  for (const seed of [0.17, 0.37, 0.71]) {
    const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
    const { G } = f, { paint, face } = makePaintWorld(f), owner = f.make(weapon);
    G.settings = {}; f.setRandom(() => seed);
    owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
    const emissions = [], nativeSplat = paint.splat;
    paint.splat = function (center, radius, team, opts = {}) {
      emissions.push({ owner: opts.claimOwner, kind: opts.kind });
      return nativeSplat.call(this, center, radius, team, opts);
    };
    const method = { roller: 'fireFlick', slosher: 'fireSlosh', blaster: 'fireBlaster' }[weapon];
    G.projectiles[method](owner, owner.weapon);
    const releaseEmissions = emissions.length;
    for (let tick = 0; tick < 120; tick++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
    assert.ok(emissions.length > releaseEmissions, 'native projectiles reach their real floor/timed paint paths');
    if (weapon !== 'blaster') assert.ok(releaseEmissions > 0, 'the independent native release-footprint is exercised');
    assert.ok(emissions.every(e => e.owner === owner), `${weapon} has no unowned scoring emission`);
    assert.ok(paint.growing.length > 0);
    assert.ok(paint.growing.every(g => g.paintOwner === owner));
    const before = owner.stats.turf, cellsBefore = paint.counts[owner.team];
    for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
    const lateCredit = owner.stats.turf - before;
    assert.equal(lateCredit, (paint.counts[owner.team] - cellsBefore) * face.cu * face.cv,
      `every native later cell credits its actual owner for seed ${seed}`);
    totalLateCredit += lateCredit;
  }
  assert.ok(totalLateCredit > 0, 'native later cells reach the emitting actor');
});

test('native Slosher repeated stamps cannot invent late turf on already owned cells', async () => {
  for (const seed of [0.17, 0.37, 0.71]) {
    const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
    const { G } = f, { paint } = makePaintWorld(f), owner = f.make('slosher');
    G.settings = {}; f.setRandom(() => seed);
    owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
    const stamps = [], nativeSplat = paint.splat;
    paint.splat = function (center, radius, team, opts = {}) {
      // Capture the actual footprint and seed. A new volley has a new sequence
      // seed for its nearest paint, even with a deterministic random source.
      const result = nativeSplat.call(this, center, radius, team, opts);
      stamps.push([center.clone(), radius, team, { ...opts, seed: opts.seed ?? seed,
        ...(opts.stretch ? { stretch: opts.stretch.clone() } : {}) }]);
      return result;
    };
    // Source-scaled Slosher footprints can add fresh cells even at this grid
    // resolution. Establish actual overlap with a fully matured native volley
    // rather than assuming that its release body covered all later samples.
    G.projectiles.fireSlosh(owner, owner.weapon);
    for (let tick = 0; tick < 120; tick++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
    paint.splat = nativeSplat;
    assert.ok(stamps.length > 1 && stamps.every(stamp => stamp[3].claimOwner === owner));
    for (let tick = 0; tick < 120; tick++) paint.advanceSimulation(1 / 60);
    assert.equal(paint.growing.length, 0, 'first volley has fully matured');
    const before = owner.stats.turf, cellsBefore = paint.counts[owner.team];
    for (const stamp of stamps) paint.splat(...stamp);
    assert.ok(paint.growing.length > 0, 'repeat exercises real ancillary stamps');
    assert.ok(paint.growing.every(g => g.paintOwner === owner));
    assert.equal(owner.stats.turf, before, 'overlapping bodies cannot invent turf');
    for (let tick = 0; tick < 120; tick++) paint.advanceSimulation(1 / 60);
    assert.equal(paint.growing.length, 0, 'repeat checks the full growth lifetime');
    assert.equal(paint.counts[owner.team], cellsBefore, 'repeat does not claim fresh cells');
    assert.equal(owner.stats.turf - before, 0, 'overlap cannot invent late turf');
  }
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
  slam._slamImpact(f.SPECIALS.slam);
  assert.ok(paint.growing.length > 0);
  assert.ok(paint.growing.every(g => g.paintOwner === slam && g.paintCreditMode === 1),
    'the real native Slam core and ring both use the no-special ledger');
  const slamBody = slam.stats.turf;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(slam.stats.turf > slamBody);
  assert.equal(slam.special, 0, 'ending the special before growth completes cannot recharge it');
});
