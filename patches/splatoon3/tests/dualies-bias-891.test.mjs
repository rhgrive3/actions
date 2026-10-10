import test from 'node:test';
import assert from 'node:assert/strict';
import { DualiesAccuracy } from '../runtime/dualies-accuracy.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('#891 Dualies normal fire: 1% start, +1% per admitted shot, 25% cap', () => {
  const a = new DualiesAccuracy();
  const sampled = Array.from({ length: 30 }, () => a.shot(true));
  near(sampled[0], .01);
  near(sampled[23], .24);
  assert.equal(sampled[24], .25);
  assert.equal(sampled[29], .25);
});

test('#891 Dualies recovery waits the 5F hold, then -0.005 per fixed frame', () => {
  const a = new DualiesAccuracy();
  for (let i = 0; i < 30; i++) a.shot(true);
  a.advance(5 / 60);
  near(a.stand, .25);
  a.advance(10 / 60);
  near(a.stand, .25 - 10 * .005);
});

test('#891 Dualies recovery boundary is independent of the rendered frame rate', () => {
  const run = (steps, dt) => {
    const a = new DualiesAccuracy();
    for (let i = 0; i < 30; i++) a.shot(true);
    for (let i = 0; i < steps; i++) a.advance(dt);
    return a.stand;
  };
  // 0.5 s after the last shot in each cadence (30 fixed frames).
  const at60 = run(30, 1 / 60), at120 = run(60, 1 / 120), at30 = run(15, 1 / 30);
  near(at60, .25 - 25 * .005);
  near(at120, at60);
  near(at30, at60);
});

test('#891 Dualies jump bias is 40% while airborne and does not persist after landing', () => {
  const a = new DualiesAccuracy();
  for (let i = 0; i < 10; i++) a.shot(true);
  const stand = a.stand;
  assert.equal(a.chance(false), .4);
  assert.equal(a.shot(false), .4);
  assert.equal(a.chance(true), a.stand);
  assert.notEqual(a.chance(true), .4);
  near(stand + .01, a.stand);
});

test('#891 Projectiles.fireDualies samples the bias once per admitted normal shot; turret shots do not', async () => {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.boss = null; G.netm = null; G.actors = [];
  G.level = { blocks: [], faces: [], queryBlocks(_a, _b, _c, _d, out) { out.length = 0; return out; } };
  G.physics = new f.Physics(G.level);
  const ps = G.projectiles = new f.Projectiles(G.scene);
  const a = f.make('dualies');
  a.aimPoint.set(0, 1.05, 100); a.aimDir.set(0, 0, 1);
  const r = a.weaponRunner;
  assert.ok(r.s3DualiesAccuracy && typeof r.s3DualiesAccuracy.shot === 'function', 'runner owns a Dualies bias state');
  near(r.s3DualiesAccuracy.stand, .01);

  const calls = [];
  const original = r.s3DualiesAccuracy.shot.bind(r.s3DualiesAccuracy);
  r.s3DualiesAccuracy.shot = grounded => { const p = original(grounded); calls.push(p); return p; };

  // Admitted shots come from the runner's fire loop (update), not from direct Projectiles calls.
  for (let i = 0; i < 120 && calls.length < 12; i++) { a.ink = 100; r.update(1 / 60, { fire: true }); }
  assert.ok(calls.length >= 12, `expected at least 12 admitted shots, got ${calls.length}`);
  calls.forEach((p, i) => near(p, Math.min(.25, .01 + i * .01)));

  // A direct Projectiles call keeps the cone it is given and does not advance the bias (#883 contract).
  const beforeDirect = calls.length, standBefore = r.s3DualiesAccuracy.stand;
  ps.fireDualies(a, a.weapon, 2, 0);
  assert.equal(calls.length, beforeDirect);
  near(r.s3DualiesAccuracy.stand, standBefore);

  // Post-roll turret fire keeps its spreadLock and must not advance the normal-fire bias.
  a.intent.fire = true;
  assert.equal(r.tryDodge(new f.THREE.Vector3(0, 0, 1)), true);
  let guard = 0;
  while (r.dodge && guard++ < 120) r.update(1 / 60, { fire: true });
  assert.equal(r.s3Turret, true);
  const beforeTurret = calls.length;
  for (let i = 0; i < 10; i++) { a.ink = 100; r.update(1 / 60, { fire: true }); }
  assert.equal(calls.length, beforeTurret);
});
