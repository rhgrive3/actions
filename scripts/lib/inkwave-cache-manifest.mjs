import assert from 'node:assert/strict';

// Read both historical named descriptors and current compact tuples. Neither
// encoding may bypass the existing byte, digest or dependency assertions.
export function normalizeCacheAssets(assets) {
  assert(assets && typeof assets === 'object' && !Array.isArray(assets), 'cache asset map');
  return Object.fromEntries(Object.entries(assets).map(([file, value]) => {
    if (Array.isArray(value)) assert.equal(value.length, 2, 'cache tuple length: ' + file);
    const bytes = Array.isArray(value) ? value[0] : value?.bytes;
    const sha256 = Array.isArray(value) ? value[1] : value?.sha256;
    assert(Number.isSafeInteger(bytes) && bytes >= 0, 'cache byte count: ' + file);
    assert(typeof sha256 === 'string' && /^[a-f0-9]{64}$/.test(sha256), 'cache digest: ' + file);
    return [file, { bytes, sha256 }];
  }));
}
