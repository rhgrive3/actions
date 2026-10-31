// Character/weapon material quality only; run after the existing material adapters.
// GLSL ES smoothstep requires edge0 < edge1. The descending ramps below used
// to rely on undefined driver behavior for eyes, hair, fabric and shoe details.
// Keep their authored Hermite curve by complementing an ascending ramp.
const MARKER = '// INKWAVE character visual stability v1';
import { orderedShaderSmoothsteps } from './ordered-shader-smoothstep.mjs';
export const orderedCharacterSmoothsteps = orderedShaderSmoothsteps;

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Character visual stability source changed: ' + before);
  return source.replace(before, after);
}

function versionChangedPrograms(source) {
  let count = 0;
  const code = source.replace(/(m\.customProgramCacheKey\s*=\s*\(\)\s*=>\s*)([^;\n]+)(;)/g, (whole, lead, expression, end) => {
    const updated = expression.replace(/(['"])(iw-(?:skin|cloth|hair|eye|squid|plastic)[^'"]*)\1/g, (_literal, quote, key) => {
      count++;
      return quote + key + '|visual-stability1' + quote;
    });
    return lead + updated + end;
  });
  // Skin, cloth, hair, eye, both squid passes and weapon plastic. The dither,
  // rim and headgear wrappers derive their keys from these versioned factories.
  if (count !== 7) throw new Error('Character visual stability program-key coverage changed: ' + count);
  return code;
}

export function adaptCharacterVisualStability(rel, source) {
  if (rel !== 'src/game/character-mats.js' || source.includes(MARKER)) return source;
  let code = orderedCharacterSmoothsteps(source);

  // Evaluate derivatives before the material branch, including helper fragments
  // at a metal/rubber edge. Geometry/material classes, PBR and colours stay fixed.
  code = replaceOnce(code,
    'float iwM = floor(vMat + 0.5); float iwH = 0.0; vec3 iwLed = vec3(0.0);',
    `float iwM = floor(vMat + 0.5); float iwH = 0.0; vec3 iwLed = vec3(0.0);
          vec3 iwWPixel = fwidth(vWPos);`);
  code = replaceOnce(code,
    'float br = iwNoise(vec3(vWPos.x * 1800.0, vWPos.y * 1800.0, vWPos.z * 40.0));',
    `// Preserve resolved brushing; average subpixel grain instead of flashing it.
            vec3 iwBrushPixel = iwWPixel * vec3(1800.0, 1800.0, 40.0);
            float iwBrushLod = 1.0 - smoothstep(0.22, 0.55, max(max(iwBrushPixel.x, iwBrushPixel.y), iwBrushPixel.z));
            float br = 0.5;
            if (iwBrushLod > 0.0) br = mix(0.5, iwNoise(vec3(vWPos.x * 1800.0, vWPos.y * 1800.0, vWPos.z * 40.0)), iwBrushLod);`);
  code = versionChangedPrograms(code);
  return code + '\n' + MARKER + '\n';
}
