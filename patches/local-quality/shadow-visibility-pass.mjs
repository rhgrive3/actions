// Entries weakly own scene nodes and expire at every synchronous validation pass.
export function beginShadowVisibilityPass(owner) {
  let state = owner._visibilityPass;
  if (!state || state.epoch === Number.MAX_SAFE_INTEGER) {
    state = owner._visibilityPass = { nodes: new WeakMap(), epoch: 0, path: [] };
  }
  state.epoch++;
  return state;
}
export function shadowVisibleForPass(object, state) {
  const path = state.path;
  let node = object, result = false;
  try {
    while (node) {
      const known = state.nodes.get(node);
      if (known?.epoch === state.epoch) { result = known.visible; break; }
      path.push(node);
      if (!node.visible) break;
      if (!node.parent) { result = node.isScene === true; break; }
      node = node.parent;
    }
    for (const item of path) {
      let record = state.nodes.get(item);
      if (!record) state.nodes.set(item, record = {});
      record.epoch = state.epoch;
      record.visible = result;
    }
    return result;
  } finally { path.length = 0; }
}
