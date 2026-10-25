import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

async function fixture() {
  const context = vm.createContext({ console });
  const make = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const modules = {
    three: make(THREE),
    '../../../src/world/levelMaterial.js': make({ createLevelMaterial() { throw Error('unused'); } }),
  };
  const module = new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-render.mjs', import.meta.url), 'utf8'), { context });
  await module.link(name => modules[name]);
  await module.evaluate();
  const vertices = new Float32Array([
    1, 2, 3, 0, 1, 0, 0, 0,
    4, 2, 3, 0, 1, 0, 1, 0,
    1, 2, 6, 0, 1, 0, 0, 1,
  ]);
  const object = { active: true, material: 'concrete', vo: 0, vc: 3, io: 0, ic: 3, collidable: true };
  const data = { vertices, indices: new Uint32Array([0, 1, 2]), manifest: { materials: {}, objects: [object] } };
  return { display: module.namespace.nativeDisplay(data, new Map(), 'high'), vertices };
}

test('baked native display preserves vertex positions and follows changing parent transforms without local recomposition', async () => {
  const { display, vertices } = await fixture();
  const scene = new THREE.Scene(), parent = new THREE.Group();
  scene.add(parent); parent.add(display.group);
  const mesh = display.group.children[0];
  const position = mesh.geometry.getAttribute('position');
  let compositions = 0;
  const update = mesh.updateMatrix;
  mesh.updateMatrix = function () { compositions++; return update.call(this); };
  for (let frame = 0; frame < 12; frame++) {
    parent.position.set(frame * 0.25, 2 - frame * 0.1, -3);
    parent.rotation.set(frame * 0.01, frame * 0.03, -frame * 0.02);
    parent.scale.set(1 + frame * 0.01, 0.8, 1.2);
    scene.updateMatrixWorld();
    assert.deepEqual(mesh.matrixWorld.elements, parent.matrixWorld.elements);
    for (let i = 0; i < position.count; i++) {
      const actual = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const expected = new THREE.Vector3().fromArray(vertices, i * 8).applyMatrix4(parent.matrixWorld);
      assert.deepEqual(actual.toArray(), expected.toArray());
    }
  }
  assert.equal(compositions, 0);
  display.dispose();
});
