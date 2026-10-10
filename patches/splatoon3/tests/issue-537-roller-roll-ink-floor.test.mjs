// #537: rolling ink keeps INKWAVE's distance rate with only the pinned minimum
// floor at/above its source speed, independently of the paint batch. Below that
// speed the legacy batch-based rule remains; Nintendo's intermediate, lower-speed,
// and stationary semantics are not established by the extracted fields.
//
// Sourced endpoints (Leanny Splat3 Ver. 11.3.0 WeaponRollerNormal + Splatoon Wiki
// "Ink consumption per second while rolling scales from 1.2% to 6% depending on
// the rolling speed"): 0.0002/0.001 tank-fraction per 60Hz frame at 0.02/0.132
// units per frame => 1.2%/s minimum at 1.2 u/s and 6.0%/s at 7.92 u/s. The
// maximum endpoint remains the preexisting distance-rate result; no intermediate
// rate curve is inferred from the endpoint fields.
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
  r.lastRollInkPos = a.pos.clone();
  r.rollInkChargedDistance = 0;
  let gross = 0, firstTick = null;
  for (let i = 0; i < frames; i++) {
    const before = a.ink;
    a.pos.z += step; f.G.time += dt;
    r.update(dt, { fire: true });
    const d = before - a.ink;
    if (d > 0) { gross += d; if (firstTick === null) firstTick = i + 1; }
  }
  return { rate: gross / seconds, firstTick, unpaintedDistance: a.pos.distanceTo(r.lastRollPos) };
}

test('the active profile carries the pinned rolling-consumption endpoints', async () => {
  const { f } = await rollRig();
  const w = f.WEAPONS.roller;
  assert.equal(w.rollInkMinPerFrame, 0.0002);
  assert.equal(w.rollInkMaxPerFrame, 0.001);
  assert.equal(w.rollInkMinSpeed, MIN_SPEED);
  assert.equal(w.rollInkMaxSpeed, MAX_SPEED);
});

test('minimum floor, intermediate distance rate, and maximum remain independent of paint batching', async () => {
  const rig = await rollRig();
  assert.ok(Math.abs(drain(rig, MAX_SPEED, 3).rate - MAX_RATE) < 1e-3, 'max endpoint 6%/s');
  const interiorSpeed = 4.56;
  const nativeDistanceRate = interiorSpeed * rig.f.WEAPONS.roller.rollInkPerMeter;
  const interior = drain(rig, interiorSpeed, 5);
  assert.ok(Math.abs(interior.rate - nativeDistanceRate) < 1e-3, `interior retains the distance rate ${nativeDistanceRate.toFixed(3)}%/s`);
  assert.ok(interior.rate > MIN_RATE, 'minimum floor does not replace an interior distance rate above the floor');
  assert.equal(interior.firstTick, 1, 'per-update ink charge is independent of the paint batch');
  const atMin = drain(rig, MIN_SPEED, 5);
  assert.ok(Math.abs(atMin.rate - MIN_RATE) < 1e-3, 'minimum endpoint is 1.2%/s at 1.2 units/s');
  assert.equal(atMin.firstTick, 1, 'ink is consumed before the 0.28-unit paint batch');
});

test('below-minimum and stationary rolls do not inherit the minimum endpoint', async () => {
  const rig = await rollRig();
  const speed = 0.6, seconds = 5;
  const subminimum = drain(rig, speed, seconds);
  const totalDistance = speed * seconds;
  const chargedDistance = totalDistance - subminimum.unpaintedDistance;
  const legacyRate = chargedDistance * rig.f.WEAPONS.roller.rollInkPerMeter / seconds;
  assert.ok(Math.abs(subminimum.rate - legacyRate) < 1e-3, 'sub-minimum speed preserves the existing distance rule');
  assert.ok(subminimum.firstTick > 1, 'sub-minimum legacy charge still follows its existing paint-distance batch');

  const stationary = drain(rig, 0, seconds);
  assert.equal(stationary.rate, 0, 'zero speed does not consume the positive-speed minimum');
  assert.equal(stationary.firstTick, null, 'stationary roll never drains ink');
});

