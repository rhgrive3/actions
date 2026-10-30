import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { markAttributeRange } from '../runtime/instance-color-upload.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source = fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs', import.meta.url), 'utf8');
const start = source.indexOf('class SpritePool {'), end = source.indexOf('// Ribbon trails', start);
assert.ok(start >= 0 && end > start);
const candidate = source.slice(start, end);
// Frozen update from main 7f863ea2, with the same swap-removal and attribute
// uploads. The comparison executes complete production pools, not a motion model.
const oldUpdate = fs.readFileSync(new URL('./fixtures/sprite-update-before-drag-cache.txt', import.meta.url), 'utf8');
// Keep later dirty-range handling identical on both sides; replace only the
// particle motion loop whose drag calculation this test compares.
const u0 = candidate.indexOf("    // A burst's adjacent particles share drag.");
const u1 = candidate.indexOf('    const P = this.aPos.array', u0);
const oldStart = oldUpdate.indexOf('    for (let j = this.n - 1; j >= 0; j--) {');
const oldEnd = oldUpdate.indexOf('    const P = this.aPos.array', oldStart);
assert.ok(u0 >= 0 && u1 > u0 && oldStart >= 0 && oldEnd > oldStart);
const baseline = candidate.slice(0, u0) + oldUpdate.slice(oldStart, oldEnd) + candidate.slice(u1);
function pool(body, cap = 64, additive = false) {
  let word = 17, expCalls = 0;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296);
  const math = Object.create(Math); math.exp = value => { expCalls++; return Math.exp(value); };
  const Pool = new Function('THREE', 'SPRITE_VERT', 'SPARK_FRAG', 'PUFF_FRAG', 'vfxRandom', 'TAU', 'Math', 'markAttributeRange', body + '\nreturn SpritePool;')
    (THREE, '', '', '', random, Math.PI * 2, math, markAttributeRange);
  return { p: new Pool(THREE, cap, additive, { value: 0 }), calls: () => expCalls, reset: () => { expCalls = 0; } };
}
function spawn(p, i, drag) {
  p.spawn(i / 10, i % 7, -i / 3, .4 + i, 2 - i / 9, .6, .04 + (i % 11) / 20, .2, .5, 1, .5, .2, .8, i % 5,
    { drag, grav: i % 3, buoy: i % 2 ? .2 : 0, spin: .1, stretch: i % 3 ? .05 : 0 });
}
function equal(a, b, label, motion = true) {
  assert.equal(a.n, b.n, label + ' count');
  if (motion) assert.deepEqual(a.p, b.p, label + ' particle state');
  else for (let i = 0; i < a.p.length; i++) if (i % a.S >= 6) assert.equal(a.p[i], b.p[i], label + ' nonmotion state ' + i);
  assert.equal(a.mesh.geometry.instanceCount, b.mesh.geometry.instanceCount);
  for (const key of ['aPos', 'aDir', 'aCol', 'aPar']) {
    if (motion || key === 'aCol' || key === 'aPar') {
      assert.deepEqual(a[key].array, b[key].array, label + ' ' + key);
      assert.deepEqual(a[key].updateRanges, b[key].updateRanges);
      assert.equal(a[key].version, b[key].version);
    }
  }
}
test('60 Hz buffers and all-cadence lifecycle match the frozen update through expiry, overflow and clear', () => {
  for (const hz of [30, 60, 120]) for (const additive of [false, true]) {
    const a = pool(baseline, 64, additive), b = pool(candidate, 64, additive);
    for (let frame = 0; frame < hz * 3; frame++) {
      if (frame === hz) { a.p.clear(); b.p.clear(); }
      if (frame < hz * 2) for (let i = 0; i < 8; i++) {
        const rate = [0, .8, .8, 1.5, 1.5, 2.2, -0, .25][(frame + i) % 8];
        spawn(a.p, frame * 8 + i, rate); spawn(b.p, frame * 8 + i, rate);
      }
      a.p.update(1 / hz); b.p.update(1 / hz); equal(a.p, b.p, hz + 'Hz/' + additive + '/' + frame, hz === 60);
    }
  }
});
test('factor reuse is local to each finite update and each contiguous rate, including signed zero', () => {
  for (const dt of [0, -0, 1 / 120, 1 / 60, 1 / 30, -.01]) {
    const a = pool(baseline), b = pool(candidate);
    for (let i = 0; i < 64; i++) { spawn(a.p, i, .8); spawn(b.p, i, .8); }
    a.reset(); b.reset(); a.p.update(dt); b.p.update(dt); equal(a.p, b.p, 'dt=' + dt, dt <= 0 || dt === 1 / 60);
    assert.equal(a.calls(), a.p.n); assert.equal(b.calls(), 1, 'one exponential for the live equal-drag burst');
    b.reset(); b.p.update(dt);
    assert.equal(b.calls(), 1, 'factor is recalculated on the next live update');
  }
});
test('non-finite time/rates retain all original Float32 and renderer values', () => {
  for (const dt of [0, 1 / 60, NaN, Infinity, -Infinity]) {
    // Isolate this byte-for-byte case from the finite workloads' compiler
    // feedback. V8 12.4 can choose opposite NaN sign bits after tiering the
    // two different update bodies; the inert tags give each dt fresh code.
    const a = pool(baseline + '\n// non-finite baseline dt=' + dt), b = pool(candidate + '\n// non-finite candidate dt=' + dt);
    for (let i = 0; i < 64; i++) { const rate = [0, -0, NaN, Infinity, -Infinity, .8, .8, 2.2][i % 8]; spawn(a.p, i, rate); spawn(b.p, i, rate); }
    a.p.update(dt); b.p.update(dt); equal(a.p, b.p, 'dt=' + dt);
    if (!Number.isFinite(dt)) assert.equal(a.calls(), b.calls(), 'non-finite times do not reuse a factor');
  }
});
