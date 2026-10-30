import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { floorCoverage, indexedFloorCoverage, installScoring, notePaintMutation } from '../runtime/scoring.mjs';
import { fixture } from './source-fixture.mjs';

const oldSource = fs.readFileSync(new URL('./fixtures/scoring-before-5637c803.mjs.txt', import.meta.url));
assert.equal(createHash('sha256').update(oldSource).digest('hex'), 'ac919d24d6af33eba196c4e3f19d3253c23998586040eb0d4a90b9206b30ad11');
const baseline = await import('data:text/javascript;base64,' + oldSource.toString('base64'));

class Paint {}
installScoring({ PaintSystem: Paint });
const face = (grid, count, cu = .1, cv = .3, y = .8) =>
  ({ grid, nu: count, nv: 1, cu, cv, n: { y }, turf: true });
function make(count = 8192) {
  return Object.assign(new Paint(), { grid: Uint8Array.from({ length: count }, (_, i) => 1 + i % 2),
    dead: new Uint8Array(count), version: 0, paintFaces: [face(0, count)] });
}
function exact(paint, label) {
  assert.deepEqual(paint.coverage(), floorCoverage(paint), label);
}

test('published turf changes preserve the exact ordered weighted sum through announced and unannounced writes', () => {
  let seed = 913; const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const p = make(14000); p.paintFaces = [];
  for (let start = 0; start < p.grid.length; start += 700) {
    p.paintFaces.push({ ...face(start, 700, random(), random(), random() * 1.7 - .3), turf: random() > .2 });
  }
  for (let i = 0; i < p.dead.length; i++) p.dead[i] = random() < .13 ? 1 : 0;
  exact(p, 'initial mixed floor/wall/dead/weight scan');
  for (let step = 0; step < 500; step++) {
    // An external writer can silently alter any earlier cell before the normal
    // writer later publishes one unrelated turf change. Bounds-only reuse fails.
    for (let n = 0; n < 4; n++) p.grid[Math.floor(random() * p.grid.length)] = Math.floor(random() * 4);
    p.grid[13000 + step % 700] = step % 3;
    notePaintMutation(p, true);
    exact(p, 'known publication ' + step);
    if (step % 11 === 0) { p.grid.fill(step % 3, 0, 17); p.version++; exact(p, 'unknown publication ' + step); }
  }
  const out = [9, 9, 9]; assert.equal(p.coverage(out), out); assert.deepEqual(out, floorCoverage(p));
  const escaped = p.coverage(); escaped.fill(99); exact(p, 'returned arrays remain caller-owned');
});

test('clean prefixes avoid repeated weighted additions and unknown publications still scan every eligible cell', () => {
  const p = make(); p.coverage();
  const index = p._s3CoverageIndex, weights = index.weights; let reads = 0;
  index.weights = new Proxy(weights, { get(target, key) { if (/^\d+$/.test(String(key))) reads++; return target[key]; } });
  p.grid[7500] = 2; notePaintMutation(p, true); exact(p, 'late known write');
  assert.ok(reads > 0 && reads <= 1024, 'only the affected ordered suffix needs weighted additions');
  reads = 0;
  p.grid[1] = 1; // silent early mutation plus a later normal writer
  p.grid[7900] = 2; notePaintMutation(p, true); exact(p, 'silent early write');
  assert.ok(reads > 8000, 'the prefix ownership check detects the early direct mutation');
  reads = 0; p.version++; exact(p, 'unknown publication');
  assert.equal(reads, p.grid.length, 'public version-only invalidation keeps a complete scan');
  reads = 0; notePaintMutation(p, true); exact(p, 'no actual ownership change');
  assert.equal(reads, 0, 'a verified unchanged grid needs no additions');
});

test('public direct indexed scans still observe every grid edit without a version change', () => {
  const p = make(); exact(p);
  p.grid[0] = 2; assert.deepEqual(indexedFloorCoverage(p), floorCoverage(p));
  p.grid[8000] = 1; assert.deepEqual(indexedFloorCoverage(p), floorCoverage(p));
  notePaintMutation(p, true); exact(p, 'direct indexed reads do not consume a pending coverage change');
});

