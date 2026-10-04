// INKWAVE build-only quality correction for #288 (root callback fix,
// parent review 2026-10-04T15:08Z). A same-orientation viewport resize
// (e.g. Android Chrome moving its browser bars) must not cancel active
// touch ownership; a real rotation still must.
//
// Root cause: the public module runs the same relayout for a plain window
// resize and for a real rotation:
//
//   const relayout = () => {
//     this.gyro.resync(); this.resetPointers();
//     requestAnimationFrame(() => this._layoutAll());
//   };
//
// The reliability overlay makes resetPointers() comprehensive, so every held
// FIRE/SQUID/SUB/JUMP, the movement stick, pending touch edges, the queued
// jump target and the live look pointers die until lift + retouch.
//
// Root fix (narrow): this adapter replaces that one callback at build time
// with a direct scoped closure. The replacement:
//
//   - records the physical screen angle at install time;
//   - skips gyro.resync() + resetPointers() ONLY inside a same-angle
//     callback (every other resync/reset caller -- visibility resume,
//     start/stop, stale sensor sample, blur, map, editor -- is untouched);
//   - coalesces resize storms / duplicate lifecycle events (resize +
//     orientationchange + screen.orientation.change for one rotation) into
//     one queued rAF: the pending frame upgrades to a hard reset when any
//     same-callback burst sees a physical angle change;
//   - owns exactly one abort cleanup on the existing AbortController signal,
//     which cancels the pending rAF id on abort so a queued frame after
//     destroy() never runs. No extra resize/orientation observers are added:
//     the three existing listener registrations are kept, only their shared
//     callback body is replaced.
//   - keeps an active stick attached WITHOUT translating the stored
//     anchor/finger: _layoutAll() only rewrites the drawn home (_stickHome /
//     _stickR). Translating ox/oy/x/y by the home delta would corrupt the
//     next native pointermove delta (finding 4): the next event reports the
//     unchanged physical finger coordinate, so shifting the stored finger
//     injects a phantom jump. Leaving the stored deflection untouched keeps
//     velocity/direction continuous; a moved fixed home is a bounded visual
//     offset that the next real finger motion re-anchors naturally.
//
// Physical angle (parent finding 2): a finite screen angle API is trusted
// when available; a virtual keyboard / browser bar that flips viewport aspect
// without physical rotation must NOT count as rotation. Only when no angle
// API exists is the physical screen size (never the viewport) used as a
// fallback. Explicit drift error for the relayout anchor is acceptable; a
// future PR60 conflict must surface as a build error, not be avoided via
// global gyro/resync interception.
//
// Logic-only proof lives in patches/local-quality/tests/touch-resize.test.mjs;
// real Chromium/WebKit evidence must come from the batch browser proof.
//
// Known limitation (documented, not masked): PR60/platform-lifecycle work
// rewrites this same relayout anchor. When that lands, this adapter must
// throw its explicit drift error and be rebased -- it must not silently wrap
// gyro.resync/resetPointers globally to dodge the conflict.

const BEFORE = '    const relayout = () => { this.gyro.resync(); this.resetPointers(); requestAnimationFrame(() => this._layoutAll()); };';

// Browser-safe helpers, inlined into the transformed module so the runtime
// adds no import and no second owner. Also exported here (pure, no DOM) for
// the focused unit tests.
export function normalizeAngle(raw) {
  return ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
}

// Physical rotation, mirroring src/core/device.js screenAngle() precedence:
// legacy window.orientation first, then screen.orientation.angle.
export function physicalAngle(win, scr) {
  const legacy = win ? win.orientation : undefined;
  if (typeof legacy === 'number' && Number.isFinite(legacy)) return normalizeAngle(legacy);
  const viaScreen = scr && scr.orientation && scr.orientation.angle;
  if (typeof viaScreen === 'number' && Number.isFinite(viaScreen)) return normalizeAngle(viaScreen);
  return null;
}

// Physical landscape class from the physical screen size (never viewport).
export function physicalLandscape(scr) {
  const w = scr ? scr.width : undefined;
  const h = scr ? scr.height : undefined;
  if (typeof w === 'number' && Number.isFinite(w) && typeof h === 'number' && Number.isFinite(h)) {
    if (w === h) return null;
    return w > h;
  }
  return null;
}

