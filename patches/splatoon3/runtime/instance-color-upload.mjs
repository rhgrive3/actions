// Instanced colors are static across many animation frames. Compare the stored
// Float32 values after the native write, then retain dirty GPU ranges across
// culled frames until Three has consumed them.
export function setTrackedInstanceColor(mesh, index, color) {
  const values = mesh.instanceColor?.array, at = index * 3;
  const r = values?.[at], g = values?.[at + 1], b = values?.[at + 2];
  mesh.setColorAt(index, color);
  const after = mesh.instanceColor.array;
  if (!values || !Object.is(r, after[at]) || !Object.is(g, after[at + 1]) || !Object.is(b, after[at + 2])) {
    mesh._s3ColorStart = Math.min(mesh._s3ColorStart ?? Infinity, at);
    mesh._s3ColorEnd = Math.max(mesh._s3ColorEnd ?? 0, at + 3);
  }
}
export function uploadTrackedInstanceColors(mesh) {
  let start = mesh._s3ColorStart ?? Infinity, end = mesh._s3ColorEnd ?? 0;
  if (!(end > start)) return false;
  const attr = mesh.instanceColor;
  for (const pending of attr.updateRanges) {
    if (pending.count < 0) { start = 0; end = attr.array.length; break; }
    start = Math.min(start, pending.start); end = Math.max(end, pending.start + pending.count);
  }
  const range = attr._s3InkColorRange || (attr._s3InkColorRange = { start: 0, count: 0 });
  range.start = start; range.count = end - start;
  attr.updateRanges.length = 0; attr.updateRanges.push(range); attr.needsUpdate = true;
  mesh._s3ColorStart = Infinity; mesh._s3ColorEnd = 0;
  return true;
}

export function markAttributeRange(attr, start, end) {
  if (!(end > start)) return false;
  for (const pending of attr.updateRanges) {
    if (pending.count < 0) { start = 0; end = attr.array.length; break; }
    start = Math.min(start, pending.start); end = Math.max(end, pending.start + pending.count);
  }
  const range = attr._s3DirtyRange || (attr._s3DirtyRange = { start: 0, count: 0 });
  range.start = start; range.count = end - start;
  attr.updateRanges.length = 0; attr.updateRanges.push(range); attr.needsUpdate = true;
  return true;
}
