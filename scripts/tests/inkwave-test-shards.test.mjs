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
    'patches/splatoon3/tests/paint-run-coalescing.test.mjs',
    'patches/splatoon3/tests/special-ink-glint.test.mjs',
    'patches/splatoon3/tests/remaining-combat-prewarm.test.mjs',
    'patches/reliability/tests/start.test.mjs',
    'patches/network-replication/tests/queue-inkflight-owned-profile.test.mjs',
    'patches/local-quality/tests/catalog-charge-bot-release.test.mjs',
    'scripts/tests/inkwave-idle-resources-gates.test.mjs',
  ]) assert.ok(files.includes(file), file);
  for (const file of BROWSER_SOURCE_TESTS) assert.ok(!files.includes(file), file);
  const shards = Array.from({length: 8}, (_, index) => selectTestShard(files, index, 8));
  assert.deepEqual(shards.flat().sort(), files);
});

test('isolated actor lane preserves every original non-actor assignment', async () => {
  const {selectIsolatedTestShard} = await import('../lib/inkwave-test-shards.mjs');
  const files = Array.from({length: 37}, (_, i) => 'test-' + i);
  const actor = files[18];
  const old = Array.from({length: 8}, (_, i) => selectTestShard(files, i, 8));
  const next = Array.from({length: 9}, (_, i) => selectIsolatedTestShard(files, i, 9, [actor]));
  assert.deepEqual(next[8], [actor]);
  for (let i = 0; i < 8; i++) assert.deepEqual(next[i], old[i].filter(file => file !== actor));
  assert.equal(new Set(next.flat()).size, files.length);
  assert.deepEqual(next.flat().sort(), files.slice().sort());
  for (const count of [2, 4, 9]) {
    const shards = Array.from({length: count}, (_, i) => selectIsolatedTestShard(files, i, count, [actor]));
    assert.deepEqual(shards.flat().sort(), files.slice().sort());
    assert.equal(shards.flat().filter(file => file === actor).length, 1);
  }
});
test('isolated partitions reject missing or duplicate files and invalid lanes', async () => {
  const {selectIsolatedTestShard: select} = await import('../lib/inkwave-test-shards.mjs');
  const files = ['a', 'b', 'c'];
  for (const isolated of [[], ['missing'], ['a', 'a'], null])
    assert.throws(() => select(files, 0, 3, isolated));
  assert.throws(() => select(['a', 'a'], 0, 3, ['a']));
  assert.throws(() => select(files, 0, 1, ['a']));
  assert.throws(() => select(files, 3, 3, ['a']));
});

test('runner isolation flag is explicit and rejects typo values without losing actor', async () => {
  const {selectIsolatedTestShard} = await import('../lib/inkwave-test-shards.mjs');
  const runner = readFileSync(new URL('../check-inkwave-patches.mjs', import.meta.url), 'utf8');
  const start = runner.indexOf('  const isolationFlag =');
  const end = runner.indexOf('  if (!shardFiles.length)', start);
  assert.ok(start >= 0 && end > start, 'actual runner selection block must exist');
  const choose = new Function('process', 'selectIsolatedTestShard', 'selectTestShard', 'files', 'path', 'PATCH_ROOT', 'shardIndex', 'shardCount', runner.slice(start, end) + '\nreturn shardFiles;');
  const actor = 'patches/splatoon3/tests/rainmaker-model-actor.test.mjs';
  const files = Array.from({length: 37}, (_, i) => i === 18 ? actor : 'test-' + i);
  const path = {join: (...parts) => parts.join('/')};
  const run = (flag, index, count) => choose({env: flag === undefined ? {} : {INKWAVE_TEST_ISOLATE_RAINMAKER: flag}}, selectIsolatedTestShard, selectTestShard, files, path, 'patches/splatoon3', index, count);
  for (const count of [4, 8, 9]) {
    const shards = Array.from({length: count}, (_, i) => run(undefined, i, count));
    assert.deepEqual(shards.flat().sort(), files.slice().sort());
    for (let i = 0; i < count; i++) assert.deepEqual(shards[i], selectTestShard(files, i, count));
  }
  assert.deepEqual(run('1', 8, 9), [actor]);
  for (const flag of ['', '0', 'true', 'rainmaker'])
    assert.throws(() => run(flag, 0, 9), /must be unset or 1/);
  assert.throws(() => run('1', 0, 1));
  assert.throws(() => run('1', 9, 9));
});
