// #537: rolling ink follows the pinned WeaponRollParam endpoint pair
// (InkConsumeMin/MaxPerFrame reached at SpeedInkConsumeMin/Max) on the actual roll
// speed, is consumed once per fixed sim tick (never delayed by the 0.28-unit paint
// batch) and scales with Ink Saver (Main). Rates are %/s because a.ink is 0-100.
//
// Sourced endpoints (Leanny Splat3 Ver. 11.3.0 WeaponRollerNormal + Splatoon Wiki
// "Ink consumption per second while rolling scales from 1.2% to 6% depending on
// the rolling speed"): 0.0002/0.001 tank-fraction per 60Hz frame at 0.02/0.132
// units per frame => 1.2%/s at 1.2 u/s and 6.0%/s at 7.92 u/s. Below the minimum
// speed the minimum consumption is a floor. The exact stationary-roll behaviour
// is not independently verified against a console capture (see the evidence file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const DT = 1 / 60;
const MIN_RATE = 1.2, MAX_RATE = 6.0;    // %/s at the two SpeedInkConsume endpoints
const MIN_SPEED = 1.2, MAX_SPEED = 7.92; // world units/s

async function rollRig() {
  const f = await fixture({ productionComposition: true });
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  for (let i = 0; i < 240; i++) { f.G.time += DT; r.update(DT, { fire: true, firePressed: i === 0 }); }
  assert.equal(r.rolling, true, 'the roller enters the rolling state');
  return { f, a, r };
}

function drain(rig, speed, seconds, hz = 60) {
  const { f, a, r } = rig;
  const dt = 1 / hz, frames = Math.round(seconds / dt), step = speed * dt;
  a.ink = 100; a.vel.set(0, 0, speed); r.lastRollPos = a.pos.clone();
  let gross = 0, firstTick = null;
  for (let i = 0; i < frames; i++) {
    const before = a.ink;
    a.pos.z += step; f.G.time += dt;
    r.update(dt, { fire: true });
    const d = before - a.ink;
    if (d > 0) { gross += d; if (firstTick === null) firstTick = i + 1; }
  }
  return { rate: gross / seconds, firstTick };
}

test('the active profile carries the pinned rolling-consumption endpoints', async () => {
  const { f } = await rollRig();
  const w = f.WEAPONS.roller;
  assert.equal(w.rollInkMinPerFrame, 0.0002);
  assert.equal(w.rollInkMaxPerFrame, 0.001);
  assert.equal(w.rollInkMinSpeed, MIN_SPEED);
  assert.equal(w.rollInkMaxSpeed, MAX_SPEED);
});

test('rolling ink follows the endpoint pair with a floor at the minimum speed', async () => {
  const rig = await rollRig();
  assert.ok(Math.abs(drain(rig, MAX_SPEED, 3).rate - MAX_RATE) < 1e-3, 'max endpoint 6%/s');
  const mid = MIN_RATE + (MAX_RATE - MIN_RATE) * (4.56 - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
  assert.ok(Math.abs(drain(rig, 4.56, 5).rate - mid) < 1e-3, `between endpoints ${mid.toFixed(3)}%/s`);
  // Below the minimum speed (including a non-translating roll) the sourced minimum holds.
  for (const speed of [MIN_SPEED, 0.6, 0]) {
    assert.ok(Math.abs(drain(rig, speed, 5).rate - MIN_RATE) < 1e-3, `minimum floor at ${speed}u/s`);
  }
});

test('rolling ink is fixed-step invariant and never waits for the 0.28-unit paint batch', async () => {
  const rig = await rollRig();
  for (const hz of [30, 60, 120]) {
    const { rate, firstTick } = drain(rig, MIN_SPEED, 4, hz);
    assert.ok(Math.abs(rate - MIN_RATE) < 1e-3, `${hz}Hz drains ${MIN_RATE}%/s`);
    assert.equal(firstTick, 1, `${hz}Hz consumes on the first fixed tick (batch does not gate ink)`);
  }
});

test('Ink Saver (Main) scales both rolling endpoints and the measured drain', async () => {
  const rig = await rollRig();
  const { f, a } = rig;
  const base = f.WEAPONS.roller;
  a.s3.loadout = [{ main: 'none', subs: ['none', 'none', 'none'] },
                  { main: 'inkSaverMain', subs: ['none', 'none', 'none'] },
                  { main: 'none', subs: ['none', 'none', 'none'] }];
  a.setWeapon('roller');
  const m = a.s3.modifiers.inkSaverMain;
  assert.ok(m > 0 && m < 1, `inkSaverMain modifier applied (${m})`);
  assert.ok(Math.abs(a.weapon.rollInkMinPerFrame - base.rollInkMinPerFrame * m) < 1e-12);
  assert.ok(Math.abs(a.weapon.rollInkMaxPerFrame - base.rollInkMaxPerFrame * m) < 1e-12);
  assert.ok(Math.abs(drain(rig, MAX_SPEED, 3).rate - MAX_RATE * m) < 1e-3, 'drain scales with gear');
});
