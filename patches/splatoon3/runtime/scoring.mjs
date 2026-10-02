// Weight each exposed floor cell by its actual area; walls/occluded cells
// continue to render paint but cannot alter the Turf War judge.
export function floorCoverage(paint) {
  const totals = [0, 0]; let area = 0;
  for (const f of paint.paintFaces) {
    if (!f.turf) continue;
    const weight = f.cu * f.cv;
    for (let k = f.grid; k < f.grid + f.nu * f.nv; k++) {
      if (paint.dead[k]) continue;
      area += weight;
      const team = paint.grid[k];
      if (team === 1 || team === 2) totals[team - 1] += weight;
    }
  }
  return area > 0 ? totals.map(value => value / area) : [0, 0];
}
export function installScoring({ PaintSystem }) {
  PaintSystem.prototype.coverage = function () {
    if (this._s3CoverageVersion !== this.version || this._s3CoverageGrid !== this.grid) {
      this._s3Coverage = floorCoverage(this);
      this._s3CoverageVersion = this.version; this._s3CoverageGrid = this.grid;
    }
    return this._s3Coverage.slice();
  };
}
