// Audit fixture: production is not patched. Run from the repository root with Node >= 22.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import { rng, damp, lerp } from '../inkwave-public/src/core/ctx.js';

const base = '2f12f1715ac4a36e5744bb9d7fe537996c885a2e';
const paths = ['src/game/showcase.js', 'src/game/lobbySet.js', 'src/world/decor.js',
  'src/world/environment.js', 'src/main.js', 'src/world/props.js',
  'vendor/three/build/three.module.js', 'vendor/three/build/three.core.js',
  'vendor/three/jsm/utils/BufferGeometryUtils.js', 'src/core/ctx.js'];
const sources = Object.fromEntries(paths.map(p => [p, fs.readFileSync('inkwave-public/' + p, 'utf8')]));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function between(s, start, end) {
  const a = s.indexOf(start), b = s.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'source boundary missing: ' + start);
  return s.slice(a, b);
}
function method(s, start, end) {
  const name = start.trim().split('(')[0];
  return vm.runInNewContext('({' + between(s, start, end) + '})[' + JSON.stringify(name) + ']');
}
const engine = sources['vendor/three/build/three.module.js'];
const engineContext = { ...THREE, Float32Array, Uint32Array, Uint16Array, Int32Array, Int16Array, Int8Array, Uint8Array, Uint8ClampedArray };
const WebGLAttributes = vm.runInNewContext('(' + between(engine, 'function WebGLAttributes(', '\nvar alphahash_fragment') + ')', engineContext);
const WebGLGeometries = vm.runInNewContext('(' + between(engine, 'function WebGLGeometries(', '\nfunction WebGLIndexedBufferRenderer') + ')', engineContext);
const WebGLObjects = vm.runInNewContext('(' + between(engine, 'function WebGLObjects(', '\nconst toneMappingMap') + ')', engineContext);

// Real bundled Three.js resource managers, with a byte-retaining simulated GL transport.
function driver() {
  let bound, next = 0;
  const buffers = new Map();
  const stats = { created: 0, deleted: 0, subCalls: 0, subBytes: 0, objectReleases: 0 };
  const gl = {
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, FLOAT: 5126, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    createBuffer() { stats.created++; return ++next; }, bindBuffer(t, b) { bound = b; },
    bufferData(t, a) { buffers.set(bound, Buffer.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))); },
    bufferSubData(t, offset, a, start = 0, count = a.length) {
      const bytes = Buffer.from(a.buffer, a.byteOffset + start * a.BYTES_PER_ELEMENT, count * a.BYTES_PER_ELEMENT);
      bytes.copy(buffers.get(bound), offset); stats.subCalls++; stats.subBytes += bytes.length;
    },
    deleteBuffer(b) { assert(buffers.delete(b), 'unknown/double buffer delete'); stats.deleted++; },
  };
  const attrs = WebGLAttributes(gl);
  const bindings = { releaseStatesOfGeometry() {}, releaseStatesOfObject() { stats.objectReleases++; } };
  const info = { render: { frame: 0 }, memory: { geometries: 0 } };
  const geos = WebGLGeometries(gl, attrs, info, bindings);
  const objects = WebGLObjects(gl, geos, attrs, bindings, info);
  return { stats, attrs, buffers, info, objects,
    draw(meshes) { info.render.frame++; for (const m of meshes) objects.update(m); },
    uploaded(a) { return buffers.get(attrs.get(a).buffer); },
  };
}
function mesh(n = 4, color = true) {
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), n);
  if (color) m.setColorAt(0, new THREE.Color('white'));
  return m;
}
const showcase = sources['src/game/showcase.js'];
const releaseLobby = method(showcase, '  _lobRelease() {', '\n  _enterSetMode(');
const releaseSet = method(sources['src/game/lobbySet.js'], '  dispose() {', '\n}\n\n// ------------------------------------------------------------------------------------------------ data');
const releaseDecor = method(sources['src/world/decor.js'], '  dispose() {', '\n}\n');
function lifetime(kind, proposed) {
  const d = driver(); let sharedDisposes = 0;
  for (let cycle = 0; cycle < 20; cycle++) {
    const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    let owned;
    if (kind === 'decor') {
      owned = [mesh()]; root.add(...owned); d.draw(owned);
      if (proposed) for (const m of owned) m.dispose();
      releaseDecor.call({ group: root, scene, pads: [], flags: [], barriers: [] });
    } else if (kind === 'lobby-set') {
      // glow/bulb/drip topology; fixture sizes deliberately small, not a memory-size estimate.
      owned = [mesh(64), mesh(12), mesh(6, false)]; root.add(...owned); d.draw(owned);
      if (proposed) for (const m of owned) m.dispose();
      releaseSet.call({ root, tex: {} });
    } else {
      const fx = [0, 1].map(() => ({ mesh: mesh(150, false), splats: mesh(56, false), rings: mesh(10, false) }));
      const sparks = { mesh: mesh(36) }, trail = { mesh: mesh(520) }, contact = mesh(10);
      contact.geometry.addEventListener('dispose', () => sharedDisposes++);
      contact.material.addEventListener('dispose', () => sharedDisposes++);
      trail.dispose = () => { trail.mesh.geometry.dispose(); trail.mesh.material.dispose(); trail.mesh.removeFromParent(); };
      owned = [...fx.flatMap(f => [f.mesh, f.splats, f.rings]), sparks.mesh, trail.mesh, contact];
      root.add(...owned); d.draw(owned);
      if (proposed) for (const m of owned) m.dispose();
      releaseLobby.call({ lob: { members: new Map(), scene, fx, sparks, trail, ink: fx.map(f => f.mesh.material), contact } });
      assert.equal(sharedDisposes, 0, 'shared contact geometry/material must survive');
      // Shared geometry has an independent owner. End that fixture owner after lobby release.
      contact.geometry.dispose(); contact.material.dispose(); sharedDisposes = 0;
    }
    assert(owned.every(m => !m.parent || !m.parent.parent));
  }
  return { cycles: 20, ...d.stats, retainedMockBuffers: d.buffers.size, sharedContactPrematureDisposes: sharedDisposes };
}
const lifetimes = {};
for (const kind of ['decor', 'lobby-set', 'lobby-fx']) {
  const before = lifetime(kind, false), proposal = lifetime(kind, true);
  assert.equal(before.objectReleases, 0); assert(proposal.objectReleases > 0);
  assert(before.retainedMockBuffers > 0); assert.equal(proposal.retainedMockBuffers, 0);
  lifetimes[kind] = { before, proposal };
}

