// #1659: the frozen offline-pause arena must not depend on the default drawing
// buffer surviving page composition. The finished frame is retained once and
// presented with one cheap draw per visible frame; the world and composer are
// not rendered again while the paused scene is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const composedMain = adaptBuildSource('src/main.js', fs.readFileSync(path.join(ROOT, 'inkwave-public/src/main.js'), 'utf8'));

// The composed render gate, taken from the real production source.
const gateStart = composedMain.indexOf('      if (!setUp && (!menuAttractBudget || this._menuAttractFrame)) {');
const gateEnd = composedMain.indexOf('\n      if (this.showcase.mode) sm.needsUpdate = true;', gateStart);
assert.ok(gateStart > 0 && gateEnd > gateStart, 'composed render gate found');
const gate = new Function('pausedFrame', 'sm', 'setUp', 'menuAttractBudget', composedMain.slice(gateStart, gateEnd));

function frame({ paused, draw, present = true, capture = true, hasSnapshotApi = true, sunMap = true }) {
  const calls = [];
  const sm = { enabled: sunMap, needsUpdate: false };
  const R = {
    render() { calls.push(['render', sm.needsUpdate]); },
  };
  if (hasSnapshotApi) {
    R.presentPausedFrame = () => { calls.push(['present']); return present; };
    R.capturePausedFrame = () => { calls.push(['capture']); return capture; };
  }
  const game = { R, _pausedWorld: { stale: true }, _menuAttractFrame: false };
  const pausedFrame = { paused, draw, commit() { calls.push(['commit']); } };
  gate.call(game, pausedFrame, sm, false, false);
  return { calls, game, sm };
}

test('live frames render normally and never touch the retained frame', () => {
  const { calls } = frame({ paused: false, draw: true });
  assert.deepEqual(calls.map(c => c[0]), ['render']);
});

test('the first paused frame renders once, retains the finished frame, then commits', () => {
  const { calls, sm } = frame({ paused: true, draw: true });
  assert.deepEqual(calls, [['render', true], ['capture'], ['commit']], 'sun map refreshed for exactly that draw');
  assert.equal(sm.needsUpdate, false);
});

test('a backdrop that cannot be retained is not committed, so the next frame draws it again', () => {
  const { calls } = frame({ paused: true, draw: true, capture: false });
  assert.deepEqual(calls.map(c => c[0]), ['render', 'capture']);
});

test('120 unchanged paused frames present the retained frame and never render the world', () => {
  let renders = 0, presents = 0;
  for (let i = 0; i < 120; i++) {
    const { calls } = frame({ paused: true, draw: false });
    renders += calls.filter(c => c[0] === 'render').length;
    presents += calls.filter(c => c[0] === 'present').length;
    assert.ok(!calls.some(c => c[0] === 'capture' || c[0] === 'commit'));
  }
  assert.equal(renders, 0);
  assert.equal(presents, 120, 'exactly one lightweight presentation per visible frame');
});

test('a missing or rejected snapshot falls back to a full render and retains again', () => {
  const { calls, game, sm } = frame({ paused: true, draw: false, present: false });
  assert.deepEqual(calls, [['present'], ['render', true], ['capture'], ['commit']]);
  assert.equal(game._pausedWorld, null, 'the cached frozen-world record is invalidated');
  assert.equal(sm.needsUpdate, false);
});

test('renderers without the snapshot API keep the previous idle behaviour', () => {
  const { calls } = frame({ paused: true, draw: false, hasSnapshotApi: false });
  assert.deepEqual(calls, []);
});

test('resume releases the retained frame before the live path renders', () => {
  const start = composedMain.indexOf('    const pausedFrame = pausedWorldFrame(this, G);');
  const line = composedMain.slice(start, composedMain.indexOf('\n', composedMain.indexOf('releasePausedFrame', start)));
  assert.match(line, /if \(!pausedFrame\.paused\) this\.R\?\.releasePausedFrame\?\.\(\);/);
});

// ---- the real Renderer extension, with real three.js objects and a fake GL renderer
async function loadModule() {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  const vendor = path.join(ROOT, 'inkwave-public/vendor/three');
  const resolve = (spec, from) => spec === 'three' ? path.join(vendor, 'build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(vendor, 'jsm', spec.slice(13))
      : path.resolve(path.dirname(from), spec);
  const load = file => {
    if (modules.has(file)) return modules.get(file);
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod);
    return mod;
  };
  const entry = load(path.join(ROOT, 'patches/local-quality/paused-frame-snapshot.mjs'));
  await entry.link((spec, ref) => load(resolve(spec, ref.identifier)));
  await entry.evaluate();
  return entry.namespace;
}

function fakeRenderer({ width = 640, height = 360 } = {}) {
  const log = { copies: [], draws: [], worldRenders: 0 };
  const state = { lost: false, target: null, autoClear: true, width, height };
  const renderer = {
    getContext: () => ({ isContextLost: () => state.lost }),
    getRenderTarget: () => state.target,
    setRenderTarget(t) { state.target = t; },
    get autoClear() { return state.autoClear; },
    set autoClear(v) { state.autoClear = v; },
    getDrawingBufferSize: target => target.set(state.width, state.height),
    copyFramebufferToTexture(texture) { if (state.copyFails) throw new Error('copy failed'); log.copies.push(texture); },
    // FullScreenQuad.render() calls renderer.render(mesh, camera): the only draw a paused frame may make.
    render(object) { log.draws.push({ material: object.material, target: state.target, autoClear: state.autoClear }); },
  };
  return { renderer, log, state };
}

