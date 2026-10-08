import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const F = 1 / 60;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

async function rig() {
  const f = await fixture();
  const a = f.make('shooter'), r = a.weaponRunner;
  a.form = 'kid'; a.grounded = true; a.lastFire = 1;
  r.s3PostFireLockActive = false;
  r.s3ShooterHeld = true;
  r.s3ShooterStreamActive = true;
  a._prevIntent.fire = true;
  return { f, a, r };
}

test('#1016 ZR release starts a cancel-anchored 4F squid gate after the shot gate already expired', async () => {
  const { f, a, r } = await rig();
  a.intent.fire = false;
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'kid', 'cancel tick cannot enter squid');
  close(r.s3ShooterInterruptSquid, 4 * F, '4F squid interruption starts on cancellation edge');
  for (let i = 1; i <= 3; i++) {
    f.tick(a);
    assert.equal(a.form, 'kid', `C+${i} remains locked`);
  }
  f.tick(a);
  assert.equal(a.form, 'squid', 'squid is admitted at C+4');
});

test('#1016 R cancel delays sub aim for 3F while preserving a due cancellation-frame shot once', async () => {
  const { f, a, r } = await rig();
  r.cooldown = 0;
  a.intent.fire = true;
  a.intent.sub = true;
  const before = f.shots.length;
  f.tick(a);
  assert.equal(f.shots.length, before + 1, 'a shot already due on the interruption frame is preserved');
  assert.equal(r.aimingSub, false, 'sub prep is blocked on the cancel tick');
  close(r.s3ShooterInterruptSub, 3 * F, '3F sub interruption starts on cancellation edge');
  for (let i = 1; i <= 2; i++) {
    f.tick(a);
    assert.equal(r.aimingSub, false, `C+${i} remains blocked`);
    assert.equal(f.shots.length, before + 1, 'no later repeat shot escapes after cancellation');
  }
  f.tick(a);
  close(r.s3ShooterInterruptSub, 0, 'the cancellation gate expires at C+3');
  assert.equal(r.aimingSub, false, 'independent humanoid startup still owns this tick');
  f.tick(a);
  assert.equal(r.aimingSub, true, 'sub aim follows the independent 1F humanoid startup');
  assert.equal(f.shots.length, before + 1);
});

test('#1016 an empty/non-emitting held trigger does not synthesize an interruption gate', async () => {
  const { f, a, r } = await rig();
  r.s3ShooterStreamActive = false;
  a.intent.fire = false;
  a.intent.squid = true;
  f.tick(a);
  assert.equal(r.s3ShooterInterruptSub || 0, 0);
  assert.equal(r.s3ShooterInterruptSquid || 0, 0);
});
