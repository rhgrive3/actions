// Build-only source transform. Runtime pointer helpers retain their existing URL.
// The window capture listener may reveal a sibling overlay after hit-testing.
// Its original canvas-targeted event still needs the existing mobile router.
export function adaptFirstTouch(rel, code) {
  if (rel !== 'src/core/mobile.js') return code;
  const before = "    root.addEventListener('pointerdown', (e) => this._down(e), { signal: sig });";
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0 || code.includes('adoptCanvasTouch(this, e)')) {
    throw new Error('INKWAVE first touch conflict: expected one original pointer router');
  }
  const after = before + "\n    this.canvas.addEventListener('pointerdown', (e) => adoptCanvasTouch(this, e), { signal: sig, passive: false });" +
    "\n    this.canvas.addEventListener('pointermove', (e) => continueCanvasTouch(this, e, false), { signal: sig, passive: false });" +
    "\n    for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(ty, (e) => continueCanvasTouch(this, e, true), { signal: sig });";
  return "import { adoptCanvasTouch, continueCanvasTouch } from '../../patches/local-quality/first-touch-adapter.mjs';\n" +
    code.slice(0, at) + after + code.slice(at + before.length);
}
