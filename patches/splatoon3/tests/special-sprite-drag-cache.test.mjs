import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source = fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs', import.meta.url), 'utf8');
const start = source.indexOf('class SpritePool {'), end = source.indexOf('// Ribbon trails', start);
assert.ok(start >= 0 && end > start);
const candidate = source.slice(start, end);
// Frozen update from main 7f863ea2, with the same swap-removal and attribute
// uploads. The comparison executes complete production pools, not a motion model.
const oldUpdate = fs.readFileSync(new URL('./fixtures/sprite-update-before-drag-cache.txt', import.meta.url), 'utf8');
const u0 = candidate.indexOf('  update(dt) {'), u1 = candidate.indexOf('\n  clear()', u0);
const baseline = candidate.slice(0, u0) + oldUpdate.trimEnd() + candidate.slice(u1);
function pool(body, cap = 64, additive = false) {
  let word = 17, expCalls = 0;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296);
  const math = Object.create(Math); math.exp = value => { expCalls++; return Math.exp(value); };
  const Pool = new Function('THREE', 'SPRITE_VERT', 'SPARK_FRAG', 'PUFF_FRAG', 'vfxRandom', 'TAU', 'Math', body + '\nreturn SpritePool;')
    (THREE, '', '', '', random, Math.PI * 2, math);
  return { p: new Pool(THREE, cap, additive, { value: 0 }), calls: () => expCalls, reset: () => { expCalls = 0; } };
}
function spawn(p, i, drag) {
  p.spawn(i / 10, i % 7, -i / 3, .4 + i, 2 - i / 9, .6, .04 + (i % 11) / 20, .2, .5, 1, .5, .2, .8, i % 5,
    { drag, grav: i % 3, buoy: i % 2 ? .2 : 0, spin: .1, stretch: i % 3 ? .05 : 0 });
}
function equal(a, b, label) {
  assert.equal(a.n, b.n, label + ' count');
  assert.deepEqual(a.p, b.p, label + ' particle state');
  assert.equal(a.mesh.geometry.instanceCount, b.mesh.geometry.instanceCount);
  for (const key of ['aPos', 'aDir', 'aCol', 'aPar']) {
    assert.deepEqual(a[key].array, b[key].array, label + ' ' + key);
    assert.deepEqual(a[key].updateRanges, b[key].updateRanges);
    assert.equal(a[key].version, b[key].version);
  }
}
test('complete sprite buffers match the frozen update through mixed drag, expiry, overflow and clear', () => {
  for (const hz of [30, 60, 120]) for (const additive of [false, true]) {
    const a = pool(baseline, 64, additive), b = pool(candidate, 64, additive);
    for (let frame = 0; frame < hz * 3; frame++) {
      if (frame === hz) { a.p.clear(); b.p.clear(); }
      if (frame < hz * 2) for (let i = 0; i < 8; i++) {
        const rate = [0, .8, .8, 1.5, 1.5, 2.2, -0, .25][(frame + i) % 8];
        spawn(a.p, frame * 8 + i, rate); spawn(b.p, frame * 8 + i, rate);
      }
      a.p.update(1 / hz); b.p.update(1 / hz); equal(a.p, b.p, hz + 'Hz/' + additive + '/' + frame);
    }
  }
});
test('factor reuse is local to each finite update and each contiguous rate, including signed zero', () => {
  const a = pool(baseline), b = pool(candidate);
  for (let i = 0; i < 64; i++) { spawn(a.p, i, .8); spawn(b.p, i, .8); }
  for (const dt of [0, -0, 1 / 120, 1 / 60, 1 / 30, -.01]) {
    a.reset(); b.reset(); a.p.update(dt); b.p.update(dt); equal(a.p, b.p, 'dt=' + dt);
    assert.equal(a.calls(), a.p.n); assert.equal(b.calls(), 1, 'one exponential for the live equal-drag burst');
  }
});
test('non-finite time/rates retain all original Float32 and renderer values', () => {
  for (const dt of [0, 1 / 60, NaN, Infinity, -Infinity]) {
    const a = pool(baseline), b = pool(candidate);
    for (let i = 0; i < 64; i++) { const rate = [0, -0, NaN, Infinity, -Infinity, .8, .8, 2.2][i % 8]; spawn(a.p, i, rate); spawn(b.p, i, rate); }
    a.p.update(dt); b.p.update(dt); equal(a.p, b.p, 'dt=' + dt);
    if (!Number.isFinite(dt)) assert.equal(a.calls(), b.calls(), 'non-finite times do not reuse a factor');
  }
});
