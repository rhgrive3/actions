import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

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

test('a squid press during charge (not stream) keeps the existing same-tick admission', async () => {
  // Charge interruption is a separate root; this fix must not delay it.
  const f = await fixture(), a = f.make('splatling');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 30);
  assert.equal(a.weaponRunner.charging, true);
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'charging dive is admitted on the same tick as before');
  assert.equal(a.weaponRunner.charging, false);
  assert.equal(f.shots.length, 0);
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
