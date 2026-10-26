// Build-only source transform. Runtime layout helpers retain their existing URL.
export function adaptTouchRelayout(rel, code) {
  if (rel !== 'src/core/mobile.js') return code;
  const before = `    // WebKit can dispatch a redundant resize after pointerdown with exactly
    // the same layout and visual viewport. Do not discard a live gesture when
    // no viewport dimensions changed; real rotations still cancel instantly.
    const viewportKey = () => {
      const visual = window.visualViewport;
      return [innerWidth, innerHeight, visual?.width ?? innerWidth, visual?.height ?? innerHeight, visual?.scale ?? 1].join(':');
    };
    let lastViewportKey = viewportKey();
    const relayout = (event) => {
      const currentViewportKey = viewportKey();
      if (event?.type === 'resize' && currentViewportKey === lastViewportKey) return;
      lastViewportKey = currentViewportKey;
      // Input and gyro cancellation remain synchronous for every actual viewport change or orientation event.
      this.gyro.resync(); this.resetPointers();
      // Safari may emit resize, orientationchange and screen.orientation.change
      // before one frame. Measure the final viewport only once per frame.
      if (this._relayoutRaf !== null) return;
      this._relayoutRaf = requestAnimationFrame(() => {
        this._relayoutRaf = null;
        if (!this._abort.signal.aborted) this._layoutAll();
      });
    };`;
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0 || code.includes('createTouchRelayout(this, window)')) {
    throw new Error('INKWAVE touch relayout conflict: expected one original layout owner');
  }
  return "import { createTouchRelayout } from '../../patches/local-quality/touch-relayout.mjs';\n" +
    code.slice(0, at) + '    const relayout = createTouchRelayout(this, window);' + code.slice(at + before.length);
}
