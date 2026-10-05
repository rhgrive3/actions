// Narrow exact-anchor runtime adapter for the b19-cl7 PropKit acceptance test.
// Provides just enough browser surface (a no-op 2D canvas + document) for the REAL
// inkwave-public props.js `_makeMaterials()` to run under Node, and wires the vendored
// three.js through a custom resolver. No game/shared adapter, profile or raw tree is touched.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const SRC = new URL('../../../inkwave-public/', import.meta.url).pathname;
const LOADER = new URL('./prop-retention-loader.mjs', import.meta.url).href;
// No-op CanvasRenderingContext2D: every method is a harmless stub, but the few calls whose
// return value is dereferenced (measureText / gradient factories) return usable shapes.
function ctx2d(cv) {
  const gradient = { addColorStop() {} };
  const target = { canvas: cv };
  return new Proxy(target, {
    get(t, p) {
      if (typeof p === 'symbol') return t[p];
      if (p === 'canvas') return t.canvas;
      if (p === 'measureText') return () => ({ width: 24 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createConicGradient') return () => gradient;
      if (p === 'createPattern') return () => ({ setTransform() {} });
      if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (p in t) return t[p];
      return () => undefined; // generic no-op method
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function mockDocument() {
  const makeCanvas = () => {
    const cv = {
      width: 0, height: 0, style: {},
      getContext(type) {
        if (type !== '2d') return null;
        return cv._ctx || (cv._ctx = ctx2d(cv));
      },
      toDataURL() { return 'data:,'; },
      addEventListener() {}, removeEventListener() {},
    };
    return cv;
  };
  return {
    createElement(tag) {
      if (tag === 'canvas') return makeCanvas();
      return { style: {}, appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {} };
    },
    fonts: { add() {}, ready: Promise.resolve() },
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {}, removeChild() {} },
    documentElement: { style: {} },
  };
}

// Load the real native modules. Must be awaited before any PropKit is constructed so that
// `typeof document !== 'undefined'` and build() takes the real (non-headless) merge path.
export async function loadNative(patched = true, practice = false) {
  register(LOADER, import.meta.url, { data: { sourceRoot: SRC } });
  globalThis.document = mockDocument();
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.self) globalThis.self = globalThis;

  const THREE = await import('three');
  const props = await import(pathToFileURL(SRC + '/src/world/props.js').href + '?patched=' + patched + '&practice=' + practice);
  const dressing = await import(pathToFileURL(SRC + '/src/world/dressing.js').href);
  return {
    THREE,
    SRC,
    PropKit: props.PropKit,
    PROP_TYPES: props.PROP_TYPES,
    dressingFor: dressing.dressingFor,
  };
}
