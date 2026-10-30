import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const EXTRA = `
export { driveMeleeSpecial } from './patches/splatoon3/runtime/bot-special-melee.mjs';
export { createBotSpecialContext } from './patches/splatoon3/runtime/bot-special-context.mjs';`;
async function setup(id, distance = 10, { floorEnd = 40, wall = false } = {}) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports: EXTRA });
  f.G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, spawnPads: [[-30, 0, 0], [30, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-40, -1, -40], max: [40, 0, floorEnd] }, ...(wall ? [{ kind: 'box', min: [-4, 0, 4], max: [4, 6, 4.5] }] : [])], half: [] });
  f.G.physics = new f.Physics(f.G.level);
  f.G.paint = { sample: () => 1, splat: () => 0 };
  f.G.match = { playing: () => true, canRespawn: () => false, time: 100 };
  const a = f.make(), e = f.make();
  a._integrate = f.Actor.prototype._integrate;
  a.isBot = true; a.pos.set(0, 0, 0); a.invuln = 0; a.grounded = true;
  a.weapon = { ...a.weapon, special: id, specialCost: 100 }; a.special = a.specialCost();
  e.team = 1; e.pos.set(0, 0, distance); e.invuln = 0; e.hp = 1000;
  const brain = { target: e, seeTimer: 1, aimYaw: 0, aimPitch: Math.atan2(-.4, distance) };
  const events = []; f.on('all:special', event => events.push(event));
  function step(dt = 1 / 60) {
    const ctx = f.createBotSpecialContext(a, a.intent, dt, brain.target, { brain, world: f.G, move: a.intent.move });
    assert.ok(ctx); f.driveMeleeSpecial(ctx);
    // Supply the chosen aim through the same public input surface as _tail.
    // Tests isolate admission/physics, not BotBrain's already-tested aim spring.
    a.aimYaw = brain.aimYaw = ctx.wantYaw; a.aimPitch = brain.aimPitch = ctx.wantPitch;
    const cp = Math.cos(a.aimPitch);
    a.aimPoint.set(a.pos.x + Math.sin(a.aimYaw) * cp * ctx.aimDistance, a.pos.y + 1.1 + Math.sin(a.aimPitch) * ctx.aimDistance, a.pos.z + Math.cos(a.aimYaw) * cp * ctx.aimDistance);
    f.G.time += dt; a.update(dt); f.G.projectiles.update(dt);
    return ctx;
  }
  return { f, a, e, brain, events, step };
}
function run(t, seconds, hz = 60) { for (let i = 0; i < Math.ceil(seconds * hz); i++) t.step(1 / hz); }

for (const hz of [30, 60, 120]) {
  test(`Kraken completes a real charge-release dash at ${hz}Hz`, async () => {
    const t = await setup('krakenRoyale'); run(t, 2.3, hz);
    assert.equal(t.a.stats.specials, 1);
    assert.ok(t.a.pos.z > 5, 'native dash advanced beyond charge movement');
    assert.ok(t.e.hp < 1000, 'native swept contact damaged the visible enemy');
  });
  test(`Kraken with no enemy neither advances nor jumps at ${hz}Hz`, async () => {
    const t = await setup('krakenRoyale'); t.step(1 / hz);
    t.brain.target = null; const start = t.a.pos.clone(); run(t, 3, hz);
    assert.ok(t.a.pos.distanceTo(start) < .01);
    assert.equal(t.events.filter(e => e.action === 'jump').length, 0);
    assert.equal(t.a.intent.fire, false); assert.equal(t.a.intent.jump, false);
  });
}

test('Kraken chooses native jump attack when the enemy closes', async () => {
  const t = await setup('krakenRoyale', 10); t.step(); t.e.pos.z = 2;
  run(t, 1.6);
  assert.ok(t.events.some(e => e.action === 'jump' && e.damage === 60));
  assert.ok(t.e.hp < 1000);
});

test('Kraken does not release a charged dash after losing its target', async () => {
  const t = await setup('krakenRoyale');
  for (let i = 0; i < 150 && (t.a._s3AllSpecialState?.chargeT || 0) < 35 / 60; i++) t.step();
  assert.ok(t.a._s3AllSpecialState.chargeT >= 35 / 60);
  t.brain.target = null; const start = t.a.pos.clone(); run(t, .5);
  assert.equal(t.a._s3AllSpecialState.phase, 'charge');
  assert.ok(t.a.pos.distanceTo(start) < .01);
});

for (const mode of ['dead', 'ally', 'occluded', 'height', 'cliff']) test(`Kraken rejects ${mode} target/route`, async () => {
  const t = await setup('krakenRoyale', 10, { wall: mode === 'occluded', floorEnd: mode === 'cliff' ? 11 : 40 });
  if (mode === 'dead') t.e.alive = false;
  if (mode === 'ally') t.e.team = 0;
  if (mode === 'height') t.e.pos.y = 5;
  run(t, .2);
  assert.equal(t.a.stats.specials, 0);
});

