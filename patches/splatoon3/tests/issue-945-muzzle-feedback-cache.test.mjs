import test from 'node:test';
import assert from 'node:assert/strict';
import { installMuzzleFeedback } from '../runtime/muzzle-feedback.mjs';

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
}
class Hit {
  constructor() { this.hit = true; this.point = new Vec(); this.normal = new Vec(0, 1, 0); this.dist = 1; this.block = 2; this.face = 3; this.u = 0; this.v = 0; }
}

test('#945: stationary Shooter reticle avoids repeat sweeps and invalidates on every source change', () => {
  const level = { blocks: [], hash: {}, blockStamp: 1 };
  const G = { time: 1, physics: { level, raycast() {} } };
  const shared = new Hit();
  let sweeps = 0;
  class Projectiles {
    _muzzle(actor, out) { out.copy(actor.muzzle); }
    _ballistic() {}
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
  for (let i = 0; i < 30; i++) assert.equal(p.muzzleBlockFeedback(actor), first);
  assert.equal(sweeps, 1, 'no further 72-step physics sweeps while aiming and geometry are stationary');

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
  assert.equal(sweeps, 6, 'collision generation invalidates');
  G.physics = { level, raycast() {} };
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 7, 'physics replacement invalidates');
  G.time += .26;
  p.muzzleBlockFeedback(actor);
  assert.equal(sweeps, 8, 'in-place geometry refresh stays bounded to 250ms');
});
