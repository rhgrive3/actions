import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// Execute the installed public WeaponRunner + patched Projectiles, not a new
// projectile model. Aim changes occur at fixed ticks, independent of render Hz.
async function throwSlosher(previousYaw, renderHz, { finalYaw = 0, births = false } = {}) {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, productionComposition: births });
  const a = f.make('slosher');
  a.isLocal = true;
  f.setRandom(() => 0.5);
  const born = [];
  let nm;
  if (births) {
    Object.assign(a, { nid: 0, owner: 'owner', remote: false });
    f.G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single: [], half: [] });
    f.G.physics = new f.Physics(f.G.level);
    f.G.camera = { position: new f.THREE.Vector3() };
    nm = new f.NetMatch({ myId: 'owner' }, {});
    f.G.netm = nm;
    const rec = nm.recProj.bind(nm);
    nm.recProj = p => {
      born.push({ tick: Math.round(f.G.time * 60), yaw: Math.atan2(p.vel.x, p.vel.z),
        velocity: Array.from(p.vel.toArray()), damage: p.damage, index: p.fidelitySloshPacketIndex });
      return rec(p);
    };
  }
  const clock = new FixedClock();
  let ticks = 0;
  try {
    for (let frame = 0; clock.ticks < 13 && frame < 100; frame++) {
      clock.advance(1 / renderHz, dt => {
        if (ticks >= 13) return; // A 30Hz render frame carries two fixed ticks.
        ticks++;
        // Same final aim, but different heading one simulation tick earlier.
        const yaw = ticks === 13 ? finalYaw : previousYaw;
        a.aimDir.set(Math.sin(yaw), 0, Math.cos(yaw));
        f.G.time += dt;
        a.intent.fire = true;
        a.weaponRunner.update(dt, { fire: true });
      });
    }
    assert.equal(ticks, 13);
    const projectiles = f.G.projectiles.list;
    assert.equal(projectiles.length, 9, '4+5 current S3 source units');
    const result = Array.from(projectiles, p => ({
      yaw: p._s3SloshYaw, damage: p.damage,
      frame: Math.round(p.delay * 60),
      pending: p._s3SloshBirthPending
    }));
    if (births) {
      assert.equal(nm.out.filter(e => e[1] === 'p').length, 0, 'no early birth packets');
      const clock = new FixedClock();
      while (clock.ticks < 16) clock.advance(1 / renderHz, dt => {
        f.G.time += dt;
        f.G.projectiles.update(dt);
      });
      const packets = nm.out.filter(e => e[1] === 'p');
      assert.equal(born.length, 9);
      assert.equal(packets.length, 9);
      assert.deepEqual(born.map(b => b.tick - 14), [0, 1, 2, 3, 4, 6, 8, 10, 12]);
      for (let i = 0; i < 9; i++) {
        assert.equal(born[i].index, i);
        assert.ok(Math.abs(norm(born[i].yaw - result[i].yaw)) < 1e-9);
        assert.equal(born[i].damage, result[i].damage);
        assert.equal(packets[i][11], 0, 'delay is retired at real birth');
        for (let axis = 0; axis < 3; axis++)
          assert.ok(Math.abs(packets[i][axis + 8] - born[i].velocity[axis]) <= .00501, 'wire keeps swept velocity');
      }
    }
    a.weaponRunner.reset();
    assert.equal(a.weaponRunner.s3SloshPrevYaw, null, 'reset forgets previous aim');
    assert.equal(a.weaponRunner.s3SloshTurnDelta, 0, 'reset forgets prior sweep');
    return births ? born : result;
  } finally {
    f.restoreRandom();
  }
}
const norm = value => Math.atan2(Math.sin(value), Math.cos(value));
// The Wiki's group-interval accumulation is distinct from the birth schedule:
// four 1F steps then five 2F steps, excluding the first glob's own step.
const SWEEP_STEPS = [0, 1, 2, 3, 5, 7, 9, 11, 13];

test('#258 actual Bucket Slosher preserves sourced 4+5 groups and 60Hz delays', async () => {
  const shots = await throwSlosher(0, 60);
  assert.deepEqual(shots.map(s => s.frame), [0, 1, 2, 3, 4, 6, 8, 10, 12]);
  assert.deepEqual(shots.map(s => s.damage), [70, 70, 70, 70, 50, 50, 50, 50, 50]);
  assert.ok(shots.every(s => s.pending === true), 'deferred owner-side birth remains active');
});

