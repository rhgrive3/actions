// Audit only: production modules are evaluated unchanged and with narrowly scoped proposals.
// Run from repo root: node reports/inkwave-extra-cpu-upload-probe-2026-09-30.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import { PLAYER, QUALITY } from '../inkwave-public/src/config.js';
import { MAP_LAYOUTS, PATTERN } from '../inkwave-public/src/world/maps.js';

const root = 'inkwave-public/';
const paths = ['src/fx/fx.js', 'src/game/nav.js', 'src/world/level.js',
  'src/world/maps.js', 'src/config.js', 'vendor/three/build/three.module.js', 'vendor/three/build/three.core.js'];
const src = Object.fromEntries(paths.map(p => [p, fs.readFileSync(root + p, 'utf8')]));
const postfix = process.argv.includes('--postfix');
const fixed = postfix ? { fx: src['src/fx/fx.js'], nav: src['src/game/nav.js'] } : null;
if (postfix) for (const p of ['src/fx/fx.js', 'src/game/nav.js']) {
  src[p] = execFileSync('git', ['show', 'd5d54d1d37274dfa82467b37b9b8009719783ed3:' + root + p], { encoding: 'utf8' });
}
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const plain = x => JSON.parse(JSON.stringify(x));
const types = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Uint8ClampedArray };
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'patch boundary: ' + a); return s.replace(a, b); }
function evaluate(s, name, extras = {}) {
  return vm.runInNewContext(s.replace(/^import .*;\n/gm, '').replace(/export class /g, 'class ') + '\n' + name,
    { THREE, PLAYER, QUALITY, PATTERN, ...types, ...extras });
}
function between(s, a, b) { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); assert(i >= 0 && j > i); return s.slice(i, j); }
function rng() { let state = 91873, calls = 0; return { next() { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }, snapshot() { return { state, calls }; } }; }
function mathWith(extra) { return Object.assign(Object.create(Math), extra); }

// Q07: byte-retaining GL fixture uses the shipped WebGLAttributes, not a rewritten uploader.
const WebGLAttributes = vm.runInNewContext(between(src['vendor/three/build/three.module.js'],
  'function WebGLAttributes( gl ) {', '\nvar alphahash_fragment') + '\nWebGLAttributes', types);
function uploader() {
  let bound; const counters = { dataCalls: 0, subCalls: 0, subBytes: 0 };
  const gl = { FLOAT: 5126, createBuffer: () => ({}), bindBuffer: (_, b) => { bound = b; },
    bufferData: (_, a) => { counters.dataCalls++; bound.bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice(); },
    bufferSubData: (_, offset, a, start = 0, count = a.length - start) => {
      counters.subCalls++; counters.subBytes += count * a.BYTES_PER_ELEMENT;
      bound.bytes.set(new Uint8Array(a.buffer, a.byteOffset + start * a.BYTES_PER_ELEMENT, count * a.BYTES_PER_ELEMENT), offset);
    }, deleteBuffer() {} };
  const attributes = WebGLAttributes(gl);
  return { counters, attributes, upload(g) { for (const a of g.userData.dyn) attributes.update(a, 34962); } };
}
const fxProposal = postfix ? fixed.fx : replace(src['src/fx/fx.js'], 'function markUpdated(geo, count) {',
  'function markUpdated(geo, count) {\n  if (count === 0) return;');
