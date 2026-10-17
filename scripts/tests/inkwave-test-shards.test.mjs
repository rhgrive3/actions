import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTestShard } from '../lib/inkwave-test-shards.mjs';

test('every discovered patch test belongs to exactly one shard', () => {
  const files = Array.from({length: 157}, (_, i) => `patches/tests/${String(i).padStart(3,'0')}.test.mjs`);
  for (const count of [1, 2, 4, 7]) {
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
