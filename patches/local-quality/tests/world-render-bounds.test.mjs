import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadNative } from './prop-retention-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const { THREE, G, SRC, PropKit, dressingFor } = await loadNative(true);
const helpers = await import(pathToFileURL(SRC + 'src/world/render-bounds.js'));
const experiment = await import('./fixtures/static-source-batches.mjs');
const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
const { PLAYER } = await import(pathToFileURL(SRC + 'src/config.js'));
const original = fs.readFileSync(SRC + 'src/world/environment.js', 'utf8');
function environment(patched, trial = false) {
  let code = patched ? adaptBuildSource('src/world/environment.js', original) : original;
  if (trial) code = experiment.adaptStaticDrawCounterfactual(code);
  const params = { ...helpers, createStaticDrawBatches: experiment.createStaticDrawBatches };
  const E = new Function('THREE', 'mergeGeometries', 'PLAYER', 'G', ...Object.keys(params),
    code.replace(/^import .*;$/gm, '').replaceAll('export ', '') + '\nreturn Environment;')(THREE, mergeGeometries, PLAYER, G, ...Object.values(params));
  const env = Object.create(E.prototype);
  Object.assign(env, { root: new THREE.Group(), bounds: { minX: -25, maxX: 25, minZ: -44, maxZ: 44 },
    footprint: [{ minX: -25, maxX: 25, minZ: -44, maxZ: 44, cx: 0, cz: 0, hx: 25, hz: 44, aligned: true }],
    time: 0, moored: [], _foamShapes: [], _buildFoamField() {}, lhBeam: new THREE.Object3D() });
  env._initUniforms(); env._buildScenery(); env._buildLife(); return env;
}
function bufferSnapshot(geo) {
  return Object.fromEntries([...Object.entries(geo.attributes).map(([key, attr]) => [key, Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength)]),
    ['index', geo.index ? Buffer.from(geo.index.array.buffer, geo.index.array.byteOffset, geo.index.array.byteLength) : null]]);
}
function verifyRanges(root) {
  if (!root.isGroup) return 1;
  let start = 0;
  for (const child of root.children) {
    assert.equal(child.geometry.index, root.geometry.index);
    assert.equal(child.geometry.drawRange.start, start);
    start += child.geometry.drawRange.count;
    assert.equal(child.geometry.drawRange.count % 3, 0);
    for (const key of Object.keys(root.geometry.attributes)) assert.equal(child.geometry.attributes[key], root.geometry.attributes[key]);
    assert.equal(child.boundingSphere, root.geometry.boundingSphere, 'same original renderer sort centre');
  }
  assert.equal(start, root.geometry.index?.count ?? root.geometry.attributes.position.count);
  return root.children.length;
}
function assertVerticesEnclosed(mesh, time, kind = '') {
  const p = mesh.geometry.attributes.position, matrix = new THREE.Matrix4(), v = new THREE.Vector3();
  const phase = mesh.geometry.attributes.aPhase, flex = mesh.geometry.attributes.flex, wave = mesh.geometry.attributes.wave;
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (kind === 'gull') {
        const side = Math.abs(v.x), ph = phase.getX(instance);
        const x = Math.min(1, Math.max(0, (Math.sin(time * .55 + ph * 17) + .3) / .9));
        const glide = .35 + .65 * x * x * (3 - 2 * x);
        const a = Math.min(1, Math.max(0, (side - .08) / .27));
        v.y += Math.sin(time * 8.5 + ph * 6.2831) * glide * side * .62 * a * a * (3 - 2 * a);
        v.y -= .12 * side * side;
      } else if (flex) {
        const e = matrix.elements, ph = e[12] * .83 + e[14] * .61 + e[13] * .37;
        v.z += flex.getX(i) * wave.getZ(i) * (Math.sin(time * wave.getX(i) + ph + v.x * wave.getY(i)) + .35 * Math.sin(time * wave.getX(i) * 2.3 + ph * 1.7 + v.y * 3));
      }
      v.applyMatrix4(matrix);
      assert.ok(mesh.boundingSphere.containsPoint(v), JSON.stringify({name:mesh.name,time,instance,i,v:v.toArray(),sphere:mesh.boundingSphere,matrix:matrix.elements,flex:flex?.getX(i),wave:wave&&[wave.getX(i),wave.getY(i),wave.getZ(i)]}));
    }
  }
}

