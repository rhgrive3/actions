// Native MobileInput accepts pen and finger contacts through the same router.
export function isMobilePointer(event) { return event?.pointerType === 'touch' || event?.pointerType === 'pen'; }

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

export function adoptCanvasTouch(mobile, event) {
  if (!isMobilePointer(event) || event.target !== mobile.canvas ||
      !mobile.visible || mobile.editing || mobile.mapOpen || mobile._destroyed ||
      mobile._abort.signal.aborted || mobile.owner.enabled === false ||
      mobile.canvas.ownerDocument?.hidden || mobile._ptr.has(event.pointerId) ||
      mobile._stick.id === event.pointerId) return false;
  mobile._down(event);
  return true;
}

// If transferring pointer capture fails, implicit touch capture stays on canvas.
// Only an already-owned canvas pointer is forwarded; root-targeted events keep
// their original listener, so no router or press edge executes twice.
export function continueCanvasTouch(mobile, event, ended) {
  if (!isMobilePointer(event) || event.target !== mobile.canvas ||
      mobile._abort.signal.aborted || mobile._destroyed ||
      (!mobile._ptr.has(event.pointerId) && mobile._stick.id !== event.pointerId)) return false;
  if (ended) mobile._up(event);
  else mobile._move(event);
  return true;
}
