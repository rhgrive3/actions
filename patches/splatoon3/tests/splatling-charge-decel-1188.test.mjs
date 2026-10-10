// PR1188 (A05): Splatling charge-start ground slowdown on the real Actor.
// Source: 11.3.0 WeaponSpinnerStandard MoveSpeed_Charge 0.062 DU/F,
// VelGnd_DownRt_Charge 0.05. The per-frame proportional decay is a labelled
// model; VelGnd_Bias_Charge stays unmapped (no published definition).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { splatlingChargeDownRate } from '../runtime/splatling.mjs';

const close = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} ~= ${b}`);

async function trace(hz, { charge = true, ticks = 90 } = {}) {
  const f = await fixture(), a = f.make('splatling'), clock = new FixedClock(), rows = [];
  a.intent.move.set(0, 0, 1); a.intent.fire = false;
  // Reach the steady run speed first.
  for (let i = 0; i < 60; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  const run = Math.hypot(a.vel.x, a.vel.z);
  a.intent.fire = charge;
  for (let frame = 0; clock.ticks < ticks; frame++) clock.advance(1 / hz, dt => {
    f.G.time += dt; a.update(dt);
    rows.push({ speed: Math.hypot(a.vel.x, a.vel.z), charging: a.weaponRunner.charging, grounded: a.grounded,
      target: a.weaponRunner.moveSpeed() });
  });
  return { f, a, run, rows };
}

test('PR1188 profile exposes the pinned VelGnd_DownRt_Charge', async () => {
  const f = await fixture();
  assert.equal(splatlingChargeDownRate(f.profile), .05);
  close(f.WEAPONS.splatling.moveSpeedCharging, .062 * 60, 1e-9, 'MoveSpeed_Charge');
});

test('PR1188 charge start sheds run speed by 5% per reference frame down to MoveSpeed_Charge', async () => {
  const { run, rows } = await trace(60);
  assert.ok(run > 5, `steady run speed before charging (${run})`);
  const first = rows.findIndex(r => r.charging);
  assert.ok(first >= 0, 'charge begins');
  // Actor._horizontal runs before WeaponRunner.update, so the tick that admits
  // the charge still moved at run speed; the dedicated slowdown starts next tick.
  close(rows[first].speed, run, 1e-6, 'admission tick');
  let expected = rows[first].speed;
  let decayFrames = 0;
  for (let i = first + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.grounded || !r.charging) break;
    if (expected > r.target + 1e-9) {
      expected = Math.max(r.target, expected * .95); decayFrames++;
      close(r.speed, expected, 1e-6, `frame ${i - first}`);
    }
  }
  // 5.76 -> 3.72 at 5%/frame takes ceil(ln(3.72/5.76)/ln(0.95)) = 9 frames.
  assert.ok(decayFrames >= 8 && decayFrames <= 10, `decay frames ${decayFrames}`);
  close(rows.at(-1).speed, rows.at(-1).target, 1e-6, 'settles at MoveSpeed_Charge');
});

test('PR1188 charge slowdown is identical at 30/60/120 Hz render cadence', async () => {
  const runs = [];
  for (const hz of [30, 60, 120]) runs.push((await trace(hz)).rows.map(r => +r.speed.toFixed(9)));
  assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[1], runs[2]);
});

test('PR1188 non-charging Splatling and other weapons keep the generic run brake', async () => {
  const idle = await trace(60, { charge: false });
  for (const r of idle.rows) assert.equal(r.charging, false);
  const f = await fixture(), s = f.make('shooter');
  s.intent.move.set(0, 0, 1);
  for (let i = 0; i < 60; i++) { f.G.time += 1 / 60; s.update(1 / 60); }
  assert.equal(s.weaponRunner.s3SplatlingChargeDecel, undefined);
});
