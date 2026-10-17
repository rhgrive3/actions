import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Exercise production-composed emitters, real world collision, native delayed
// births and the ordinary update -> pool retirement path. Actor integration,
// ink accounting and rendering are not the subject of this allocator check.
async function world(legacy = false) {
  let removed = 0;
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    adaptRuntime(rel, source) {
      if (!legacy || rel !== 'patches/splatoon3/runtime/weapons-fidelity.mjs') return source;
      const reviewed = 'p.fidelitySloshUnit=null;p.fidelitySloshIndex=null;p.fidelitySloshDownward=null;';
      assert.equal(source.split(reviewed).length, 2, 'negative control removes only the one reviewed initializer');
      removed++;
      return source.replace(reviewed, 'p.fidelitySloshUnit=null;p.fidelitySloshDownward=null;');
    } });
  assert.equal(removed, legacy ? 1 : 0);
  const level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-50, -1, -50], max: [50, 0, 50] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.match.state = 'playing'; f.setRandom(() => .5);
  const births = [];
  f.G.netm = { mute: 0, recProj(p) {
    if (p.type === 'slosh') births.push({ packet: p.fidelitySloshPacketIndex, index: p.fidelitySloshIndex,
      rollerIndex: p.fidelityRollerUnitIndex, delay: p.delay, velocity: Array.from(p.vel.toArray()) });
  } };
  return { f, births };
}

const vectors = p => [p.pos, p.prev, p.vel, p.start];
const receipt = ps => JSON.parse(JSON.stringify(ps.list.map(p => ({
  pos: p.pos.toArray(), start: p.start.toArray(), vel: p.vel.toArray(), age: p.age,
  seed: p.seed, delay: p.delay, type: p.type, mode: p.fidelityMode,
  sloshIndex: p.fidelitySloshIndex ?? null, rollerUnit: p.fidelityRollerUnitIndex,
}))));

function pose(a, vertical = false) {
  Object.assign(a, { form: 'kid', ink: 100, grounded: !vertical, yaw: 0 });
  a.ground.hit = !vertical;
  a.pos.set(0, vertical ? 1.8 : 0, 0); a.character.root.position.copy(a.pos);
  a.vel.set(0, 0, 0); a.aimDir.set(0, 0, 1);
  a.aimPoint.copy(a.pos).addScaledVector(a.aimDir, 100); a.aimPoint.y += 1.05;
}

function sourceSlosherIndices(f) {
  return f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit
    .flatMap(unit => Array.from({ length: unit.BulletNum ?? 1 }, (_, index) => index));
}

function fireSlosher(w, actor = null) {
  const { f, births } = w, ps = f.G.projectiles;
  const a = actor || f.make('slosher');
  if (a.weaponId !== 'slosher') a.setWeapon('slosher');
  pose(a);
  const start = births.length;
  ps.fireSlosh(a, a.weapon);
  assert.equal(ps.list.length, 9, 'the native Bucket emitter prepares all nine source globs');
  const expected = sourceSlosherIndices(f);
  assert.deepEqual(Array.from(ps.list, p => p.fidelitySloshIndex), expected);
  assert.ok(expected.some(index => index > 0), 'the source volley primes nonzero indices');
  assert.ok(ps.list.every(p => p.fidelitySloshUnit && p.fidelityRollerUnit === null && p.fidelityRollerUnitIndex === null),
    'Slosher owns its unit and index after initialization; no previous Roller unit survives');
  assert.equal(births.length, start, 'queued Slosher records are not published before their true birth');
  return { actor: a, records: [...ps.list], storage: ps.list.map(vectors), birthStart: start, expected };
}

function flyToPool(w, hz) {
  const { f } = w, ps = f.G.projectiles, records = [...ps.list], clock = new f.FixedClock();
  const trace = [receipt(ps)];
  for (let render = 0; ps.list.length && render < hz * 8; render++) clock.advance(1 / hz, dt => {
    if (!ps.list.length) return;
    f.G.time += dt; ps.update(dt); trace.push(receipt(ps));
  });
  assert.equal(ps.list.length, 0, 'all native projectiles retire through update without a forced clear');
  assert.ok(trace.length > 2 && trace.some(row => row.length > 0), 'the trace includes actual flight');
  assert.ok(records.every(p => ps.pool.includes(p)), 'every emitted record returns to the native pool');
  return trace;
}