// Dock rebuild: actual removal method; only the subsequent new dock/foam builders are stubbed.
const env = sources['src/world/environment.js'];
const rebuild = method(env, '  _rebuildDock() {', '\n  // Replace the deck');
function dockRelease(proposed) {
  let geo = 0, material = 0, instance = 0, rebuilds = 0, foams = 0;
  for (let cycle = 0; cycle < 20; cycle++) {
    const root = new THREE.Group(), pilings = mesh(), dockProps = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const boatMat = new THREE.MeshStandardMaterial();
    const moored = [0, 1].map(() => ({ mesh: new THREE.Mesh(new THREE.BoxGeometry(), boatMat) }));
    const owned = [pilings, dockProps, ...moored.map(m => m.mesh)]; root.add(...owned);
    for (const m of owned) m.geometry.addEventListener('dispose', () => geo++);
    const mats = new Set(owned.map(m => m.material));
    for (const m of mats) m.addEventListener('dispose', () => material++);
    pilings.addEventListener('dispose', () => instance++);
    if (proposed) { for (const m of mats) m.dispose(); pilings.dispose(); }
    rebuild.call({ root, pilings, dockProps, moored, _marina: false, buoys: [],
      _buildDock() { rebuilds++; this._foamShapes = []; }, _buildFoamField() { foams++; } });
    assert.equal(root.children.length, 0);
  }
  return { cycles: 20, geometryDisposes: geo, uniqueMaterialDisposes: material, instanceDisposes: instance, rebuilds, foams };
}
const dock = { before: dockRelease(false), proposal: dockRelease(true) };
assert.equal(dock.before.uniqueMaterialDisposes, 0); assert.equal(dock.proposal.uniqueMaterialDisposes, 60);
assert.equal(dock.before.geometryDisposes, dock.proposal.geometryDisposes);

