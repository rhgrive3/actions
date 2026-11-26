import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { resultChangeButton, resultKeepButton } from '../result-continuation.mjs';
import { pausedWorldFrame, disposePausedWorldFrame } from '../idle-resources.mjs';
import { installPlatformGame } from '../platform-game.mjs';
import { qualityIdentity } from '../adapter.mjs';
import { initMotionWasm } from '../motion-kernel.mjs';
import { GyroPermission } from '../gyro-permission.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const THREE_URL = pathToFileURL(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js')).href;

// Map bare 'three' imports inside runtime modules to the vendored Three.js build
// so this test runs cleanly under plain `node --test` without VM module flags.
register(
  `data:text/javascript,${encodeURIComponent(
    `export async function resolve(specifier, context, nextResolve) {
      if (specifier === 'three') return { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true };
      return nextResolve(specifier, context);
    }`
  )}`
);

const { installPaintDryRegions } = await import('../paint-dry-regions.mjs');
const { InkVolumes } = await import('../ink-volume/runtime.mjs');
const { installPaintProfileBatch } = await import('../paint-profile-batch.mjs');
const { installPaintRegionalMips } = await import('../paint-regional-mips.mjs');

const readUpstream = (rel) => fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');

function makeDryPaint(size = 256, native = false) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1,  1, 0,
  ]), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'precision highp float; uniform float uDry; void main() { gl_FragColor = vec4(0.0, uDry, 0.0, 0.0); }',
    blending: THREE.CustomBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    colorWrite: true,
    premultipliedAlpha: false,
    alphaTest: 0,
    alphaToCoverage: false,
    wireframe: false,
    blendEquation: THREE.ReverseSubtractEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const rt = {
    width: size,
    height: size,
    samples: 0,
    scissorTest: false,
    viewport: { x: 0, y: 0, z: size, w: size },
    texture: {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
    },
  };
  return {
    size,
    level: { native },
    rt,
    dryMesh: { geometry: geo, material: mat, visible: true },
    _dryU: { uDry: { value: 0.05 } },
    quads: 0,
    aPos: new Float32Array(8),
  };
}

test('P0-5: paint-dry-regions retires old original geometry on non-native target change, not on non-target geometry swap', () => {
  class FakePaint {
    constructor(opts) { Object.assign(this, opts); }
    _initGPU() {}
    _drawQuads() { return 'drawn'; }
    clear() {}
    dispose() {}
  }
  installPaintDryRegions(FakePaint);

  // Case 1: non-native runtime quality target replacement -> must dispose old original geometry
  const paintA = new FakePaint(makeDryPaint(256, false));
  paintA._initGPU();
  const origGeoA = paintA.dryMesh.geometry;
  let origDisposedA = 0;
  const origDisposeA = origGeoA.dispose.bind(origGeoA);
  origGeoA.dispose = () => { origDisposedA++; origDisposeA(); };

  const newPaint = makeDryPaint(512, false);
  paintA.size = 512;
  paintA.rt = newPaint.rt;
  paintA.dryMesh.geometry = newPaint.dryMesh.geometry;
  assert.equal(paintA._drawQuads(), 'drawn');
  assert.equal(origDisposedA, 1, 'old original geometry must be disposed when target changes on non-native stage');

  // Case 2: non-target geometry replacement (same rt/size) -> must NOT dispose original geometry
  const paintB = new FakePaint(makeDryPaint(256, false));
  paintB._initGPU();
  const origGeoB = paintB.dryMesh.geometry;
  let origDisposedB = 0;
  const origDisposeB = origGeoB.dispose.bind(origGeoB);
  origGeoB.dispose = () => { origDisposedB++; origDisposeB(); };

  paintB.dryMesh.geometry = new THREE.BufferGeometry();
  assert.equal(paintB._drawQuads(), 'drawn');
  assert.equal(origDisposedB, 0, 'original geometry must not be disposed when target did not change');
  paintB.dryMesh.geometry.dispose();
  origDisposeB();
});

