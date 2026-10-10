import test from 'node:test';
import assert from 'node:assert/strict';
import { stepGroundVelocity } from '../runtime/movement-physics.mjs';

test('#437 stepGroundVelocity produces constant per-tick acceleration magnitude (1.00x ratio)', () => {
  const targetSpeed = 10;
  const accel = 36;
  const dt = 1 / 60;
  const expectedStep = accel * dt; // 0.6 WU/tick

  // 1. Initial acceleration from rest (0% of target speed)
  const vel0 = { x: 0, z: 0 };
  stepGroundVelocity(vel0, 0, 1, targetSpeed, accel, dt);
  const initialAccel = vel0.z;
  assert.ok(Math.abs(initialAccel - expectedStep) < 1e-9, `initial accel (${initialAccel}) matches accel * dt (${expectedStep})`);

  // 2. Mid-speed acceleration from 50% of target speed (5.0 WU/s)
  const velMid = { x: 0, z: 5.0 };
  stepGroundVelocity(velMid, 0, 1, targetSpeed, accel, dt);
  const midAccel = velMid.z - 5.0;
  assert.ok(Math.abs(midAccel - expectedStep) < 1e-9, `mid-speed accel (${midAccel}) matches accel * dt (${expectedStep})`);

  // 3. Ratio must be exactly 1.00x, NOT 2.00x (no S-curve nonlinear boosting)
  const ratio = midAccel / initialAccel;
  assert.ok(Math.abs(ratio - 1.0) < 1e-9, `mid/initial acceleration ratio (${ratio}) is exactly 1.00x`);

  // 4. Deceleration on neutral input (move = 0, 0)
  const velDecel = { x: 0, z: 5.0 };
  stepGroundVelocity(velDecel, 0, 0, targetSpeed, accel, dt);
  const decelAmount = 5.0 - velDecel.z;
  assert.ok(Math.abs(decelAmount - expectedStep) < 1e-9, `deceleration (${decelAmount}) matches accel * dt (${expectedStep})`);

  // 5. Clamping when remaining distance to target is smaller than step
  const velNear = { x: 0, z: targetSpeed - 0.2 };
  stepGroundVelocity(velNear, 0, 1, targetSpeed, accel, dt);
  assert.equal(velNear.z, targetSpeed, 'clamps exactly to target speed without overshoot');
});