test('sparse native-style zero ownership keeps cell offsets and ordered weights exact', () => {
  const p=make(16384);p.grid.fill(0);
  p.paintFaces=[face(0,4097,.17,.13),face(4097,12287,.19,.37)];
  for(let i=7;i<p.dead.length;i+=17)p.dead[i]=1;
  exact(p);assert.deepEqual(p.coverage(),[0,0]);
  for(const [cell,team]of [[15003,1],[12011,2],[0,1],[4096,2],[4097,1],[16000,1]]){
    p.grid[cell]=team;notePaintMutation(p,true);exact(p,'sparse write '+cell);
  }
  p.grid.fill(0);notePaintMutation(p,true);exact(p,'all-zero replay');
});

test('identity changes rebuild the index and retain full fallback', () => {
  const p = make(); exact(p);
  for (const key of ['grid', 'dead', 'paintFaces']) {
    const old = p._s3CoverageIndex;
    p.grid[5] = 2;
    p[key] = key === 'paintFaces' ? p[key].map(f => ({ ...f, cu: .7 })) : p[key].slice();
    if (key === 'dead') p.dead[5] = 1;
    exact(p, key + ' identity'); assert.notEqual(p._s3CoverageIndex, old);
  }
  p.grid.fill(0); p.version++; exact(p, 'clear');
  assert.deepEqual(p.coverage(), [0, 0]);
});

test('sparse unaligned eligible cells retain their weighted order and overlapping/reordered faces use full fallback', () => {
  const p = make();
  for (let i = 1; i < p.dead.length; i += 3) p.dead[i] = 1;
  p.paintFaces = [face(1, 7000), face(7100, 1090, .7, .17, .6)];
  exact(p); p.grid[11] = 1; p.grid[7999] = 2; notePaintMutation(p, true); exact(p);
  for (const faces of [[face(500, 700), face(0, 800)], [face(0, 800), face(500, 700)]]) {
    p.paintFaces = faces; exact(p); assert.equal(p._s3CoverageIndex.replay, null);
    p.grid[601] = 1; notePaintMutation(p, true); exact(p);
  }
});

test('partial words ignore excluded bytes, retain high ownership bytes and fall back at truncated storage', () => {
  const p=make(32);p.dead[1]=1;p.dead[3]=1;p.grid[2]=255;exact(p);
  p.grid[1]=255;p.grid[3]=255;notePaintMutation(p,true);exact(p,'excluded high bytes');
  p.grid[0]=2;p.grid[4]=128;p.grid[31]=255;notePaintMutation(p,true);exact(p,'eligible high bytes');
  const tail=make(31);exact(tail);assert.equal(tail._s3CoverageIndex.replay,null);
  tail.grid[30]=2;notePaintMutation(tail,true);exact(tail,'partial final backing word');
});

test('prototype-disguised storage retains intrinsic brands and the original full-scan values', () => {
  const variants = [new Uint16Array([1, 2, 1, 2]), new Int16Array([1, 2, 1, 2]),
    new Uint32Array([1, 2, 1, 2]), new Float32Array([1, 2, 1, 2]),
    new Float64Array([1, 2, 1, 2]), new Int8Array([1, 2, 1, 2]),
    new Uint8ClampedArray([1, 2, 1, 2]), new BigInt64Array([1n, 2n, 1n, 2n])];
  const dataView = new DataView(new ArrayBuffer(4));dataView[0] = 1;dataView[3] = 2;variants.push(dataView);
  for (const grid of variants) {
    Object.setPrototypeOf(grid, Uint8Array.prototype);
    Object.defineProperty(grid, Symbol.toStringTag, { value: 'Uint8Array' });
    const p = make(4);p.grid = grid;exact(p, 'disguised storage initial scan');
    assert.equal(p._s3CoverageIndex.replay, undefined, 'intrinsic non-Uint8 storage falls back');
    grid[0] = typeof grid[0] === 'bigint' ? 2n : 2;notePaintMutation(p, true);exact(p, 'disguised storage mutation');
  }
  const shared = new SharedArrayBuffer(4), grid = new Uint8Array(shared);grid.set([1, 2, 1, 2]);
  Object.setPrototypeOf(shared, ArrayBuffer.prototype);
  const p = make(4);p.grid = grid;exact(p, 'disguised SharedArrayBuffer');
  assert.equal(p._s3CoverageIndex.replay, undefined);
  grid[0] = 2;notePaintMutation(p, true);exact(p, 'disguised SharedArrayBuffer mutation');
});

