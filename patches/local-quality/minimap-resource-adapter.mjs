// Issue #419: Minimap OFF forces a full raster build (~7.5 MiB typed state +
// 4 full canvases + 2 ImageData) at match start via setViewerTeam().
// Constructor leaves _built=false while OFF, then setViewerTeam() builds
// whenever _built is false. OFF runtime (tickHidden) never uses the raster.
// Build-only fix: placeholders while OFF, setViewerTeam defers _build while
// OFF (records flip + invalidates stale raster), idle rechecks at fire time,
// _build lazily sizes surfaces before the native raster pass.
// Parent wires this into patches/local-quality/adapter.mjs; no side effects.
export function replaceOnceMinimap(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE minimap patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptMinimapResources(rel, code) {
  // #907: keep the persistent corner map OFF, but the explicitly opened Turf Map
  // still needs its live raster, per-actor markers and expanded HUD presentation.
  if (rel === 'src/main.js') {
    code = replaceOnceMinimap(code,
      "    const showMinimap = this.settings.minimap !== false;\n    if (showMinimap) this.minimap.update(dt);\n    else this.minimap.tickHidden?.(dt);",
      "    const showMinimap = this.settings.minimap !== false;\n    const explicitTurfMap = !!(m && !m.attract && !m.paused && m.state === 'playing' && m.controller?.mapHeld && !this.menus?.current);\n    if (showMinimap || explicitTurfMap) this.minimap.update(dt);\n    else this.minimap.tickHidden?.(dt);",
      'explicit-map raster while corner map disabled');
    code = replaceOnceMinimap(code,
      "    if (showMinimap) {\n      for (const o of m.actors) {",
      "    if (showMinimap || explicitTurfMap) {\n      for (const o of m.actors) {",
      'explicit-map actor markers');
    code = replaceOnceMinimap(code,
      'map: showMinimap ? { canvas: this.minimap.canvas, expanded: false, players } : null,',
      'map: showMinimap || explicitTurfMap ? { canvas: this.minimap.canvas, expanded: explicitTurfMap, players } : null,',
      'explicit-map HUD presentation');
    return code;
  }
  if (rel !== 'src/game/minimap.js') return code;
  code = replaceOnceMinimap(code,
    "const mk = () => { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; return c; };",
    "const mk = () => { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; return c; };\n    const mkMin = () => { const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c; };\n    const mkRes = (G.settings?.minimap === false) ? mkMin : mk;",
    'minimap deferred surface maker');
  code = replaceOnceMinimap(code, '    this.canvas = mk();', '    this.canvas = mkRes();', 'minimap deferred live canvas');
  code = replaceOnceMinimap(code,
    "this.base = mk(); this.bctx = this.base.getContext('2d', { willReadFrequently: true });",
    "this.base = mkRes(); this.bctx = this.base.getContext('2d', { willReadFrequently: true });",
    'minimap deferred base canvas');
  code = replaceOnceMinimap(code,
    "this.inkC = mk(); this.ictx = this.inkC.getContext('2d');",
    "this.inkC = mkRes(); this.ictx = this.inkC.getContext('2d');",
    'minimap deferred ink canvas');
  code = replaceOnceMinimap(code,
    "this.flashC = mk(); this.fctx = this.flashC.getContext('2d');",
    "this.flashC = mkRes(); this.fctx = this.flashC.getContext('2d');",
    'minimap deferred flash canvas');
  code = replaceOnceMinimap(code,
    'this.inkImg = this.ictx.createImageData(this.w, this.h);',
    'this.inkImg = (G.settings?.minimap === false) ? null : this.ictx.createImageData(this.w, this.h);',
    'minimap deferred ink ImageData');
  code = replaceOnceMinimap(code,
    'this.flashImg = this.fctx.createImageData(this.w, this.h);',
    'this.flashImg = (G.settings?.minimap === false) ? null : this.fctx.createImageData(this.w, this.h);',
    'minimap deferred flash ImageData');
  code = replaceOnceMinimap(code,
    'if (G.settings?.minimap !== false) idle(() => { if (!this._built && CURRENT === this) this._build(); });',
    'idle(() => { if (G.settings?.minimap === false) return; if (!this._built && CURRENT === this) this._build(); });',
    'minimap deferred idle guard');
  code = replaceOnceMinimap(code,
    'if (f === this.flip && this._built) { this.version = -1; return; }',
    'if (f === this.flip && this._built) { this.version = -1; return; }\n    if (G.settings?.minimap === false) { if (f !== this.flip) this._built = false; this.flip = f; this.version = -1; return; }',
    'minimap deferred viewer team');
  code = replaceOnceMinimap(code,
    '  _build() {\n    const W = this.w, H = this.h, N = W * H, lvl = this.level, s = this.s;',
    '  _build() {\n    for (const k of [\'canvas\', \'base\', \'inkC\', \'flashC\']) { const c = this[k]; if (c && (c.width !== this.w || c.height !== this.h)) { c.width = this.w; c.height = this.h; } }\n    if (!this.inkImg || this.inkImg.width !== this.w || this.inkImg.height !== this.h) this.inkImg = this.ictx.createImageData(this.w, this.h);\n    if (!this.flashImg || this.flashImg.width !== this.w || this.flashImg.height !== this.h) this.flashImg = this.fctx.createImageData(this.w, this.h);\n    const W = this.w, H = this.h, N = W * H, lvl = this.level, s = this.s;',
    'minimap lazy surface build');
  return code;
}
