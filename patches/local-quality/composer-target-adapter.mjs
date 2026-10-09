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
      const changed = state.pixelRatio !== value;
      state.pixelRatio = value;
      if (native && changed) {
        // EffectComposer.setPixelRatio() resizes both targets itself. Renderer
        // calls setSize() immediately after this during dynamic resolution;
        // avoid disposing those same attachments again when setSize receives
        // the unchanged logical viewport.
        native.setPixelRatio(value);
      }
    },
    setSize(nextWidth, nextHeight) {
      assertLive();
      const changed = state.width !== nextWidth || state.height !== nextHeight;
      state.width = nextWidth;
      state.height = nextHeight;
      if (native && changed) native.setSize(nextWidth, nextHeight);
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

const DYNAMIC_PIXEL_RATIO_BASELINE =
  '    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio, mobileCap) * s;';
const DYNAMIC_PIXEL_RATIO_STABLE =
  '    // Keep integral backing-buffer sizes integral despite floating point multiplication.\n' +
  '    const pr = Math.round(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio, mobileCap) * s * 1e6) / 1e6;';

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
  code = once(code, BASELINE, LAZY_COMPOSER, '#642 lazy HalfFloat composer targets');
  return once(code, DYNAMIC_PIXEL_RATIO_BASELINE, DYNAMIC_PIXEL_RATIO_STABLE, '#642 stable dynamic-resolution target dimensions');
}

// Exact inverse used by the focused baseline regression.
export function revertComposerTarget(code) {
  return code.replace(DYNAMIC_PIXEL_RATIO_STABLE, DYNAMIC_PIXEL_RATIO_BASELINE)
    .replace(LAZY_COMPOSER, BASELINE)
    .replace(HELPER_SOURCE, '');
}
