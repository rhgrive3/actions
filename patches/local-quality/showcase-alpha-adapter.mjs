// The Results/Loadout showcase is an RGBA overlay. A packed R11G11B10F
// composer buffer has NO alpha: sampling it reports alpha=1, so the clear
// black pixels are composited as opaque black. The packed and RGBA buffers
// ping-pong, making the broken frame alternate on some devices.
//
// Reuse only a matching RGBA16F target, preferring the usual dead writeBuffer.
// When the writeBuffer is packed RGB, the composer's stable scene target
// (renderTarget2) is RGBA16F and already dead after the completed post render.
// No extra full-resolution offscreen surface is needed in that case.
export function selectShowcaseAlphaTarget(THREE, composer, width, height) {
  const valid = (target) => !!(target?.isWebGLRenderTarget && target.depthBuffer
    && target.texture?.format === THREE.RGBAFormat
    && target.texture?.type === THREE.HalfFloatType
    && Math.abs(target.width - width) <= 1
    && Math.abs(target.height - height) <= 1);
  if (valid(composer?.writeBuffer)) return composer.writeBuffer;
  if (valid(composer?.renderTarget2)) return composer.renderTarget2;
  return null;
}

export function adaptShowcaseAlpha(rel, code, replaceOnce) {
  if (rel !== 'src/game/showcase.js') return code;
  code = replaceOnce(code,
    '  // MSAA HDR target: the composer\'s spare ping-pong buffer when it matches the canvas, else a private one.',
    selectShowcaseAlphaTarget.toString() + '\n\n  // MSAA HDR target: the composer\'s spare ping-pong buffer when it matches the canvas, else a private one.',
    'showcase result alpha-safe target helper');
  return replaceOnce(code,
    '    const b = comp && comp.writeBuffer;\n    if (b && b.isWebGLRenderTarget && b.depthBuffer && b.texture.type !== THREE.UnsignedByteType && Math.abs(b.width - w) <= 1 && Math.abs(b.height - h) <= 1) {',
    '    const b = selectShowcaseAlphaTarget(THREE, comp, w, h);\n    if (b) {',
    'showcase result RGBA-only target');
}
