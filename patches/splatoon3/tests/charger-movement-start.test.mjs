// #377 S3 Charger charging movement starts at the charging baseline.
// Logic-only source-fixture checks (no browser/Switch). Source caveat:
// pinned MoveSpeedFullCharge 0.02 raw -> profile 1.2 u/s, plus community
// guide support; no Switch measurement is claimed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const EPS = 1e-9;
const close = (actual, expected, label) => assert.ok(
  Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ~= ${expected}`);

async function chargingAt(frame, dt = 1 / 60) {
  const f = await fixture();
  const a = f.make('charger'), r = a.weaponRunner;
  let speed = 0;
  for (let i = 1; i <= frame; i++) {
    r._charger(dt, { fire: true }, a.weapon);
    speed = r.moveSpeed();
  }
  return { f, a, r, speed };
}

test('S3 Charger uses 1.2 u/s from charging entry (frames 1/8/12/18/full)', async () => {
  const f0 = await fixture();
  assert.equal(f0.profile.weapons.charger.moveSpeedFiring, 1.2);
  assert.equal(f0.PLAYER.runSpeed, 5.76);
  for (const frame of [1, 8, 12, 18]) {
    const { speed } = await chargingAt(frame);
    close(speed, 1.2, `frame ${frame}`);
  }
  const full = await chargingAt(60);
  close(full.speed, 1.2, 'full charge');
  assert.equal(full.r.chargeT, 1);
});

test('S3 Charger uncharged run and post-release speeds are unchanged', async () => {
  const f = await fixture();
  const a = f.make('charger'), r = a.weaponRunner;
  close(r.moveSpeed(), f.PLAYER.runSpeed, 'uncharged run');
  for (let i = 0; i < 60; i++) r._charger(1 / 60, { fire: true }, a.weapon);
  assert.ok(r.charging);
  r._charger(1 / 60, { fire: false }, a.weapon);
  assert.equal(r.charging, false);
  close(r.moveSpeed(), a.weapon.moveSpeedFiring, 'after release firing window');
  // Advance past the 0.35s firing window plus the 0.28s cooldown path.
  r.update(0.7, { fire: false });
  close(r.moveSpeed(), f.PLAYER.runSpeed, 'cooldown expiry restores run');
});

test('Splatling charging curve and other branches are unchanged', async () => {
  const f = await fixture();
  const a = f.make('splatling'), r = a.weaponRunner;
  r.charging = true; r.charge = 0.2;
  const expected = f.PLAYER.runSpeed * 0.75
    + (a.weapon.moveSpeedCharging - f.PLAYER.runSpeed * 0.75) * Math.min(1, 0.2 * 2.5);
  close(r.moveSpeed(), expected, 'splatling charging branch');
  const roller = f.make('roller');
  roller.weaponRunner.rolling = true; roller.weaponRunner.rollT = 2;
  assert.equal(roller.weaponRunner.moveSpeed(), roller.weapon.rollSpeed);
});

test('S3 Charger charging speed holds across 30/60/120 fixed schedules', async () => {
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    // Same 60-frame charge window expressed in fixed steps per schedule.
    const steps = Math.round(60 * (60 / hz));
    const f = await fixture();
    const a = f.make('charger'), r = a.weaponRunner;
    // First charging frame on each schedule must already use the baseline.
    r._charger(dt, { fire: true }, a.weapon);
    close(r.moveSpeed(), 1.2, `first frame at ${hz}Hz`);
    for (let i = 1; i < steps; i++) {
      r._charger(dt, { fire: true }, a.weapon);
      assert.ok(Math.abs(r.moveSpeed() - 1.2) < 1e-6, `${hz}Hz step ${i + 1}`);
    }
  }
});

test('actual Actor horizontal target follows the charging baseline', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.intent.move.set(0, 0, 1);
  a.vel.set(0, 0, 0);
  a.weaponRunner._charger(1 / 60, { fire: true }, a.weapon);
  assert.equal(a.weaponRunner.charging, true);
  close(a.weaponRunner.moveSpeed(), 1.2, 'runner target');
  a._horizontal(1 / 60, false, false);
  const speed = Math.hypot(a.vel.x, a.vel.z);
  assert.ok(speed > 0 && speed <= 1.2 + 1e-6, `horizontal speed ${speed}`);
});
