// A restored WebGL context returns a blank paint atlas while the CPU turf survives (#1642).
//
// PaintSystem keeps two stores: the gameplay grid on the CPU (cell ownership, swimming, scoring, coverage)
// and the painted look in a GPU render target. Quads are transient and finished splats are dropped, so
// nothing can replay the old ink after the GPU lost it: the arena looks unpainted while the game still
// treats it as ink and scores it. The grid is the authority, so the atlas is rebuilt from it: every owned,
// live cell is drawn as a fully grown disc of its owner's colour in that cell's atlas rectangle.
//
// What comes back is the ownership at the grid's resolution (0.25 m cells), not the original splat
// outlines, rays, droplets or drips: those were never stored and are finer than the gameplay grid.
// Scoring, ownership order and the grid itself are not touched.
//
// It goes through the normal quad queue (_pushQuad / _drawQuads), so a hidden page defers the work like any
// other paint and the mip chain and drying follow the existing policy.

const K_SPECK = 7;               // settled round disc in the paint shader (no rays, droplets or drips)
const DISC_PER_CELL = 0.85;      // disc radius in cells; the shader edge wobbles by up to 12 %, so this still reaches the corners
const QUAD_REACH = 1.45;         // quad half extent in disc radii, room for the soft edge
const SETTLED = 3;               // growth clock past the end of the spread
const DRY_SECONDS = 6.5;         // restored ink dries on the normal schedule instead of staying glossy

function cellSeed(index) { return ((Math.imul(index + 1, 2654435761) >>> 0) / 4294967296); }

// Returns the number of cells drawn. Safe to call repeatedly: the atlas only ever gains the same ink.
export function restorePaintFromGrid(paint) {
  const faces = paint?.paintFaces, grid = paint?.grid, dead = paint?.dead;
  if (!faces || !grid || typeof paint._pushQuad !== 'function' || typeof paint._drawQuads !== 'function') return 0;
  let cells = 0;
  for (const face of faces) {
    const radius = Math.max(face.cu, face.cv) * DISC_PER_CELL, reach = radius * QUAD_REACH;
    for (let j = 0; j < face.nv; j++) {
      for (let i = 0; i < face.nu; i++) {
        const index = face.grid + j * face.nu + i, owner = grid[index];
        if (!owner || dead?.[index]) continue;
        const lu = (i + 0.5) * face.cu, lv = (j + 0.5) * face.cv;
        paint._pushQuad(face, lu - reach, lu + reach, lv - reach, lv + reach, lu, lv, 0, radius,
          owner - 1, cellSeed(index), K_SPECK, 0, 0, 0, SETTLED, 1, 0);
        cells++;
      }
    }
  }
  if (!cells) return 0;
  if (!paint.level?.native) { paint._mipsDirty = true; paint._mipRequested = true; }
  paint._wetUntil = Math.max(paint._wetUntil || 0, (paint.clock || 0) + DRY_SECONDS);
  paint._drawQuads();
  paint.gridRestoreCount = (paint.gridRestoreCount || 0) + 1;
  return cells;
}

export function installPaintContextRestore(PaintSystem) {
  if (PaintSystem.prototype.restoreFromGrid) return;
  PaintSystem.prototype.restoreFromGrid = function restoreFromGrid() { return restorePaintFromGrid(this); };
}
