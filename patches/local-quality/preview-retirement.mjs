// A settings screen owns one timeout and at most two retiring previews. Normal
// one/two-step navigation retains the full 260 ms fade. Faster bursts release the
// oldest outgoing preview; the current preview is never passed here.
export function createPreviewRetirement({
  now = () => performance.now(),
  schedule = (fn, delay) => setTimeout(fn, delay),
  cancel = (id) => clearTimeout(id),
  maxRetired = 2,
} = {}) {
  if (!(maxRetired === Infinity || Number.isInteger(maxRetired) && maxRetired >= 0)) throw new RangeError("Invalid preview retirement bound");
  const retired = new Map();
  let active = null, draining = false, destroyed = false;
  const arm = () => {
    if (destroyed || draining || active || !retired.size) return;
    let due = Infinity;
    for (const deadline of retired.values()) due = Math.min(due, deadline);
    const token = { id: null };
    active = token;
    token.id = schedule(() => {
      // A canceled callback from a retired screen must not acquire new ownership.
      if (destroyed || active !== token) return;
      active = null;
      draining = true;
      try {
        const time = now();
        for (const [el, deadline] of retired) {
          if (destroyed) break;
          if (deadline > time) continue;
          // Delete first: synchronous remove hooks can retire or destroy again.
          retired.delete(el);
          el.remove();
        }
      } finally {
        draining = false;
        // Preserve later retirements even if a DOM removal throws.
        arm();
      }
    }, Math.max(0, due - now()));
  };
  return {
    retire(el) {
      if (destroyed || retired.has(el)) return;
      retired.set(el, now() + 260);
      try {
        // Delete ownership before DOM removal: hooks may retire/destroy again.
        while(!destroyed&&retired.size>maxRetired){
          const oldest=retired.keys().next().value;retired.delete(oldest);oldest.remove();
        }
      } finally { arm(); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (active) cancel(active.id);
      active = null;
      retired.clear();
    },
  };
}
