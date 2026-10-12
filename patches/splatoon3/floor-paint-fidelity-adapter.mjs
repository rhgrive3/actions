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

    // Match the roller band's seeded transverse wave at the zero-crossing.
    // The source GPU rolls at SD<=0; the original CPU omitted the wave and
    // applied a further negative inset, creating visible but unowned seams.
    code = replaceOnce(code,
      '          const qa = Math.abs(px * sdu + py * sdv) - r * BAND_L, qb = Math.abs(-px * sdv + py * sdu) - r * BAND_W;\n' +
      '          const sd = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;\n' +
      '          if (sd > -0.03 * r) continue;',
      '          const along = px * sdu + py * sdv, across = -px * sdv + py * sdu;\n' +
      '          const wv = r * (0.03 * Math.sin(along / r * 9.0 + seed * 30.0) + 0.018 * Math.sin(along / r * 23.0 + seed * 11.0));\n' +
      '          const qa = Math.abs(along) - r * BAND_L, qb = Math.abs(across) - (r * BAND_W + wv);\n' +
      '          const sd = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;\n' +
      '          if (sd > 0) continue;',
      'floor: exactly share roller band zero edge');

    // Wall and occluded geometry can remain inked/swimmable, but cannot award
    // Turf-War floor m² or extra special gauge credit.
    code = replaceOnce(code,
      '        this.grid[k] = val;\n        claimed += cellA;\n        if (f.turf && !this.dead[k]) {',
      '        this.grid[k] = val;\n        if (f.turf && !this.dead[k]) {\n          claimed += cellA;',
      'floor: m² credit only for live turf cells');
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