test('a paint batch does not charge already-drained above-floor distance twice', async () => {
  const rig = await rollRig();
  const { f, a, r } = rig, start = a.pos.clone();
  a.ink = 100; r.lastRollPos = start.clone(); r.lastRollInkPos = start.clone();
  r.rollInkChargedDistance = 0;

  a.vel.set(0, 0, MAX_SPEED);
  a.pos.z += MAX_SPEED * DT; f.G.time += DT; r.update(DT, { fire: true });
  let lowDistance = 0;
  for (let lowTicks = 0; lowTicks < 15; lowTicks++) {
    const speed = 0.6;
    a.vel.set(0, 0, speed); a.pos.z += speed * DT;
    f.G.time += DT; r.update(DT, { fire: true });
    lowDistance += speed * DT;
  }

  const expectedDrain = MAX_SPEED * DT * rig.f.WEAPONS.roller.rollInkPerMeter + lowDistance * rig.f.WEAPONS.roller.rollInkPerMeter;
  assert.ok(r.lastRollPos.distanceTo(a.pos) < 1e-12, 'the low-speed segment reaches the existing paint batch');
  assert.ok(Math.abs((100 - a.ink) - expectedDrain) < 1e-9, 'only the uncharged low-speed distance is added at batch commit');
});

test('rolling ink is fixed-step invariant and never waits for the 0.28-unit paint batch', async () => {
  const rig = await rollRig();
  for (const hz of [30, 60, 120]) {
    const { rate, firstTick } = drain(rig, MIN_SPEED, 4, hz);
    assert.ok(Math.abs(rate - MIN_RATE) < 1e-3, `${hz}Hz drains ${MIN_RATE}%/s`);
    assert.equal(firstTick, 1, `${hz}Hz consumes on the first fixed tick (batch does not gate ink)`);
  }
});

test('Ink Saver (Main) scales the sourced floor and retained distance rate', async () => {
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
  assert.ok(Math.abs(a.weapon.rollInkPerMeter - base.rollInkPerMeter * m) < 1e-12);
  assert.ok(Math.abs(drain(rig, MIN_SPEED, 3).rate - MIN_RATE * m) < 1e-3, 'minimum floor scales with gear');
  const interiorSpeed = 4.56;
  const interiorDistanceRate = interiorSpeed * base.rollInkPerMeter * m;
  assert.ok(Math.abs(drain(rig, interiorSpeed, 3).rate - interiorDistanceRate) < 1e-3, 'existing interior distance rate scales with gear');
  assert.ok(Math.abs(drain(rig, MAX_SPEED, 3).rate - MAX_RATE * m) < 1e-3, 'drain scales with gear');
});

test('rolling ink enters the existing dry-roll threshold without further drain', async () => {
  const rig = await rollRig();
  const { a, r } = rig;
  a.ink = 0.55; a.vel.set(0, 0, MAX_SPEED);
  r.lastRollPos = a.pos.clone();
  r.lastRollInkPos = a.pos.clone();
  a.pos.z += MAX_SPEED * DT;
  r.update(DT, { fire: true });
  assert.ok(a.ink >= 0, 'rolling never makes the tank negative');
  assert.ok(Math.abs(a.ink - 0.45) < 1e-10, 'one maximum-speed tick consumes the sourced 0.1%');
  r.update(DT, { fire: true });
  assert.equal(r.rolling, true, 'the integrated #541 dry hold preserves Roller-down at the native threshold');
  assert.ok(Math.abs(a.ink - 0.45) < 1e-10, 'dry hold does not charge additional ink');
  assert.ok(a.ink >= 0, 'the dry threshold does not overdraw ink');
});
