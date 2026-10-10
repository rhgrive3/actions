import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Issue #390: an S3 Splat Charger charge keep belongs to the held shot. Releasing
// ZR while the charge is kept cancels it instead of banking a detached shot.
// The actor masks the runner's `inp.fire` to false while squid and through
// emergeDelay, so the cancellation is read from the canonical `a.intent.fire`.

const FRAME = 1 / 60;

// Fully charge as a kid, then submerge while ZR is still held: the reference
// charge keep. Returns the live actor.
async function kept(f) {
  const a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);
  assert.ok(a.weaponRunner.charge >= .999, 'precondition: full charge');
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'precondition: submerged');
  assert.ok(a.weaponRunner.s3Stored, 'precondition: charge kept');
  return a;
}

test('releasing ZR while submerged cancels the kept charge on that tick', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  const remaining = r.s3Stored.remaining;
  a.intent.fire = false;                       // physical ZR release, ZL still held
  f.tick(a);
  assert.equal(r.s3Stored, null, 'stored charge is cancelled on release');
  assert.equal(r.charging, false);
  assert.equal(r.charge, 0, 'cancelled store leaves no full-charge presentation');
  assert.ok(remaining > 0, 'cancelled well inside the keep window');
  f.tick(a, 74);
  assert.equal(f.shots.length, 0, 'no delayed shot survives the cancellation');
});

test('the cancellation reads intent.fire, not the masked inp.fire', async () => {
  // While submerged the actor forwards fire:false even while ZR is held, so a
  // cancellation keyed on inp.fire would destroy a legitimately kept charge.
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  assert.ok(a.intent.fire, 'ZR is still physically held throughout');
  for (let i = 0; i < 40; i++) {
    r.update(FRAME, { fire: false });          // exactly what the actor forwards underwater
    assert.ok(r.s3Stored, `held store survives masked tick ${i}`);
  }
  assert.ok(a.weaponRunner.s3Stored.remaining < a.weapon.keepChargeTime,
    'the window still runs down, it is only the release that cancels');
});

test('a keep opened on the same tick ZR is released is never created', async () => {
  const f = await fixture(), a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);
  a.intent.fire = false;                       // release and dive on the same tick
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid');
  assert.equal(a.weaponRunner.s3Stored, null, 'no keep window opens without a held ZR');
  f.tick(a, 90);
  assert.equal(f.shots.length, 0);
  assert.equal(a.weaponRunner.s3Stored, null);
});

test('releasing ZR during emergeDelay cancels before the store can be restored', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  a.intent.squid = false;                      // surface: form is kid, kidT < emergeDelay
  a.intent.fire = false;                       // ... while still inside the emerge delay
  f.tick(a);
  assert.equal(a.form, 'kid');
  assert.ok(a.kidT < f.PLAYER.emergeDelay, 'still inside the emerge delay');
  assert.equal(r.s3Stored, null, 'cancelled during emergeDelay');
  assert.equal(f.shots.length, 0);
});

test('a fresh hold after cancellation charges normally and cannot resurrect the old store', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  a.intent.fire = false;
  f.tick(a);
  a.intent.squid = false;
  f.tick(a, 6);                                // surface past the emerge delay
  assert.equal(r.s3Stored, null);
  a.intent.fire = true;                         // press ZR again
  f.tick(a, 9); //1F fresh startup plus the legal8F minimum
  assert.equal(r.charging, true);
  assert.ok(r.charge < .999, 'ordinary charging, not a restored full charge');
  a.intent.fire = false;
  f.tick(a, 2);                                // S3 1F release gap: shot on R+1
  assert.equal(f.shots.length, 1);
  assert.ok(f.shots[0].charge < 1, 'the stale full charge is never fired');
});

test('the keep window still expires on its own while ZR stays held', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  const keep = a.weapon.keepChargeTime;
  assert.equal(keep, 1.25, 'reference keep window is 75 frames');
  // kept() already spent the creation tick, which also starts the countdown.
  f.tick(a, Math.round(keep * 60) - 2);
  assert.ok(r.s3Stored, 'still alive one frame before the window closes');
  f.tick(a, 1);
  assert.equal(r.s3Stored, null, 'expires at 75 frames');
  assert.equal(f.shots.length, 0, 'expiry never becomes a shot');
});

test('a partial charge cannot be kept', async () => {
  const f = await fixture(), a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 30);
  assert.ok(a.weaponRunner.charge > .3 && a.weaponRunner.charge < .999);
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'kid', 'partial cancellation observes the independent 6F form gate');
  assert.equal(a.weaponRunner.charging, false, 'partial charge cancels immediately');
  assert.equal(a.weaponRunner.s3Stored, null, 'partial charges are ineligible for charge keep');
  for (let i = 1; i < 6; i++) {
    f.tick(a); assert.equal(a.form, 'kid', `partial cancel at +${i}F`);
    assert.equal(a.weaponRunner.s3Stored, null);
  }
  f.tick(a); assert.equal(a.form, 'squid', 'form opens at the existing 6F boundary');
  assert.equal(a.weaponRunner.s3Stored, null);
  assert.equal(f.shots.length, 0, 'a cancelled partial charge never becomes a shot');
});

