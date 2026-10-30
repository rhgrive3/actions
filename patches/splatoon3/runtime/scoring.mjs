// Weight each exposed floor cell by its actual area; walls/occluded cells
// continue to render paint but cannot alter the Turf War judge.
//
// The live HUD (turf lead / team snapshot) asks for coverage every frame, and
// the cache below follows point-eligible turf writes. Wall-only ownership still
// advances the global paint version without rescanning turf. Faces, weights and occlusion are
// static for a grid, so their cell list is built once per grid and the scan
// only reads team ownership. Cells are visited in the original face/cell order
// with the original per-face weight, so every sum is bit-identical.
const PREFIX_SHIFT = 8, PREFIX_GROUPS = 1 << PREFIX_SHIFT;
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const ELIGIBLE_WORD_MASKS = Uint32Array.from({ length: 16 }, (_, mask) => {
  let word = 0;
  for (let byte = 0; byte < 4; byte++) if (mask & 1 << byte) word |= 255 << (LITTLE_ENDIAN ? byte * 8 : (3 - byte) * 8);
  return word >>> 0;
});
const TYPED_ARRAY = Object.getPrototypeOf(Uint8Array.prototype);
const typedKind = Object.getOwnPropertyDescriptor(TYPED_ARRAY, Symbol.toStringTag).get;
const typedLength = Object.getOwnPropertyDescriptor(TYPED_ARRAY, 'length').get;
const typedByteLength = Object.getOwnPropertyDescriptor(TYPED_ARRAY, 'byteLength').get;
const typedBuffer = Object.getOwnPropertyDescriptor(TYPED_ARRAY, 'buffer').get;
const typedOffset = Object.getOwnPropertyDescriptor(TYPED_ARRAY, 'byteOffset').get;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;

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
  const index = coverageIndex(paint), grid = paint.grid;
  return scanFloorCoverage(index, grid);
}
function scanFloorCoverage({ cells, weights, area }, grid) {
  let t0 = 0, t1 = 0;
  for (let i = 0; i < cells.length; i++) {
    const team = grid[cells[i]];
    if (team === 1) t0 += weights[i];
    else if (team === 2) t1 += weights[i];
  }
  return area > 0 ? [t0 / area, t1 / area] : [0, 0];
}

// The public grid can be changed without advancing its version. A known writer
// must therefore still observe earlier, unannounced writes when it publishes a
// later turf change. Verify the entire reused prefix against its last ownership
// snapshot; a writer's reported bounds alone cannot establish that it is clean.
// Compare each source word with its eligible-byte mask, including partial words
// around gaps. Unusual/publicly supplied arrays retain indexedFloorCoverage.
// No floating-point block sums are combined.
function coverageReplay(index, grid) {
  if (!ArrayBuffer.isView(grid) || Object.getPrototypeOf(grid) !== Uint8Array.prototype ||
      typedKind.call(grid) !== 'Uint8Array' ||
      Object.hasOwn(grid, 'buffer') || Object.hasOwn(grid, 'byteOffset') ||
      Object.hasOwn(grid, 'byteLength') || Object.hasOwn(grid, 'length')) return null;
  const length = typedLength.call(grid), buffer = typedBuffer.call(grid), offset = typedOffset.call(grid);
  if (typedByteLength.call(grid) !== length || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
      !length || length > 0x40000000 || offset % 4) return null;
  // Prototype substitution does not change the intrinsic ArrayBuffer brand.
  // In particular, a disguised SharedArrayBuffer must retain the full scan.
  try {
    if (bufferResizable?.call(buffer) || bufferLength.call(buffer) < offset + length) return null;
  } catch { return null; }
  const cached = index.replay;
  if (cached === null) return null;
  if (cached && cached.length === length) return cached;
  const { cells } = index, groups = [], starts = [], wholeWords = Math.floor(length / 4);
  for (let i = 0; i < cells.length;) {
    const cell = cells[i];
    // Non-monotonic/overlapping public faces keep the full original scan.
    if (cell < 0 || cell >= length || cell >>> 2 >= wholeWords || i && cell <= cells[i - 1]) return (index.replay = null);
    const word = cell >>> 2, start = i; let mask = 0;
    do {
      if (i && cells[i] <= cells[i - 1]) return (index.replay = null);
      mask |= 1 << (cells[i] & 3); i++;
    } while (i < cells.length && cells[i] >>> 2 === word);
    groups.push(word * 16 + mask); starts.push(start);
  }
  const checkpoints = Math.ceil(groups.length / PREFIX_GROUPS);
  return (index.replay = { length, words: new Uint32Array(buffer, offset, wholeWords),
    groups: Uint32Array.from(groups), starts: Int32Array.from(starts), ownership: new Uint32Array(groups.length),
    prefix0: new Float64Array(checkpoints), prefix1: new Float64Array(checkpoints), valid: false, t0: 0, t1: 0 });
}

