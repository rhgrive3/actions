// Weight each exposed floor cell by its actual area; walls/occluded cells
// continue to render paint but cannot alter the Turf War judge.
//
// The live HUD (turf lead / team snapshot) asks for coverage every frame, and
// the cache below is invalidated by every paint write, so this scan runs on
// nearly every frame of active painting. Faces, weights and occlusion are
// static for a grid, so their cell list is built once per grid and the scan
// only reads team ownership. Cells are visited in the original face/cell order
// with the original per-face weight, so every sum is bit-identical.
function coverageIndex(paint) {
  const cached = paint._s3CoverageIndex;
  if (cached && cached.grid === paint.grid && cached.dead === paint.dead && cached.faces === paint.paintFaces) return cached;
  let n = 0;
  for (const f of paint.paintFaces) {
    if (!f.turf) continue;
    for (let k = f.grid; k < f.grid + f.nu * f.nv; k++) if (!paint.dead[k]) n++;
  }
  const cells = new Int32Array(n), weights = new Float64Array(n);
  let area = 0, i = 0;
  for (const f of paint.paintFaces) {
    if (!f.turf) continue;
    const weight = f.cu * f.cv * Math.max(0, f.n.y);
    for (let k = f.grid; k < f.grid + f.nu * f.nv; k++) {
      if (paint.dead[k]) continue;
      area += weight;
      cells[i] = k; weights[i] = weight; i++;
    }
  }
  return (paint._s3CoverageIndex = { grid: paint.grid, dead: paint.dead, faces: paint.paintFaces, cells, weights, area });
}
export function floorCoverage(paint) {
  const totals = [0, 0]; let area = 0;
  for (const f of paint.paintFaces) {
    if (!f.turf) continue;
    const weight = f.cu * f.cv * Math.max(0, f.n.y);
    for (let k = f.grid; k < f.grid + f.nu * f.nv; k++) {
      if (paint.dead[k]) continue;
      area += weight;
      const team = paint.grid[k];
      if (team === 1 || team === 2) totals[team - 1] += weight;
    }
  }
  return area > 0 ? totals.map(value => value / area) : [0, 0];
}
// PaintSystem builds `dead` once with its grid, so the live path may reuse the
// static cell index (identical result, see coverageIndex).
export function indexedFloorCoverage(paint) {
  const { cells, weights, area } = coverageIndex(paint), grid = paint.grid;
  let t0 = 0, t1 = 0;
  for (let i = 0; i < cells.length; i++) {
    const team = grid[cells[i]];
    if (team === 1) t0 += weights[i];
    else if (team === 2) t1 += weights[i];
  }
  return area > 0 ? [t0 / area, t1 / area] : [0, 0];
}
export function installScoring({ PaintSystem }) {
  PaintSystem.prototype.coverage = function () {
    if (this._s3CoverageVersion !== this.version || this._s3CoverageGrid !== this.grid) {
      this._s3Coverage = indexedFloorCoverage(this);
      this._s3CoverageVersion = this.version; this._s3CoverageGrid = this.grid;
    }
    return this._s3Coverage.slice();
  };
}
