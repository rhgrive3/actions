import test from 'node:test';
import assert from 'node:assert/strict';
import { installIssue264PaintOwnership } from '../runtime/paint-ownership.mjs';
import { installIssue264PaintOwnership as installBaseline } from './fixtures/paint-piece-ownership-baseline.mjs';

function make(install, cells) {
  class Paint { splat() {} flush() {} _emitGrowth() {} dispose() {} }
  install(Paint, { kind: { speck: 7 }, shapes: [], reach: [], dripReach: 4 });
  const paint = new Paint();
  paint.grid = new Uint8Array(cells.length);
  paint._paintOrderId();
  paint._paintOwnershipOrder.set(cells);
  return paint;
}
function runs(paint, face, order, bounds) {
  const count = paint._paintOrderRuns(face, order, ...bounds);
  return Array.from({ length: count }, (_, i) => Array.from(paint._paintOrderRunScratch.subarray(i * 4, i * 4 + 4)));
}
const covers = (rows, x, y) => rows.some(([x0, x1, y0, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
const area = rows => rows.reduce((sum, [x0, x1, y0, y1]) => sum + (x1 - x0) * (y1 - y0), 0);
const faceOf = (nu, nv, cu = 1, cv = 1) => ({ nu, nv, cu, cv, su: nu * cu, sv: nv * cv, grid: 0, atlas: { ppm: 32, pad: 2 } });

test('a solid 18-row ownership rectangle emits one rectangle with exact clipped and padded bounds', () => {
  const face = faceOf(12, 18), cells = new Uint32Array(12 * 18).fill(3);
  const paint = make(installIssue264PaintOwnership, cells), baseline = make(installBaseline, cells);
  for (const bounds of [[0, 12, 0, 18], [-1, 13, -1, 19], [.2, 11.8, .3, 17.9]]) {
    const old = runs(baseline, face, 3, bounds), next = runs(paint, face, 3, bounds);
    assert.equal(old.length, 18); assert.equal(next.length, 1);
    assert.deepEqual(next[0], [old[0][0], old[0][1], old[0][2], old.at(-1)[3]]);
  }
});

test('an ended sibling never hides an older continuing run, and empty rows never join', () => {
  const face = faceOf(5, 4);
  const cells = new Uint32Array([
    1, 0, 0, 1, 1,
    1, 0, 0, 0, 0,
    1, 0, 0, 0, 0,
    0, 0, 0, 1, 1,
  ]);
  const paint = make(installIssue264PaintOwnership, cells);
  assert.deepEqual(runs(paint, face, 1, [0, 5, 0, 4]), [[0, 1, 0, 3], [3, 5, 0, 1], [3, 5, 3, 4]]);
  const buffers = paint._paintOrderRunRows;
  assert.deepEqual(runs(paint, face, 9, [0, 5, 0, 4]), []);
  assert.equal(paint._paintOrderRunRows, buffers, 'row buffers reused after an empty call');
  assert.equal(runs(paint, face, 1, [0, 5, 0, 4]).length, 3);
  paint.dispose(); assert.equal(paint._paintOrderRunRows, null);
});

test('random ownership, fractional cells, clipped atlas borders and order changes preserve exact covered regions', () => {
  let word = 0x912ab43;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let iteration = 0; iteration < 180; iteration++) {
    const nu = 1 + Math.floor(random() * 24), nv = 1 + Math.floor(random() * 16);
    const face = faceOf(nu, nv, [1, .1, 1 / 7][iteration % 3], [1, .25, 1 / 9][iteration % 3]);
    const cells = Uint32Array.from({ length: nu * nv }, () => Math.floor(random() * 3));
    const paint = make(installIssue264PaintOwnership, cells), baseline = make(installBaseline, cells);
    const bounds = iteration % 3 ? [-.1, face.su + .1, -.1, face.sv + .1] : [.13 * face.su, .83 * face.su, .07 * face.sv, .97 * face.sv];
    for (const order of [0, 1, 2, 8]) {
      const expected = runs(baseline, face, order, bounds), actual = runs(paint, face, order, bounds);
      assert.ok(actual.length <= expected.length);
      assert.ok(Math.abs(area(actual) - area(expected)) <= 1e-12 * Math.max(1, area(expected)));
      const xs = [...new Set(expected.concat(actual).flatMap(row => row.slice(0, 2)))].sort((a, b) => a - b);
      const ys = [...new Set(expected.concat(actual).flatMap(row => row.slice(2)))].sort((a, b) => a - b);
      for (let x = 1; x < xs.length; x++) for (let y = 1; y < ys.length; y++) {
        const px = (xs[x - 1] + xs[x]) / 2, py = (ys[y - 1] + ys[y]) / 2;
        assert.equal(covers(actual, px, py), covers(expected, px, py), `coverage ${iteration}/${order}/${px}/${py}`);
      }
      assert.deepEqual(paint._paintOwnershipOrder, cells, 'geometry coalescing never changes gameplay ownership');
    }
  }
});
