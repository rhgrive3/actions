// Floor-paint morphology and rolling continuity, composed AFTER the existing
// source adapters. No projectile trajectory, collision or VFX is altered.
// Native S3 WidthHalf records are half-width envelopes, not permission for an
// extra 10-30% main body expansion from INKWAVE's procedural ink lobes.
export function adaptFloorPaintFidelity(rel, code, replaceOnce) {
  if (rel === 'src/config.js') {
    return replaceOnce(code, '  pointsPerM2: 1.0,          // turf points per square metre newly inked',
      '  pointsPerM2: 1 / 3.305785,    // verified owned world-area -> provisional S3 Turf-point mapping',
      'floor: shared match descriptor respects physical-area to Turf conversion');
  }
  if (rel === 'src/world/paint.js') {
    // Bound the irregular body to its source width. Preserve the interior
    // lobes and the existing source depthScale/heading elongation.
    code = replaceOnce(code,
      'sd = length(p) - r * grow * wob(atan(p.y, p.x), seed);',
      'sd = length(p) - r * grow * min(1.0, wob(atan(p.y, p.x), seed));',
      'floor: shader body fits source WidthHalf');
    code = replaceOnce(code,
      'float edge = r * grow * wob(a, seed);',
      'float edge = r * grow * min(1.0, wob(a, seed));',
      'floor: GPU rays start at capped body edge');
    code = replaceOnce(code,
      'if (d / (r * blobWobble(Math.atan2(py, px), seed)) > 1) continue;',
      'if (d / (r * Math.min(1, blobWobble(Math.atan2(py, px), seed))) > 1) continue;',
      'floor: CPU owns precisely capped body interior');

    // Strictly one deterministic transform before source paint touches the GPU
    // or CPU. Both peers receive the original recorded splat and transform it
    // after packet admission, retaining the existing wire and source radius.
    code = replaceOnce(code,
      '    if (kind === K_ROLL) sAmt = 0;      // the direction orients the band; no smear\n    const reachK = REACH[kind];',
      `    if (kind === K_ROLL) sAmt = 0;      // the direction orients the band; no smear
    const contactFace = Number.isInteger(opts.face) ? this.level.faces[opts.face] : null;
    if (!cosmetic && st && sAmt > 0 && (kind === K_SHOT || kind === K_LINE) &&
        (!contactFace || contactFace.n.y >= 0.45)) {
      const axisLength = Math.hypot(st.x, st.z);
      if (axisLength > 1e-6) {
        const result = directFloorFootprint(radius, sAmt, this._s3Footprint || (this._s3Footprint = {}));
        const shiftPoint = this._s3FootprintCenter || (this._s3FootprintCenter = new THREE.Vector3());
        center = shiftPoint.set(center.x + st.x / axisLength * result.centreShift,
          center.y, center.z + st.z / axisLength * result.centreShift);
        radius = result.radius; sAmt = result.stretchAmt;
      }
    }
    const reachK = REACH[kind];`,
      'floor: source-span-preserving narrower impact and shared CPU/GPU raster');
    // #1165 GPU/CPU roller core parity and live-turf-only scoring are already
    // composed by issue-batch-1171-adapter and score-hud-adapter.
    // This layer changes only the body footprint on those established owners.
    return "import { directFloorFootprint } from '../../patches/splatoon3/runtime/ink-paint-calibration.mjs';\n" + code;
  }

  if (rel === 'src/game/weapons.js') {
    // The existing 0.28-world-unit batching must not prevent the drum from
    // making its initial contact stamp when its owner holds ZR without moving.
    code = replaceOnce(code,
      '    const moved = a.pos.distanceTo(this.lastRollPos);',
      '    const rollPaintFromX = this.lastRollPos.x, rollPaintFromZ = this.lastRollPos.z;\n' +
      '    const moved = a.pos.distanceTo(this.lastRollPos);',
      'floor: retain previous drum location for bounded interpolation');
    code = replaceOnce(code,
      '    if (moved < 0.28) return;\n    this.lastRollPos.copy(a.pos);',
      '    if (moved < 0.28 && this.rollT > dt * 1.5) return;\n    this.lastRollPos.copy(a.pos);',
      'floor: roller initial contact has a stamp even while stationary');
    code = replaceOnce(code,
      '    for (let i = -1; i <= 1; i++) {\n' +
      '      const off = i * w.rollWidth * 0.33;\n' +
      '      _v.set(a.pos.x + fx * 0.75 + rx * off, a.pos.y + 0.35, a.pos.z + fz * 0.75 + rz * off);\n' +
      "      area += G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'roll', stretch: _fwd, claimOwner: a });\n" +
      '    }',
      '    // Subdivide only exceptionally large frame-to-frame displacements.\n' +
      '    // Ordinary 60 Hz rolling (including a 1u synthetic batch probe) keeps its\n    // original three body splats. The 1.1u gap bound is below the 1.24u\n    // rolling-body diameter; larger jumps get bounded subdivision.\n' +
      '    const rollPaintSteps = moved > 1.1 ? Math.min(6, Math.ceil(moved / 0.32)) : 1;\n' +
      '    for (let step = 1; step <= rollPaintSteps; step++) {\n' +
      '      const t = step / rollPaintSteps;\n' +
      '      const cx = rollPaintFromX + (a.pos.x - rollPaintFromX) * t;\n' +
      '      const cz = rollPaintFromZ + (a.pos.z - rollPaintFromZ) * t;\n' +
      '      for (let i = -1; i <= 1; i++) {\n' +
      '        const off = i * w.rollWidth * 0.33;\n' +
      '        _v.set(cx + fx * 0.75 + rx * off, a.pos.y + 0.35, cz + fz * 0.75 + rz * off);\n' +
      "        area += G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'roll', stretch: _fwd, claimOwner: a });\n" +
      '      }\n' +
      '    }',
      'floor: swept drum stamps without changing roll-speed/ink cost');
    return code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code,
      "  addTurf(area) {\n    if (area <= 0) return;\n    this.stats.turf += area;\n    emit('turf', { actor: this, area });\n    if (!this.specialActive && !(this.stormGaugeLock > 0) && !this.s3TidalSlamGaugeFinish) {\n      const was = this.specialReady();\n      this.special = Math.min(this.specialCost(), this.special + area);",
      "  addTurf(area) {\n    const points = inkPaintPoints(area);\n    if (points <= 0) return;\n    this.stats.turf += points;\n    emit('turf', { actor: this, area: points });\n    if (!this.specialActive && !(this.stormGaugeLock > 0) && !this.s3TidalSlamGaugeFinish) {\n      const was = this.specialReady();\n      this.special = Math.min(this.specialCost(), this.special + points);",
      'floor: convert physical ink coverage to Turf and special gauge points');
    code = replaceOnce(code,
      "  addTurfNoSpecial(area) { if (area > 0) { this.stats.turf += area; emit('turf', { actor: this, area }); } }",
      "  addTurfNoSpecial(area) { const points = inkPaintPoints(area); if (points > 0) { this.stats.turf += points; emit('turf', { actor: this, area: points }); } }",
      'floor: no-special paint keeps scores without charging its own gauge');
    return "import { inkPaintPoints } from '../../patches/splatoon3/runtime/ink-paint-calibration.mjs';\n" + code;
  }
  return code;
}
