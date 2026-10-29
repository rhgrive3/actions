import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { directorFixture, directorState, addStrikes, directorEmittedIdentity } from './special-director-parity-fixture.mjs';

if (directorEmittedIdentity) test('actual emitted director, pools and clocks are bound to the selected build', t => {
  assert.equal(Object.keys(directorEmittedIdentity.hashes).length, 7);
  t.diagnostic('SPECIAL_DIRECTOR_EMITTED_RECEIPT ' + JSON.stringify(directorEmittedIdentity));
});
else test('an explicitly selected missing emitted build fails instead of falling back to source', () => {
  const scratch = new URL('../../../.ci-scratch/', import.meta.url); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(fileURLToPath(scratch), 'director-missing-build-'));
  try {
    const fixtureURL = new URL('./special-director-parity-fixture.mjs', import.meta.url).href;
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(fixtureURL)})`],
      { env: { ...process.env, INKWAVE_BUILT_SITE: root }, encoding: 'utf8' });
    assert.notEqual(out.status, 0); assert.match(out.stderr, /inkwave-build\.json|ENOENT/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

for (const minified of (directorEmittedIdentity ? [false] : [false, true])) for (const hz of [30, 60, 120]) {
  const label = (directorEmittedIdentity ? 'actual emitted' : minified ? 'production transform' : 'source') + ' ' + hz + 'Hz';
  test(label + ': six Wail rays preserve endpoints, particles, attributes and RNG through refresh/expiry/restart', t => {
    const before = directorFixture({ old: true, minified }), after = directorFixture({ minified });
    let refreshes = 0;
    try {
      for (let frame = 0; frame < hz * 2; frame++) {
        const gap = frame >= hz && frame < hz + Math.ceil(hz * .2);
        if (!gap) for (let i = 0; i < 6; i++) {
          if (before.director.lasers.has('1:1:' + i)) refreshes++;
          before.laser(i, frame); after.laser(i, frame);
        }
        before.step(1 / hz); after.step(1 / hz);
        assert.deepEqual(directorState(after), directorState(before), label + ' frame ' + frame);
      }
      assert.equal(before.work.clones - after.work.clones, 2 * refreshes, 'two transient clones removed for each live ray refresh');
      assert.ok(refreshes > 0); assert.equal(after.director.errors, 0);
      if (!minified && hz === 60) t.diagnostic(JSON.stringify({ refreshes, clonesBefore: before.work.clones, clonesAfter: after.work.clones }));
    } finally { before.close(); after.close(); }
  });
  test(label + ': three Inkstrike columns preserve complete particle/shape state and use one sin/cos per spray', t => {
    const before = directorFixture({ old: true, minified }), after = directorFixture({ minified });
    try {
      addStrikes(before); addStrikes(after);
      for (let frame = 0; frame < hz; frame++) {
        for (const f of [before, after]) for (const o of f.G.projectiles._s3AllSpecialObjects) {
          o.age = frame / hz; o.currentRadius = .5 + 7 * (frame / hz);
        }
        before.step(1 / hz); after.step(1 / hz);
        assert.deepEqual(directorState(after), directorState(before), label + ' frame ' + frame);
      }
      assert.equal(before.work.sin, after.work.sin * 4, 'same sine reused four times');
      assert.equal(before.work.cos, after.work.cos * 4, 'same cosine reused four times');
      assert.ok(after.work.sin > 0); assert.equal(before.work.rng, after.work.rng);
      if (!minified && hz === 60) t.diagnostic(JSON.stringify({ trigBefore: before.work.sin + before.work.cos, trigAfter: after.work.sin + after.work.cos }));
    } finally { before.close(); after.close(); }
  });
}

test('Wail refresh snapshots both aliased endpoints before writing either; old handles stay owned', () => {
  const before = directorFixture({ old: true }), after = directorFixture();
  try {
    for (const f of [before, after]) f.laser(0, 0);
    const owned = [...after.director.lasers.values()][0], from = owned.from, to = owned.to, drawTo = owned.drawTo;
    for (const f of [before, after]) {
      const r = [...f.director.lasers.values()][0];
      f.DIRECTORS.killerWail.event.call(f.director, f.actor, { action: 'laser', activation: 1, index: 0 }, r.to, r.from);
    }
    assert.deepEqual(directorState(after), directorState(before));
    assert.equal(owned.from, from); assert.equal(owned.to, to); assert.equal(owned.drawTo, drawTo);
  } finally { before.close(); after.close(); }
});

test('uninstrumented fixtures preserve state while using native Math/Vector3 and no RNG spy', () => {
  for (const old of [true, false]) {
    const counted = directorFixture({ old }), plain = directorFixture({ old, instrument: false });
    try {
      for (let frame = 0; frame < 3; frame++) {
        for (let i = 0; i < 6; i++) { counted.laser(i, frame); plain.laser(i, frame); }
        counted.step(1 / 60); plain.step(1 / 60);
      }
      const { rng: _rng, ...state } = directorState(counted);
      const { rng: _plainRng, ...plainState } = directorState(plain);
      assert.deepEqual(plainState, state);
      assert.deepEqual(plain.work, { clones: 0, sin: 0, cos: 0, rng: 0 });
      assert.ok(counted.work.clones > 0 && counted.work.rng > 0);
    } finally { counted.close(); plain.close(); }
  }
});

if (process.env.SPECIAL_DIRECTOR_BENCH === '1') test('serial-only diagnostic benchmark: repeated six-beam Wail event rows', t => {
  const samples = { before: [], after: [] }, fixtures = {
    before: directorFixture({ old: true, instrument: false }), after: directorFixture({ instrument: false }),
  }, counters = { before: directorFixture({ old: true }), after: directorFixture() };
  try {
    for (const f of Object.values(fixtures)) for (let frame = 0; frame < 300; frame++) for (let i = 0; i < 6; i++) f.laser(i, frame);
    for (let repeat = 0; repeat < 11; repeat++) for (const name of (repeat % 2 ? ['after', 'before'] : ['before', 'after'])) {
      const f = fixtures[name], start = performance.now();
      for (let frame = 0; frame < 5000; frame++) for (let i = 0; i < 6; i++) f.laser(i, frame);
      samples[name].push(performance.now() - start);
    }
    // Work counters use separate owners outside every timed window.
    for (const f of Object.values(counters)) for (let frame = 0; frame < 1000; frame++) for (let i = 0; i < 6; i++) f.laser(i, frame);
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    t.diagnostic(JSON.stringify({ scope: 'CPU event observer only; 300 warmup and 5000x6 accepted ray rows per repeat, 11 alternating repetitions; run without concurrent workloads',
      instrumentation: false, counterScope: 'separate untimed 1000x6 accepted ray rows',
      samples, medians: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, median(values)])),
      clones: Object.fromEntries(Object.entries(counters).map(([name, f]) => [name, f.work.clones])) }));
    assert.deepEqual(directorState(fixtures.after), directorState(fixtures.before));
    assert.deepEqual(directorState(counters.after), directorState(counters.before));
    for (const f of Object.values(fixtures)) assert.deepEqual(f.work, { clones: 0, sin: 0, cos: 0, rng: 0 });
  } finally { for (const f of [...Object.values(fixtures), ...Object.values(counters)]) f.close(); }
});
