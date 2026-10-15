// Bounded return-to-attract ownership bridge. Only native requests to dispose
// explicitly character-owned materials are delayed; no actor/geometry is held.
// Repeated disposal requests for the same owned object coalesce into one event.
export const MATERIAL_HANDOFF_MS = 8000;
export const MATERIAL_HANDOFF_LIMIT = 512;
const BASE_OWNED = ['skin','cloth','hair','eye','fill','squid','squidGhost','glow'];
function ownedMaterials(match) {
  const out = new Set();
  const add = m => { if (m?.isMaterial && typeof m.dispose === 'function' && out.size < MATERIAL_HANDOFF_LIMIT) out.add(m); };
  for (const actor of match?.actors || []) {
    const ch = actor.character;
    if (!ch) continue;
    for (const key of BASE_OWNED) add(ch.mats?.[key]);
    for (const m of ch._ownMats || []) add(m);
    for (const pair of ch.matsD || []) for (const m of Object.values(pair || {})) add(m);
    for (const weapon of Object.values(ch.weapons || {})) for (let w = weapon; w; w = w.left) {
      for (const m of w.lamps || []) add(m); add(w.coil);
    }
  }
  return out;
}
function replacementMaterials(match) {
  const out = ownedMaterials(match);
  for (const actor of match?.actors || []) actor.character?.root?.traverse?.(o => {
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.isMaterial) out.add(m);
  });
  return out;
}
export function beginMaterialHandoff(game, previous, renderer, env = globalThis) {
  game._materialHandoff?.release('superseded');
  const records = new Map();
  // Do not retain previous/actors in any callback below.
  for (const material of ownedMaterials(previous)) {
    const descriptor = Object.getOwnPropertyDescriptor(material, 'dispose');
    if ((descriptor && !descriptor.configurable) || (!descriptor && !Object.isExtensible(material))) continue;
    records.set(material, { material, descriptor, native: material.dispose, pending: false, wrapper: null, observedDispose: null });
  }
  previous = null;
  let active = true, timer = null;
  const canvas = renderer?.domElement;
  const report = error => { try { env.console?.warn?.('[inkwave] material handoff cleanup', error); } catch {} };
  const restore = r => {
    if (r.material.dispose !== r.wrapper) return;
    if (r.descriptor) Object.defineProperty(r.material, 'dispose', r.descriptor);
    else delete r.material.dispose;
  };
  const retire = r => {
    records.delete(r.material); restore(r);
    if (r.observedDispose) { r.material.removeEventListener('dispose', r.observedDispose); r.observedDispose = null; }
    if (r.pending) { r.pending = false; try { Reflect.apply(r.native, r.material, []); } catch (error) { report(error); } }
  };
  const lost = () => hold.release('context-lost');
  const hold = {
    get active() { return active; },
    get retained() { return [...records.values()].filter(r => r.pending).length; },
    release(_reason) {
      if (!active) return;
      active = false;
      if (timer !== null) env.clearTimeout(timer);
      canvas?.removeEventListener?.('webglcontextlost', lost);
      if (game._materialHandoff === hold) game._materialHandoff = null;
      for (const r of [...records.values()]) retire(r);
      records.clear();
    },
    dispose(fn) {
      if (!active) return fn();
      for (const r of records.values()) {
        r.wrapper = function () { r.pending = true; };
        Object.defineProperty(r.material, 'dispose', { configurable: true, writable: true, enumerable: r.descriptor?.enumerable ?? false, value: r.wrapper });
      }
      try { return fn(); }
      catch (error) { hold.release('dispose-failed'); throw error; }
      finally {
        // Interception ends with native teardown, even for retained records.
        // A later outside dispose keeps its native behavior and satisfies the
        // delayed obligation rather than being delivered a second time.
        for (const r of [...records.values()]) {
          restore(r);
          if (!r.pending) { retire(r); continue; }
          r.observedDispose = () => { r.pending = false; retire(r); };
          r.material.addEventListener('dispose', r.observedDispose);
        }
      }
    },
    setup(fn, replacement) {
      // Native setup has no draw. If a setup callback introduces rendering or
      // compilation, conservatively release before that work can reuse a mat.
      const undo = [];
      if (active) for (const key of ['render','compile','compileAsync']) {
        const native = renderer?.[key]; if (typeof native !== 'function') continue;
        const descriptor = Object.getOwnPropertyDescriptor(renderer, key);
        if ((descriptor && !descriptor.configurable) || (!descriptor && !Object.isExtensible(renderer))) { hold.release('unhookable-setup'); break; }
        const wrapper = function (...args) { hold.release('setup-render'); return Reflect.apply(native, this, args); };
        Object.defineProperty(renderer, key, { configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: wrapper });
        undo.push(() => { if (renderer[key] === wrapper) { if (descriptor) Object.defineProperty(renderer, key, descriptor); else delete renderer[key]; } });
      }
      try {
        const result = fn();
        // Same-object transfer forfeits this optimization: fire old disposal
        // BEFORE the next lifecycle phase or warmup initializes its program.
        if (active) for (const material of replacementMaterials(replacement())) {
          const r = records.get(material); if (r) retire(r);
        }
        return result;
      } catch (error) { hold.release('setup-failed'); throw error; }
      finally { for (const restore of undo.reverse()) restore(); }
    },
    warm(fn) {
      let pending;
      try { pending = fn(); } catch (error) { hold.release('warm-threw'); throw error; }
      Promise.resolve(pending).then(() => hold.release('warm-settled'), () => hold.release('warm-rejected'));
      return pending;
    },
  };
  game._materialHandoff = hold;
  canvas?.addEventListener?.('webglcontextlost', lost);
  timer = env.setTimeout(() => hold.release('timeout'), MATERIAL_HANDOFF_MS);
  return hold;
}
const INSTALLED = Symbol.for('inkwave.material-handoff.cancel');
export function installMaterialHandoffCancellation(Game) {
  const p = Game.prototype; if (Object.hasOwn(p, INSTALLED)) return;
  Object.defineProperty(p, INSTALLED, { value: true });
  for (const name of ['_beginMatchFlow','_buildWorld','_applyNight','_setPalette']) {
    const native = p[name]; if (typeof native !== 'function') throw new Error('Missing material handoff boundary: '+name);
    p[name] = function (...args) { this._materialHandoff?.release(name); return Reflect.apply(native, this, args); };
  }
}
