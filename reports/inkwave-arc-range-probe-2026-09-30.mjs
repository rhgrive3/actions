// Run from repo root: node reports/inkwave-arc-range-probe-2026-09-30.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import { SUB } from '../inkwave-public/src/config.js';

const base = 'd5d54d1d37274dfa82467b37b9b8009719783ed3', path = 'inkwave-public/src/game/weapons.js';
const old = process.env.INKWAVE_BASELINE_DIR ? fs.readFileSync(process.env.INKWAVE_BASELINE_DIR + '/' + path, 'utf8')
  : execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' });
const fixed = fs.readFileSync(path, 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
assert.equal(crypto.createHash('sha1').update('blob ' + Buffer.byteLength(old) + '\0').update(old).digest('hex'), '56268624fd65d141bcde063d09f1afad9a13b69d');
function between(s, start, end) {
  const a = s.indexOf(start), b = s.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'source boundary: ' + start); return s.slice(a, b);
}
function method(s, start, end, context) {
  const name = start.trim().split('(')[0];
  return vm.runInNewContext('({' + between(s, start, end) + '})[' + JSON.stringify(name) + ']', context);
}
const vendor = fs.readFileSync('inkwave-public/vendor/three/build/three.module.js', 'utf8');
const types = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Uint8ClampedArray };
const uploader = vm.runInNewContext(between(vendor, 'function WebGLAttributes( gl ) {', '\nvar alphahash_fragment') + '\nWebGLAttributes', types);
function renderer() {
  let current;
  const counts = { initialBuffers: 0, uploads: 0, bytes: 0 };
  const gl = { FLOAT: 5126, createBuffer: () => ({}), bindBuffer: (_, b) => { current = b; },
    bufferData: (_, array) => { counts.initialBuffers++; current.bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice(); },
    bufferSubData: (_, offset, array, start = 0, count = array.length - start) => {
      counts.uploads++; counts.bytes += count * array.BYTES_PER_ELEMENT;
      current.bytes.set(new Uint8Array(array.buffer, array.byteOffset + start * array.BYTES_PER_ELEMENT, count * array.BYTES_PER_ELEMENT), offset);
    }, deleteBuffer() {} };
  return { counts, attrs: uploader(gl) };
}
function runtime(source) {
  const G = { time: 0, physics: null }, counters = { segment: 0 }, controls = { step: 0, hitAt: 0, wall: false };
  const context = { THREE, SUB, G, SIM_DT: 1 / 60, UP: new THREE.Vector3(0, 1, 0),
    _v: new THREE.Vector3(), _v2: new THREE.Vector3(), _v3: new THREE.Vector3(), _hit: {},
    clamp: (v, a, b) => v < a ? a : v > b ? b : v };
  const arc = method(source, '  updateArc(a, show) {', '\n  // Every projectile', context);
  const throwVelocity = method(source, '  throwVelocity(a, speed, out) {', '\n  throwBomb(', context);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  arcGeo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(64), 1));
  const holder = { arcN: 64, arcGeo, arcLine: new THREE.Line(arcGeo, new THREE.LineDashedMaterial()),
    arcRing: new THREE.Mesh(new THREE.RingGeometry(), new THREE.MeshBasicMaterial()), throwVelocity };
  const actor = { alive: true, ink: 100, color: new THREE.Color(0.6, 0.1, 0.4),
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), aimYaw: 0, aimPitch: 0 };
  const makePhysics = () => ({ segment(prev, p, h) {
    counters.segment++; controls.step++;
    h.hit = controls.hitAt > 0 && controls.step === controls.hitAt;
    if (h.hit) { h.point = prev.clone().lerp(p, 0.4); h.normal = new THREE.Vector3(controls.wall ? 1 : 0, controls.wall ? 0 : 1, 0); }
    return h;
  } });
  G.physics = makePhysics();
  const render = renderer();
  for (const attr of Object.values(arcGeo.attributes)) render.attrs.update(attr, 34962);
  return { G, counters, controls, actor, holder, render, makePhysics, arc };
}
const runtimes = [runtime(old), runtime(fixed)], liveTrace = crypto.createHash('sha256');
const counts = {}, versions = runtimes.map(() => []);
let hidden = 0, shown = 0;
for (let frame = 0; frame < 1800; frame++) {
  const step = Math.floor(frame / 4), hitAt = [1, 2, 3, 17, 63, 87, 0][step % 7];
  const show = frame % 43 > 4;
  for (let r = 0; r < 2; r++) {
    const x = runtimes[r]; x.G.time = frame / 60; x.controls.step = 0; x.controls.hitAt = hitAt; x.controls.wall = step % 3 === 0;
    x.actor.alive = frame % 113 > 2; x.actor.ink = frame % 89 < 10 ? 0 : 100;
    x.actor.pos.set(Math.sin(step * 0.02), 0.2 + step % 3, Math.cos(step * 0.04));
    x.actor.vel.set(Math.sin(step * 0.03), 0, Math.cos(step * 0.01));
    x.actor.aimYaw = step * 0.05; x.actor.aimPitch = Math.sin(step * 0.13) * 0.6;
    if ([500, 1100].includes(frame)) x.G.physics = x.makePhysics();
    x.arc.call(x.holder, x.actor, show);
    if (x.holder.arcLine.visible) for (const attr of Object.values(x.holder.arcGeo.attributes)) x.render.attrs.update(attr, 34962);
    versions[r].push(Object.values(x.holder.arcGeo.attributes).map(a => a.version));
  }
  const a = runtimes[0].holder, b = runtimes[1].holder;
  const visual = h => ({ draw: { ...h.arcGeo.drawRange }, line: h.arcLine.visible, ring: h.arcRing.visible,
    ringPos: h.arcRing.position.toArray(), ringQuat: h.arcRing.quaternion.toArray(), ringScale: h.arcRing.scale.toArray(),
    lineColor: h.arcLine.material.color.toArray(), ringColor: h.arcRing.material.color.toArray() });
  assert.deepEqual(visual(a), visual(b));
  for (const name of ['position', 'lineDistance']) {
    const x = a.arcGeo.attributes[name], y = b.arcGeo.attributes[name];
    assert.deepEqual(x.array, y.array, name + ' CPU frame ' + frame);
    if (a.arcLine.visible) {
      const n = a.arcGeo.drawRange.count * x.itemSize * Float32Array.BYTES_PER_ELEMENT;
      const before = runtimes[0].render.attrs.get(x).buffer.bytes.subarray(0, n);
      const after = runtimes[1].render.attrs.get(y).buffer.bytes.subarray(0, n);
      assert.deepEqual(before, after, name + ' GPU frame ' + frame); liveTrace.update(before);
    }
  }
  if (a.arcLine.visible) { shown++; counts[a.arcGeo.drawRange.count] = (counts[a.arcGeo.drawRange.count] || 0) + 1; } else hidden++;
}
assert.deepEqual(versions[0], versions[1]);
assert.deepEqual(runtimes[0].counters, runtimes[1].counters);
assert(counts[2] && counts[64] && hidden && shown);
assert.equal(runtimes[0].render.counts.initialBuffers, runtimes[1].render.counts.initialBuffers);
console.log(JSON.stringify({ baseCommit: base, sourceSha256: { before: hash(old), after: hash(fixed), vendor: hash(vendor) },
  frames: 1800, shown, hidden, visibleVertexCountHistogram: counts, segmentQueries: runtimes[0].counters.segment,
  baseline: runtimes[0].render.counts, fixed: runtimes[1].render.counts,
  allCpuArraysAndAttributeVersionsAndVisualStateAndLiveGpuBytesEqual: true,
  liveBufferSha256: liveTrace.digest('hex'), scope: 'Actual updateArc and throwVelocity with synthetic collision answers; vendored WebGLAttributes with byte-retaining simulated GL. No browser/GPU/FPS measurement.' }, null, 2));
