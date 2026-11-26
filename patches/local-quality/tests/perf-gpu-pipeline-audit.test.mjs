import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

import { patchLobbySetShowcase } from '../lobby-quality-adapter.mjs';
import { lobbyShadowDue } from '../issue-472-adapter.mjs';
import { collectGtaoNonOccluders, installGtaoOccluderFilter } from '../gtao-budget.mjs';
import { adaptComposerFormat } from '../composer-format-adapter.mjs';
import { installPortraitWork } from '../portrait-work.mjs';
import { adaptShowcaseIdlePools } from '../showcase-idle-pools-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const THREE_FILE = path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function loadWithThree(relPath) {
  const context = vm.createContext({
    console, performance, URL, Object, Array, Map, Set, WeakMap,
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array,
    document: { createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) },
  });
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file);
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), {
      context,
      identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    cache.set(file, mod);
    return mod;
  };
  const entry = load(path.join(ROOT, relPath));
  await entry.link((spec, from) => {
    const resolved = spec === 'three' ? THREE_FILE : path.resolve(path.dirname(from.identifier), spec);
    return load(resolved);
  });
  await entry.evaluate();
  return { ns: entry.namespace, THREE: cache.get(THREE_FILE).namespace };
}

// ---------------------------------------------------------------------------
// GPU-1: lobby-quality-adapter.mjs — explicit boolean shadowMap.needsUpdate
// ---------------------------------------------------------------------------
test('GPU-1: lobby branch explicitly resets shadowMap.needsUpdate to false on non-due frames', () => {
  const raw = read('inkwave-public/src/game/showcase.js');
  const out = patchLobbySetShowcase('src/game/showcase.js', raw);
  assert.ok(out.includes('r.shadowMap.needsUpdate = !!lobbyShadowDue(L);'));
  assert.equal(out.includes('if (lobbyShadowDue(L)) r.shadowMap.needsUpdate = true;'), false);

  const r = { shadowMap: { needsUpdate: true } };
  const L = { quality: 'low' };
  const results = [];
  for (let i = 0; i < 6; i++) {
    r.shadowMap.needsUpdate = true;
    r.shadowMap.needsUpdate = !!lobbyShadowDue(L);
    results.push(r.shadowMap.needsUpdate);
  }
  assert.deepEqual(results, [true, false, false, true, false, false]);
});

// ---------------------------------------------------------------------------
// GPU-2: gtao-budget.mjs — sights (Map/Array), clouds (group/mesh), beams (mesh)
// ---------------------------------------------------------------------------
test('GPU-2: collectGtaoNonOccluders filters projectile sights, clouds, and beams without un-hiding hidden nodes', () => {
  const sightVis = { name: 'sightVis', visible: true };
  const sightHid = { name: 'sightHid', visible: false };
  const cloudGroup = { name: 'cloudGroup', visible: true };
  const cloudMesh = { name: 'cloudMesh', visible: true };
  const cloudHid = { name: 'cloudHid', visible: false };
  const beamVis = { name: 'beamVis', visible: true };
  const beamHid = { name: 'beamHid', visible: false };

  const G = {
    projectiles: {
      sights: new Map([['a', sightVis], ['b', sightHid]]),
      clouds: [{ group: cloudGroup, mesh: cloudMesh }, { group: cloudHid, mesh: null }, null],
      beams: [{ mesh: beamVis }, { mesh: beamHid }, null],
    },
  };
  const out = [];
  collectGtaoNonOccluders(G, out);
  assert.deepEqual(out, [sightVis, cloudGroup, cloudMesh, beamVis]);

  G.projectiles.sights = [sightVis, sightVis, sightHid];
  collectGtaoNonOccluders(G, out);
  assert.deepEqual(out, [sightVis, cloudGroup, cloudMesh, beamVis]);

  const normalMat = {};
  let observed = null;
  const gtao = {
    normalMaterial: normalMat,
    _renderOverride() {
      observed = {
        sightVis: sightVis.visible,
        sightHid: sightHid.visible,
        cloudGroup: cloudGroup.visible,
        cloudMesh: cloudMesh.visible,
        cloudHid: cloudHid.visible,
        beamVis: beamVis.visible,
        beamHid: beamHid.visible,
      };
    },
  };
  assert.equal(installGtaoOccluderFilter(gtao, G), true);
  gtao._renderOverride({}, normalMat);
  assert.deepEqual(observed, {
    sightVis: false, sightHid: false,
    cloudGroup: false, cloudMesh: false, cloudHid: false,
    beamVis: false, beamHid: false,
  });
  assert.equal(sightVis.visible, true);
  assert.equal(sightHid.visible, false);
  assert.equal(cloudHid.visible, false);
  assert.equal(beamHid.visible, false);
});

