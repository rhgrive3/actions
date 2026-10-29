// Only freshly allocated scalar samples from RankedWorld may skip repeat
// descriptor reads. Custom frozen arrays/proxies retain their original path.
const ownedPairs = new WeakSet();
export function createZoneCoveragePair(a, b) {
  const pair = Object.freeze([a, b]);
  ownedPairs.add(pair);
  return pair;
}
export const isOwnedZoneCoveragePair = pair => ownedPairs.has(pair);
