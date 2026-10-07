import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installPortraitCost } from '../portrait-cost.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = path.join(root, 'inkwave-public');
const vendor = path.join(src, 'vendor/three');

async function loadProductionComposition(metrics) {
  const [splatoon, touch, reliability, quality, network, range] = await Promise.all([
    import('../../splatoon3/adapter.mjs'), import('../../touch-layout/adapter.mjs'),
    import('../../reliability/adapter.mjs'), import('../adapter.mjs'),
    import('../../network-replication/adapter.mjs'), import('../../practice-range/adapter.mjs'),
  ]);
  const adapt = (rel, code) => range.adaptRange(rel, network.adaptNetworkSource(rel,
    quality.adaptQualitySource(rel, reliability.adaptReliability(rel,
      touch.adaptTouchLayout(rel, splatoon.adaptSource(rel, code))))));
  const context = vm.createContext({
    console: { log: console.log, warn: console.warn, error() { metrics.consoleErrors++; } }, performance,
    document: { documentElement: { classList: { toggle() {}, add() {}, remove() {} }, style: {}, dataset: {} },
      body: { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} },
      fonts: { addEventListener() {}, removeEventListener() {} },
      createElement(name) {
        if (name !== 'canvas') throw new Error(`unexpected element: ${name}`);
        metrics.canvases++;
        return { width: 0, height: 0, getContext(kind) {
          if (kind !== '2d') throw new Error(`unexpected context: ${kind}`);
          return {
            createImageData(width, height) {
              metrics.imageData++;
              return { width, height, data: new Uint8ClampedArray(width * height * 4) };
            },
            putImageData(image) {
              metrics.imageRows.push([image.data[0], image.data[image.data.length - image.width * 4] || 0]);
            },
            drawImage() {},
          };
        } };
      } },
    window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: 'node native portrait fixture', maxTouchPoints: 0 },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout, clearTimeout, innerWidth: 1280, innerHeight: 720, URL, URLSearchParams, TextEncoder, TextDecoder,
    location: { search: '', href: 'http://localhost/', protocol: 'http:', hostname: 'localhost' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
  });
  const modules = new Map();
  const actualFile = (request, from) => {
    if (request === 'three') return path.join(vendor, 'build/three.module.js');
    if (request.startsWith('three/addons/')) return path.join(vendor, 'jsm', request.slice('three/addons/'.length));
    let file = path.resolve(path.dirname(from), request);
    if (file.startsWith(path.join(src, 'patches') + path.sep)) file = path.join(root, 'patches', path.relative(path.join(src, 'patches'), file));
    if (file.startsWith(path.join(root, 'src') + path.sep)) file = path.join(src, path.relative(root, file));
    return file;
  };
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    let code = fs.readFileSync(file, 'utf8');
    if (file.startsWith(src + path.sep)) code = adapt(path.relative(src, file).split(path.sep).join('/'), code);
    else if (file.startsWith(path.join(root, 'patches') + path.sep)) code = adapt(path.relative(root, file).split(path.sep).join('/'), code);
    const module = new vm.SourceTextModule(code, { context, identifier: pathToFileURL(file).href,
      initializeImportMeta(meta, current) { meta.url = current.identifier; } });
    modules.set(file, module);
    return module;
  };
  const entry = new vm.SourceTextModule(`
    export { Character } from './inkwave-public/src/game/character.js';
    export { Showcase } from './inkwave-public/src/game/showcase.js';
    export { G } from './inkwave-public/src/core/ctx.js';
    export * as THREE from './inkwave-public/vendor/three/build/three.module.js';
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installQuality } from './patches/local-quality/install.mjs';
    export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs';`,
    { context, identifier: pathToFileURL(path.join(root, 'portrait-cost-entry.mjs')).href });
  await entry.link((specifier, referencing) => load(actualFile(specifier, fileURLToPath(referencing.identifier))));
  await entry.evaluate();
  const api = entry.namespace;
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'patches/splatoon3/profile.json'), 'utf8'));
  api.G.scene = null; api.G.physics = null; api.G.renderer = null; api.G.post = null; api.G.game = null;
  const installContext = api.install(profile);
  api.installQuality(profile);
  api.installWeaponsFidelity(installContext, profile);
  return { api, context, modules };
}

