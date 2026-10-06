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
        code.includes('else this._drawDirtyInk(_rec);') &&
        code.includes('const ry0 = Math.max(0, y0 - 1), ry1 = Math.min(H, y1 + 1);') &&
        code.includes('const _pb = this._lastFlashBox;') &&
        code.includes('this._lastFlashBox = _nextFlash;')) return code;
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
    // ---- #895 correction: bounded historical flash cleanup. The flash layer
    // is a transition history: pixels flashed by an earlier pass keep their
    // alpha until some later pass rewrites them, so a partial redraw that only
    // touched its own rectangle let the global flashT reset resurrect old
    // flashes. Clear + upload the previous refresh's flashed bounding box before
    // a NEW refresh writes. Band continuations keep the current refresh's flashes
    // (bounded union with the incoming rectangle) — no global
    // ownership rescan, no raster outside the two localized boxes.
    code = replaceOnce(code,
      '    const d = this.inkImg.data, fd = this.flashImg.data, own = this.owner;\n    if (y0 === 0) this._rgb = this._teamRGB();',
      '    const d = this.inkImg.data, fd = this.flashImg.data, own = this.owner;\n' +
      '    // #895 correction: clear the stale alpha of the previously flashed box\n' +
      '    // (bounded union with this rectangle) so a later flashT reset can never\n' +
      '    // resurrect flashes this pass does not rewrite.\n' +
      '    const _pb = this._lastFlashBox;\n' +
      '    if (!this._band && _pb && !(_pb.x0 >= x0 && _pb.x1 <= x1 && _pb.y0 >= y0 && _pb.y1 <= y1)) {\n' +
      '      for (let _by = _pb.y0; _by < _pb.y1; _by++) {\n' +
      '        let _bo = (_by * W + _pb.x0) * 4 + 3;\n' +
      '        for (let _bx = _pb.x0; _bx < _pb.x1; _bx++, _bo += 4) fd[_bo] = 0;\n' +
      '      }\n' +
      '      this.fctx.putImageData(this.flashImg, 0, 0, _pb.x0, _pb.y0, _pb.x1 - _pb.x0, _pb.y1 - _pb.y0);\n' +
      '    }\n' +
      '    if (y0 === 0) this._rgb = this._teamRGB();',
      'minimap historical flash cleanup');
    // ---- #895 correction: bound the alpha/bilinear pass to the halo the
    // emboss pass actually reads (one pixel outside the written rect on every
    // side) instead of scanning full map width for the dirty rows, so the
    // counted work is the real CPU-visited area rather than the upload alone.
    code = replaceOnce(code,
      '    const a0 = Math.max(0, y0 - 1) * W, a1 = Math.min(H, y1 + 1) * W;\n    for (let i = a0; i < a1; i++) {',
      '    const ry0 = Math.max(0, y0 - 1), ry1 = Math.min(H, y1 + 1);\n' +
      '    const rx0 = Math.max(0, x0 - 1), rx1 = Math.min(W, x1 + 1);\n' +
      '    for (let _ry = ry0; _ry < ry1; _ry++) {\n' +
      '      const _row = _ry * W;\n' +
      '      for (let i = _row + rx0; i < _row + rx1; i++) {',
      'minimap alpha halo rectangle');
    code = replaceOnce(code,
      '      al[i] = a; tm[i] = a > 0.5 ? t : 0; tt[i] = t;\n    }\n    let flashes = 0;',
      '      al[i] = a; tm[i] = a > 0.5 ? t : 0; tt[i] = t;\n' +
      '      }\n' +
      '    }\n' +
      '    // #895 correction: remember which pixels this pass actually flashed so the\n' +
      '    // next bounded refresh clears exactly their stale residue instead of leaving\n' +
      '    // it for a later flashT reset to resurrect.\n' +
      '    let fz0 = -1, fz1 = -1, fy0 = -1, fy1 = -1;\n' +
      '    let flashes = 0;',
      'minimap alpha halo loop close');
    // ---- #895 correction: per-pass flashed bounding box
    code = replaceOnce(code,
      '        if (now && own[i] !== now) { fd[o] = 255; fd[o + 1] = 255; fd[o + 2] = 255; fd[o + 3] = 170; flashes++; }',
      '        if (now && own[i] !== now) { fd[o] = 255; fd[o + 1] = 255; fd[o + 2] = 255; fd[o + 3] = 170; flashes++;' +
      ' if (fz0 < 0 || px < fz0) fz0 = px; if (px + 1 > fz1) fz1 = px + 1;' +
      ' if (fy0 < 0 || py < fy0) fy0 = py; if (py + 1 > fy1) fy1 = py + 1; }',
      'minimap flash bounding box');
    code = replaceOnce(code,
      '        own[i] = now;\n      }\n    }',
      '        own[i] = now;\n      }\n    }\n' +
      '    // Band continuations belong to the same refresh: retain their fresh flashes\n' +
      '    // and accumulate their bounds for cleanup when the NEXT refresh starts.\n' +
      '    let _nextFlash = flashes > 0 && fz0 >= 0 ? { x0: fz0, y0: fy0, x1: fz1, y1: fy1 } : null;\n' +
      '    if (this._band && _pb) _nextFlash = _nextFlash ? {\n' +
      '      x0: Math.min(_pb.x0, _nextFlash.x0), y0: Math.min(_pb.y0, _nextFlash.y0),\n' +
      '      x1: Math.max(_pb.x1, _nextFlash.x1), y1: Math.max(_pb.y1, _nextFlash.y1)\n' +
      '    } : _pb;\n' +
      '    this._lastFlashBox = _nextFlash;',
      'minimap flash bounding box export');
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
      '        const _fullGen = _rec ? _rec.gen : 0;\n' +
      '        this._quiet = first; this._drawInk(0, this.h); this._quiet = false; if (first) this.flashT = 9;\n' +
      '        if (_rec) {\n' +
      '          this._inkGen = _fullGen;\n' +
      '          // Consume only the generation captured before the full draw.\n' +
      '          if (_rec.gen === _fullGen) {\n' +
      '            _rec.full = false; _rec.x0 = Infinity; _rec.z0 = Infinity; _rec.x1 = -Infinity; _rec.z1 = -Infinity;\n' +
      '          }\n' +
      '        }\n' +
      '      } else this._drawDirtyInk(_rec);\n' +
      '      dirty = true;\n' +
      '    }',
      'minimap bounded dirty refresh branch');
    return code;
  }
  return code;
}
