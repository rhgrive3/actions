import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// A Fizzy Bomb resting against a wall popped, then was placed .62 m further
// along its heading before the hop: straight through the wall. The offset is
// now swept; at a wall the bomb stays on its side and hops back off it.
for (const hz of [30, 60, 120]) test(`a Fizzy pop beside a wall never places the hop beyond the wall at ${hz} Hz`, async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const owner = f.make('shooter'); owner.weapon = { ...owner.weapon, sub: 'fizzy' }; owner.pos.set(50, 0, 50); owner.weaponRunner.s3SubHold = 2;
  const WALL = 6;
  // Floor y=0 and a wall plane z=6 facing -z.
  f.G.physics.segment = (start, end, hit) => {
    hit.hit = false;
    let best = Infinity;
    if (start.y >= 0 && end.y <= 0 && start.y !== end.y) {
      const t = start.y / (start.y - end.y);
      best = t; hit.hit = true; hit.point.lerpVectors(start, end, t); hit.normal.set(0, 1, 0);
    }
    if (start.z <= WALL && end.z > WALL) {
      const t = (WALL - start.z) / (end.z - start.z);
      if (t < best) { best = t; hit.hit = true; hit.point.lerpVectors(start, end, t); hit.normal.set(0, 0, -1); }
    }
    if (hit.hit) hit.dist = start.distanceTo(hit.point);
    return hit;
  };
  const bomb = f.G.projectiles.throwBomb(owner);
  bomb.pos.set(0, .03, WALL - .2); bomb.prev.copy(bomb.pos); bomb.vel.set(0, 0, .5); bomb.grounded = true; bomb.yaw = 0;
  let maxZ = -Infinity, bursts = 0;
  const off = f.on('all:sub', e => { if (e.phase === 'burst' && e.seq === bomb.seq) bursts++; });
  for (let i = 0; i < Math.round(2 * hz) && !bomb.dead; i++) {
    f.G.time += 1 / hz; f.G.projectiles.update(1 / hz);
    maxZ = Math.max(maxZ, bomb.pos.z);
  }
  off?.();
  assert.ok(bursts >= 2, 'the bomb still pops and hops: ' + bursts);
  assert.ok(maxZ < WALL, 'the bomb never passes the wall: ' + maxZ);
});
