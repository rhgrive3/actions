import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { rollLaunchSpeed } from '../runtime/movement.mjs';
import { resourceSurface } from '../runtime/resources.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('#1069 resource surface sampling returns a scalar and performs one post-movement sample', async () => {
  const f = await fixture(), a = f.make();
  let samples = 0;
  a.form = 'squid';
  a._surface = () => { samples++; a.grounded = true; a.groundTeam = 1; };
  const isSquid = resourceSurface(a);
  assert.equal(typeof isSquid, 'boolean');
  assert.equal(isSquid, true);
  assert.equal(samples, 1);
  assert.equal(a.submerged, true);
  assert.equal(a.onEnemy, false);
});

test('contact resources use the newly resolved paint surface on both sides of a boundary', async () => {
  const f = await fixture(), a = f.make();
  a.intent.squid = true; a.form = 'squid'; a.ink = 0;
  f.G.paint.sample = () => a.ground.u < .5 ? 1 : 2;
  a.ground.u = 0; a._integrate = () => { a.ground.u = 1; };
  f.tick(a);
  assert.equal(a.submerged, false); assert.equal(a.onEnemy, true);
  close(a.ink, 0); close(a.hp, 100 - f.profile.resources.enemyInkDps / 60);
  a._integrate = () => { a.ground.u = 0; };
  const hp = a.hp; f.tick(a);
  assert.equal(a.form, 'kid', 'the enemy surface sampled before movement owns this frame\'s form');
  assert.equal(a.submerged, false); assert.equal(a.onEnemy, false);
  close(a.hp, hp); close(a.ink, f.profile.resources.inkRefillKid / 60);
  f.tick(a);
  assert.equal(a.form, 'squid', 'the newly resolved own surface admits held Swim on the next tick');
  assert.equal(a.submerged, true);
  close(a.ink, (f.profile.resources.inkRefillKid + f.profile.resources.inkRefillSwim) / 60);
});

test('takeoff clears submerged recovery and enemy contact during the same actor tick', async () => {
  const f = await fixture(), a = f.make(); a.intent.squid = true; a.intent.jump = true; a.ink = 0;
  f.tick(a); assert.equal(a.grounded, false); assert.equal(a.submerged, false); close(a.ink, 0);
  const b = f.make(); b.intent.squid = true; b.intent.jump = true;
  f.G.paint.sample = () => 2;
  f.tick(b); assert.equal(b.onEnemy, false); close(b.hp, 100); close(b.damageFromInk, 0);
});

test('landing into own ink begins recovery in the landing tick', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.intent.squid = true; a.ink = 0; a.grounded = false;
  a._integrate = () => { a.grounded = true; a.ground.hit = true; a.ground.face = 0; };
  f.tick(a); assert.equal(a.submerged, true); close(a.ink, f.profile.resources.inkRefillSwim / 60);
});

test('enemy ink grace integrates only exposure after its boundary, then resets on exit', async () => {
  const f = await fixture(), a = f.make();
  // This is an interval arithmetic regression, not a proposed Splatoon grace value.
  a.s3.modifiers.enemyInkGrace = .025;
  f.G.paint.sample = () => 2; f.tick(a); close(a.hp, 100);
  f.tick(a); close(a.damageFromInk, f.profile.resources.enemyInkDps * (2 / 60 - .025));
  f.G.paint.sample = () => 0; f.tick(a, Math.ceil(f.profile.resources.enemyInkGraceReset*60)); close(a.s3.enemyInkTime, 0);
  f.G.paint.sample = () => 2; const hp = a.hp; f.tick(a); close(a.hp, hp);
});

test('enemy contact suppresses health recovery even while its damage grace is active', async () => {
  const f = await fixture(), a = f.make();
  f.profile.resources.regenDelay = 0; f.profile.resources.enemyInkGrace = 100;
  a.hp = 50; a.lastDamage = 99; f.G.paint.sample = () => 2;
  f.tick(a, 5); close(a.hp, 50);
});

