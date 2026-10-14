import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptFxEmptyPools } from '../fx-empty-pools-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const ROOT = new URL('../../../', import.meta.url);
const FX = fs.readFileSync(new URL('inkwave-public/src/fx/fx.js', ROOT), 'utf8');
const unique = (source, before, after, why) => {
  assert.equal(source.split(before).length - 1, 1, why + ' unique anchor');
  return source.replace(before, after);
};

test('fx empty-pool culling is build-only and composes into the production FX', () => {
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/fx-empty-pools-adapter.mjs'), true);
  const fx = adaptBuildSource('src/fx/fx.js', FX);
  assert.match(fx, /m\.visible = m\.geometry\.instanceCount > 0;/);
  assert.doesNotThrow(() => new vm.SourceTextModule(fx));
  assert.equal(adaptFxEmptyPools('src/config.js', 'x', unique), 'x');
  assert.throws(() => adaptFxEmptyPools('src/fx/fx.js', adaptFxEmptyPools('src/fx/fx.js', FX, unique), unique));
});

test('production FX shows a pool exactly while it has instances; motes keep their own switch', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: "export { FX } from './src/fx/fx.js';" });
  const { THREE } = f;
  const scene = new THREE.Scene(), fx = new f.FX(scene, { particles: 1 });
  const pools = [fx.dMesh, fx.puffs.mesh, fx.glows.mesh, fx.rings.mesh, fx.shells.mesh, fx.beams.mesh];
  const meshes = fx.root.children.filter((o) => o.isMesh);
  assert.deepEqual(new Set(meshes), new Set([...pools, fx.motes]), 'every FX mesh is a pool or the motes');
  const cam = new THREE.PerspectiveCamera(); cam.updateMatrixWorld();
  fx.update(1 / 60, cam);
  for (const m of pools) { assert.equal(m.geometry.instanceCount, 0, m.name); assert.equal(m.visible, false, m.name + ' idle'); }
  assert.equal(fx.motes.visible, true, 'motes untouched');
  const p = new THREE.Vector3(0, 1, -3), n = new THREE.Vector3(0, 1, 0), c = new THREE.Color(1, 0.4, 0.1);
  fx.burst(p, n, c, { count: 6 }); fx.ring(p, n, c, {}); fx.explosion(p, c, 2);
  fx.update(1 / 60, cam);
  for (const m of pools) assert.equal(m.visible, m.geometry.instanceCount > 0, m.name);
  assert.ok(pools.some((m) => m.visible), 'live particles are drawn');
  fx.motes.visible = false; fx.update(1 / 60, cam); assert.equal(fx.motes.visible, false, 'motes switch preserved');
  for (let i = 0; i < 600; i++) fx.update(1 / 60, cam);
  for (const m of pools) assert.equal(m.visible, m.geometry.instanceCount > 0, m.name + ' after expiry');
});
