import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #930: S3 gives main fire / held sub / special 2x acceleration AND braking, with no air exemption.
// Ratio-only (no WU<->m conversion); the ordinary air baseline (P.airAccel/airDecel) is owned elsewhere.
const dt = 1 / 60;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
async function airborne(squid = false) {
  const f = await fixture(), a = f.make('shooter');
  a.grounded = false; a.ground.hit = false; a.vel.set(0, 0, 0);
  return { ...f, a, squid };
}
const states = {
  ordinary: () => {},
  fire: f => { f.a.weaponRunner.firingT = 1; },
  sub: f => { f.a.intent.sub = true; },
  special: f => { f.a.specialActive = { kind: 'storm' }; },
};
function accelStep(f, state) {
  f.a.vel.set(0, 0, 0); f.a.intent.move.set(1, 0, 0); states[state](f);
  f.a._horizontal(dt, f.squid, false); return Math.hypot(f.a.vel.x, f.a.vel.z);
}
function brakeStep(f, state, v) {
  f.a.vel.set(v, 0, 0); f.a.intent.move.set(0, 0, 0); states[state](f);
  f.a._horizontal(dt, f.squid, false); return v - f.a.vel.x;
}
for (const squid of [false, true]) {
  test(`#930 airborne ${squid ? 'squid' : 'humanoid'} attack/ready acceleration and braking are exactly 2x ordinary`, async () => {
    const base = await airborne(squid);
    const ordAccel = accelStep(base, 'ordinary'), ordBrake = brakeStep(base, 'ordinary', 3);
    assert.ok(ordAccel > 0 && ordBrake > 0, 'ordinary air steering owns a positive baseline');
    for (const state of ['fire', 'sub', 'special']) {
      const f = await airborne(squid);
      near(accelStep(f, state), 2 * ordAccel);
      near(brakeStep(f, state, 3), 2 * ordBrake);
    }
  });
}
test('#930 braking still clamps at zero and the target speed still bounds attack-state steering', async () => {
  const f = await airborne(); f.a.weaponRunner.firingT = 1;
  near(brakeStep(f, 'fire', 0.01), 0.01);
  f.a.vel.set(0, 0, 0); f.a.intent.move.set(1, 0, 0);
  for (let i = 0; i < 120; i++) f.a._horizontal(dt, false, false);
  assert.ok(f.a.vel.x <= Math.max(f.a.weaponRunner.moveSpeed(), f.PLAYER.airMinSpeed) + 1e-9);
});
test('#930 a running dodge keeps its own controller (no generic air steering over it)', async () => {
  const f = await airborne(); f.a.weaponRunner.dodge = { t: 0, dur: 1 };
  f.a.vel.set(2, 0, 0); f.a.intent.move.set(-1, 0, 0); f.a._horizontal(dt, false, false); near(f.a.vel.x, 2);
});
test('#930 the same fixed simulation gives the same braking trace at 30/60/120 render rates', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const g = await airborne(), clock = new FixedClock(), trace = [];
    g.a.weaponRunner.firingT = 1; g.a.vel.set(1, 0, 0); g.a.intent.move.set(0, 0, 0);
    for (let frame = 0; frame < hz / 3; frame++) clock.advance(1 / hz, delta => { g.a._horizontal(delta, false, false); trace.push(g.a.vel.x); });
    traces.push(trace);
  }
  assert.equal(traces[1].length, 20);
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[2], traces[1]);
  near(traces[1][0], 1 - 2 * 4 / 60); near(traces[1][19], 0);
});
