// Build-only source transform. Runtime layout helpers retain their existing URL.
export function adaptTouchRelayout(rel, code) {
  if (rel !== 'src/core/mobile.js') return code;
  const before = '    const relayout = () => { this.gyro.resync(); this.resetPointers(); requestAnimationFrame(() => this._layoutAll()); };';
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0 || code.includes('createTouchRelayout(this, window)')) {
    throw new Error('INKWAVE touch relayout conflict: expected one original layout owner');
  }
  return "import { createTouchRelayout } from '../../patches/local-quality/touch-relayout.mjs';\n" +
    code.slice(0, at) + '    const relayout = createTouchRelayout(this, window);' + code.slice(at + before.length);
}