function replayFloorCoverage(index, grid, full) {
  const replay = grid === index.grid ? coverageReplay(index, grid) : null;
  if (!replay) return scanFloorCoverage(index, grid);
  const { groups, words, ownership, starts, prefix0, prefix1 } = replay;
  const { weights, area } = index;
  let first = 0;
  if (!full && replay.valid) {
    for (; first < groups.length; first++) {
      const group = groups[first], value = (words[group >>> 4] & ELIGIBLE_WORD_MASKS[group & 15]) >>> 0;
      if (value !== ownership[first]) break;
    }
    if (first === groups.length) return area > 0 ? [replay.t0 / area, replay.t1 / area] : [0, 0];
  }
  const checkpoint = first >>> PREFIX_SHIFT, start = checkpoint * PREFIX_GROUPS;
  let t0 = start ? prefix0[checkpoint] : 0, t1 = start ? prefix1[checkpoint] : 0;
  for (let g = start; g < groups.length; g++) {
    if (!(g % PREFIX_GROUPS)) { prefix0[g >>> PREFIX_SHIFT] = t0; prefix1[g >>> PREFIX_SHIFT] = t1; }
    const group = groups[g], mask = group & 15, value = (words[group >>> 4] & ELIGIBLE_WORD_MASKS[mask]) >>> 0;
    ownership[g] = value;
    // Most native turf is still unpainted. An all-zero word contributes no
    // additions, so skip all of its original zero-team tests together.
    if (value === 0) continue;
    let i = starts[g];
    for (let byte = 0; byte < 4; byte++) {
      if (!(mask & 1 << byte)) continue;
      const team = value >>> (LITTLE_ENDIAN ? byte * 8 : (3 - byte) * 8) & 255;
      if (team === 1) t0 += weights[i];
      else if (team === 2) t1 += weights[i];
      i++;
    }
  }
  replay.valid = true; replay.t0 = t0; replay.t1 = t1;
  return area > 0 ? [t0 / area, t1 / area] : [0, 0];
}
// A version change outside the known writers remains a full invalidation. This
// includes clear, grid rebuilds and extensions that only know the public token.
function observePaintVersion(paint) {
  if (paint._s3ObservedPaintVersion !== paint.version) {
    paint._s3TurfVersion = (paint._s3TurfVersion || 0) + 1;
    paint._s3ObservedPaintVersion = paint.version;
    paint._s3CoverageFullScan = true;
  }
}
export function notePaintMutation(paint, turfChanged) {
  observePaintVersion(paint);
  if (turfChanged) paint._s3TurfVersion++;
  paint.version++;
  paint._s3ObservedPaintVersion = paint.version;
}
export function installScoring({ PaintSystem }) {
  PaintSystem.prototype.coverage = function (out = null) {
    observePaintVersion(this);
    if (this._s3CoverageVersion !== this._s3TurfVersion || this._s3CoverageGrid !== this.grid ||
        this._s3CoverageDead !== this.dead || this._s3CoverageFaces !== this.paintFaces) {
      // Capture the same index/grid reads as indexedFloorCoverage. Comparing
      // identities through the captured index avoids extra public getter reads.
      const index = coverageIndex(this), grid = this.grid;
      const full = this._s3CoverageFullScan || this._s3CoverageGrid !== index.grid ||
        this._s3CoverageDead !== index.dead || this._s3CoverageFaces !== index.faces;
      this._s3Coverage = replayFloorCoverage(index, grid, full);
      this._s3CoverageFullScan = false;
      this._s3CoverageVersion = this._s3TurfVersion; this._s3CoverageGrid = this.grid;
      this._s3CoverageDead = this.dead; this._s3CoverageFaces = this.paintFaces;
    }
    if (out) { out[0] = this._s3Coverage[0]; out[1] = this._s3Coverage[1]; out.length = 2; return out; }
    return this._s3Coverage.slice();
  };
}
