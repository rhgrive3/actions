// Issue #617: the earliest legal 8-frame Splat Charger shot must launch at the
// extracted S3 minimum endpoint (SpawnSpeedMinCharge 2.4 x 60 = 144 u/s), not
// two thirds of the way up the raw runner charge coordinate. Endpoints come
// from the pinned Ver. 11.3.0 completion table (profile.json); the 8-frame
// legal minimum and 60-frame full charge are the issue's S3 reference. The
// installed path under test is WeaponRunner._charger -> Projectiles.fireCharger
// -> weapons-charger-flight begin(), so the mapping can never be a test-local
// mirror of the runtime helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const close = (actual, expected, label) => assert.ok(
  Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ~= ${expected}`);

// Charge for `frames` authoritative 60 Hz runner updates, then release on the
// next tick through the real _charger release branch (its Math.max(0.12, …)
// floor and ink accounting included) into the installed finite-flight layer.
// Returns the live flight job created by begin().
function launch(f, frames) {
  const a = f.make('charger');
  a.ink = 100;
  const r = a.weaponRunner;
  for (let i = 0; i < frames; i++) r._charger(1 / 60, { fire: true }, a.weapon);
  assert.ok(r.charging, 'precondition: still charging');
  const system = new f.Projectiles(new f.THREE.Scene());
  system.applyHit = () => {};
  f.G.projectiles = system;
  r._charger(1 / 60, { fire: false }, a.weapon);
  const jobs = system._fidelityChargerFlights;
  assert.equal(jobs.length, 1, 'release created exactly one fidelity flight');
  return jobs[0];
}

function rawMove(f) {
  return f.profile.weaponsFidelityCompletion.weapons.charger.MoveParam;
}

test('first legal 8f shot launches at the pinned 144 u/s minimum endpoint', async () => {
  const f = await fixture();
  const raw = rawMove(f);
  assert.equal(raw.SpawnSpeedMinCharge, 2.4, 'pinned minimum endpoint');
  const job = launch(f, 8);
  close(job.charge, 1 / 6, 'runner charge after 8 frames stays on the upstream curve');
  close(job.speed, 60 * raw.SpawnSpeedMinCharge, '8f launch speed');
});

test('full 60f shot launches at the pinned 288 u/s endpoint and keeps piercing', async () => {
  const f = await fixture();
  const raw = rawMove(f);
  const job = launch(f, 60);
  close(job.speed, 60 * raw.SpawnSpeedFullCharge, 'full launch speed');
  assert.equal(job.full, true, 'full charge keeps the piercing branch');
});

test('partial launch speed is monotonic between the extracted endpoints', async () => {
  const f = await fixture();
  const raw = rawMove(f);
  const minimum = 60 * raw.SpawnSpeedMinCharge;
  const maximum = 60 * raw.SpawnSpeedFullCharge;
  let previous = minimum;
  for (const frames of [8, 12, 20, 30, 45, 59]) {
    const { speed } = launch(f, frames);
    assert.ok(speed >= minimum - 1e-9, `${frames}f speed ${speed} >= minimum`);
    assert.ok(speed <= maximum + 1e-9, `${frames}f speed ${speed} <= maximum`);
    assert.ok(speed >= previous - 1e-9, `${frames}f speed ${speed} >= previous ${previous}`);
    previous = speed;
  }
});
