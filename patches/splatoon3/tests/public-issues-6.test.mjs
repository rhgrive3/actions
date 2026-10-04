// Regression coverage for public INKWAVE issues 76, 86, 91 and 180.
//
// Every test composes the immutable inkwave-public sources through the real
// build adapter (patches/splatoon3/adapter.mjs) and the actual runtime
// installers used by the deployed build. No second gameplay engine is used;
// only wall collision/ground/audio are stubbed, exactly as the other
// composed-runtime tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || `${ROOT}inkwave-public`;

// ---------------------------------------------------------------------------
// Issue 91 - the published runtime used the 5.5 s out-of-bounds timer for
// ordinary splats. Death cause must select the base.
// ---------------------------------------------------------------------------
test('issue 91: composed player config and a normal splat use the normal base, never the obsolete 5.5 timer', async () => {
  const f = await fixture();
  assert.ok(f.profile.respawn, 'profile must expose death-cause respawn bases');
  assert.equal(f.PLAYER.respawnTime, f.profile.respawn.normal,
    'profile.player must overwrite the obsolete upstream respawn timer');
  assert.equal(f.profile.player.respawnTime, f.profile.respawn.normal);
  const a = f.make();
  a.splat(null);
  assert.equal(a.respawnTimer, f.profile.respawn.normal);
  assert.notEqual(a.respawnTimer, 5.5);
});

test('issue 91: environmental (water) death uses its own base and not the normal timer', async () => {
  const f = await fixture(), a = f.make();
  a.splat(null, 'water');
  assert.equal(a.respawnTimer, f.profile.respawn.water);
  assert.ok(a.respawnTimer < f.profile.respawn.normal);
});

test('issue 91: Quick Respawn is calculated from the corrected normal base', async () => {
  const f = await fixture(), a = f.make();
  a.s3.loadout = Array.from({ length: 3 }, () => ({ main: 'quickRespawn', subs: ['quickRespawn', 'quickRespawn', 'quickRespawn'] }));
  a.setWeapon('shooter');
  a.splat(null);
  const ordinary = a.respawnTimer;
  assert.equal(ordinary, f.profile.respawn.normal);
  a.reset();
  a.splat(null);
  assert.ok(a.respawnTimer < ordinary, 'quick respawn must shorten the corrected normal base');
  // The obsolete 5.5 s base would have left ~2.5 s here; the corrected base
  // leaves a materially longer return window.
  assert.ok(a.respawnTimer > f.profile.respawn.outOfBounds - 1);
});

test('issue 91: adapter stops the build if the native respawn assignment changes', () => {
  const actor = fs.readFileSync(`${UPSTREAM}/src/game/actor.js`, 'utf8');
  assert.throws(() => adaptSource('src/game/actor.js', actor.replace('    this.respawnTimer = PLAYER.respawnTime;', '    this.respawnTimer = 1;')),
    /death-cause respawn timing/);
});

// ---------------------------------------------------------------------------
// Issue 76 - activating a special must refill the ink tank exactly once.
// ---------------------------------------------------------------------------
test('issue 76: activation refills the tank for both special mappings, and only once', async () => {
  const f = await fixture();
  f.G.projectiles.throwStorm = () => {};

  for (const [weapon, id] of [['shooter', 'slam'], ['charger', 'storm']]) {
    const a = f.make(weapon);
    assert.equal(a.weapon.special, id);
    a.ink = 8; a.special = a.specialCost();
    a.intent.special = true;
    f.tick(a);
    assert.ok(a.specialActive, `${id} special must activate`);
    assert.equal(a.specialActive.id, id);
    assert.equal(a.ink, f.PLAYER.inkMax, `${id} activation must fill the tank`);

    // Staying inside the active special must not refill again.
    a._resolve = () => {};
    a.ink = 3;
    f.tick(a);
    assert.equal(a.ink, 3, 'active special must not refill every frame');
  }
});

test('issue 76: a not-ready special input does not refill ink', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 8; a.special = 0; a.lastFire = 0;
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive, null);
  assert.ok(a.ink < 9, 'no refill without a successful activation');
});

test('issue 76: main weapon use consumes from the refilled tank normally', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 8; a.special = a.specialCost();
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.ink, f.PLAYER.inkMax);
  const before = a.ink;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: true });
  assert.ok(a.ink < before, 'the refilled tank is consumed by the next shot');
});

// ---------------------------------------------------------------------------
// Issue 86 - Super Jump gameplay timing must use the profile/gear values.
// ---------------------------------------------------------------------------
test('issue 86: 0 AP preparation and flight use the 80F/138F reference timings', async () => {
  const f = await fixture(), a = f.make();
  assert.equal(a.s3.jumpChargeTime, f.profile.superJump.chargeTime);
  assert.equal(a.s3.jumpFlightTime, f.profile.superJump.flightTime);
  assert.notEqual(a.s3.jumpChargeTime, 0.75, 'the hard-coded 0.75 s preparation must be replaced');

  a._probeGround = () => {};
  a.superJump(new f.THREE.Vector3(0, 0, 8));
  assert.equal(a.superJumpState.phase, 'charge');
  let chargeTicks = 0;
  while (a.superJumpState.phase === 'charge') { assert.ok(chargeTicks < 200, 'preparation must complete'); f.tick(a); chargeTicks++; }
  assert.equal(chargeTicks, Math.round(f.profile.superJump.chargeTime * 60));

  assert.equal(a.superJumpState.phase, 'flight');
  assert.equal(a.superJumpState.dur, f.profile.superJump.flightTime);
  a._resolve = () => {};
  let flightTicks = 0;
  while (a.superJumpState) { f.tick(a); flightTicks++; assert.ok(flightTicks < 400, 'flight must complete'); }
  assert.equal(flightTicks, Math.round(f.profile.superJump.flightTime * 60));
});

