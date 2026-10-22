const canonicalWarmMethods = new WeakSet();
const WARM_PARENT = Symbol.for('inkwave.characterWarmParent');
function canonicalWarm(method) {
  for (let depth = 0; typeof method === 'function' && depth < 8; depth++) {
    if (canonicalWarmMethods.has(method)) return true;
    method = Object.getOwnPropertyDescriptor(method, WARM_PARENT)?.value;
  }
  return false;
}
export function registerCharacterWarmBatch(Character) { canonicalWarmMethods.add(Character.prototype.warmAll); }
// Only the loading coordinator batches shadow warm draws. Each Character still
// prepares and compiles every own variant, using the real renderer receiver.
export function createCharacterShadowBatch(renderer, makeGroup, current = () => true, warn = console.warn) {
  const sm = renderer?.shadowMap;
  const entries = [], facades = new WeakMap();
  let closed = false;
  const direct = (lights, root, camera) => {
    const previous = sm.needsUpdate;
    try { sm.needsUpdate = true; return sm.render(lights, root, camera); }
    finally { sm.needsUpdate = previous; }
  };
  const batch = {
    warm(character, camera, target) {
      if (!canonicalWarm(character.warmAll)) return character.warmAll();
      if (character._sourceMotionDisposed) return;
      return character.warmAll(batch.rendererFor(character), camera, target);
    },
    rendererFor(character) {
      if (!sm || !renderer.compileAsync) return renderer;
      let facade = facades.get(character);
      if (facade) return facade;
      const shadow = Object.create(sm);
      shadow.render = (lights, root, camera, group, parent) => {
        if (!current() || character._sourceMotionDisposed) return;
        const first = entries[0];
        if (closed || entries.length >= 8 || lights.length !== 1 || !lights[0].isDirectionalLight || !group || group.parent !== parent || parent !== character.kid || root !== character.root ||
            first && (first.camera !== camera || first.lights.length !== lights.length || first.lights.some((light, i) => light !== lights[i]))) {
          return direct(lights, root, camera);
        }
        entries.push({ character, root, rootParent: root.parent, camera, group, parent, parentParent: parent.parent, meshes: group.children.slice(), lights: lights.slice() });
      };
      facade = Object.create(renderer);
      Object.defineProperty(facade, 'shadowMap', { value: shadow });
      for (const key of ['getRenderTarget', 'setRenderTarget', 'compileAsync']) {
        Object.defineProperty(facade, key, { value: (...args) => renderer[key](...args) });
      }
      facades.set(character, facade);
      return facade;
    },
    flush() {
      if (closed) return;
      closed = true;
      if (!entries.length) return;
      const visibility = [], attached = [], restoredGroups = [], prepared = [], draw = makeGroup();
      let attempted = false;
      const previous = sm.needsUpdate;
      try {
        if (!current() || !sm.enabled) return;
        for (const entry of entries) {
          // Awaiting other compile jobs permits disconnect, dispose or replacement.
          // Validate every retained identity before resurrecting a temporary group.
          const { character, root, group, parent, meshes } = entry;
          if (character._sourceMotionDisposed || character.root !== root || character.kid !== parent ||
              root.parent !== entry.rootParent || parent.parent !== entry.parentParent ||
              group.parent && group.parent !== parent) continue;
          if (group.children.length ? group.children.length !== meshes.length ||
              group.children.some((mesh, i) => mesh !== meshes[i] || mesh.parent !== group) :
              meshes.some(mesh => mesh.parent)) continue;
          try {
            if (!group.children.length) {
              restoredGroups.push(group);
              for (const mesh of meshes) group.add(mesh);
            }
            if (!group.parent) { parent.add(group); attached.push(entry); }
            root.traverse(object => { visibility.push(object, object.visible); object.visible = true; });
            root.updateMatrixWorld(true);
            // References preserve the actor's real parent and custom hook receiver.
            draw.children.push(root);
            prepared.push(entry);
          } catch (error) { warn('[character] shadow warm preparation', error); }
        }
        if (!prepared.length) return;
        sm.needsUpdate = true;
        attempted = true;
        sm.render(prepared[0].lights, draw, prepared[0].camera);
      } catch (error) {
        warn('[character] shadow warm', error);
        // A combined pass must not suppress otherwise healthy actors when one
        // native draw fails. Keep their prepared visibility and retry separately.
        if (attempted && current()) for (const entry of prepared) {
          if (entry.character._sourceMotionDisposed || entry.character.root !== entry.root || entry.character.kid !== entry.parent || entry.root.parent !== entry.rootParent) continue;
          try { sm.needsUpdate = true; sm.render(entry.lights, entry.root, entry.camera); }
          catch (failure) { warn('[character] shadow warm', failure); }
        }
      }
      finally {
        sm.needsUpdate = previous;
        for (let i = visibility.length - 2; i >= 0; i -= 2) visibility[i].visible = visibility[i + 1];
        for (const entry of attached) { if (entry.group.parent === entry.parent) entry.parent.remove(entry.group); }
        for (const group of restoredGroups) group.clear();
        draw.children.length = 0;
        entries.length = 0;
      }
    },
  };
  return batch;
}