const rndA = rng(), rndB = rng();
const FXa = evaluate(src['src/fx/fx.js'], 'FX', { Math: mathWith({ random: () => rndA.next() }) });
const FXb = evaluate(fxProposal, 'FX', { Math: mathWith({ random: () => rndB.next() }) });
const fa = new FXa(new THREE.Scene(), { quality: 'high' }), fb = new FXb(new THREE.Scene(), { quality: 'high' });
const pools = f => [f.dGeo, f.puffs.geo, f.glows.geo, f.rings.geo, f.shells.geo, f.beams.geo];
const ua = uploader(), ub = uploader();
for (const g of pools(fa)) ua.upload(g);
for (const g of pools(fb)) ub.upload(g);
const pos = new THREE.Vector3(0, 2, 0), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color('#18c7e8');
let gpuLiveComparisons = 0, zeroToLivePools = 0, lastCounts = Array(6).fill(0);
const seenLive = Array(6).fill(false), cpuHash = crypto.createHash('sha256');
let idle;
for (let frame = 0; frame < 1800; frame++) {
  for (const f of [fa, fb]) {
    if ([600, 640, 1400].includes(frame)) { f.explosion(pos, col, 3); f.spawnFlash(pos, col); f.burst(pos, up, col); }
    if (frame >= 650 && frame < 690) { f.mark(pos, up, col, 2); f.pillar(pos, col); }
    if (frame === 1000) f.clear();
    f.update(1 / 60, null);
  }
  assert.deepEqual(plain(fa.stats()), plain(fb.stats()));
  assert.deepEqual(rndA.snapshot(), rndB.snapshot());
  const aa = pools(fa), bb = pools(fb);
  for (let p = 0; p < aa.length; p++) {
    const a = aa[p], b = bb[p]; assert.equal(a.instanceCount, b.instanceCount);
    if (a.instanceCount > 0) { seenLive[p] = true; if (!lastCounts[p]) zeroToLivePools++; }
    lastCounts[p] = a.instanceCount;
    ua.upload(a); ub.upload(b);
    for (let k = 0; k < a.userData.dyn.length; k++) {
      const x = a.userData.dyn[k], y = b.userData.dyn[k];
      assert.deepEqual(x.array, y.array); // includes inactive CPU slots
      const bytes = a.instanceCount * x.itemSize * x.array.BYTES_PER_ELEMENT;
      if (bytes) {
        assert.deepEqual(ua.attributes.get(x).buffer.bytes.subarray(0, bytes), ub.attributes.get(y).buffer.bytes.subarray(0, bytes));
        gpuLiveComparisons++; cpuHash.update(new Uint8Array(x.array.buffer, x.array.byteOffset, bytes));
      }
    }
  }
  if (frame === 599) idle = { frames: 600, baseline: { ...ua.counters }, proposal: { ...ub.counters } };
}
assert(seenLive.every(Boolean), 'all six pools must have active coverage');
assert.equal(idle.proposal.subCalls, 0);
const fxResult = { frames: 1800, idle, overall: { baseline: ua.counters, proposal: ub.counters },
  allSixPoolsExercised: seenLive.every(Boolean), zeroToLivePools, gpuLiveComparisons, activeBytesSha256: cpuHash.digest('hex'),
  randomState: rndA.snapshot(), cpuArraysStatsAndRandomExactlyEqual: true };
fa.dispose(); fb.dispose();

// Q08: fixed directions retain JS Number precision and exactly the existing angle expression.
let navProposal = postfix ? fixed.nav : replace(src['src/game/nav.js'], 'const _p =',
  'const RING = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; });\nconst _p =');
if (!postfix) navProposal = replace(navProposal, '        const a = (k / 8) * Math.PI * 2;\n        if (L.pointInside(_p.set(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r), 0)) return false;',
  '        if (L.pointInside(_p.set(x + RING[k][0] * r, y + h, z + RING[k][1] * r), 0)) return false;');
function navType(s) {
  const calls = { sin: 0, cos: 0 };
  const N = evaluate(s, 'NavGraph', { Math: mathWith({ sin(a) { calls.sin++; return Math.sin(a); }, cos(a) { calls.cos++; return Math.cos(a); } }) });
  return { N, calls };
}
const na = navType(src['src/game/nav.js']), nb = navType(navProposal), Level = evaluate(src['src/world/level.js'], 'Level');
const navResult = { tableInitialization: { ...nb.calls }, cases: [] };
const graph = g => plain({ nodes: g.nodes, cells: g.cells, valid: Array.from(g.valid), validIds: g.validIds });
for (const [id, layout] of Object.entries(MAP_LAYOUTS)) {
  for (const extras of [false, true]) {
    const extra = extras ? [{ min: [-2, 0, -2], max: [2, 2, 2] }, { obox: true, center: [7, 1, 7], size: [3, 2, 5], rotY: 37, rail: true }] : [];
    function run(Type) {
      const level = new Level(layout, extra), pointInside = level.pointInside.bind(level), trace = crypto.createHash('sha256'); let probes = 0;
      level.pointInside = (p, margin) => { const v = pointInside(p, margin); probes++; trace.update(JSON.stringify([p.x, p.y, p.z, margin, v])); return v; };
      const g = new Type(level, null); return { g, probes, trace: trace.digest('hex') };
    }
    const beforeA = { ...na.calls }, beforeB = { ...nb.calls }, a = run(na.N), b = run(nb.N);
    assert.deepEqual(graph(a.g), graph(b.g)); assert.equal(a.trace, b.trace); assert.equal(a.probes, b.probes);
    let pathQueries = 0;
    for (let j = 0; j < 16; j++) for (const team of [0, 1]) {
      const ids = a.g.validIds, start = ids[(j * 107) % ids.length], goal = ids[(j * 193 + 41) % ids.length];
      assert.deepEqual(plain(a.g.path(start, goal, team)), plain(b.g.path(start, goal, team))); pathQueries++;
    }
    navResult.cases.push({ map: id, syntheticExtraColliders: extras, nodes: a.g.nodes.length,
      edges: a.g.nodes.reduce((n, x) => n + x.nb.length, 0), pointInsideCalls: a.probes, pointInsideTraceSha256: a.trace,
      baselineTrig: na.calls.sin - beforeA.sin + na.calls.cos - beforeA.cos,
      proposalTrig: nb.calls.sin - beforeB.sin + nb.calls.cos - beforeB.cos,
      graphSha256: hash(JSON.stringify(graph(a.g))), pathQueries, exact: true });
  }
}

