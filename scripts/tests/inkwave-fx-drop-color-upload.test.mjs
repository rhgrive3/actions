import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';

test('production FX retains exact live colours while uploading only changed droplet slots', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true,
    extraExports: "export { FX } from './inkwave-public/src/fx/fx.js';" });
  const fx = new f.FX(new f.THREE.Scene(), { quality: 0.25 });
  const color = fx.dGeo.attributes.aColA;
  const gpu = new Float32Array(color.array.length);
  let uploadedVersion = -1;
  function render() {
    let bytes = 0;
    if (color.version !== uploadedVersion) {
      for (const range of color.updateRanges) {
        gpu.set(color.array.subarray(range.start, range.start + range.count), range.start);
        bytes += range.count * 4;
      }
      uploadedVersion = color.version;
      color.clearUpdateRanges();
    }
    for (let i = 0; i < fx.dN; i++) {
      const expected = [fx.dC[i * 3], fx.dC[i * 3 + 1], fx.dC[i * 3 + 2], (fx.dA[i * 8 + 7] & 16) ? 0 : 1];
      assert.deepEqual(Array.from(gpu.subarray(i * 4, i * 4 + 4)), expected, `GPU slot ${i}`);
    }
    return bytes;
  }
  function spawn(i, matte = false) {
    const c = new f.THREE.Color(i / 19, i / 23, i / 29);
    fx._spawnDrop(i, 20, -3, 1, 0, 2, c, .03, 10, 1, 1, 4 | (matte ? 16 : 0));
  }
  for (let i = 0; i < 8; i++) spawn(i, i % 2 === 0);
  fx._updateDrops(1 / 60);
  assert.equal(render(), 8 * 16);
  const version = color.version;
  fx._updateDrops(1 / 60);
  assert.equal(render(), 0, 'stable colours need no upload');
  assert.equal(color.version, version);
  spawn(9);
  fx._updateDrops(1 / 60);
  assert.equal(render(), 16, 'only the newly occupied colour slot changes');
  fx.dA[1 * 8 + 2] = 0;
  fx._updateDrops(1 / 60);
  assert.equal(render(), 16, 'expiry uploads the swap destination only');

  // Do not consume the first update: a later smaller range must preserve it.
  spawn(10, true);
  fx._updateDrops(1 / 60);
  fx.dA[2 * 8 + 2] = 0;
  fx._updateDrops(1 / 60);
  assert.ok(render() > 16, 'dirty ranges accumulate until a render consumes them');

  // Recycle occupied slots at capacity, then clear and reuse the same buffers.
  fx.dCap = fx.dN;
  for (let i = 0; i < 12; i++) spawn(i + 1, i % 2 === 0);
  fx._updateDrops(1 / 60);
  render();
  fx.clear();
  fx._updateDrops(1 / 60);
  assert.equal(render(), 0);
  spawn(15, true);
  fx._updateDrops(1 / 60);
  assert.equal(render(), 16);
  fx.dispose();
});

test('reinitializing the droplet pool resets colour tracking with the new geometry', async () => {
  const f = await fixture({ productionComposition: true,
    extraExports: "export { FX } from './inkwave-public/src/fx/fx.js';" });
  const fx = new f.FX(new f.THREE.Scene(), { quality: 0.25 });
  fx._spawnDrop(0, 10, 0, 0, 0, 0, new f.THREE.Color(.2, .4, .6), .1, 1, 1, 1, 4);
  fx._updateDrops(1 / 60);
  fx.root.remove(fx.dMesh); fx.dGeo.dispose(); fx.dMesh.material.dispose();
  fx._initDrops(4);
  const c = new f.THREE.Color(.8, .1, .3);
  fx._spawnDrop(0, 10, 0, 0, 0, 0, c, .1, 1, 1, 1, 4 | 16);
  fx._updateDrops(1 / 60);
  const attribute = fx.dGeo.attributes.aColA;
  assert.deepEqual(Array.from(attribute.array.subarray(0, 4)), [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b), 0]);
  assert.deepEqual(Array.from(attribute.updateRanges, r => [r.start, r.count]), [[0, 4]]);
  fx.dispose();
});
