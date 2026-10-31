// Presentation calibration from Nintendo's JP ikatohito/movie/modal_pc.mp4 (2026-10-21).
// Retail particle counts/curves are unknown; these are INKWAVE visual settings.
// Surface curls and a fixed eight-drop geometry pool use the same surface owner.
export function adaptSwimSplash(rel, code, replaceOnce) {
  if (rel === 'src/game/actor.js') {
    return "import { swimSurfaceVisible, swimSurfaceSpeed } from '../../patches/local-quality/swim-surface.mjs';\n" + replaceOnce(code,
      `    if (a.form === 'swim' && hs > 2 && G.fx && swimSplashVisible(this)) {
      this._wakeT = (this._wakeT || 0) + dt;
      if (this._wakeT > 0.05) { this._wakeT = 0; G.fx.wake(this.pos, _v.set(this.vel.x, 0, this.vel.z).normalize(), this.color, hs); }
    }`,
      `    if (((a.form === 'swim' && this.grounded) || a.form === 'climb') && swimSurfaceSpeed(this) > 1e-4 && G.fx && swimSurfaceVisible(this)) {
      this._wakeT = (this._wakeT || 0) + dt;
      while (this._wakeT + 1e-10 >= 1 / 60) {
        this._wakeT = Math.max(0, this._wakeT - 1 / 60);
        G.fx.wake(this.pos, _v.set(this.vel.x, 0, this.vel.z).normalize(), this.color, hs, this.climbing ? a.wallNormal : this.groundN, this);
      }
    } else this._wakeT = 0;`, 'swim splash cadence');
  }
  if (rel === 'src/fx/fx.js') {
    const start = code.indexOf('  wake(pos, dir, color, speed = 8, normal = UP) {');
    const end = code.indexOf('\n  // Carving a hard turn', start);
    if (start < 0 || end < 0) throw new Error('INKWAVE swim splash conflict: missing wake recipe');
    const before = code.slice(start, end);
    const after = `  warmSwimSurface(renderer, camera, target) {
    return warmSwimSurface(this, renderer, camera, target);
  }
  wake(pos, dir, color, speed = 8, normal = UP, actor = null) {
    touchSwimSurface(this, actor);
  }
`;
    code = replaceOnce(code, before, after, 'connected swim film instead of droplets');
    const carveStart = code.indexOf('  swimCarve(pos, dir, out, color, k = 1) {');
    const carveEnd = code.indexOf('\n  muzzle(', carveStart);
    if (carveStart < 0 || carveEnd < 0) throw new Error('INKWAVE swim film conflict: missing carve recipe');
    code = replaceOnce(code, code.slice(carveStart,carveEnd),
      '  swimCarve() { /* Continuous film follows the actual swimming heading. */ }\n', 'no independent turn beads');
    code = replaceOnce(code, '    this._updateDrops(dt);', '    updateSwimSurface(this, camera);\n    this._updateDrops(dt);', 'continuous film frame owner');
    code = replaceOnce(code, '    this.dN = 0; this.dGeo.instanceCount = 0;', '    clearSwimSurface(this);\n    this.dN = 0; this.dGeo.instanceCount = 0;', 'film match reset');
    code = replaceOnce(code, '    this.scene.remove(this.root);', '    this.scene.remove(this.root);\n    disposeSwimSurface(this);', 'film resource lifetime');
    return "import { warmSwimSurface, touchSwimSurface, updateSwimSurface, clearSwimSurface, disposeSwimSurface } from '../../patches/local-quality/swim-surface.mjs';\n" + code;
  }

  if (rel === 'src/world/levelMaterial.js') {
    code = replaceOnce(code, 'float r = 0.1 + age * 0.95, w = 0.075 + age * 0.085;',
      'float r = 0.08 + age * 0.35, w = 0.045 + age * 0.055;', 'narrow surface wake behind film');
    code = replaceOnce(code, 'float amp = 0.0135 * fade;', 'float amp = 0.002 * fade;', 'film owns lifted liquid, trail is a small ripple');
    return replaceOnce(code, 'wG += env * fade * 0.6;', 'wG += env * fade * 0.08;', 'no bright bead-shaped chain behind the swimmer');
  }
  if (rel === 'src/fx/fxHooks.js') {
    return replaceOnce(code, "if (form === 'swim' && hs < 2) {", "if (false) {", 'no decorative squid bubble particles');
  }
  return code;
}