// ---------------------------------------------------------------------------
// GPU-3: composer-format-adapter.mjs — skip grade check when !_composerPackedCapable
// ---------------------------------------------------------------------------
test('GPU-3: composer grade check is skipped every frame when _composerPackedCapable is false', () => {
  const raw = read('inkwave-public/src/core/renderer.js');
  const out = adaptComposerFormat('src/core/renderer.js', raw, replaceOnce);
  assert.ok(out.includes(
    'const gradeCanUsePackedTarget = this._composerPackedCapable ? (composerGradeKeepsPackedTargetNonnegative(gr) && !this.extraPass?.enabled) : false;'
  ));
  assert.ok(out.includes('this._composerPackedCapable && this._composerUsesPackedTarget !== gradeCanUsePackedTarget'));

  let checkCalls = 0;
  let updateCalls = 0;
  const runGuard = new Function('G', 'composerGradeKeepsPackedTargetNonnegative', 'updateComposerTargetPrecision', 'THREE', `
    const gr = G.env && G.env.grade;
    const gradeCanUsePackedTarget = this._composerPackedCapable ? (composerGradeKeepsPackedTargetNonnegative(gr) && !this.extraPass?.enabled) : false;
    if (this._composerPackedCapable && this._composerUsesPackedTarget !== gradeCanUsePackedTarget) {
      updateComposerTargetPrecision(THREE, this.composer, gradeCanUsePackedTarget);
      this._composerUsesPackedTarget = gradeCanUsePackedTarget;
    }
  `);
  const desktop = { _composerPackedCapable: false, _composerUsesPackedTarget: false, extraPass: { enabled: false }, composer: {} };
  const G = { env: { grade: { uLift: 0 } } };
  runGuard.call(desktop, G, () => { checkCalls++; return true; }, () => { updateCalls++; }, THREE);
  assert.equal(checkCalls, 0);
  assert.equal(updateCalls, 0);

  const mobile = { _composerPackedCapable: true, _composerUsesPackedTarget: true, extraPass: { enabled: false }, composer: {} };
  runGuard.call(mobile, G, () => { checkCalls++; return false; }, () => { updateCalls++; }, THREE);
  assert.equal(checkCalls, 1);
  assert.equal(updateCalls, 1);
  assert.equal(mobile._composerUsesPackedTarget, false);
});