// Full production FX classes (including constructors/geometry); candidate changes only empty upload flags.
const utilsUrl = pathToFileURL(process.cwd() + '/inkwave-public/vendor/three/build/three.module.js').href;
const utils = sources['vendor/three/jsm/utils/BufferGeometryUtils.js'].replace("from 'three'", 'from ' + JSON.stringify(utilsUrl));
const { mergeGeometries } = await import('data:text/javascript;base64,' + Buffer.from(utils).toString('base64'));
let prefix = showcase.slice(0, showcase.indexOf('// Swim paths')).replace(/^import .*;\n/gm, '');
function uploadMatrix(m) {
  if (m.count === 0) return;
  m.instanceMatrix.needsUpdate = true;
}
function bundle(proposed) {
  let code = prefix;
  if (proposed) code = code.replace(/((?:this|m)(?:\.[A-Za-z]+)*)\.instanceMatrix\.needsUpdate = true/g, 'uploadMatrix($1)');
  const classes = vm.runInNewContext(code + '\n({InkFX, Sparkles, InkTrail, Confetti})', {
    THREE, mergeGeometries, rng, damp, lerp, uploadMatrix, G: {}, WEAPONS: {}, Float32Array, Uint8Array,
  });
  const scene = new THREE.Scene(), random = rng(913);
  const inks = [0, 1].map(() => new classes.InkFX(scene, new THREE.MeshBasicMaterial(), random));
  const spark = new classes.Sparkles(scene, new THREE.MeshBasicMaterial(), random), trail = new classes.InkTrail(scene);
  const confetti = new classes.Confetti(scene, random); confetti.setColor(new THREE.Color('#ee8800'));
  const meshes = [...inks.flatMap(f => [f.mesh, f.splats, f.rings]), spark.mesh, trail.mesh, confetti.paper, confetti.foil];
  return { inks, spark, trail, confetti, meshes, d: driver() };
}
const before = bundle(false), proposal = bundle(true);
const color = new THREE.Color('#3b6aff'), decks = [{ x: 0, z: 0, y: 0, r: 10 }];
const phases = [], countsSeen = new Set(); let comparedFrames = 0;
function runFrames(n, scenario) {
  const oldB = before.d.stats.subBytes, newB = proposal.d.stats.subBytes;
  const oldC = before.d.stats.subCalls, newC = proposal.d.stats.subCalls;
  for (let f = 0; f < n; f++) {
    for (const b of [before, proposal]) {
      if (scenario === 'mixed' && f < 150) {
        if (f % 7 === 0) for (const ink of b.inks) { ink.crown(0, 0, 0, 1, 8); ink.bubble(1, .3, 0, .1, 1, .5); ink.drop(0, 2, 0, 0, 0, 0, .1, 2, 2); }
        b.trail.add(f * .001, 0, 0, f * .01, .1, .3, color, .4);
        if (f % 3 === 0) b.spark.spawn(0, 1, 0, .1, color, .23);
        if (f % 11 === 0) b.confetti.burst(0, 1, 0, 0, 1, 0, 6, 2, 1);
      }
      if (scenario === 'wrap') {
        // Ring slots wrap; expired zero matrices can sit inside the visible prefix.
        for (let i = 0; i < 4; i++) b.trail.add(i, 0, 0, f * .03, .1, .3, color, i % 2 ? .02 : 1);
        b.spark.spawn(0, 1, 0, .1, color, f % 2 ? .02 : 1);
      }
      const dt = f % 9 === 0 ? 1 / 30 : 1 / 60;
      for (const ink of b.inks) ink.update(dt, decks);
      b.spark.update(dt); b.trail.update(dt); b.confetti.update(dt, decks);
    }
    for (let i = 0; i < before.meshes.length; i++) {
      const a = before.meshes[i], b = proposal.meshes[i];
      assert.equal(a.count, b.count); countsSeen.add(a.count);
      assert.equal(Buffer.compare(Buffer.from(a.instanceMatrix.array.buffer), Buffer.from(b.instanceMatrix.array.buffer)), 0);
      if (a.instanceColor) assert.equal(Buffer.compare(Buffer.from(a.instanceColor.array.buffer), Buffer.from(b.instanceColor.array.buffer)), 0);
    }
    // Include frames not submitted to GL: deferred uploads must be safe when rendering resumes.
    if (f % 13 !== 0) {
      before.d.draw(before.meshes); proposal.d.draw(proposal.meshes);
      for (let i = 0; i < before.meshes.length; i++) {
        const a = before.meshes[i], b = proposal.meshes[i], bytes = a.count * 16 * 4;
        assert.equal(Buffer.compare(before.d.uploaded(a.instanceMatrix).subarray(0, bytes), proposal.d.uploaded(b.instanceMatrix).subarray(0, bytes)), 0);
      }
    }
    comparedFrames++;
  }
  phases.push({ scenario, frames: n, beforeSubBytes: before.d.stats.subBytes - oldB,
    proposalSubBytes: proposal.d.stats.subBytes - newB, beforeSubCalls: before.d.stats.subCalls - oldC,
    proposalSubCalls: proposal.d.stats.subCalls - newC });
}
runFrames(120, 'empty'); runFrames(600, 'mixed'); runFrames(600, 'wrap');
for (const b of [before, proposal]) { for (const ink of b.inks) ink.clear(); b.trail.clear(); b.spark.clear(); b.confetti.clear(); }
runFrames(120, 'after-clear'); runFrames(600, 'mixed');
assert(phases[0].beforeSubBytes > 0); assert.equal(phases[0].proposalSubBytes, 0);
assert.equal(phases[3].proposalSubBytes, 0);
const result = {
  base, node: process.version,
  method: 'Production methods/classes and bundled Three.js resource managers; simulated GL, no real browser or GPU.',
  sourceSha256: Object.fromEntries(paths.map(p => [p, hash(sources[p])])),
  instancedLifetimes: lifetimes, dock,
  uploads: { comparedFrames, meshes: before.meshes.length, allCpuMatrixAndColorBytesEqual: true,
    allSubmittedLiveGpuMatrixBytesEqual: true, phases, maxCountSeen: Math.max(...countsSeen),
    matrixCapacityBytes: before.meshes.reduce((n, m) => n + m.instanceMatrix.array.byteLength, 0),
    lobbyMatrixCapacityBytes: before.meshes.slice(0, 8).reduce((n, m) => n + m.instanceMatrix.array.byteLength, 0) },
};
const output = 'reports/inkwave-zero-tradeoff-followup-evidence-2026-09-29.json';
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ result: 'PASS', output, lifetimes, dock, uploads: result.uploads }, null, 2));
