// #737 — S3 Splat Charger charge-interruption → ink recovery delay (後隙).
//
// Source: the community S3 frame-verification table cited by the issue
// (https://wikiwiki.jp/splatoon3mix/検証/メインウェポン 前隙・後隙): Splat Charger
// charge interruption → sub 5F / squid 6F / ink recovery 19F. Community-
// The cited community table is headed v10.0.1 and does not identify the exact
// game patch used to verify these rows; no Switch re-measurement is claimed.
// #416 owns the separate 6F cancel→squid form recovery; normal post-shot
// recovery keeps its own lastFire/inkRecoverStop gate. Logic-only checks
// through the real installed native actor + resource runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const lock = a => a.s3?.chargerInterruptRecover || 0;

// Stand in own ink long enough that the ordinary post-shot delay can never be
// what blocks the refill, then start a partial charge.
async function partialCharge(f, frames = 10) {
  const a = f.make('charger');
  a.ink = 50;
  f.tick(a, 25);                      // lastFire well past the 20F shot delay
  a.ink = 50;                         // keep refill headroom without pre-fill
  a.intent.fire = true;
  f.tick(a, frames);                  // startup + (frames-1) charge frames
  assert.equal(a.weaponRunner.charging, true, 'precondition: charging');
  assert.ok(a.weaponRunner.charge < 0.999, 'precondition: partial charge');
  a.ink = 50;
  return a;
}

test('partial-charge cancel into own ink cannot refill for the verified 19F interval', async () => {
  const f = await fixture();
  const a = await partialCharge(f);
  const r = a.weaponRunner;
  const before = a.ink;
  a.intent.squid = true;              // ZL after ZR: the deliberate cancel
  f.tick(a);                          // cancel tick C
  assert.equal(a.form, 'squid', '#416 form transition stays immediate (independent)');
  assert.equal(r.charging, false, 'the wrapper cleared the charge');
  assert.ok(lock(a) > 0, 'the charge interruption starts a dedicated ink-recovery lock');
  assert.equal(a.ink, before, 'no refill on the cancellation update');
  // 19 fixed ticks are blocked (C .. C+18).
  for (let i = 1; i <= 18; i++) {
    f.tick(a);
    assert.equal(a.ink, before, `no refill at cancel+${i}F`);
  }
  f.tick(a);                          // C+19: the boundary opens
  assert.ok(a.ink > before, 'ink recovery becomes eligible at the 19F boundary');
  assert.ok(a.ink - before <= 33.3334 / 60 + 1e-9, 'at most one swim-refill tick is applied');
});

test('a fresh charge that is cancelled immediately also locks for 19F', async () => {
  const f = await fixture();
  const a = await partialCharge(f, 2); // startup + first charge frame only
  const before = a.ink;
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid');
  assert.ok(lock(a) > 0, 'fresh cancels take the same interruption path');
  assert.equal(a.ink, before, 'no refill on the fresh-cancellation update');
  for (let i = 1; i <= 18; i++) { f.tick(a); assert.equal(a.ink, before, `locked at +${i}F`); }
  f.tick(a);
  assert.ok(a.ink > before, 'refill resumes at the 19F boundary');
});

test('input order decides whether an interruption exists at all', async () => {
  // Same-tick ZR + ZL: fire wins admission, no form change, no interruption.
  {
    const f = await fixture(), a = f.make('charger');
    a.ink = 100;
    a.intent.fire = true; a.intent.squid = true;
    f.tick(a, 6);
    assert.equal(a.form, 'kid', 'same-tick fire wins');
    assert.equal(a.weaponRunner.charging, true);
    assert.ok(lock(a) <= 1e-10, 'no interruption lock without a cancel');
  }
  // ZR first, ZL later: form switches and the interruption lock starts.
  {
    const f = await fixture(), a = await partialCharge(f);
    assert.ok(a._firePressT <= f.G.time, 'fire was pressed before ZL');
    a.intent.squid = true;
    f.tick(a);
    assert.equal(a.form, 'squid');
    assert.ok(lock(a) > 0, 'the newer squid press cancels the charge');
  }
  // ZL first, ZR later: the charge starts as a squid-origin start; no cancel
  // occurs and no lock is written.
  {
    const f = await fixture(), a = f.make('charger');
    a.ink = 100;
    a.intent.squid = true;
    f.tick(a, 2);
    assert.equal(a.form, 'squid');
    a.intent.fire = true;              // newer fire press wins back kid form
    f.tick(a, 8);
    assert.equal(a.form, 'kid');
    assert.ok(lock(a) <= 1e-10, 'no lock when no charge was interrupted');
  }
});

