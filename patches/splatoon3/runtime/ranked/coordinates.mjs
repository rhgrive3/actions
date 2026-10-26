// Snapshot/restore coordinates are ordinary JSON arrays. Preserve slice's
// eager reads and hole handling, including inherited numeric entries. Keep
// custom slices, subclasses and custom species on the compatibility path.
export function firstThreeFinite(value) {
  return finiteTripleAt(value, 0, Number.isFinite);
}
export function finiteTripleAt(value, offset, finite) {
  if (!Array.isArray(value) || value.length < offset + 3) return false;
  if (value.slice !== Array.prototype.slice || value.constructor !== Array ||
      Array[Symbol.species] !== Array) return value.slice(offset, offset + 3).every(finite);
  const hasX = offset in value, x = hasX ? value[offset] : undefined;
  const hasY = offset + 1 in value, y = hasY ? value[offset + 1] : undefined;
  const hasZ = offset + 2 in value, z = hasZ ? value[offset + 2] : undefined;
  return (!hasX || finite(x)) && (!hasY || finite(y)) && (!hasZ || finite(z));
}
