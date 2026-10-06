import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

test('Issue #745: fresh humanoid ZR edge has 1F startup before Splatling charge progression begins', async () => {
  const f = await fixture();
  const a = f.make('splatling');
  const r = a.weaponRunner;

  // Stable humanoid stance
  assert.equal(a.form, 'kid');
  assert.equal(r.charging, false);
  assert.equal(r.chargeT, 0);

  // Fresh ZR edge on tick 1 (startup frame 1)
  a.intent.fire = true;
  f.tick(a, 1);

  // Acceptance criterion 1: chargeT must remain 0 and charging false on the ZR edge tick
  assert.equal(r.charging, false, 'charging must remain false on 1F startup tick');
  assert.equal(r.chargeT, 0, 'chargeT must remain 0 on 1F startup tick');
  assert.equal(r.charge, 0, 'charge must remain 0 on 1F startup tick');

  // Tick 2: charge progression begins
  f.tick(a, 1);
  assert.equal(r.charging, true, 'charging must begin after 1F startup');
  assert.ok(Math.abs(r.chargeT - 1 / 60) < 1e-5, `chargeT should be 1/60, got ${r.chargeT}`);

  // Acceptance criterion 2: first circle requires exactly 48 charge frames after progression begins
  // We already did 1 charge frame on tick 2, so 47 more ticks to reach 48 charge frames (0.8s)
  f.tick(a, 47);
  assert.ok(Math.abs(r.chargeT - 0.8) < 1e-5, `first circle must be 48 frames (0.8s), got ${r.chargeT}`);
  assert.ok(Math.abs(r.charge - 2 / 3) < 1e-5, `first circle charge should be 2/3, got ${r.charge}`);

  // Acceptance criterion 3: full charge requires exactly 72 charge frames after progression begins
  // 48 + 24 = 72 charge frames (1.2s)
  f.tick(a, 24);
  assert.ok(Math.abs(r.chargeT - 1.2) < 1e-5, `full charge must be 72 frames (1.2s), got ${r.chargeT}`);
  assert.equal(r.charge, 1, 'full charge must reach 1.0');
});

test('Issue #732: squid-origin charge startup remains zero through all 6 startup frames', async () => {
  const f = await fixture();
  const a = f.make('splatling');
  const r = a.weaponRunner;

  // Submerge into squid form
  a.form = 'squid';
  a.intent.squid = true;
  f.tick(a, 10);
  assert.equal(a.form, 'squid');
  assert.equal(r.charging, false);

  // Press ZR to cancel squid and emerge (tick 1 of emergence)
  a.intent.squid = false;
  a.intent.fire = true;

  // Ticks 1 through 6 are the 6 startup frames: chargeT must stay 0 through all 6
  for (let frame = 1; frame <= 6; frame++) {
    f.tick(a, 1);
    assert.equal(a.form, 'kid', `must be kid on frame ${frame}`);
    assert.equal(r.chargeT, 0, `chargeT must be 0 on startup frame ${frame}`);
    assert.equal(r.charging, false, `charging must be false on startup frame ${frame}`);
  }

  // Tick 7: 6F startup has completed; charge progression begins
  f.tick(a, 1);
  assert.equal(r.charging, true, 'charging must begin on frame 7 (after 6F startup)');
  assert.ok(Math.abs(r.chargeT - 1 / 60) < 1e-5, `chargeT should be 1/60 on frame 7, got ${r.chargeT}`);

  // 47 more ticks -> 48 charge frames (first circle)
  f.tick(a, 47);
  assert.ok(Math.abs(r.chargeT - 0.8) < 1e-5, `first circle must require 48 charge frames, got ${r.chargeT}`);

  // 24 more ticks -> 72 charge frames (full charge)
  f.tick(a, 24);
  assert.ok(Math.abs(r.chargeT - 1.2) < 1e-5, `full charge must require 72 charge frames, got ${r.chargeT}`);
  assert.equal(r.charge, 1);
});

test('Issues #732 and #745: FixedClock 30/60/120Hz produces identical fixed simulation transition ticks', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('splatling');
    const clock = new FixedClock();
    const history = [];

    // 10 ticks in squid
    a.form = 'squid';
    a.intent.squid = true;
    for (let i = 0; i < 10; i++) {
      clock.advance(1 / 60, () => f.tick(a));
    }

    // Emerge with fire
    a.intent.squid = false;
    a.intent.fire = true;

    // Run for 1.5 seconds (90 fixed ticks) at render cadence hz
    const frames = Math.round(1.5 * hz);
    for (let i = 0; i < frames; i++) {
      clock.advance(1 / hz, () => {
        f.tick(a);
        history.push({
          tick: clock.ticks,
          charging: a.weaponRunner.charging,
          chargeT: Math.round(a.weaponRunner.chargeT * 60) / 60,
          charge: Math.round(a.weaponRunner.charge * 1000) / 1000,
        });
      });
    }
    results.push(history);
  }

  // 30Hz, 60Hz, 120Hz histories must be identical tick-for-tick
  assert.equal(results[0].length, results[1].length);
  assert.equal(results[1].length, results[2].length);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);

  // First 6 emergence ticks must have charging false and chargeT 0
  for (let t = 0; t < 6; t++) {
    assert.equal(results[0][t].charging, false);
    assert.equal(results[0][t].chargeT, 0);
  }
  // 7th tick (index 6) must begin charge progression
  assert.equal(results[0][6].charging, true);
  assert.ok(results[0][6].chargeT > 0);
});

test('consecutive and recharge paths do not insert spurious startup gaps', async () => {
  const f = await fixture();
  const a = f.make('splatling');
  const r = a.weaponRunner;

  // Charge continuously for 10 ticks
  a.intent.fire = true;
  f.tick(a, 1); // 1F startup
  f.tick(a, 10); // 10 charge frames
  assert.ok(Math.abs(r.chargeT - 10 / 60) < 1e-5);

  // Keep fire held continuously for another 10 ticks
  f.tick(a, 10);
  // Charge must advance smoothly without any extra startup pauses
  assert.ok(Math.abs(r.chargeT - 20 / 60) < 1e-5);
});
