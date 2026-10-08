// The lens-ink target is battle-only: a resolution-sized RGBA16F target that is bound only while lens droplets / splats
// are visible. Once the lens has been empty for a short grace period (or the round is reset) it drops back to its 4x4 lazy
// size, which disposes the GPU storage; the next lens part re-fits it before it is drawn. tLens keeps the same texture.
export function adaptScreenfxLensRelease(rel, code, once) {
  if (rel !== 'src/fx/screenfx.js') return code;
  code = once(code,
    'class LensInk {',
    'const LENS_PARK_GRACE = 1.5;   // seconds without a lens part before the half-float target is released\n\nclass LensInk {',
    'ScreenFX lens park grace');
  code = once(code,
    '    if (this.rt.width !== W || this.rt.height !== H) { this.rt.setSize(W, H); this.texel.set(1 / W, 1 / H); this.dirty = true; }\n  }\n',
    '    this._wantW = W; this._wantH = H;\n' +
    '    if (this._parked && !this.parts.length) return;   // an idle target stays tiny until a lens part needs it\n' +
    '    this._fit();\n' +
    '  }\n\n' +
    '  _fit() {\n' +
    '    const W = this._wantW, H = this._wantH;\n' +
    '    this._parked = false;\n' +
    '    if (W && (this.rt.width !== W || this.rt.height !== H)) { this.rt.setSize(W, H); this.texel.set(1 / W, 1 / H); this.dirty = true; }\n' +
    '  }\n\n' +
    '  // Called every frame: releases the GPU allocation once the lens has been empty for LENS_PARK_GRACE.\n' +
    '  idle(dt) {\n' +
    '    if (this.parts.length) { this._idleT = 0; return; }\n' +
    '    if (this._parked) return;\n' +
    '    this._idleT = (this._idleT || 0) + dt;\n' +
    '    if (this._idleT >= LENS_PARK_GRACE) this.park();\n' +
    '  }\n\n' +
    '  park() {\n' +
    '    this._idleT = 0;\n' +
    '    this._parked = true;\n' +
    '    if (this.rt.width !== 4 || this.rt.height !== 4) { this.rt.setSize(4, 4); this.texel.set(0.25, 0.25); }\n' +
    '  }\n',
    'ScreenFX lens park');
  code = once(code,
    '  render(aspect) {\n    const P = this.parts, n = Math.min(P.length, MAXS);',
    '  render(aspect) {\n    if (this._parked) this._fit();\n    const P = this.parts, n = Math.min(P.length, MAXS);',
    'ScreenFX lens re-fit before draw');
  code = once(code,
    '  reset() {\n    const s = this.s;\n    this.lens.clear();',
    '  reset() {\n    const s = this.s;\n    this.lens.clear(); this.lens.park();',
    'ScreenFX reset releases lens target');
  return once(code,
    '    this.stats.lensParts = this.lens.parts.length;',
    '    this.stats.lensParts = this.lens.parts.length;\n    this.lens.idle(dt);',
    'ScreenFX lens idle tick');
}
