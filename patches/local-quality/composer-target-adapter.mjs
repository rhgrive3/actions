// #642: the main composer permanently pinned two full-resolution RGBA16F ping-pong
// buffers even on touch presets where the effective quality has already disabled
// MSAA, GTAO and bloom. On that preset no pass in the chain needs more than RGB
// float precision and nothing consumes the buffer alpha: RenderPass -> Grade ->
// ScreenFX -> Output -> FXAA all read .rgb only (Grade passes alpha through,
// ScreenFX rewrites it to 1.0, FXAA writes 1.0) and the opaque canvas discards
// alpha. R11F_G11F_B10F keeps float/HDR storage (11/11/10-bit mantissa, the same
// exponent range as half-float) at half the bytes per pixel, so the pair drops
// from 16 to 8 bytes per drawing pixel. The decision fails closed: it requires
// the touch preset AND ao/bloom/msaa actually off AND EXT_color_buffer_float;
// every other path — desktop HIGH/ULTRA included — keeps THREE.HalfFloatType.
const BASELINE =
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';
const ISOLATED =
  '    // #642: the touch preset disables msaa/ao/bloom, so this ping-pong pair feeds no HDR\n' +
  '    // pyramid and no post pass consumes its alpha (grade/screen-FX/FXAA read .rgb only; the\n' +
  '    // opaque canvas discards alpha). Keep float/HDR precision at half the bytes per pixel\n' +
  '    // as R11F_G11F_B10F while the driver can render it; RGBA16F stays the fallback and the\n' +
  '    // desktop presets keep their RGBA16F pair untouched.\n' +
  '    const composerRt = this.mobile.touch && !q.ao && !q.bloom && !samples &&\n' +
  '      r.extensions.has(\'EXT_color_buffer_float\')\n' +
  '      ? { format: THREE.RGBFormat, type: THREE.UnsignedInt101111Type }\n' +
  '      : { type: THREE.HalfFloatType };\n' +
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { ...composerRt, samples });';

export function adaptComposerTarget(rel, code, once) {
  if (rel !== 'src/core/renderer.js') return code;
  return once(code, BASELINE, ISOLATED, '#642 composer target preset isolation');
}

// Exact inverse of adaptComposerTarget — used by the regression test and the native
// before/after harness to prove the pre-fix composition equals upstream byte-for-byte.
export function revertComposerTarget(code) {
  return code.split(ISOLATED).join(BASELINE);
}