test('P0-6: InkVolumes.register disposes partially created InstancedMesh objects on error and avoids double-dispose on success', () => {
  const validLevel = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
  };
  const lighting = {
    sunDir: new THREE.Vector3(0, 1, 0),
    sunCol: new THREE.Color(1, 1, 1),
    sky: new THREE.Color(0.5, 0.7, 1),
    ground: new THREE.Color(0.2, 0.2, 0.2),
  };

  let instancedDisposes = 0;
  const origInstancedDispose = THREE.InstancedMesh.prototype.dispose;
  THREE.InstancedMesh.prototype.dispose = function (...args) {
    instancedDisposes++;
    return origInstancedDispose.apply(this, args);
  };
  try {
    // Failure mid-registration (second level invalid) -> disposes first level's mesh & fringe
    const rootFail = new THREE.Group();
    const volumesFail = new InkVolumes(rootFail, lighting, { capacity: 4 });
    const badPack = {
      schema: 'inkwave-volume-v1',
      patterns: [{
        width: 2,
        height: 2,
        fps: 10,
        frames: [{
          rgba: new Uint8Array(2 * 2 * 4),
          levels: [
            validLevel,
            { ...validLevel, positions: new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0]) },
          ],
        }],
      }],
    };
    assert.throws(() => volumesFail.register('broken', badPack), /Invalid ink vertex/);
    assert.equal(instancedDisposes, 2, 'mesh and fringe created before failure must both be disposed');
    assert.equal(volumesFail.assets.size, 0);

    // Success followed by unregister -> disposes exactly once per mesh & fringe (2 levels * 2 = 4)
    instancedDisposes = 0;
    const rootOk = new THREE.Group();
    const volumesOk = new InkVolumes(rootOk, lighting, { capacity: 4 });
    const okPack = {
      schema: 'inkwave-volume-v1',
      patterns: [{
        width: 2,
        height: 2,
        fps: 10,
        frames: [{
          rgba: new Uint8Array(2 * 2 * 4),
          levels: [validLevel, validLevel],
        }],
      }],
    };
    volumesOk.register('good', okPack);
    assert.equal(instancedDisposes, 0);
    volumesOk.unregister('good');
    assert.equal(instancedDisposes, 4, 'unregister must dispose each InstancedMesh exactly once');
  } finally {
    THREE.InstancedMesh.prototype.dispose = origInstancedDispose;
  }
});

test('P0-7: online Ranked results exclude continuation buttons and keep 12s auto-return timer in composed sources', () => {
  const makeMenus = (result) => ({
    _results: result,
    _swapToken: 1,
    current: 'results',
    api: { netContinue: () => true, rematch: () => {} },
    _btn: (opts) => ({ ...opts, disabled: false }),
  });

  // Online Turf (explicit 'turf' and omitted mode) keeps continuation buttons
  for (const mode of ['turf', undefined]) {
    const res = mode === undefined ? { online: true } : { online: true, mode };
    const menus = makeMenus(res);
    assert.ok(resultKeepButton(menus, res), `online ${String(mode)} must offer KEEP GOING`);
    assert.ok(resultChangeButton(menus, res), `online ${String(mode)} must offer CHANGE GEAR`);
  }

  // Online Ranked modes & Boss must NOT offer continuation buttons
  for (const mode of ['zones', 'tower', 'rainmaker', 'clams', 'boss']) {
    const res = { online: true, mode };
    const menus = makeMenus(res);
    assert.equal(resultKeepButton(menus, res), null, `online ${mode} must not offer KEEP GOING`);
    assert.equal(resultChangeButton(menus, res), null, `online ${mode} must not offer CHANGE GEAR`);
  }

  // Offline Ranked still allows CHANGE GEAR (rematch), never KEEP GOING
  const offlineRanked = { online: false, mode: 'rainmaker' };
  const offlineMenus = makeMenus(offlineRanked);
  assert.equal(resultKeepButton(offlineMenus, offlineRanked), null);
  assert.ok(resultChangeButton(offlineMenus, offlineRanked));

  // Verify composed sources
  const menusCode = adaptBuildSource('src/ui/menus.js', readUpstream('src/ui/menus.js'));
  assert.match(menusCode, /const onlineTurf = online && !boss && \(!d\.mode \|\| d\.mode === 'turf'\);/);
  assert.match(menusCode, /const backIn = online && !onlineTurf \? 12 : 0;/);
  assert.match(menusCode, /const lobbyPill = online && !onlineTurf \?/);
  assert.match(menusCode, /const hostBack = online && !onlineTurf && G\.net/);

  const mainCode = adaptBuildSource('src/main.js', readUpstream('src/main.js'));
  assert.match(mainCode, /const _iwResMode = m\.result\?\.mode \?\? m\.mode;\s*if \(_iwResMode && _iwResMode !== 'turf'\) \{/);
  assert.match(mainCode, /_netEndT = setTimeout\(/);
});

test('P0-8: disposePausedWorldFrame and Game.disposePlatform remove canvas and document listeners', () => {
  const makeTarget = () => {
    const map = new Map();
    return {
      map,
      addEventListener(type, fn) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        map.get(type)?.delete(fn);
      },
    };
  };

  const doc = makeTarget();
  const canvas = makeTarget();
  canvas.ownerDocument = doc;
  canvas.removeAttribute = () => {};
  canvas.setAttribute = () => {};
  const G = { renderer: { domElement: canvas, getContext: () => ({ isContextLost: () => false }) } };
  const game = { match: { paused: true, attract: false }, settings: {} };

  pausedWorldFrame(game, G, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 });
  assert.equal(canvas.map.get('webglcontextlost')?.size, 1);
  assert.equal(canvas.map.get('webglcontextrestored')?.size, 1);
  assert.equal(doc.map.get('visibilitychange')?.size, 1);

  disposePausedWorldFrame(game);
  assert.equal(canvas.map.get('webglcontextlost')?.size, 0);
  assert.equal(canvas.map.get('webglcontextrestored')?.size, 0);
  assert.equal(doc.map.get('visibilitychange')?.size, 0);
  assert.equal(game._pausedWorldCanvas, null);
  assert.equal(game._pausedWorld, null);

  // Also verify integration through platform-game.mjs disposePlatform()
  class FakeGame {
    _loop() {}
    _frame() {}
    _dynRes() {}
    _onPointerUnlock() {}
  }
  const env = {
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    setTimeout,
    clearTimeout,
  };
  installPlatformGame(FakeGame, G, env);
  const g2 = new FakeGame();
  g2.R = { renderer: { domElement: canvas } };
  g2.match = { paused: true, attract: false };
  g2.settings = {};
  g2._loop();
  pausedWorldFrame(g2, G, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 });
  assert.equal(canvas.map.get('webglcontextlost')?.size, 2); // platform + pausedWorldFrame
  assert.equal(doc.map.get('visibilitychange')?.size, 1);

  g2.disposePlatform();
  assert.equal(canvas.map.get('webglcontextlost')?.size, 0);
  assert.equal(canvas.map.get('webglcontextrestored')?.size, 0);
  assert.equal(doc.map.get('visibilitychange')?.size, 0);
  assert.equal(g2._pausedWorldCanvas, null);
});

