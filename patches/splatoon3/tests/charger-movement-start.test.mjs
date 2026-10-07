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
  const a = f.make('charger'), r = a.weaponRunner; a.intent.fire = true;
  let speed = 0;
  for (let i = 1; i <= frame; i++) {
    r._charger(dt, { fire: true }, a.weapon);
    speed = r.moveSpeed();
  }
  return { f, a, r, speed };
}

test('S3 Charger uses 1.2 u/s from charging entry (startup 1F, frames 2/8/12/18/full)', async () => {
  const f0 = await fixture();
  assert.equal(f0.profile.weapons.charger.moveSpeedFiring, 1.2);
  assert.equal(f0.PLAYER.runSpeed, 5.76);
  // #726: the ZR edge is the 1F humanoid startup — charging has not begun, so
  // the uncharged run speed still applies on that frame.
  const startup = await chargingAt(1);
  close(startup.speed, f0.PLAYER.runSpeed, 'startup frame');
  assert.equal(startup.r.charging, false, 'no charging state during the 1F startup');
  // The charging baseline applies unchanged from the charging entry (frame 2).
  for (const frame of [2, 8, 12, 18]) {
    const { speed } = await chargingAt(frame);
    close(speed, 1.2, `frame ${frame}`);
  }
  const full = await chargingAt(61);   // 1F startup + 60 charge frames
  close(full.speed, 1.2, 'full charge');
  assert.equal(full.r.chargeT, 1);
});

test('S3 Charger uncharged run and post-release speeds are unchanged', async () => {
  const f = await fixture();
  const a = f.make('charger'), r = a.weaponRunner; a.intent.fire = true;
  close(r.moveSpeed(), f.PLAYER.runSpeed, 'uncharged run');
  for (let i = 0; i < 60; i++) r._charger(1 / 60, { fire: true }, a.weapon);
  assert.ok(r.charging);
  a.intent.fire = false; r._charger(1 / 60, { fire: false }, a.weapon);
  assert.equal(r.charging, false);
  close(r.moveSpeed(), a.weapon.moveSpeedFiring, 'after release firing window');
  a.intent.fire = false; r._charger(1 / 60, { fire: false }, a.weapon);   // consume the S3 1F release gap
  // Advance past the 0.35s firing window plus the 0.28s cooldown path.
  r.update(0.7, { fire: false });
  close(r.moveSpeed(), f.PLAYER.runSpeed, 'cooldown expiry restores run');
});

test('Charger composes with #470 Splatling charge target and unchanged Roller branch', async () => {
  const f = await fixture();
  const a = f.make('splatling'), r = a.weaponRunner;
  r.charging = true; r.charge = 0.2;
  // #470 intentionally replaces the old charge-progress ramp with this target.
  const expected = a.weapon.moveSpeedCharging;
  close(r.moveSpeed(), expected, 'splatling charging branch');
  const roller = f.make('roller');
  roller.weaponRunner.rolling = true; roller.weaponRunner.rollT = 2;
  assert.equal(roller.weaponRunner.moveSpeed(), roller.weapon.rollSpeed);
});

test('S3 Charger charging speed holds across 30/60/120Hz render cadences', async () => {
  // Two wall-clock seconds per cadence: hz render frames of dt 1/hz fed into
  // FixedClock(STEP=1/60) so every cadence yields exactly 120 real
  // Actor.update ticks: tick 1 is the #726 1F startup and chargeTime 1 is
  // reached at tick 61 with the same states on every cadence.
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('charger');
    a.intent.fire = true;
    a.intent.move.set(0, 0, 1);
    const clock = new FixedClock();
    const states = [];
    let firstCharging = null;
    for (let frame = 0; frame < 2 * hz; frame++) {
      clock.advance(1 / hz, (dt) => {
        f.G.time += dt;
        a.update(dt);
        states.push({ chargeT: a.weaponRunner.chargeT, charging: a.weaponRunner.charging, speed: a.weaponRunner.moveSpeed() });
        if (firstCharging === null && a.weaponRunner.charging) firstCharging = clock.ticks;
      });
    }
    assert.equal(clock.ticks, 120, `${hz}Hz yields 120 ticks`);
    assert.equal(firstCharging, 1, `${hz}Hz: charging enters on tick 2 after the 1F startup`);
    assert.equal(a.weaponRunner.chargeT, 1, `${hz}Hz reaches full charge`);
    assert.equal(a.weaponRunner.charging, true, `${hz}Hz still charging`);
    // Startup frame keeps the uncharged run speed; the charging baseline is
    // 1.2 from the entry tick on (#377 unchanged, entry shifted by #726 1F).
    close(states[0].speed, f.PLAYER.runSpeed, `startup frame at ${hz}Hz`);
    assert.equal(states[0].charging, false, `startup frame at ${hz}Hz`);
    for (let i = 1; i < states.length; i++) {
      close(states[i].speed, 1.2, `charging tick ${i + 1} at ${hz}Hz`);
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
  // Tick 1 is the #726 1F startup: no charging state yet.
  clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(clock.ticks, 1);
  assert.equal(a.weaponRunner.charging, false);
  // Tick 2 enters charging and targets the baseline immediately.
  clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(a.weaponRunner.charging, true);
  close(a.weaponRunner.moveSpeed(), 1.2, 'runner target at charging entry');
  const speed = Math.hypot(a.vel.x, a.vel.z);
  assert.ok(speed >= 0 && speed <= 1.2 + 1e-6, `horizontal speed ${speed}`);
  // Run the full charge after the startup tick: velocity converges to 1.2.
  for (let i = 2; i < 61; i++) clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(clock.ticks, 61);
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
  close(charging.weaponRunner.moveSpeed(), 1.2 * gearCurve(57, ...f.profile.gearExtra.runSpeedFiring), 'charging target applies the current dedicated firing-speed gear curve');
  close(idle.weaponRunner.moveSpeed(), f.PLAYER.runSpeed * gearCurve(f.profile.flow.abilityPoints, ...f.profile.gear.runSpeed), 'idle Flow target');
  assert.notEqual(charging.weapon, idle.weapon, 'per-actor weapon copies');
  assert.equal(f.profile.weapons.charger.moveSpeedFiring, 1.2, 'shared profile untouched');
  assert.equal(f.WEAPONS.charger.moveSpeedFiring, 1.2, 'shared source weapon untouched');
});
