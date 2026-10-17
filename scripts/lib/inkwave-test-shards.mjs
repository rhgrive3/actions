// Canonical sorted patch-test files are sharded by file, never by test case.
export function selectTestShard(files, shardIndex = 0, shardCount = 1) {
  if (!Array.isArray(files)) throw new TypeError('test files must be an array');
  if (!Number.isSafeInteger(shardCount) || shardCount < 1)
    throw new RangeError('shard count must be a positive integer');
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount)
    throw new RangeError('shard index must be within the configured shard count');
  return files.filter((_, index) => index % shardCount === shardIndex);
}