test('real scenery preserves every source byte/RNG outcome and limits contiguous views to four shared-buffer draws', t => {
  const before = environment(false), after = environment(true), trial = environment(true, true), counts = {};
  for (const name of ['terrain', 'staticScenery', 'city']) {
    assert.deepEqual(bufferSnapshot(after[name].geometry), bufferSnapshot(before[name].geometry));
    assert.deepEqual(bufferSnapshot(trial[name].geometry), bufferSnapshot(before[name].geometry));
    counts[name] = verifyRanges(trial[name]);
    const g = after[name].geometry, n = g.index?.count ?? g.attributes.position.count, radii = [];
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Box3(), v = new THREE.Vector3();
      for (let i = Math.floor(n / 3 * k / 4) * 3; i < Math.floor(n / 3 * (k + 1) / 4) * 3; i++) b.expandByPoint(v.fromBufferAttribute(g.attributes.position, g.index ? g.index.getX(i) : i));
      radii.push(b.getBoundingSphere(new THREE.Sphere()).radius / g.boundingSphere.radius);
    }
    counts[name] = { draws: counts[name], radii };
  }
  assert.deepEqual(after.trees.instanceMatrix.array, before.trees.instanceMatrix.array);
  assert.deepEqual(after.trees.instanceColor.array, before.trees.instanceColor.array);
  assert.equal(after.trees.frustumCulled, true);
  for (const time of [-1e5, 0, .1, 1, 20, 100, 1e6]) {
    before.time = after.time = time; before._animate(); after._animate();
    for (const [key, kind] of [['sailInst', 'sail'], ['buoyInst', 'buoy'], ['gullInst', 'gull']]) {
      assert.deepEqual(after[key].instanceMatrix.array, before[key].instanceMatrix.array);
      assert.equal(after[key].frustumCulled, true); assertVerticesEnclosed(after[key], time, kind);
    }
  }
  t.diagnostic(JSON.stringify(counts));
});

test('real PropKit motion and cloth envelopes enclose every shader-deformed vertex; repeated blink values stay clean', t => {
  const kit = new PropKit(new THREE.Scene());
  for (const [type, opts] of [['acunit', {}], ['acunit', { variant: 1 }], ['vent', { variant: 1 }], ['banner', {}], ['bunting', {}], ['speaker', {}], ['buoy', {}]])
    kit.add(type, { pos: [3, 2, -5], rotY: .7, scale: 1.3, ...opts });
  kit.build(); assert.ok(kit._inst.some(m => m.userData.axis)); assert.ok(kit._inst.some(m => m.userData.cloth));
  for (const time of [-10000, 0, .2, .7, 1, 10, 1e6]) {
    kit.update(1 / 60, time);
    for (const mesh of kit._inst) {
      const flex = mesh.geometry.attributes.flex;
      if (flex && !Array.from(flex.array).every(Number.isFinite)) {
        assert.equal(mesh.frustumCulled, false, 'native nonfinite flag shader data retains its uncullable fallback');
        continue;
      }
      assert.equal(mesh.frustumCulled, true); assertVerticesEnclosed(mesh, time);
    }
  }
  const blink = kit._inst.find(m => m.userData.blink); assert.ok(blink);
  kit.update(0, .2); const version = blink.instanceColor.version, values = blink.instanceColor.array.slice();
  kit.update(0, .2); assert.equal(blink.instanceColor.version, version); assert.deepEqual(blink.instanceColor.array, values);
  t.diagnostic(JSON.stringify({ kinds: kit._inst.map(m => m.name), dirtyVersion: version })); kit.dispose();
});

test('range policy keeps transparent, small and spatially unhelpful buckets as one mesh', () => {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  assert.equal(experiment.createStaticDrawBatches(geo, new THREE.MeshBasicMaterial()).isMesh, true);
  const big = new THREE.SphereGeometry(3, 64, 32);
  assert.equal(experiment.createStaticDrawBatches(big, new THREE.MeshBasicMaterial({ transparent: true })).isMesh, true);
});
