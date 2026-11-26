import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { convertSource } from '../runtime/source-convert.mjs';
import { updatePaintQuality } from '../../local-quality/world-quality.mjs';

if (!vm.SourceTextModule) {
  test('Track B native GPU & physics audit (vm-modules subprocess)', () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ['--experimental-vm-modules', '--test', fileURLToPath(import.meta.url)], { env, stdio: 'pipe' });
  });
} else {

const RUNTIME_DIR = fileURLToPath(new URL('../runtime/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function loadTrackBModules() {
  const G = { camera: null };
  const context = vm.createContext({
    console, performance, Math, Number, Object, Array, Map, Set, WeakMap,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer,
    Error, TypeError, RangeError, Infinity, NaN, isFinite,
    setTimeout, clearTimeout,
  });
  const cache = new Map();
  const makeSynth = (values) => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [k, v] of Object.entries(values)) this.setExport(k, v);
  }, { context });

  class Hit {
    constructor() {
      this.hit = false; this.dist = 0; this.point = new THREE.Vector3(); this.normal = new THREE.Vector3();
      this.block = -1; this.face = -1; this.u = 0; this.v = 0; this.triangle = -1;
    }
  }
  class GroundHit extends Hit {
    constructor() { super(); this.y = 0; this.center = false; this.grate = false; }
  }
  class Physics {
    constructor(level) { this.level = level; }
    raycast(_o, _d, maxDist, out = new Hit()) { out.hit = false; out.dist = maxDist; return out; }
    bodyFits() { return true; }
    collideBody() {}
    collideCapsule() {}
  }
  const PLAYER = {
    radius: 0.38, height: 1.45, stepUp: 0.35, stepDown: 0.45, footRadius: 0.32,
    squidBodyLift: 0.05, squidHeight: 0.65, squidStepUp: 0.25, fallDeathY: -20,
    s3HumanoidTerrainRadiusRaw: 0.38, s3SwimTerrainRadiusRaw: 0.42, s3TerrainDistanceScale: 1,
    runSpeed: 6, airMinSpeed: 4, airAccel: 15, gravity: 28, fallGravityMul: 1.3, apexBand: 1.5, apexGravityMul: 0.7, maxFall: 28, ledgeAssist: 0.15,
  };

  const synthMap = {
    three: makeSynth(THREE),
    '../../../src/core/ctx.js': makeSynth({ G }),
    '../../../src/config.js': makeSynth({ PLAYER }),
    '../../../src/game/physics.js': makeSynth({ Physics, Hit, GroundHit, WALKABLE: 0.68 }),
    '../../../src/world/levelMaterial.js': makeSynth({
      createLevelMaterial: () => {
        const m = new THREE.MeshStandardMaterial();
        m.onBeforeCompile = () => {};
        return m;
      },
    }),
    '../../splatoon3/runtime/paint-ownership.mjs': makeSynth({ paintShapeSeed: (s) => (s * 1000) | 0 }),
    '../../splatoon3/runtime/movement-physics.mjs': makeSynth({ stepGroundVelocity: () => {} }),
    '../../splatoon3/runtime/weapon-weight.mjs': makeSynth({ weightSpeedCurve: () => [0.1] }),
    './native-bot-support.mjs': makeSynth({ nativeSourceFootSupported: () => true }),
  };

  async function resolveAndLoad(absPath) {
    if (cache.has(absPath)) return cache.get(absPath);
    const src = fs.readFileSync(absPath, 'utf8');
    const mod = new vm.SourceTextModule(src, { context, identifier: absPath });
    cache.set(absPath, mod);
    await mod.link(async (specifier) => {
      if (synthMap[specifier]) return synthMap[specifier];
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(absPath), specifier);
        return resolveAndLoad(target);
      }
      throw new Error(`Unexpected import in Track B test loader: ${specifier} from ${absPath}`);
    });
    await mod.evaluate();
    return mod;
  }

  const [inkChunks, paintDetail, render, triWorld, physics, drop, combat, ranked] = await Promise.all([
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-ink-chunks.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-paint-detail.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-render.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'triangle-world.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-physics.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-drop.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-combat-support.mjs')),
    resolveAndLoad(path.join(RUNTIME_DIR, 'native-ranked-goals.mjs')),
  ]);

  return {
    G,
    NativeInkMesh: inkChunks.namespace.NativeInkMesh,
    NativePaintDetail: paintDetail.namespace.NativePaintDetail,
    nativeDetailPlanes: paintDetail.namespace.nativeDetailPlanes,
    nativeDisplay: render.namespace.nativeDisplay,
    nativeInkMaterial: render.namespace.nativeInkMaterial,
    TriangleWorld: triWorld.namespace.TriangleWorld,
    NativePhysics: physics.namespace.NativePhysics,
    nativeDropClearance: drop.namespace.nativeDropClearance,
    nativeCombatWet: combat.namespace.nativeCombatWet,
    nativeRankedBotGoalReachable: ranked.namespace.nativeRankedBotGoalReachable,
  };
}

