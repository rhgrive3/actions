import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { adaptQualitySource, qualityIdentity, replaceOnce } from '../adapter.mjs';
import { adaptComposerTarget, createLazyComposerTarget, revertComposerTarget } from '../composer-target-adapter.mjs';

register(new URL('../../../scripts/composer-target-three-loader.mjs', import.meta.url), import.meta.url);
const THREE = await import('three');
const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');

const REL = 'src/core/renderer.js';
const BASELINE = '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';
const read = (rel) => fs.readFileSync(new URL(`../../../inkwave-public/${rel}`, import.meta.url), 'utf8');

function nativeRenderer(pixelRatio = 1) {
  return { getPixelRatio: () => pixelRatio, getSize: (target) => target.set(1, 1) };
}

function ownerDocument() {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener(type, listener) {
      const set = listeners.get(type) || new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) || []) listener();
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

test('#642 baseline: native Three EffectComposer clones both targets in its constructor', () => {
  assert.equal(THREE.REVISION, '186', 'use the vendored Three runtime');
  const target = new THREE.WebGLRenderTarget(640, 360, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(nativeRenderer(), target);

  assert.equal(composer.passes.length, 0, 'the native pair exists before any pass is added');
  assert.ok(composer.renderTarget1.isWebGLRenderTarget);
  assert.ok(composer.renderTarget2.isWebGLRenderTarget);
  assert.notEqual(composer.renderTarget1, composer.renderTarget2);
  assert.equal(composer.renderTarget1.texture.type, THREE.HalfFloatType);
  assert.equal(composer.renderTarget2.texture.type, THREE.HalfFloatType);
  composer.dispose();
});

test('#642 adapter changes only the full production renderer composition and round-trips', () => {
  const raw = read(REL);
  assert.ok(raw.includes(BASELINE));
  assert.ok(raw.indexOf(BASELINE) < raw.indexOf('this.renderPass = new RenderPass(this.scene, this.camera);'));

  const full = adaptComposerTarget(REL, raw, replaceOnce);
  assert.notEqual(full, raw);
  assert.ok(full.includes('createLazyComposerTarget((state) => {'));
  assert.ok(full.includes('type: THREE.HalfFloatType, samples'));
  assert.ok(full.includes('ownerDocument: r.domElement?.ownerDocument'));
  assert.ok(full.includes('Math.round(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio, mobileCap) * s * 1e6) / 1e6'));
  assert.ok(!/UnsignedByteType|UnsignedInt101111Type/.test(full));
  assert.ok(qualityIdentity()['composer-target-adapter.mjs']);
  assert.ok(qualityIdentity()['composer-format-adapter.mjs']);

  const composed = adaptQualitySource(REL, raw);
  assert.ok(composed.includes('composerColorTarget.options'));
  assert.ok(composed.includes('configureComposerColorTargets(THREE, composer, composerColorTarget)'));
  assert.ok(composed.includes('type: THREE.UnsignedInt101111Type'));

  const restored = revertComposerTarget(full);
  assert.ok(restored.includes(BASELINE));
  assert.ok(!restored.includes('function createLazyComposerTarget('));
  assert.equal(adaptComposerTarget(REL, restored, replaceOnce), full);
  assert.equal(adaptComposerTarget('src/config.js', read('src/config.js'), replaceOnce), read('src/config.js'));
  assert.throws(() => adaptComposerTarget(REL, '', replaceOnce), /conflict/);
});

test('#642 lazy native pair keeps HDR across resize, hidden release and offscreen render', () => {
  const doc = ownerDocument();
  const state = { created: 0, rendered: [], targets: [], disposals: 0, passSizes: [] };
  const pass = { setSize(width, height) { state.passSizes.push([width, height]); } };
  const proxy = createLazyComposerTarget((size) => {
    state.created++;
    const target = new THREE.WebGLRenderTarget(
      size.width * size.pixelRatio,
      size.height * size.pixelRatio,
      { type: THREE.HalfFloatType, samples: 0 },
    );
    const composer = new EffectComposer(nativeRenderer(size.pixelRatio), target);
    composer.setSize(size.width, size.height);
    composer.renderTarget1.addEventListener('dispose', () => state.disposals++);
    composer.renderTarget2.addEventListener('dispose', () => state.disposals++);
    state.targets.push(composer.renderTarget1, composer.renderTarget2);
    composer.render = (...args) => {
      state.rendered.push({ args, renderToScreen: composer.renderToScreen });
      return 'native-composer-render';
    };
    return composer;
  }, { width: 320, height: 180, pixelRatio: 1, ownerDocument: doc });

  proxy.addPass(pass);
  proxy.setSize(600, 400);
  proxy.setPixelRatio(1.5);
  assert.equal(state.created, 0, 'pass creation, resize and quality ratio changes stay lazy');
  assert.deepEqual(state.passSizes, []);

  assert.equal(proxy.render('frame'), 'native-composer-render');
  assert.equal(state.created, 1);
  assert.deepEqual(state.passSizes, [[900, 600]]);
  assert.equal(proxy.renderTarget1.width, 900);
  assert.equal(proxy.renderTarget1.height, 600);
  assert.equal(proxy.renderTarget1.texture.type, THREE.HalfFloatType);
  assert.equal(proxy.renderTarget2.texture.type, THREE.HalfFloatType);
  assert.equal(proxy.renderTarget1.samples, 0);
  assert.equal(proxy.renderTarget2.samples, 0);

  assert.equal(doc.listenerCount('webglcontextlost'), 0, 'the adapter leaves context events to Three/WebGLRenderer');
  assert.equal(state.disposals, 0);

  proxy.setSize(640, 360);
  assert.equal(proxy.renderTarget1.width, 960, 'dynamic resize applies to the native target');
  assert.equal(proxy.renderTarget1.height, 540);
  assert.equal(state.disposals, 2, 'native setSize releases the previous target storage');

  proxy.setPixelRatio(1.25);
  assert.equal(proxy.renderTarget1.width, 800, 'dynamic-resolution ratio updates the physical width');
  assert.equal(proxy.renderTarget1.height, 450, 'dynamic-resolution ratio updates the physical height');
  assert.equal(state.disposals, 4, 'native setPixelRatio resizes and releases each old target once');
  proxy.setSize(640, 360);
  assert.equal(state.disposals, 4, 'the following unchanged logical size does not dispose the pair again');

  doc.visibilityState = 'hidden';
  doc.emit('visibilitychange');
  assert.equal(proxy.renderTarget1, null);
  assert.equal(proxy.renderTarget2, null);
  assert.equal(state.disposals, 6, 'hidden release disposes both native targets once');
  assert.equal(proxy.render('hidden-frame'), undefined);
  assert.equal(state.created, 1, 'hidden on-screen frames do not recreate the pair');

  proxy.renderToScreen = false;
  assert.equal(proxy.render('offscreen-frame'), 'native-composer-render');
  assert.equal(state.created, 2, 'explicit offscreen output still materializes while hidden');
  assert.equal(state.rendered.at(-1).renderToScreen, false);
  assert.equal(proxy.renderTarget1.texture.type, THREE.HalfFloatType);

  proxy.dispose();
  proxy.dispose();
  assert.equal(proxy.renderTarget1, null);
  assert.equal(doc.listenerCount('visibilitychange'), 0);
  assert.equal(state.disposals, 8, 'final disposal releases the recreated native pair exactly once');
});

test('#642 quality rebuild disposes the old native pair and preserves the new sample choice', () => {
  const state = { builds: 0, disposed: 0 };
  const makeQuality = (quality) => createLazyComposerTarget((size) => {
    state.builds++;
    const target = new THREE.WebGLRenderTarget(
      size.width * size.pixelRatio,
      size.height * size.pixelRatio,
      { type: THREE.HalfFloatType, samples: quality.samples },
    );
    const composer = new EffectComposer(nativeRenderer(size.pixelRatio), target);
    composer.setSize(size.width, size.height);
    for (const item of [composer.renderTarget1, composer.renderTarget2]) {
      item.addEventListener('dispose', () => state.disposed++);
    }
    composer.render = () => 'rendered';
    return composer;
  }, { ...quality, ownerDocument: ownerDocument() });

  const high = makeQuality({ width: 320, height: 180, pixelRatio: 1, samples: 4 });
  high.addPass({ setSize() {} });
  assert.equal(state.builds, 0);
  assert.equal(high.render(), 'rendered');
  assert.equal(high.renderTarget1.samples, 4);
  assert.equal(high.renderTarget2.samples, 4);
  high.dispose();
  assert.equal(state.disposed, 2);

  const touch = makeQuality({ width: 640, height: 360, pixelRatio: 1.5, samples: 0 });
  touch.addPass({ setSize() {} });
  assert.equal(state.builds, 1, 'the rebuilt quality keeps its targets lazy');
  assert.equal(touch.render(), 'rendered');
  assert.equal(touch.renderTarget1.width, 960);
  assert.equal(touch.renderTarget1.height, 540);
  assert.equal(touch.renderTarget1.samples, 0);
  assert.equal(touch.renderTarget1.texture.type, THREE.HalfFloatType);
  touch.dispose();
  assert.equal(state.disposed, 4);
});
