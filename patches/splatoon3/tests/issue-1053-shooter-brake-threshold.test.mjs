import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFidelityProjectile } from '../runtime/weapons-fidelity.mjs';
const THREE = await import(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url));

const STEP = 1 / 60;
const move = Object.freeze({
  hz: 60, endSpeed: null,
  brakeDrag: 0.36, brakeGravity: 252,
  freeDrag: 0.02, freeGravity: 57.6,
  freeVelocityXZ: 0.2355 * 60,
  freeVelocityY: -0.15 * 60,
});
function shot(y = 0) {
  return {
    pos: new THREE.Vector3(), prev: new THREE.Vector3(),
    vel: new THREE.Vector3(0, y, 1.493 * 60),
    age: 0, life: 1.2, straight: 0, fidelityMove: move, fidelityPhase: 1,
  };
}
const xz = p => Math.hypot(p.vel.x, p.vel.z) / 60;
const vy = p => p.vel.y / 60;

test('#1053 level Shooter waits for both XZ/Y brake thresholds before free fall', () => {
  const p = shot();
  for (let i = 0; i < 4; i++) advanceFidelityProjectile(p, STEP);
  assert.equal(p.fidelityPhase, 1, 'Y reached its lower bound but XZ is still above 0.2355');
  assert.ok(Math.abs(xz(p) - 0.25048383488) < 1e-10, xz(p));
  assert.ok(Math.abs(vy(p) - (-0.15)) < 1e-10, vy(p));

  advanceFidelityProjectile(p, STEP);
  assert.equal(p.fidelityPhase, 2, 'free state starts only after XZ also reaches its lower bound');
  assert.ok(Math.abs(xz(p) - 0.2355) < 1e-10, xz(p));
  assert.ok(Math.abs(vy(p) - (-0.15)) < 1e-10, vy(p));
});

test('#1053 upward shot cannot enter free while Y is still above its threshold', () => {
  const p = shot(18);
  for (let i = 0; i < 5; i++) advanceFidelityProjectile(p, STEP);
  assert.ok(xz(p) <= 0.2355 + 1e-10, 'XZ lower component has already been reached');
  assert.ok(vy(p) > -0.15, 'Y condition remains unsatisfied');
  assert.equal(p.fidelityPhase, 1);
  for (let i = 0; i < 20 && p.fidelityPhase === 1; i++) advanceFidelityProjectile(p, STEP);
  assert.equal(p.fidelityPhase, 2);
});
