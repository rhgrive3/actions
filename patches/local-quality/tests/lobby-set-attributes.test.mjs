import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

async function fixture(before = false) {
  const context = vm.createContext({console});
  const raw = fs.readFileSync(new URL(before ? './fixtures/lobby-set-attributes-before.mjs.txt' : '../../../inkwave-public/src/game/lobbySet-geo.js', import.meta.url), 'utf8');
  const source = before ? raw : adaptBuildSource('src/game/lobbySet-geo.js', raw);
  const module = new vm.SourceTextModule(source, {context});
  const bindings = {
    three: THREE,
    'three/addons/utils/BufferGeometryUtils.js': {mergeGeometries() {}, mergeVertices() {}},
    'three/addons/geometries/RoundedBoxGeometry.js': {RoundedBoxGeometry: class {}},
    './lobbySet-mats.js': {SLOT: {plain: 0}},
  };
  await module.link(name => new vm.SyntheticModule(Object.keys(bindings[name]), function () {
    for (const [key, value] of Object.entries(bindings[name])) this.setExport(key, value);
  }, {context}));
  await module.evaluate();return module.namespace;
}
const before = await fixture(true), after = await fixture();
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function sameGeometry(a, b) {
  assert.deepEqual(Object.keys(b.attributes), Object.keys(a.attributes));
  for (const key of Object.keys(a.attributes)) {
    const x = a.attributes[key], y = b.attributes[key];
    assert.deepEqual([y.itemSize, y.normalized, y.count, y.array.constructor.name], [x.itemSize, x.normalized, x.count, x.array.constructor.name], key);
    assert.deepEqual(bytes(y.array), bytes(x.array), key);
  }
  assert.equal(b.index, a.index);
}

test('composed lobby attribute writers match every frozen bucket, default and decal callback byte', () => {
  for (const key of ['surface', 'lit', 'neonA', 'neonB', 'neon', 'emit', 'unknown']) for (const defaults of [true, false]) for (const uvMode of ['box', 'keep', 'swap']) {
    const traces = [], outputs = [];
    for (const old of [true, false]) {
      const trace = [], builder = new after.SetBuilder();traces.push(trace);
      builder.push(new THREE.Matrix4().makeRotationY(.43));
      const input = new THREE.BoxGeometry(1.2, .8, 2.1);
      const options = {uv: uvMode === 'keep' ? 'keep' : undefined, swapUV: uvMode === 'swap', uvScale: 1.7,
        m: new THREE.Matrix4().makeTranslation(.2, -.3, .4)};
      if (!defaults) Object.assign(options, {color: '#4279b3', k: 1.8, surf: [3, .23, .87, .1], lit: [.3, .4, .5], neon: [.6, .7, .8],
        dec(u, v, i) { trace.push([u, v, i]);return [u * .3, v * .7, i % 3]; }});
      outputs.push((old ? before.add : after.SetBuilder.prototype.add).call(builder, key, input, options));
      assert.equal(builder.tris, outputs.at(-1).attributes.position.count / 3);
      assert.equal(input.index.count, 36, 'input ownership is unchanged');input.dispose();
    }
    sameGeometry(outputs[0], outputs[1]);assert.deepEqual(traces[1], traces[0]);
    for (const g of outputs) g.dispose();
  }
});

test('planar UV writes preserve signed zero, dominant-axis ties and all source bytes', () => {
  for (const scale of [1, 0, -1, .37]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -0, 0, 1, 2, 3, -1, -2, -3, .1, .2, .3], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 1, 1, 0, -1, 1, 0, 0, -1, -1, -1, 0], 3));
    const a = g.clone(), b = g.clone();before.boxUV(a, scale);after.boxUV(b, scale);
    sameGeometry(a, b);g.dispose();a.dispose();b.dispose();
  }
});