test('issue 86: Quick Super Jump AP changes the actual gameplay transition and flight duration', async () => {
  const f = await fixture(), a = f.make();
  a.s3.loadout = Array.from({ length: 3 }, () => ({ main: 'quickSuperJump', subs: ['quickSuperJump', 'quickSuperJump', 'quickSuperJump'] }));
  a.setWeapon('shooter');
  assert.ok(a.s3.jumpChargeTime < f.profile.superJump.chargeTime);
  assert.ok(a.s3.jumpFlightTime < f.profile.superJump.flightTime);

  a._probeGround = () => {};
  a.superJump(new f.THREE.Vector3(0, 0, 8));
  let chargeTicks = 0;
  while (a.superJumpState.phase === 'charge') { assert.ok(chargeTicks < 200); f.tick(a); chargeTicks++; }
  assert.equal(chargeTicks, Math.round(a.s3.jumpChargeTime * 60));
  assert.ok(chargeTicks < Math.round(f.profile.superJump.chargeTime * 60));
  assert.equal(a.superJumpState.dur, a.s3.jumpFlightTime);
});

// ---------------------------------------------------------------------------
// Issue 180 - Squid Surge charge/release must exist on the composed Actor.
// ---------------------------------------------------------------------------
function climbable(f, sample = 1) {
  const a = f.make();
  a.form = 'squid'; a.intent.squid = true;
  f.G.paint.sample = () => sample;
  f.G.physics.raycast = (from, dir, distance, hit) => {
    hit.hit = true; hit.dist = distance * 0.5;
    hit.normal.set(0, 0, 1); hit.face = 0; hit.u = 0; hit.v = 0;
    hit.point.copy(from).addScaledVector(dir, distance * 0.5);
    return hit;
  };
  a.intent.move.set(0, 0, -1);
  return a;
}

test('issue 180: holding jump on an own-ink wall charges without detaching', async () => {
  const f = await fixture(), a = climbable(f, 1);
  a.intent.jump = true;
  f.tick(a);
  assert.equal(a.climbing, true, 'the squid stays attached while charging');
  assert.equal(a.s3.surge.phase, 'charge');
  assert.equal(a.vel.length(), 0, 'charge holds the body still');
  assert.equal(a.s3.actions.surge, a.s3.surge, 'the remote-readable action state is authoritative');
  assert.ok(Math.abs(a.anim.surgeCharge - a.s3.surge.charge) < 1e-9, 'charge fraction reaches the character layer');

  for (let i = 0; i < 44; i++) f.tick(a);
  assert.equal(a.s3.surge.charge, 1, 'full charge is capped at exactly 1');
});

test('issue 180: release launches upward with strength rising monotonically to the cap', async () => {
  const f = await fixture();
  let previous = 0;
  for (const hold of [5, 15, 30, 45]) {
    const a = climbable(f, 1);
    a.intent.jump = true;
    for (let i = 0; i < hold; i++) f.tick(a);
    const charge = a.s3.surge.charge;
    a.intent.jump = false;
    f.tick(a);
    assert.equal(a.s3.surge.phase, 'burst');
    assert.equal(a.climbV, a.s3.surge.speed);
    assert.ok(a.vel.y > 0, 'release produces an upward Surge');
    assert.ok(a.s3.surge.speed > previous, `launch must rise monotonically (${a.s3.surge.speed} <= ${previous})`);
    assert.ok(Math.abs(a.s3.surge.speed - (4 + 11 * charge)) < 1e-9, 'launch follows the configured charge curve');
    previous = a.s3.surge.speed;
  }
});

test('issue 180: dry, enemy-ink and unclimbable walls cannot start a Surge', async () => {
  const f = await fixture();
  for (const [label, sample] of [['dry', 0], ['enemy ink', 2]]) {
    const a = climbable(f, sample);
    a.intent.jump = true;
    f.tick(a);
    assert.equal(a.climbing, false, `${label} wall must not attach`);
    assert.equal(a.s3.surge, null, `${label} wall must not start a Surge`);
  }
});

test('issue 180: ordinary wall climbing is retained when jump is not held', async () => {
  const f = await fixture(), a = climbable(f, 1);
  f.tick(a, 10);
  assert.equal(a.climbing, true);
  assert.ok(a.vel.y > 0, 'ordinary climb still rises');
  assert.equal(a.s3.surge, null);
  assert.equal(a.anim.surgeCharge, 0);
});