// ---------------------------------------------------------------------------
// GPU-4: showcase-shadow-adapter.mjs — fast-path sync + in-place mobile mutation + idle portrait shadow
// ---------------------------------------------------------------------------
test('GPU-4: studio shadow fast-path skips redundant sync, detects in-place mobile edits, and skips idle portrait shadow flag', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: "export * from './src/game/showcase.js';", globals: { document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4) }), putImageData() {} }) }) } } });
  const { G, Showcase } = f;
  const mobile = { touch: false, ios: false };
  G.settings = { quality: 'low' };
  G.game = { mobile };

  const sc = Object.create(Showcase.prototype);
  sc.scene = new f.THREE.Scene();
  sc._buildLights();
  Object.assign(sc, {
    _pq: [], _pcache: new Map(), chars: [], mode: null, lob: null, _out: 0,
    _clear() {}, _lobRelease() {}, stageL: null, stageR: null,
  });

  sc.key.shadow.map = null;
  sc.key.shadow.mapPass = null;
  sc.render();
  assert.equal(sc._iwShadowQ, 'low');
  assert.equal(sc._iwShadowT, false);
  assert.equal(sc._iwShadowI, false);

  let setCalls = 0;
  const origSet = sc.key.shadow.mapSize.set.bind(sc.key.shadow.mapSize);
  sc.key.shadow.mapSize.set = (...args) => { setCalls++; return origSet(...args); };
  sc.key.shadow.mapSize.x = 999;
  for (let i = 0; i < 30; i++) sc.render();
  assert.equal(setCalls, 0, 'stable hidden frame with no map must skip syncStudioShadow');
  assert.equal(sc.key.shadow.mapSize.x, 999);

  // In-place mutation of mobile.touch (same object reference) MUST trigger syncStudioShadow
  mobile.touch = true;
  sc.render();
  assert.equal(setCalls, 1, 'in-place mobile.touch mutation must invalidate fast-path');
  assert.equal(sc._iwShadowT, true);
  assert.equal(sc.key.shadow.mapSize.x, 1024);

  // In-place mutation of mobile.ios MUST also trigger syncStudioShadow
  sc.key.shadow.mapSize.x = 999;
  mobile.ios = true;
  sc.render();
  assert.equal(setCalls, 2, 'in-place mobile.ios mutation must invalidate fast-path');
  assert.equal(sc._iwShadowI, true);

  // Idle portrait run (mode === null) must NOT leave r.shadowMap.needsUpdate = true
  const r = {
    autoClear: true,
    toneMappingExposure: 1,
    shadowMap: { needsUpdate: false },
    getRenderTarget: () => null,
    setRenderTarget() {},
    getClearAlpha: () => 1,
    getClearColor: (c) => c.set(0x000000),
    setClearColor() {},
    clear() {},
    render() { this.shadowMap.needsUpdate = false; },
    readRenderTargetPixelsAsync: () => ({ then() { return Promise.resolve(); } }),
  };
  class DummyChar {
    static requireWeaponOpponentPalette() {}
    constructor() { this.root = new f.THREE.Group(); }
    setDance() {}
    update() {}
    getHeadPosition(o) { o.set(0, 1.8, 0); }
    dispose() {}
  }
  Object.assign(sc, {
    r, mode: null, CharacterClass: DummyChar, color: new f.THREE.Color('orange'),
    _c: new f.THREE.Color(), _c2: new f.THREE.Color(), _clr: new f.THREE.Color(),
    _pv: new f.THREE.Vector3(), _tgt: new f.THREE.Vector3(),
    _anim: () => ({}), _prt: {}, _prt8: { texture: {} },
    _pres: { uniforms: { tMap: {}, uExposure: {} } }, _presScene: {}, compCam: {},
    _aimLights() {}, _setColor() {},
  });
  await sc._renderPortraitRun({ color: 'orange', style: {} }, 64, 'head', r);
  assert.equal(r.shadowMap.needsUpdate, false, 'idle portrait run must not force pedestal shadow refresh');

  sc.mode = 'loadout';
  sc.chars = [{}];
  await sc._renderPortraitRun({ color: 'orange', style: {} }, 64, 'head', r);
  assert.equal(r.shadowMap.needsUpdate, true, 'active pedestal portrait run must preserve shadow refresh');
});

// ---------------------------------------------------------------------------
// GPU-5: locker-stage.mjs — skip rendering when document.hidden is true
// ---------------------------------------------------------------------------
test('GPU-5: renderLockerStage skips backdrop and showcase render when ownerDocument.hidden is true', async () => {
  const { ns } = await loadWithThree('patches/local-quality/locker-stage.mjs');
  let updates = 0, showcaseRenders = 0, rendererClears = 0;
  const game = {
    _skipRender: false,
    showcase: {
      update() { updates++; },
      render() { showcaseRenders++; },
    },
  };
  const doc = { hidden: true };
  const renderer = {
    domElement: { ownerDocument: doc },
    autoClear: true,
    getSize: (v) => v.set(800, 600),
    getClearAlpha: () => 1,
    getClearColor: (c) => c.set(0),
    getRenderTarget: () => null,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget() {},
    setClearColor() {},
    clear() { rendererClears++; },
    render() {},
  };
  ns.renderLockerStage(game, { renderer }, 1 / 60);
  assert.equal(updates, 1);
  assert.equal(rendererClears, 0);
  assert.equal(showcaseRenders, 0);

  doc.hidden = false;
  ns.renderLockerStage(game, { renderer }, 1 / 60);
  assert.equal(updates, 2);
  assert.equal(rendererClears, 1);
  assert.equal(showcaseRenders, 1);
});

