import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// Execute the installed public WeaponRunner + patched Projectiles, not a new
// projectile model. Aim changes occur at fixed ticks, independent of render Hz.
async function throwSlosher(previousYaw, renderHz) {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const a = f.make('slosher');
  a.isLocal = true;
  f.setRandom(() => 0.5);
  const clock = new FixedClock();
  let ticks = 0;
  try {
    for (let frame = 0; clock.ticks < 13 && frame < 100; frame++) {
      clock.advance(1 / renderHz, dt => {
        ticks++;
        // Same final aim, but different heading one simulation tick earlier.
        const yaw = ticks === 13 ? 0 : previousYaw;
        a.aimDir.set(Math.sin(yaw), 0, Math.cos(yaw));
        f.G.time += dt;
        a.intent.fire = true;
        a.weaponRunner.update(dt, { fire: true });
      });
    }
    assert.equal(clock.ticks, 13);
    const projectiles = f.G.projectiles.list;
    assert.equal(projectiles.length, 9, '4+5 current S3 source units');
    const result = projectiles.map(p => ({
      yaw: p._s3SloshYaw, damage: p.damage,
      frame: Math.round(p.delay * 60),
      pending: p._s3SloshBirthPending
    }));
    a.weaponRunner.reset();
    assert.equal(a.weaponRunner.s3SloshPrevYaw, null, 'reset forgets previous aim');
    assert.equal(a.weaponRunner.s3SloshTurnDelta, 0, 'reset forgets prior sweep');
    return result;
  } finally {
    f.restoreRandom();
  }
}
const norm = value => Math.atan2(Math.sin(value), Math.cos(value));

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
    const frame = stationary[i].frame;
    const offset = frame * Math.PI / 18;
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
    const expected = stationary[i].frame * Math.PI / 18;
    assert.ok(Math.abs(norm(excessive[i].yaw - stationary[i].yaw - expected)) < 1e-7);
  }
});
