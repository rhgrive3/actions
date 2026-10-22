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
      return canonicalWarm(character.warmAll) ? character.warmAll(batch.rendererFor(character), camera, target) : character.warmAll();
    },
    rendererFor(character) {
      if (!sm || !renderer.compileAsync) return renderer;
      let facade = facades.get(character);
      if (facade) return facade;
      const shadow = Object.create(sm);
      shadow.render = (lights, root, camera, group, parent) => {
        if (!current()) return;
        const first = entries[0];
        if (closed || entries.length >= 8 || lights.length !== 1 || !lights[0].isDirectionalLight || !group || group.parent !== parent || parent !== character.kid || root !== character.root ||
            first && (first.camera !== camera || first.lights.length !== lights.length || first.lights.some((light, i) => light !== lights[i]))) {
          return direct(lights, root, camera);
        }
        entries.push({ root, camera, group, parent, meshes: group.children.slice(), lights: lights.slice() });
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
      const visibility = [], attached = [], restoredGroups = [], draw = makeGroup();
      let attempted = false;
      const previous = sm.needsUpdate;
      try {
        if (!current() || !sm.enabled) return;
        for (const entry of entries) {
          // warmAll detached exactly this temporary group after its synchronous
          // compile phase. Never resurrect a disposed/replaced character group.
          if (entry.group.parent && entry.group.parent !== entry.parent) {
            throw Error('Character warm group changed ownership');
          }
          if (!entry.group.children.length) {
            restoredGroups.push(entry.group);
            for (const mesh of entry.meshes) {
              if (mesh.parent) throw Error('Character warm mesh changed ownership');
              entry.group.add(mesh);
            }
          }
          if (!entry.group.parent) { entry.parent.add(entry.group); attached.push(entry); }
          entry.root.traverse(object => { visibility.push(object, object.visible); object.visible = true; });
          entry.root.updateMatrixWorld(true);
          // References preserve the actor's real parent and custom hook receiver.
          draw.children.push(entry.root);
        }
        sm.needsUpdate = true;
        attempted = true;
        sm.render(entries[0].lights, draw, entries[0].camera);
      } catch (error) {
        warn('[character] shadow warm', error);
        // A combined pass must not suppress otherwise healthy actors when one
        // native draw fails. Keep their prepared visibility and retry separately.
        if (attempted && current()) for (const entry of entries) {
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