// ---------------------------------------------------------------------------
// GPU-6: portrait-work.mjs — requeue on size change while readback in-flight
// ---------------------------------------------------------------------------
test('GPU-6: stagedPortraitStep and render requeue job when _pflight > 0 and _prt8.width mismatches target size', async () => {
  const prevRIC = globalThis.requestIdleCallback;
  const prevCIC = globalThis.cancelIdleCallback;
  const idleQueue = [];
  globalThis.requestIdleCallback = (cb) => { idleQueue.push(cb); return idleQueue.length; };
  globalThis.cancelIdleCallback = () => {};

  try {
    class MockShowcase {
      _portraitStep() {}
      _renderPortraitRun() {}
      dispose() {}
    }
    const G = { mode: 'menu', match: null, game: { mobile: { touch: false } } };
    installPortraitWork(MockShowcase, G, (c) => c, new Set(['loadout', 'locker', 'results']));

    const sc = new MockShowcase();
    let renderCalls = 0;
    const job1 = { key: 'k256', req: { size: 256 }, cbs: [() => {}] };
    Object.assign(sc, {
      mode: 'menu', _out: 0, _warmState: 'done', _pflight: 1,
      _prt8: { width: 128 },
      _pcache: new Map(),
      _pq: [job1],
      _portraitCharacter: {
        resetPortraitForRequest() {},
        update() {},
      },
      _anim: () => ({ time: 0 }),
      _renderPortrait() { renderCalls++; return Promise.resolve({ width: 256, height: 256 }); },
    });

    // Guard 1: immediate requeue in stagedPortraitStep() before scheduling idle work
    sc._portraitStep();
    assert.equal(renderCalls, 0);
    assert.equal(idleQueue.length, 0);
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._pq[0], job1);

    // Default size (128) matches _prt8.width 128 and completes normally
    const jobDefault = { key: 'kDef', req: {}, cbs: [() => {}] };
    sc._pq = [jobDefault];
    sc._portraitStep();
    assert.equal(idleQueue.length, 1);
    while (idleQueue.length > 0) idleQueue.shift()({ didTimeout: false, timeRemaining: () => 50 });
    await Promise.resolve();
    assert.equal(renderCalls, 1);

    // Guard 2: mid-staging mismatch right before render() requeues (req.size=999 clamps to 512 != 128)
    renderCalls = 0;
    sc._pflight = 0;
    sc._prt8 = { width: 128 };
    const jobClamp = { key: 'kClamp', req: { size: 999 }, cbs: [() => {}] };
    sc._pq = [jobClamp];
    sc._portraitStep();
    assert.equal(idleQueue.length, 1);
    for (let i = 0; i < 15; i++) idleQueue.shift()({ didTimeout: false, timeRemaining: () => 50 });
    assert.equal(idleQueue.length, 1, 'render callback queued');
    sc._pflight = 1;
    sc._prt8 = { width: 128 };
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 50 });
    assert.equal(renderCalls, 0, 'Guard 2 must requeue before calling _renderPortrait');
    assert.equal(sc._portraitJob, null);
    assert.equal(sc._pq[0], jobClamp);
  } finally {
    globalThis.requestIdleCallback = prevRIC;
    globalThis.cancelIdleCallback = prevCIC;
  }
});

