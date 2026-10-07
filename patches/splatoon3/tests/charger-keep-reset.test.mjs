// Issue #810: a valid squid→humanoid transition with ZR still held refreshes
// the per-keep-cycle charge-keep lifetime (S3 KeepChargeFullFrame 75F / 1.25 s),
// so re-submerging before the stored shot fires starts a fresh window instead
// of resuming the depleted remainder. #359 (no dry/enemy/air store), #390 (ZR
// release cancels) and #291/#101 (resurfacing fire/laser delays) are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function kept(f) {
  const a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);
  assert.ok(a.weaponRunner.charge >= .999, 'precondition: full charge');
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'precondition: submerged');
  assert.equal(a.submerged, true, 'precondition: actual Actor reports an own-ink submerged state');
  assert.ok(a.weaponRunner.s3Stored, 'precondition: charge kept');
  return a;
}

test('squid→humanoid refreshes the keep window; re-submerge starts a full 75F cycle', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  const keep = a.weapon.keepChargeTime;
  assert.equal(keep, 1.25, 'reference keep window is 75 frames');
  f.tick(a, 60);                                 // consume 60F of the first cycle
  const before = r.s3Stored.remaining;
  assert.ok(before > 0 && before < keep / 2, `depleted first cycle keeps ~15F, got ${before}`);
  assert.equal(f.shots.length, 0, 'no shot while keeping');
  a.intent.squid = false;                        // surface with ZR still held
  f.tick(a);
  assert.equal(a.form, 'kid', 'surfaced to humanoid');
  assert.ok(r.s3Stored, 'store survives the pop-out while ZR stays held');
  // The transition refresh lands on the humanoid tick, before the store can
  // be restored past emergeDelay, so the next keep cycle is a full window.
  assert.ok(Math.abs(r.s3Stored.remaining - keep) < 1e-9,
    `keep refreshed to full window, got ${r.s3Stored.remaining}`);
  assert.equal(r.charge, 1, 'presentation still shows the full kept charge');
  assert.equal(f.shots.length, 0, 'resurfacing delay still holds the shot');
  a.intent.squid = true;                         // re-submerge before firing
  f.tick(a);
  assert.equal(a.form, 'squid');
  assert.ok(r.s3Stored, 're-submerge starts the refreshed keep cycle');
  assert.ok(Math.abs(r.s3Stored.remaining - (keep - 1 / 60)) < 1e-6,
    `refreshed cycle counts one tick down, got ${r.s3Stored.remaining}`);
  f.tick(a, Math.round(keep * 60) - 2);          // full fresh window, not 15F
  assert.ok(r.s3Stored, 'refreshed keep survives far past the old 15F remainder');
  f.tick(a, 1);
  assert.equal(r.s3Stored, null, 'refreshed cycle still expires at 75F');
  assert.equal(f.shots.length, 0, 'expiry never becomes a shot');
});

test('repeated surface/re-submerge cycles preserve the shot beyond one contiguous 75F window', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  const keep = a.weapon.keepChargeTime;
  for (let cycle = 0; cycle < 3; cycle++) {
    f.tick(a, 60);
    assert.ok(r.s3Stored, `cycle ${cycle}: keep still alive after 60F`);
    a.intent.squid = false;
    f.tick(a);
    assert.ok(r.s3Stored, `cycle ${cycle}: store survives surfacing`);
    assert.ok(Math.abs(r.s3Stored.remaining - keep) < 1e-9, `cycle ${cycle}: refreshed to full`);
    a.intent.squid = true;
    f.tick(a);
    assert.ok(r.s3Stored, `cycle ${cycle}: store survives re-submerge`);
    assert.equal(f.shots.length, 0, `cycle ${cycle}: no shot fired`);
  }
});

test('ZR release still cancels after a transition refresh', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  f.tick(a, 60);
  a.intent.squid = false;
  f.tick(a);
  assert.ok(r.s3Stored, 'precondition: refreshed store after surfacing');
  a.intent.fire = false;                         // physical ZR release
  f.tick(a);
  assert.equal(r.s3Stored, null, 'release cancels even after a refresh');
  assert.equal(r.charge, 0, 'cancelled store leaves no full-charge presentation');
  f.tick(a, 80);
  assert.equal(f.shots.length, 0, 'no delayed shot survives the cancellation');
});

test('refresh is frame-rate invariant and never recreates a store', async () => {
  for (const hz of [30, 120]) {
    const f = await fixture(), dt = 1 / hz;
    const step = (a, n) => { for (let i = 0; i < n; i++) { f.G.time += dt; a.update(dt); } };
    const a = f.make('charger');
    a.ink = 100;
    a.intent.fire = true;
    step(a, Math.ceil(1.1 * hz));
    a.intent.squid = true;
    step(a, 1);
    assert.ok(a.weaponRunner.s3Stored, `precondition at ${hz} Hz`);
    const keep = a.weapon.keepChargeTime;
    step(a, hz);                                 // consume ~1 s of the keep window
    assert.ok(a.weaponRunner.s3Stored, `keep alive before surfacing at ${hz} Hz`);
    a.intent.squid = false;
    step(a, 1);
    assert.ok(a.weaponRunner.s3Stored, `store survives surfacing at ${hz} Hz`);
    assert.ok(Math.abs(a.weaponRunner.s3Stored.remaining - keep) < 5e-3,
      `full refresh at ${hz} Hz, got ${a.weaponRunner.s3Stored.remaining}`);
  }
  // Expired or absent stores are never resurrected by surfacing.
  const f = await fixture(), a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);
  a.intent.squid = true;
  f.tick(a);
  f.tick(a, 75);                                 // let the only keep window expire
  assert.equal(a.weaponRunner.s3Stored, null, 'precondition: keep expired');
  a.intent.squid = false;
  f.tick(a);
  assert.equal(a.weaponRunner.s3Stored, null, 'surfacing never recreates a store');
  assert.equal(f.shots.length, 0);
});
