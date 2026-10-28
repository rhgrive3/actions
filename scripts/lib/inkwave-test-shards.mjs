import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_TEST_DIRECTORIES = [
  'patches/splatoon3/tests', 'patches/reliability/tests',
  'patches/network-replication/tests', 'patches/local-quality/tests',
];
// These two source files exercise a real browser and stay in validate_core,
// where Chromium is already installed. CPU shards never install browsers.
export const BROWSER_SOURCE_TESTS = [
  'patches/local-quality/tests/paint-mipmaps.test.mjs',
  'patches/local-quality/tests/settings-hud-queue.test.mjs',
];

export function discoverSourceTestFiles(root) {
  const walk = directory => fs.readdirSync(path.join(root, directory), {withFileTypes: true})
    .flatMap(entry => entry.isDirectory() ? walk(directory + '/' + entry.name)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [directory + '/' + entry.name] : []);
  const files = SOURCE_TEST_DIRECTORIES.flatMap(directory => {
    const tests = walk(directory);
    if (!tests.length) throw Error('Empty source test directory: ' + directory);
    return tests;
  }).filter(file => !BROWSER_SOURCE_TESTS.includes(file));
  const extra = 'scripts/tests/inkwave-idle-resources-gates.test.mjs';
  if (!fs.statSync(path.join(root, extra)).isFile()) throw Error('Missing source test: ' + extra);
  return [...files, extra].sort();
}

// Canonical sorted patch-test files are sharded by file, never by test case.
export function selectTestShard(files, shardIndex = 0, shardCount = 1) {
  if (!Array.isArray(files)) throw new TypeError('test files must be an array');
  if (!Number.isSafeInteger(shardCount) || shardCount < 1)
    throw new RangeError('shard count must be a positive integer');
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount)
    throw new RangeError('shard index must be within the configured shard count');
  return files.filter((_, index) => index % shardCount === shardIndex);
}


// Partition a single, already-selected shard without altering discovery,
// source order, test counts or membership. New Node coordinators release VM
// heaps between portions; acceptance requires every portion to exit 0.
export function batchSelectedTestFiles(files,maxSize=24){
 if(!Array.isArray(files)||!Number.isSafeInteger(maxSize)||maxSize<1)
   throw new TypeError('Invalid selected patch test batch');
 const chunks=[];
 for(let i=0;i<files.length;i+=maxSize)chunks.push(files.slice(i,i+maxSize));
 if(chunks.flat().length!==files.length||
    chunks.flat().some((file,i)=>file!==files[i]))
   throw new Error('Lost or reordered patch tests during batching');
 return chunks;
}
