// Playwright viewport acknowledgement can precede WebKit's native resize event.
// MobileInput resets pointers in that event and lays out on the next animation
// frame. Observe that real event before the next independent gesture test.
export async function settleTouchViewport(page, viewport) {
  await page.evaluate(() => {
    const key = '__inkwaveTouchViewportWait';
    if (window[key]) throw Error('Viewport settlement already pending');
    let finish, fail, frames = 0, generation = 0, events = 0, timer;
    const promise = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('resize', changed);
      window.removeEventListener('orientationchange', changed);
      screen.orientation?.removeEventListener?.('change', changed);
    };
    const changed = () => {
      events++; frames = 0; const current = ++generation;
      const settledFrame = () => {
        if (current !== generation) return;
        if (++frames < 2) { requestAnimationFrame(settledFrame); return; }
        cleanup(); finish({ events, frames, width: innerWidth, height: innerHeight });
      };
      requestAnimationFrame(settledFrame);
    };
    window.addEventListener('resize', changed);
    window.addEventListener('orientationchange', changed);
    screen.orientation?.addEventListener?.('change', changed);
    timer = setTimeout(() => { cleanup(); fail(Error('Native viewport change did not settle')); }, 10000);
    // Keep an early timeout rejection observed until page.evaluate awaits it.
    promise.catch(() => {});
    window[key] = { promise, cleanup };
  });
  try {
    await page.setViewportSize(viewport);
    return await page.evaluate(async () => {
      const key = '__inkwaveTouchViewportWait';
      try { return await window[key].promise; }
      finally { window[key].cleanup(); delete window[key]; }
    });
  } catch (error) {
    await page.evaluate(() => {
      const key = '__inkwaveTouchViewportWait'; window[key]?.cleanup(); delete window[key];
    });
    throw error;
  }
}
