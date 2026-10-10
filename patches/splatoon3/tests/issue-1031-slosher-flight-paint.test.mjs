import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

test('#1031 Slosher units without SplashParam do not inherit legacy in-flight floor paint', async () => {
  const f = await fixture(), a = f.make('slosher');
  f.G.scene = new f.THREE.Scene();
  f.G.camera = { position: new f.THREE.Vector3(0, 4, -8) };
  f.G.fx = { muzzle() {} }; f.G.audio = { play() {} };
  f.G.actors = [a];
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 12); a.aimYaw = a.yaw = 0;
  const ps = new f.Projectiles(f.G.scene); f.G.projectiles = ps;
  ps.fireSlosh(a, a.weapon);

  const sloshes = ps.list.filter(p => p.type === 'slosh');
  assert.ok(sloshes.length > 0);
  const noSplash = sloshes.filter(p => !p.fidelitySloshUnit?.SplashAndSplashWallHitSpawnPrm?.SplashParam?.length);
  const sourcedSplash = sloshes.filter(p => p.fidelitySloshUnit?.SplashAndSplashWallHitSpawnPrm?.SplashParam?.length);
  assert.ok(noSplash.length > 0, 'fixture includes the source unit with SplashArrayOrderNum -1 / empty SplashParam');
  assert.ok(sourcedSplash.length > 0, 'fixture also retains units with explicit source SplashParam');
  for (const p of noSplash) assert.equal(p.trailEvery, 0, 'source unit without SplashParam emits no recurring floor paint');
});