test('P1-11: paint-profile-batch rebinds local state on target change and never operates on released state', () => {
  class FakePaint {
    constructor() {
      this.size = 256;
      this.rt = { id: 'rt-1' };
      this.quads = 1;
      this.level = { native: false };
    }
    _initGPU() {}
    _drawQuads() { return 'ok'; }
    dispose() {}
  }
  installPaintProfileBatch(FakePaint);

  const p = new FakePaint();
  let restoreCalls = 0;
  let fastDisposeCalls = 0;
  const fakeMaterial = { onBeforeRender: null };
  const fakeMesh = { onAfterRender: null };
  const oldState = {
    target: p.rt,
    active: false,
    prepared: true,
    preparedCount: 1,
    material: fakeMaterial,
    mesh: fakeMesh,
    before: () => {},
    after: () => {},
    fast: { dispose() { fastDisposeCalls++; } },
    restore() { restoreCalls++; },
  };
  oldState.beforeHook = () => {};
  oldState.afterHook = () => {};
  fakeMaterial.onBeforeRender = oldState.beforeHook;
  fakeMesh.onAfterRender = oldState.afterHook;
  p._iwPaintProfileBatch = oldState;

  // Replace render target without calling _initGPU; allocate(this) will return null here
  p.rt = { id: 'rt-2' };
  assert.equal(p._drawQuads(), 'ok');

  assert.equal(fastDisposeCalls, 1, 'old state fast material must be disposed via release');
  assert.equal(restoreCalls, 1, 'restore must be called only during release, not again in finally on stale state');
  assert.equal(p._iwPaintProfileBatch, null, 'state must be rebound to null when reallocation fails');
});

