// #726 — S3 Splat Charger humanoid fresh-start startup (前隙).
//
// Source: the community S3 frame-verification table cited by the issue
// (https://wikiwiki.jp/splatoon3mix/検証/メインウェポン 前隙 row): Splat Charger
// humanoid startup 1F / squid startup 6F / full charge 60F / release gap 1F,
// with `total frames = startup + charge frames + release gap + shot(1)` and
// `repeat frames = charge frames + recharge-unavailable frames` (no startup).
// The cited community table is headed v10.0.1 and does not identify the exact
// game patch used to verify these rows; no Switch re-measurement is claimed.
// Logic-only checks through the real installed native
// WeaponRunner (public modules + build adapter), no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ~= ${expected}`);

test('stable humanoid ZR edge consumes 1F startup before any charge frame', async () => {
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  a.intent.fire = true;
  // Tick 1: the edge update. S3 startup = frames until charging begins, so
  // neither `charging` nor `chargeT` may advance with the press itself.
  f.tick(a);
  assert.equal(r.charging, false, 'startup frame must not enter charging on the ZR edge update');
  assert.equal(r.chargeT, 0, 'the ZR edge update must not advance charge progress');
  assert.equal(r.charge, 0);
  assert.equal(f.shots.length, 0);
  // Tick 2: charging begins and the first charge frame lands on that update.
  f.tick(a);
  assert.equal(r.charging, true, 'charging begins after the verified 1F startup');
  close(r.chargeT, 1 / 60, 'first charge frame');
  assert.equal(f.shots.length, 0);
});

test('grounded full charge still takes 60 charge frames after startup begins', async () => {
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  a.intent.fire = true;
  // 1F startup + 60 charge frames = full at the 61st fixed tick from the edge,
  // and never earlier: 60 ticks must still be short of full.
  f.tick(a, 60);
  assert.equal(r.charging, true);
  assert.ok(r.charge < 1, `charge must not complete before 60 charge frames, got ${r.charge}`);
  close(r.chargeT, 59 / 60, 'charge frames after 60 ticks');
  f.tick(a);
  close(r.chargeT, 1, '60th charge frame');
  close(r.charge, 1, 'full charge');
  assert.equal(f.shots.length, 0, 'holding never fires');
});

test('input order: release during startup fires nothing, release after charge fires once with that charge', async () => {
  // (a) Press and release before any charge frame exists: nothing to release.
  {
    const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
    a.intent.fire = true;
    f.tick(a);                       // startup frame only
    a.intent.fire = false;
    f.tick(a, 4);
    assert.equal(r.charging, false);
    assert.equal(r.chargeT, 0);
    assert.equal(f.shots.length, 0, 'a release inside the startup window creates no shot');
  }
  // (b) Partial hold: startup + N charge frames, then one release shot whose
  // charge equals the accumulated progress (damage/paint mapping untouched).
  {
    const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
    a.ink = 100;
    a.intent.fire = true;
    f.tick(a, 1 + 10);               // 1 startup + 10 charge frames
    close(r.chargeT, 10 / 60, 'charge frames before release');
    const charge = r.charge;
    a.intent.fire = false;
    f.tick(a);
    assert.equal(f.shots.length, 1);
    close(f.shots[0].charge, charge, 'released shot carries the runner charge');
    assert.ok(charge > 0 && charge < 1, 'partial shot stays partial');
    assert.ok(a.ink < 100, 'partial shot spends ink');
  }
  // (c) Same-tick ZR + ZL: fire wins the actor admission, stays kid, and the
  // humanoid startup still applies to the fresh start (no cancel, no lock).
  {
    const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
    a.intent.fire = true; a.intent.squid = true;
    f.tick(a);
    assert.equal(a.form, 'kid', 'same-tick fire press wins admission');
    assert.equal(r.charging, false, 'startup frame still withheld');
    f.tick(a);
    assert.equal(r.charging, true);
    close(r.chargeT, 1 / 60, 'first charge frame after startup');
    assert.ok((a.s3.chargerInterruptRecover || 0) <= 1e-10, '#737 lock is not triggered without a cancel');
  }
});


test('squid-origin start keeps its independent emerge boundary with no inserted humanoid pre-gap', async () => {
  // Fresh squid-origin startup stays #566's root: this asserts only that the
  // #726 humanoid pre-gap is NOT inserted at the emerge boundary, i.e. the
  // first forwarded fire update still begins charge progression immediately
  // (current INKWAVE emerge-gate behaviour, independently re-tunable by #566).
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  const emerge = f.PLAYER.emergeDelay;
  a.intent.squid = true;
  f.tick(a, 20);
  assert.equal(a.form, 'squid');
  a.intent.fire = true;               // ZR held through the transition
  let first = null, guarded = 0;
  for (let i = 0; i < 30 && first === null; i++) {
    f.tick(a);
    if (a.form === 'kid' && a.kidT + 1e-12 < emerge) {
      assert.equal(r.charging, false, 'no charge before the emerge gate opens');
      guarded++;
    }
    if (r.charging) {
      first = i;
      close(r.chargeT, 1 / 60, 'squid-origin start begins progression on the first forwarded update');
    }
  }
  assert.ok(first !== null, 'held ZR starts charging after the emerge gate');
  assert.ok(guarded > 0, 'the emerge gate window was actually exercised');
});

test('re-charge after a prior shot omits the fresh-start pre-gap (repeat formula)', async () => {
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);                      // startup + 60 charge frames
  close(r.charge, 1, 'full charge');
  a.intent.fire = false;              // release -> shot (R edge; the R+1 latch is #680, untouched)
  f.tick(a);
  assert.equal(f.shots.length, 1);
  close(f.shots[0].charge, 1, 'full shot');
  // Hold ZR again through the post-shot cooldown: the repeat cycle starts
  // without reinserting the 1F fresh-start pre-gap.
  a.intent.fire = true;
  let started = -1;
  for (let i = 0; i < 40 && started < 0; i++) {
    f.tick(a);
    if (r.charging) {
      started = i;
      close(r.chargeT, 1 / 60, 'repeat cycle begins progression on its first update (no pre-gap)');
    }
  }
  assert.ok(started >= 0, 're-charge begins after the cooldown');
});

test('fixed 30/60/120 Hz render cadences yield identical fixed-tick startup timing', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('charger');
    const clock = new FixedClock();
    a.intent.fire = true;
    const rows = [];
    let firstCharging = null, firstFull = null;
    for (let frame = 0; frame < hz * 2; frame++) {
      clock.advance(1 / hz, () => {
        const t = clock.ticks;
        f.G.time += 1 / 60;
        a.update(1 / 60);
        rows.push([a.weaponRunner.charging ? 1 : 0, a.weaponRunner.chargeT]);
        if (firstCharging === null && a.weaponRunner.charging) firstCharging = t;
        if (firstFull === null && a.weaponRunner.chargeT === 1) firstFull = t;
      });
    }
    assert.equal(clock.ticks, 120, `${hz}Hz yields 120 ticks in 2s`);
    assert.equal(firstCharging, 1, `${hz}Hz: charging begins on tick 2 (1F startup)`);
    assert.equal(firstFull, 60, `${hz}Hz: full charge lands on tick 61 (1 + 60 frames)`);
    traces.push(rows);
  }
  assert.deepEqual(traces[1], traces[0], '60Hz matches 30Hz per-tick states');
  assert.deepEqual(traces[2], traces[0], '120Hz matches 30Hz per-tick states');
});

test('other weapons keep their immediate fire path (no global delay)', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a);
  assert.equal(f.shots.length, 1, 'a shooter still fires on the first held update');
});