test('full composed Showcase reuses one native settled pose across uncached crops and keeps cache/readback semantics', async (t) => {
  const metrics = { constructors: 0, updates: 0, disposals: 0, setWeapons: 0, renderCalls: 0,
    readbacks: 0, readBuffers: [], canvases: 0, imageData: 0, imageRows: [], callbacks: 0,
    updatesByPortrait: [], consoleErrors: 0 };
  const { api, context, modules } = await loadProductionComposition(metrics);
  class MeasuredCharacter extends api.Character {
    constructor(opts) { super(opts); metrics.constructors++; }
    update(dt, state) { metrics.updates++; metrics.updatesByPortrait[metrics.updatesByPortrait.length - 1]++; return super.update(dt, state); }
    setWeapon(kind) { metrics.setWeapons++; return super.setWeapon(kind); }
    dispose() { metrics.disposals++; return super.dispose(); }
  }
  const THREE = api.THREE;
  const renderer = { autoClear: true, toneMappingExposure: 1, shadowMap: { needsUpdate: false }, getRenderTarget: () => null,
    getClearColor: (color) => color.set(0x202020), getClearAlpha: () => 1, setRenderTarget() {}, setClearColor() {}, clear() {},
    render() { metrics.renderCalls++; },
    readRenderTargetPixelsAsync(_target, _x, _y, width, height, buffer) {
      metrics.readbacks++; metrics.readBuffers.push(buffer);
      for (let y = 0; y < height; y++) buffer.fill(y & 255, y * width * 4, (y + 1) * width * 4);
      return Promise.resolve();
    } };
  const show = Object.create(api.Showcase.prototype);
  Object.assign(show, { r: renderer, CharacterClass: MeasuredCharacter, scene: new THREE.Scene(), chars: [],
    color: new THREE.Color('#b044cc'), mode: 'locker', _out: 0, _warmState: 'done', _pq: [], _pcache: new Map(), _pflight: 0,
    _clr: new THREE.Color(), _c: new THREE.Color(), _c2: new THREE.Color(), _tgt: new THREE.Vector3(), _pv: new THREE.Vector3(),
    compQuad: { geometry: new THREE.BufferGeometry() }, compCam: new THREE.OrthographicCamera() });
  const base = { color: new THREE.Color('#4269b2'), weapon: 'shooter', style: { hair: 2, skin: 1, outfit: 3, eyes: 0 }, size: 128 };
  const enqueue = (request) => show.portrait(request, (canvas) => { if (canvas) metrics.callbacks++; });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  enqueue({ ...base, kind: 'head' });
  metrics.updatesByPortrait.push(0); show._portraitStep(); await flush();
  const settledHead = show._pv.toArray();
  enqueue({ ...base, kind: 'bust' });
  metrics.updatesByPortrait.push(0); show._portraitStep(); await flush();

  assert.equal(metrics.constructors, 1);
  assert.deepEqual(metrics.updatesByPortrait, [14, 0]);
  assert.equal(metrics.updates, 14);
  assert.equal(metrics.disposals, 0);
  assert.equal(metrics.setWeapons, 2);
  assert.equal(metrics.renderCalls, 4);
  assert.equal(metrics.readbacks, 2);
  assert.strictEqual(metrics.readBuffers[0], metrics.readBuffers[1]);
  assert.equal(metrics.imageData, 1);
  assert.deepEqual(metrics.imageRows[0], [127, 0]);
  assert.deepEqual(show._pv.toArray(), settledHead);
  assert.equal(metrics.callbacks, 2);
  assert.equal(show._pcache.size, 2);
  const twoCropMetrics = { constructors: metrics.constructors, nativeUpdates: metrics.updates,
    updatesByCrop: [...metrics.updatesByPortrait], renderPasses: metrics.renderCalls,
    asyncReadbacks: metrics.readbacks, uniqueReadbackBuffers: new Set(metrics.readBuffers).size,
    imageDataAllocations: metrics.imageData };

  enqueue({ ...base, kind: 'bust' }); // native portrait cache hit remains synchronous
  assert.equal(metrics.callbacks, 3);
  assert.equal(metrics.readbacks, 2);
  assert.equal(metrics.constructors, 1);

  let cancelled = false;
  const handle = show.portrait({ ...base, kind: 'face' }, (canvas) => { if (canvas) cancelled = true; });
  handle.cancel(); show._portraitStep(); await flush();
  assert.equal(cancelled, false);
  assert.equal(metrics.readbacks, 2);
  let failureResult = 'pending';
  renderer.readRenderTargetPixelsAsync = () => { metrics.readbacks++; return Promise.reject(new Error('context lost')); };
  show.portrait({ ...base, kind: 'face' }, (canvas) => { failureResult = canvas; });
  show._portraitStep(); await flush();
  assert.equal(failureResult, null);
  assert.equal(metrics.readbacks, 3);
  assert.equal(metrics.disposals, 1);
  assert.equal(metrics.consoleErrors, 1);
  show.hide();
  assert.equal(metrics.disposals, 1);
  assert.ok(modules.size >= 80, 'production composition loaded the native module graph');
  assert.equal(api.THREE.REVISION, '186');

  let finishReadback;
  let pendingResult = 'pending';
  let fakeDisposals = 0;
  class PendingCharacter {
    constructor() { this.root = new THREE.Group(); }
    setColor() {}
    setWeapon() {}
    setDance() {}
    update() {}
    getHeadPosition(out) { return out.set(0, 1, 0); }
    dispose() { fakeDisposals++; }
  }
  const pendingRenderer = { ...renderer,
    readRenderTargetPixelsAsync(_target, _x, _y, _width, _height, buffer) {
      buffer.fill(9);
      return new Promise((resolve) => { finishReadback = resolve; });
    } };
  const pendingShow = Object.create(api.Showcase.prototype);
  Object.assign(pendingShow, { r: pendingRenderer, CharacterClass: PendingCharacter, scene: new THREE.Scene(), chars: [],
    color: new THREE.Color('#b044cc'), mode: 'locker', _out: 0, _warmState: 'done', _pq: [], _pcache: new Map(), _pflight: 0,
    _clr: new THREE.Color(), _c: new THREE.Color(), _c2: new THREE.Color(), _tgt: new THREE.Vector3(), _pv: new THREE.Vector3(),
    compQuad: { geometry: new THREE.BufferGeometry() }, compCam: new THREE.OrthographicCamera() });
  pendingShow.portrait({ ...base, kind: 'head' }, (canvas) => { pendingResult = canvas; });
  pendingShow._portraitStep();
  assert.equal(pendingResult, 'pending');
  pendingShow.hide();
  assert.equal(fakeDisposals, 1);
  finishReadback(); await flush();
  assert.ok(pendingResult && pendingResult.width === 128, 'hide keeps the active readback callback alive');

  t.diagnostic(JSON.stringify({ production_modules: modules.size, three_revision: api.THREE.REVISION,
    same_pose_uncached_crops: { ...twoCropMetrics, successful_callbacks: 2, cache_hit_callback: true,
      cancelled_callback_suppressed: !cancelled, context_loss_callback_null: failureResult === null,
      character_disposals_after_hide_and_context_loss: metrics.disposals,
      hide_during_pending_readback_callback_delivered: pendingResult?.width === 128,
      private_character_disposals_on_hide: fakeDisposals } }));
});

