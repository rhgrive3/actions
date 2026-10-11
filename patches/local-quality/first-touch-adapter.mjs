// Native MobileInput accepts pen and finger contacts through the same router.
export function isMobilePointer(event) { return event?.pointerType === 'touch' || event?.pointerType === 'pen'; }

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
