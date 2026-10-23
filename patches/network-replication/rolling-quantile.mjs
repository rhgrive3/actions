// Keep the same dense chronological window and stable ascending order used by
// Array.sort, updating only the entering/leaving sample.
export function pushQuantileSample(values, ordered, value, limit = 60) {
  if (values.length >= limit) {
    const removed = values.shift();
    let at = 0; while (at < ordered.length && !Object.is(ordered[at], removed)) at++;
    ordered.copyWithin(at, at + 1); ordered.length--;
  }
  values.push(value);
  let at = ordered.length; ordered.push(value);
  while (at > 0 && ordered[at - 1] > value) { ordered[at] = ordered[at - 1]; at--; }
  ordered[at] = value;
}
export function orderedQuantile(ordered, q) {
  return ordered.length ? ordered[Math.min(ordered.length - 1, Math.floor(q * ordered.length))] : 0;
}
