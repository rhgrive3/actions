import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNative } from './prop-retention-fixture.mjs';
const fixed = await loadNative(true), raw = await loadNative(false);
const reset = () => { fixed.G.settings = { quality: 'high' };fixed.G.game = { mobile: { touch: false } }; };
const kit = (N, quality) => new N.PropKit(new N.THREE.Scene(), { quality });
test('native CanvasTexture source is constrained for LOW/touch and preserves desktop studio detail', async () => {
  reset();const low = kit(fixed, 'low'), high = kit(fixed, 'high'), medium = kit(fixed, 'medium'), ultra = kit(fixed, 'ultra'), negative = kit(raw, 'low');
  assert.equal(low.atlas.image.width, 1024);assert.equal(low.atlas.image.height, 1024);assert.equal(negative.atlas.image.width, 2048);
  for (const k of [high, medium, ultra]) assert.equal(k.atlas.image.width, 2048);
  fixed.G.game.mobile.touch = true;const touch = kit(fixed, 'high');assert.equal(touch.atlas.image.width, 1024);
  await Promise.resolve();assert.ok(low.atlas.image._transforms.length > 0);
  for (const transform of low.atlas.image._transforms) assert.deepEqual(transform, [0.5, 0, 0, 0.5, 0, 0]);
  for (const k of [low, high, medium, ultra, negative, touch]) k.dispose();reset();
});
test('quality and mobile handoff dispose old GPU allocation once, resize retained source, and redraw without compounding scale', async () => {
  reset();const k = kit(fixed, 'high');let disposals = 0;k.atlas.addEventListener('dispose', () => disposals++);
  const image = k.atlas.image, texture = k.atlas;fixed.G.settings.quality = 'low';
  k.update(1 / 60, 1);assert.equal(image.width, 1024);assert.equal(disposals, 1);assert.equal(k.atlas, texture);assert.equal(k.atlas.image, image);
  k.update(1 / 60, 2);k.build();assert.equal(disposals, 1);
  k._propAtlasRedraw();k._propAtlasRedraw();assert.deepEqual(image._transforms.slice(-2), [[0.5,0,0,0.5,0,0],[0.5,0,0,0.5,0,0]]);
  fixed.G.settings.quality = 'high';k.update(1 / 60, 3);assert.equal(image.width, 2048);assert.equal(disposals, 2);
  fixed.G.game.mobile.touch = true;k.update(1 / 60, 4);assert.equal(image.width, 1024);assert.equal(disposals, 3);
  await Promise.resolve();const redraw = k._propAtlasRedraw;k.dispose();const version = texture.version, draws = image._transforms.length;
  redraw();assert.equal(texture.version, version);assert.equal(image._transforms.length, draws);assert.equal(k._propAtlasRedraw, null);
  const headless = new fixed.PropKit(null, { quality: 'low', headless: true });headless.build();headless.update(1 / 60, 1);headless.dispose();reset();
});
test('atlas scaling preserves native material bindings, logical UVs, geometry and colliders at the same detail tier', () => {
  reset();const a = kit(raw, 'low'), b = kit(fixed, 'low');
  const p = { pos: [0, 0, 0], team: 1 };const ac = a.add('banner', p), bc = b.add('banner', p);a.build();b.build();
  assert.deepEqual(ac.colliders, bc.colliders);assert.deepEqual(a.stats(), b.stats());
  assert.equal(b.mat.paint.map, b.atlas);assert.equal(b.mat.glow.map, b.atlas);assert.equal(b.mat.cloth.map, b.atlas);
  assert.equal(a._meshes.length, b._meshes.length);
  for (let i = 0; i < a._meshes.length; i++) {
    const before = a._meshes[i], after = b._meshes[i], A = before.geometry.attributes, B = after.geometry.attributes;
    if (!B.uv && A.uv) {
      // Solid default built-in shaders consume no UV input. Every mapped or
      // customized shader still compares its original logical UVs byte-for-byte.
      for (const m of [before, after]) {
        assert.ok(['MeshBasicMaterial','MeshStandardMaterial','MeshPhysicalMaterial'].includes(m.material.type));
        assert.equal(m.material.onBeforeCompile, fixed.THREE.Material.prototype.onBeforeCompile);
        assert.ok(!Object.values(m.material).some(v => v?.isTexture));
        assert.equal(m.customDepthMaterial, undefined); assert.equal(m.customDistanceMaterial, undefined);
      }
    }
    const keys = Object.keys(A).filter(k => k !== 'uv' || B.uv);
    assert.deepEqual(Object.keys(B), keys);
    for (const name of keys) {
      assert.deepEqual([B[name].array.constructor.name,B[name].itemSize,B[name].normalized,B[name].count], [A[name].array.constructor.name,A[name].itemSize,A[name].normalized,A[name].count]);
      assert.deepEqual(B[name].array, A[name].array, name + ' remains exact');
    }
    assert.deepEqual(after.geometry.index?.array, before.geometry.index?.array);
    for (const key of ['type','transparent','opacity','side','depthWrite','depthTest','alphaTest','vertexColors','roughness','metalness','blending'])
      assert.equal(after.material[key], before.material[key], key);
    assert.equal(after.material.customProgramCacheKey(), before.material.customProgramCacheKey());
  }
  a.dispose();b.dispose();reset();
});
