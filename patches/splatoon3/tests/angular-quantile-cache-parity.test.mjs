import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { biasQuantile } from '../runtime/weapon-accuracy.mjs';

// Verbatim scalar path from main 726e338a. Keep an independent oracle for
// finite fallbacks, clamping, edge return order and floating-point evaluation.
const finite = (x, otherwise) => Number.isFinite(x) ? x : otherwise;
const clamp01 = x => Math.max(0, Math.min(1, x));
function baseline(u, bias) {
  const x = clamp01(finite(u, 0));
  const b = clamp01(finite(bias, .5));
  if (b <= 0 || x <= 0) return 0;
  if (x >= 1) return 1;
  if (b >= 1) return 1;
  return Math.pow(x, Math.log(b) / Math.log(.5));
}

test('quantile cache retains exact boundary and dynamic-bias results', () => {
  const edges = [NaN, Infinity, -Infinity, undefined, null, false, true, '0.5',
    -1, -0, 0, Number.MIN_VALUE, .0001, .1, .25, .5, .9, 1 - Number.EPSILON, 1, 2];
  for (const b of edges) for (const u of edges)
    assert.ok(Object.is(biasQuantile(u, b), baseline(u, b)), `edge ${String(u)}, ${String(b)}`);
  let seed = 0x812fa0ce;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let bias = .5;
  for (let i = 0; i < 1_000_000; i++) {
    if (i % 7 === 0) bias = random() * 1.4 - .2;
    const u = random() * 1.4 - .2;
    assert.ok(Object.is(biasQuantile(u, bias), baseline(u, bias)), `sample ${i}`);
  }
});

test('unchanged normalized bias reuses exponent and boundaries do not touch the cache', () => {
  let logarithms = 0;
  const math = Object.create(Math);
  math.log = value => { logarithms++; return Math.log(value); };
  const source = fs.readFileSync(new URL('../runtime/weapon-accuracy.mjs', import.meta.url), 'utf8')
    .replaceAll('export function ', 'function ');
  const context = vm.createContext({ Math: math });
  vm.runInContext(source, context);
  assert.equal(logarithms, 1);
  for (let i = 1; i < 100; i++) context.biasQuantile(i / 100, .25);
  assert.equal(logarithms, 2);
  context.biasQuantile(0, .75);
  context.biasQuantile(1, .75);
  context.biasQuantile(.5, 0);
  context.biasQuantile(.5, 1);
  assert.equal(logarithms, 2);
  context.biasQuantile(.5, .75);
  assert.equal(logarithms, 3);
  context.biasQuantile(.5, .25);
  context.biasQuantile(.5, .75);
  assert.equal(logarithms, 3, 'independent yaw/pitch biases do not evict each other');
  context.biasQuantile(.5, NaN);
  context.biasQuantile(.7, undefined);
  assert.equal(logarithms, 4);
});