test('full-charge storage and the normal fired-shot path never take the partial-cancel lock', async () => {
  // (a) Charge keep: full charge + held ZR stores instead of cancelling.
  {
    const f = await fixture(), a = f.make('charger');
    a.ink = 100;
    a.intent.fire = true;
    f.tick(a, 61);
    assert.equal(a.weaponRunner.charge, 1, 'precondition: full charge');
    a.intent.squid = true;
    f.tick(a);
    assert.equal(a.form, 'squid');
    assert.ok(a.weaponRunner.s3Stored, 'precondition: charge kept');
    assert.ok(lock(a) <= 1e-10, 'storage does not start the partial-cancel recovery path');
    f.tick(a, 5);
    assert.ok(lock(a) <= 1e-10, 'the keep window never arms the interruption lock');
  }
  // (b) Fired shot: recovery still keys off the ordinary post-shot timing.
  {
    const f = await fixture(), a = f.make('charger');
    a.ink = 100;
    a.intent.fire = true;
    f.tick(a, 61);
    a.intent.fire = false;
    f.tick(a);                          // release enters the existing 1F gap
    assert.equal(f.shots.length, 0);
    f.tick(a);                          // actual shot (lastFire = 0)
    assert.equal(f.shots.length, 1);
    assert.ok(lock(a) <= 1e-10, 'a normal shot does not arm the interruption lock');
    a.ink = 50;
    for (let i = 1; i <= 18; i++) { f.tick(a); assert.equal(a.ink, 50, `post-shot delay holds at +${i}F`); }
    f.tick(a);                          // +19F: S3 measured refill boundary
    assert.ok(a.ink > 50, 'ordinary post-shot recovery opens at the 19F boundary');
  }
});

test('dry cancellation and enemy-ink rejected form entry cannot gain refill', async () => {
  for (const surface of ['dry', 'enemy']) {
    const f = await fixture();
    f.G.paint.sample = () => (surface === 'enemy' ? 2 : 0);
    const a = await partialCharge(f);
    const before = a.ink;
    a.intent.squid = true;
    f.tick(a);                          // cancel tick
    assert.equal(a.form, surface === 'enemy' ? 'kid' : 'squid', 'enemy ink keeps the current form admission gate');
    if (surface === 'enemy') {
      assert.equal(a.weaponRunner.charging, true, 'rejected squid entry does not cancel the charge');
      assert.equal(lock(a), 0, 'no interruption timer without accepted cancellation');
      assert.ok(a.ink < before, 'continued charge pays its current incremental cost');
      const paid = a.ink;
      f.tick(a, 30);
      assert.ok(a.ink < paid, 'continued paid charge never refills on enemy ink');
    } else {
      assert.equal(a.ink, before, 'dry: no refill on the cancel update');
      assert.ok(lock(a) > 0, 'dry cancellation still owns its recovery gate');
      f.tick(a, 30);
      assert.equal(a.ink, before, 'dry: no refill after the whole interruption interval');
    }
  }
});

test('the Charger interruption gate does not cross weapon swaps and clears on life reset', async () => {
  const f = await fixture();
  const a = await partialCharge(f);
  a.intent.squid = true;
  f.tick(a);
  assert.ok(lock(a) > 0, 'precondition: Charger interruption gate is active');

  // Weapon changes reset the runner but the actor resource timer remains. A
  // different weapon must not inherit a Charger-only recovery gate.
  a.setWeapon('shooter');
  assert.ok(lock(a) > 0, 'the test retains the pending Charger timer');
  a.ink = 50;
  a.lastFire = 99;
  const before = a.ink;
  f.updateResources(a, 1 / 60);
  assert.ok(a.ink > before, 'another weapon refills while the Charger timer is pending');

  a.reset();
  assert.equal(lock(a), 0, 'a new life clears the old Charger interruption timer');
});

test('fixed 30/60/120 Hz render cadences yield the same 19F fixed-tick boundary', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('charger');
    const clock = new FixedClock();
    f.tick(a, 25);
    a.ink = 50;
    a.intent.fire = true;
    for (let i = 0; i < 10; i++) f.tick(a);
    a.ink = 50;
    const before = a.ink;
    a.intent.squid = true;
    f.tick(a);                          // the cancel pass C happens here, before the clock loop
    assert.equal(a.form, 'squid', 'the cancel lands on this tick');
    assert.equal(a.ink, before, 'no refill on the cancel pass');
    // Loop index 0 below is therefore tick C+1; index k is tick C+1+k, so the
    // 19F boundary (refill at C+19) must land at index 18 on every cadence.
    const rows = [];
    let firstRefill = null;
    for (let frame = 0; frame < hz; frame++) {
      clock.advance(1 / hz, () => {
        f.G.time += 1 / 60;
        a.update(1 / 60);
        if (firstRefill === null && a.ink > before) firstRefill = clock.ticks;
        rows.push([a.form === 'kid' ? 0 : 1, lock(a) > 1e-10 ? 1 : 0, a.ink]);
      });
    }
    assert.ok(firstRefill !== null, `${hz}Hz: refill eventually resumes`);
    traces.push({ rows, refillIndex: firstRefill });
  }
  assert.equal(traces[0].refillIndex, 18, 'refill resumes at cancel+19F (loop index 18)');
  assert.deepEqual(traces[1].rows, traces[0].rows, '60Hz matches 30Hz per-tick states');
  assert.deepEqual(traces[2].rows, traces[0].rows, '120Hz matches 30Hz per-tick states');
  assert.equal(traces[1].refillIndex, 18, '60Hz boundary');
  assert.equal(traces[2].refillIndex, 18, '120Hz boundary');
});
