// The window capture listener may reveal a sibling overlay after hit-testing.
// Its original canvas-targeted event still needs the existing mobile router.
export function adaptFirstTouch(rel, code) {
  if (rel !== 'src/core/mobile.js') return code;
  const before = "    root.addEventListener('pointerdown', (e) => this._down(e), { signal: sig });";
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0 || code.includes('adoptCanvasTouch(this, e)')) {
    throw new Error('INKWAVE first touch conflict: expected one original pointer router');
  }
  const after = before + "\n    this.canvas.addEventListener('pointerdown', (e) => adoptCanvasTouch(this, e), { signal: sig, passive: false });";
  return "import { adoptCanvasTouch } from '../../patches/local-quality/first-touch-adapter.mjs';\n" +
    code.slice(0, at) + after + code.slice(at + before.length);
}

export function adoptCanvasTouch(mobile, event) {
  if (event.pointerType !== 'touch' || event.target !== mobile.canvas ||
      !mobile.visible || mobile.editing || mobile.mapOpen || mobile._destroyed ||
      mobile._abort.signal.aborted || mobile.owner.enabled === false ||
      mobile.canvas.ownerDocument?.hidden || mobile._ptr.has(event.pointerId) ||
      mobile._stick.id === event.pointerId) return false;
  mobile._down(event);
  return true;
}
