const owned = new WeakMap();
const MAX_SCRATCH = 2;

function stateFor(showcase) {
  let state = owned.get(showcase);
  if (!state) {
    state = { owner: null, epoch: 0, buffers: [], images: [] };
    owned.set(showcase, state);
  }
  return state;
}

function styleIdentity(style) {
  return JSON.stringify(Object.keys(style || {}).sort().map((key) => [key, typeof style[key], String(style[key])]));
}

function portraitIdentity(req, kind, CharacterClass) {
  return {
    CharacterClass,
    key: `${kind === 'body' ? 'lobby_pose' : 'menu_idle'}|${req.weapon || 'shooter'}|${styleIdentity(req.style)}`,
  };
}

function releaseOwner(showcase, state = owned.get(showcase)) {
  const owner = state?.owner;
  if (!owner) return;
  state.owner = null;
  try { owner.dispose?.(); } catch (error) { console.warn('[showcase] portrait character dispose', error); }
}

function clearScratch(state) {
  state.epoch++;
  state.buffers.length = 0;
  state.images.length = 0;
}

function retire(showcase) {
  const state = owned.get(showcase);
  if (!state) return;
  releaseOwner(showcase, state);
  clearScratch(state);
}

function freeSlot(slots, size, create) {
  let slot = slots.find((entry) => !entry.busy && entry.size === size);
  if (!slot) slot = slots.find((entry) => !entry.busy);
  if (!slot && slots.length < MAX_SCRATCH) {
    slot = { size: 0, value: null, busy: false };
    slots.push(slot);
  }
  if (!slot) throw new Error('INKWAVE portrait scratch slots exhausted');
  if (slot.size !== size || !slot.value) {
    slot.value = create();
    slot.size = size;
  }
  slot.busy = true;
  return slot;
}

export function acquirePortraitReadback(showcase, size) {
  const state = stateFor(showcase);
  const epoch = state.epoch;
  const slot = freeSlot(state.buffers, size, () => new Uint8Array(size * size * 4));
  let released = false;
  return {
    buffer: slot.value,
    release() {
      if (released) return;
      released = true;
      slot.busy = false;
      if (state.epoch !== epoch || !state.buffers.includes(slot)) slot.value = null;
    },
  };
}

export function releasePortraitReadback(_showcase, lease) {
  lease?.release();
}

export function portraitCanvasFromBuffer(showcase, context, size, buffer, canvas) {
  const state = stateFor(showcase);
  const slot = freeSlot(state.images, size, () => context.createImageData(size, size));
  const image = slot.value;
  try {
    const row = size * 4;
    for (let y = 0; y < size; y++) image.data.set(buffer.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    context.putImageData(image, 0, 0);
    return canvas;
  } finally {
    slot.busy = false;
    if (!state.images.includes(slot)) slot.value = null;
  }
}

export function installPortraitCost(Showcase) {
  const proto = Showcase.prototype;
  if (proto._portraitCostInstalled) return;
  Object.defineProperty(proto, '_portraitCostInstalled', { value: true });

  const renderRun = proto._renderPortraitRun;
  proto._renderPortraitRun = function (req, size, kind, renderer) {
    const state = stateFor(this);
    const NativeCharacter = this.CharacterClass;
    const identity = portraitIdentity(req, kind, NativeCharacter);
    const prior = state.owner;
    const reuse = !!prior && prior.CharacterClass === identity.CharacterClass && prior.key === identity.key;
    if (prior && !reuse) releaseOwner(this, state);

    let candidate = null;
    this.CharacterClass = function PortraitCharacter(opts) {
      if (reuse) return prior.character;
      const character = Reflect.construct(NativeCharacter, [opts]);
      candidate = {
        CharacterClass: NativeCharacter,
        key: identity.key,
        character,
        dispose: typeof character.dispose === 'function' ? character.dispose.bind(character) : null,
      };
      // _renderPortraitRun owns the normal cleanup site. Keep this one private
      // character alive there, then dispose it through the bounded owner above.
      character.dispose = () => {};
      return character;
    };

    try {
      if (reuse) {
        const color = this._c2.set(req.color || this.color);
        prior.character.setColor(color);
        // The identity includes weapon; this native call is consequently a no-op for
        // exact reuse, while keeping the selected native attachment authoritative.
        prior.character.setWeapon(req.weapon || 'shooter');
        prior.character.setDance(kind === 'body' ? 'lobby_pose' : 'menu_idle');
      }
      const result = renderRun.call(this, req, size, kind, renderer);
      const owner = reuse ? prior : candidate;
      if (owner) {
        if (!reuse) {
          owner.character.update = () => {};
          state.owner = owner;
        }
        const settledOwner = owner;
        if (result && typeof result.catch === 'function') {
          result.catch(() => {
            if (state.owner === settledOwner) releaseOwner(this, state);
            clearScratch(state);
          });
        }
      }
      return result;
    } catch (error) {
      if (candidate) { try { candidate.dispose?.(); } catch {} }
      if (reuse) releaseOwner(this, state);
      throw error;
    } finally {
      this.CharacterClass = NativeCharacter;
    }
  };

  for (const method of ['hide', '_clear', 'dispose']) {
    const original = proto[method];
    if (typeof original !== 'function') continue;
    proto[method] = function (...args) {
      try { return original.apply(this, args); }
      finally { retire(this); }
    };
  }
}
