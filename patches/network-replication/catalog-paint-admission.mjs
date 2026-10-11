const PAINT_RADIUS_KEYS = new Set([
  'PaintRadius',
  'PaintRadiusGround',
  'PaintRadiusShock',
  'CanopyPaintRadius',
  'PaintWidthHalf',
  'WidthHalf',
  'WidthHalfNear',
  'WidthHalfMiddle',
  'WidthHalfFar',
  'WidthHalfMin',
  'WidthHalfMax',
  'RadiusFullCharge',
  'RadiusMaxCharge',
  'RadiusMinCharge',
]);

const limits = new WeakMap();
function largestPaintRadius(parameters) {
  if (!parameters || typeof parameters !== 'object') return 0;
  if (limits.has(parameters)) return limits.get(parameters);
  let largest = 0;
  const visited = new WeakSet();

  function visit(value) {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (PAINT_RADIUS_KEYS.has(key)
        && typeof child === 'number'
        && Number.isFinite(child)
        && child > largest) {
        largest = child;
      }
      visit(child);
    }
  }

  visit(parameters);
  limits.set(parameters,largest);
  return largest;
}

export function catalogPaintRadiusLimit(nm, from) {
  if (!(nm?.byNid instanceof Map)) return 0;

  let largest = 0;
  for (const actor of nm.byNid.values()) {
    if (actor?.owner !== from) continue;
    const record = actor?.weapon?.catalogRecord;
    if (!record || record.legacy) continue;
    largest = Math.max(largest, largestPaintRadius(record.parameters));
  }
  return largest;
}
