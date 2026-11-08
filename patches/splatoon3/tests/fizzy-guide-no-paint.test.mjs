import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// While a Fizzy Bomb is held, the throw guide simulates the bomb along its
// predicted path. That simulated bomb laid real flight paint drops every
// refresh, so the predicted path was painted continuously before any throw.
test('the Fizzy throw guide never paints or queues flight drops; a real throw still does', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const owner = f.make('shooter'); owner.weapon = { ...owner.weapon, sub: 'fizzy' };
  owner.pos.set(0, 0, 0); owner.aimPitch = .3; owner.ink = 100; owner.weaponRunner.s3SubHold = 2;
  // Open air above a floor at y=0.
  f.G.physics.segment = (start, end, hit) => {
    hit.hit = start.y >= 0 && end.y <= 0 && start.y !== end.y;
    if (hit.hit) { const t = start.y / (start.y - end.y); hit.point.lerpVectors(start, end, t); hit.normal.set(0, 1, 0); hit.dist = start.distanceTo(hit.point); }
    return hit;
  };
  let splats = 0;
  const splat = f.G.paint.splat;
  f.G.paint.splat = function (...args) { splats++; return splat?.apply(this, args) ?? 0; };
  const p = f.G.projectiles;
  for (let i = 0; i < 30; i++) {
    const prediction = p.s3PredictSubTrajectory(owner, { maxTime: 3 });
    assert.ok(prediction, 'the guide is computed');
  }
  assert.equal(p._s3SplashDrops?.length || 0, 0, 'no flight drop queued by the guide');
  assert.equal(splats, 0, 'no paint from the guide');
  const bomb = p.throwBomb(owner);
  for (let i = 0; i < 30 && !bomb.dead; i++) { f.G.time += 1 / 60; p.update(1 / 60); }
  assert.ok((bomb.flySplashDrops || 0) > 0, 'the thrown bomb lays its flight drops');
});
