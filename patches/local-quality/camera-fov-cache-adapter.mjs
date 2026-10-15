// Build-only arithmetic reuse. No camera policy, constants or projection change.
export function adaptCameraFovCache(rel, code) {
  if (rel !== 'src/game/cameraRig.js') return code;
  const before = '    const vBase = 2 * Math.atan(Math.tan((this.baseFov * Math.PI) / 360) / (16 / 9)) * (180 / Math.PI);';
  const after = `    // Reuse the exact conversion while the numeric setting is unchanged.
    if (!Object.is(this._vBaseFov, this.baseFov) || !Number.isFinite(this.baseFov)) {
      this._vBase = 2 * Math.atan(Math.tan((this.baseFov * Math.PI) / 360) / (16 / 9)) * (180 / Math.PI);
      this._vBaseFov = this.baseFov;
    }
    const vBase = this._vBase;`;
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) throw new Error('INKWAVE camera FOV cache anchor conflict');
  return code.slice(0, at) + after + code.slice(at + before.length);
}
