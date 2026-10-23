import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeGpuTier, recordNativeContextLoss, nativeRenderCaps, nativeTextureQuality, nativeTierTextureCaps,
  capQuality, setNativeRenderBudget, setNativeShadowSize, applyNativeGpuBudget, watchNativeContextLoss, NATIVE_GPU_MAX_TIER,
} from '../runtime/native-gpu-budget.mjs';

const memoryStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m }; };
const HIGH = Object.freeze({ pixelRatio: 1.5, shadowSize: 4096, msaa: 4, bloom: true, ao: true, paintAtlas: 4096, particles: 1, reflectionScale: 0.5 });
const LOW = Object.freeze({ pixelRatio: 0.75, shadowSize: 1024, msaa: 0, bloom: false, ao: false, paintAtlas: 2048, particles: 0.4 });

test('context loss steps the tier down, saturates, and expires', () => {
  const store = memoryStore();
  assert.equal(nativeGpuTier(store, 0), 0);
  assert.equal(recordNativeContextLoss(store, 1000), 1);
  assert.equal(nativeGpuTier(store, 2000), 1);
  assert.equal(recordNativeContextLoss(store, 3000), 2);
  assert.equal(recordNativeContextLoss(store, 4000), NATIVE_GPU_MAX_TIER);
  assert.equal(nativeGpuTier(store, 4000 + 15 * 24 * 3600 * 1000), 0, 'stale step-down expires');
  store.setItem('inkwave.nativeGpuSafety', '{broken');
  assert.equal(nativeGpuTier(store, 0), 0);
  assert.equal(nativeGpuTier(null), 0);
  const throwing = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(nativeGpuTier(throwing), 0);
  assert.equal(recordNativeContextLoss(throwing), 1);
});

test('default native caps remove the second full-scene GTAO pass and bound the HDR targets', () => {
  const desktop = capQuality(HIGH, nativeRenderCaps({ mobile: false, tier: 0 }));
  assert.deepEqual({ ao: desktop.ao, msaa: desktop.msaa, pixelRatio: desktop.pixelRatio, bloom: desktop.bloom, shadowSize: desktop.shadowSize, paintAtlas: desktop.paintAtlas },
    { ao: false, msaa: 2, pixelRatio: 1.25, bloom: true, shadowSize: 4096, paintAtlas: 4096 });
  assert.equal(desktop.reflectionScale, 0.5, 'unrelated preset fields survive');
  assert.equal(capQuality(LOW, nativeRenderCaps({ tier: 0 })).pixelRatio, 0.75, 'caps never raise a value');
  assert.equal(capQuality(LOW, nativeRenderCaps({ tier: 0 })).ao, false);
  const mobile = { ...HIGH, pixelRatio: 1.2, msaa: 0, ao: false, bloom: false };
  assert.equal(capQuality(mobile, nativeRenderCaps({ mobile: true, tier: 0 })).pixelRatio, 1.2, 'touch keeps its existing cap at tier 0');
  const t1 = capQuality(HIGH, nativeRenderCaps({ tier: 1 })), t2 = capQuality(HIGH, nativeRenderCaps({ tier: 2 }));
  assert.deepEqual([t1.msaa, t1.bloom, t1.pixelRatio, t1.shadowSize, t1.paintAtlas], [0, false, 1, 2048, 2048]);
  assert.deepEqual([t2.pixelRatio, t2.shadowSize], [0.75, 1024]);
});

test('capped quality keeps identity for equal inputs', () => {
  const caps = nativeRenderCaps({ tier: 0 });
  assert.equal(capQuality(HIGH, caps), capQuality(HIGH, nativeRenderCaps({ tier: 0 })));
  assert.notEqual(capQuality(HIGH, caps), capQuality(HIGH, nativeRenderCaps({ tier: 1 })));
  assert.equal(capQuality(HIGH, null), HIGH);
  assert.ok(Object.isFrozen(capQuality(HIGH, caps)));
});

