// Issue #680: Splatoon 3 defines a 1F release gap (発射隙) between recognizing
// that ZR was released and the Charger attack hitbox becoming active. The shot
// must not be created on the release-recognition tick; it is created one fixed
// simulation tick later, and it must be identical across render cadences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const FRAME = 1 / 60;

async function charged(f, frames = 62) {
  const a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, frames);
  assert.ok(a.weaponRunner.charging, 'precondition: still charging');
  return a;
}

test('a legal ZR release makes no shot on the release tick and shoots 1F later', async () => {
  const f = await fixture(), a = await charged(f), r = a.weaponRunner;
  a.intent.fire = false;
  f.tick(a);                                   // release tick R
  assert.equal(f.shots.length, 0, 'no attack hitbox/flight during tick R');
  assert.equal(r.charging, false, 'the charge is no longer live');
  assert.ok(r.s3ReleaseHold, 'the latched release state is armed');
  assert.ok(Math.abs(a.ink - 82) < 1e-9, 'current progressive owner already paid full charge; gap adds no debit');
  f.tick(a);                                   // R + 1
  assert.equal(f.shots.length, 1, 'the shot appears exactly one frame later');
  assert.equal(f.shots[0].charge, 1);
  assert.equal(r.s3ReleaseHold, false, 'the release state clears after the shot');
  assert.ok(Math.abs(a.ink - (82 + f.profile.resources.inkRefillKid / 60)) < 1e-9,
    'gap keeps the existing idle resource phase; release does not debit twice');
});

test('partial and full charges obey the same 1F release gap', async () => {
  for (const frames of [9, 31, 62]) {
    const f = await fixture(), a = await charged(f, frames), r = a.weaponRunner;
    const charge = r.charge;
    a.intent.fire = false;
    f.tick(a);
    assert.equal(f.shots.length, 0, `partial ${frames}F: no shot on release tick`);
    f.tick(a);
    assert.equal(f.shots.length, 1, `partial ${frames}F: shot 1F later`);
    assert.ok(Math.abs(f.shots[0].charge - charge) < 1e-9, 'the latched charge is preserved');
  }
});

test('the release gap does not fire while submerged and does not invent a delayed shot', async () => {
  const f = await fixture(), a = await charged(f);
  a.intent.squid = true;                       // dive while ZR is still held
  f.tick(a);
  assert.equal(a.form, 'squid');
  assert.equal(f.shots.length, 0);
  a.intent.fire = false;                       // cancel underwater
  f.tick(a, 90);
  assert.equal(f.shots.length, 0, 'the release gap never fires a cancelled charge');
  assert.equal(a.weaponRunner.s3ReleaseHold, false);
});

test('the release-to-shot interval is identical at 30/60/120Hz render cadence', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('charger');
    a.ink = 100; a.intent.fire = true;
    const clock = new FixedClock();
    let k = 0, releaseTick = -1, shotTick = -1;
    const step = (dt) => {
      k++;
      f.G.time += dt;
      a.update(dt);
      if (releaseTick < 0 && !a.intent.fire) releaseTick = k;
      if (shotTick < 0 && f.shots.length > 0) shotTick = k;
      if (releaseTick < 0 && k >= 61) a.intent.fire = false;
    };
    const frames = Math.ceil(71 * hz / 60) + 2;
    for (let frame = 0; frame < frames; frame++) clock.advance(1 / hz, step);
    assert.ok(releaseTick > 0 && shotTick > 0, `${hz}Hz: release and shot observed`);
    traces.push([releaseTick, shotTick]);
  }
  assert.deepEqual(traces[1], traces[0], '60Hz matches 30Hz');
  assert.deepEqual(traces[2], traces[0], '120Hz matches 30Hz');
  assert.equal(traces[0][1] - traces[0][0], 1, 'shot exactly one fixed tick after release');
});

