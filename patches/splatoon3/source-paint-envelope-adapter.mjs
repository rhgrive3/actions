// S3 source-based mask: WidthHalf is the lateral semi-width, DepthScale
// separately stretches forward. Never invent a global radius divisor.
// Source kinds use the literal lateral half-width with no invented wobble,
// satellite paint, secondary spikes or procedural texture.
// Both CPU and shader use the same boundary, and network keeps source widths.
export function adaptSourcedPaintFootprint(rel, code, replaceOnce) {
  if (rel !== 'src/world/paint.js') return code;
  code = replaceOnce(code,
    "const K = { shot: 0, line: 1, blast: 2, bomb: 3, trail: 4, drop: 5, roll: 6, speck: 7 };",
    "const K = { shot: 0, line: 1, blast: 2, bomb: 3, trail: 4, drop: 5, roll: 6, speck: 7, 'source-shot': 8, 'source-splash': 9 };",
    'source physical paint kind names');
  code = replaceOnce(code,
    'const K_SHOT = 0, K_LINE = 1, K_BLAST = 2, K_BOMB = 3, K_TRAIL = 4, K_DROP = 5, K_ROLL = 6, K_SPECK = 7;',
    'const K_SHOT = 0, K_LINE = 1, K_BLAST = 2, K_BOMB = 3, K_TRAIL = 4, K_DROP = 5, K_ROLL = 6, K_SPECK = 7;\n' +
    'const K_SOURCE_SHOT = 8, K_SOURCE_SPLASH = 9;',
    'source CPU kinds');
  // Apply after the existing source-composition shape reduction.
  code = replaceOnce(code,
    'const REACH = [1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.25, 1.35];',
    'const REACH = [1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.25, 1.35, 1, 1];',
    'source quad bounds');
  code = replaceOnce(code,
    '    } else if (kind > 6.5) {\n' +
    '      sd = length(p) - r * grow * (1.0 + 0.12 * sin(3.0 * atan(p.y, p.x) + seed * 20.0));',
    '    } else if (kind > 7.5) {\n' +
    '      // Source WidthHalf encloses the painterly body. DepthScale elongates p separately.\n' +
    '      sd = length(p) - r * grow;\n' +
    '    } else if (kind > 6.5) {\n' +
    '      sd = length(p) - r * grow * (1.0 + 0.12 * sin(3.0 * atan(p.y, p.x) + seed * 20.0));',
    'literal WidthHalf shader outer boundary');
  // The source's DepthScale controls forward extension. The generic paint
  // shader also stretched the rear by an invented 0.25 fraction. Source
  // kinds do not add that unsupported rearward paint.
  code = replaceOnce(code,
    '    float s = a > 0.0 ? 1.0 + sa : 1.0 + 0.25 * sa;',
    '    float s = a > 0.0 ? 1.0 + sa : (kind > 7.5 ? 1.0 : 1.0 + 0.25 * sa);',
    'source forward-only DepthScale GPU footprint');
  code = replaceOnce(code,
    '            const s = a > 0 ? 1 + sa : 1 + 0.25 * sa;',
    '            const s = a > 0 ? 1 + sa : (sourced ? 1 : 1 + 0.25 * sa);',
    'source forward-only DepthScale CPU footprint');
  code = replaceOnce(code,
    '    const roll = kind === K_ROLL;',
    '    const roll = kind === K_ROLL;\n    const sourced = kind === K_SOURCE_SHOT || kind === K_SOURCE_SPLASH;',
    'source CPU boundary selection');
  code = replaceOnce(code,
    'const ext = roll ? r * (Math.hypot(BAND_L, BAND_W) + BAND_R + 0.05) : r * (1 + sa) * WOB_MAX;',
    'const ext = roll ? r * (Math.hypot(BAND_L, BAND_W) + BAND_R + 0.05) : r * (1 + sa) * (sourced ? 1 : WOB_MAX);',
    'source CPU range');
  code = replaceOnce(code,
    '          if (d > r * WOB_MAX) continue;',
    '          if (d > r * (sourced ? 1 : WOB_MAX)) continue;',
    'source CPU range cull');
  code = replaceOnce(code,
    '          if (d / (r * blobWobble(Math.atan2(py, px), seed)) > 1) continue; // PR1188: GPU body zero crossing',
    '          if (d / (r * (sourced ? 1 : blobWobble(Math.atan2(py, px), seed))) > 1) continue; // PR1188: GPU body zero crossing',
    'literal WidthHalf CPU/GPU boundary parity');
  code = replaceOnce(code,
    'const drips = wall && kind !== K_SPECK && kind !== K_ROLL ? 1 : 0;',
    'const drips = wall && kind !== K_SPECK && kind !== K_ROLL && kind !== K_SOURCE_SHOT && kind !== K_SOURCE_SPLASH ? 1 : 0;',
    'source wall drops are separately authoritative');
  return code;
}
