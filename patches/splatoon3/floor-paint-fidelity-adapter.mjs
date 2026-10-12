// Floor-paint morphology and rolling continuity, composed AFTER the existing
// source adapters. No projectile trajectory, collision or VFX is altered.
// Native S3 WidthHalf records are half-width envelopes, not permission for an
// extra 10-30% main body expansion from INKWAVE's procedural ink lobes.
export function adaptFloorPaintFidelity(rel, code, replaceOnce) {
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

    // #1165 GPU/CPU roller core parity and live-turf-only scoring are already
    // composed by issue-batch-1171-adapter and score-hud-adapter.
    // This layer changes only the body footprint on those established owners.
    return code;
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
      '    // Ordinary 60 Hz rolling keeps its original three splats and cost.\n' +
      '    const rollPaintSteps = Math.min(6, Math.max(1, Math.ceil(moved / 0.32)));\n' +
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
  return code;
}
