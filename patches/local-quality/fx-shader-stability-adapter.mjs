import { orderedShaderSmoothsteps, orderedVariableSmoothstep } from './ordered-shader-smoothstep.mjs';

const MARKER = '// INKWAVE non-stage FX shader stability v1';
const VARIABLE_RAMPS = Object.freeze({
  'src/fx/fx.js': [
    ['1.0', 'edge * 0.4'],
    ['mw + fin + 0.025', 'mw + fin - 0.025'],
    ['halfW', 'halfW - 0.07'],
    ['1.0', 'edge * 0.55'],
    ['outer + 0.02', 'outer - 0.02'],
    ['outer', 'outer * 0.3'],
    ['outer + 0.06', 'outer'],
    ['0.95 + wob * 0.2', '0.7 + wob * 0.2'],
    ['outer', 'outer - 0.3'],
    ['edge', 'edge - 0.14'],
  ],
  'src/fx/screenfx.js': [['lw', 'lw * 0.25']],
});

// Final source-composition pass. Stage materials, lighting, post-processing
// settings, particle lifetimes and gameplay state are outside this allowlist.
export function adaptFxShaderStability(rel, source) {
  const pairs = VARIABLE_RAMPS[rel];
  if (!pairs || source.includes(MARKER)) return source;
  let code = orderedShaderSmoothsteps(source);
  for (const [high, low] of pairs) code = orderedVariableSmoothstep(code, high, low);
  return code + '\n' + MARKER + '\n';
}

export const fxShaderStabilityTargets = Object.freeze(Object.keys(VARIABLE_RAMPS));
