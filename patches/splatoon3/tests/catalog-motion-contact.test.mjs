import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitMainShot } from './source-fixture.mjs';

const DT = 1 / 60;
const extraExports = `
  export { beginActorMotionTick, markActorMotionDiscontinuity } from './patches/splatoon3/runtime/actor-motion.mjs';
`;

async function setup() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports });
  f.setRandom(() => .5);
  f.G.level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-20, 0, -20], [20, 0, 20]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -1, -30], max: [30, 0, 30] }] });
  f.G.physics = new f.Physics(f.G.level);
  const owner = f.make('s3-shooter-first');
  owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 40);
  emitMainShot(f, owner);
  const p = f.G.projectiles.list.find(p => p.catalog);
  assert.ok(p, 'actual admitted catalogue round exists');
  const target = f.make('shooter'); target.team = 1; target.invuln = 0;
  target.pos.copy(p.pos).addScaledVector(p.vel, DT * .2); target.pos.y -= .7;
  return { ...f, p, owner, target };
}

test('catalogue projectile does not hit a target arriving after the projectile passed', async () => {
  const f = await setup();
  f.target.pos.x = 1.5;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 0;
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 100, 'end-pose overlap is not a shared-time hit');
  f.G.projectiles.clear();
});

test('catalogue projectile hits a target leaving after shared-time contact', async () => {
  const f = await setup();
  f.target.pos.x = 0;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 1.5;
  f.G.projectiles.update(DT);
  assert.ok(f.target.hp < 100, 'target occupied the path before moving out');
  f.G.projectiles.clear();
});

for (const hz of [30, 60, 120]) test(`catalogue crossing contact is coherent at ${hz} Hz rendering`, async () => {
  const f = await setup();
  f.target.pos.copy(f.p.pos).addScaledVector(f.p.vel, DT * .5); f.target.pos.y -= .7;
  f.target.pos.x = -1.5;
  const clock = new f.FixedClock();
  let ticks = 0;
  for (let render = 0; render < hz / 30; render++) clock.advance(1 / hz, () => {
    f.beginActorMotionTick(f.G.actors);
    if (ticks++ === 0) f.target.pos.x = 1.5;
    f.G.projectiles.update(DT);
  });
  assert.equal(ticks, 2);
  assert.equal(f.target.hp, 72, 'neither endpoint overlaps, but shared-time crossing hits once');
  f.G.projectiles.clear();
});

for (const invalidation of ['teleport', 'owner', 'form', 'new tick']) test(`catalogue ignores discontinuous ${invalidation} motion`, async () => {
  const f = await setup();
  f.target.pos.x = 0;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 1.5;
  if (invalidation === 'teleport') f.markActorMotionDiscontinuity(f.target);
  if (invalidation === 'owner') f.target.owner = 'new-peer';
  if (invalidation === 'form') f.target.form = 'squid';
  if (invalidation === 'new tick') f.beginActorMotionTick([]);
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 100, 'fallback uses current pose without sweeping a discontinuity');
  f.G.projectiles.clear();
});

test('catalogue static target and nearest-victim ordering stay intact', async () => {
  const f = await setup();
  const far = f.make('shooter'); far.team = 1; far.invuln = 0;
  far.pos.copy(f.p.pos).addScaledVector(f.p.vel, DT * .8); far.pos.y -= .7;
  f.G.actors = [f.owner, far, f.target];
  f.beginActorMotionTick(f.G.actors);
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 72);
  assert.equal(far.hp, 100, 'actor array order does not replace first contact');
  f.G.projectiles.clear();
});

test('catalogue terrain before a moving target still ends the shot', async () => {
  const f = await setup();
  const at = f.p.pos.clone().addScaledVector(f.p.vel, DT * .5);
  f.G.level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-20, 0, -20], [20, 0, 20]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -1, -30], max: [30, 0, 30] },
      { kind: 'box', min: [-3, 0, at.z], max: [3, 4, at.z + .15] }] });
  f.G.physics = new f.Physics(f.G.level);
  f.target.pos.copy(f.p.pos).addScaledVector(f.p.vel, DT); f.target.pos.y -= .7;
  f.target.pos.x = -.8;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = .8;
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 100);
  assert.ok(!f.G.projectiles.list.includes(f.p), 'terrain retires the shot');
  f.G.projectiles.clear();
});

test('catalogue range-clipped segment excludes later target movement', async () => {
  const f = await setup();
  f.p.catalog.travel = f.p.catalog.range - f.p.vel.length() * DT * .2;
  f.target.pos.x = 1.5;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 0;
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 100, 'shot expires before target arrives');
  assert.ok(!f.G.projectiles.list.includes(f.p));
  f.G.projectiles.clear();
});

test('catalogue ghost catch-up keeps current-pose collision and never damages', async () => {
  const f = await setup();
  f.p.ghost = true;
  f.target.pos.x = 1.5;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 0;
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 100);
  assert.ok(!f.G.projectiles.list.includes(f.p), 'ghost current-pose impact retires its visual');
  f.G.projectiles.clear();
});

test('catalogue stationary projectile still intersects a target crossing during the tick', async () => {
  const f = await setup();
  f.p.vel.set(0, 0, 0);
  f.target.pos.copy(f.p.pos); f.target.pos.y -= .7; f.target.pos.x = -1.5;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 1.5;
  f.G.projectiles.update(DT);
  assert.equal(f.target.hp, 72);
  f.G.projectiles.clear();
});

test('catalogue accumulated partial calls do not reuse an unrelated actor interval', async () => {
  const f = await setup();
  f.target.pos.x = 1.5;
  f.beginActorMotionTick(f.G.actors);
  f.target.pos.x = 0;
  f.G.projectiles._step(f.p, DT / 2);
  f.beginActorMotionTick(f.G.actors);
  f.G.projectiles._step(f.p, DT / 2);
  assert.equal(f.target.hp, 72, 'no complete matching fixed step: current pose is the fallback');
  f.G.projectiles.clear();
});
