import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameTimingProbe } from '../range-frame-profiler.mjs';

function fixture() {
  let timingReads = 0, frames = 0, updates = 0, observed = 0, disconnected = 0;
  const game = {
    match: { update() { updates++; return 23; } },
    _frame(dt) { frames++; assert.equal(this.match.update(dt), 23); return dt; },
  };
  const originals = { frame: game._frame, update: game.match.update };
  class Observer {
    static supportedEntryTypes = ['longtask'];
    constructor() {}
    observe() { observed++; }
    disconnect() { disconnected++; }
  }
  const env = { __G: {}, PerformanceObserver: Observer };
  return { game, env, originals, now: () => ++timingReads,
    counts: () => ({ timingReads, frames, updates, observed, disconnected }) };
}

test('disposing before the lazy tracer import settles never installs instrumentation', async () => {
  const f = fixture();
  const probe = createFrameTimingProbe({ ...f });
  try {
    probe.dispose();
    assert.equal(f.env.__inkwaveRangePerf, undefined);
    const ready = await probe.ready;
    assert.strictEqual(f.game._frame, f.originals.frame, 'a disposed probe must not wrap the live frame owner');
    assert.strictEqual(f.game.match.update, f.originals.update);
    assert.equal(ready, null);
    assert.equal(probe.snapshot().trace, null);
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) assert.equal(f.game._frame(dt), dt);
    assert.deepEqual(f.counts(), { timingReads: 0, frames: 3, updates: 3, observed: 0, disconnected: 0 });
  } finally { probe.dispose(); }
});

test('repeated disposal while import is pending does not resurrect a profiler', async () => {
  const f = fixture(), probe = createFrameTimingProbe({ ...f });
  try {
    probe.dispose(); probe.dispose();
    await probe.ready;
    probe.dispose(); probe.dispose();
    assert.strictEqual(f.game._frame, f.originals.frame);
    assert.strictEqual(f.game.match.update, f.originals.update);
    assert.deepEqual(f.counts(), { timingReads: 0, frames: 0, updates: 0, observed: 0, disconnected: 0 });
  } finally { probe.dispose(); }
});

test('an obsolete pending probe does not remain underneath its replacement', async () => {
  const f = fixture(), obsolete = createFrameTimingProbe({ ...f });
  obsolete.dispose();
  const replacement = createFrameTimingProbe({ ...f });
  try {
    const [oldReady, newReady] = await Promise.all([obsolete.ready, replacement.ready]);
    assert.equal(oldReady, null);
    assert.ok(newReady);
    assert.strictEqual(f.env.__inkwaveRangePerf, replacement);
    obsolete.dispose();
    assert.strictEqual(f.env.__inkwaveRangePerf, replacement, 'obsolete disposal must not clear the current probe');
    f.game._frame(1 / 60); replacement.record(100, 2);
    assert.equal(replacement.snapshot().trace.capturedFrames, 1);
    replacement.dispose();
    assert.strictEqual(f.game._frame, f.originals.frame);
    assert.strictEqual(f.game.match.update, f.originals.update);
    const before = f.counts().timingReads;
    f.game._frame(1 / 120);
    assert.equal(f.counts().timingReads, before, 'replacement disposal must leave no old timing wrapper');
  } finally { replacement.dispose(); obsolete.dispose(); }
});

test('normal ready, attributed frames and repeated disposal preserve exact bindings', async () => {
  const f = fixture(), probe = createFrameTimingProbe({ ...f });
  try {
    const tracer = await probe.ready;
    assert.ok(tracer);
    assert.notStrictEqual(f.game._frame, f.originals.frame);
    for (const [i, dt] of [1 / 30, 1 / 60, 1 / 120].entries()) {
      assert.equal(f.game._frame(dt), dt);
      probe.record(100 + i * 20, 2, { phase: 'battle', frameRateHz: 60 });
    }
    assert.equal(probe.snapshot().trace.capturedFrames, 3);
    assert.equal(probe.snapshot().trace.latest.methodCalls.simulation, 1);
    assert.equal(f.counts().observed, 1);
    probe.dispose(); probe.dispose();
    assert.strictEqual(f.game._frame, f.originals.frame);
    assert.strictEqual(f.game.match.update, f.originals.update);
    assert.equal(f.counts().disconnected, 1);
    const before = f.counts().timingReads;
    f.game._frame(1 / 60);
    assert.equal(f.counts().timingReads, before, 'disposal removes timing overhead from future game frames');
    assert.equal(f.env.__inkwaveRangePerf, undefined);
  } finally { probe.dispose(); }
});