test('cancellation spends no ink, sets no cooldown and queues no shot', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  a.ink = 100;                                 // keep refill out of the comparison
  const ink = a.ink, cooldown = r.cooldown, firingT = r.firingT;
  a.intent.fire = false;
  f.tick(a);
  assert.equal(a.ink, ink, 'no ink is spent by a cancellation');
  // update() decays the cooldown every tick whether or not anything is armed.
  assert.ok(r.cooldown < 0, 'no fire cooldown is armed');
  assert.ok(r.cooldown <= cooldown, 'the cooldown only decays, it is never re-armed');
  assert.equal(r.firingT, firingT, 'no firing pose is entered');
  assert.ok(a.lastFire > 0, 'lastFire is not reset, so nothing was shot');
  assert.equal(f.shots.length, 0);
});

test('#1070 stored-charge cancellation blocks ink recovery through N+2 and opens at N+3', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  // A live store keeps refill gated; pin every unrelated post-shot gate open.
  a.lastFire = 10;
  a.ink = 50;
  f.tick(a, 5);
  assert.ok(r.s3Stored, 'still keeping the charge');
  const heldInk = a.ink;
  a.intent.fire = false;                       // release -> cancel at N
  f.tick(a);
  assert.equal(r.s3Stored, null);
  assert.equal(a.ink, heldInk, 'N: the live store blocks the cancellation tick');
  assert.ok(Math.abs((a.s3.chargerKeepRecover || 0) - 3 / 60) < 1e-10, 'dedicated CK recovery lock starts at 3F');
  assert.ok((a.s3.chargerInterruptRecover || 0) <= 1e-10, 'ordinary 19F interruption timer is not reused');
  f.tick(a);
  assert.equal(a.ink, heldInk, 'N+1 remains blocked');
  f.tick(a);
  assert.equal(a.ink, heldInk, 'N+2 remains blocked');
  f.tick(a);
  assert.ok(a.ink > heldInk, 'N+3 is the verified refill boundary');
});

test('reset, death and weapon swap all clear a kept charge', async () => {
  const f = await fixture();
  for (const teardown of ['reset', 'death', 'swap']) {
    const a = await kept(f);
    const r = a.weaponRunner;
    if (teardown === 'reset') a.reset();
    else if (teardown === 'death') {
      a.hp = 1; a.damage(60, null, 'shooter');
      assert.ok(r.s3Stored, 'pending lethal keeps state until the next fixed tick');
      f.tick(a);
    } else a.setWeapon('shooter');
    assert.equal(r.s3Stored, null, `${teardown} clears the stored charge`);
    assert.equal(r.charging, false);
    assert.equal(r.charge, 0);
  }
});

test('cancellation lands on the release transition at several frame rates', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), dt = 1 / hz;
    const step = (a, n) => { for (let i = 0; i < n; i++) { f.G.time += dt; a.update(dt); } };
    const a = f.make('charger');
    a.ink = 100;
    a.intent.fire = true;
    step(a, Math.ceil(1.1 * hz));               // 1.1 s of charge at this rate
    a.intent.squid = true;
    step(a, 1);
    assert.ok(a.weaponRunner.s3Stored, `precondition at ${hz} Hz`);
    a.intent.fire = false;
    step(a, 1);
    assert.equal(a.weaponRunner.s3Stored, null, `cancelled on the release tick at ${hz} Hz`);
    step(a, Math.ceil(2 * hz));
    assert.equal(f.shots.length, 0, `no delayed shot at ${hz} Hz`);
  }
});

test('holding ZR continuously preserves charge keep and still fires the full shot', async () => {
  const f = await fixture(), a = await kept(f);
  const r = a.weaponRunner;
  a.intent.squid = false;                      // surface while ZR is still held
  f.tick(a, 2);
  assert.equal(a.form, 'kid');
  assert.ok(r.s3Stored, 'store survives emergeDelay while ZR stays held');
  f.tick(a, 29);                               // complete the 31F stored-fire gate
  assert.equal(r.s3Stored, null);
  assert.equal(r.charging, true);
  assert.ok(r.charge >= .999);
  a.intent.fire = false;                       // release ZR -> fire the kept full charge
  f.tick(a, 2);                                // S3 1F release gap: shot on R+1
  assert.equal(f.shots.length, 1);
  assert.equal(f.shots[0].charge, 1);
});