// ---------------------------------------------------------------------------
// GPU-15: native-paint-transfer.mjs + paint-render-regions-adapter.mjs
// ---------------------------------------------------------------------------
test('GPU-15: native-paint-transfer reuses range, toggles _iwTransferActive, and detects defines/extensions mutations', async () => {
  const { ns, THREE: T } = await loadWithThree('patches/local-quality/native-paint-transfer.mjs');
  const MAX_QUADS = 6000;
  const vertexShader = [
    'attribute vec2 aPos;',
    'attribute vec3 aLocal;',
    'attribute vec3 aStretch;',
    'void main() {',
    '  vStretch = aStretch;',
    '  vLocal = aLocal;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}',
  ].join('\n');

  const observedActive = [];
  const usedFastGeo = [];
  class MockPaint {
    constructor(defines, extensions) {
      this.level = { native: true };
      this._initDefines = defines;
      this._initExtensions = extensions;
      this.quads = 0;
    }
    _initGPU() {
      this.renderer = {
        capabilities: { isWebGL2: true },
        getContext: () => ({ isContextLost: () => false }),
      };
      this.scene = new T.Scene();
      this.aPos = new Float32Array(MAX_QUADS * 8);
      this.aLocal = new Float32Array(MAX_QUADS * 12);
      this.aSplat = new Float32Array(MAX_QUADS * 16);
      this.aStretch = new Float32Array(MAX_QUADS * 12);
      this.aGrow = new Float32Array(MAX_QUADS * 16);
      this.geo = new T.BufferGeometry();
      const idx = new Uint16Array(MAX_QUADS * 6);
      for (let q = 0; q < MAX_QUADS; q++) {
        const ii = q * 6, v = q * 4;
        idx[ii] = v; idx[ii + 1] = v + 1; idx[ii + 2] = v + 2;
        idx[ii + 3] = v; idx[ii + 4] = v + 2; idx[ii + 5] = v + 3;
      }
      this.geo.setIndex(new T.BufferAttribute(idx, 1));
      this.geo.setAttribute('aPos', new T.BufferAttribute(this.aPos, 2));
      this.geo.setAttribute('aLocal', new T.BufferAttribute(this.aLocal, 3));
      this.geo.setAttribute('aSplat', new T.BufferAttribute(this.aSplat, 4));
      this.geo.setAttribute('aStretch', new T.BufferAttribute(this.aStretch, 3));
      this.geo.setAttribute('aGrow', new T.BufferAttribute(this.aGrow, 4));
      this.mat = new T.ShaderMaterial({
        vertexShader,
        fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
        defines: this._initDefines,
        extensions: this._initExtensions,
      });
      this.mesh = new T.Mesh(this.geo, this.mat);
      this.mesh.frustumCulled = false;
    }
    _drawQuads() {
      observedActive.push(!!this._iwTransferActive);
      usedFastGeo.push(this.mesh.geometry !== this.geo);
      this._lastDrawnGeo = this.mesh.geometry;
    }
    dispose() {}
  }

  ns.installNativePaintTransfer(MockPaint);
  const paint = new MockPaint({ FOO: 1, IGNORED: undefined }, null);
  paint._initGPU();
  paint.quads = 2;

  paint._drawQuads();
  assert.deepEqual(observedActive, [true]);
  assert.deepEqual(usedFastGeo, [true]);
  assert.equal(paint._iwTransferActive, false, 'reset in finally');
  const fastBuf = paint._lastDrawnGeo.attributes.iwRect.data;
  assert.equal(fastBuf.updateRanges.length, 1);
  const firstRangeRef = fastBuf.updateRanges[0];
  assert.equal(firstRangeRef.start, 0);
  assert.equal(firstRangeRef.count, 40);

  paint.quads = 3;
  paint._drawQuads();
  assert.equal(fastBuf.updateRanges.length, 1);
  assert.equal(fastBuf.updateRanges[0], firstRangeRef, 'transferRange object must be reused');
  assert.equal(firstRangeRef.count, 60);

  // undefined property and null/undefined empty record stay compatible
  paint.mat.defines.EXTRA_UNDEF = undefined;
  paint.mat.extensions = undefined;
  paint._drawQuads();
  assert.equal(usedFastGeo.at(-1), true);

  // Inherited prototype property ignored (Object.hasOwn)
  paint.mat.extensions = Object.create({ INHERITED: 1 });
  paint._drawQuads();
  assert.equal(usedFastGeo.at(-1), true);

  // In-place addition to defines MUST fall back
  paint.mat.defines.CUSTOM = 1;
  paint._drawQuads();
  assert.equal(usedFastGeo.at(-1), false);
  assert.equal(observedActive.at(-1), false);

  // Restore defines -> fast-path resumes
  delete paint.mat.defines.CUSTOM;
  paint._drawQuads();
  assert.equal(usedFastGeo.at(-1), true);

  // In-place value change -> fall back
  paint.mat.defines.FOO = 2;
  paint._drawQuads();
  assert.equal(usedFastGeo.at(-1), false);

  const paintSrc = read('inkwave-public/src/world/paint.js');
  const adapted = adaptBuildSource('src/world/paint.js', paintSrc);
  assert.ok(adapted.includes('if (!this._iwTransferActive) markPaintAttributeRange(at, n, THREE.BufferAttribute);'));

  paint.dispose();
});

