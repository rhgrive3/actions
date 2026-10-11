import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { biasQuantile } from '../runtime/weapon-accuracy.mjs';

// #198: the extracted DegSwerve is the maximum horizontal angle. Community
// S3 measurements model DegBias as the median ANGULAR fraction rather than
// an independent Bernoulli outer/inner selection. This verifies the live
// emission, not an independently recovered Nintendo RNG or 2-D distribution.
async function setup() {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const ps = G.projectiles = new f.Projectiles(G.scene);
  let queue = [];
  f.setRandom(() => queue.length ? queue.shift() : .5);
  const actor = grounded => {
    const a = f.make('shooter');
    a.grounded = grounded;
    a.aimPoint.set(0, 1.05, 100); a.aimDir.set(0, 0, 1);
    return a;
  };
  const dirOf = (a, maximum, samples) => {
    queue = samples.slice(); // magnitude quantile, then horizontal sign
    ps.fireShooter(a, a.weapon, maximum);
    return ps.list.at(-1).vel.clone().normalize();
  };
  const angle = dir => Math.atan2(Math.abs(dir.x), dir.z) * 180 / Math.PI;
  return { actor, dirOf, angle };
}
const close = (a, b, label, epsilon = 1e-4) =>
  assert.ok(Math.abs(a - b) < epsilon, label + ': ' + a + ' != ' + b);

test('#198 grounded Splattershot 1%-to-25% angular medians advance once per shot', async () => {
  const { actor, dirOf, angle } = await setup();
  const a = actor(true), maxSwerve = 4.86, accuracy = a.weaponRunner.s3Accuracy;
  for (let i = 0; i < 30; i++) {
    const before = Math.min(.25, .01 + .01 * i);
    close(accuracy.stand, before, 'per-shot bias before emission');
    const u = i % 3 === 0 ? .25 : i % 3 === 1 ? .5 : .75;
    const direction = dirOf(a, maxSwerve, [u, .75]);
    close(angle(direction), maxSwerve * biasQuantile(u, before),
      'native horizontal launch matches the angular CDF');
    close(direction.y, 0, 'horizontal-only S3 Shooter deviation');
    close(accuracy.stand, Math.min(.25, before + .01), 'one admitted accuracy update');
  }
  close(accuracy.stand, .25, 'sourced/community median-angle cap');
});

test('#198 airborne Splattershot uses 11.66-degree max and 40% angular median', async () => {
  const { actor, dirOf, angle } = await setup();
  const a = actor(false), maxSwerve = 11.66;
  for (const u of [0, .25, .5, .75, 1 - 1e-12]) {
    const direction = dirOf(a, maxSwerve, [u, .75]);
    close(angle(direction), maxSwerve * biasQuantile(u, .4),
      'airborne angular distribution inside the full source maximum', 1e-6);
    close(direction.y, 0, 'no random pitch for Shooter');
  }
  close(a.weaponRunner.s3Accuracy.stand, .06, 'five shots advance the ground state exactly five times');
});
