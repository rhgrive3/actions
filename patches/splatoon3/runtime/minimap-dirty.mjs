// Issue #895: the live minimap consumed PaintSystem.version as a global
// invalidation flag only, so a single localized splat still triggered a
// whole-map raster refresh (two CPU passes over W*H plus two full-width
// putImageData calls) every 150 ms.
//
// This helper records the map-space bounds of the cells the paint grid actually
// changed and redraws only the affected pixel rectangle, with the emboss /
// bilinear halo needed for identical edges. It stays inside the owned runtime
// layer: the public minimap/paint sources only gain two tiny adapter hooks.
//
//   paint side   PaintSystem.prototype._inkMark(f, i, j) is called by the
//                adapter-injected line at the exact grid-ownership write in
//                _cpuSplat(). Only turf cells that own minimap pixels mark.
//   minimap side Minimap.prototype._drawDirtyInk(rec) maps the coalesced
//                bounds to a pixel rectangle; _drawInk() itself is the single
//                raster implementation and just gains an x range, so a partial
//                refresh is structurally identical to a whole-map refresh.
//
// Full invalidation (initial build, viewer-team flip, theme/team-colour change,
// stage rebuild, PaintSystem.clear()) keeps using the existing 3-band whole-map
// path, and Minimap OFF (tickHidden) never touches the raster or the Canvas2D
// composite.

// the emboss pass reads the diagonal neighbour at ±(W+1), so the written
// rectangle needs one pixel of margin on every side
const HALO = 1;
// one cell plus the centre-to-corner offset: covers the bilinear stencil of the
// changed cell (its immediate u/v neighbours) and the emboss edge
const CELL_PAD = 2;
const BANDS = 3;

export function _emptyInkDirty() {
  return { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, gen: 0, full: false };
}

export function installMinimapDirty(context) {
  const { Minimap, PaintSystem } = context;
  if (!Minimap || !PaintSystem) return;
  const proto = Minimap.prototype;
  if (proto._drawDirtyInk) return;

  // ---- paint side: real map-space dirty bounds of the changed cells
  if (!PaintSystem.prototype._inkMark) {
    PaintSystem.prototype._inkMark = function (f, i, j) {
      if (!f.turf) return;                                   // non-turf faces have no minimap pixels
      if (this.dead && this.dead[f.grid + j * f.nu + i]) return;
      const du = (i + 0.5) * f.cu, dv = (j + 0.5) * f.cv;
      const x = f.origin.x + f.u.x * du + f.v.x * dv;
      const z = f.origin.z + f.u.z * du + f.v.z * dv;
      let d = this.inkDirty;
      if (!d) d = this.inkDirty = _emptyInkDirty();
      if (x < d.x0) d.x0 = x;
      if (x > d.x1) d.x1 = x;
      if (z < d.z0) d.z0 = z;
      if (z > d.z1) d.z1 = z;
      d.gen++;
    };
  }

  // ---- minimap side: bounded partial redraw
  proto._drawDirtyInk = function (rec) {
    const W = this.w, H = this.h, gen = rec.gen;
    const empty = !(rec.x1 >= rec.x0) || !(rec.z1 >= rec.z0);
    if (!empty) {
      const pad = (this.paint.cell || 0.25) * CELL_PAD;
      const a = this.toCanvas(rec.x0 - pad, rec.z0 - pad, { x: 0, y: 0 });
      const b = this.toCanvas(rec.x1 + pad, rec.z1 + pad, { x: 0, y: 0 });
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)) - HALO);
      const x1 = Math.min(W, Math.ceil(Math.max(a.x, b.x)) + HALO);
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y)) - HALO);
      const y1 = Math.min(H, Math.ceil(Math.max(a.y, b.y)) + HALO);
      // Snapshot safety: clear the consumed bounds only if no further paint
      // change landed while this frame computed the rectangle.
      if (rec.gen === gen) { rec.x0 = Infinity; rec.z0 = Infinity; rec.x1 = -Infinity; rec.z1 = -Infinity; }
      this._inkGen = gen;
      if (x1 > x0 && y1 > y0) {
        // A large repaint keeps the existing 3-band spike bound; everything
        // else redraws only its own rectangle.
        if ((x1 - x0) * (y1 - y0) * BANDS >= W * H) { this._drawInk(0, Math.floor(H / BANDS)); this._band = 1; }
        else this._drawInk(y0, y1, x0, x1);
      }
      return;
    }
    if (rec.gen === gen) { rec.x0 = Infinity; rec.z0 = Infinity; rec.x1 = -Infinity; rec.z1 = -Infinity; }
    this._inkGen = gen;
  };

  // Minimap OFF must not run the live raster, but painting continues, so keep
  // the hidden map collapsed to a full invalidation and O(1) bounds instead of
  // letting the dirty region grow into the whole stage.
  const tickHidden = proto.tickHidden;
  proto.tickHidden = function (dt) {
    const rec = this.paint && this.paint.inkDirty;
    if (rec) { rec.full = true; rec.x0 = Infinity; rec.z0 = Infinity; rec.x1 = -Infinity; rec.z1 = -Infinity; }
    return tickHidden.call(this, dt);
  };
}
