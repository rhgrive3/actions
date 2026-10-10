import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as world } from '../../../scripts/weapons-fixture.mjs';

test('#253 neutral wall cling causes gradual descent', async () => {
  const f = await world({ fidelity: true });
  const a = f.make('shooter');

  // Mock wall physics & own ink paint sample
  f.G.paint.sample = () => 1;
  f.G.physics.raycast = (_a, _b, _c, h) => {
    h.hit = true;
    h.normal = new f.THREE.Vector3(0, 0, 1);
    h.face = 1;
    h.u = 0.5;
    h.v = 0.5;
    return h;
  };

  a.climbing = true;
  a.form = 'squid';
  a.alive = true;
  a.team = 0;
  a.wallN.set(0, 0, 1);
  a.intent = { move: { x: 0, z: 0 }, jump: false };

  // After 1 tick of neutral cling, downward descent begins
  a._updateClimb(1 / 60, true);
  assert.equal(a.climbing, true);
  assert.ok(a.vel.y < 0, `downward descent initiated (vel.y = ${a.vel.y})`);
  assert.ok(a.s3NeutralWallSlideT > 0, 's3NeutralWallSlideT starts accumulating');

  // After sustained neutral cling, descent smoothly reaches terminal neutral descent speed (-0.9 WU/s)
  for (let i = 0; i < 30; i++) a._updateClimb(1 / 60, true);
  assert.equal(a.climbing, true);
  assert.equal(a.vel.y, -0.9, 'terminal neutral wall descent reached (-0.9 WU/s)');
});

test('#253 stick input or surge charging cancels neutral wall descent', async () => {
  const f = await world({ fidelity: true });
  const a = f.make('shooter');

  f.G.paint.sample = () => 1;
  f.G.physics.raycast = (_a, _b, _c, h) => {
    h.hit = true;
    h.normal = new f.THREE.Vector3(0, 0, 1);
    h.face = 1;
    h.u = 0.5;
    h.v = 0.5;
    return h;
  };

  a.climbing = true;
  a.form = 'squid';
  a.alive = true;
  a.team = 0;
  a.wallN.set(0, 0, 1);
  a.s3NeutralWallSlideT = 0.5;
  a.vel.y = -0.9;

  // Active upward stick input
  a.intent = { move: { x: 0, z: -1 }, jump: false };
  a._updateClimb(1 / 60, true);

  // Neutral slide timer resets and upward climb speed takes over
  assert.equal(a.s3NeutralWallSlideT, 0, 'stick input resets neutral wall slide timer');
  assert.ok(a.vel.y > -0.9, `climb velocity is no longer neutral descent (vel.y = ${a.vel.y})`);
});

// Shared wall fixture: own-ink vertical wall (normal +Z), stick neutral, B not held, ZL held (climbing).
function neutralWall(f, { wall = true, own = 1 } = {}) {
  f.G.paint.sample = () => own;
  f.G.physics.raycast = (_a, _b, _c, h) => {
    h.hit = wall;
    h.normal = new f.THREE.Vector3(0, 0, 1);
    h.face = 1; h.u = 0.5; h.v = 0.5;
    return h;
  };
  const a = f.make('shooter');
  a.climbing = true; a.form = 'squid'; a.alive = true; a.team = 0;
  a.wallN.set(0, 0, 1);
  a.pos.y = 5; a.vel.y = 0;
  a.intent = { move: { x: 0, z: 0 }, jump: false };
  return a;
}

test('#253 neutral descent moves the actor down along the wall while cling persists', async () => {
  const f = await world({ fidelity: true });
  const a = neutralWall(f);
  let previous = a.pos.y;
  for (let i = 0; i < 120; i++) {
    a._updateClimb(f.STEP, true);
    a._integrate(f.STEP, true, false);
    assert.equal(a.climbing, true, `cling kept at tick ${i + 1}`);
    assert.ok(a.pos.y <= previous + 1e-12, `no rise without input at tick ${i + 1}`);
    previous = a.pos.y;
  }
  assert.ok(a.pos.y < 5 - 1, `coordinate descended over 2 s (y = ${a.pos.y})`);
});

test('#253 neutral descent is identical under 30, 60 and 120 Hz render cadence', async () => {
  const f = await world({ fidelity: true });
  const run = (elapsed) => {
    const a = neutralWall(f);
    const clock = new f.FixedClock();
    let ticks = 0;
    for (let frame = 0; frame < Math.round(2 / elapsed); frame++) {
      ticks += clock.advance(elapsed, (dt) => {
        a.intent = { move: { x: 0, z: 0 }, jump: false };
        a._updateClimb(dt, true);
        a._integrate(dt, true, false);
      });
    }
    return { ticks, y: a.pos.y, vy: a.vel.y, timer: a.s3NeutralWallSlideT, climbing: a.climbing };
  };
  const at60 = run(1 / 60);
  assert.equal(at60.ticks, 120, 'two seconds of fixed 60 Hz gameplay ticks');
  assert.deepEqual(run(1 / 30), at60, '30 Hz render cadence gives the same fixed-tick result');
  assert.deepEqual(run(1 / 120), at60, '120 Hz render cadence gives the same fixed-tick result');
});

test('#253 Squid Roll (wall roll) state keeps its own motion, not neutral descent', async () => {
  const f = await world({ fidelity: true });
  const a = neutralWall(f);
  f.movementState(a).roll = { time: 0.5, armorTime: 0.75, speed: 10 };
  for (let i = 0; i < 30; i++) a._updateClimb(f.STEP, true);
  assert.equal(a.s3NeutralWallSlideT, 0, 'roll state keeps the neutral descent timer at zero');
  assert.ok(a.vel.y >= -1e-9, `no neutral descent during wall roll (vel.y = ${a.vel.y})`);
});

test('#253 held B charge, top-edge exit and paint loss never receive neutral descent', async () => {
  const f = await world({ fidelity: true });

  const charge = neutralWall(f);
  charge.intent = { move: { x: 0, z: 0 }, jump: true };
  for (let i = 0; i < 30; i++) charge._updateClimb(f.STEP, true);
  assert.equal(charge.s3NeutralWallSlideT, 0, 'held B charge does not start neutral descent');

  const top = neutralWall(f, { wall: false });
  for (let i = 0; i < 30; i++) top._updateClimb(f.STEP, true);
  assert.equal(top.climbing, false, 'wall probe miss ends cling at the top edge');
  assert.equal(top.s3NeutralWallSlideT, 0, 'top-edge exit keeps the timer at zero');

  const lost = neutralWall(f, { own: 0 });
  for (let i = 0; i < 30; i++) lost._updateClimb(f.STEP, true);
  assert.equal(lost.climbing, false, 'non-own paint ends cling');
  assert.equal(lost.s3NeutralWallSlideT, 0, 'paint loss keeps the timer at zero');
});
