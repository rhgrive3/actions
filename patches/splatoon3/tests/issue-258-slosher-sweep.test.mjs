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
        if (ticks >= 13) return; // A 30Hz render frame carries two fixed ticks.
        ticks++;
        // Same final aim, but different heading one simulation tick earlier.
        const yaw = ticks === 13 ? 0 : previousYaw;
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
    a.weaponRunner.reset();
    assert.equal(a.weaponRunner.s3SloshPrevYaw, null, 'reset forgets previous aim');
    assert.equal(a.weaponRunner.s3SloshTurnDelta, 0, 'reset forgets prior sweep');
    return result;
  } finally {
    f.restoreRandom();
  }
}
const norm = value => Math.atan2(Math.sin(value), Math.cos(value));
// Sweep steps (x 10 degrees per 60Hz tick) per bullet: the 4-bullet group
// advances by its interval 1, then the 5-bullet group (interval 2) continues
// from 3 to 5. Final step 13 = 130 degrees, matching the public Wiki's
// 10*(4*1+5*2)-10 description. Public-Wiki law; 未確認 against Nintendo.
const SWEEP_STEPS = [0, 1, 2, 3, 5, 7, 9, 11, 13];

test('#258 actual Bucket Slosher preserves sourced 4+5 groups and 60Hz delays', async () => {
  const shots = await throwSlosher(0, 60);
  assert.deepEqual(shots.map(s => s.frame), [0, 1, 2, 3, 4, 6, 8, 10, 12]);
  assert.deepEqual(shots.map(s => s.damage), [70, 70, 70, 70, 50, 50, 50, 50, 50]);
  assert.ok(shots.every(s => s.pending === true), 'deferred owner-side birth remains active');
});

test('#258 group-interval sweep: second group starts at 3+2, not its birth frame 4', async () => {
  const turned = await throwSlosher(-Math.PI / 18, 60);
  const stationary = await throwSlosher(0, 60);
  const steps = turned.map((s, i) => Math.round(norm(s.yaw - stationary[i].yaw) / (Math.PI / 18)));
  assert.deepEqual(steps, SWEEP_STEPS);
  assert.equal(steps[4], 5, 'first bullet of the 5-bullet group');
  assert.ok(Math.abs(norm(turned[8].yaw - stationary[8].yaw) - 13 * Math.PI / 18) < 1e-7, '130 degrees total');
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
});
