// Run from repo root: node reports/inkwave-lens-live-range-probe-2026-09-30.mjs
// Tests actual LensInk against the committed pre-fix version using vendored Three.js' WebGLAttributes.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';

const path = 'inkwave-public/src/fx/screenfx.js';
const old = execFileSync('git', ['show', 'd5d54d1d37274dfa82467b37b9b8009719783ed3:' + path], { encoding: 'utf8' });
const fixed = fs.readFileSync(path, 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const vsrc = fs.readFileSync('inkwave-public/vendor/three/build/three.module.js', 'utf8');
const a = vsrc.indexOf('function WebGLAttributes( gl ) {'), b = vsrc.indexOf('\nvar alphahash_fragment', a);
assert(a >= 0 && b > a);
const types = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Uint8ClampedArray };
const WebGLAttributes = vm.runInNewContext(vsrc.slice(a, b) + '\nWebGLAttributes', types);
const rand = () => { let x = 1234567, n = 0; return {
  next() { n++; x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; },
  state() { return { x, n }; },
}; };
function lensClass(source, random) {
  const end = source.indexOf('export class ScreenFX');
  assert(end > 0);
  const stripped = source.slice(0, end).replace(/^import .*;\n/gm, '');
  const math = Object.create(Math); math.random = () => random.next();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return vm.runInNewContext(stripped + '\nLensInk', { THREE, Math: math, clamp, ...types });
}
function renderer() {
  let buffer, rt = null, bg = new THREE.Color();
  const c = { initialBuffers: 0, uploads: 0, bytes: 0, clears: 0, draws: 0 };
  const gl = {
    FLOAT: 5126, createBuffer: () => ({}), bindBuffer: (_, b) => { buffer = b; },
    bufferData: (_, array) => { c.initialBuffers++; buffer.bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice(); },
    bufferSubData: (_, offset, array, start = 0, count = array.length - start) => {
      c.uploads++; c.bytes += count * array.BYTES_PER_ELEMENT;
      buffer.bytes.set(new Uint8Array(array.buffer, array.byteOffset + start * array.BYTES_PER_ELEMENT, count * array.BYTES_PER_ELEMENT), offset);
    }, deleteBuffer() {},
  };
  const attrs = WebGLAttributes(gl);
  return {
    c, attrs, getRenderTarget() { return rt; }, setRenderTarget(v) { rt = v; },
    getClearColor(out) { return out.copy(bg); }, getClearAlpha() { return 1; },
    setClearColor(v) { bg.set(v); }, clear() { c.clears++; },
    render(scene) {
      c.draws++;
      const geo = scene.children[0].geometry;
      attrs.update(geo.attributes.iA, 34962); attrs.update(geo.attributes.iB, 34962);
    },
  };
}
const r0 = rand(), r1 = rand(), gl0 = renderer(), gl1 = renderer();
const Legacy = lensClass(old, r0), Current = lensClass(fixed, r1);
const l0 = new Legacy(gl0), l1 = new Current(gl1);
// An initial upload exists once, independently of how many instances are live later.
for (const [l, r] of [[l0, gl0], [l1, gl1]]) {
  r.attrs.update(l.aA, 34962); r.attrs.update(l.aB, 34962);
}
const hashLive = crypto.createHash('sha256');
let activeFrames = 0, emptyFrames = 0, maxInstances = 0, clearTransitions = 0;
for (let frame = 0; frame < 1200; frame++) {
  for (const lens of [l0, l1]) {
    if ([30, 240, 610].includes(frame)) lens.add('drop', 0, 0.4, 0.8, 0.035, { life: 1.2, stick: 0.2 });
    if (frame === 330) for (let i = 0; i < 220; i++) lens.add('sat', i % 3, i / 220, 0.5, 0.012, { life: 0.55 });
    if (frame === 480) lens.clear();
    lens.update(1 / 60, 16 / 9);
    lens.render(16 / 9);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(l0.parts)), JSON.parse(JSON.stringify(l1.parts)));
  assert.deepEqual(r0.state(), r1.state());
  assert.equal(l0.geo.instanceCount, l1.geo.instanceCount);
  assert.equal(l0.dirty, l1.dirty);
  assert.deepEqual(l0.aA.array, l1.aA.array); assert.deepEqual(l0.aB.array, l1.aB.array);
  const n = l0.geo.instanceCount;
  if (n) {
    activeFrames++; maxInstances = Math.max(maxInstances, n);
    for (const [a, b, rA, rB] of [[l0.aA, l1.aA, gl0, gl1], [l0.aB, l1.aB, gl0, gl1]]) {
      const bytes = n * 4 * Float32Array.BYTES_PER_ELEMENT;
      const x = rA.attrs.get(a).buffer.bytes.subarray(0, bytes), y = rB.attrs.get(b).buffer.bytes.subarray(0, bytes);
      assert.deepEqual(x, y); hashLive.update(x);
    }
  } else emptyFrames++;
  if ([479, 480, 609, 610].includes(frame)) clearTransitions++;
}
assert(activeFrames && emptyFrames && maxInstances === 220 && clearTransitions === 4);
assert.equal(gl0.c.initialBuffers, gl1.c.initialBuffers);
assert.equal(gl0.c.clears, gl1.c.clears);
assert.equal(gl0.c.draws, gl1.c.draws);
const result = { baseCommit: 'd5d54d1d37274dfa82467b37b9b8009719783ed3',
  sourceSha256: { before: hash(old), after: hash(fixed), vendor: hash(vsrc) },
  frames: 1200, activeFrames, emptyFrames, maxInstances, baseline: gl0.c, fixed: gl1.c,
  random: r0.state(), liveBufferSha256: hashLive.digest('hex'),
  allPartsAndCpuArraysAndLiveBytesEqual: true,
  scope: 'simulated GL bufferSubData using vendored uploader; no browser/GPU/fps measurement' };
console.log(JSON.stringify(result, null, 2));
l0.dispose(); l1.dispose();
