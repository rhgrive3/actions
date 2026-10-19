// Dimensions measured from the Roll material in KiTrix's pinned BFRES export,
// not derived from PaintParam. See reference/roller-source-scale-2026-10-19.json.
// One model/source coordinate maps to one INKWAVE world coordinate. The
// procedural shell keeps its authored proportions; this is not a native mesh.
import { WORLD_UNITS_PER_SOURCE_UNIT } from './source-distance.mjs';
export const ROLLER_SOURCE_DRUM_WIDTH = Object.freeze({
  roller: 2.5712,
  's3-roller-compact': 2.5664,
  's3-roller-heavy': 2.5816,
  's3-roller-hunter': 2.6044,
  's3-roller-wide': 3.256,
});

export function rollerSourceModelScale(id, def) {
  const width = ROLLER_SOURCE_DRUM_WIDTH[id];
  if (!width || !def.drum) return 1;
  if (!def.drum.boundingBox) def.drum.computeBoundingBox();
  const box = def.drum.boundingBox, current = box.max.x - box.min.x;
  if (!(current > 0)) throw Error('Invalid roller drum geometry: ' + id);
  return width * WORLD_UNITS_PER_SOURCE_UNIT / current;
}
