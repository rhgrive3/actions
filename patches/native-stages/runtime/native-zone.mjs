/** Local zone calibration from reachable, live paint-floor samples.
 * Dimensions are world units, not recovered Nintendo rule placements. */
export function nativeZone(nodes, middle, step = 1, support = null) {
  const cells = new Map();
  for (const node of nodes) {
    const key = `${node.ix}:${node.iz}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(node.y);
  }
  // Search near the existing center so a narrow rim does not force every
  // stage into a tiny square. Navigation omits space occupied by props; a
  // floor probe can retain those interior obstacles without including void.
  const candidates = nodes.filter(n => Math.hypot(n.x - middle.x, n.z - middle.z) <= 6)
    .sort((a, b) => Math.hypot(a.x - middle.x, a.z - middle.z) - Math.hypot(b.x - middle.x, b.z - middle.z)
      || a.id - b.id).slice(0, 49);
  let best = { center: [middle.x, middle.y, middle.z], size: [step, step], score: -Infinity };
  for (const center of candidates) for (let rx = 1; rx <= 6; rx++) for (let rz = 1; rz <= 5; rz++) {
    const width = (2 * rx + 1) * step, depth = (2 * rz + 1) * step;
    const score = width * depth - Math.hypot(center.x - middle.x, center.z - middle.z) * 2;
    if (score <= best.score) continue;
    let supported = true, paintable = 0;
    for (let x = -rx; x <= rx && supported; x++) for (let z = -rz; z <= rz; z++) {
      const heights = cells.get(`${center.ix + x}:${center.iz + z}`);
      if (heights?.some(y => Math.abs(y - center.y) <= 0.5)) paintable++;
      else if (!support?.(center.x + x * step, center.y, center.z + z * step)) { supported = false; break; }
    }
    if (supported && paintable / ((2 * rx + 1) * (2 * rz + 1)) >= 0.7)
      best = { center: [center.x, center.y, center.z], size: [width, depth], score };
  }
  return { center: best.center, size: best.size };
}