let modsPromise;
const getMods = () => (modsPromise ||= loadTrackBModules());

function makeInkRig(NativeInkMesh, { tilePositions, trisPerFace = 4 }) {
  const faces = tilePositions.length;
  const triangles = faces * trisPerFace;
  const pos = new Float32Array(triangles * 9);
  for (let f = 0; f < faces; f++) {
    const [bx, bz] = tilePositions[f];
    for (let k = 0; k < trisPerFace; k++) {
      const t = f * trisPerFace + k;
      const ox = bx + k * 0.05;
      pos.set([ox, 0, bz, ox + 0.03, 0, bz, ox, 0.03, bz + 0.03], t * 9);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mesh = new NativeInkMesh(g, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  mesh._facePainted = new Uint8Array(faces);
  mesh._paintedFaceWords = new Uint32Array(Math.ceil(faces / 32));
  mesh._faceStart = Uint32Array.from({ length: faces + 1 }, (_, i) => i * trisPerFace);
  mesh._faceSingleTile = new Int32Array(faces);
  for (let f = 0; f < faces; f++) {
    const s = mesh._faceStart[f], e = mesh._faceStart[f + 1];
    let tile = mesh._triangleTile[s];
    for (let t = s + 1; t < e; t++) if (mesh._triangleTile[t] !== tile) { tile = -1; break; }
    mesh._faceSingleTile[f] = tile;
  }
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 300);
  camera.position.set(0, 100, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { mesh, camera, g };
}

function paintFace(rig, idx) {
  rig.mesh._facePainted[idx] = 1;
  rig.mesh._paintedFaceWords[idx >>> 5] |= 1 << (idx & 31);
  rig.mesh._faceDirty = true;
}

// ============================================================================
// GPU-7: native-ink-chunks.mjs
// ============================================================================
test('GPU-7: NativeInkMesh preserves matrixAutoUpdate=true and skips bufferSubData on drawRange-only shrink or unchanged camera shift', async () => {
  const { NativeInkMesh } = await getMods();
  const rig = makeInkRig(NativeInkMesh, { tilePositions: [[0, 0], [32, 0], [64, 0]], trisPerFace: 4 });
  assert.equal(rig.mesh.matrixAutoUpdate, true, 'NativeInkMesh.matrixAutoUpdate contract must remain true');

  paintFace(rig, 0);
  paintFace(rig, 1);
  paintFace(rig, 2);
  rig.mesh.selectVisible(rig.camera);
  assert.equal(rig.g.drawRange.count, 36);
  rig.g.index.clearUpdateRanges();
  const verAfterFull = rig.g.index.version;

  // Tail tile 2 culled -> prefix [0..23] unchanged -> drawRange shrinks with ZERO GPU upload.
  rig.camera.left = -10; rig.camera.right = 45;
  rig.camera.updateProjectionMatrix();
  rig.mesh.selectVisible(rig.camera);
  assert.equal(rig.g.drawRange.count, 24);
  assert.equal(rig.g.index.version, verAfterFull, 'tail-only cull must skip bufferSubData');
  assert.equal(rig.g.index.updateRanges.length, 0);

  // Restoring tail tile 2 -> index[0..35] already holds [0..35] -> ZERO GPU upload.
  rig.camera.left = -100; rig.camera.right = 100;
  rig.camera.updateProjectionMatrix();
  rig.mesh.selectVisible(rig.camera);
  assert.equal(rig.g.drawRange.count, 36);
  assert.equal(rig.g.index.version, verAfterFull, 'restoring unchanged tail must skip bufferSubData');

  rig.mesh.dispose();
  rig.mesh.material.dispose();
});

test('GPU-7: camera shift (!paintOnly) and multi-tile path upload minimal [dirtyStart, dirtyEnd) range', async () => {
  const { NativeInkMesh } = await getMods();
  const rig = makeInkRig(NativeInkMesh, { tilePositions: [[0, 0], [32, 0], [64, 0], [96, 0]], trisPerFace: 4 });
  paintFace(rig, 0);
  paintFace(rig, 2);
  paintFace(rig, 3);
  rig.mesh.selectVisible(rig.camera);
  assert.equal(rig.g.drawRange.count, 36);
  rig.g.index.clearUpdateRanges();

  // Hide tile 3 (x=96) AND paint face 1 (x=32): !paintOnly path where face 0 [0..11] matches.
  paintFace(rig, 1);
  rig.camera.left = -10; rig.camera.right = 75;
  rig.camera.updateProjectionMatrix();
  rig.mesh.selectVisible(rig.camera);
  assert.equal(rig.g.drawRange.count, 36);
  assert.equal(rig.g.index.updateRanges.length, 1);
  assert.equal(rig.g.index.updateRanges[0].start, 12, 'unchanged prefix (face 0) must be skipped on !paintOnly camera shift');
  assert.equal(rig.g.index.updateRanges[0].count, 24);
  assert.deepEqual(Array.from(rig.g.index.array.slice(0, 36)), Array.from({ length: 36 }, (_, i) => i));

  // Multi-tile path (_faceSingleTile = -1): identical selection skips upload
  rig.mesh._faceSingleTile.fill(-1);
  rig.g.index.clearUpdateRanges();
  const verMulti = rig.g.index.version;
  rig.mesh._faceDirty = true;
  rig.mesh.selectVisible(rig.camera);
  assert.equal(rig.g.index.version, verMulti, 'identical multi-tile selection must skip bufferSubData');

  rig.mesh.dispose();
  rig.mesh.material.dispose();
});

// ============================================================================
// GPU-8: native-paint-detail.mjs
// ============================================================================
test('GPU-8: NativePaintDetail LRU projection cache, cached _attrList, and MAX_PAGE_RECORDS=512 cap with pending sync', async () => {
  const { NativePaintDetail } = await getMods();
  // Construct 70 distinct floor faces sharing the same plane (y=0, n=(0,1,0))
  const triangles = new Float32Array(70 * 2 * 9);
  const faces = [];
  for (let i = 0; i < 70; i++) {
    const x = i * 10;
    const t0 = i * 2, t1 = i * 2 + 1;
    triangles.set([x, 0, 0, x, 0, 8, x + 8, 0, 0], t0 * 9);
    triangles.set([x + 8, 0, 0, x, 0, 8, x + 8, 0, 8], t1 * 9);
    faces.push({
      id: i, turf: true, su: 8, sv: 8,
      origin: new THREE.Vector3(x, 0, 0),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, 0, 1),
      n: new THREE.Vector3(0, 1, 0),
      triangles: [t0, t1],
    });
  }
  const level = { native: true, faces, data: { triangles } };
  const state = { target: null, autoClear: true, scissorTest: false, color: new THREE.Color(), alpha: 1, draws: 0 };
  const renderer = {
    getContext: () => ({}), initRenderTarget() {}, getRenderTarget: () => state.target, setRenderTarget: v => { state.target = v; },
    getClearColor: o => o.copy(state.color), getClearAlpha: () => state.alpha, setClearColor: (c, a) => { state.color.set(c); state.alpha = a; },
    getViewport: o => o.set(0, 0, 256, 256), getScissor: o => o.set(0, 0, 256, 256), setViewport() {}, setScissor() {},
    getScissorTest: () => state.scissorTest, setScissorTest: v => { state.scissorTest = v; }, clear() {},
    render() { state.draws++; },
    get autoClear() { return state.autoClear; }, set autoClear(v) { state.autoClear = v; },
  };
  const paint = {
    level, renderer, size: 1024, ppm: 10,
    mat: new THREE.ShaderMaterial(),
    _emitGrowth(g) {
      // Emit quad on the first face entry
      const f = g.entries[0];
      this._pushQuad(f, 2, 6, 2, 6);
    },
    _pushQuad() {},
    _releaseSplatGrowth() {},
    clear() {},
    flush() {},
    dispose() {},
  };
  const detail = new NativePaintDetail(paint);

  // 1) _attrList is pre-cached in constructor and draw() avoids Object.values()
  assert.ok(Array.isArray(detail._attrList) && detail._attrList.length === 5);
  detail.vertexCount = 3;
  detail.draw();
  assert.equal(state.draws, 1);
  assert.equal(detail.vertexCount, 0);

  // 2) _projectionCache LRU eviction: touch face 0 before inserting face 64 -> evicts face 1, keeps face 0
  const plane = { u: faces[0].u, v: faces[0].v };
  for (let i = 0; i < 64; i++) detail._projectedTriangles(faces[i], plane, triangles);
  assert.equal(detail._projectionCache.size, 64);
  detail._projectedTriangles(faces[0], plane, triangles); // MRU hit
  detail._projectedTriangles(faces[64], plane, triangles); // triggers eviction
  assert.equal(detail._projectionCache.size, 64);
  assert.equal(detail._projectionCache.has(faces[0]), true, 'MRU face 0 must remain cached');
  assert.equal(detail._projectionCache.has(faces[1]), false, 'LRU face 1 must be evicted');
  assert.equal(detail._projectionCache.has(faces[64]), true);

  // 3) MAX_PAGE_RECORDS = 512 cap with page.pending sync and evicted growth-record guard
  const face0 = faces[0];
  const makeGrowth = (seed) => ({
    R: 0.8, seed, kind: 0, team: 0, entryStride: 7, entryRadius: 0.8,
    entries: [face0, 4, 4, 0, 0, 1, 0],
  });
  const firstGrowth = makeGrowth(0.001);
  detail.record(firstGrowth, 0.2, 0.1);
  detail.select();
  const page = [...detail.pages.values()].find(p => p.records.has(1));
  assert.ok(page && page.slot >= 0);
  detail.record(firstGrowth, 0.4, 0.2);
  assert.equal(page.pending.has(1), true);

  for (let i = 2; i <= 520; i++) detail.record(makeGrowth(i / 1000), 1, 1);
  assert.equal(page.records.size, 512, 'page.records must be capped at MAX_PAGE_RECORDS=512');
  assert.equal(page.records.has(1), false, 'oldest record 1 must be evicted from page.records');
  assert.equal(page.pending.has(1), false, 'evicted record 1 must also be deleted from page.pending');
  assert.equal(page.records.has(8), false, 'oldest 8 records must be evicted');
  assert.equal(page.records.has(9), true, 'record 9 must remain');
  assert.equal(page.records.has(520), true, 'newest record 520 must remain');

  // Re-growing evicted record must NOT re-insert id=1 into page.pending
  detail.record(firstGrowth, 0.8, 0.4);
  assert.equal(page.pending.has(1), false, 'evicted growth record must not be re-added to page.pending');

  detail.dispose();
  paint.mat.dispose();
});

// ============================================================================
// GPU-9: native-render.mjs
// ============================================================================
test('GPU-9: nativeDisplay shares one InterleavedBuffer across underlay-split parts and keeps parent group.matrixAutoUpdate=true', async () => {
  const { nativeDisplay } = await getMods();
  const vertices = new Float32Array([
    0, 0, 0,  0, 1, 0,  0, 0,
    2, 0, 0,  0, 1, 0,  1, 0,
    0, 0, 2,  0, 1, 0,  0, 1,
    2, 0, 2,  0, 1, 0,  1, 1,
  ]);
  const indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
  const manifest = {
    sourceMode: 'browser-direct',
    materials: { Concrete: { tint: '#cccccc' } },
    objects: [{
      name: 'SplitFloor',
      active: true,
      collidable: true,
      material: 'Concrete',
      vo: 0, vc: 4, io: 0, ic: 6,
      bounds: [[0, 0, 0], [2, 0, 2]],
      inkUnderlayMask: new Uint8Array([0, 1]),
    }],
  };
  const display = nativeDisplay({ manifest, vertices, indices }, new Map(), 'medium');
  assert.equal(display.group.matrixAutoUpdate, true, 'parent group.matrixAutoUpdate must stay true');
  assert.equal(display.group.children.length, 2, 'object with mixed inkUnderlayMask splits into 2 meshes');
  const [mainMesh, underlayMesh] = display.group.children;
  assert.equal(mainMesh.matrixAutoUpdate, false);
  assert.equal(underlayMesh.matrixAutoUpdate, false);
  assert.equal(underlayMesh.userData.nativeInkUnderlay, true);

  const interMain = mainMesh.geometry.getAttribute('position').data;
  const interUnder = underlayMesh.geometry.getAttribute('position').data;
  assert.strictEqual(interMain, interUnder, 'main and underlay geometries must share the same InterleavedBuffer');
  assert.strictEqual(mainMesh.geometry.getAttribute('normal').data, interMain);
  assert.strictEqual(underlayMesh.geometry.getAttribute('uv').data, interMain);
  assert.equal(typeof interMain.onUploadCallback, 'function', 'onUpload(releaseArray) must be registered');
  assert.ok(ArrayBuffer.isView(interMain.array) && interMain.array.BYTES_PER_ELEMENT === 4);
  interMain.onUploadCallback();
  assert.equal(interMain.array, null, 'single onUpload callback releases shared CPU view');

  display.dispose();
});

// ============================================================================
// GPU-10: world-quality.mjs
// ============================================================================
test('GPU-10: updatePaintQuality skips mipmaps on native stages and preserves mipmaps on non-native stages', () => {
  function runCase(isNative) {
    let regenCalls = 0;
    const oldRT = { texture: new THREE.Texture(), disposed: false, dispose() { this.disposed = true; } };
    const renderer = {
      autoClear: true,
      capabilities: { getMaxAnisotropy: () => 4 },
      getRenderTarget: () => null,
      setRenderTarget() {},
      getClearColor: (c) => c.set(0x000000),
      getClearAlpha: () => 1,
      setClearColor() {},
      clear() {},
      render() {},
    };
    const paint = {
      level: { native: isNative },
      paintFaces: [{ su: 4, sv: 4, atlas: { x: 0, y: 0, pad: 2, ppm: 10 } }],
      size: 2048,
      ppm: 18,
      usedHeight: 128,
      rt: oldRT,
      texture: oldRT.texture,
      renderer,
      _layout() {},
      _regenerateMipmaps() { regenCalls++; },
    };
    const changed = updatePaintQuality({ paint }, 4096, { paint }, THREE);
    assert.equal(changed, true);
    return { paint, regenCalls, oldRT };
  }

  const nativeRes = runCase(true);
  assert.equal(nativeRes.paint.rt.texture.minFilter, THREE.LinearFilter);
  assert.equal(nativeRes.paint.rt.texture.generateMipmaps, false);
  assert.equal(nativeRes.regenCalls, 0, 'native stage must not call _regenerateMipmaps');
  assert.equal(nativeRes.oldRT.disposed, true);

  const legacyRes = runCase(false);
  assert.equal(legacyRes.paint.rt.texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(legacyRes.regenCalls, 1, 'non-native stage must still call _regenerateMipmaps');
  assert.equal(legacyRes.oldRT.disposed, true);
});

// ============================================================================
// CPU-1: triangle-world.mjs, native-physics.mjs, native-drop.mjs,
//        native-combat-support.mjs, native-ranked-goals.mjs
// ============================================================================
test('CPU-1: TriangleWorld.sweepSphere runs inline BVH without queryBox closure and prunes far subtrees', async () => {
  const { TriangleWorld } = await getMods();
  const rows = ['o Fld_Floor', 'usemtl Wall', 'v -2 -1 -4', 'vn 0 1 0', 'v -2 -1 4', 'vn 0 1 0', 'v 45 -1 -4', 'vn 0 1 0', 'v 45 -1 4', 'vn 0 1 0', 'f 1//1 2//2 3//3', 'f 3//3 2//2 4//4', 'o Fld_Walls', 'usemtl Wall'];
  let v = 4;
  for (let i = 1; i <= 20; i++) {
    const x = i * 2;
    for (const pt of [[x, 0, -2], [x, 4, -2], [x, 0, 2], [x, 4, 2]]) rows.push('v ' + pt.join(' '), 'vn -1 0 0');
    const [a, b, c, d] = [1, 2, 3, 4].map(k => `${v + k}//${v + k}`);
    rows.push(`f ${a} ${b} ${c}`, `f ${c} ${b} ${d}`);
    v += 4;
  }
  const data = convertSource(
    { id: 'sweep-prune', bounds: { minX: -2, maxX: 45, minZ: -4, maxZ: 4 }, spawnPads: [[0, 0, 0], [42, 0, 0]], spawnBarrier: 0 },
    rows.join('\n'),
    'newmtl Wall\nKd 1 1 1\n',
    {}
  );
  const world = new TriangleWorld(data);

  let queryBoxCalls = 0;
  const origQueryBox = world.queryBox;
  world.queryBox = function (...args) { queryBoxCalls++; return origQueryBox.apply(this, args); };

  const hit = world.sweepSphere(new THREE.Vector3(0, 2, 0), new THREE.Vector3(44, 2, 0), 0.25);
  assert.ok(hit, 'sweep must hit the first wall at x=2');
  assert.equal(queryBoxCalls, 0, 'sweepSphere must use inline BVH loop without calling queryBox');
  assert.ok(Math.abs(hit.point.x - 2) < 1e-4, `expected hit at x=2, got ${hit.point.x}`);
  assert.ok(Math.abs(hit.time - (1.75 / 44)) < 1e-4);
  assert.equal(world._queryDepth, 0, 'BVH stack must be released after sweepSphere');
  assert.ok(world.triangleTests < world.triangleCount, `expected pruning (${world.triangleTests} < ${world.triangleCount})`);

  // Verify out reuse and miss leaving out untouched
  const out = { point: new THREE.Vector3(9, 9, 9), normal: new THREE.Vector3(0, 0, 1) };
  const miss = world.sweepSphere(new THREE.Vector3(0, 10, 0), new THREE.Vector3(44, 10, 0), 0.25, {}, out);
  assert.equal(miss, null);
  assert.equal(out.point.x, 9);

  world.queryBox = origQueryBox;
});

test('CPU-1: NativePhysics._sourceBodyFits and nativeDropClearance.clear reuse queryBox callbacks across calls', async () => {
  const { TriangleWorld, NativePhysics, nativeDropClearance } = await getMods();
  const rows = [
    'o Fld_Floor', 'usemtl Concrete00',
    'v 0 0 0', 'vn 0 1 0', 'v 0 0 8', 'vn 0 1 0', 'v 8 0 0', 'vn 0 1 0', 'v 8 0 8', 'vn 0 1 0',
    'f 1//1 2//2 3//3', 'f 3//3 2//2 4//4',
    'o Fld_Block', 'usemtl Concrete00',
    'v 4 0 3', 'vn -1 0 0', 'v 4 3 3', 'vn -1 0 0', 'v 4 0 5', 'vn -1 0 0', 'v 4 3 5', 'vn -1 0 0',
    'f 5//5 6//6 7//7', 'f 7//7 6//6 8//8',
  ];
  const data = convertSource(
    { id: 'cb-reuse', bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 }, spawnPads: [[1, 0, 1], [7, 0, 7]], spawnBarrier: 0 },
    rows.join('\n'),
    'newmtl Concrete00\nKd 1 1 1\n',
    {}
  );
  const world = new TriangleWorld(data);
  const level = { triangleWorld: world, blocks: [], staticBlockCount: 0, faces: [], data, queryDynamicBlocks() {} };
  const physics = new NativePhysics(level);

  const fitCallbacks = [];
  const origQueryBox = world.queryBox;
  world.queryBox = function (min, max, cb, stopOnFalse) {
    fitCallbacks.push(cb);
    return origQueryBox.call(this, min, max, cb, stopOnFalse);
  };

  assert.equal(physics._sourceBodyFits(new THREE.Vector3(1, 0.05, 4), 0.35, 0.1, 1.4, false, 0.01), true);
  assert.equal(physics._sourceBodyFits(new THREE.Vector3(4, 0.05, 4), 0.35, 0.1, 1.4, false, 0.01), false);
  assert.equal(fitCallbacks.length, 2);
  assert.strictEqual(fitCallbacks[0], fitCallbacks[1], '_sourceBodyFits must reuse the same callback across calls');

  const dropCallbacks = [];
  world.queryBox = function (min, max, cb, stopOnFalse) {
    dropCallbacks.push(cb);
    return origQueryBox.call(this, min, max, cb, stopOnFalse);
  };
  const clearance = nativeDropClearance(level);
  assert.equal(clearance.clear(new THREE.Vector3(1, 0.05, 1), new THREE.Vector3(2, 0.05, 1), 0.35, 0.1, 1.4), true);
  assert.equal(clearance.clear(new THREE.Vector3(3, 0.05, 4), new THREE.Vector3(5, 0.05, 4), 0.35, 0.1, 1.4), false);
  assert.equal(dropCallbacks.length, 2);
  assert.strictEqual(dropCallbacks[0], dropCallbacks[1], 'nativeDropClearance.clear must reuse the same callback across calls');

  world.queryBox = origQueryBox;
});

test('CPU-1: nativeCombatWet mode filter and nativeRankedBotGoalReachable finite/actor/abilityPoints checks', async () => {
  const { nativeCombatWet, nativeRankedBotGoalReachable } = await getMods();

  const level = { native: true, blocks: [{ solid: true }] };
  const physics = {
    level,
    groundProbe(_x, y, _z, _up, _down, _foot, hit) {
      hit.hit = true; hit.block = 0; hit.y = y;
    },
  };
  const G = { level, physics };
  const baseActor = { alive: true, grounded: true, climbing: false, form: 'kid', pos: new THREE.Vector3(0, 0, 0) };

  assert.equal(nativeCombatWet({ a: baseActor, mode: 'roam' }, G, 1, 0, 0), null, 'non-combat mode returns null');
  assert.equal(nativeCombatWet({ a: baseActor, mode: 'fight' }, G, 1, 0, 0), false, 'fight mode evaluates walk');
  assert.equal(nativeCombatWet({ a: baseActor, mode: 'retreat' }, G, 1, 0, 0), false, 'retreat mode evaluates walk');

  // nativeRankedBotGoalReachable boundary checks
  const nav = { nearest: () => -1, nodes: [] };
  const actor = {
    nid: '0:1', team: 0, slot: 1, alive: true, bot: true, weaponId: 'shooter',
    pos: new THREE.Vector3(),
    s3: { abilityPoints: Object.create({ inherited: 10 }) },
  };
  const RG = { level: { native: true }, nav, actors: [actor] };
  assert.equal(nativeRankedBotGoalReachable(RG, { id: '0:1', team: 0 }, [NaN, 0, 0]), false);
  assert.equal(nativeRankedBotGoalReachable(RG, { id: '0:1', team: 0 }, [0, Infinity, 0]), false);
  assert.equal(nativeRankedBotGoalReachable(RG, { id: '0:1', team: 0 }, [0, 0, -Infinity]), false);

  // Inherited property on abilityPoints must NOT trigger rejection
  let nearestCalled = 0;
  nav.nearest = () => { nearestCalled++; return -1; };
  assert.equal(nativeRankedBotGoalReachable(RG, { id: '0:1', team: 0 }, [1, 2, 3]), false);
  assert.equal(nearestCalled, 1, 'inherited abilityPoints property must be ignored');

  // Own positive abilityPoints property MUST reject before nav.nearest
  actor.s3.abilityPoints.swim = 3;
  nearestCalled = 0;
  assert.equal(nativeRankedBotGoalReachable(RG, { id: '0:1', team: 0 }, [1, 2, 3]), false);
  assert.equal(nearestCalled, 0, 'own positive abilityPoints must reject early');

  // Fallback team:slot actor matching when nid is undefined
  const fallbackActor = { team: 1, slot: 2, alive: true, bot: true, weaponId: 'shooter', pos: new THREE.Vector3(), s3: { abilityPoints: {} } };
  const RG2 = { level: { native: true }, nav, actors: [fallbackActor] };
  nearestCalled = 0;
  assert.equal(nativeRankedBotGoalReachable(RG2, { id: '1:2', team: 1 }, [1, 2, 3]), false);
  assert.equal(nearestCalled, 1, 'fallback team:slot actor lookup must match');
});

}