test('#258 previous-tick turning creates bidirectional sweep; stationary aim remains unswept', async () => {
  const stationary = await throwSlosher(0, 60);
  const fromLeft = await throwSlosher(-Math.PI / 18, 60);
  const fromRight = await throwSlosher(Math.PI / 18, 60);
  for (let i = 0; i < stationary.length; i++) {
    const offset = SWEEP_STEPS[i] * Math.PI / 18;
    assert.ok(Math.abs(norm(fromLeft[i].yaw - stationary[i].yaw - offset)) < 1e-7, 'left turn unit ' + i);
    assert.ok(Math.abs(norm(fromRight[i].yaw - stationary[i].yaw + offset)) < 1e-7, 'right turn unit ' + i);
  }
});

test('#258 30/60/120Hz render partitions produce identical fixed-tick sweep and damage', async () => {
  for (const turn of [0, Math.PI / 36, -Math.PI / 18]) {
    const expected = await throwSlosher(turn, 60);
    assert.deepEqual(await throwSlosher(turn, 30), expected, '30Hz partition');
    assert.deepEqual(await throwSlosher(turn, 120), expected, '120Hz partition');
  }
});

test('#258 heading wrap uses shortest arc; sweep is capped at 10 degrees per 60Hz tick', async () => {
  const stationary = await throwSlosher(0, 60);
  const excessive = await throwSlosher(-Math.PI / 3, 60);
  for (let i = 0; i < stationary.length; i++) {
    const expected = SWEEP_STEPS[i] * Math.PI / 18;
    assert.ok(Math.abs(norm(excessive[i].yaw - stationary[i].yaw - expected)) < 1e-7);
  }
  const wrapped = await throwSlosher(Math.PI - Math.PI / 90, 60, { finalYaw: -Math.PI + Math.PI / 90 });
  for (let i = 0; i < wrapped.length; i++)
    assert.ok(Math.abs(norm(wrapped[i].yaw - (-Math.PI + Math.PI / 90) - SWEEP_STEPS[i] * Math.PI / 45)) < 1e-7);
});

test('#258 production births retain the 130-degree source-guided sweep independently of 12F final delay', async () => {
  for (const direction of [-1, 1]) {
    const expected = await throwSlosher(-direction * Math.PI / 18, 60, { births: true });
    for (let i = 0; i < expected.length; i++)
      assert.ok(Math.abs(norm(expected[i].yaw - direction * SWEEP_STEPS[i] * Math.PI / 18)) < 1e-9);
    for (const hz of [30, 120])
      assert.deepEqual(await throwSlosher(-direction * Math.PI / 18, hz, { births: true }), expected);
  }
});

test('#258 the sweep accumulator is volley-local after repeat, reset, and an interrupted emitter', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const a = f.make('slosher'), ps = f.G.projectiles;
  f.setRandom(() => .5);
  const emit = delta => {
    a.weaponRunner.s3SloshTurnDelta = delta;
    ps.fireSlosh(a, a.weapon);
    assert.equal(ps.list.length, 9);
    for (let i = 0; i < 9; i++)
      assert.ok(Math.abs(norm(ps.list[i]._s3SloshYaw - SWEEP_STEPS[i] * delta)) < 1e-9);
    ps.clear();
  };
  try {
    emit(Math.PI / 18); emit(-Math.PI / 18); emit(0);
    const fresh = ps._new;
    let count = 0;
    ps._new = function (...args) {
      if (++count === 5) throw new Error('interrupted emitter');
      return fresh.apply(this, args);
    };
    a.weaponRunner.s3SloshTurnDelta = Math.PI / 18;
    assert.throws(() => ps.fireSlosh(a, a.weapon), /interrupted emitter/);
    assert.ok(ps._fidelitySloshContext == null, 'failed volley retires its accumulation context');
    ps._new = fresh; ps.clear();
    emit(-Math.PI / 18);
    a.weaponRunner.reset();
    assert.equal(a.weaponRunner.s3SloshTurnDelta, 0);
    ps.fireSlosh(a, a.weapon);
    assert.ok(ps.list.every(p => Math.abs(p._s3SloshYaw) < 1e-9));
  } finally { f.restoreRandom(); }
});
