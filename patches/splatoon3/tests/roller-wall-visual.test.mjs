import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

test('actual Roller wall contact ends the airborne body immediately with and without volume assets', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    vmMathRandom: () => .4 });
  const { G, THREE: T } = f;
  for (const vertical of [false, true]) for (const volume of [false, true]) {
    G.scene = new T.Scene(); G.actors = []; G.boss = G.netm = null; G.time = 10;
    G.level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [], single: [
        { kind: 'box', min: [-20, -.5, -20], max: [20, 0, 20] },
        { kind: 'box', min: [-15, 0, 3], max: [15, 8, 3.5] },
      ] });
    G.physics = new f.Physics(G.level);
    const ps = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
    a.pos.set(0, 3, 0); a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 3, 30);
    a.weaponRunner.s3FlickVertical = vertical;
    const submitted = [];
    const previousFX = G.fx;
    G.fx = { burst() {}, shot() {}, inkVolumes: volume ? { isInkVolumes: true,
      assets: new Map([['roller', {}]]), begin() { submitted.length = 0; }, end() {},
      submit(_name, p) { submitted.push(p); return true; } } : null };
    try {
      ps.fireFlick(a, a.weapon);
      for (let tick = 0; tick < 60 && !ps.list.some(p => p.fidelityWallDrop); tick++) {
        G.time += 1 / 60; ps.update(1 / 60);
      }
      const p = ps.list.find(p => p.fidelityWallDrop);
      assert(p, 'real swept collision enters wall-drop on the wall');
      // Isolate the contacted glob from the siblings that are still flying.
      ps.list = [p];
      let airborneBlobs = -1;
      const drawDrops = ps.inkFlight.draw;
      ps.inkFlight.draw = function(blobs, shape, n, ...args) {
        airborneBlobs = n; // Detached paint beads are a separate live effect.
        return drawDrops.call(this, blobs, shape, n, ...args);
      };
      const snapshot = () => JSON.stringify({ pos: p.pos.toArray(), vel: p.vel.toArray(), age: p.age,
        frame: p.fidelityWallDrop.frame, done: p.fidelityWallDrop.done, ink: a.ink });
      const before = snapshot();
      for (const alpha of [0, .5, 1]) {
        ps._draw(); ps.syncVisuals(alpha);
        assert.equal(airborneBlobs, 0, 'no legacy airborne blob on the impact tick');
        assert.equal(ps.projectileVisuals.stats.triangles, 0, 'no procedural body or Roller membrane');
        assert.equal(submitted.length, 0, 'no source volume sheet after contact');
        assert.equal(snapshot(), before, 'rendering never consumes wall paint state');
      }
      const frame = p.fidelityWallDrop.frame;
      ps.update(1 / 60);
      assert(p.fidelityWallDrop.frame > frame || p.fidelityWallDrop.done, 'wall paint continues its own lifecycle');
      ps.clear(); ps.disposeVisuals();
    } finally { G.fx = previousFX; }
  }
});