test('texture quality is lowered only by the stepped tiers', () => {
  assert.equal(nativeTextureQuality('ultra', 0), 'high');
  assert.equal(nativeTextureQuality('high', 1), 'balanced');
  assert.equal(nativeTextureQuality('medium', 1), 'balanced');
  assert.equal(nativeTextureQuality('high', 2), 'low');
  assert.equal(nativeTextureQuality('low', 0), 'low');
  const caps = { maxDimension: 1024, perRole: { normal: 512 } };
  assert.equal(nativeTierTextureCaps(caps, 1), caps, 'same object: texture profile comparison is by identity');
  assert.deepEqual(nativeTierTextureCaps(caps, 2), { maxDimension: 256, perRole: { normal: 512 } });
});

function fakeRenderer(raw) {
  // Mirrors Renderer.applySettings: raw assignment, comparison through reads.
  const R = { q: raw, scene: { traverse(fn) { fn(R.mesh); } }, mesh: { material: { needsUpdate: false } }, builds: 0, dynScale: 0.75,
    _buildComposer() { this.builds++; this.built = this.q; },
    applySettings(next) {
      const prev = this.q; this.q = next;
      if (prev !== this.q && Object.keys(this.q).some(k => prev[k] !== this.q[k])) this._buildComposer();
    } };
  return R;
}

test('renderer budget rebuilds once, survives setting changes, and restores on release', () => {
  const R = fakeRenderer(HIGH);
  assert.equal(setNativeRenderBudget(R, nativeRenderCaps({ tier: 0 })), true);
  assert.equal(R.builds, 1); assert.equal(R.dynScale, 1); assert.equal(R.mesh.material.needsUpdate, true);
  assert.equal(R.built.ao, false); assert.equal(R.q.msaa, 2);
  assert.equal(setNativeRenderBudget(R, nativeRenderCaps({ tier: 0 })), false, 'native -> native with equal caps does not rebuild');
  assert.equal(R.builds, 1);
  R.applySettings({ ...HIGH, pixelRatio: 2 });
  assert.equal(R.builds, 1, 'ultra pixel ratio is still capped to the same composer');
  R.applySettings(LOW);
  assert.equal(R.builds, 2); assert.equal(R.q.pixelRatio, 0.75);
  R.applySettings(HIGH);
  assert.equal(setNativeRenderBudget(R, null), true);
  assert.equal(R.q, HIGH, 'raw preset after leaving the native stage');
  assert.equal(R.built, HIGH);
  assert.equal(setNativeRenderBudget(fakeRenderer(HIGH), null), false, 'release without a budget is inert');
  assert.equal(setNativeRenderBudget(null, nativeRenderCaps()), false);
});

test('shadow map follows the capped renderer quality', () => {
  const disposed = [], env = { shadowSize: 4096, sun: { shadow: { mapSize: { set(w, h) { this.w = w; this.h = h; } }, map: { dispose() { disposed.push(1); } }, needsUpdate: false } }, _fitShadowCam() { this.fit = true; } };
  let invalidated = 0;
  const game = { R: fakeRenderer(HIGH), shadowCache: { invalidate() { invalidated++; } } };
  applyNativeGpuBudget(game, { env }, nativeRenderCaps({ tier: 1 }));
  assert.equal(env.shadowSize, 2048); assert.equal(env.sun.shadow.mapSize.w, 2048); assert.equal(env.sun.shadow.map, null);
  assert.equal(disposed.length, 1); assert.equal(invalidated, 1); assert.equal(env.fit, true);
  applyNativeGpuBudget(game, { env }, null);
  assert.equal(env.shadowSize, 4096); assert.equal(invalidated, 2);
  assert.equal(setNativeShadowSize(env, 4096), false);
  assert.equal(setNativeShadowSize(null, 1024), false);
});

test('context loss on a native stage records a step-down once per canvas', () => {
  const listeners = [], canvas = { addEventListener(type, fn) { listeners.push([type, fn]); } };
  const store = memoryStore(), previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  try {
    let native = false;
    watchNativeContextLoss(canvas, () => native);
    watchNativeContextLoss(canvas, () => native);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0][0], 'webglcontextlost');
    listeners[0][1]();
    assert.equal(nativeGpuTier(store), 0, 'legacy stages are not stepped down');
    native = true; listeners[0][1]();
    assert.equal(nativeGpuTier(store), 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
});
