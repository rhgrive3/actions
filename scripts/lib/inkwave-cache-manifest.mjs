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

// Production workers encode precache dependencies as positions in the
// integrity-checked asset map. Decode using the exact insertion order shipped
// in BUILD.assets, and reject mixed/invalid/duplicate entries before budgets
// or dependency checks are allowed to run.
export function decodePrecacheEntries(precache, assets) {
  assert(Array.isArray(precache), 'cache precache array');
  assert(assets && typeof assets === 'object' && !Array.isArray(assets), 'cache precache asset map');
  const paths = Object.keys(assets);
  const indexed = precache.some(value => typeof value === 'number');
  const decoded = precache.map(value => {
    let file = value;
    if (indexed) {
      assert(Number.isSafeInteger(value) && value >= 0 && value < paths.length, 'cache precache index');
      file = paths[value];
    } else assert(typeof file === 'string', 'cache precache path');
    assert(Object.hasOwn(assets, file), 'cache precache manifest key: ' + String(file));
    return file;
  });
  assert.equal(new Set(decoded).size, decoded.length, 'cache precache uniqueness');
  return decoded;
}
