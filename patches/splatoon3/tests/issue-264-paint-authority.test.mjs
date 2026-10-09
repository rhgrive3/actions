import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';

import { makePaintWorld } from './paint-authority-fixture.mjs';

function makeGame(f, { paused = false, online = false, attract = false } = {}) {
  const { G } = f;
  const match = { paused, attract, state: 'playing', actors: G.actors, updateController() {}, update() {} };
  G.match = match; G.settings = {};
  if (online) G.netm = { mute: 0, applying: false, recSplat() {} };
  return { match, input: { padPressed: new Set(), pollPad() {}, endFrame() {} },
    _padMenus() {}, _updateAttract() {}, rig: {} };
}

function emitNative(f, owner, V, { kind = 'shot', x = 0, ghost = false, face = 0 } = {}) {
  f.G.projectiles.inkFlight.paint({ owner, team: owner.team, ghost, seed: 0.37 },
    { face, point: V(x, 0, 5), normal: V(0, 1, 0) },
    { radius: 2.7, stretch: 0 }, V(0, 0, 1), kind);
}

for (const weapon of ['shooter', 'dualies', 'splatling']) {
  test(`native ${weapon} head and detached paint credit immediate and late cells exactly once`, async () => {
    const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
    const { paint, face, V } = makePaintWorld(f), owner = f.make(weapon);
    for (const [index, kind] of ['shot', 'drop', 'trail'].entries()) {
      emitNative(f, owner, V, { kind, x: index * 12 - 12 });
      assert.equal(paint.growing.at(-1).paintOwner, owner, `${kind} carries the real Actor owner`);
    }
    const bodyCells = paint.counts[0], bodyCredit = owner.stats.turf;
    assert.equal(bodyCredit, bodyCells * face.cu * face.cv, 'native addTurf credits the initial body once');
    for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
    assert.ok(paint.counts[0] > bodyCells, 'ancillary cells really become owned');
    assert.ok(owner.stats.turf > bodyCredit, 'late cells increase the emitting actor credit');
    assert.equal(owner.stats.turf, paint.counts[0] * face.cu * face.cv, 'every claimed floor cell credits exactly once');
    assert.equal(owner.special, owner.stats.turf, 'ordinary late paint contributes the native special gauge');
    const done = owner.stats.turf;
    for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
    assert.equal(owner.stats.turf, done, 'finished growth cannot credit twice');
  });
}

test('real shooter-family fire routes every native landing through its local paint owner', async () => {
  for (const weapon of ['shooter', 'dualies', 'splatling']) {
    const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
    const { G } = f, { paint } = makePaintWorld(f), owner = f.make(weapon);
    G.settings = {}; f.setRandom(() => 0.37);
    owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
    const emissions = [], nativeSplat = paint.splat;
    paint.splat = function (center, radius, team, opts = {}) {
      emissions.push({ owner: opts.claimOwner, kind: opts.kind, face: opts.face });
      return nativeSplat.call(this, center, radius, team, opts);
    };
    const method = { shooter: 'fireShooter', dualies: 'fireDualies', splatling: 'fireSplatling' }[weapon];
    owner.weaponRunner.charge = 1;
    for (let shot = 0; shot < 8; shot++) G.projectiles[method](owner, owner.weapon, 0, shot % 2);
    assert.ok(G.projectiles.list.some(p => p.inkProfile), `${weapon} admits its real source-guided head`);
    for (let tick = 0; tick < 120; tick++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
    assert.ok(emissions.some(e => e.kind === 'shot'), `${weapon} has a real head impact`);
    assert.ok(emissions.some(e => e.kind === 'drop' || e.kind === 'trail'), `${weapon} lands real detached ink`);
    assert.ok(emissions.every(e => e.owner === owner), `${weapon} has no unowned landing emission`);
  }
});

test('native ghost and invalid hits stay unpainted; remote growth is uncredited and adoption applies only to new local paint', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, V } = makePaintWorld(f), owner = f.make('shooter');
  emitNative(f, owner, V, { ghost: true });
  emitNative(f, owner, V, { face: -1 });
  assert.equal(paint.counts[0], 0); assert.equal(paint.growing.length, 0); assert.equal(owner.stats.turf, 0);
  owner.remote = true;
  emitNative(f, owner, V);
  assert.equal(paint.growing.at(-1).paintOwner, null, 'remote paint does not grant local late-credit authority');
  const remoteCredit = owner.stats.turf;
  owner.remote = false;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.equal(owner.stats.turf, remoteCredit, 'adoption does not retroactively claim prior remote growth');
  emitNative(f, owner, V, { x: 12 });
  assert.equal(paint.growing.at(-1).paintOwner, owner, 'new authoritative paint uses the adopted local actor');
  const adoptedBody = owner.stats.turf;
  for (let tick = 0; tick < 32; tick++) paint.advanceSimulation(1 / 60);
  assert.ok(owner.stats.turf > adoptedBody);
});

for (const rate of [30, 60, 120]) test(`offline pause freezes native paint and resumes without paint debt at ${rate} Hz`, async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, V } = makePaintWorld(f), owner = f.make('shooter');
  const game = makeGame(f);
  emitNative(f, owner, V);
  f.runSimulation(game, 1 / 60);
  const capture = () => ({ time: G.time, clock: paint.clock, age: paint.growing[0]?.age,
    cells: paint.counts[0], turf: owner.stats.turf, special: owner.special,
    order: Array.from(paint._paintOwnershipOrder), carry: paint._paintSimulationAccumulator });
  const before = capture(); game.match.paused = true;
  for (let frame = 0; frame < rate * 2; frame++) {
    f.runSimulation(game, 1 / rate);
    paint.flush(1 / rate);
  }
  assert.deepEqual(capture(), before, 'even render flushes cannot mutate paused coverage, ownership or credit');
  game.match.paused = false;
  f.runSimulation(game, 1 / 120);
  assert.deepEqual(capture(), before, 'a zero-tick render cannot grow paint or repay paused debt');
  f.runSimulation(game, 1 / 120);
  assert.ok(Math.abs(G.time - before.time - 1 / 60) < 1e-10);
  assert.ok(Math.abs(paint.growing[0].age - before.age - 1 / 60) < 1e-10, 'resume advances exactly one ordinary tick');
  for (let tick = 0; tick < 31; tick++) f.runSimulation(game, 1 / 60);
  assert.ok(paint.counts[0] > before.cells);
  assert.ok(owner.stats.turf > before.turf);
  assert.equal(owner.special, owner.stats.turf);
});

for (const mode of ['offline', 'online-menu', 'attract']) test(`${mode} without an offline pause keeps authoritative paint advancing`, async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, V } = makePaintWorld(f), owner = f.make('shooter');
  const game = makeGame(f, { online: mode === 'online-menu', attract: mode === 'attract' });
  if (mode === 'online-menu') G.mode = 'pause';
  emitNative(f, owner, V);
  const bodyCells = paint.counts[0], bodyCredit = owner.stats.turf;
  for (let tick = 0; tick < 32; tick++) f.runSimulation(game, 1 / 60);
  assert.ok(G.time > 0 && paint.clock > 0);
  assert.ok(paint.counts[0] > bodyCells && owner.stats.turf > bodyCredit);
});
