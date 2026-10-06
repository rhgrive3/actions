// Issue #680: Splatoon 3 defines a 1F release gap (発射隙) between recognizing
// that ZR was released and the Charger attack hitbox becoming active. The shot
// must not be created on the release-recognition tick; it is created one fixed
// simulation tick later, and it must be identical across render cadences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const FRAME = 1 / 60;

async function charged(f, frames = 61) {
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
  assert.equal(a.ink, 100, 'release tick spends no ink');
  f.tick(a);                                   // R + 1
  assert.equal(f.shots.length, 1, 'the shot appears exactly one frame later');
  assert.equal(f.shots[0].charge, 1);
  assert.equal(r.s3ReleaseHold, false, 'the release state clears after the shot');
  assert.ok(a.ink < 100, 'the shot pays its ink on its own frame');
});

test('partial and full charges obey the same 1F release gap', async () => {
  for (const frames of [8, 30, 61]) {
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
  // The native release branch arms 0.28s; the extra frame lives only in the gap.
  assert.ok(cooldown > 0.27 && cooldown < 0.29, `cooldown ${cooldown}`);
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
  f.tick(a, 60);
  assert.equal(a.specialActive, null);
  assert.equal(r.s3ReleaseHold, false);
  assert.equal(f.shots.length, 0, 'no stale shot after the special');
});
