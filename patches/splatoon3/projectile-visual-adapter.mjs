// Final build composition adapter. Upstream is immutable; all gameplay and
// packet serializers remain owned by the earlier adapters/runtime installers.
function once(code,before,after,label) {
  const at=code.indexOf(before);
  if(at<0||code.indexOf(before,at+before.length)>=0)
    throw new Error('projectile visual source anchor mismatch: '+label);
  return code.slice(0,at)+after+code.slice(at+before.length);
}
export function adaptProjectileVisuals(rel,code) {
  if(rel==='src/fx/fxHooks.js') {
    code="import { bombCuePresentation, drawAutobombScan } from '../../patches/splatoon3/runtime/bomb-cues.mjs';\n"+code;
    code=once(code,'    const R = SUB.bomb.radius, fuse0 = SUB.bomb.fuse;',
      '    // Each native bomb retains its own display identity and fuse.', 'per-bomb warning spec');
    code=once(code,'      const near = this._near(b.pos, 40);',
      `      const near = this._near(b.pos, 40);
      const cue = bombCuePresentation(b, SUB, r), R = cue.radius, fuse0 = cue.fuse;
      drawAutobombScan(this, b, r, cue, col, near);`, 'landing-owned Autobomb scan');
    code=once(code,"      } else if (b.kind === 'bomb') {\n        if (!r.armed) {\n          r.armed = true;",
      `      } else if (b.kind === 'bomb' && cue.warning) {
        const firstArm = !r.armed;
        if (firstArm || cue.follows && (r.bx !== b.pos.x || r.by !== b.pos.y || r.bz !== b.pos.z)) {
          r.armed = true;
          r.bx = b.pos.x; r.by = b.pos.y; r.bz = b.pos.z;`, 'moving Splat warning and no Curling forecast');
    code=once(code,'          if (h && h.hit) { r.gp.copy(h.point); r.gn.copy(h.normal); r.ground = true; } else { r.gp.copy(b.pos); r.gp.y -= 0.2; }\n          fx.bounceSplash?.(r.gp, r.gn, col);\n          this._bump(\'bombArm\');',
      `          r.ground = !!(h && h.hit);
          if (r.ground) { r.gp.copy(h.point); r.gn.copy(h.normal); }
          if (firstArm) {
            if (r.ground) fx.bounceSplash?.(r.gp, r.gn, col);
            this._bump('bombArm');
          }`, 'refresh support without repeating arming effects');
    code=once(code,'        fx.dangerRing?.(_v.copy(r.gp).addScaledVector(r.gn, 0.02), r.gn, col, R, k);',
      '        if (near && r.ground) fx.dangerRing?.(_v.copy(r.gp).addScaledVector(r.gn, 0.02), r.gn, col, R, k);', 'no stale unsupported forecast');
    code=once(code,'fx.beepPulse?.(b.pos, r.gp, r.gn, col, R, k);',
      'fx.beepPulse?.(b.pos, r.ground ? r.gp : null, r.gn, col, R, k);', 'no stale beep floor marker');
    return code;
  }
  if(rel==='src/game/inkFlightRuntime.js') {
    return once(code,'      advanceInkFrame(p, p.inkProfile);',
      '      advanceInkFrame(p, p.inkProfile);\n      this.system.projectileVisuals?.recordPhysicsPoint(p, previousAge);',
      'each actual InkFlight fixed tick including coarse catch-up');
  }
  if(rel==='src/main.js') {
    return once(code,'      if (!m || !m.paused) G.projectiles.syncSights?.();',
      `      if (!m || !m.paused) G.projectiles.syncSights?.();
      // Presentation-only history interpolation, also on zero-tick120Hz frames.
      // Offline pause/results retain their last geometry instead of advancing it.
      if ((!m || !m.paused) && !resultsQuiet && !setUp) G.projectiles.syncVisuals?.(Math.min(1, (this.s3Clock?.accumulator || 0) * 60));`,
      'render history interpolation after camera/aim');
  }
  if(rel!=='src/game/weapons.js')return code;
  code="import { s3ShapeKind } from '../../patches/splatoon3/runtime/s3-projectile-shapes.mjs';\nimport { ProjectileVisualRuntime, nativeVolumeOwns } from '../../patches/splatoon3/runtime/projectile-visuals.mjs';\n"+code;
  code=once(code,'    scene.add(this.blobs);',
    '    scene.add(this.blobs);\n    this.projectileVisuals = new ProjectileVisualRuntime(this, THREE, {\n      fidelitySlosherDrawRadius,\n      nativeShapeOwns: p => Object.hasOwn(Projectiles.prototype, Symbol.for("inkwave.s3.projectile-shapes.v1")) && !!s3ShapeKind(p),\n      nativeVolumeOwns: p => nativeVolumeOwns(p, G.fx?.inkVolumes),\n    });',
    'one additional shared opaque geometry batch');
  code=once(code,'  _recycle(p) {\n    p.owner = null;',
    '  _recycle(p) {\n    this.projectileVisuals.release(p);\n    p.owner = null;',
    'retain delayed shooter tail before severing owner');
  code=once(code,'  clear() {\n    this.inkFlight.clear();',
    '  clear() {\n    this.projectileVisuals.clear();\n    this.inkFlight.clear();',
    'clear pooled histories and detached tails');
  code=once(code,'    p.inkProfile = null; p.inkMeta = null; p.inkKey = null; p.inkPlan = null;\n    return p;',
    '    p.inkProfile = null; p.inkMeta = null; p.inkKey = null; p.inkPlan = null;\n    this.projectileVisuals.reset(p);\n    return p;',
    'history reset on pooled projectile acquisition');
  code=once(code,'            dead = this._step(p, activeDt);',
    '            this.projectileVisuals.beginStep(p);\n            dead = this._step(p, activeDt);\n            this.projectileVisuals.recordStep(p, activeDt);',
    'every remote catch-up physics step');
  code=once(code,'      configureFidelityFlick(p, a, w, i, ang, sp);',
    '      configureFidelityFlick(p, a, w, i, ang, sp);\n      p._iwVisualOrdinal = i;',
    'visual adjacency uses main glob ordinal rather than source unit index');
  code=once(code,'  _step(p, dt) {\n    if (p.inkProfile)',
    '  _step(p, dt) {\n    this.projectileVisuals.beginPhysicsStep(p);\n    if (p.inkProfile)',
    'actual newborn tangent after delayed birth refresh and before integration');
  code=once(code,'      try { if (this._step(p, elapsed)) { list[i] = list[list.length - 1]; list.pop(); this._recycle(p); } }',
    `      try {
        this.projectileVisuals.beginStep(p);
        const dead = this._step(p, elapsed);
        this.projectileVisuals.recordStep(p, elapsed);
        if (dead) { list[i] = list[list.length - 1]; list.pop(); this._recycle(p); }
      }`,
    'record final composed gameplay step without changing inputs');
  code=once(code,'  _draw() {',
    `  // Explicit ownership: this disposes only the new visual backend. Clear
  // keeps its resources reusable across matches, as the native system does.
  disposeVisuals() { this.projectileVisuals.dispose(); }
  syncVisuals(alpha = 1) { this.projectileVisuals.draw(alpha); }
  _draw() {
    // Geometry uploads belong to the render edge; 30Hz may simulate twice and
    // 120Hz may simulate zero times before the next single presentation draw.
    this._drawLegacy();
  }
  _drawLegacy() {`,
    'keep dedicated derivative and detached-droplet legacy stream');
  const maxDraw = code.includes('if (n >= MAX_BLOBS - 5 - reserve) break;')
    ? 'MAX_BLOBS - 5 - reserve' : 'MAX_BLOBS - 5';
  code=once(code,`    for (const p of this.list) {\n      if (n >= ${maxDraw}) break;`,
    `    for (const p of this.list) {\n      this.projectileVisuals.ensureBirth(p);\n      if (this.projectileVisuals.handles(p) || p._s3SloshBirthPending) continue;\n      if (n >= ${maxDraw}) break;`,
    'route source-aware bodies out of generic blob renderer');
  return code;
}
