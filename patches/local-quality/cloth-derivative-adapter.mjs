import { createHash } from 'node:crypto';

// Build-only correction for GLSL ES 3.00 §8.9: derivatives in non-uniform
// control flow are undefined. Tee/shorts triangles straddle bind-space z=0.
// Evaluate their existing decorations on both sides, then select exactly the
// original side's outputs. All pattern math, colors, bumps and masks stay intact.
const GUARD = 'if (p.z > 0.0) {';
const TEE_SHA = 'e33dbb0096532299a5c1cfb4f4af2b5f3d84a0d027fdac15aff1b27dd0d1371d';
const SHORTS_SHA = '92115d469f2a1a97e021a9656a7ff0da686a29d21ae9348dce76d1bd1f6547f8';

function block(code, start) {
  const body = code.indexOf('{', start) + 1;
  let end = body, depth = 1;
  for (; end < code.length && depth; end++) {
    if (code[end] === '{') depth++;
    else if (code[end] === '}') depth--;
  }
  if (!body || depth) throw new Error('Cloth derivative block is unbalanced');
  return { body, end };
}

function locate(code, marker) {
  if (code.split(marker).length !== 2) throw new Error('Cloth derivative marker changed: ' + marker);
  const start = code.indexOf(GUARD, code.indexOf(marker));
  if (start < 0) throw new Error('Cloth derivative guard missing: ' + marker);
  return { start, ...block(code, start) };
}

function check(code, start, end, expected) {
  if (createHash('sha256').update(code.slice(start, end)).digest('hex') !== expected)
    throw new Error('Cloth derivative source block changed; review its complete output assignments');
}

export function adaptClothDerivativeFlow(rel, code) {
  if (rel !== 'src/game/character-mats.js') return code;
  const tee = locate(code, '// chest emblem');
  check(code, tee.start, tee.end, TEE_SHA);
  code = code.slice(0, tee.start) + `{
              vec3 iwTeeBase = base;
              float iwTeeH = iwH, iwTeeShine = iwShine;
              // Derivative evaluation must also reach the opposite-side helper lanes.
${code.slice(tee.body, tee.end - 1)}
              if (!(p.z > 0.0)) { base = iwTeeBase; iwH = iwTeeH; iwShine = iwTeeShine; }
            }` + code.slice(tee.end);

  const front = locate(code, '// front: fly J-stitch');
  const otherwise = code.slice(front.end).match(/^\s*else\s*\{/);
  if (!otherwise) throw new Error('Cloth derivative shorts else changed');
  const back = block(code, front.end + otherwise[0].indexOf('else'));
  check(code, front.start, back.end, SHORTS_SHA);
  code = code.slice(0, front.start) + `{
                vec3 iwShortBase = base;
                float iwShortH = iwH, iwShortAO = iwAO;
                {${code.slice(front.body, front.end - 1)}}
                vec3 iwFrontBase = base;
                float iwFrontH = iwH, iwFrontAO = iwAO;
                base = iwShortBase; iwH = iwShortH; iwAO = iwShortAO;
                {${code.slice(back.body, back.end - 1)}}
                if (p.z > 0.0) { base = iwFrontBase; iwH = iwFrontH; iwAO = iwFrontAO; }
              }` + code.slice(back.end);
  return code;
}
