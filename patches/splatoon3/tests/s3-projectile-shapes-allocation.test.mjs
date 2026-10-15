import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({
  fullRuntime: true, productionComposition: true, realProjectiles: true,
  extraExports: "export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export {bodyParams} from './patches/splatoon3/runtime/s3-projectile-shapes.mjs';",
});
f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
f.setRandom(() => .37);

function projectile(kind, age, stuck) {
  return { age, seed: .37, vis: .1, size: .2,
    pos: new f.THREE.Vector3(0, 0, 3), start: new f.THREE.Vector3(),
    catalog: kind === 'shot' ? null : { stuck, descriptor: { c: { InitRadiusForPlayer: .2 } } },
  };
}

test('body parameters optionally reuse caller storage without changing values or the existing API', () => {
  const out = {};
  for (const kind of ['shot', 'pellet', 'arrow']) {
    for (const age of [0, 1 / 60, .05, .25]) {
      for (const speed of [0, 1, 60, 132]) {
        for (const stuck of [false, true]) {
          const p = projectile(kind, age, stuck), expected = f.bodyParams(p, kind, speed);
          assert.equal(f.bodyParams(p, kind, speed, out), out);
          for (const key of ['R', 'L', 'kind', 'rag']) assert.equal(out[key], expected[key]);
        }
      }
    }
  }
  const p = projectile('shot', .1, false);
  assert.notEqual(f.bodyParams(p, 'shot', 60), f.bodyParams(p, 'shot', 60), 'three-argument callers still own their result');
});

test('native draw reuses one body-parameter object across rounds and clears without growing render pools', () => {
  const system = f.G.projectiles;
  f.G.scene = new f.THREE.Scene(); system.scene = f.G.scene;
  f.G.scene.add(system.blobs, system.arcLine, system.arcRing);
  f.G.settings = {};
  f.G.physics.segment = (_a, _b, hit) => { hit.hit = false; return hit; };
  const actor = f.make('shooter');
  actor.form = 'kid'; actor.kidT = 10; actor.ink = 100; actor.intent.fire = true;
  actor.aimDir.set(0, 0, 1); actor.aimPoint.set(0, 1, 100);
  let storage, writes = 0;
  for (let frame = 0; frame < 180; frame++) {
    if (frame === 120) actor.intent.fire = false;
    f.tick(actor); system.update(1 / 60);
    if (!storage) {
      assert.ok(system._s3Shapes.bodyParams, 'renderer owns reusable parameter storage');
      storage = new Proxy(system._s3Shapes.bodyParams, {
        set(target, key, value) { writes++; target[key] = value; return true; },
      });
      system._s3Shapes.bodyParams = storage;
    }
    assert.equal(system._s3Shapes.bodyParams, storage);
  }
  assert.ok(writes > 100, 'the actual per-round draw writes into the persistent storage');
  const renderer = system._s3Shapes, children = system.scene.children.length;
  for (let i = 0; i < 20; i++) {
    system.clear(); system._draw();
    assert.equal(system._s3Shapes, renderer);
    assert.equal(system.scene.children.length, children);
    assert.equal(renderer.body.count, 0); assert.equal(renderer.body.visible, false);
  }
});