test('Proxy, custom arrays, SharedArrayBuffer, resizable, unaligned and detached storage keep the original full path', () => {
  const variants = [Array.from(make(32).grid), new Uint8Array(new ArrayBuffer(33), 1, 32),
    new Uint8Array(new SharedArrayBuffer(32)), new Uint8Array(new ArrayBuffer(32, { maxByteLength: 64 }))];
  class Custom extends Uint8Array { get buffer() { throw Error('custom buffer getter must not run'); } }
  variants.push(new Custom(32));
  const own = new Uint8Array(32); Object.defineProperty(own, 'buffer', { get() { throw Error('own buffer getter must not run'); } }); variants.push(own);
  let reads = 0; const data = Array.from(make(32).grid);
  variants.push(new Proxy(data, { get(target, key) { if (/^\d+$/.test(String(key))) reads++; return target[key]; } }));
  for (const grid of variants) {
    const p = make(32); p.grid = grid; exact(p); assert.equal(p._s3CoverageIndex.replay, undefined);
    grid[3] = 2; notePaintMutation(p, true); exact(p);
  }
  assert.ok(reads >= 128, 'custom numeric reads retain the full reference behavior');
  const p = make(32); exact(p); structuredClone(p.grid.buffer, { transfer: [p.grid.buffer] });
  notePaintMutation(p, true); exact(p, 'detached original grid');
});

test('public array/property accessors retain baseline read order, output and callback side effects', () => {
  function run(api) {
    class AccessorPaint {} api.installScoring({ PaintSystem: AccessorPaint });
    const p = Object.assign(new AccessorPaint(), make(32)), reads = [], outputs = [];
    const values = { grid: p.grid, dead: p.dead, paintFaces: p.paintFaces, version: p.version };
    const grid = values.grid;
    values.grid = new Proxy(Array.from(grid), { get(target, key) {
      if (/^\d+$/.test(String(key))) reads.push('cell ' + key);
      return target[key];
    } });
    for (const key of Object.keys(values)) Object.defineProperty(p, key, {
      get() { reads.push(key); return values[key]; }, set(value) { values[key] = value; }, configurable: true,
    });
    outputs.push(p.coverage()); values.grid[2] = 2;
    api.notePaintMutation(p, true); outputs.push(p.coverage());
    values.grid[0] = 2; api.notePaintMutation(p, false); outputs.push(p.coverage());
    p.version++; outputs.push(p.coverage());
    return { reads, outputs };
  }
  assert.deepEqual(run({ installScoring, notePaintMutation }), run(baseline));
});

test('exceptional binary64 weights retain the baseline sum after prefix replay', () => {
  for (const weight of [0, -0, Number.MIN_VALUE, 2 ** -700, 2 ** 700, Infinity, NaN]) {
    const p = make(); p.paintFaces = [face(0, 4096, .1, .3), face(4096, 4096, weight, 1, 1)];
    exact(p); p.grid[8100] = 2; notePaintMutation(p, true); exact(p);
    p.grid[0] = 2; p.grid[8190] = 2; notePaintMutation(p, true); exact(p);
  }
});

test('composed body callbacks preserve reentry and silent earlier edits before the known publication', async () => {
  const f = await fixture({ productionComposition: true }); installScoring({ PaintSystem: f.PaintSystem });
  for (const hook of ['_inkMark', '_inkMarkRow', '_paintClaimPreparedCell']) {
    const p = Object.assign(Object.create(f.PaintSystem.prototype), make());
    p.paintFaces = [{ ...face(0, 8192), nu: 128, nv: 64, cu: .25, cv: .25 }];
    p.counts = [4096, 4096]; p.level = { native: false }; exact(p); const published = p.coverage();
    if (hook !== '_inkMarkRow') p._inkMarkRow = null;
    const original = p[hook]; let called = 0;
    p[hook] = function (...args) {
      called++;
      if (called === 1) {
        p.grid[0] = 2;
        assert.deepEqual(p.coverage(), published, 'a versionless in-flight callback retains the previous published snapshot');
        p.grid[2] = 2; p.version++;
        exact(p, 'callback explicitly publishing a version before reentry');
        // A second silent earlier change occurs after that reentrant snapshot.
        p.grid[4] = 2;
      }
      return original ? original.apply(this, args) : undefined;
    };
    p._cpuSplat(p.paintFaces[0], 26, 13, 1, 1, .37, 1, 0, 0, 0);
    assert.ok(called, hook + ' callback was exercised'); exact(p, hook + ' final publication');
  }
});