test('own-ink wall climbing uses swim HP recovery for local and owner-remote actors', async () => {
  const f = await fixture();
  f.profile.resources.regenDelay = 0; f.G.paint.sample = () => 1;
  for (const remote of [false, true]) {
    const a = f.make(); a.form = 'squid'; a.intent.squid = true;
    a.climbing = true; a.grounded = false; a.remote = remote; a.isLocal = !remote;
    a.hp = 50; a.lastDamage = 99; a._updateClimb = () => {};
    f.tick(a);
    assert.equal(a.submerged, false);
    close(a.hp, 50 + f.profile.resources.regenRateSwim / 60);
  }
  const floor = f.make(); floor.form = 'squid'; floor.intent.squid = true;
  floor.hp = 50; floor.lastDamage = 99;
  floor._surface = () => { floor.grounded = true; floor.groundTeam = 1; };
  f.updateResources(floor, 1 / 60);
  assert.equal(floor.submerged, true);
  close(floor.hp, 50 + f.profile.resources.regenRateSwim / 60);
  for (const paint of [0, 2]) {
    const noClimb = f.make(); noClimb.form = 'squid'; noClimb.intent.squid = true;
    noClimb.climbing = false; noClimb.grounded = false; noClimb.hp = 50; noClimb.lastDamage = 99;
    noClimb._surface = () => { noClimb.grounded = false; noClimb.groundTeam = 0; };
    f.G.paint.sample = () => paint;
    f.updateResources(noClimb, 1 / 60);
    assert.equal(noClimb.submerged, false);
    close(noClimb.hp, 50 + f.profile.resources.regenRate / 60);
  }
});

test('contact ink remains nonlethal and bounded, including return after leaving it', async () => {
  const f = await fixture(), a = f.make(); a.hp = 20; f.G.paint.sample = () => 2;
  f.tick(a,180);close(a.hp,20);close(a.damageFromInk,0,'existing total HP loss already exceeds contact cap');
  a.hp=100;f.tick(a,180);close(a.hp,100-a.s3.modifiers.enemyDamageCap);close(a.damageFromInk,a.s3.modifiers.enemyDamageCap);
  f.G.paint.sample=()=>0;f.tick(a);const hp=a.hp;f.G.paint.sample=()=>2;f.tick(a);close(a.hp,hp,'exit does not grant damage beyond total loss cap');
  a.hp=1;f.tick(a);close(a.hp,1);
  a.damage(2, null, 'shooter'); assert.equal(a.alive, true, 'lethal decision is pending for one fixed tick');
  f.tick(a); assert.equal(a.alive, false);
});

test('refill predicates distinguish own ink, wall, dry/enemy squid, and stored charge', async () => {
  const f = await fixture(), a = f.make('charger'); a.form = 'squid'; a.intent.squid = true; a.ink = 0;
  f.G.paint.sample = () => 0; f.tick(a, 5); close(a.ink, 0);
  f.G.paint.sample = () => 2; f.tick(a, 5);
  assert.equal(a.form, 'kid', 'a grounded enemy surface exits invalid squid state');
  close(a.ink, f.profile.resources.inkRefillKid * 5 / 60);
  f.G.paint.sample = () => 1; a.intent.fire = true; a.weaponRunner.s3Stored = { charge: 1, remaining: 1, fireDelay:1, paid:a.weapon.inkFull };
  a.ink = 0;
  f.tick(a, 5); close(a.ink, 0);
  a.weaponRunner.s3Stored = null; a.intent.fire = false;
  a.fireBuffer = 0; a.weaponRunner.charging = false; a.weaponRunner.charge = 0; a.weaponRunner.chargeT = 0;
  a.climbing = true; a._updateClimb = () => {}; a.grounded = false;
  a.intent.fire = false; a.weaponRunner.reset();
  f.tick(a); close(a.ink, f.profile.resources.inkRefillSwim / 60);
});

test('recover-stop countdown stays tied to actor ticks and refill starts at its boundary', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.intent.squid = true; a.ink = 0;
  a.s3.recoverStopRemaining = 3 / 60;
  f.tick(a, 2); close(a.ink, 0);
  f.tick(a); close(a.ink, f.profile.resources.inkRefillSwim / 60);
});

