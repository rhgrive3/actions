import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCacheAssets } from '../lib/inkwave-cache-manifest.mjs';
const digest = 'a'.repeat(64);
test('cache encodings preserve the same byte and digest evidence', () => {
  assert.deepEqual(normalizeCacheAssets({ file: [12, digest] }),
    normalizeCacheAssets({ file: { bytes: 12, sha256: digest } }));
});
test('malformed cache descriptors fail before byte budgets can become NaN', () => {
  for (const value of [null, {}, [12], [12, digest, 0], [-1, digest], ['12', digest],
      [NaN, digest], [12, 'bad'], { bytes: 12, sha256: null }]) {
    assert.throws(() => normalizeCacheAssets({ file: value }));
  }
});
