// Experimental surface-only candidate. No mask, ownership, geometry, texture or light changes.
// Amplitude calibration awaits matched-image review; these are not extracted Nintendo constants.
export function adaptInkMicroSurface(rel, code, replaceOnce) {
  if (rel !== 'src/world/inkShading.js') return code;
  code = replaceOnce(code, '(0.95 - 0.5 * gFresh)', '(0.7125 - 0.375 * gFresh)', 'ink micro-surface: existing gel amplitude');
  return replaceOnce(code, '* 0.035 * gf * gInk;', '* 0.02625 * gf * gInk;', 'ink micro-surface: fallback amplitude');
}