test('consecutive roll momentum compounds from the previous retained launch', () => {
  let previous = 0;
  for (let chain = 0; chain < 4; chain++) {
    const speed = rollLaunchSpeed(20, chain, .85, previous);
    close(speed, 20 * .85 ** chain);
    previous = speed;
  }
});

test('the actual action dispatcher does not double-apply retained momentum on the third roll', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.vel.set(0, 0, 20);
  for (let chain = 0; chain < 4; chain++) {
    a.grounded = a.submerged = true;
    a.intent.move.set(0, 0, a.vel.z > 0 ? -1 : 1);
    assert.equal(f.beforeActions(a, 1 / 60, true), true);
    close(Math.hypot(a.vel.x, a.vel.z), 20 * .85 ** chain);
  }
});

test('configured armor expires on its exact tick boundary without a floating-point extra shield', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.submerged = true;
  a.vel.set(0, 0, 20); a.intent.move.set(0, 0, -1);
  f.beforeActions(a, 1 / 60, true);
  for (let i = 0; i < f.profile.movement.roll.armorTime * 60; i++) f.beforeActions(a, 1 / 60, false);
  assert.equal(a.s3.roll, null); close(a.s3.actions.armor.armorTime, 0); a.damage(60, null, 'shooter'); close(a.hp, 40);
});

test('roll collision clipping persists instead of restoring its pre-collision launch velocity', async () => {
  const f = await fixture(), a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.move.set(0, 0, -1); a.intent.jump = true;
  a.vel.set(0, 0, f.PLAYER.swimSpeed);
  a._integrate = () => { a.vel.x = 0; a.vel.z = 0; };
  f.tick(a); assert.ok(a.s3.roll);
  a._integrate = () => {}; a.intent.move.set(0,0,0); f.tick(a); close(a.vel.lengthSq() - a.vel.y ** 2, 0);
});

test('the extracted 45-frame no-gear surge charge reaches full exactly on frame 45', async () => {
  const f = await fixture(), a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
  f.tick(a, 44); assert.ok(a.s3.surge.charge < 1); close(a.anim.surgeCharge, 44 / 45);
  f.tick(a); assert.equal(a.s3.surge.charge, 1);
  a.intent.jump = false; f.tick(a); assert.equal(a.s3.surge.phase, 'burst'); assert.ok(a.s3.surge.armorTime > 0);
});

test('charge visuals and active actions clear on form switch, jump takeover and reset', async () => {
  const f = await fixture(), a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
  f.tick(a, 10); assert.ok(a.anim.surgeCharge > 0);
  a.intent.squid = false; f.tick(a); assert.equal(a.s3.surge, null); close(a.anim.surgeCharge, 0);
  a.s3.actions.surge = { phase: 'charge' }; a.anim.surgeCharge = .5;
  a.superJump(new f.THREE.Vector3(0, 0, 10)); assert.equal(a.s3.surge, null); close(a.anim.surgeCharge, 0);
  a.anim.surgeCharge = .5; a.reset(); close(a.anim.surgeCharge, 0);
});

