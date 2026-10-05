// #377 S3 Charger charging movement starts at the charging baseline.
// Logic-only source-fixture checks (no browser/Switch). Source caveat:
// pinned MoveSpeedFullCharge 0.02 raw -> profile 1.2 u/s, plus community
// guide support; no Switch measurement is claimed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { gearCurve } from '../runtime/gear.mjs';

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

test('S3 Charger charging speed holds across 30/60/120Hz render cadences', async () => {
  // One wall-clock second per cadence: hz render frames of dt 1/hz fed into
  // FixedClock(STEP=1/60) so every cadence yields exactly 60 real
  // Actor.update ticks and chargeTime 1 reaches chargeT 1 with same states.
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('charger');
    a.intent.fire = true;
    a.intent.move.set(0, 0, 1);
    const clock = new FixedClock();
    const states = [];
    for (let frame = 0; frame < hz; frame++) {
      clock.advance(1 / hz, (dt) => {
        f.G.time += dt;
        a.update(dt);
        states.push({ chargeT: a.weaponRunner.chargeT, speed: a.weaponRunner.moveSpeed() });
      });
    }
    assert.equal(clock.ticks, 60, `${hz}Hz yields 60 ticks`);
    assert.equal(a.weaponRunner.chargeT, 1, `${hz}Hz reaches full charge`);
    assert.equal(a.weaponRunner.charging, true, `${hz}Hz still charging`);
    // Charging baseline from the first charge state on every cadence.
    close(states[0].speed, 1.2, `first charge state at ${hz}Hz`);
    for (let i = 0; i < states.length; i++) {
      close(states[i].speed, 1.2, `${hz}Hz tick ${i + 1}`);
    }
    traces.push(states);
  }
  assert.deepEqual(traces[1], traces[0], '60Hz matches 30Hz per-tick states');
  assert.deepEqual(traces[2], traces[0], '120Hz matches 30Hz per-tick states');
});

test('actual Actor horizontal converges below 1.2 and lockT keeps priority', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.intent.fire = true;
  a.intent.move.set(0, 0, 1);
  a.vel.set(0, 0, 0);
  const clock = new FixedClock();
  clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(a.weaponRunner.charging, true);
  close(a.weaponRunner.moveSpeed(), 1.2, 'runner target after first tick');
  const speed = Math.hypot(a.vel.x, a.vel.z);
  assert.ok(speed > 0 && speed <= 1.2 + 1e-6, `horizontal speed ${speed}`);
  // Run the full one-second charge: velocity converges to the baseline.
  for (let i = 1; i < 60; i++) clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(clock.ticks, 60);
  assert.equal(a.weaponRunner.chargeT, 1);
  const settled = Math.hypot(a.vel.x, a.vel.z);
  assert.ok(Math.abs(settled - 1.2) < 1e-6, `converged speed ${settled}`);
  // Upstream cooldown/state priority is preserved: a planted turret wins.
  a.weaponRunner.lockT = 0.5;
  assert.equal(a.weaponRunner.moveSpeed(), 0, 'lockT priority over charging');
});

test('two actors with distinct charge/Flow gear state share no target', async () => {
  const f = await fixture();
  const charging = f.make('charger'), idle = f.make('charger');
  // Distinct gear: charging actor stacks runSpeed, idle actor keeps none.
  const stacked = Array.from({ length: 3 }, () => ({ main: 'runSpeed', subs: ['runSpeed', 'runSpeed', 'runSpeed'] }));
  charging.s3.loadout = stacked;
  charging.setWeapon('charger');
  // Distinct Flow: only the idle actor is active.
  idle.s3.flow.active = true;
  idle.s3.flow.remaining = f.profile.flow.duration;
  charging.weaponRunner.charging = true;
  // Charger charging locks the baseline before gear; idle run scales by Flow.
  close(charging.weaponRunner.moveSpeed(), 1.2, 'charging target ignores run gear');
  close(idle.weaponRunner.moveSpeed(), f.PLAYER.runSpeed * gearCurve(f.profile.flow.abilityPoints, ...f.profile.gear.runSpeed), 'idle Flow target');
  assert.notEqual(charging.weapon, idle.weapon, 'per-actor weapon copies');
  assert.equal(f.profile.weapons.charger.moveSpeedFiring, 1.2, 'shared profile untouched');
  assert.equal(f.WEAPONS.charger.moveSpeedFiring, 1.2, 'shared source weapon untouched');
});
