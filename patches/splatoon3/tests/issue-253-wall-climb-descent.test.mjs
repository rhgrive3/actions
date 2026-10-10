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