// ---------------------------------------------------------------------------
// GPU-16: showcase-idle-pools-adapter.mjs (all 7 meshes) & fx-empty-pools-adapter.mjs
// ---------------------------------------------------------------------------
test('GPU-16: showcase-idle-pools hides all 7 meshes when empty and uploads active matrix ranges only', () => {
  const source = read('inkwave-public/src/game/showcase.js');
  const patched = adaptShowcaseIdlePools('src/game/showcase.js', source, replaceOnce);
  const helpers = patched.slice(patched.indexOf('const TAU ='), patched.indexOf('// ================================================================================================ geometry'));
  const pools = patched.slice(patched.indexOf('const _m4 ='), patched.indexOf('// Swim paths'));
  const { InkFX, Confetti, Sparkles, InkTrail } = new Function(
    'THREE', 'lerp',
    helpers + '\nfunction splatGeometry(){return new THREE.PlaneGeometry(1,1)}\nfunction confettiGeometry(){return new THREE.PlaneGeometry(1,1)}\n' + pools + '\nreturn {InkFX,Confetti,Sparkles,InkTrail};'
  )(THREE, (a, b, t) => a + (b - a) * t);

  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const rand = () => 0.5;
  const color = new THREE.Color(1, 0.2, 0.4);
  const decks = [{ x: 0, y: 0, z: 0, r: 20 }];

  const ink = new InkFX(root, mat, rand);
  const conf = new Confetti(root, rand);
  const spk = new Sparkles(root, mat, rand);
  const trl = new InkTrail(root);

  const allSeven = [ink.mesh, ink.splats, ink.rings, conf.paper, conf.foil, spk.mesh, trl.mesh];
  for (const m of allSeven) {
    assert.equal(m.visible, false, 'pool mesh starts hidden');
    assert.deepEqual(m._iwRange, { start: 0, count: 0 });
  }

  ink.drop(0, 1, 0, 0, -0.5, 0, 0.05, 1, 2);
  ink.splat(0, 0, 0, 0.2, 2);
  ink.ripple(0, 0, 0, 0.1, 0.5, 2);
  conf.spawn(0, 1, 0, 0, 0, 0, false);
  conf.spawn(0, 1, 0, 0, 0, 0, true);
  spk.spawn(0, 1, 0, 0.1, color, 2);
  trl.add(0, 0, 0, 0, 0.2, 0.3, color, 2);

  ink.update(1 / 60, decks);
  conf.update(1 / 60, decks);
  spk.update(1 / 60);
  trl.update(1 / 60);

  for (const m of allSeven) {
    assert.equal(m.count > 0, true);
    assert.equal(m.visible, true);
    assert.equal(m.instanceMatrix.updateRanges.length, 1);
    assert.equal(m.instanceMatrix.updateRanges[0], m._iwRange, 'reuses _iwRange object');
    assert.equal(m._iwRange.count, m.count * 16);
  }

  ink.clear(); conf.clear(); spk.clear(); trl.clear();
  for (const m of allSeven) {
    assert.equal(m.count, 0);
    assert.equal(m.visible, false);
  }
});

test('GPU-16: fx-empty-pools hides on construct/clear and tracks replacement meshes after updateFXQuality', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: "export { FX } from './src/fx/fx.js';" });
  const scene = new f.THREE.Scene();
  const fx = new f.FX(scene, { particles: 1 });
  const getPools = () => [fx.dMesh, fx.puffs.mesh, fx.glows.mesh, fx.rings.mesh, fx.shells.mesh, fx.beams.mesh];

  for (const m of getPools()) assert.equal(m.visible, false, 'FX pool mesh starts hidden');

  const cam = new f.THREE.PerspectiveCamera();
  cam.updateMatrixWorld();
  const p = new f.THREE.Vector3(0, 1, -3), n = new f.THREE.Vector3(0, 1, 0), c = new f.THREE.Color(1, 0.4, 0.1);
  fx.burst(p, n, c, { count: 4 });
  fx.ring(p, n, c, {});
  fx.update(1 / 60, cam);
  assert.equal(fx.dMesh.visible, true);
  assert.equal(fx.rings.mesh.visible, true);

  fx.clear();
  for (const m of getPools()) assert.equal(m.visible, false, 'clear() hides FX pool mesh');

  // Simulate updateFXQuality() swapping out dMesh and puffs.mesh at runtime
  const oldDMesh = fx.dMesh;
  const newDMesh = new f.THREE.Mesh(new f.THREE.BufferGeometry(), new f.THREE.MeshBasicMaterial());
  newDMesh.geometry.instanceCount = 3;
  newDMesh.visible = false;
  fx.dMesh = newDMesh;

  const newPuffMesh = new f.THREE.Mesh(new f.THREE.BufferGeometry(), new f.THREE.MeshBasicMaterial());
  newPuffMesh.geometry.instanceCount = 0;
  newPuffMesh.visible = true;
  fx.puffs.mesh = newPuffMesh;
  fx._updateDrops = () => {};
  fx._updateSprites = () => {};

  fx.update(1 / 60, cam);
  assert.equal(newDMesh.visible, true, 'replaced dMesh visibility must be updated');
  assert.equal(newPuffMesh.visible, false, 'replaced puffs.mesh visibility must be updated');
  assert.equal(oldDMesh.visible, false, 'old mesh is no longer mutated');
});

