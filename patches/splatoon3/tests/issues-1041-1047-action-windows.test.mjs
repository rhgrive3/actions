import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const F = 1 / 60;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

async function rollerRig() {
  const f = await fixture();
  const a = f.make('roller');
  a.ink = 100;
  return { f, a, r: a.weaponRunner };
}

for (const offset of [1, 2, 3]) {
  test(`#1041 grounded ZR then B at +${offset}F converts once to the faster vertical flick`, async () => {
    const { f, a, r } = await rollerRig();
    a.intent.fire = true;
    f.tick(a); // grounded ZR: provisional horizontal
    assert.equal(r.s3RollerAttack?.vertical, false);
    if (offset > 1) f.tick(a, offset - 1);
    a.intent.jump = true;
    f.tick(a);
    assert.equal(r.s3RollerAttack?.vertical, true);
    assert.equal(r.s3FlickVertical, true);
    close(r.s3RollerAttack.windup, a.weapon.verticalWindup - F, 'converted startup is 1F faster');
  });
}

test('#1041 +4F B is outside the conversion window and remains horizontal', async () => {
  const { f, a, r } = await rollerRig();
  a.intent.fire = true;
  f.tick(a);
  f.tick(a, 3);
  a.intent.jump = true;
  f.tick(a);
  assert.equal(r.s3RollerAttack?.vertical, false);
  assert.equal(r.s3FlickVertical, false);
});

test('#1041 jumping before/with ZR keeps the ordinary vertical startup', async () => {
  const { f, a, r } = await rollerRig();
  a.intent.jump = true;
  a.intent.fire = true;
  f.tick(a);
  assert.equal(r.s3RollerAttack?.vertical, true);
  close(r.s3RollerAttack.windup, a.weapon.verticalWindup, 'ordinary airborne vertical startup is unchanged');
});

async function dualiesRig() {
  const f = await fixture();
  const a = f.make('dualies');
  return { f, a, r: a.weaponRunner };
}

test('#1047 sustained-fire release owns a 6F squid interruption window after the 4F shot gate', async () => {
  const { f, a, r } = await dualiesRig();
  r.s3DualiesHeld = true;
  r.s3DualiesPostShot = 0;
  a._prevIntent.fire = true;
  a.intent.fire = false;
  a.intent.squid = true;
  f.tick(a); // cancellation edge
  assert.equal(a.form, 'kid', 'cancel tick cannot enter squid');
  close(r.s3DualiesInterruptSquid, 6 * F, 'cancel edge starts 6F squid recovery');
  for (let i = 1; i <= 5; i++) {
    f.tick(a);
    assert.equal(a.form, 'kid', `C+${i} remains locked`);
  }
  f.tick(a);
  assert.equal(a.form, 'squid', 'squid form is admitted at the 6F boundary');
});

test('#1047 R cancel delays sub preparation to the 5F interruption boundary', async () => {
  const { f, a, r } = await dualiesRig();
  r.s3DualiesHeld = true;
  r.s3DualiesPostShot = 0;
  a._prevIntent.fire = true;
  a.intent.fire = true;
  a.intent.sub = true;
  f.tick(a); // cancellation edge
  assert.equal(r.aimingSub, false);
  close(r.s3DualiesInterruptSub, 5 * F, 'cancel edge starts 5F sub recovery');
  for (let i = 1; i <= 4; i++) {
    f.tick(a);
    assert.equal(r.aimingSub, false, `C+${i} sub preparation remains locked`);
  }
  f.tick(a);
  assert.equal(r.aimingSub, true, 'sub preparation begins at the 5F boundary');
});

test('#1047 idle release does not invent an interruption clock and reset clears a live one', async () => {
  const { f, a, r } = await dualiesRig();
  r.s3DualiesHeld = false;
  a._prevIntent.fire = true;
  a.intent.fire = false;
  f.tick(a);
  assert.equal(r.s3DualiesInterruptSub || 0, 0);
  assert.equal(r.s3DualiesInterruptSquid || 0, 0);

  r.s3DualiesHeld = true;
  a._prevIntent.fire = true;
  a.intent.fire = false;
  a.intent.squid = true;
  f.tick(a);
  assert.ok(r.s3DualiesInterruptSquid > 0);
  r.reset();
  assert.equal(r.s3DualiesInterruptSub, 0);
  assert.equal(r.s3DualiesInterruptSquid, 0);
});
