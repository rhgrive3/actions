// INKWAVE resource policy, not a claimed Nintendo/Switch memory budget.
export const PORTRAIT_PIXELS = Object.freeze({ touch: 512 * 1024, desktop: 96 * 224 * 224 });
export const portraitPixels = cache => [...cache.values()].reduce((n, cv) => n + cv.width * cv.height, 0);
export function releasePortrait(cv) { if (cv) { cv.width = 0; cv.height = 0; } }
export function clearPortraitCache(owner) {
  for (const cv of owner._pcache.values()) releasePortrait(cv);
  owner._pcache.clear(); owner._portraitCacheEpoch = (owner._portraitCacheEpoch || 0) + 1;
}
export function cachePortrait(owner, key, cv, touch, epoch) {
  if (owner._portraitDisposed || epoch !== (owner._portraitCacheEpoch || 0) || (touch && owner.mode !== 'locker')) return false;
  const cap = touch ? PORTRAIT_PIXELS.touch : PORTRAIT_PIXELS.desktop;
  const pixels = cv.width * cv.height;
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels > cap) return false;
  const previous = owner._pcache.get(key);
  if (previous && previous !== cv) releasePortrait(previous);
  owner._pcache.delete(key); owner._pcache.set(key, cv);
  while (owner._pcache.size > 96 || portraitPixels(owner._pcache) > cap) {
    const oldest = owner._pcache.keys().next().value;
    releasePortrait(owner._pcache.get(oldest)); owner._pcache.delete(oldest);
  }
  return true;
}
export function installPortraitBudget(Showcase, G) {
  const p = Showcase.prototype;
  for (const name of ['hide', 'showLoadout', 'showHub', 'showLobby', 'showResults', 'dispose']) {
    const original = p[name];
    if (!original) continue;
    p[name] = function (...args) {
      if (name === 'dispose') this._portraitDisposed = true;
      if (name === 'dispose' || G.game?.mobile?.touch) clearPortraitCache(this);
      return original.apply(this, args);
    };
  }
}
// Preserve the last camera matrix together with its texture on skipped frames.
// Resize, re-enable, quality change and frame-clock reset always force a redraw.
export function reflectionDue(env, policy, width, height, scale) {
  const key = [scale, policy.reflectionInterval, policy.reflectionActors].join(':');
  const age = env._frameId - env._reflRenderedFrame;
  const same = env._reflRT?.width === width && env._reflRT?.height === height && env._reflPolicy === key;
  if (same && env.U.uReflOn.value && age >= 0 && age < policy.reflectionInterval) return false;
  // Stored only after the real render succeeds (the caller commits this key).
  env._reflPendingPolicy = key;
  return true;
}
