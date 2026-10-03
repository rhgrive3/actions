import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wallPixelDifference, validateWallRenderResult, WALL_RENDER_SCENARIOS, verifyWallBuild } from '../../../scripts/check-inkwave-wall-render.mjs';

// Synthetic receipts self-test the evidence validator, never claim GPU proof.
// INKWAVE_WALL_RENDER_RECEIPT adds validation of the actual browser receipt.
const pixels = (n = 0) => ({ pixels: 480 * 360, changedPixels: n, changedBytes: 3 * n, totalDifference: 100 * n });
function complete() {
  return {
    gpu: { webgl: 'WebGL 2.0 (validator fixture)', renderer: 'validator fixture' },
    rows: WALL_RENDER_SCENARIOS.map(name => {
      const ready = name.startsWith('ready-');
      return { name, pixels: { beauty: pixels(ready ? 100 : 0), normal: pixels(), depth: pixels(), ao: pixels() },
        snapshot: { ready, glow: ready ? .85 : 0 }, visibleGlints: ready ? 1 : 0,
        gpuBeautyDraws: ready ? 4 : 0, gpuOverrideDraws: 0, beautyIndexCount: ready ? 24 : 0,
        overrideCalls: ready ? 3 : 0, overrideNonzero: 0, sourceGeometryChanged: false, nativeIK: [0, 0, 0, 0],
        geometry: ready ? { planeError: 0, axisError: 0, worldHalfAxis: .2 } : null };
    }),
    nativePixels: { normal: pixels(100), depth: pixels(100), ao: pixels(100) },
    unoccludedSafePixels: { normal: pixels(), depth: pixels(), ao: pixels() },
    unsafeOverridePixels: { normal: pixels(100), depth: pixels(100), ao: pixels(100) }, oldAffinePixels: pixels(100),
    disposal: { uploadedNativeBuffers: 10, uploadedNativeAttributes: 10, deletedOwnedBuffers: 2, releasedGlintVAOs: 1,
      survivorPixels: 100, deletedNativeBuffers: 0, nativeBuffersAlive: 10, survivorNormalChangedBytes: 0,
      glintGeometryDisposals: 1, glintMaterialDisposals: 1, glintDetached: true },
    lifecycle: { nativeAttached: true, nativeReadyTicks: 45, zeroDtFrozen: true, cancelImmediate: true,
      hideImmediate: true, resetImmediate: true, deathImmediate: true, disposedTerminal: true, nonuniformRatio: 2 },
  };
}
test('wall pixel readback counts actual changed pixels and rejects invalid denominators/nonfinite data', () => {
  assert.deepEqual(wallPixelDifference(new Uint8Array([0, 4, 7, 255, 2, 3, 4, 255]), new Uint8Array([0, 4, 7, 255, 4, 3, 9, 255])),
    { pixels: 2, changedPixels: 1, changedBytes: 2, totalDifference: 7 });
  for (const [a, b] of [[[], []], [[0], [0]], [[0, 0, 0, 0], [0]], [[0, NaN, 0, 0], [0, 0, 0, 0]]])
    assert.throws(() => wallPixelDifference(a, b));
});
test('wall validator rejects CPU-only callbacks, absent passes, ghost pixels and insensitive controls', () => {
  assert.equal(validateWallRenderResult(complete()).scenarios, 10);
  const reject = change => { const result = complete(); change(result); assert.throws(() => validateWallRenderResult(result)); };
  reject(r => r.rows.pop()); reject(r => r.rows[0].name = 'ready-front'); reject(r => delete r.gpu);
  reject(r => r.rows[1].gpuBeautyDraws = 0); reject(r => delete r.rows[1].gpuBeautyDraws);
  reject(r => r.rows[1].beautyIndexCount = 0); reject(r => r.rows[1].overrideCalls = 0);
  reject(r => r.rows[1].pixels.beauty = pixels()); reject(r => delete r.rows[1].pixels.depth);
  reject(r => r.rows[1].pixels.normal = pixels(1)); reject(r => r.rows[1].pixels.ao.changedBytes = -1);
  reject(r => r.rows[1].pixels.depth.pixels--); reject(r => r.rows[1].pixels.beauty.totalDifference = NaN);
  reject(r => r.rows[1].gpuOverrideDraws = 1); reject(r => r.rows[1].sourceGeometryChanged = true);
  reject(r => r.rows[1].geometry.planeError = .01); reject(r => delete r.rows[1].geometry.axisError);
  reject(r => r.rows[1].geometry.axisError = NaN); reject(r => r.rows[1].geometry.worldHalfAxis = 0);
  for (const pass of ['normal', 'depth', 'ao']) {
    reject(r => r.unsafeOverridePixels[pass] = pixels()); reject(r => r.nativePixels[pass] = pixels());
    reject(r => delete r.unoccludedSafePixels[pass]); reject(r => r.unoccludedSafePixels[pass] = pixels(1));
  }
  reject(r => r.oldAffinePixels = pixels());
});
test('wall validator rejects stranded glints, incomplete lifecycle and native GPU buffer destruction', () => {
  const reject = change => { const r = complete(); change(r); assert.throws(() => validateWallRenderResult(r)); };
  reject(r => r.rows[6].visibleGlints = 1); reject(r => r.rows[6].gpuBeautyDraws = 1);
  reject(r => r.rows[2].nativeIK = []); reject(r => r.rows[2].nativeIK[0] = Infinity);
  for (const key of ['zeroDtFrozen', 'cancelImmediate', 'hideImmediate', 'resetImmediate', 'deathImmediate', 'disposedTerminal'])
    reject(r => r.lifecycle[key] = false);
  reject(r => r.lifecycle.nativeReadyTicks = 44); reject(r => r.lifecycle.nonuniformRatio = 1);
  reject(r => r.disposal.deletedNativeBuffers = 1); reject(r => r.disposal.nativeBuffersAlive--);
  reject(r => r.disposal.glintGeometryDisposals = 2); reject(r => r.disposal.survivorNormalChangedBytes = 1);
  reject(r => r.disposal.releasedGlintVAOs = 0); reject(r => delete r.disposal.uploadedNativeAttributes);
});
if (process.env.INKWAVE_WALL_RENDER_RECEIPT) test('actual wall GPU receipt passes the same fail-closed validator', () => {
  const receipt = JSON.parse(fs.readFileSync(process.env.INKWAVE_WALL_RENDER_RECEIPT));
  assert.equal(receipt.status, 'passed'); assert.equal(receipt.errors.length, 0);
  assert.match(receipt.source.sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(validateWallRenderResult(receipt).scenarios, 10);
});
if (process.env.INKWAVE_WALL_RENDER_SITE) test('actual wall build is bound to committed source and every artifact', () => {
  const identity = verifyWallBuild(fs.realpathSync(process.env.INKWAVE_WALL_RENDER_SITE), true);
  assert.match(identity.source.sourceSha, /^[a-f0-9]{40}$/);
  assert.ok(identity.source.sourceFiles > 100);
});