// Q09: extract the actual complete FX.update; stub only unrelated pool updaters.
const updateSource = between(src['src/fx/fx.js'], '  update(dt, camera) {', '\n  clear() {');
const updateProposal = postfix ? between(fixed.fx, '  update(dt, camera) {', '\n  clear() {') : replace(updateSource, '      camera.getWorldPosition(this._camPos);\n      camera.getWorldDirection(this._camDir);',
  '      camera.getWorldDirection(this._camDir);\n      this._camPos.setFromMatrixPosition(camera.matrixWorld);');
const method = s => vm.runInNewContext('({' + s + '}).update', { UP: up });
const updateA = method(updateSource), updateB = method(updateProposal);
function context() {
  const uniform = () => ({ uTime: { value: 0 } });
  return { _dt: 0, _time: 0, _checks: 0, _shellUniforms: uniform(), _ringU: uniform(), _beamU: uniform(),
    _camPos: new THREE.Vector3(), _camDir: new THREE.Vector3(), _light: { sunDir: new THREE.Vector3(0.3, 0.8, -0.4).normalize() },
    _dropU: { uSunDirV: { value: new THREE.Vector3() }, uUpV: { value: new THREE.Vector3() } },
    _moteU: { ...uniform(), uCam: { value: new THREE.Vector3() } },
    _runSchedule() {}, _updateDrops() {}, _updateSprites() {}, _updateRings() {}, _updateShells() {}, _updateBeams() {} };
}
function rig() {
  const camera = new THREE.PerspectiveCamera(65, 1.5, 0.15, 6500), parent = new THREE.Group(); parent.add(camera);
  const counts = { updates: 0, inversions: 0 };
  const u = camera.updateWorldMatrix, inv = camera.matrixWorldInverse.invert;
  camera.updateWorldMatrix = function (...args) { counts.updates++; return u.apply(this, args); };
  camera.matrixWorldInverse.invert = function (...args) { counts.inversions++; return inv.apply(this, args); };
  return { camera, parent, counts };
}
const ra = rig(), rb = rig(), ca = context(), cb = context(), cameraHash = crypto.createHash('sha256');
for (let i = 0; i < 2400; i++) {
  for (const r of [ra, rb]) {
    r.camera.position.set(Math.sin(i * 0.07) * 30, 3 + (i % 17), Math.cos(i * 0.09) * 15);
    r.camera.rotation.set(i * 0.003, -i * 0.007, i * 0.002);
    r.parent.position.set(i % 13, 2, -(i % 31)); r.parent.rotation.y = i * 0.005;
    r.parent.scale.set(1 + (i % 5) * 0.2, 1 + (i % 3) * 0.1, 1);
    r.camera.matrixAutoUpdate = i % 4 !== 0; if (!r.camera.matrixAutoUpdate) r.camera.updateMatrix();
  }
  updateA.call(ca, 1 / 60, ra.camera); updateB.call(cb, 1 / 60, rb.camera);
  const state = (c, r) => [c._camPos.toArray(), c._camDir.toArray(), c._dropU.uSunDirV.value.toArray(),
    c._dropU.uUpV.value.toArray(), c._moteU.uCam.value.toArray(), r.camera.matrixWorld.toArray(), r.camera.matrixWorldInverse.toArray()];
  assert.deepEqual(state(ca, ra), state(cb, rb)); cameraHash.update(JSON.stringify(state(ca, ra)));
}
const result = { auditedCommit: '8b5954be5eb0eb66da0a240a5b23061bc116f642', node: process.version,
  mode: postfix ? 'postfix versus committed d5d54d1 baseline' : 'audit-only proposed edits',
  method: 'Node VM, actual source and vendored Three.js; simulated GL buffers, no browser/GPU/smartphone timing',
  sourceSha256: Object.fromEntries(paths.map(p => [p, hash(src[p])])), Q07: fxResult, Q08: navResult,
  ...(postfix ? { fixedSourceSha256: { 'src/fx/fx.js': hash(fixed.fx), 'src/game/nav.js': hash(fixed.nav) } } : {}),
  Q09: { frames: 2400, baseline: ra.counts, proposal: rb.counts, exact: true, stateSha256: cameraHash.digest('hex') } };
console.log(JSON.stringify(result, null, 2));
