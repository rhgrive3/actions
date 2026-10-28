import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

test('#945: stationary Shooter reticle avoids repeat sweeps and invalidates on every source change', async () => {
  // Runtime imports are build-relative. Exercise the actual production graph
  // through the same source/emitted resolver as the integration cache tests,
  // not a raw Node import or a replacement profile/collision implementation.
  const f = await fixture({ productionComposition: true, fullRuntime: true,
    extraExports: "export { installMuzzleFeedback } from './patches/splatoon3/runtime/muzzle-feedback.mjs';" });
  const { installMuzzleFeedback, Hit } = f, Vec = f.THREE.Vector3;
  assert.equal(typeof installMuzzleFeedback, 'function');
  // Isolated consumer mock implements the verified producer's revision contract.
  // The real Level/Tower producer is covered by shooter-shot-guide-cache.
  const level = { blocks: [], hash: {}, blockStamp: 1, collisionRevision: 0 };
  let sweeps = 0, corridorSweeps = 0;
  const physics = () => ({ level, raycast() {}, segment(_from, _to, hit) {
    corridorSweeps++; hit.hit = false; return hit;
  } });
  const G = { time: 1, physics: physics() };
  const shared = new Hit();
  Object.assign(shared, { hit: true, dist: 1, block: 2, face: 3, u: 0, v: 0 });
  shared.normal.set(0, 1, 0);
  class Projectiles {
    _muzzle(actor, out) { out.copy(actor.muzzle); }
    _ballistic() {}
    _aimFrom(actor, _from, out) { return out.copy(actor.aimDir); }
    s3ShooterImpact() { sweeps++; shared.point.set(sweeps, 2, 3); return shared; }
  }
  installMuzzleFeedback({ Projectiles, G, THREE: { Vector3: Vec }, Hit });
  const p = new Projectiles();
  const actor = {
    alive: true, form: 'kid', team: 0,
    pos: new Vec(0, 0, 0), muzzle: new Vec(1, 2, 3),
    character: {}, aimPoint: new Vec(4, 5, 6), aimDir: new Vec(0, 0, 1),
    weapon: { kind: 'shooter', projSpeed: 20, straightTime: .1, range: 30, impactRadius: .2 },
  };
  const first = p.muzzleBlockFeedback(actor);
  for (let i = 0; i < 30; i++) {
    assert.equal(p.muzzleBlockFeedback(actor), first);
    assert.equal(p.muzzleBlockFeedback(actor, true), null, 'HUD view shares the cache without replacing full-flight data');
  }
  assert.equal(sweeps, 1, 'no further 72-step physics sweeps while aiming and geometry are stationary');
  assert.equal(corridorSweeps, 1, 'one bounded corridor query on the first cache miss only');

  shared.point.x = 999;
  assert.equal(p.muzzleBlockFeedback(actor).point.x, 1, 'cached hit does not alias mutable sweep scratch');

  actor.aimPoint.x += 1;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 2, 'aim movement invalidates');
  actor.muzzle.y += 1;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 3, 'character muzzle animation/pose invalidates');
  actor.pos.z += 1;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 4, 'actor movement invalidates');
  actor.weapon.projSpeed += 1;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 5, 'ballistics updates invalidate');
  level.blockStamp++;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 5, 'query-dedup stamps are not collision changes');
  level.collisionRevision++;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 6, 'verified collision revision invalidates');
  G.physics = physics();
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 7, 'physics replacement invalidates');
  G.time += .26;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 8, 'existing periodic refresh remains bounded');
  delete level.collisionRevision;
  p.muzzleBlockFeedback(actor);p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 10, 'unverified collision owners are never reused');
  assert.equal(corridorSweeps, sweeps, 'at most one bounded corridor query per full-flight cache miss');
});
