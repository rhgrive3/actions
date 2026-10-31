import test from 'node:test';
import assert from 'node:assert/strict';
import { installScoring, floorCoverage, indexedFloorCoverage, notePaintMutation } from '../runtime/scoring.mjs';

class Paint {}
installScoring({ PaintSystem: Paint });
function paint(n = 32768) {
  const p = Object.assign(new Paint(), { grid: new Uint8Array(n), dead: new Uint8Array(n), version: 0, paintFaces: [] });
  for (let at = 0; at < n; at += 256) p.paintFaces.push({ turf: at % 1792 !== 0, grid: at,
    nu: Math.min(256, n - at), nv: 1, cu: (at % 13 + 1) / 7, cv: (at % 17 + 1) / 11, n: { y: .17 + at % 5 } });
  for (let i = 19; i < n; i += 97) p.dead[i] = 1;
  return p;
}

test('published score preserves exact addition order through claims, overwrites, clears and unknown writers', () => {
  const p = paint(); let seed = 723123;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  assert.deepEqual(p.coverage(), floorCoverage(p));
  for (let tick = 0; tick < 900; tick++) {
    for (let write = 0; write < 5; write++) p.grid[Math.floor(random() * p.grid.length)] = Math.floor(random() * 3);
    notePaintMutation(p, true);
    if (tick === 90) { p.grid[5] = 2; p.version++; }
    if (tick === 200 || tick === 400) { p.grid.fill(0); p.version++; }
    if (tick === 300) { p.grid.fill(1); p.version++; }
    if (tick === 600) { p.grid = p.grid.slice(); p.version++; }
    if (tick === 700) { p.grid[331] = 1; notePaintMutation(p, true); }
    assert.deepEqual(p.coverage(), floorCoverage(p), 'tick ' + tick);
  }
});

test('custom face order, direct coverage and bit31/word31 boundaries preserve legacy results', () => {
  for (const order of ['normal', 'reverse', 'duplicates']) {
    const p = paint(2048);
    if (order === 'reverse') p.paintFaces.reverse();
    if (order === 'duplicates') p.paintFaces.push(p.paintFaces[2]);
    for (const cell of [31, 32, 63, 64, 255, 256, 511, 1023, 1024, 1055, 1056, 2047]) p.grid[cell] = cell % 2 + 1;
    assert.deepEqual(p.coverage(), floorCoverage(p));
    for (const cell of [31, 32, 1023, 1024, 2047]) {
      p.grid[cell] = 0; notePaintMutation(p, true); assert.deepEqual(p.coverage(), floorCoverage(p));
    }
    p.grid[700] = 2;
    assert.deepEqual(indexedFloorCoverage(p), floorCoverage(p), 'direct API always reads current values');
  }
});

test('later known publication observes silent earlier writes while in-flight readers retain the published snapshot', () => {
  const p = paint(8192), before = p.coverage();
  p.grid[300] = 2; // Public/extension write without a version publication.
  assert.deepEqual(p.coverage(), before, 'no early publication during a writer callback');
  p.grid[7000] = 1; notePaintMutation(p, true);
  assert.deepEqual(p.coverage(), floorCoverage(p), 'both writes contribute in original weighted order');
  const after = p.coverage();
  p.grid[302] = 1; notePaintMutation(p, false);
  assert.deepEqual(p.coverage(), after, 'wall-only publications retain the turf snapshot');
  notePaintMutation(p, true);
  assert.deepEqual(p.coverage(), floorCoverage(p), 'next turf publication verifies earlier ownership');
});

test('actual production body writer and a reentrant callback preserve exact published coverage', async () => {
  const { fixture } = await import('./source-fixture.mjs');
  // The production composer already includes the queue-render adapter. Applying
  // that adapter again would fail its exact anchors before any writer is tested.
  const f = await fixture({ productionComposition: true });
  installScoring({ PaintSystem: f.PaintSystem });
  const face = { grid: 0, nu: 128, nv: 128, cu: .25, cv: .25, turf: true, n: { y: 1 } };
  const p = Object.assign(Object.create(f.PaintSystem.prototype), { grid: new Uint8Array(16384),
    dead: new Uint8Array(16384), paintFaces: [face], level: { native: false }, counts: [0, 0], version: 0 });
  const plain = value => Array.from(value); p.coverage();
  for (let i = 0; i < 80; i++) {
    p._cpuSplat(face, 2 + (i % 7) * .4, 2 + Math.floor(i / 7) * .3, .35, i % 2, .37, 1, 0, 0, 0);
    assert.deepEqual(plain(p.coverage()), floorCoverage(p));
  }
  assert(p.grid.some(value => value === 1 || value === 2), 'production body actually claims cells');
  const original = p._paintClaimPreparedCell; let calls = 0;
  p._paintClaimPreparedCell = function (...args) {
    if (++calls === 1) {
      p.grid[0] = 2; p.version++;
      assert.deepEqual(plain(p.coverage()), floorCoverage(p), 'explicit reentrant publication is visible');
      p.grid[2] = 1; // Silent change after the reentrant snapshot.
    }
    return original ? original.apply(this, args) : undefined;
  };
  p._cpuSplat(face, 26, 13, 1, 1, .37, 1, 0, 0, 0);
  assert(calls > 0, 'production ownership callback was exercised');
  assert.deepEqual(plain(p.coverage()), floorCoverage(p), 'final publication includes silent callback write');
});
