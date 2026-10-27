import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { selectTestShard } from '../lib/inkwave-test-shards.mjs';

test('every discovered patch test belongs to exactly one shard', () => {
  const files = Array.from({length: 157}, (_, i) => `patches/tests/${String(i).padStart(3,'0')}.test.mjs`);
  for (const count of [1, 2, 4, 7, 8]) {
    const shards = Array.from({length: count}, (_, i) => selectTestShard(files, i, count));
    assert.equal(shards.reduce((n, shard) => n + shard.length, 0), files.length);
    assert.deepEqual(shards.flat().sort(), files.slice().sort());
    for (const [index, shard] of shards.entries()) assert.deepEqual(selectTestShard(files, index, count), shard);
  }
});
test('invalid shard configurations fail closed', () => {
  const files = ['a.test.mjs', 'b.test.mjs'];
  for (const [index, count] of [[-1, 4], [4, 4], [0, 0], [0, -2], [0.5, 2], [0, NaN], [0, Infinity]])
    assert.throws(() => selectTestShard(files, index, count), RangeError);
  assert.throws(() => selectTestShard(null, 0, 1), TypeError);
});

test('composed source scan runs in exactly one mandatory patch shard', () => {
  const runner = readFileSync(new URL('../check-inkwave-patches.mjs', import.meta.url), 'utf8');
  assert.match(runner, /if \(vm\.SourceTextModule && shardIndex === 0\)/);
  assert.match(runner, /selectTestShard\(\[\], shardIndex, shardCount\)/);
});

test('real source inventory covers all CPU owners once and reserves browsers for core', async () => {
  const {discoverSourceTestFiles, BROWSER_SOURCE_TESTS} = await import('../lib/inkwave-test-shards.mjs');
  const {fileURLToPath} = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = discoverSourceTestFiles(root);
  assert.ok(files.length > 1400);
  assert.equal(files.length, new Set(files).size);
  for (const file of [
    'patches/splatoon3/tests/turf-finish.test.mjs',
    'patches/reliability/tests/start.test.mjs',
    'patches/network-replication/tests/queue-inkflight-owned-profile.test.mjs',
    'patches/local-quality/tests/catalog-charge-bot-release.test.mjs',
    'scripts/tests/inkwave-idle-resources-gates.test.mjs',
  ]) assert.ok(files.includes(file), file);
  for (const file of BROWSER_SOURCE_TESTS) assert.ok(!files.includes(file), file);
  const shards = Array.from({length: 8}, (_, index) => selectTestShard(files, index, 8));
  assert.deepEqual(shards.flat().sort(), files);
});
