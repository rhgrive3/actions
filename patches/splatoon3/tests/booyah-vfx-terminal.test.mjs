import test from 'node:test';
import assert from 'node:assert/strict';
import { rawSession, source, terminalFrozen, SPARK } from './booyah-vfx-fixture.mjs';

function rawLifecycle(steps, candidate42 = false, cancelAt = null, seeded = false) {
  const s = rawSession('object', { candidate42, seeded }), { d, r, o } = s;
  const start = source.indexOf('  updateObjects(dt) {'), end = source.indexOf('\n  // ------------------------------------------------------------------ kit specials', start);
  const update = new Function('OBJECT_FX', 'return ({' + (candidate42 ? terminalFrozen.updateObjects : source.slice(start, end)) + '}).updateObjects;')({ booyahBlast: s.recipe });
  o.kind = 'booyahBlast'; o.frameCount = 0; o.dead = false;
  Object.assign(r, { o, age: 0, kind: 'booyahBlast', spec: s.recipe });
  d.objects = new Map([[o, r]]); d.G = { projectiles: { _s3AllSpecialObjects: [o] } };
  d.call = (fn, ...args) => fn?.call(d, ...args);
  d.kit = { ribbons: { end() {} }, glowRibbons: { end() {} } };
  const history = []; let carry = 0;
  for (const dt of steps) {
    const previous = o.frameCount, suction = s.count(SPARK.STREAK), scatter = s.count('drop');
    // Source-method harness: reproduce producer-before-presentation ordering.
    // Actual native Projectiles.update is exercised separately in the composed test.
    carry += dt * 60;
    o.frameCount = Math.min(80, Math.floor(carry + 1e-9));
    if (o.frameCount === 80 || (cancelAt !== null && o.frameCount >= cancelAt)) {
      o.dead = true; d.G.projectiles._s3AllSpecialObjects.length = 0;
    }
    d.time += dt; update.call(d, dt);
    history.push({ previous, frame: o.frameCount, suction: s.count(SPARK.STREAK) - suction, scatter: s.count('drop') - scatter });
  }
  const calls = s.calls(), rows = s.rows.length;
  for (let k = 0; k < 4; k++) update.call(d, 1 / 30);
  assert.equal(s.calls(), calls); assert.equal(s.rows.length, rows, 'deleted records never replay their terminal interval');
  return { s, history, counts: [s.count(SPARK.STREAK), s.count('drop')] };
}

test('preserved 42e8ca source methods retain the negative lifecycle case; corrected methods consume 39/39 at every rate', () => {
  const measurements = [];
  for (const hz of [30, 60, 120, 144, 240]) {
    const steps = Array.from({ length: Math.ceil(80 * hz / 60) }, () => 1 / hz);
    const before = rawLifecycle(steps, true), after = rawLifecycle(steps);
    assert.deepEqual(before.counts, hz === 30 ? [38, 38] : [39, 39]);
    if (hz === 30) assert.notDeepEqual(before.counts, [39, 39], 'the immutable candidate fixture must keep reproducing the defect');
    assert.deepEqual(after.counts, [39, 39]);
    assert.equal(after.s.d.objects.size, 0); assert.equal(after.s.r.d.warn.dead, true); assert.equal(after.s.r.d.orb.dead, true);
    const burst = after.history.find(h => h.previous < 40 && h.frame >= 40);
    assert.equal(burst.suction, hz === 30 ? 1 : 0);
    const terminal = after.history.find(h => h.frame === 80);
    assert.equal(terminal.scatter, hz === 30 ? 1 : 0);
    measurements.push({ hz, before: before.counts, after: after.counts, burst, terminal });
  }
  console.log('Booyah source terminal negative/corrected measurements', JSON.stringify(measurements));
});

test('an interval spanning 40 and 41 bursts then scatters; a terminal interval after observed 79 never replays 79', () => {
  const steps = [...Array(39).fill(1 / 60), 1 / 30, ...Array(38).fill(1 / 60), 1 / 30];
  const { counts, history } = rawLifecycle(steps);
  assert.deepEqual(counts, [39, 39]);
  assert.deepEqual(history.find(h => h.previous === 39 && h.frame === 41), { previous: 39, frame: 41, suction: 0, scatter: 1 });
  assert.deepEqual(history.at(-1), { previous: 79, frame: 80, suction: 0, scatter: 0 });
});

test('the complete 60 Hz producer-before-presentation lifecycle keeps exact seeded arguments and RNG order through cleanup', () => {
  const steps = Array(80).fill(1 / 60);
  const before = rawLifecycle(steps, true, null, true), after = rawLifecycle(steps, false, null, true);
  assert.deepEqual(after.s.rows, before.s.rows);
  assert.equal(after.s.calls(), before.s.calls());
  assert.equal(after.s.d.objects.size, 0); assert.equal(before.s.d.objects.size, 0);
});

test('early cancellation at 39 or 79 never drains the natural-retirement interval', () => {
  for (const cancelAt of [39, 79]) {
    const { s, history } = rawLifecycle(Array(80).fill(1 / 60), false, cancelAt);
    const at = history.find(h => h.frame === cancelAt);
    assert.equal(at.suction + at.scatter, 0);
    assert.equal(s.d.objects.size, 0); assert.equal(s.r.d.warn.dead, true);
    assert.equal(s.count(SPARK.STREAK), cancelAt === 39 ? 38 : 39);
    assert.equal(s.count('drop'), cancelAt === 39 ? 0 : 38);
  }
});

test('source frame 0 never backfills a negative frame, and large terminal dt stays bounded and single-use', () => {
  const s = rawSession('object');
  s.o.frameCount = 0; s.step(1 / 30); assert.equal(s.count(SPARK.STREAK), 1);
  s.o.frameCount = 78; s.r.blasted = true; s.step(1 / 30);
  const before = s.count('drop');
  s.o.frameCount = 80; s.step(10000); assert.equal(s.count('drop'), before + 1);
  const calls = s.calls();
  for (const dt of [0, -1, NaN, Infinity, 10000]) s.step(dt);
  s.o.frameCount = 81; s.step(1 / 30);
  assert.equal(s.calls(), calls);
});
