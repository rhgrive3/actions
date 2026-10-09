// Resize changes control geometry; only physical rotation invalidates pointers.
export function physicalOrientation(env) {
  const legacy = env.orientation, angle = env.screen?.orientation?.angle;
  const value = Number.isFinite(legacy) ? legacy : Number.isFinite(angle) ? angle : null;
  if (value !== null) return `angle:${((value % 360) + 360) % 360}`;
  const { width, height } = env.screen || {};
  return width > 0 && height > 0 ? `screen:${width >= height}` : null;
}

export function createTouchRelayout(mobile, env = globalThis) {
  const signal = mobile._abort.signal;
  let orientation = physicalOrientation(env), frame = null, unknownRotationPending = false;
  const cancel = () => {
    if (frame !== null) env.cancelAnimationFrame(frame);
    frame = null; unknownRotationPending = false;
  };
  signal.addEventListener('abort', cancel, { once: true });
  return event => {
    if (signal.aborted || mobile._destroyed) return;
    const current = physicalOrientation(env);
    const rotated = current !== orientation || (current === null &&
      (event?.type === 'orientationchange' || event?.type === 'change') && !unknownRotationPending);
    orientation = current;
    if (rotated) {
      if (current === null) unknownRotationPending = true;
      mobile.gyro.resync();
      mobile.resetPointers();
    } else if (mobile.editing) {
      // Editor drags use viewport-relative anchors; retain the draft but discard
      // that gesture when its geometry changes, as the existing editor requires.
      mobile.resetPointers();
    }
    if (frame !== null) return;
    frame = env.requestAnimationFrame(() => {
      frame = null; unknownRotationPending = false;
      if (signal.aborted || mobile._destroyed) return;
      const stick = mobile._stick, id = stick.id, radius = Math.max(26, mobile._stickR || 50);
      const held = stick.active && id >= 0 && radius > 0;
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
      mobile._layoutAll();
      if (held && stick.active && stick.id === id && mobile._stickR > 0) {
        // Both fixed and floating sticks keep normalized deflection and the actual
        // finger coordinates; match _stickUpdate's minimum effective radius.
        const scale = Math.max(26, mobile._stickR || 50) / radius;
        stick.ox = stick.x - dx * scale;
        stick.oy = stick.y - dy * scale;
        mobile._stickUpdate();
      }
    });
  };
}