function assertSlosherBirths(w, admitted) {
  const births = w.births.slice(admitted.birthStart);
  assert.equal(births.length, 9, 'every prepared Slosher glob reaches one true birth');
  assert.deepEqual(births.map(b => b.packet).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (const b of births) {
    assert.equal(b.index, admitted.expected[b.packet], 'true birth retains the new Slosher unit-local index');
    assert.equal(b.rollerIndex, null, 'no previous Roller unit at Slosher birth');
    assert.equal(b.delay, 0, 'the native queue has elapsed before recording a birth');
  }
}

function assertFreshRoller(ps) {
  assert.ok(ps.list.every(p => p.fidelitySloshIndex === null), 'Roller must not inherit a Slosher index');
  assert.ok(ps.list.every(p => p.fidelitySloshUnit === null && p.fidelityRollerUnit &&
    Number.isSafeInteger(p.fidelityRollerUnitIndex)), 'the Roller initializer owns only its own source unit');
}

function fireRoller(w, vertical, actor = null) {
  const { f } = w, ps = f.G.projectiles, a = actor || f.make('roller');
  if (a.weaponId !== 'roller') a.setWeapon('roller');
  pose(a, vertical);
  // Invoke the native emitter in its admitted mode. Startup/jump admission
  // has separate tests; no private allocator or synthetic projectile is used.
  a.weaponRunner.s3FlickVertical = vertical;
  ps.fireFlick(a, a.weapon);
  assert.equal(ps.list.length, vertical ? 5 : 13, 'complete native Roller volley');
  assert.ok(ps.list.every(p => p.fidelityMode === (vertical ? 'vertical' : 'horizontal')));
  return { actor: a, records: [...ps.list] };
}

for (const vertical of [false, true]) test('native Slosher -> ' + (vertical ? 'vertical' : 'horizontal') +
  ' Roller -> Slosher pool reuse preserves 30/60/120 Hz flight and retirement', async () => {
  let reference;
  for (const hz of [30, 60, 120]) {
    const cold = await world(), reused = await world();
    const first = fireSlosher(reused);
    const firstTrace = flyToPool(reused, hz);
    assertSlosherBirths(reused, first);
    const warmRoller = fireRoller(reused, vertical, first.actor), freshRoller = fireRoller(cold, vertical);
    assert.equal(warmRoller.records.filter(p => first.records.includes(p)).length, Math.min(9, warmRoller.records.length),
      'native Roller emitter consumes the available retired Slosher records');
    for (let i = 0; i < first.records.length; i++) for (let j = 0; j < 4; j++)
      assert.equal(vectors(first.records[i])[j], first.storage[i][j], 'pool reuse retains native vector storage');
    assertFreshRoller(reused.f.G.projectiles); assertFreshRoller(cold.f.G.projectiles);
    assert.deepEqual(receipt(reused.f.G.projectiles), receipt(cold.f.G.projectiles), 'reused and cold Roller births agree');
    const rollerTrace = flyToPool(reused, hz), coldTrace = flyToPool(cold, hz);
    assert.deepEqual(rollerTrace, coldTrace, 'pool history changes neither Roller flight nor retirement');
    const again = fireSlosher(reused, warmRoller.actor);
    assert.equal(again.records.filter(p => warmRoller.records.includes(p)).length, Math.min(9, warmRoller.records.length),
      'return Slosher volley consumes the available retired Roller records');
    const againTrace = flyToPool(reused, hz);
    assertSlosherBirths(reused, again);
    assert.deepEqual(againTrace, firstTrace, 'Slosher unit indices, flight and retirement recover after the intervening Roller');
    const signature = { firstTrace, rollerTrace, againTrace };
    if (reference) assert.deepEqual(signature, reference, hz + ' Hz feeds the same native fixed-clock trace');
    else reference = signature;
    assert.equal(freshRoller.records.length, warmRoller.records.length);
  }
});

test('removing only the Slosher-index reset fails the same native reuse oracle',
  { skip: !!process.env.INKWAVE_BUILT_SITE && 'the one-expression counterfactual edits raw source; built positive regressions remain active' }, async () => {
    for (const vertical of [false, true]) {
      const legacy = await world(true), first = fireSlosher(legacy);
      flyToPool(legacy, 60); assertSlosherBirths(legacy, first);
      const roller = fireRoller(legacy, vertical, first.actor);
      assert.ok(roller.records.some(p => first.records.includes(p) && p.fidelitySloshIndex > 0),
        'the original nonzero index is carried by an actually reused object');
      assert.throws(() => assertFreshRoller(legacy.f.G.projectiles), /Roller must not inherit a Slosher index/,
        'the positive metadata assertion detects the single-expression regression');
    }
  });
