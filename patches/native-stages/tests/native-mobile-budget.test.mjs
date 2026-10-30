import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRenderCaps, nativeTextureProfile, capQuality, setNativeRenderBudget} from '../runtime/native-gpu-budget.mjs';
import {nativeStageTextureCaps} from '../runtime/native-texture-budget.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';

const {stages} = nativeStageCatalog();
const high = Object.freeze({pixelRatio: 1.35, shadowSize: 2048, msaa: 0, bloom: false, ao: false,
  paintAtlas: 2048, particles: .7, reflectionScale: .2, reflectionInterval: 2, reflectionActors: false});
const low = Object.freeze({...high, pixelRatio: .75, shadowSize: 1024, reflectionScale: 0});
const denseManifest = {geometry: {vertices: 250000}, materials: Object.fromEntries(Array.from({length: 100}, (_, i) => [
  'm' + i, {albedo: 'a' + i, maps: {normal: 'n' + i, roughness: 'r' + i, opacity: 'o' + i, emissive: 'e' + i}},
]))};
const stageCaps = quality => nativeStageTextureCaps(denseManifest, quality, {mobile: true, maxTextureSize: 4096});

test('every available native stage uses the mobile render and texture budget', () => {
  assert.equal(stages.length, 23);
  for (const stage of stages) {
    assert.ok(stage.sourceSha256, stage.id);
    const q = capQuality(high, nativeRenderCaps({mobile: true}));
    assert.deepEqual([q.pixelRatio, q.shadowSize, q.reflectionScale, q.reflectionInterval, q.reflectionActors],
      [1, 1024, .1, 4, false], stage.id);
    for (const compressed of [false, true]) {
      const profile = nativeTextureProfile({settingsQuality: 'high', touch: true, compressed, stageCaps});
      assert.equal(profile.quality, 'balanced', stage.id);
      assert.equal(profile.caps.maxDimension, 1024, stage.id);
    }
  }
});

test('mobile caps never raise low settings and context-loss tiers never raise the native shadow budget', () => {
  for (const tier of [0, 1, 2]) {
    const caps = nativeRenderCaps({mobile: true, tier});
    const q = capQuality(low, caps);
    assert.equal(q.pixelRatio, .75);
    assert.equal(q.shadowSize, 1024);
    assert.equal(q.reflectionScale, 0);
    assert.equal(q.msaa, 0);
    assert.equal(q.bloom, false);
    assert.equal(q.paintAtlas, 2048);
    assert.equal(q.particles, .7, 'simulation/particle policy is unchanged');
    assert.equal(capQuality(high, caps).shadowSize, 1024);
  }
});

test('a reflection interval is a minimum cadence while dimensions remain upper bounds', () => {
  const q = capQuality({...high, reflectionInterval: 8, shadowSize: 512}, nativeRenderCaps({mobile: true}));
  assert.equal(q.reflectionInterval, 8, 'a slower existing reflection cadence stays slower');
  assert.equal(q.shadowSize, 512);
  assert.equal(q.reflectionScale, .1);
  assert.equal(q.reflectionActors, false);
  assert.equal(capQuality({custom: 9}, {custom: 4}).custom, 4, 'ordinary numeric caps are still maxima');
});

test('compressed High avoids expensive detail maps but explicit Ultra retains that option', () => {
  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    for (const compressed of [false, true]) {
      const p = nativeTextureProfile({settingsQuality: quality, touch: true, compressed, stageCaps});
      assert.equal(p.quality, quality === 'low' ? 'low' : quality === 'ultra' && compressed ? 'high' : 'balanced');
      if (compressed) {
        assert.ok(p.caps.fallback, 'retain PNG fallback and idle decoder retirement');
        assert.equal(p.caps.fallback.quality, quality === 'low' ? 'low' : 'balanced');
        assert.equal(p.textureTouch, false);
      } else assert.equal(p.textureTouch, true);
    }
  }
  const recovered = nativeTextureProfile({settingsQuality: 'high', tier: 1, touch: true, compressed: true, stageCaps});
  assert.equal(recovered.quality, 'low');
  assert.equal(recovered.caps.maxDimension, 256);
  assert.equal(recovered.caps.fallback.maxDimension, 256);
});

test('desktop texture selection and renderer state after native release stay unchanged', () => {
  for (const settingsQuality of ['low', 'medium', 'high', 'ultra']) {
    const p = nativeTextureProfile({settingsQuality, touch: false, compressed: true, stageCaps});
    assert.equal(p.quality, settingsQuality === 'low' ? 'low' : ['high', 'ultra'].includes(settingsQuality) ? 'high' : 'balanced');
    assert.equal(p.caps.fallback, undefined);
  }
  const R = {q: high};
  setNativeRenderBudget(R, nativeRenderCaps({mobile: true}));
  assert.equal(R.q.pixelRatio, 1);
  const changed = {...high, pixelRatio: 2, reflectionScale: .4};
  R.q = changed;
  assert.equal(R.q.pixelRatio, 1);
  assert.equal(R.q.reflectionScale, .1);
  setNativeRenderBudget(R, null);
  assert.equal(R.q, changed, 'leaving native restores the exact raw settings object');
});

test('pixel and reflection work estimates include the existing 64px target floor', () => {
  const mobile = capQuality(high, nativeRenderCaps({mobile: true}));
  for (const [width, height, priorRatio] of [[1024, 768, 1.2], [844, 390, 1.35], [568, 320, 1.35]]) {
    const scenePixels = (mobile.pixelRatio / priorRatio) ** 2;
    const shadowPixels = (mobile.shadowSize / high.shadowSize) ** 2;
    const reflectionArea = (ratio, scale) => Math.max(64, Math.round(width * ratio * scale)) * Math.max(64, Math.round(height * ratio * scale));
    const reflectionPixelsPerFrame = reflectionArea(mobile.pixelRatio, mobile.reflectionScale) /
      reflectionArea(priorRatio, high.reflectionScale) * (high.reflectionInterval / mobile.reflectionInterval);
    assert.ok(scenePixels <= .695);
    assert.equal(shadowPixels, .25);
    assert.ok(reflectionPixelsPerFrame <= .16);
  }
});
