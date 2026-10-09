// Render actual character geometry/skeletons in a second, private colour pass.
// No gameplay mesh/material is modified and no geometry/skeleton is disposed.
const installed = new WeakMap();
export function installPrivateTrackingRenderer({ G, THREE, on }, opacityFor) {
  function attach() {
    const renderer = G.renderer;
    if (!renderer?.render || installed.has(renderer)) return;
    const native = renderer.render, scene = new THREE.Scene(), entries = new Map();
    let rendering = false;
    function retire(actor) {
      const entry = entries.get(actor); if (!entry) return;
      for (const proxy of entry.meshes.values()) scene.remove(proxy);
      entry.material.dispose(); entries.delete(actor);
    }
    function clear() { for (const actor of entries.keys()) retire(actor); }
    function sync(actor, alpha) {
      const root = actor.character?.root;
      if (!root?.traverse || !root.visible) { retire(actor); return; }
      let entry = entries.get(actor);
      if (entry?.root !== root) { retire(actor); entry = null; }
      if (!entry) {
        const material = new THREE.MeshBasicMaterial({ color: actor.color || G.teamColors[actor.team],
          transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
        entry = { root, material, meshes: new Map() }; entries.set(actor, entry);
      }
      entry.material.opacity = alpha;
      const used = new Set();
      root.traverse(source => {
        if (!source.isMesh) return;
        let visible = true;
        for (let p = source; p; p = p.parent) { if (!p.visible) { visible = false; break; } if (p === root) break; }
        if (!visible) return;
        used.add(source);
        let proxy = entry.meshes.get(source);
        if (!proxy) {
          proxy = source.clone(false); proxy.material = entry.material;
          proxy.castShadow = proxy.receiveShadow = false; proxy.frustumCulled = false;
          proxy.matrixAutoUpdate = proxy.matrixWorldAutoUpdate = false;
          proxy.onBeforeRender = proxy.onAfterRender = () => {};
          if (proxy.isSkinnedMesh) proxy.bindMode = 'detached';
          entry.meshes.set(source, proxy); scene.add(proxy);
        }
        proxy.geometry = source.geometry;
        proxy.matrix.copy(source.matrixWorld); proxy.matrixWorld.copy(source.matrixWorld);
        if (proxy.isSkinnedMesh) {
          proxy.skeleton = source.skeleton;
          proxy.bindMatrix.copy(source.bindMatrix); proxy.bindMatrixInverse.copy(source.bindMatrixInverse);
        }
        if (source.morphTargetInfluences) proxy.morphTargetInfluences = source.morphTargetInfluences;
      });
      for (const [source, proxy] of entry.meshes) if (!used.has(source)) { scene.remove(proxy); entry.meshes.delete(source); }
    }
    renderer.render = function (source, camera, ...args) {
      const result = native.call(this, source, camera, ...args);
      if (rendering || source !== G.scene || source.overrideMaterial || camera !== G.camera) return result;
      const viewer = G.match?.local, actors = G.match?.actors;
      if (!viewer?.alive || viewer.remote || G.match?.attract || G.match?.state !== 'playing' ||
          (G.rig?.mapK || 0) > .05 || G.rig?.mapOpen || !Array.isArray(actors)) { clear(); return result; }
      const shown = new Set();
      for (const actor of actors) {
        const alpha = opacityFor(actor, viewer, G.time);
        if (!(alpha > 0)) continue;
        // Visible geometry already has its ordinary pass; silhouettes add only
        // the verified terrain-occluded information to this viewer.
        if (G.physics?.los?.(camera.position, actor.pos) !== false) continue;
        shown.add(actor); sync(actor, alpha);
      }
      for (const actor of entries.keys()) if (!shown.has(actor)) retire(actor);
      if (scene.children.length) {
        const autoClear = this.autoClear; rendering = true; this.autoClear = false;
        try { native.call(this, scene, camera); }
        finally { this.autoClear = autoClear; rendering = false; }
      }
      return result;
    };
    const dispose = renderer.dispose;
    if (dispose) renderer.dispose = function (...args) { clear(); return dispose.apply(this, args); };
    installed.set(renderer, { clear });
    on?.('match:state', ({ state }) => { if (state !== 'playing') clear(); });
  }
  attach(); return attach;
}
