// Per-frame code across the HUD, reticle/self-occlusion and camera reads
// window.innerWidth/innerHeight right after style writes. Every such read can
// force a synchronous style/layout flush (a CPU profile put ~97% of the HUD
// minimap update on one innerWidth read; caching only the HUD moved the flush
// to the next reader). The viewport only changes on resize/rotation, so the
// window answers from one cached pair refreshed lazily after those events.
// The resize listeners are registered before any game listener, so a resize
// handler always sees the new size.
export function installViewportCache(win = globalThis.window) {
  if (!win || win.__iwViewportCache) return win?.__iwViewportCache || null;
  const find = name => { for (let o = win; o; o = Object.getPrototypeOf(o)) { const d = Object.getOwnPropertyDescriptor(o, name); if (d) return d; } return null; };
  const width = find('innerWidth'), height = find('innerHeight');
  if (typeof width?.get !== 'function' || typeof height?.get !== 'function') return null;
  const cache = { w: 0, h: 0, dirty: true, reads: 0 };
  const refresh = () => { cache.dirty = false; cache.reads++; cache.w = width.get.call(win); cache.h = height.get.call(win); };
  const stale = () => { cache.dirty = true; };
  const define = (name, key) => Object.defineProperty(win, name, {
    configurable: true, enumerable: true,
    get() { if (cache.dirty) refresh(); return cache[key]; },
    // [Replaceable]: an assignment replaces the attribute with a plain value.
    set(value) { Object.defineProperty(win, name, { value, writable: true, configurable: true, enumerable: true }); },
  });
  try { define('innerWidth', 'w'); define('innerHeight', 'h'); }
  catch { return null; }
  win.addEventListener?.('resize', stale, { capture: true, passive: true });
  win.addEventListener?.('orientationchange', stale, { capture: true, passive: true });
  win.visualViewport?.addEventListener?.('resize', stale, { passive: true });
  Object.defineProperty(win, '__iwViewportCache', { value: cache });
  return cache;
}
