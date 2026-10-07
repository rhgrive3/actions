import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Issue #635 (duplicate #636): a Splat Roller flick release has to keep the
// reference post-release action gates — horizontal 14F sub / 15F squid,
// vertical 18F sub / 19F squid — instead of admitting swim and sub as soon as
// `flick` clears. `flickRecover` stays a movement-only recovery.

// Starts one flick and returns on its release tick (tick 0 of the gate).
async function released(f, { vertical = false } = {}) {
  const a = f.make('roller');
  a.ink = 100;
  if (vertical) { a.pos.y = 2; a.grounded = false; }
  a.intent.fire = true;
  let started = false;
  for (let i = 0; i < 60; i++) {
    f.tick(a);
    if (a.weaponRunner.flick >= 0) started = true;
    if (started && a.weaponRunner.flick < 0) break;
  }
  assert.ok(started, 'precondition: flick started');
  assert.ok(a.weaponRunner.flick < 0, 'precondition: flick released');
  a.intent.fire = false;
  return a;
}

test('horizontal flick release holds sub for 14F and squid for 15F', async () => {
  const f = await fixture(), a = await released(f);
  const thrown = [];
  f.G.projectiles.throwBomb = () => thrown.push(f.G.time);
  assert.equal(a.weaponRunner.s3FlickVertical, false, 'grounded flick is horizontal');

  // Squid: blocked through 14 ticks, legal on the 15th after release.
  a.intent.squid = true;
  for (let k = 1; k <= 14; k++) {
    f.tick(a);
    assert.equal(a.form, 'kid', `tick ${k}: squid stays blocked for 15F`);
  }
  f.tick(a);
  assert.equal(a.form, 'squid', 'tick 15: first legal squid transition');

  // Sub: a press/release entirely inside the gate cannot throw.
  const b = await released(f);
  assert.equal(b.weaponRunner.s3FlickVertical, false);
  b.intent.sub = true;
  for (let k = 1; k <= 13; k++) f.tick(b);
  assert.equal(b.weaponRunner.aimingSub, false, 'sub aim is blocked for 14F');
  b.intent.sub = false;
  f.tick(b);
  assert.equal(thrown.length, 0, 'no throw can cross the remaining lock');

  // On the 14th tick the gate is over: a held sub aims, its release throws.
  const c = await released(f);
  for (let k = 1; k <= 13; k++) f.tick(c);
  c.intent.sub = true;
  f.tick(c);                                   // tick 14
  assert.equal(c.weaponRunner.aimingSub, true, 'first legal sub action is 14F');
  // Existing #528 readiness still requires 8 admitted sub frames.
  f.tick(c, 7);
  c.intent.sub = false;
  f.tick(c);
  assert.equal(thrown.length, 1, 'legal release after the gate throws once');
});

test('vertical flick release holds sub for 18F and squid for 19F', async () => {
  const f = await fixture(), a = await released(f, { vertical: true });
  assert.equal(a.weaponRunner.s3FlickVertical, true, 'airborne flick is vertical');

  a.intent.squid = true;
  for (let k = 1; k <= 18; k++) {
    f.tick(a);
    assert.equal(a.form, 'kid', `tick ${k}: squid stays blocked for 19F`);
  }
  f.tick(a);
  assert.equal(a.form, 'squid', 'tick 19: first legal squid transition');

  const b = await released(f, { vertical: true });
  b.intent.sub = true;
  for (let k = 1; k <= 17; k++) f.tick(b);
  assert.equal(b.weaponRunner.aimingSub, false, 'sub aim is blocked for 18F');
  b.intent.sub = false;
  f.tick(b);
  assert.equal(b.weaponRunner.aimingSub, false, 'a release inside the gate never arms');

  const c = await released(f, { vertical: true });
  for (let k = 1; k <= 17; k++) f.tick(c);
  c.intent.sub = true;
  f.tick(c);                                   // tick 18
  assert.equal(c.weaponRunner.aimingSub, true, 'first legal sub action is 18F');
});

test('the gates are per-release and do not leak into later state', async () => {
  const f = await fixture(), a = await released(f);
  a.intent.squid = true;
  f.tick(a, 15);
  assert.equal(a.form, 'squid', 'gate opened');
  assert.equal(a.weaponRunner.s3FlickPostSquid, 0, 'gate released');

  // Resurface, then a fresh flick reopens its own gate.
  a.intent.squid = false;
  f.tick(a);
  assert.equal(a.form, 'kid');
  a.intent.fire = true;
  let started = false;
  for (let i = 0; i < 60; i++) {
    f.tick(a);
    if (a.weaponRunner.flick >= 0) started = true;
    if (started && a.weaponRunner.flick < 0) break;
  }
  assert.ok(a.weaponRunner.flick < 0, 'second flick released');
  a.intent.fire = false;
  a.intent.squid = true;
  for (let k = 1; k <= 14; k++) f.tick(a);
  assert.equal(a.form, 'kid', 'a second release re-arms the same 15F gate');
  f.tick(a);
  assert.equal(a.form, 'squid');
});

test('the gate does not delay a non-Roller weapon', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 100;
  // A fresh Shooter has no post-fire lock. Roller counters cannot block it.
  a.kidT = 1;
  a.weaponRunner.s3FlickPostSquid = 1;
  a.intent.fire = false;
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'shooter admission is untouched');
});
