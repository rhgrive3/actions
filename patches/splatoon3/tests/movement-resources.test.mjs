import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { rollLaunchSpeed } from '../runtime/movement.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

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
  assert.equal(a.submerged, true); assert.equal(a.onEnemy, false);
  close(a.hp, hp); close(a.ink, f.profile.resources.inkRefillSwim / 60);
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
  f.profile.resources.enemyInkGrace = .025;
  f.profile.resources.enemyInkGraceReset = 0; // isolate interval arithmetic from #315's 45F reset policy
  f.G.paint.sample = () => 2; f.tick(a); close(a.hp, 100);
  f.tick(a); close(a.damageFromInk, f.profile.resources.enemyInkDps * (2 / 60 - .025));
  f.G.paint.sample = () => 0; f.tick(a); close(a.s3.enemyInkTime, 0);
  f.G.paint.sample = () => 2; const hp = a.hp; f.tick(a); close(a.hp, hp);
});

test('enemy contact suppresses health recovery even while its damage grace is active', async () => {
  const f = await fixture(), a = f.make();
  f.profile.resources.regenDelay = 0; f.profile.resources.enemyInkGrace = 100;
  a.hp = 50; a.lastDamage = 99; f.G.paint.sample = () => 2;
  f.tick(a, 5); close(a.hp, 50);
});

test('contact ink remains nonlethal and bounded by total accumulated damage', async () => {
  const f = await fixture(); f.G.paint.sample = () => 2;
  const fresh = f.make();
  f.tick(fresh, 180);
  close(fresh.hp, f.PLAYER.hp - f.profile.resources.enemyInkDamageCap);
  close(fresh.damageFromInk, f.profile.resources.enemyInkDamageCap);
  assert.equal(fresh.alive, true);

  const alreadyHurt = f.make(); alreadyHurt.hp = 20;
  f.tick(alreadyHurt, 180);
  close(alreadyHurt.hp, 20); close(alreadyHurt.damageFromInk, 0);
  alreadyHurt.damage(20, null, 'shooter'); assert.equal(alreadyHurt.alive, false);
});

test('refill predicates distinguish own ink, wall, dry/enemy squid, and stored charge', async () => {
  const f = await fixture(), a = f.make('charger'); a.form = 'squid'; a.intent.squid = true; a.ink = 0;
  f.G.paint.sample = () => 0; f.tick(a, 5); close(a.ink, 0);
  f.G.paint.sample = () => 2; f.tick(a, 5); close(a.ink, 0);
  f.G.paint.sample = () => 1; a.intent.fire = true; a.weaponRunner.s3Stored = { charge: 1, remaining: 1 };
  f.tick(a, 5); close(a.ink, 0);
  a.weaponRunner.s3Stored = null; a.climbing = true; a._updateClimb = () => {}; a.grounded = false;
  f.tick(a); close(a.ink, f.profile.resources.inkRefillSwim / 60);
});

test('recover-stop countdown stays tied to actor ticks and refill starts at its boundary', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.intent.squid = true; a.ink = 0;
  a.s3.recoverStopRemaining = 3 / 60;
  f.tick(a, 2); close(a.ink, 0);
  f.tick(a); close(a.ink, f.profile.resources.inkRefillSwim / 60);
});

test('consecutive roll momentum applies one retention coefficient per new launch', () => {
  let speed = 20;
  for (let chain = 0; chain < 4; chain++) {
    speed = rollLaunchSpeed(speed, chain, .85);
    close(speed, 20 * .85 ** Math.max(0, chain));
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
  close(a.s3.roll.armorTime, 0); a.damage(60, null, 'shooter'); close(a.hp, 40);
});

test('roll collision clipping persists instead of restoring its pre-collision launch velocity', async () => {
  const f = await fixture(), a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.move.set(0, 0, -1); a.intent.jump = true;
  a.vel.set(0, 0, f.PLAYER.swimSpeed);
  a._integrate = () => { a.vel.x = 0; a.vel.z = 0; };
  f.tick(a); assert.ok(a.s3.roll);
  a._integrate = () => {}; f.tick(a); close(a.vel.lengthSq() - a.vel.y ** 2, 0);
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
  a.superJump(new f.THREE.Vector3(0, 0, 10));
  f.tick(a, 79); assert.equal(a.superJumpState.phase, 'charge');
  f.tick(a); assert.equal(a.superJumpState.phase, 'flight'); close(a.invuln, 0);
  close(a.superJumpState.dur, 138 / 60);
  a.invuln = 99; f.tick(a, 138); assert.equal(a.superJumpState, null); close(a.invuln, 0);
  a.damage(36, null, 'shooter'); close(a.hp, 64);
});

test('a targeted jump can be splatted during preparation', async () => {
  const f = await fixture(), a = f.make(); a._probeGround = () => {};
  a.superJump(new f.THREE.Vector3(0, 0, 10)); f.tick(a, 1);
  a.damage(100, null, 'shooter'); assert.equal(a.alive, false);
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
