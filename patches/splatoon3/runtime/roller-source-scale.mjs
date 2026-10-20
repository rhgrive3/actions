// Dimensions measured from the Roll material in KiTrix's pinned BFRES export,
// not derived from PaintParam. See reference/roller-source-scale-2026-10-19.json.
// The procedural shell keeps its authored proportions; this is not a native mesh.
// Player-relative model normalization is independent of gameplay distances.
// Mesh export coordinates are not gameplay distance coordinates. Normalize
// the source player's measured body/face height to this character's 1.36m
// standing height before applying weapon dimensions.
export const ROLLER_SOURCE_PLAYER_HEIGHT = 1.72259927;
export const ROLLER_CHARACTER_HEIGHT = 1.36;
export const ROLLER_MODEL_WORLD_SCALE = ROLLER_CHARACTER_HEIGHT / ROLLER_SOURCE_PLAYER_HEIGHT;
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
  return width * ROLLER_MODEL_WORLD_SCALE / current;
}
