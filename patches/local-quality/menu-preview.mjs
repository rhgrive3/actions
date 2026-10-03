// Only DOM previews owned by a live Menus instance are observed. Native UI
// labs keep their original behavior. One observer/target per menu; screen
// swaps, preview replacements and disposal explicitly release the target.
const roots = new WeakMap();
export function preparePreviewRoot(root, env = globalThis) {
  if (!root || roots.has(root) || typeof env.IntersectionObserver !== 'function') return;
  const state = { target: null, visible: true, disposed: false, observer: null };
  state.observer = new env.IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === state.target)
      state.visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
  }, { root: null, rootMargin: '64px', threshold: 0 });
  roots.set(root, state);
}
export function clearPreviewRoot(root, dispose = false) {
  const state = roots.get(root); if (!state) return;
  if (state.target) state.observer.unobserve(state.target);
  state.target = null; state.visible = true;
  if (dispose) { state.disposed = true; state.observer.disconnect(); roots.delete(root); }
}
export function guardPreview(preview) {
  if (!preview?.el || typeof preview.tick !== 'function') return preview;
  const tick = preview.tick, el = preview.el;
  let state = null;
  preview.tick = function(dt) {
    if (!state) {
      const root = el.closest?.('.iw-ui');
      state = root && roots.get(root);
    }
    // No Menus owner or no browser observer: do not change standalone previews.
    if (!state || state.disposed) return tick.call(this, dt);
    if (state.target !== el) {
      if (state.target) state.observer.unobserve(state.target);
      state.target = el; state.visible = true; state.observer.observe(el);
    }
    // Observer results are conservative (64px pre-roll). No per-frame layout
    // query, no accumulated catch-up on reveal, no changes to set() or inputs.
    if (state.visible) return tick.call(this, dt);
  };
  return preview;
}
