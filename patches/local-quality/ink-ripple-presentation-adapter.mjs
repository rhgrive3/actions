export function adaptInkRipplePresentation(rel,code,once){
 const patch=(a,b,label)=>{code=once(code,a,b,'ripple presentation: '+label)};
 if(rel==='src/world/inkShading.js'){
  code="import { updateRippleUniforms } from '../../patches/local-quality/ink-ripple-presentation.mjs';\n"+code;
  patch('export function inkUniforms() {','export function inkUniforms(packedRipples = true) {','explicit full-table fallback');
  patch('    uInkClock: { value: 0 },','    uInkClock: { value: 0 },\n    uRipActiveCount: { value: packedRipples ? 0 : INK_RIPPLES, packed: packedRipples },','zero initial active count');
  patch("export function inkBeforeRender(U, P) {\n  if (!U.uInkClock) return;\n  U.uInkClock.value = P.clock || 0;\n  const A = P.rip, B = P.ripP;\n  if (!A || !B) return;\n  const ra = U.uRip.value, rb = U.uRipP.value;\n  for (let i = 0; i < INK_RIPPLES; i++) {\n    const o = i * 4;\n    ra[i].set(A[o], A[o + 1], A[o + 2], A[o + 3]);\n    rb[i].set(B[o], B[o + 1], B[o + 2], B[o + 3]);\n  }\n}",'export function inkBeforeRender(U, P) {\n  updateRippleUniforms(U, P, INK_RIPPLES);\n}','per-draw authoritative ripple presentation');
  patch('uniform float uInkClock;', 'uniform float uInkClock;\n#ifndef INK_RIPPLE_FULL_TABLE\nuniform int uRipActiveCount;\n#endif','packed count GLSL uniform');
  patch('    for (int i = 0; i < ${INK_RIPPLES}; i++) {\n      vec4 Pr = uRip[i], Qr = uRipP[i];', '    for (int i = 0; i < ${INK_RIPPLES}; i++) {\n#ifndef INK_RIPPLE_FULL_TABLE\n      if (i >= uRipActiveCount) break;\n#endif\n      vec4 Pr = uRip[i], Qr = uRipP[i];','stable active prefix with compiler fallback');
 }
 if(rel==='src/world/levelMaterial.js'){
  patch('    ...inkUniforms(),','    ...inkUniforms(opts.ripplePacking !== false),','material owns matching CPU packing mode');
  patch('  mat.userData.uniforms = uniforms;',"  if (opts.ripplePacking === false) mat.defines = { ...(mat.defines || {}), INK_RIPPLE_FULL_TABLE: 1 };\n  mat.userData.uniforms = uniforms;",'full-table shader variant for compiler/device fallback');
 }
 return code;
}
