import test from 'node:test';
import assert from 'node:assert/strict';
import { roles, rawSession, measureRaw, SPARK } from './booyah-vfx-fixture.mjs';

const HZ = [30, 60, 120, 144, 240];

test('frozen source reproduces callback dependence; elapsed-time recipes preserve the 60 Hz calibration', () => {
  const before = HZ.map(hz => measureRaw(hz, true)), after = HZ.map(hz => measureRaw(hz));
  for (const row of before) assert.ok(Math.abs(row.angle - row.hz * .02) < 6e-6, 'Float32 callback accumulation');
  for (const row of before) for (const key of ['suction', 'scatter', 'flightStars', 'chargedStars']) assert.equal(row[key], row.hz);
  for (const row of after) assert.deepEqual(row, { hz: row.hz, angle: 1.2, suction: 60, scatter: 60, flightStars: 60, chargedStars: 60 });
  console.log('Booyah fixed-phase one-second source measurements', JSON.stringify({ before, after }));
});

test('seeded 60 Hz emissions retain exact arguments, probability trials and random call order', () => {
  for (const role of Object.keys(roles)) {
    const before = rawSession(role, { old: true, seeded: true }), after = rawSession(role, { seeded: true });
    for (let k = 0; k < 180; k++) {
      if (role === 'object') before.o.frameCount = after.o.frameCount = k;
      if (role === 'director') before.a._s3AllSpecialState.charge = after.a._s3AllSpecialState.charge = Math.min(1, k / 80);
      before.step(1 / 60); after.step(1 / 60);
      assert.deepEqual(after.rows, before.rows, role + ' frame ' + k);
      assert.equal(after.calls(), before.calls(), role + ' RNG frame ' + k);
    }
  }
});

test('phase 39/40/41 uses native boundaries and discards fractional suction and burst carry', () => {
  const s = rawSession('object');
  s.o.frameCount = 39; s.step(1 / 240); assert.equal(s.r.particleCarry, .25);
  assert.equal(s.r.d.warn.v[11], Math.fround(.8)); assert.equal(s.r.d.orb.v[11], 1);
  const before = s.rows.length;
  s.o.frameCount = 40; s.step(1 / 240);
  assert.equal(s.r.blasted, true); assert.equal(s.r.d.warn.v[11], 0); assert.equal(s.r.d.orb.v[11], 0);
  assert.equal(s.rows.slice(before).filter(x => x[0] === 'flash').length, 1);
  assert.equal(s.count('drop'), 0);
  s.o.frameCount = 41;
  for (let k = 0; k < 3; k++) s.step(1 / 240);
  assert.equal(s.count('drop'), 0, 'neither previous phase contributes a fractional trial');
  s.step(1 / 240); assert.equal(s.count('drop'), 1);
  assert.equal(s.rows.filter(x => x[0] === 'flash').length, 1, 'burst occurs once');
  assert.equal(s.r.d.warn.v[3], Math.fround(12.6));
});

test('full-charge threshold resets carry without changing the existing full-charge flash', () => {
  const s = rawSession('director');
  s.a._s3AllSpecialState.charge = .99; s.step(1 / 30); assert.equal(s.count(SPARK.STAR), 0);
  s.a._s3AllSpecialState.charge = 1; s.step(1 / 120); assert.equal(s.r.d.starCarry, .5);
  s.a._s3AllSpecialState.charge = .99; s.step(1 / 240); assert.equal(s.r.d.starCarry, 0);
  s.a._s3AllSpecialState.charge = 1; s.step(1 / 120); assert.equal(s.count(SPARK.STAR), 0);
  s.step(1 / 120); assert.equal(s.count(SPARK.STAR), 1);
  assert.equal(s.rows.filter(x => x[0] === 'flash').length, 1);
});

test('zero, invalid and negative dt do not consume fractional opportunities or RNG; huge dt has no particle backlog', () => {
  for (const role of Object.keys(roles)) {
    const s = rawSession(role); s.step(1 / 240);
    const clockState = () => JSON.stringify({ d: s.r.d, carry: s.r.particleCarry, phase: s.r.particlePhase }, (k, v) => k === 'follow' ? undefined : v);
    const rows = s.rows.length, calls = s.calls(), state = clockState();
    for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, '0.1']) s.step(dt);
    assert.equal(s.rows.length, rows); assert.equal(s.calls(), calls); assert.equal(clockState(), state);
    const kind = role === 'object' ? SPARK.STREAK : SPARK.STAR, prior = s.count(kind);
    // Other existing charge rays remain elapsed-time based; scoped star trials are bounded.
    s.step(10); assert.equal(s.count(kind) - prior, 2, role);
    assert.ok((role === 'object' ? s.r.particleCarry : s.r.d.starCarry) < 1);
    s.step(1 / 240); assert.equal(s.count(kind) - prior, 2);
    s.step(1 / 120); assert.equal(s.count(kind) - prior, 3);
  }
});

test('fractional clocks retain ten seconds of jitter without refresh-rate loss or accumulated backlog', () => {
  for (const role of Object.keys(roles)) {
    const s = rawSession(role), kind = role === 'object' ? SPARK.STREAK : SPARK.STAR;
    for (let k = 0; k < 600; k++) { s.step(1 / 240); s.step(1 / 80); }
    assert.equal(s.count(kind), 600, role);
    const far = rawSession('object'); far.o.frameCount = 60; far.r.blasted = true; far.d.near = () => false;
    far.step(10); assert.equal(far.count('drop'), 0);
    far.d.near = () => true; far.step(1 / 240); assert.equal(far.count('drop'), 0, 'no distance backlog');
  }
});

test('fresh records do not inherit fractional opportunities', () => {
  for (const role of Object.keys(roles)) {
    const cancelled = rawSession(role); cancelled.step(1 / 120);
    const fresh = rawSession(role), kind = role === 'object' ? SPARK.STREAK : SPARK.STAR;
    fresh.step(1 / 120); assert.equal(fresh.count(kind), 0);
    fresh.step(1 / 120); assert.equal(fresh.count(kind), 1);
  }
});