test('repeat/recharge cooldown after the gap shot is not lengthened', async () => {
  const f = await fixture(), a = await charged(f), r = a.weaponRunner;
  a.intent.fire = false;
  f.tick(a);                                    // release tick
  f.tick(a);                                    // shot tick
  assert.equal(f.shots.length, 1);
  const cooldown = r.cooldown;
  // The current gate still owns rechargeDelay after the deferred native release.
  assert.ok(Math.abs(cooldown - a.weapon.rechargeDelay) < 1e-9, `cooldown ${cooldown}`);
});

test('submerging during the release gap retires the pending shot instead of replaying it after emergence', async () => {
  const f = await fixture(), a = await charged(f), r = a.weaponRunner;
  a.intent.fire = false;
  f.tick(a);
  assert.equal(r.s3ReleaseHold, true);
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid');
  assert.equal(r.s3ReleaseHold, false, 'dive retires the pending release');
  f.tick(a, 10);
  a.intent.squid = false;
  f.tick(a, 30);
  assert.equal(f.shots.length, 0, 'emergence does not replay an old release');
});

test('a special that owns the next tick cannot replay the old Charger release after finishing', async () => {
  const f = await fixture(), a = await charged(f), r = a.weaponRunner;
  a.weapon = { ...a.weapon, special: 'storm' };
  f.G.projectiles.throwStorm = () => {};
  a._resolve = () => {}; // this fixture's physics omits body collisions; test action ownership only
  a.special = a.specialCost();
  a.intent.fire = false;
  f.tick(a);
  assert.equal(r.s3ReleaseHold, true);
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.id, 'storm', 'special owns the due-shot tick');
  a.intent.sub = true; f.tick(a);
  a.intent.sub = false; f.tick(a);
  f.tick(a, 60);
  assert.equal(a.specialActive, null);
  assert.equal(r.s3ReleaseHold, false);
  assert.equal(f.shots.length, 0, 'no stale shot after the special');
});

test('current sub-minimum cancellation never arms the restored gap', async () => {
  const f = await fixture(), a = await charged(f, 8), r = a.weaponRunner;
  const paid = a.ink;
  a.intent.fire = false; f.tick(a, 3);
  assert.equal(f.shots.length, 0);
  assert.equal(r.s3ReleaseHold, false);
  assert.ok(a.ink >= paid, 'no second debit or invented pending shot');
});

test('reset retires a pending paid release and does not replay it', async () => {
  const f = await fixture(), a = await charged(f), r = a.weaponRunner;
  a.intent.fire = false; f.tick(a);
  assert.equal(r.s3ReleaseHold, true);
  r.reset(); f.tick(a, 3);
  assert.equal(r.s3ReleaseHold, false);
  assert.equal(f.shots.length, 0);
});

test('zero and under-minimum paid ink cannot synthesize a Charger shot on release', async () => {
  for (const ink of [0, 0.1, 1]) {
    const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
    a.ink = ink; a.intent.fire = true;
    for (let i = 0; i < 45; i++) {
      f.tick(a);
      // Deliberately prevent refill in this negative fixture so the payment
      // never reaches the pinned 2.25-ink minimum, even after a long hold.
      a.ink = 0;
    }
    assert.ok((r.s3ChargerSpent || 0) < a.weapon.inkMin, 'fixture must remain underfunded');
    a.intent.fire = false; f.tick(a, 3);
    assert.equal(f.shots.length, 0, `underfunded ${ink}-ink hold created a free projectile`);
    assert.equal(r.s3ReleaseHold, false, 'underfunded release must not arm a deferred shot');
  }
});

test('exactly paid Charger minimum still releases after the existing one-tick gap', async () => {
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  a.ink = a.weapon.inkMin; a.intent.fire = true;
  // Keep the remaining tank available so progressive payment can actually
  // reach the minimum (unlike the deliberately unfunded negative fixtures).
  f.tick(a, 45);
  assert.ok(r.s3ChargerSpent + 1e-10 >= a.weapon.inkMin, 'minimum ink has been paid');
  a.intent.fire = false; f.tick(a);
  assert.equal(f.shots.length, 0, 'release gap remains intact at the paid minimum');
  f.tick(a);
  assert.equal(f.shots.length, 1, 'paid minimum charge must still fire exactly once');
});
