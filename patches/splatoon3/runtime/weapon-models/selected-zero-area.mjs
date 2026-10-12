// Opt-in for the six reviewed Splatana/Stringer builders only. Keep every vertex
// and attribute: farGeometry clusters even unreferenced vertices and averages
// their normals, so vertex compaction would change the far-tier surface.
import { rebuild } from './kit.mjs';

export function removeZeroAreaTriangles(geometry, farTarget = 0) {
  const index = geometry?.index, position = geometry?.attributes?.position;
  if (!index || !position || index.count % 3) return geometry;
  const { start, count } = geometry.drawRange;
  if (start % 3 || (Number.isFinite(count) && count % 3) ||
      geometry.groups.some(g => g.start % 3 || g.count % 3)) return geometry;
  const input = index.array, output = new input.constructor(input.length);
  const before = new Uint32Array(input.length + 1);
  let length = 0;
  for (let i = 0; i < input.length; i += 3) {
    before[i] = length;
    const a = input[i], b = input[i + 1], c = input[i + 2];
    const ux = position.getX(b) - position.getX(a), uy = position.getY(b) - position.getY(a), uz = position.getZ(b) - position.getZ(a);
    const vx = position.getX(c) - position.getX(a), vy = position.getY(c) - position.getY(a), vz = position.getZ(c) - position.getZ(a);
    // No epsilon, welding, normal recomputation, or silhouette simplification.
    if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) continue;
    output[length++] = a; output[length++] = b; output[length++] = c;
  }
  before[input.length] = length;
  // Native invisible compatibility channels deliberately contain one triangle.
  if (!length || length === input.length) return geometry;
  // Preserve farGeometry's decimation admission. In particular Tri-Stringer's
  // static ink is 360 triangles before cleanup and 240 after; cleaning it would
  // make the assembled ink cross the native 300-triangle far-tier threshold.
  if (farTarget && input.length / 3 > farTarget && length / 3 <= farTarget) return geometry;
  const next = index.clone(); next.array = output.slice(0, length); next.count = length;
  geometry.setIndex(next);
  for (const group of geometry.groups) {
    const end = Math.min(input.length, group.start + group.count);
    group.count = before[end] - before[group.start]; group.start = before[group.start];
  }
  geometry.setDrawRange(before[Math.min(start, input.length)], Number.isFinite(count)
    ? before[Math.min(input.length, start + count)] - before[Math.min(start, input.length)] : count);
  return geometry;
}

export function rebuildSelected(d, spec) {
  rebuild(d, spec);
  removeZeroAreaTriangles(d.body, 700);
  removeZeroAreaTriangles(d.ink, 300);
  for (const geometry of new Set([d.drum, d.drumCaps, d.glow,
    ...Object.values(d.parts || {}).map(part => part.src)])) removeZeroAreaTriangles(geometry);
  return d;
}
