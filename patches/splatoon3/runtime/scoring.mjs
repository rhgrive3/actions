// Weight each exposed floor cell by its actual area; walls/occluded cells
// continue to render paint but cannot alter the Turf War judge.
//
// The live HUD (turf lead / team snapshot) asks for coverage every frame, and
// the cache below follows point-eligible turf writes. Wall-only ownership still
// advances the global paint version without rescanning turf. Faces, weights and occlusion are
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
  let ordered = true;
  for (let k = 1; k < cells.length; k++) if (cells[k] <= cells[k - 1]) { ordered = false; break; }
  return (paint._s3CoverageIndex = { grid: paint.grid, dead: paint.dead, faces: paint.paintFaces, cells, weights, area, ordered, bitsValid: false });
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
function sparseCoverageIndex(index) {
  const { cells, grid } = index, words = new Uint32Array(Math.ceil(cells.length / 32));
  const groups = new Uint32Array(Math.ceil(words.length / 32)); let painted = 0;
  for (let i = 0; i < cells.length; i++) if (grid[cells[i]] === 1 || grid[cells[i]] === 2) {
    const word = i >>> 5; words[word] |= 1 << (i & 31); groups[word >>> 5] |= 1 << (word & 31); painted++;
  }
  index.words = words; index.groups = groups; index.painted = painted;
  index.bitsValid = true; index.sparseEnabled = index.ordered && painted < cells.length / 4;
}
// Called only after an authoritative individual cell write. Row endpoints are
// insufficient: never infer intermediate ownership from minimap dirty bounds.
export function noteCoverageCell(paint, cell, value) {
  const index = paint._s3CoverageIndex;
  if (!index?.bitsValid || !index.sparseEnabled) return;
  if (index.grid !== paint.grid || index.dead !== paint.dead || index.faces !== paint.paintFaces || paint._s3ObservedPaintVersion !== paint.version) { index.bitsValid = false; return; }
  const cells = index.cells; let lo = 0, hi = cells.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (cells[mid] < cell) lo = mid + 1; else hi = mid; }
  if (cells[lo] !== cell) return;
  const word = lo >>> 5, bit = 1 << (lo & 31), old = index.words[word], occupied = value === 1 || value === 2;
  const next = occupied ? old | bit : old & ~bit;
  if ((next >>> 0) === old) return;
  index.words[word] = next; index.painted += occupied ? 1 : -1;
  const group = word >>> 5, wordBit = 1 << (word & 31);
  if (next) index.groups[group] |= wordBit; else index.groups[group] &= ~wordBit;
  // Dense coverage retains the original linear scan and pays no per-cell
  // binary search thereafter. A clear/rebuild/unknown writer requalifies it.
  if (index.painted >= cells.length / 4) index.sparseEnabled = false;
}
export function indexedFloorCoverage(paint, tracked = false) {
  const index = coverageIndex(paint), { cells, weights, area } = index, grid = paint.grid;
  let t0 = 0, t1 = 0;
  if (tracked && !index.bitsValid) sparseCoverageIndex(index);
  if (tracked && index.sparseEnabled) {
    for (let g = 0; g < index.groups.length; g++) {
      let group = index.groups[g];
      while (group) {
        const word = g * 32 + 31 - Math.clz32(group & -group); let bits = index.words[word];
        while (bits) {
          const i = word * 32 + 31 - Math.clz32(bits & -bits), team = grid[cells[i]];
          if (team === 1) t0 += weights[i]; else if (team === 2) t1 += weights[i];
          bits &= bits - 1;
        }
        group &= group - 1;
      }
    }
  } else for (let i = 0; i < cells.length; i++) {
    const team = grid[cells[i]];
    if (team === 1) t0 += weights[i];
    else if (team === 2) t1 += weights[i];
  }
  return area > 0 ? [t0 / area, t1 / area] : [0, 0];
}
// A version change outside the known writers remains a full invalidation. This
// includes clear, grid rebuilds and extensions that only know the public token.
function observePaintVersion(paint) {
  if (paint._s3ObservedPaintVersion !== paint.version) {
    if (paint._s3CoverageIndex) paint._s3CoverageIndex.bitsValid = false;
    paint._s3TurfVersion = (paint._s3TurfVersion || 0) + 1;
    paint._s3ObservedPaintVersion = paint.version;
  }
}
export function notePaintMutation(paint, turfChanged, coverageTracked = false) {
  observePaintVersion(paint);
  if (!coverageTracked && paint._s3CoverageIndex) paint._s3CoverageIndex.bitsValid = false;
  if (turfChanged) paint._s3TurfVersion++;
  paint.version++;
  paint._s3ObservedPaintVersion = paint.version;
}
export function installScoring({ PaintSystem }) {
  PaintSystem.prototype.coverage = function (out = null) {
    observePaintVersion(this);
    if (this._s3CoverageVersion !== this._s3TurfVersion || this._s3CoverageGrid !== this.grid ||
        this._s3CoverageDead !== this.dead || this._s3CoverageFaces !== this.paintFaces) {
      this._s3Coverage = indexedFloorCoverage(this, true);
      this._s3CoverageVersion = this._s3TurfVersion; this._s3CoverageGrid = this.grid;
      this._s3CoverageDead = this.dead; this._s3CoverageFaces = this.paintFaces;
    }
    if (out) { out[0] = this._s3Coverage[0]; out[1] = this._s3Coverage[1]; out.length = 2; return out; }
    return this._s3Coverage.slice();
  };
}