test('portrait owner rebuilds on style, weapon and pose identity changes and retires after readback failure', async () => {
  const events = [];
  let live = 0, maxLive = 0;
  class FakeCharacter {
    constructor(opts) { this.style = { ...opts.style }; this.weapon = opts.weapon; this.dance = null; live++; maxLive = Math.max(maxLive, live); events.push(`new:${this.weapon}:${this.style.hair}`); }
    setColor() {}
    setWeapon(kind) { events.push(`weapon:${kind}`); this.weapon = kind; }
    setDance(name) { if (name !== this.dance) { this.dance = name; events.push(`dance:${name}`); } }
    update() { events.push('update'); }
    dispose() { live--; events.push('dispose'); }
  }
  class FakeShowcase {
    constructor() { this.CharacterClass = FakeCharacter; this._c2 = { set(value) { this.value = value; return this; } }; }
    _renderPortraitRun(req, _size, kind) {
      const character = new this.CharacterClass({ style: req.style, weapon: req.weapon, color: req.color });
      character.setDance(kind === 'body' ? 'lobby_pose' : 'menu_idle');
      for (let i = 0; i < 14; i++) character.update(1 / 30, { time: i / 30 });
      character.dispose();
      return Promise.resolve();
    }
    hide() {}
  }
  installPortraitCost(FakeShowcase);
  const show = new FakeShowcase();
  const request = (style, weapon, kind) => show._renderPortraitRun({ style: { hair: style }, weapon, color: '#123456' }, 32, kind, null);

  await request(1, 'shooter', 'head');
  await request(1, 'shooter', 'bust');
  assert.equal(events.filter((x) => x.startsWith('new:')).length, 1);
  assert.equal(events.filter((x) => x === 'update').length, 14);
  assert.ok(events.includes('weapon:shooter'));
  await request(2, 'shooter', 'head');
  await request(2, 'roller', 'head');
  await request(2, 'roller', 'body');
  assert.deepEqual(events.filter((x) => x.startsWith('new:')), [
    'new:shooter:1', 'new:shooter:2', 'new:roller:2', 'new:roller:2',
  ]);
  assert.equal(live, 1);
  assert.equal(maxLive, 1);
  show.hide();
  assert.equal(live, 0);

  class FailureShowcase {
    constructor() { this.CharacterClass = FakeCharacter; this._c2 = { set(value) { this.value = value; return this; } }; }
    _renderPortraitRun(req, _size, kind) {
      const character = new this.CharacterClass({ style: req.style, weapon: req.weapon, color: req.color });
      character.setDance(kind === 'body' ? 'lobby_pose' : 'menu_idle');
      for (let i = 0; i < 14; i++) character.update(1 / 30, { time: i / 30 });
      character.dispose();
      return Promise.reject(new Error('readback lost'));
    }
    hide() {}
  }
  installPortraitCost(FailureShowcase);
  const failed = new FailureShowcase();
  await assert.rejects(failed._renderPortraitRun({ style: { hair: 7 }, weapon: 'shooter' }, 32, 'head', null), /readback lost/);
  await Promise.resolve();
  assert.equal(live, 0);
});
