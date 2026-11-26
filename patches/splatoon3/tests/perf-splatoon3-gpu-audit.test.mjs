import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { drawSplatanaWaves, installSplatanaWavePresentation, SPLATANA_WAVE } from '../runtime/splatana-wave-presentation.mjs';
import { createWailSpeakerBatch, updateWailSpeakerBatch, retireWailSpeakerBatch } from '../runtime/wail-speaker-batch.mjs';
import { drawS3Shapes, installS3ProjectileShapes } from '../runtime/s3-projectile-shapes.mjs';
import { createInkSheets } from '../runtime/s3-ink-sheets.mjs';
import { SpecialVfxKit } from '../runtime/special-vfx-kit.mjs';
import { installSpecialVfx, specialVfxDirector } from '../runtime/special-vfx.mjs';
import { buildScreenSheet } from '../runtime/special-models.mjs';
import { installPrivateTrackingRenderer } from '../runtime/private-tracking-render.mjs';
import { installHealthBarHud } from '../runtime/health-bars.mjs';

const readRuntime = (name) => fs.readFileSync(new URL(`../runtime/${name}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// GPU-11: splatana-wave-presentation.mjs
// ---------------------------------------------------------------------------
test('GPU-11: splatana waves use partial range uploads, tracked colors, idle fast-path, clear reset, and idempotent dispose', () => {
  const scene = new THREE.Scene();
  const G = { time: 1, fx: { drop() {} } };
  const makeSlash = (shape = 'slash-h') => ({
    s3Shape: shape, delay: 0, seed: 0.42, age: 0.017,
    pos: new THREE.Vector3(0, 1, 3.3), start: new THREE.Vector3(0, 1, 0.5),
    vel: new THREE.Vector3(0, 0, 198),
    owner: { color: new THREE.Color(1, 0.5, 0), isLocal: true },
    catalog: null, wid: 's3-saber-lite',
  });

  const pH = makeSlash('slash-h');
  const pV = makeSlash('slash-v');
  const system = { list: [pH, pV], scene };

  // Frame 1: active horizontal + vertical waves
  const n1 = drawSplatanaWaves(system, THREE, G);
  assert.equal(n1, SPLATANA_WAVE.smearCopies * 2);
  const W = system._splatanaWaves;
  assert.ok(W.hadActive);
  assert.equal(W.seen.size, 0, 'seen set is cleared after draw');
  const seenRef = W.seen;
  const negXRef = W.negX;
  assert.equal(W.meshH.instanceMatrix.updateRanges.length, 1);
  assert.deepEqual(W.meshH.instanceMatrix.updateRanges[0], { start: 0, count: SPLATANA_WAVE.smearCopies * 16 });
  assert.equal(W.meshV.instanceMatrix.updateRanges.length, 1);
  assert.deepEqual(W.meshV.instanceMatrix.updateRanges[0], { start: 0, count: SPLATANA_WAVE.smearCopies * 16 });
  const rangeHRef = W.meshH.instanceMatrix.updateRanges[0];

  // Clear needsUpdate / updateRanges as Three.js would after upload
  W.meshH.instanceColor.updateRanges.length = 0;
  W.meshH.instanceColor.needsUpdate = false;
  W.meshH.instanceMatrix.updateRanges.length = 0;
  W.meshH.instanceMatrix.needsUpdate = false;

  // Frame 2: same color -> instanceColor should NOT be re-uploaded, range object reused
  G.time += 1 / 60;
  pH.pos.z += 3.3; pH.age += 1 / 60;
  pV.pos.z += 3.3; pV.age += 1 / 60;
  drawSplatanaWaves(system, THREE, G);
  assert.equal(W.seen, seenRef, 'reuses seen Set');
  assert.equal(W.negX, negXRef, 'reuses negX Vector3');
  assert.equal(W.meshH.instanceMatrix.updateRanges[0], rangeHRef, 'reuses dirty range object');
  assert.equal(W.meshH.instanceColor.updateRanges.length, 0, 'static color skips re-upload');

  // Retire and let dissolve finish
  system.list = [];
  for (let i = 0; i < 25; i++) { G.time += 1 / 60; drawSplatanaWaves(system, THREE, G); }
  assert.equal(W.dissolving.length, 0);
  assert.equal(W.hadActive, false);
  assert.equal(W.meshH.visible, false);
  assert.equal(W.meshV.visible, false);

  // Subsequent idle frame returns immediately without touching GPU flags
  const verBefore = W.meshH.instanceMatrix.version;
  W.meshH.instanceMatrix.updateRanges.length = 0;
  G.time += 1 / 60;
  assert.equal(drawSplatanaWaves(system, THREE, G), 0);
  assert.equal(W.meshH.instanceMatrix.version, verBefore);
  assert.equal(W.meshH.instanceMatrix.updateRanges.length, 0);

  // Install wrapper checks: _draw fast-path, clear resets hadActive without disposing, dispose cleans up idempotently
  const drawCalls = [];
  class FakeProjectiles {
    constructor() { this.list = []; this.scene = new THREE.Scene(); }
    _draw(...args) { drawCalls.push(args); return args.length; }
    clear() { this.list.length = 0; }
    dispose() {}
    disposeVisuals() {}
  }
  installSplatanaWavePresentation({ Projectiles: FakeProjectiles, THREE, G });
  const ps = new FakeProjectiles();
  assert.equal(ps._draw(), 0);
  assert.equal(ps._draw(1), 1);
  assert.equal(ps._draw(1, 2), 2);
  assert.equal(ps._draw(1, 2, 3), 3);
  assert.equal(ps._draw(1, 2, 3, 4), 4);
  assert.deepEqual(drawCalls, [[], [1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]);

  ps.list.push(makeSlash('slash-h'));
  ps._draw();
  const state = ps._splatanaWaves;
  assert.ok(state.hadActive);

  let meshDisposes = 0, geoDisposes = 0, matDisposes = 0;
  for (const m of [state.meshH, state.meshV]) {
    const d = m.dispose.bind(m); m.dispose = () => { meshDisposes++; d(); };
    const gd = m.geometry.dispose.bind(m.geometry); m.geometry.dispose = () => { geoDisposes++; gd(); };
  }
  const md = state.mat.dispose.bind(state.mat); state.mat.dispose = () => { matDisposes++; md(); };

  ps.clear();
  assert.equal(state.hadActive, false, 'clear resets hadActive');
  assert.equal(state.meshH.visible, false);
  assert.equal(meshDisposes, 0, 'clear preserves meshes for reuse');

  ps.dispose();
  assert.equal(ps._splatanaWaves, null);
  assert.equal(meshDisposes, 2);
  assert.equal(geoDisposes, 2);
  assert.equal(matDisposes, 1);
  assert.equal(ps.scene.children.length, 0);
  // Idempotent second dispose
  state.dispose();
  assert.equal(meshDisposes, 2);
});

// ---------------------------------------------------------------------------
// GPU-12: wail-speaker-batch.mjs
// ---------------------------------------------------------------------------
test('GPU-12: wail-speaker-batch has no ES imports, uploads partial matrix range, skips needsUpdate on n===0, and validates color/emissive on sameMaterial', () => {
  const src = readRuntime('wail-speaker-batch.mjs');
  assert.equal(/^\s*import\s/m.test(src), false, 'wail-speaker-batch.mjs must not have ES import statements');

  // Evaluate via new Function (same contract as queue-special-presentation-20261026.test.mjs)
  const mod = new Function(src.replace(/^export /gm, '') + ';return {createWailSpeakerBatch,updateWailSpeakerBatch,retireWailSpeakerBatch};')();

  const scene = new THREE.Scene();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3366ff });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const devices = Array.from({ length: 6 }, (_, i) => {
    const holder = new THREE.Group(), root = new THREE.Group();
    holder.add(root); scene.add(holder);
    holder.position.set(i, 1, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.s3Finish = 'body';
    root.add(mesh);
    return { holder, model: { root } };
  });

  const batch = mod.createWailSpeakerBatch(THREE, scene, devices);
  const part = batch.parts[0];
  const inst = part.mesh;

  // Partial upload when 2 of 6 speakers are visible
  for (let i = 2; i < 6; i++) devices[i].holder.visible = false;
  inst.instanceMatrix.updateRanges.length = 0;
  inst.instanceMatrix.needsUpdate = false;
  mod.updateWailSpeakerBatch(batch);
  assert.equal(inst.count, 2);
  assert.equal(inst.visible, true);
  assert.equal(inst.instanceMatrix.updateRanges.length, 1);
  assert.equal(inst.instanceMatrix.updateRanges[0], part.matrixRange, 'reuses part.matrixRange');
  assert.deepEqual(inst.instanceMatrix.updateRanges[0], { start: 0, count: 32 });

  // When n === 0, needsUpdate MUST NOT be set to true
  for (let i = 0; i < 6; i++) devices[i].holder.visible = false;
  let needsUpdateSet = 0;
  Object.defineProperty(inst.instanceMatrix, 'needsUpdate', {
    configurable: true,
    set(v) { if (v) needsUpdateSet++; },
    get() { return false; },
  });
  mod.updateWailSpeakerBatch(batch);
  assert.equal(inst.count, 0);
  assert.equal(inst.visible, false);
  assert.equal(needsUpdateSet, 0, 'n===0 must not set instanceMatrix.needsUpdate = true');

  // sameMaterial identity short-circuit must still reject materials missing color or emissive
  const basicMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // no .emissive
  const scene2 = new THREE.Scene();
  const basicDevices = Array.from({ length: 2 }, () => {
    const holder = new THREE.Group(), root = new THREE.Group();
    holder.add(root); scene2.add(holder);
    const m = new THREE.Mesh(geo, basicMat);
    m.userData.s3Finish = 'basic';
    root.add(m);
    return { holder, model: { root } };
  });
  const batch2 = createWailSpeakerBatch(THREE, scene2, basicDevices);
  updateWailSpeakerBatch(batch2);
  assert.equal(batch2.parts[0].mesh.count, 0, 'material without emissive must not batch even when a === b');
  assert.equal(basicDevices[0].model.root.children.length, 1, 'incompatible mesh returned to original parent');

  // Cleanup
  retireWailSpeakerBatch(batch, () => {});
  retireWailSpeakerBatch(batch2, () => {});
});

// ---------------------------------------------------------------------------
// GPU-13: s3-projectile-shapes.mjs & s3-ink-sheets.mjs
// ---------------------------------------------------------------------------
test('GPU-13: s3-projectile-shapes and s3-ink-sheets dispose InstancedMeshes, use partial zero-alloc ranges, tracked peel color, and optional out param', () => {
  // Verify s3-ink-sheets.mjs keeps its new Function compatibility (no added imports)
  const sheetSrc = readRuntime('s3-ink-sheets.mjs');
  const importLines = sheetSrc.match(/^\s*import\s.+$/gm) || [];
  assert.equal(importLines.length, 2, 's3-ink-sheets.mjs must not add new ES import statements');

  // s3-ink-sheets zero-alloc range reuse + InstancedMesh.dispose()
  const sheetScene = new THREE.Scene();
  const sheets = createInkSheets(THREE, sheetScene, { nearDither: '', rim: '' });
  sheets.add('slash-h', new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Color(1, 0, 0), 0.25, 1.0);
  sheets.drill(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Color(0, 1, 0), 0.5, 1.0, 1.0);
  sheets.draw(1.01, null);
  const sheetRange1 = sheets.mesh.instanceMatrix.updateRanges[0];
  const drillRange1 = sheets.drillMesh.instanceMatrix.updateRanges[0];
  assert.ok(sheetRange1 && sheetRange1.count > 0);
  assert.ok(drillRange1 && drillRange1.count === 16);

  sheets.mesh.instanceMatrix.updateRanges.length = 0;
  sheets.drill(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Color(0, 1, 0), 0.5, 1.02, 1.0);
  sheets.draw(1.02, null);
  assert.equal(sheets.mesh.instanceMatrix.updateRanges[0], sheetRange1, 'reuses sheet matrix range object');
  assert.equal(sheets.drillMesh.instanceMatrix.updateRanges[0], drillRange1, 'reuses drill matrix range object');

  let sheetMeshDisposes = 0;
  for (const m of [sheets.mesh, sheets.drillMesh]) {
    const d = m.dispose.bind(m); m.dispose = () => { sheetMeshDisposes++; d(); };
  }
  sheets.dispose();
  assert.equal(sheetMeshDisposes, 2, 's3-ink-sheets dispose() calls InstancedMesh.dispose()');

  // s3-projectile-shapes: drawS3Shapes out parameter (early return + active + empty)
  const scene = new THREE.Scene();
  const system = { list: [], scene };
  const G = { time: 1 };
  const out = {};
  const rEarly = drawS3Shapes(system, THREE, G, out);
  assert.equal(rEarly, out);
  assert.deepEqual(rEarly, { body: 0, slashH: 0, slashV: 0, shell: 0, core: 0, sparkles: 0, sheets: 0, drills: 0 });
  const rFresh1 = drawS3Shapes(system, THREE, G);
  const rFresh2 = drawS3Shapes(system, THREE, G);
  assert.notEqual(rFresh1, rFresh2, 'omitting out returns independent objects');

  // Active slash-h: nb === 0 must not call addUpdateRange(0, 0) on bodyData, peel uses setTrackedInstanceColor
  const slash = {
    s3Shape: 'slash-h', delay: 0, seed: 0.3, age: 0.02, life: 0.2,
    pos: new THREE.Vector3(0, 1, 2), start: new THREE.Vector3(0, 1, 0),
    vel: new THREE.Vector3(0, 0, 20),
    owner: { color: new THREE.Color(0.2, 0.8, 0.4) },
  };
  system.list = [slash];
  const rActive = drawS3Shapes(system, THREE, G, out);
  assert.equal(rActive, out);
  assert.equal(rActive.slashH, 2);
  const R = system._s3Shapes;
  assert.equal(R.bodyData.updateRanges.length, 0, 'nb===0 skips bodyData update range');
  assert.equal(R.slashH.instanceMatrix.updateRanges.length, 1);
  assert.deepEqual(R.slashH.instanceMatrix.updateRanges[0], { start: 0, count: 32 });

  // Second frame with identical color: peel + primary both tracked, so instanceColor should not re-upload
  R.slashH.instanceColor.updateRanges.length = 0;
  R.slashH.instanceColor.needsUpdate = false;
  G.time += 1 / 60; slash.age += 1 / 60;
  drawS3Shapes(system, THREE, G, out);
  assert.equal(R.slashH.instanceColor.updateRanges.length, 0, 'peel uses setTrackedInstanceColor so static color skips upload');

  // Empty return with out
  system.list = [];
  R.sheets.clear();
  const rEmpty = drawS3Shapes(system, THREE, G, out);
  assert.equal(rEmpty, out);
  assert.equal(rEmpty.slashH, 0);

  // Dispose calls o.dispose?.() on all InstancedMeshes
  let shapeInstDisposes = 0;
  for (const m of [R.body, R.slashH, R.slashV, R.shell, R.core]) {
    const d = m.dispose.bind(m); m.dispose = () => { shapeInstDisposes++; d(); };
  }
  R.dispose();
  assert.equal(shapeInstDisposes, 5, 's3-projectile-shapes dispose() disposes all 5 InstancedMeshes');

  // P._draw keeps independent s3ShapeCounts objects per frame
  class FakeProj {
    constructor() { this.list = []; this.scene = new THREE.Scene(); }
    _draw(a, b, c) { return [a, b, c].filter(x => x !== undefined).length; }
    clear() { this.list.length = 0; }
  }
  installS3ProjectileShapes({ Projectiles: FakeProj, THREE, G });
  const fp = new FakeProj();
  assert.equal(fp._draw(), 0);
  const c1 = fp.s3ShapeCounts;
  assert.equal(fp._draw(1, 2), 2);
  const c2 = fp.s3ShapeCounts;
  assert.notEqual(c1, c2, 'P._draw preserves independent s3ShapeCounts per frame');
});

// ---------------------------------------------------------------------------
// GPU-14: special-vfx-kit, special-vfx, special-models, private-tracking-render, health-bars
// ---------------------------------------------------------------------------
test('GPU-14a: SpecialVfxKit uses markAttributeRange, limits empty RibbonPool to 4*itemSize, and reuses ShapePool free list', () => {
  const root = new THREE.Scene();
  const kit = new SpecialVfxKit(THREE, root, 1);

  // Empty RibbonPool update should cap range at 4 * itemSize
  kit.ribbons.update(0.1, new THREE.Vector3(0, 2, 0));
  assert.deepEqual(kit.ribbons.pos.updateRanges[0], { start: 0, count: 4 * kit.ribbons.pos.itemSize });
  assert.deepEqual(kit.ribbons.col.updateRanges[0], { start: 0, count: 4 * kit.ribbons.col.itemSize });
  assert.deepEqual(kit.ribbons.side.updateRanges[0], { start: 0, count: 4 * kit.ribbons.side.itemSize });
  assert.deepEqual(kit.ribbons.face.updateRanges[0], { start: 0, count: 4 * kit.ribbons.face.itemSize });
  const posRangeRef = kit.ribbons.pos.updateRanges[0];

  // Active RibbonPool update reuses the same range object and uploads slot * M * 2 * itemSize
  const rib = kit.ribbons.start({ width: 0.4, life: 1, color: [1, 0, 0] });
  kit.ribbons.push(rib, 0, 1, 0, 0.1);
  kit.ribbons.push(rib, 1, 1, 0, 0.2);
  kit.ribbons.pos.updateRanges.length = 0;
  kit.ribbons.update(0.2, new THREE.Vector3(0, 2, 5));
  assert.equal(kit.ribbons.pos.updateRanges[0], posRangeRef, 'RibbonPool reuses dirty range');
  assert.deepEqual(kit.ribbons.pos.updateRanges[0], { start: 0, count: 1 * kit.ribbons.M * 2 * kit.ribbons.pos.itemSize });

  // SpritePool update reuses dirty range via markAttributeRange
  kit.sparks.spawn(0, 1, 0, 1, 1, 0, 1, 0.2, 0.1, [1, 1, 1], 1);
  kit.sparks.update(0.016);
  const sparkPosRange = kit.sparks.aPos.updateRanges[0];
  assert.deepEqual(sparkPosRange, { start: 0, count: 2 * 4 });
  kit.sparks.aPos.updateRanges.length = 0;
  kit.sparks.update(0.016);
  assert.equal(kit.sparks.aPos.updateRanges[0], sparkPosRange, 'SpritePool reuses dirty range');

  // ShapePool free list reuses retired Float32Array(16) buffers while keeping fresh public handles
  const pool = kit.beams;
  assert.ok(Array.isArray(pool.free));
  const r1 = pool.addRaw(0.05, 1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16);
  r1._vacAngle = 1.25;
  r1._vacTime = 0.02;
  const v1 = r1.v;
  pool.update(0.1); // expires r1 -> retires v1 into pool.free
  assert.equal(pool.recs.length, 0);
  assert.equal(pool.free.length, 1);
  assert.equal(pool.free[0], v1);
  assert.equal(r1.v, null);
  const r2 = pool.add(0.5, new Float32Array(16));
  assert.notEqual(r2, r1, 'ShapePool allocates a fresh public handle');
  assert.equal(r2.v, v1, 'ShapePool reuses Float32Array(16)');
  assert.equal(r2._vacAngle, undefined, 'custom properties on retired handle do not leak');
  assert.equal(r2._vacTime, undefined, 'custom properties on retired handle do not leak');
  r1.dead = true; // simulating stale endTrack() marking an already-retired handle dead
  assert.equal(r2.dead, false, 'mutating retired handle does not kill active handle');
  assert.equal(r2.t, 0);

  kit.dispose();
});

test('GPU-14b: special-vfx Director.call and FX.prototype.update forward 0..4+ args without ...args', () => {
  const seen = [];
  class FakeFX {
    constructor() { this.root = new THREE.Group(); }
    setCollider() {}
    update(...args) { seen.push(['fx', ...args]); return args.length; }
    clear() {}
    dispose() {}
  }
  const G = { fx: null, actors: [], projectiles: { list: [] } };
  installSpecialVfx({ FX: FakeFX, THREE, G, on() {} });
  const fx = new FakeFX();
  G.fx = fx;
  fx.setCollider();
  const dir = specialVfxDirector(fx);
  assert.ok(dir);

  const calls = [];
  const fn = function (...args) { calls.push(args); };
  dir.call(fn);
  dir.call(fn, 'a');
  dir.call(fn, 'a', 'b');
  dir.call(fn, 'a', 'b', 'c');
  dir.call(fn, 'a', 'b', 'c', 'd');
  assert.deepEqual(calls, [[], ['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]);

  assert.equal(fx.update(0.016, null), 2);
  assert.equal(fx.update(0.016, null, 'extra'), 3);
  assert.deepEqual(seen[0], ['fx', 0.016, null]);
  assert.deepEqual(seen[1], ['fx', 0.016, null, 'extra']);
  fx.dispose();
});

test('GPU-14c: buildScreenSheet shares a single ShapeGeometry between edge and sheet meshes', () => {
  const group = buildScreenSheet(THREE, 0xff2266, 4, 2.5);
  const meshes = group.children.filter((c) => c.isMesh);
  assert.equal(meshes.length, 2);
  assert.equal(meshes[0].geometry, meshes[1].geometry, 'edge and sheet share the exact same ShapeGeometry');
});

test('GPU-14d: private-tracking-render uses traverseVisible when available and falls back to traverse for mocks', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const renderArgs = [];
  const renderer = {
    autoClear: true,
    render(...args) { renderArgs.push(args); return args.length; },
    dispose() {},
  };

  // Case 1: Real Object3D with traverseVisible -> traverseVisible called, traverse NOT called
  const root1 = new THREE.Group();
  const hiddenGroup = new THREE.Group(); hiddenGroup.visible = false;
  const hiddenMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const visibleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  hiddenGroup.add(hiddenMesh);
  root1.add(hiddenGroup, visibleMesh);
  let traverseCalls = 0, traverseVisibleCalls = 0;
  const origTV = root1.traverseVisible.bind(root1);
  root1.traverse = () => { traverseCalls++; };
  root1.traverseVisible = (cb) => { traverseVisibleCalls++; origTV(cb); };

  // Case 2: Mock root without traverseVisible -> falls back to traverse + parent visibility check
  const mockHiddenChild = { isMesh: true, visible: true, parent: null, geometry: visibleMesh.geometry, matrixWorld: new THREE.Matrix4(), clone: () => visibleMesh.clone(false) };
  const mockHiddenParent = { isMesh: false, visible: false, parent: null };
  mockHiddenChild.parent = mockHiddenParent;
  const mockVisibleChild = { isMesh: true, visible: true, parent: null, geometry: visibleMesh.geometry, matrixWorld: new THREE.Matrix4(), clone: () => visibleMesh.clone(false) };
  const root2 = {
    visible: true,
    traverse(cb) { cb(root2); cb(mockHiddenParent); cb(mockHiddenChild); cb(mockVisibleChild); },
  };
  mockHiddenParent.parent = root2;
  mockVisibleChild.parent = root2;

  const viewer = { alive: true, remote: false, pos: new THREE.Vector3() };
  const a1 = { alive: true, pos: new THREE.Vector3(5, 0, 0), color: 0xff0000, character: { root: root1 } };
  const a2 = { alive: true, pos: new THREE.Vector3(6, 0, 0), color: 0x00ff00, character: { root: root2 } };
  const G = {
    renderer, scene, camera, time: 1, teamColors: [0xff0000, 0x00ff00],
    match: { state: 'playing', attract: false, local: viewer, actors: [viewer, a1, a2] },
    physics: { los: () => false },
  };

  installPrivateTrackingRenderer({ G, THREE }, (actor, v) => (actor === v ? 0 : 0.5));
  assert.equal(renderer.render(scene, camera), 2);
  assert.equal(traverseVisibleCalls, 1, 'uses traverseVisible when available');
  assert.equal(traverseCalls, 0, 'does not call traverse when traverseVisible exists');

  // Verify second pass drew exactly 2 proxies (1 from root1, 1 from root2; both hidden meshes skipped)
  assert.equal(renderArgs.length, 2);
  const overlayScene = renderArgs[1][0];
  assert.equal(overlayScene.children.length, 2, 'skips hidden subtrees in both traverseVisible and fallback paths');

  // Verify 3+ args forwarding
  assert.equal(renderer.render(new THREE.Scene(), camera, 'extra'), 3);
  renderer.dispose();
});

test('GPU-14e: health-bars skips G.physics.los raycasts for full-HP, expired, and submerged enemies and reuses seen Set', () => {
  const makeEl = () => ({
    style: {}, children: [], clientWidth: 800, clientHeight: 600,
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
  });
  const doc = { createElement: () => makeEl() };
  class FakeHUD {
    constructor() { this.el = makeEl(); this._visible = true; this._t = 10; }
    update() {}
    dispose() {}
  }

  let losCalls = 0;
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const makeActor = (opts) => ({
    team: 1, alive: true, hp: 100, netLife: 0, submerged: false, anim: { form: 'kid' },
    character: { root: { visible: true }, getHeadPosition: (out) => out.set(0, 1, 0) },
    ...opts,
  });

  const viewer = makeActor({ team: 0, hp: 100 });
  const fullEnemy = makeActor({ hp: 100 });
  const expiredEnemy = makeActor({ hp: 50, lastDamage: 10 });
  const submergedEnemy = makeActor({ hp: 50, lastDamage: 0.2, submerged: true });
  const swimEnemy = makeActor({ hp: 50, lastDamage: 0.2, anim: { form: 'swim' } });
  const visibleDamagedEnemy = makeActor({ hp: 50, lastDamage: 0.2 });

  const G = {
    mode: 'match', time: 10, camera, teamHex: ['#ff0000', '#0000ff'],
    physics: { los: () => { losCalls++; return true; } },
    match: {
      state: 'playing', attract: false, paused: false, local: viewer,
      actors: [viewer, fullEnemy, expiredEnemy, submergedEnemy, swimEnemy, visibleDamagedEnemy],
    },
  };

  installHealthBarHud({ HUD: FakeHUD, G, THREE, PLAYER: { hp: 100 } }, { document: doc, innerWidth: 800, innerHeight: 600 });
  const hud = new FakeHUD();
  hud.update(1 / 60, {});

  assert.equal(losCalls, 1, 'only the single damaged, active, surfaced enemy should invoke G.physics.los');
  const seenRef = hud._s3HealthSeen;
  assert.ok(seenRef instanceof Set);
  assert.equal(seenRef.size, 0, 'seen Set is cleared after update');

  // Second frame reuses the same seen Set
  G.time += 1 / 60;
  hud.update(1 / 60, {});
  assert.equal(hud._s3HealthSeen, seenRef, 'reuses _s3HealthSeen Set');
  assert.equal(losCalls, 2);

  // Non-finite projection hides bar cleanly
  visibleDamagedEnemy.character.getHeadPosition = (out) => out.set(NaN, 1, 0);
  G.time += 1 / 60;
  hud.update(1 / 60, {});
  assert.equal(hud._s3HealthBars.get(visibleDamagedEnemy).node.style.display, 'none');

  hud.dispose();
});