test('P2-7: paint-regional-mips detects target/N mismatch even when forceFull is true and skips reallocation when context is lost', () => {
  class FakePaint {
    constructor() {
      this.size = 256;
      this.rt = { width: 256, height: 256, texture: {} };
      this.quads = 1;
      this.dryMesh = { visible: false };
      this.renderer = { getContext: () => ({ isContextLost: () => false }) };
    }
    _initGPU() {}
    clear() {}
    _drawQuads() { return 'drawn'; }
    _regenerateMipmaps() {}
    dispose() {}
  }
  installPaintRegionalMips(FakePaint);

  // Case 1: forceFull === true AND rt dimensions differ from s.N -> must release old resources
  const p1 = new FakePaint();
  let texDel = 0, fbDel = 0;
  p1._iwPaintRegionalMips = {
    gl: {
      deleteTexture() { texDel++; },
      deleteFramebuffer() { fbDel++; },
      isContextLost: () => false,
    },
    texture: {},
    framebuffer: {},
    target: p1.rt,
    N: 256,
    size: 64,
    forceFull: true,
  };
  p1.rt = { width: 512, height: 512, texture: {} };
  assert.equal(p1._drawQuads(), 'drawn');
  assert.equal(texDel, 1);
  assert.equal(fbDel, 1);
  assert.equal(p1._iwPaintRegionalMips, null);

  // Case 2: context lost -> must release and not attempt reallocation
  const p2 = new FakePaint();
  let texDel2 = 0, fbDel2 = 0;
  p2.renderer = { getContext: () => ({ isContextLost: () => true }) };
  p2._iwPaintRegionalMips = {
    gl: {
      deleteTexture() { texDel2++; },
      deleteFramebuffer() { fbDel2++; },
      isContextLost: () => true,
    },
    texture: {},
    framebuffer: {},
    target: p2.rt,
    N: 256,
    size: 64,
    forceFull: true,
  };
  p2.rt = { width: 512, height: 512, texture: {} };
  assert.equal(p2._drawQuads(), 'drawn');
  assert.equal(texDel2, 1);
  assert.equal(fbDel2, 1);
  assert.equal(p2._iwPaintRegionalMips, undefined);
});

test('P1-12: adapter.mjs IDENTITY_FILES includes all 6 active files and has zero duplicate entries', () => {
  const identity = qualityIdentity();
  for (const rel of [
    'headgear/face-goggles.js',
    'headgear/goldfish-mask.js',
    'headgear/samurai-helmet.js',
    'headgear/thief-hook.js',
    'native-paint-tick-batch.mjs',
    'native-paint-transfer.mjs',
  ]) {
    assert.equal(typeof identity[rel], 'string', `${rel} must be tracked in qualityIdentity()`);
  }

  const adapterSrc = fs.readFileSync(path.join(ROOT, 'patches/local-quality/adapter.mjs'), 'utf8');
  const m = adapterSrc.match(/const IDENTITY_FILES = \[([\s\S]*?)\];/);
  assert.ok(m, 'IDENTITY_FILES array must exist');
  const bodyWithoutComments = m[1].replace(/\/\/.*$/gm, '');
  const entries = [...bodyWithoutComments.matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const seen = new Set();
  const duplicates = [];
  for (const entry of entries) {
    if (seen.has(entry)) duplicates.push(entry);
    seen.add(entry);
  }
  assert.deepEqual(duplicates, [], 'IDENTITY_FILES must not contain duplicate entries');
});

test('P1-13: initMotionWasm clears loadPromise on non-ok fetch response so subsequent retry executes', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false, status: 503 };
  };
  try {
    const r1 = await initMotionWasm('https://example.invalid/motion-kernel.wasm');
    assert.equal(r1, false);
    const r2 = await initMotionWasm('https://example.invalid/motion-kernel.wasm');
    assert.equal(r2, false);
    assert.equal(calls, 2, 'second initMotionWasm call must retry fetch after non-ok failure');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('P2-8: GyroPermission safely handles missing lifecycle in beginListening, sample, and startHealthProbe', () => {
  const timers = [];
  const env = {
    isSecureContext: true,
    DeviceOrientationEvent: function () {},
    setTimeout(fn) {
      const id = timers.length + 1;
      timers.push(fn);
      return id;
    },
    clearTimeout() {},
    performance: { now: () => 1000 },
  };
  const gp = new GyroPermission(env, undefined);
  gp.wanted = true;
  assert.doesNotThrow(() => gp.beginListening());
  assert.doesNotThrow(() => gp.sample(1000));
  assert.doesNotThrow(() => gp.startHealthProbe(100));
  for (const fn of timers) assert.doesNotThrow(() => fn());
  gp.dispose();
});

test('P2-9 & P2-10: issue-461-sfx-mute shallow-copies options and ui-feedback-20261104 pins only absolute backdrops', () => {
  const audioCode = adaptBuildSource('src/audio/audio.js', readUpstream('src/audio/audio.js'));
  assert.match(audioCode, /const rec = \{ name, d, o: \{ \.\.\.o \}, stopped: false, live: null \};/);

  const menusCode = adaptBuildSource('src/ui/menus.js', readUpstream('src/ui/menus.js'));
  assert.match(menusCode, /return cs\.position === 'absolute' && child\.offsetWidth >= box\.clientWidth \* 0\.9/);
  assert.doesNotMatch(menusCode, /cs\.position === 'absolute' \|\| cs\.position === 'fixed'/);
});
