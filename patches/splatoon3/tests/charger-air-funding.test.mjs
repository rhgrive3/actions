import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installIssueFiveHotfixC } from '../runtime/issue-five-hotfix-c.mjs';
const DT = 1 / 60;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
async function setup(ink, grounded) {
  const f = await fixture(); installIssueFiveHotfixC(f);
  const a = f.make('charger'), r = a.weaponRunner;
  a.ink = ink; a.grounded = grounded; a.kidT = 1; a.intent.fire = true;
  const step = () => { f.G.time += DT; r.update(DT, { fire: true }); };
  step(); // fresh-start gate, real time rather than scaled charge time
  assert.equal(r.charging, false);
  return { a, r, step };
}
test('#1038 airborne minimum-charge exemption does not exempt insufficient ink', async () => {
  for (const ink of [2.24, 2.25, 10, 17.99, 18]) {
    for (const grounded of [true, false]) {
      const { r, step } = await setup(ink, grounded);
      for (let i = 0; i < 4; i++) step();
      const frames = ink < 18 ? 4 / 3 : 4;
      near(r.chargeT * 60, frames, `${ink}% grounded=${grounded} progress`);
      near(r.s3ChargerElapsed * 60, frames, 'completion clock matches progress');
      near(r.s3ChargerHeldTime, 4 * DT, 'held time remains real time');
      near(r.s3ChargerSpent, frames * 2.25 / 8, 'payment follows charge');
    }
  }
});
test('#1038 airborne and low-funding rates combine once after the 8F minimum', async () => {
  const { a, r, step } = await setup(17.99, false);
  for (let i = 0; i < 36; i++) step();
  near(r.chargeT * 60, 12, '1/3 rather than stacked 1/9 after the minimum');
  near(a.ink + r.s3ChargerSpent, 17.99, 'paid ink stays in the funding budget');
  a.grounded = true;
  for (let i = 0; i < 6; i++) step();
  near(r.chargeT * 60, 14, 'landing preserves the insufficient-funding rate');
});
test('#1038 fully funded airborne charge still has the normal 8F exemption', async () => {
  const { r, step } = await setup(18, false);
  for (let i = 0; i < 14; i++) step();
  near(r.chargeT * 60, 10, '8 normal frames then 6 one-third frames');
});
