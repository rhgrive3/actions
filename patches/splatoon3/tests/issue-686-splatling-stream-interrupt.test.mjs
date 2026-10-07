import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

// Issue #686: cancelling an active Heavy Splatling stream into squid form is a
// continuous-fire interruption (連射中断後隙), not an instant form swap.
// Reference Splatoon 3 Ver. 11.3.0 verification table: squid form becomes
// available 6F after the interrupting input. The authoritative sim runs at a
// fixed 1/60 s, so the transition must land on exactly that fixed tick.

// Fully charge, then release ZR so the weapon is in an active `streaming`
// state. Mirrors the existing integration precondition (73F charge -> release
// -> 2F) but keeps this focused on the squid-cancel path.
async function streaming(f) {
  const a = f.make('splatling');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 73);
  assert.equal(a.weaponRunner.charging, true, 'precondition: full charge');
  a.intent.fire = false;
  f.tick(a, 2);
  assert.equal(a.weaponRunner.streaming, true, 'precondition: active stream');
  assert.equal(a.form, 'kid', 'precondition: firing stance is kid');
  return a;
}

test('squid-cancel of an active Splatling stream holds the kid form for the 6F interruption boundary', async () => {
  const f = await fixture(), a = await streaming(f);
  const count = f.shots.length;

  a.intent.squid = true;
  // Input frame plus the first five completed interruption frames stay kid.
  for (let i = 0; i <= 5; i++) {
    f.tick(a);
    assert.equal(a.form, 'kid', `frame ${i}: squid is not admitted during the interruption`);
    assert.equal(f.shots.length, count, `frame ${i}: interruption stops stream-shot scheduling`);
  }
  // 6F after the interrupting input, squid becomes eligible.
  f.tick(a);
  assert.equal(a.form, 'squid', 'squid admitted at the 6F boundary');
  assert.equal(f.shots.length, count, 'no stream projectile is emitted after the interruption');
  assert.equal(a.weaponRunner.streaming, false, 'the active stream was cleared by the interruption');
});

test('the interruption clears after admission so a later stream is not permanently locked', async () => {
  const f = await fixture(), a = await streaming(f);
  a.intent.squid = true;
  f.tick(a, 7);
  assert.equal(a.form, 'squid');
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'the interruption timer is released');

  // Resurface and charge a fresh stream; the previous interruption is gone.
  a.intent.squid = false;
  f.tick(a);
  assert.equal(a.form, 'kid');
  a.intent.fire = true;
  f.tick(a, 73);
  assert.equal(a.weaponRunner.charging, true, 'a later charge is not blocked by the old interrupt');
});

test('#686: the charge cancel is governed by its own window, not by this timer', async () => {
  // #679 owns the charge cancel. It must open only the charge window, so the
  // stream interruption can neither consume nor be consumed by it.
  const f = await fixture(), a = f.make('splatling');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 30);
  assert.equal(a.weaponRunner.charging, true);
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0);

  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'a charge cancel never opens the stream timer');
  assert.ok(a.weaponRunner.s3ChargeInterruptT > 0, '#679 opens its own charge window instead');
  assert.equal(a.form, 'kid', 'the charge cancel is held by its own window, not admitted on the same tick');
  assert.equal(a.weaponRunner.charging, true, 'the charge survives until its cancel commits');
  assert.equal(f.shots.length, 0, 'the charge cancel emits nothing');

  f.tick(a, 6);
  assert.equal(a.form, 'squid', 'the charge window releases at its own 6F boundary');
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'the stream timer was never touched');
});

test('#686: an uninterrupted stream keeps its 80F/160F duration and 4F cadence', async () => {
  const run = async (chargeTicks, expectTicks, expectShots) => {
    const f = await fixture(), a = f.make('splatling');
    a.ink = 100;
    a.intent.fire = true;
    f.tick(a, chargeTicks);
    a.intent.fire = false;
    f.tick(a);
    assert.equal(a.weaponRunner.streaming, true, 'precondition: active stream');
    const gaps = []; let last = null, ticks = 0;
    while (a.weaponRunner.streaming && ticks < 400) {
      const n = f.shots.length;
      f.tick(a); ticks++;
      if (f.shots.length > n) { if (last !== null) gaps.push(ticks - last); last = ticks; }
    }
    assert.ok(ticks >= expectTicks - 1 && ticks <= expectTicks + 1,
      `natural stream duration stays ${expectTicks}F (got ${ticks}F)`);
    assert.equal(f.shots.length, expectShots, 'stream shot count is unchanged without a cancel');
    assert.ok(gaps.length > 0 && gaps.every(g => g === 4), 'the 4F stream cadence is unchanged');
    assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'a natural end opens no interruption window');
    assert.equal(a.weaponRunner.s3ChargeInterruptT, 0);
  };
  await run(48, 81, 20);   // first-circle release stream (80F)
  await run(73, 161, 40);  // full-charge release stream (160F)
});

test('natural stream exhaustion is not turned into a 6F interruption', async () => {
  // #501 stream-end path: once the stream ends on its own, a later squid press
  // is admitted immediately because no interruption is active.
  const f = await fixture(), a = await streaming(f);
  f.tick(a, 220);
  assert.equal(a.weaponRunner.streaming, false, 'precondition: natural stream end');
  const count = f.shots.length;
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'natural end still allows an immediate dive');
  assert.equal(f.shots.length, count);
});

test('the interruption boundary is a fixed-simulation tick, not a render-rate effect', async () => {
  // The authoritative clock is fixed at 1/60; feeding the same fixed steps must
  // reproduce the exact same transition tick regardless of when it is sampled.
  const f = await fixture(), a = await streaming(f);
  a.intent.squid = true;
  let transition = -1;
  for (let i = 0; i <= 7 && transition < 0; i++) {
    f.tick(a);
    if (a.form === 'squid') transition = i;
  }
  assert.equal(transition, 6, 'transition lands on the 6th fixed step after the input');
});

test('the dedicated prepaid stream refunds its unspent balance once during the new interruption', async () => {
  const f = await fixture(), a = await streaming(f), r = a.weaponRunner;
  const ink = a.ink, unspent = r.s3Spin.unspent, count = f.shots.length;
  a.intent.squid = true; f.tick(a);
  assert.ok(Math.abs(a.ink - (ink + unspent)) < 1e-9, 'dedicated cancel owns the exact refund');
  assert.equal(r.s3Spin, null);
  const refunded = a.ink;
  f.tick(a, 4);
  assert.ok(Math.abs(a.ink - refunded) < 1e-9, 'remaining interruption frames do not refund twice');
  assert.equal(f.shots.length, count, 'no prepaid remainder is emitted after cancel');
});