test('Stamp uses an admitted sub hold/release and waits for the native throw startup', async () => {
  const t = await setup('ultraStamp', 13); run(t, .5);
  assert.ok(t.a._s3AllSpecialState.throwAt > t.a._s3AllSpecialState.t);
  assert.equal(t.events.filter(e => e.action === 'throw').length, 0);
  run(t, .9);
  assert.equal(t.events.filter(e => e.action === 'throw').length, 1);
  assert.equal(t.a.specialActive, null);
});

test('Stamp does not blindly release a held throw after target loss', async () => {
  const t = await setup('ultraStamp', 13);
  for (let i = 0; i < 60 && !t.a.intent.sub; i++) t.step();
  assert.equal(t.a.intent.sub, true); t.brain.target = null; run(t, .8);
  assert.equal(t.events.filter(e => e.action === 'throw').length, 0);
  assert.equal(t.a.intent.sub, true);
});

for (const hz of [30, 60, 120]) test(`Reefslider brakes through the real fire edge and hits at ${hz}Hz`, async () => {
  const t = await setup('reefslider', 12); run(t, 2.5, hz);
  assert.equal(t.a.stats.specials, 1);
  assert.ok(t.events.some(e => e.action === 'impact'));
  assert.ok(t.e.hp < 1000);
  assert.ok(t.a.pos.z < 18, 'prediction stops before a full-length blind rail');
});

test('Reefslider refuses an unsafe minimum rail and brakes after target loss', async () => {
  const unsafe = await setup('reefslider', 10, { floorEnd: 5 }); run(unsafe, .2);
  assert.equal(unsafe.a.stats.specials, 0);
  const t = await setup('reefslider', 12); t.step(); t.brain.target = null; run(t, 2);
  assert.ok(t.events.some(e => e.action === 'impact'));
  assert.ok(t.a.pos.z < 10);
});

for (const id of ['tripleSplashdown', 'slam']) test(`${id} only activates on a local visible enemy and then yields to native impact`, async () => {
  const t = await setup(id, 3); run(t, 2);
  assert.equal(t.a.stats.specials, 1);
  assert.ok(t.e.hp < 1000, 'native impact delivered damage');
  assert.equal(t.a.intent.fire, false); assert.equal(t.a.intent.jump, false);
});

// The full brain must carry its eye-based spring target through the special's
// feet-based emitter, native windup and projectile collision before we count it.
import { makeBotSpecialFixture } from './bot-special-fixture.mjs';
test('Stamp full BotBrain throw hits stationary and moving enemies through native flight', async () => {
  const f = await makeBotSpecialFixture();
  const hits = [], apply = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = function (owner, victim, damage, cause, ...args) {
    if (cause === 'ultraStamp') hits.push({ owner, victim, damage });
    return apply.call(this, owner, victim, damage, cause, ...args);
  };
  for (const [distance, speed] of [[10, 0], [14, 0], [14, 2]]) {
    const { a, b, enemy } = f.scenario('ultraStamp');
    enemy.pos.z = distance; enemy.vel.x = speed; f.aim(a, b, enemy.pos); hits.length = 0;
    for (let frame = 0; frame < 180 && !hits.some(h => h.owner === a && h.victim === enemy); frame++) {
      enemy.pos.x += speed / 60; f.tick(a, b);
    }
    assert.ok(f.events.some(e => e.actor === a && e.action === 'throw'), 'native sub release emitted the throw');
    assert.ok(hits.some(h => h.owner === a && h.victim === enemy && h.damage >= 60), `${distance}WU moving ${speed}: the special itself must hit`);
  }
});
test('Reefslider and Splashdown full BotBrain inputs hit moving enemies with their actual explosions', async () => {
  const f = await makeBotSpecialFixture();
  const hits = [], apply = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = function (owner, victim, damage, cause, ...args) {
    hits.push({ owner, victim, damage, cause }); return apply.call(this, owner, victim, damage, cause, ...args);
  };
  for (const [special, distance] of [['reefslider', 12], ['tripleSplashdown', 8]]) {
    const { a, b, enemy } = f.scenario(special); enemy.pos.z = distance; enemy.vel.x = 2;
    f.aim(a, b, enemy.pos); hits.length = 0;
    for (let frame = 0; frame < 150; frame++) { enemy.pos.x += 2 / 60; f.tick(a, b); }
    assert.ok(hits.some(h => h.owner === a && h.victim === enemy && h.cause === special), special + ' source-tagged explosion hit');
    assert.ok(f.events.some(e => e.actor === a && e.action === 'impact'), special + ' completed its native explosion');
  }
});

test('Stamp full BotBrain closes a four-unit gap before its direct jump swing', async () => {
  const f = await makeBotSpecialFixture(), { a, b, enemy } = f.scenario('ultraStamp');
  enemy.pos.z = 4; f.aim(a, b, enemy.pos);
  const hits = [], apply = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = function (owner, victim, damage, cause, ...args) {
    if (owner === a && victim === enemy && cause === 'ultraStamp') hits.push(damage);
    return apply.call(this, owner, victim, damage, cause, ...args);
  };
  for (let frame = 0; frame < 180 && !hits.includes(100); frame++) f.tick(a, b);
  assert.ok(a.pos.z > 1, 'native movement closes the gap instead of hopping in place');
  assert.ok(hits.includes(100), 'native direct swing connects, not only its weak spray');
});
