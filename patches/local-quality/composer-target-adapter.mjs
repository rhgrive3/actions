// Issue #642: build the post stack as pass descriptions first, then create the
// native EffectComposer (and its HalfFloat ping-pong pair) only on first render.
// A hidden page releases that native pair; a visible frame recreates it with the
// same dimensions, samples and HalfFloat format. Explicit offscreen output still
// renders while the page is hidden.

export function createLazyComposerTarget(createNative, {
  width = 1,
  height = 1,
  pixelRatio = 1,
  ownerDocument = null,
} = {}) {
  if (typeof createNative !== 'function') throw new TypeError('composer factory is required');

  const state = { width, height, pixelRatio };
  const passes = [];
  let native = null;
  let disposed = false;
  let renderToScreen = true;

  const isHidden = () => ownerDocument?.visibilityState === 'hidden';
  const releaseNative = () => {
    if (!native) return;
    const current = native;
    native = null;
    current.dispose?.();
  };
  const onVisibilityChange = () => {
    if (renderToScreen && isHidden()) releaseNative();
  };
  ownerDocument?.addEventListener?.('visibilitychange', onVisibilityChange);

  const assertLive = () => {
    if (disposed) throw new Error('composer has been disposed');
  };
  const ensureNative = () => {
    assertLive();
    if (native) return native;

    const next = createNative({ ...state });
    if (!next || typeof next.addPass !== 'function' || typeof next.render !== 'function') {
      next?.dispose?.();
      throw new TypeError('composer factory returned an invalid EffectComposer');
    }

    next.renderToScreen = renderToScreen;
    try {
      for (const pass of passes) next.addPass(pass);
    } catch (error) {
      next.dispose?.();
      throw error;
    }
    native = next;
    return native;
  };

  const proxy = {
    passes,
    addPass(pass) {
      assertLive();
      passes.push(pass);
      try {
        native?.addPass(pass);
      } catch (error) {
        passes.pop();
        throw error;
      }
    },
    setPixelRatio(value) {
      assertLive();
      state.pixelRatio = value;
      native?.setPixelRatio(value);
    },
    setSize(nextWidth, nextHeight) {
      assertLive();
      state.width = nextWidth;
      state.height = nextHeight;
      native?.setSize(nextWidth, nextHeight);
    },
    render(...args) {
      assertLive();
      if (renderToScreen && isHidden()) {
        releaseNative();
        return undefined;
      }
      return ensureNative().render(...args);
    },
    reset(...args) {
      return ensureNative().reset(...args);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ownerDocument?.removeEventListener?.('visibilitychange', onVisibilityChange);
      releaseNative();
      passes.length = 0;
    },
    get renderToScreen() {
      return renderToScreen;
    },
    set renderToScreen(value) {
      renderToScreen = !!value;
      if (native) native.renderToScreen = renderToScreen;
      if (renderToScreen && isHidden()) releaseNative();
    },
  };

  for (const key of ['renderTarget1', 'renderTarget2', 'readBuffer', 'writeBuffer']) {
    Object.defineProperty(proxy, key, {
      enumerable: true,
      get: () => native?.[key] ?? null,
      set: (value) => {
        assertLive();
        if (native) native[key] = value;
      },
    });
  }

  return proxy;
}

const BASELINE =
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });\n' +
  '    const comp = (this.composer = new EffectComposer(r, rt));\n' +
  '    comp.setPixelRatio(pr);\n' +
  '    comp.setSize(w, h);';

const HELPER_ANCHOR = 'const BLOOM = [0.28, 0.45, 2.4];';
const HELPER_SOURCE = `${createLazyComposerTarget.toString()}\n\n`;
const LAZY_COMPOSER =
  '    const comp = (this.composer = createLazyComposerTarget((state) => {\n' +
  '      const rt = new THREE.WebGLRenderTarget(\n' +
  '        state.width * state.pixelRatio, state.height * state.pixelRatio,\n' +
  '        { type: THREE.HalfFloatType, samples });\n' +
  '      const composer = new EffectComposer(r, rt);\n' +
  '      // r already has this pixel ratio; set logical size without a transient oversize.\n' +
  '      composer.setSize(state.width, state.height);\n' +
  '      return composer;\n' +
  '    }, { width: w, height: h, pixelRatio: pr, ownerDocument: r.domElement?.ownerDocument }));\n' +
  '    comp.setPixelRatio(pr);\n' +
  '    comp.setSize(w, h);';

export function adaptComposerTarget(rel, code, once) {
  if (rel !== 'src/core/renderer.js') return code;
  code = once(code, HELPER_ANCHOR, `${HELPER_SOURCE}${HELPER_ANCHOR}`, '#642 lazy composer helper');
  return once(code, BASELINE, LAZY_COMPOSER, '#642 lazy HalfFloat composer targets');
}

// Exact inverse used by the focused baseline regression.
export function revertComposerTarget(code) {
  return code.replace(LAZY_COMPOSER, BASELINE).replace(HELPER_SOURCE, '');
}
