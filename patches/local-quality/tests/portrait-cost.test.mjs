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
    _clear() {}
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

  const clearedShow = new FakeShowcase();
  await clearedShow._renderPortraitRun({ style: { hair: 3 }, weapon: 'shooter', color: '#123456' }, 32, 'head', null);
  assert.equal(live, 1);
  clearedShow._clear();
  assert.equal(live, 0, 'clear retires the private owner just like hide does');

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

test('native owner refreshes wardrobe colour in place, equals a fresh settle, and stays display-only between crops', async (t) => {
  const metrics = { constructors: 0, updates: 0, disposals: 0, setWeapons: 0, renderCalls: 0, readbacks: 0,
    readBuffers: [], canvases: 0, imageData: 0, imageRows: [], callbacks: 0, consoleErrors: 0 };
  const { api, context, modules } = await loadProductionComposition(metrics);
  class MeasuredCharacter extends api.Character {
    constructor(opts) { super(opts); metrics.constructors++; metrics.last = this; }
    update(dt, state) { metrics.updates++; return super.update(dt, state); }
    setWeapon(kind) { metrics.setWeapons++; return super.setWeapon(kind); }
    dispose() { metrics.disposals++; return super.dispose(); }
  }
  const THREE = api.THREE;
  const scene = new THREE.Scene();
  const renderer = { autoClear: true, toneMappingExposure: 1, shadowMap: { needsUpdate: false }, getRenderTarget: () => null,
    getClearColor: (color) => color.set(0x202020), getClearAlpha: () => 1, setRenderTarget() {}, setClearColor() {}, clear() {},
    render() { metrics.renderCalls++; },
    readRenderTargetPixelsAsync(_target, _x, _y, width, height, buffer) {
      metrics.readbacks++; metrics.readBuffers.push(buffer);
      for (let y = 0; y < height; y++) buffer.fill(y & 255, y * width * 4, (y + 1) * width * 4);
      return Promise.resolve();
    } };
  const show = Object.create(api.Showcase.prototype);
  Object.assign(show, { r: renderer, CharacterClass: MeasuredCharacter, scene, chars: [], decks: [],
    color: new THREE.Color('#b044cc'), mode: 'locker', _out: 0, _warmState: 'done', _pq: [], _pcache: new Map(), _pflight: 0,
    _clr: new THREE.Color(), _c: new THREE.Color(), _c2: new THREE.Color(), _tgt: new THREE.Vector3(), _pv: new THREE.Vector3(),
    compQuad: { geometry: new THREE.BufferGeometry() }, compCam: new THREE.OrthographicCamera(),
    fx: { clear() {} }, confetti: { clear() {} }, sparks: { clear() {} },
    contact: { setMatrixAt() {}, count: 0, instanceMatrix: { needsUpdate: false } } });
  // Production-like world: the settle runs inside G.scene over live physics, which is exactly
  // the world participation a frozen owner would otherwise latch after the scene removal.
  api.G.scene = scene;
  api.G.physics = { raycast: () => ({ hit: false }) };
  vm.runInContext('globalThis.__rngDraws = 0; globalThis.__rngUuidDraws = 0; globalThis.__rngOtherDraws = 0; globalThis.__rngOtherStacks = []; ' +
    'globalThis.__uuidStacks = []; globalThis.__uuidCaptureAfter = 0; globalThis.__origRandom = Math.random; ' +
    'Math.random = function () { globalThis.__rngDraws++; ' +
    'const stack = new Error().stack; ' +
    'if (stack.indexOf("generateUUID") !== -1) { globalThis.__rngUuidDraws++; ' +
    'if (globalThis.__rngDraws > globalThis.__uuidCaptureAfter && globalThis.__uuidStacks.length < 3) globalThis.__uuidStacks.push(stack.split("\\n").slice(1, 8).join(" <- ")); } ' +
    'else { globalThis.__rngOtherDraws++; if (globalThis.__rngOtherStacks.length < 4) globalThis.__rngOtherStacks.push(stack.split("\\n").slice(1, 6).join(" <- ")); } ' +
    'return globalThis.__origRandom(); };', context);
  const rngDraws = () => vm.runInContext('globalThis.__rngDraws', context);
  const rngUuidDraws = () => vm.runInContext('globalThis.__rngUuidDraws', context);
  const rngOtherDraws = () => vm.runInContext('globalThis.__rngOtherDraws', context);
  const rngOtherStacks = () => vm.runInContext('JSON.stringify(globalThis.__rngOtherStacks)', context);
  const armUuidStacks = () => vm.runInContext('globalThis.__uuidCaptureAfter = globalThis.__rngDraws; globalThis.__uuidStacks = [];', context);
  const uuidStacks = () => vm.runInContext('JSON.stringify(globalThis.__uuidStacks)', context);
  const base = { color: new THREE.Color('#4269b2'), weapon: 'shooter', style: { hair: 2, skin: 1, outfit: 3, eyes: 0 },
    size: 128, kind: 'head' };
  const enqueue = (request) => show.portrait(request, (canvas) => { if (canvas) metrics.callbacks++; });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  const coldDraws = rngDraws();
  const coldUuidDraws = rngUuidDraws();
  const coldOtherDraws = rngOtherDraws();
  enqueue({ ...base });
  show._portraitStep(); await flush();
  assert.equal(metrics.constructors, 1);
  assert.equal(metrics.updates, 14);
  assert.equal(metrics.callbacks, 1);
  const owner = metrics.last;
  const ownerHead = owner.getHeadPosition(new THREE.Vector3()).toArray();
  assert.equal(owner.inWorld, false, 'settled owner returns to display-only after the run');
  assert.equal(owner.phys, null, 'settled owner drops the live physics reference');
  assert.strictEqual(show.CharacterClass, MeasuredCharacter, 'spawn paths get the native class back outside a run');
  // Native construction draws shared Math.random only where three.js itself does: generateUUID
  // object ids for Textures/RenderTargets/Materials/Geometries. Current main draws the same ids
  // (and more: it constructs and discards a Character per uncached tile); what must stay at zero
  // is every other shared RNG consumer, i.e. game logic (Battle/Range draw streams included).
  assert.equal(rngOtherDraws(), coldOtherDraws, 'cold native portrait generation draws no shared Math.random values outside three.js generateUUID object ids; ' +
    'other=' + rngOtherDraws() + ' uuid=' + rngUuidDraws() + ' total=' + rngDraws() + ' otherStacks=' + rngOtherStacks());
  const coldPhase = { total: rngDraws() - coldDraws, uuid: rngUuidDraws() - coldUuidDraws, other: rngOtherDraws() - coldOtherDraws };
  const coldUuidSample = uuidStacks();
  // Wardrobe colour change: the native tile cache misses, but the private owner identity hits.
  const reuseDraws = rngDraws();
  const reuseUuidDraws = rngUuidDraws();
  const reuseOtherDraws = rngOtherDraws();
  armUuidStacks();
  const updatesBeforeReuse = metrics.updates;
  enqueue({ ...base, color: new THREE.Color('#ff5511') });
  show._portraitStep(); await flush();
  assert.equal(metrics.constructors, 1, 'colour-only change reuses the private owner');
  assert.equal(metrics.updates, updatesBeforeReuse, 'frozen owner runs no settle updates on reuse');
  assert.strictEqual(metrics.last, owner);
  assert.equal(owner.color.getHexString(), 'ff5511', 'colour refreshes despite the frozen update no-op');
  assert.equal(owner.weaponKind, 'shooter');
  assert.equal(owner.dance, 'menu_idle');
  assert.deepEqual(show._pv.toArray(), ownerHead, 'frozen pose is unchanged by the colour refresh');
  assert.equal(owner.inWorld, false);
  assert.equal(owner.phys, null);
  // The colour refresh legitimately allocates one native object id: Character.setColor assigns the
  // cached-by-hex ink material for the new colour (character-mats getInkMaterial). Current main
  // pays that plus an entire Character construction on this same cache miss. What must stay at
  // zero is every non-three.js consumer of the shared RNG (game logic, Battle/Range streams).
  assert.equal(rngOtherDraws(), reuseOtherDraws, 'colour-refresh reuse draws no shared Math.random values outside three.js generateUUID object ids; ' +
    'uuidDelta=' + (rngUuidDraws() - reuseUuidDraws) + ' totalDelta=' + (rngDraws() - reuseDraws) + ' other=' + rngOtherDraws() + ' stacks=' + rngOtherStacks());
  const reusePhase = { total: rngDraws() - reuseDraws, uuid: rngUuidDraws() - reuseUuidDraws, other: rngOtherDraws() - reuseOtherDraws };
  const reuseUuidSample = uuidStacks();
  assert.strictEqual(metrics.readBuffers[0], metrics.readBuffers[1], 'one pooled readback buffer serves both crops');
  assert.equal(metrics.imageData, 1, 'one pooled ImageData serves both crops');
  assert.equal(metrics.callbacks, 2);
  assert.equal(show._pcache.size, 2, 'the colour variant keeps its own native tile cache entry');
  assert.deepEqual(metrics.imageRows[0], [127, 0]);
  // Steady state: another uncached crop of the refreshed colour reuses the owner and the
  // now-cached ink material, so generation draws no shared RNG values at all.
  const steadyDraws = rngDraws();
  const steadyUuidDraws = rngUuidDraws();
  const steadyOtherDraws = rngOtherDraws();
  enqueue({ ...base, color: new THREE.Color('#ff5511'), kind: 'bust' });
  show._portraitStep(); await flush();
  assert.equal(metrics.constructors, 1, 'steady-state crop reuses the private owner');
  assert.equal(metrics.updates, updatesBeforeReuse, 'steady-state crop runs no settle updates');
  assert.equal(metrics.callbacks, 3);
  assert.equal(rngDraws(), steadyDraws, 'steady-state reuse draws no shared RNG values; ' +
    'uuidDelta=' + (rngUuidDraws() - steadyUuidDraws) + ' otherDelta=' + (rngOtherDraws() - steadyOtherDraws));
  const steadyPhase = { total: rngDraws() - steadyDraws, uuid: rngUuidDraws() - steadyUuidDraws, other: rngOtherDraws() - steadyOtherDraws };
  const preTwin = { total: rngDraws(), uuid: rngUuidDraws(), other: rngOtherDraws() };
  armUuidStacks();
  // Equivalence: a fresh native settle of the same identity matches the frozen owner.
  const twin = new MeasuredCharacter({ color: new THREE.Color('#ff5511'), weapon: 'shooter',
    style: { ...base.style }, name: 'portrait', isLocal: false });
  twin.setDance('menu_idle');
  scene.add(twin.root);
  const twinAnim = api.Showcase.prototype._anim();
  for (let i = 0; i < 14; i++) { twinAnim.time = i / 30; twin.update(1 / 30, twinAnim); }
  scene.remove(twin.root);
  assert.equal(metrics.constructors, 2);
  assert.deepEqual(twin.getHeadPosition(new THREE.Vector3()).toArray(), ownerHead,
    'reused owner pose equals a fresh native settle of the same identity');
  assert.equal(twin.color.getHexString(), owner.color.getHexString());
  assert.equal(twin.weaponKind, owner.weaponKind);
  assert.equal(twin.dance, owner.dance);
  // The equivalence settle is a fresh native Character construction, exactly what current main
  // performs for every uncached tile: its shared RNG consumption is again limited to three.js
  // generateUUID object ids, with zero draws from any game-logic consumer.
  assert.equal(rngOtherDraws(), preTwin.other, 'the equivalence settle draws no shared RNG values outside three.js generateUUID object ids; ' +
    'other=' + rngOtherDraws() + ' otherStacks=' + rngOtherStacks());
  const twinPhase = { total: rngDraws() - preTwin.total, uuid: rngUuidDraws() - preTwin.uuid, other: rngOtherDraws() - preTwin.other };
  const twinUuidSample = uuidStacks();

  // Clear retires the private owner (hide/dispose share the same wrapper).
  show._clear();
  assert.equal(metrics.disposals, 1, 'clear retires the private owner');
  t.diagnostic(JSON.stringify({ production_modules: modules.size, three_revision: api.THREE.REVISION,
    colour_refresh_without_rebuild: { extra_constructors: metrics.constructors - 2, nativeUpdates: metrics.updates,
      shared_rng_draws_total: rngDraws() - coldDraws, pooled_readback_buffers: new Set(metrics.readBuffers).size,
      imageDataAllocations: metrics.imageData },
    shared_rng_breakdown: { cold: coldPhase, colour_refresh: reusePhase, steady_reuse: steadyPhase, twin_construction: twinPhase,
      total_three_uuid_draws: rngUuidDraws() - coldUuidDraws, total_other_draws: rngOtherDraws() - coldOtherDraws,
      other_stacks: rngOtherStacks(),
      uuid_stack_samples: { cold: coldUuidSample, colour_refresh: reuseUuidSample, twin: twinUuidSample } },
    fresh_settle_equivalence_head: ownerHead, owner_retired_on_clear: metrics.disposals === 1 }));
});

