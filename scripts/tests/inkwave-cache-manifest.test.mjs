import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCacheAssets, decodePrecacheEntries } from '../lib/inkwave-cache-manifest.mjs';
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

// Use the actual emitted asset-map order, including historical path encoding.
test('precache indices and named paths retain exact dependency identities', () => {
  const assets = { 'z/first.json': [1, digest], 'a/second.json': [2, digest] };
  assert.deepEqual(decodePrecacheEntries([0, 1], assets), Object.keys(assets));
  assert.deepEqual(decodePrecacheEntries([1], assets), ['a/second.json']);
  assert.deepEqual(decodePrecacheEntries(Object.keys(assets), assets), Object.keys(assets));
});
test('malformed or duplicate precache entries cannot bypass dependency checks', () => {
  const assets = { first: [1, digest], second: [2, digest] };
  for (const entries of [null, {}, [-1], [2], [0.5], [NaN], [Infinity], [0, 'second'],
      ['missing'], [null], [0, 0], ['first', 'first']]) {
    assert.throws(() => decodePrecacheEntries(entries, assets));
  }
});
