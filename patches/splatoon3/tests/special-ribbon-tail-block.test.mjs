import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRibbonPool, ribbonBaselineSource, ribbonCandidateSource, ribbonAttributes, ribbonBytes, observeRibbonWrites } from './ribbon-tail-fixture.mjs';

function compare(a, b, label) {
  for (const key of ribbonAttributes) {
    assert.deepEqual(ribbonBytes(b, key), ribbonBytes(a, key), label + ' complete ' + key + ' bytes');
    if (key !== 'rib') {
      assert.deepEqual(b[key].updateRanges, a[key].updateRanges, label + ' upload range ' + key);
      assert.equal(b[key].version, a[key].version, label + ' upload version ' + key);
    } else {
      // The later dirty-range optimization uploads only changed rib values.
      // Check every changed element against the still-pending ranges, including
      // ranges left unconsumed across several updates.
      const prev = b._testRib, attr = b.rib;
      let changed = false;
      for (let i = 0; i < attr.array.length; i++) if (!Object.is(prev.values[i], attr.array[i])) {
        changed = true;
        assert.ok(attr.updateRanges.some(r => r.count < 0 || (r.start <= i && i < r.start + r.count)), label + ' missing rib upload at ' + i);
      }
      if (changed) assert.ok(attr.version > prev.version, label + ' changed rib needs upload');
      prev.values = Float32Array.from({length: attr.array.length}, (_, i) => attr.array[i]); prev.version = attr.version;
    }
  }
  assert.deepEqual(b.mesh.geometry.drawRange, a.mesh.geometry.drawRange, label + ' draw range');
  assert.deepEqual(b.mesh.geometry.index.array, a.mesh.geometry.index.array, label + ' indices');
  assert.equal(b._drawCount, a._drawCount); assert.equal(b._emptyUploaded, a._emptyUploaded);
  assert.deepEqual(b.list.map(r => ({ head: r.head, count: r.count, ended: r.ended, pts: r.pts, samples: r.samples, o: r.o })),
    a.list.map(r => ({ head: r.head, count: r.count, ended: r.ended, pts: r.pts, samples: r.samples, o: r.o })), label + ' public records');
  assert.equal(b.rngCalls(), a.rngCalls(), label + ' RNG count');
}
const camera = { x: 4, y: 8, z: 12 };

test('every possible partial tail preserves all five complete Float32 buffers, indices and upload ranges', () => {
  for (const points of [2, 3, 8, 40, 48]) for (const additive of [false, true]) for (let n = 0; n <= points; n++) {
    const a = makeRibbonPool(ribbonBaselineSource, 2, points, additive), b = makeRibbonPool(ribbonCandidateSource, 2, points, additive);
    for (const p of [a, b]) {
      const r = p.start({ life: 10, spacing: .01, flat: n % 2 === 0, alpha: .9, style: n % 3, color: [-0, .7, 2] });
      for (let i = 0; i < n; i++) p.push(r, i / 3, 1 + Math.sin(i), -i / 2, .1);
      p.update(.2, camera); p.update(.3, { x: -6, y: 3, z: 1 });
    }
    compare(a, b, points + ' points/' + n + ' live/' + additive);
  }
});

test('30/60/120Hz moving-camera lifecycles match through coalescing, overflow, expiry, live option edits and clear', () => {
  for (const hz of [30, 60, 120]) {
    const a = makeRibbonPool(ribbonBaselineSource, 3), b = makeRibbonPool(ribbonCandidateSource, 3);
    const handles = [[], []], refs = [];
    for (const p of [a, b]) refs.push(ribbonAttributes.map(key => p[key]));
    for (let frame = 0; frame < hz * 4; frame++) {
      const time = frame / hz, cam = { x: Math.sin(time) * 10, y: 4 + time, z: Math.cos(time) * 12 };
      for (let side = 0; side < 2; side++) {
        const p = side ? b : a, list = handles[side];
        if (frame % Math.max(1, Math.round(hz / 9)) === 0) list.push(p.start({ life: .4, spacing: .2, flat: frame % 3 === 0, style: frame % 3 }));
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          p.push(r, time * 2 + i, 1 + Math.sin(time * 3 + i), Math.cos(time + i), time);
          if (frame % 11 === 0) p.push(r, time * 2 + i + .01, 1 + Math.sin(time * 3 + i), Math.cos(time + i), time);
          if (frame % 13 === 0) { r.o.width = .1 + time / 10; r.o.color[1] = time / 5; }
          if (frame % 17 === 0 && i % 2) p.end(r);
          if (frame % 23 === 0 && r.pts[0]) r.pts[0][0] += .1;
        }
        if (frame === hz * 2) p.clear();
        p.update(time, cam);
      }
      compare(a, b, hz + 'Hz frame ' + frame);
      for (let i = 0; i < 2; i++) assert.deepEqual(ribbonAttributes.map(key => (i ? b : a)[key]), refs[i], 'attributes retain object identity');
    }
  }
});

test('zero/NaN/infinite lifetimes and non-finite coordinates retain the original stored float bytes', () => {
  for (const life of [0, NaN, Infinity]) {
    const a = makeRibbonPool(ribbonBaselineSource), b = makeRibbonPool(ribbonCandidateSource);
    for (const p of [a, b]) {
      const r = p.start({ life, spacing: 0, color: [NaN, -0, Infinity] });
      p.push(r, -0, 0, 0, 0); p.push(r, NaN, Infinity, -Infinity, 0); p.update(0, camera);
    }
    compare(a, b, 'life=' + life);
  }
});

test('partial tails use logarithmic native copies while preserving complete output', () => {
  const a = makeRibbonPool(ribbonBaselineSource, 1), b = makeRibbonPool(ribbonCandidateSource, 1);
  const counts = [observeRibbonWrites(a), observeRibbonWrites(b)];
  for (const p of [a, b]) {
    const r = p.start({ life: 10, spacing: 0 });
    p.push(r, 0, 1, 0, 0); p.push(r, 1, 1, 0, 0); p.update(.1, camera);
  }
  compare(a, b, 'instrumented two-point trail');
  assert.equal(counts[0].scalarWrites, 1724);
  assert.ok(counts[1].scalarWrites < counts[0].scalarWrites / 2, 'tail still reduces scalar writes');
  assert.ok(counts[1].blockCopies > 0 && counts[1].blockCopies <= 35, 'remaining attributes use bounded block copies');
  assert.ok(counts[1].copiedFloats > 0, 'block copies carry padded vertices');
});