// ---------------------------------------------------------------------------
// GPU-17: paint-regional-mips.mjs (no DRAW_FRAMEBUFFER_BINDING) & ink-volume/runtime.mjs
// ---------------------------------------------------------------------------
test('GPU-17: paint-regional-mips generate() never queries or binds DRAW_FRAMEBUFFER', () => {
  const src = read('patches/local-quality/paint-regional-mips.mjs');
  const body = src.slice(src.indexOf('function generate(s,plan)'), src.indexOf('\nfunction release(p)'));
  assert.equal(body.includes('DRAW_FRAMEBUFFER_BINDING'), false);
  assert.equal(body.includes('DRAW_FRAMEBUFFER'), false);
  assert.equal(body.includes('READ_FRAMEBUFFER_BINDING'), true);
  assert.equal(body.includes('TEXTURE_BINDING_2D'), true);
});

test('GPU-17: ink-volume defers camera world/frustum updates, keeps warmAssets lighting fresh, and skips compose in measureOnly', async () => {
  const { ns, THREE: T } = await loadWithThree('patches/local-quality/ink-volume/runtime.mjs');
  const { InkVolumes, WARM_FRAMES } = ns;
  const root = new T.Group();
  const lighting = {
    sunDir: new T.Vector3(0, 1, 0),
    sunCol: new T.Color(1, 1, 1),
    sky: new T.Color(0.5, 0.7, 1),
    ground: new T.Color(0.2, 0.2, 0.2),
  };
  const vols = new InkVolumes(root, lighting, { capacity: 16 });
  const levelData = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
  };
  const pack = {
    schema: 'inkwave-volume-v1',
    patterns: [{
      width: 2, height: 2, fps: 10,
      frames: [{ rgba: new Uint8Array(16).fill(255), levels: [levelData, levelData] }],
    }],
  };
  vols.register('blob', pack);

  const cam = new T.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  let updateWorldCalls = 0;
  const origUpdate = cam.updateMatrixWorld.bind(cam);
  cam.updateMatrixWorld = (...args) => { updateWorldCalls++; return origUpdate(...args); };

  const source = {
    age: 0.1,
    pos: new T.Vector3(0, 0, 0),
    vel: new T.Vector3(0, 0, -1),
    owner: { color: new T.Color(1, 0, 0) },
  };

  for (let w = 0; w < WARM_FRAMES; w++) {
    updateWorldCalls = 0;
    vols.begin(cam);
    assert.equal(updateWorldCalls, 1, `warm frame ${w}: _lighting updates camera world once`);
    assert.equal(vols.submit('blob', source, 1, 0), true);
    assert.equal(updateWorldCalls, 1, `warm frame ${w}: submit reuses camera world`);
    vols.end();
  }
  vols.begin(cam);
  vols.end();

  updateWorldCalls = 0;
  vols.begin(cam);
  vols.end();
  assert.equal(updateWorldCalls, 0, 'idle frame with 0 submissions skips camera.updateMatrixWorld');

  updateWorldCalls = 0;
  vols.begin(cam);
  assert.equal(updateWorldCalls, 0);
  assert.equal(vols.submit('blob', source, 1, 0), true);
  assert.equal(updateWorldCalls, 1);
  assert.equal(vols.submit('blob', source, 1, 0), true);
  assert.equal(updateWorldCalls, 1, 'second submit reuses frustum & camera world');
  vols.end();

  vols.begin(cam);
  vols.measureOnly = true;
  let composeCalls = 0;
  const origCompose = vols.plans[0].matrix.compose.bind(vols.plans[0].matrix);
  vols.plans[0].matrix.compose = (...args) => { composeCalls++; return origCompose(...args); };
  assert.equal(vols.submit('blob', source, 1, 0), true);
  assert.equal(composeCalls, 0, 'measureOnly must skip Matrix4.compose');
  assert.equal(vols.frameDemandInstances, 1);
  assert.ok(vols.frameDemandTriangles > 0);
  vols.dispose();
});
