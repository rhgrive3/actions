// Only suppress a redundant dirty flag, never a draw, dry step or CPU paint tick.
// Weak keys release the snapshot with its source-owned attribute. At most one
// active-prefix-sized Uint32 snapshot is retained per native Float32 attribute.
const snapshots = new WeakMap();
const resizableBuffer = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const value = (object, key) => Object.getOwnPropertyDescriptor(object, key)?.value;
const nativeMethod = (object, key, prototype) => {
  const base=Object.getOwnPropertyDescriptor(prototype,key), own=Object.getOwnPropertyDescriptor(object,key);
  return !!base&&'value' in base&&(!own||'value' in own&&own.value===base.value);
};
function nativeMark(attribute, vertexCount) {
  const range=attribute._paintRange||(attribute._paintRange={start:0,count:0});
  range.count=vertexCount*attribute.itemSize;
  attribute.clearUpdateRanges();
  attribute.updateRanges.push(range);
  attribute.needsUpdate = true;
}
export function markPaintAttributeRange(attribute, vertexCount, BufferAttribute) {
  let array, ranges, version, words, previous, range, count, itemSize, eligible = false;
  try {
    const proto = BufferAttribute?.prototype;
    array = value(attribute, 'array'); ranges = value(attribute, 'updateRanges'); version = value(attribute, 'version');
    itemSize=value(attribute,'itemSize'); range=value(attribute,'_paintRange');
    count=typeof vertexCount==='number'&&typeof itemSize==='number'?vertexCount*itemSize:undefined;
    eligible = !!proto && Object.getPrototypeOf(attribute) === proto &&
      nativeMethod(attribute,'clearUpdateRanges',proto) &&
      (!Object.hasOwn(attribute,'_paintRange') || !!range&&value(range,'start')===0&&Number.isSafeInteger(value(range,'count'))&&value(range,'count')>=0) &&
      nativeMethod(attribute,'onUploadCallback',proto) && !Object.hasOwn(attribute, 'needsUpdate') &&
      ArrayBuffer.isView(array) && Object.getPrototypeOf(array) === Float32Array.prototype && !Object.hasOwn(array,'buffer') && !Object.hasOwn(array,'byteOffset') && !Object.hasOwn(array,'length') && Object.getPrototypeOf(array.buffer) === ArrayBuffer.prototype && (!resizableBuffer || resizableBuffer.call(array.buffer) === false) &&
      Array.isArray(ranges) && Object.getPrototypeOf(ranges) === Array.prototype && nativeMethod(ranges,'push',Array.prototype) && Number.isSafeInteger(version) && version >= 0 &&
      Number.isSafeInteger(vertexCount) && vertexCount > 0 && Number.isSafeInteger(itemSize) && itemSize > 0 &&
      Number.isSafeInteger(count) && count > 0 && count <= array.length;
    if (eligible) {
      words = new Uint32Array(array.buffer, array.byteOffset, count);
      previous = snapshots.get(attribute);
      // Pending/foreign ranges or an outside version write always retain the
      // exact native upload path. Compare bits: NaN payloads and signed zero
      // must not be silently treated as equal numeric values.
      if (previous?.array === array && previous.range === range && previous.ranges === ranges && previous.itemSize === itemSize && previous.count === count && previous.version === version && value(range,'count') === count && ranges.length === 0) {
        let equal = true;
        for (let i = 0; i < count; i++) if (previous.words[i] !== words[i]) { equal = false; break; }
        if (equal) return false;
      }
    }
  } catch { eligible = false; }
  nativeMark(attribute, vertexCount);
  if (!eligible) { snapshots.delete(attribute); return true; }
  try {
    const copy = previous?.array === array && previous.words.length >= count ? previous.words : new Uint32Array(count);
    copy.set(words);
    snapshots.set(attribute, { array, ranges, itemSize, range:value(attribute,'_paintRange'), count, version: value(attribute,'version'), words: copy });
  } catch { snapshots.delete(attribute); }
  return true;
}
