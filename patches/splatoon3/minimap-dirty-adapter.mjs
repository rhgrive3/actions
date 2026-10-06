// Issue #895: live minimap whole-map refresh.
//
// Two tiny, exact-anchor hooks on the public sources; all behaviour lives in the
// owned helper patches/splatoon3/runtime/minimap-dirty.mjs (installed by
// runtime/install.mjs). No public file is edited and no other patch's anchors
// are touched (the local-quality #419 build-only adapter keeps its own anchors).
//
//   src/world/paint.js  record the map-space bounds of the cells whose grid
//                       ownership actually changed, and flag a whole-map
//                       invalidation when PaintSystem.clear() resets the grid.
//   src/game/minimap.js _drawInk() gains an x range (the single raster
//                       implementation; the emboss/alpha halo rows are
//                       unchanged, so a partial refresh is structurally
//                       identical to a whole-map one) and update() only pays
//                       for the coalesced dirty rectangle between the two
//                       whole-map cases that genuinely need one.
export function adaptMinimapDirty(rel, code, replaceOnce) {
  if (rel === 'src/world/paint.js') {
    // Idempotent when both hooks are already present: a higher composition layer
    // (e.g. local-quality) may re-compose an already-built tree. Any partial
    // application or genuine upstream drift still falls through to replaceOnce,
    // which fails closed on a missing/duplicated anchor.
    if (code.includes('if (this._inkMark) this._inkMark(f, i, j);') &&
        code.includes('if (this.inkDirty) this.inkDirty.full = true;')) return code;
    code = replaceOnce(code,
      '        this.grid[k] = val;\n        claimed += cellA;',
      '        this.grid[k] = val;\n        if (this._inkMark) this._inkMark(f, i, j);   // #895 map-space dirty bounds for the live minimap\n        claimed += cellA;',
      'paint dirty bounds write site');
    code = replaceOnce(code,
      '    this._wetUntil = this.clock;\n    this.version++;',
      '    this._wetUntil = this.clock;\n    this.version++;\n    if (this.inkDirty) this.inkDirty.full = true;   // #895 reset needs a whole-map repaint',
      'paint reset invalidation');
    return code;
  }
  if (rel === 'src/game/minimap.js') {
    // Idempotent if every hook is already in place (re-composition of a built
    // tree); otherwise replaceOnce fails closed on drift.
    if (code.includes('  _drawInk(y0 = 0, y1 = this.h, x0 = 0, x1 = this.w) {') &&
        code.includes('for (let px = x0; px < x1; px++)') &&
        code.includes('putImageData(this.inkImg, 0, 0, x0, y0, x1 - x0, y1 - y0)') &&
        code.includes('else this._drawDirtyInk(_rec);')) return code;
    code = replaceOnce(code,
      '  _drawInk(y0 = 0, y1 = this.h) {',
      '  _drawInk(y0 = 0, y1 = this.h, x0 = 0, x1 = this.w) {',
      'minimap ink refresh x range');
    code = replaceOnce(code,
      '    let flashes = 0;\n    for (let py = y0; py < y1; py++) {\n      for (let px = 0; px < W; px++) {',
      '    let flashes = 0;\n    for (let py = y0; py < y1; py++) {\n      for (let px = x0; px < x1; px++) {',
      'minimap ink refresh column range');
    code = replaceOnce(code,
      '    this.ictx.putImageData(this.inkImg, 0, 0, 0, y0, W, y1 - y0);\n    this.fctx.putImageData(this.flashImg, 0, 0, 0, y0, W, y1 - y0);',
      '    this.ictx.putImageData(this.inkImg, 0, 0, x0, y0, x1 - x0, y1 - y0);\n    this.fctx.putImageData(this.flashImg, 0, 0, x0, y0, x1 - x0, y1 - y0);',
      'minimap ink ImageData dirty rectangle');
    code = replaceOnce(code,
      '    } else if (force || (this.timer <= 0 && this.version !== this.paint.version)) {\n' +
      '      this.timer = 0.15;\n' +
      '      const first = this.version === -1;\n' +
      '      this.version = this.paint.version;\n' +
      '      if (first || force) { this._quiet = first; this._drawInk(0, this.h); this._quiet = false; if (first) this.flashT = 9; }\n' +
      '      else { this._drawInk(0, Math.floor(this.h / BANDS)); this._band = 1; }\n' +
      '      dirty = true;\n' +
      '    }',
      '    } else if (force || (this.timer <= 0 && (this.version !== this.paint.version || this._inkGen !== (this.paint.inkDirty ? this.paint.inkDirty.gen : 0)))) {\n' +
      '      this.timer = 0.15;\n' +
      '      const first = this.version === -1;\n' +
      '      this.version = this.paint.version;\n' +
      '      const _rec = this.paint.inkDirty;\n' +
      '      // Initial build, viewer-team flip, theme/team-colour change, stage rebuild and\n' +
      '      // PaintSystem.clear() stay whole-map; otherwise only the coalesced dirty rectangle.\n' +
      '      if (first || force || !_rec || _rec.full || !this._drawDirtyInk) {\n' +
      '        this._quiet = first; this._drawInk(0, this.h); this._quiet = false; if (first) this.flashT = 9;\n' +
      '        if (_rec) { _rec.full = false; this._inkGen = _rec.gen; }\n' +
      '      } else this._drawDirtyInk(_rec);\n' +
      '      dirty = true;\n' +
      '    }',
      'minimap bounded dirty refresh branch');
    return code;
  }
  return code;
}