test('super jump uses raw preparation/flight times and grants no landing protection', async () => {
  const f = await fixture(), a = f.make();
  a._probeGround = () => {}; a._resolve = () => { a.grounded = true; };
  // Takeoff is the charge duration PLUS the human startup. Both are authoritative profile values,
  // so derive the boundary instead of hardcoding a frame index that drifts whenever either changes.
  // The pre-startup boundary was 80 frames; with startupHumanoidF = 22 the real takeoff is 102.
  const CHARGE_F = f.profile.superJump.chargeTime * 60;
  const STARTUP = f.profile.superJump.startupHumanoidF;
  const TAKEOFF = STARTUP + CHARGE_F;
  // A separate actor proves the startup is actually present: it must still be charging at the old
  // 80F boundary. If the startup were ever dropped this fails, instead of the boundary silently moving.
  const b = f.make();
  b._probeGround = () => {}; b._resolve = () => { b.grounded = true; };
  b.superJump(new f.THREE.Vector3(0, 0, 10));
  f.tick(b, CHARGE_F); assert.equal(b.superJumpState.phase, 'charge',
    `${STARTUP}F of human startup is missing: takeoff must not happen at the pre-startup ${CHARGE_F}F boundary`);
  a.superJump(new f.THREE.Vector3(0, 0, 10));
  f.tick(a, TAKEOFF - 1); assert.equal(a.superJumpState.phase, 'charge');
  f.tick(a); assert.equal(a.superJumpState.phase, 'flight'); close(a.invuln, 0);
  close(a.superJumpState.dur, f.profile.superJump.flightTime);
  a.invuln = 99; f.tick(a, 138); assert.equal(a.superJumpState, null); close(a.invuln, 0);
  a.damage(36, null, 'shooter'); close(a.hp, 64);
});

test('a targeted jump can be splatted during preparation', async () => {
  const f = await fixture(), a = f.make(); a._probeGround = () => {};
  a.superJump(new f.THREE.Vector3(0, 0, 10)); f.tick(a, 1);
  a.damage(100, null, 'shooter'); assert.equal(a.alive, true);
  f.tick(a); assert.equal(a.alive, false);
});

for (const hz of [20, 30, 60, 120, 144]) {
  test(`actor health and ink conditions have identical tick outcomes at ${hz} render Hz`, async () => {
    const f = await fixture(), a = f.make(), clock = new FixedClock();
    a.form = 'squid'; a.intent.squid = true; a.ink = 0; a.hp = 10; a.lastDamage = 0;
    for (let i = 0; i < 3 * hz; i++) clock.advance(1 / hz, () => f.tick(a));
    assert.equal(clock.ticks, 180); close(a.ink, 100); close(a.hp, 100);
  });
}

test('actual Physics supports a human on grating while squid and ink probes pass through', async () => {
  const f = await fixture(), V = f.THREE.Vector3;
  const b = { id: 0, solid: true, grate: true, center: new V(0, -.1, 0), half: new V(2, .1, 2),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)], faces: [-1, -1, -1, -1, -1, -1] };
  const physics = new f.Physics({ blocks: [b], queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } });
  const h = new f.GroundHit();
  physics.groundProbe(0, 0, 0, .4, .35, .24, h, false); assert.equal(h.hit, true); assert.equal(h.grate, true);
  physics.groundProbe(0, 0, 0, .4, .35, .24, h, true); assert.equal(h.hit, false);
  const ray = new f.Hit(); physics.raycast(new V(0, 1, 0), new V(0, -1, 0), 2, ray, true); assert.equal(ray.hit, false);
});

async function nativeFloor() {
  const f = await fixture(), V = f.THREE.Vector3, a = f.make();
  const center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const b = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  const level = { blocks: [b], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  f.G.level = level; f.G.physics = new f.Physics(level);
  delete a._integrate;
  f.G.physics.groundProbe(0, 0, 0, .4, .35, .24, a.ground, false);
  return { ...f, a };
}

test('native Actor movement and native collision produce the same jump/turn/stop trajectory at five render rates', async () => {
  let expected;
  for (const hz of [20, 30, 60, 120, 144]) {
    const f = await nativeFloor(), a = f.a, clock = new FixedClock(), trajectory = [];
    let landed = false;
    for (let i = 0; i < 2 * hz; i++) clock.advance(1 / hz, () => {
      const frame = clock.ticks;
      a.intent.move.set(frame < 60 ? 0 : frame < 90 ? 1 : 0, 0, frame < 60 ? 1 : 0);
      a.intent.jump = frame === 0;
      f.tick(a); landed ||= frame > 0 && a.grounded;
      trajectory.push([a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.grounded]);
    });
    assert.equal(clock.ticks, 120); assert.equal(landed, true);
    close(a.vel.length(), 0); close(a.pos.y, 0);
    if (expected) assert.deepEqual(trajectory, expected); else expected = trajectory;
  }
});