export function samePhysicalOrientation(a, b) {
  if (!a || !b) return false;
  if (a.angle === null || b.angle === null) {
    // No angle API: a missing physical landscape class is unknown, not a
    // rotation. Only an observed physical aspect flip counts.
    if (a.landscape === null || b.landscape === null) return true;
    return a.landscape === b.landscape;
  }
  // A trusted finite angle decides. The physical landscape class is only a
  // tiebreak when the angle API is absent; viewport aspect never overrides
  // a same physical angle (browser bar / virtual keyboard).
  if (a.angle !== b.angle) return false;
  return true;
}

// Compose this adapter last: gameplay -> touch-layout -> reliability ->
// local-quality -> here. Only src/core/mobile.js is transformed; unknown
// files pass through. Any anchor drift throws an explicit conflict error.
export function adaptTouchResize(rel, code) {
  if (rel !== 'src/core/mobile.js') return code;
  if (code.includes('__touchResizeFrame') || code.includes('touchResizePhysical')) {
    throw new Error('INKWAVE touch resize conflict: adapter already applied');
  }
  if (!code.includes(BEFORE)) {
    throw new Error('INKWAVE touch resize conflict: relayout anchor drifted; review upstream before building');
  }
  if (!code.includes('installTouchLayout(MobileInput, CONTROLS);') || !code.includes('_pendingEdges')) {
    throw new Error('INKWAVE touch resize conflict: compose gameplay -> touch-layout -> reliability -> quality before this adapter');
  }
  const AFTER = [
    '    const touchResizePhysical = () => {',
    '      let angle = null;',
    '      if (typeof window !== \'undefined\' && typeof window.orientation === \'number\' && Number.isFinite(window.orientation)) angle = ((Math.round(window.orientation / 90) * 90) % 360 + 360) % 360;',
    '      else if (typeof screen !== \'undefined\' && screen.orientation && typeof screen.orientation.angle === \'number\' && Number.isFinite(screen.orientation.angle)) angle = ((Math.round(screen.orientation.angle / 90) * 90) % 360 + 360) % 360;',
    '      let landscape = null;',
    '      if (typeof screen !== \'undefined\' && Number.isFinite(screen.width) && Number.isFinite(screen.height) && screen.width !== screen.height) landscape = screen.width > screen.height;',
    '      return { angle, landscape };',
    '    };',
    '    const touchResizeSame = (a, b) => {',
    '      if (!a || !b) return false;',
    '      if (a.angle === null || b.angle === null) {',
    '        if (a.landscape === null || b.landscape === null) return true;',
    '        return a.landscape === b.landscape;',
    '      }',
    '      return a.angle === b.angle;',
    '    };',
    '    let __touchResizeBase = touchResizePhysical();',
    '    let __touchResizeFrame = 0;',
    '    let __touchResizeHard = false;',
    '    const __touchResizeCancel = () => { if (__touchResizeFrame) { cancelAnimationFrame(__touchResizeFrame); __touchResizeFrame = 0; __touchResizeHard = false; } };',
    '    sig.addEventListener(\'abort\', __touchResizeCancel, { once: true });',
    '    const relayout = () => {',
    '      const current = touchResizePhysical();',
    '      if (!touchResizeSame(__touchResizeBase, current)) { __touchResizeBase = current; __touchResizeHard = true; }',
    '      if (__touchResizeFrame) return;',
    '      __touchResizeFrame = requestAnimationFrame(() => {',
    '        __touchResizeFrame = 0;',
    '        if (this._destroyed || sig.aborted) { __touchResizeHard = false; return; }',
    '        const hard = __touchResizeHard;',
    '        __touchResizeHard = false;',
    '        if (hard) { this.gyro.resync(); this.resetPointers(); }',
    '        this._layoutAll();',
    '      });',
    '    };',
  ].join('\n');
  return code.slice(0, code.indexOf(BEFORE)) + AFTER + code.slice(code.indexOf(BEFORE) + BEFORE.length);
}
