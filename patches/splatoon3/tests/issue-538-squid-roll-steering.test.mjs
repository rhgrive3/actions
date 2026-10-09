import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as world } from '../../../scripts/weapons-fixture.mjs';

test('#538 Squid Roll mid-air steering updates lateral horizontal velocity under stick input', async () => {
  const f = await world({ fidelity: true });
  const a = f.make('shooter');
  a.grounded = false;
  a.form = 'squid';
  a.vel.set(0, 0, 5);
  a.s3.roll = { time: 0.25, steerReady: true };

  const initialVx = a.vel.x;
  assert.equal(initialVx, 0);

  // Apply lateral stick input (+X)
  a.intent = { move: { x: 1, z: 0 } };
  a._horizontal(1 / 60, a.intent.move);

  // Velocity in X should increase towards the input direction
  assert.ok(a.vel.x > initialVx, `mid-air stick input accelerates lateral velocity (vx = ${a.vel.x})`);
});

test('#538 Squid Roll naturally decelerates horizontally when stick is neutral', async () => {
  const f = await world({ fidelity: true });
  const a = f.make('shooter');
  a.grounded = false;
  a.form = 'squid';
  a.vel.set(3, 0, 5);
  a.s3.roll = { time: 0.25, steerReady: true };

  const initialVx = a.vel.x;

  // Stick released to neutral (0, 0)
  a.intent = { move: { x: 0, z: 0 } };
  a._horizontal(1 / 60, a.intent.move);

  // Lateral velocity must naturally decelerate rather than stay frozen
  assert.ok(a.vel.x < initialVx, `neutral input produces horizontal deceleration (vx ${a.vel.x} < ${initialVx})`);
});