async function rendererClass() {
  const { installPausedFrameSnapshot } = await loadModule();
  class Renderer { constructor(fake) { this.renderer = fake; } }
  installPausedFrameSnapshot(Renderer);
  installPausedFrameSnapshot(Renderer); // idempotent
  return Renderer;
}

test('capture retains one GPU framebuffer copy and reuses it while the size is unchanged', async () => {
  const Renderer = await rendererClass(), { renderer, log } = fakeRenderer(), r = new Renderer(renderer);
  assert.equal(r.capturePausedFrame(), true);
  const first = r._pauseSnapshot;
  assert.equal(first.image.width, 640);
  assert.equal(first.image.height, 360);
  assert.equal(r.capturePausedFrame(), true);
  assert.equal(r._pauseSnapshot, first, 'no reallocation for an unchanged buffer');
  assert.deepEqual(log.copies, [first, first]);
});

test('presenting draws one fullscreen quad with the retained texture and restores renderer state', async () => {
  const Renderer = await rendererClass(), { renderer, log, state } = fakeRenderer(), r = new Renderer(renderer);
  assert.equal(r.presentPausedFrame(), false, 'nothing retained yet: the caller must render');
  r.capturePausedFrame();
  const sentinel = { sentinel: true };
  state.target = null; state.autoClear = true;
  for (let i = 0; i < 120; i++) assert.equal(r.presentPausedFrame(), true);
  assert.equal(log.worldRenders, 0);
  assert.equal(log.draws.length, 120);
  for (const draw of log.draws) {
    assert.equal(draw.target, null, 'drawn to the default framebuffer');
    assert.equal(draw.material.uniforms.tFrame.value, r._pauseSnapshot);
    assert.equal(draw.material.toneMapped, false, 'the frame is already output-encoded; no second colour management');
  }
  assert.equal(state.autoClear, true);
  assert.equal(state.target, null);
  assert.equal(new Set(log.draws.map(d => d.material)).size, 1, 'one reusable presentation material');
  assert.ok(sentinel);
});

test('release disposes the snapshot and its material exactly once', async () => {
  const Renderer = await rendererClass(), { renderer } = fakeRenderer(), r = new Renderer(renderer);
  r.capturePausedFrame(); r.presentPausedFrame();
  const snapshot = r._pauseSnapshot, material = r._pauseQuad.material;
  let disposed = { snapshot: 0, material: 0 };
  snapshot.dispose = () => { disposed.snapshot++; };
  material.dispose = () => { disposed.material++; };
  r.releasePausedFrame(); r.releasePausedFrame();
  assert.deepEqual(disposed, { snapshot: 1, material: 1 });
  assert.equal(r._pauseSnapshot, null);
  assert.equal(r._pauseQuad, null);
  assert.equal(r.presentPausedFrame(), false);
});

test('resizing, context loss, a composer target or a failed copy never present a stale or partial frame', async () => {
  const Renderer = await rendererClass();
  {
    const { renderer, state } = fakeRenderer(), r = new Renderer(renderer);
    r.capturePausedFrame(); state.width = 800;
    assert.equal(r.presentPausedFrame(), false, 'size changed since capture');
    assert.equal(r._pauseSnapshot, null);
  }
  {
    const { renderer, state } = fakeRenderer(), r = new Renderer(renderer);
    r.capturePausedFrame(); state.lost = true;
    assert.equal(r.presentPausedFrame(), false);
    assert.equal(r._pauseSnapshot, null, 'a lost context drops the texture');
    assert.equal(r.capturePausedFrame(), false);
  }
  {
    const { renderer, state } = fakeRenderer(), r = new Renderer(renderer);
    state.target = { composerIntermediate: true };
    assert.equal(r.capturePausedFrame(), false, 'only the final default framebuffer is retained');
    assert.equal(r._pauseSnapshot, null);
  }
  {
    const { renderer, state } = fakeRenderer(), r = new Renderer(renderer), warn = console.warn;
    state.copyFails = true; console.warn = () => {};
    try { assert.equal(r.capturePausedFrame(), false); } finally { console.warn = warn; }
    assert.equal(r._pauseSnapshot, null, 'a failed copy leaves nothing behind');
  }
});

test('a changed drawing-buffer size recaptures into a new texture and releases the old one', async () => {
  const Renderer = await rendererClass(), { renderer, state } = fakeRenderer(), r = new Renderer(renderer);
  r.capturePausedFrame();
  const old = r._pauseSnapshot; let disposed = 0; old.dispose = () => { disposed++; };
  state.width = 1280; state.height = 720;
  assert.equal(r.capturePausedFrame(), true);
  assert.notEqual(r._pauseSnapshot, old);
  assert.equal(disposed, 1);
  assert.equal(r._pauseSnapshot.image.width, 1280);
});

test('the paused-backdrop context listeners release the GPU snapshot', () => {
  const source = fs.readFileSync(path.join(ROOT, 'patches/local-quality/idle-resources.mjs'), 'utf8');
  assert.match(source, /const invalidate = \(\) => \{ game\._pausedWorld = null; game\.R\?\.releasePausedFrame\?\.\(\); \};/);
});