test('a probe without a game does not install a tracer or read a timing source', async () => {
  const f = fixture(), probe = createFrameTimingProbe({ env: f.env, now: f.now });
  assert.equal(await probe.ready, null);
  probe.callback(1 / 60); probe.record(100, 3); probe.skipped();
  assert.equal(probe.snapshot().trace, null);
  assert.equal(probe.snapshot().gpuTimeMs, 'unmeasured');
  assert.equal(probe.snapshot().capSkips, 1);
  probe.dispose(); probe.dispose();
  assert.strictEqual(f.game._frame, f.originals.frame);
  assert.deepEqual(f.counts(), { timingReads: 0, frames: 0, updates: 0, observed: 0, disconnected: 0 });
  assert.equal(f.env.__inkwaveRangePerf, undefined);
});

test('disposed probe does not overwrite a later frame owner or current global probe', async () => {
  const f = fixture(), probe = createFrameTimingProbe({ ...f });
  try {
    await probe.ready;
    f.game._frame(1 / 60); probe.record(100, 2);
    const newerFrame = () => 47, newerProbe = { owner: 'replacement' };
    f.game._frame = newerFrame;
    f.env.__inkwaveRangePerf = newerProbe;
    probe.dispose();
    assert.strictEqual(f.game._frame, newerFrame);
    assert.strictEqual(f.env.__inkwaveRangePerf, newerProbe);
    assert.strictEqual(f.game.match.update, f.originals.update);
  } finally { probe.dispose(); }
});

test('invalid game still reports the existing optional tracer error', async () => {
  const probe = createFrameTimingProbe({ env: {}, game: {} });
  try {
    assert.equal(await probe.ready, null);
    assert.match(probe.snapshot().traceError, /Game\._frame required/);
    assert.equal(probe.snapshot().trace, null);
  } finally { probe.dispose(); }
});

test('native ray, box and capsule counters retain inclusive attribution and zero-ray work', async () => {
  const f = fixture();
  const source = {
    queryCount: 0, triangleTests: 0,
    ray() { this.queryCount++; this.triangleTests += 7; return 19; },
    queryBox() { return 11; }, _capsuleDistance() { return 13; },
  };
  const physics = {
    raycast() { return source.ray(); },
    groundProbe() { return this.raycast(); },
    _nativeContacts() { return source.queryBox() + source._capsuleDistance(); },
  };
  let withRay = true;
  f.game.match.update = function () {
    if (withRay) assert.equal(physics.groundProbe(), 19);
    assert.equal(physics._nativeContacts(), 24);
    return 23;
  };
  const originals = [source.ray, source.queryBox, source._capsuleDistance, physics.groundProbe];
  f.env.__G = { level: { native: true, triangleWorld: source }, physics, match: f.game.match };
  const probe = createFrameTimingProbe({ ...f });
  try {
    await probe.ready;
    for (const rays of [true, false]) {
      withRay = rays;
      assert.equal(f.game._frame(1 / 60), 1 / 60); probe.record(rays ? 100 : 120, 4);
      const row = probe.snapshot().trace.latest;
      assert.deepEqual(row.sourceBVH, { queries: Number(rays), triangleTests: Number(rays) * 7 });
      assert.equal(row.methodCalls['source-box'], 1);
      assert.equal(row.methodCalls['source-capsule-distance'], 1);
      assert.equal(row.stages['source-capsule-distance'], undefined, 'deep capsule queries remain count-only');
      if (rays) {
        assert.equal(row.methodCalls['source-ray'], 1);
        assert.ok(row.stages['ground-ring'] > row.stages['physics-ray']);
        assert.ok(row.stages['physics-ray'] > row.stages['source-ray']);
      }
    }
    probe.dispose();
    assert.deepEqual([source.ray, source.queryBox, source._capsuleDistance, physics.groundProbe], originals);
  } finally { probe.dispose(); }
});

test('native counter wrappers preserve exact thrown errors and restore retired stage methods', async () => {
  const f = fixture(), error = new Error('capsule fault');
  const source = { queryCount: 0, triangleTests: 0, _capsuleDistance() { throw error; } };
  const original = source._capsuleDistance;
  f.game._frame = function () { return source._capsuleDistance(); };
  f.env.__G = { level: { native: true, triangleWorld: source } };
  const probe = createFrameTimingProbe({ ...f });
  try {
    await probe.ready;
    assert.throws(() => f.game._frame(1 / 60), e => e === error);
    probe.record(100, 3);
    assert.equal(probe.snapshot().trace.latest.methodCalls['source-capsule-distance'], 1);
    f.env.__G.level = { native: false };
    assert.throws(() => f.game._frame(1 / 60), e => e === error);
    probe.record(120, 3);
    assert.strictEqual(source._capsuleDistance, original);
    assert.equal(probe.snapshot().trace.latest.sourceBVH, null);
    assert.equal(probe.snapshot().trace.latest.methodCalls['source-capsule-distance'], undefined);
  } finally { probe.dispose(); }
});
