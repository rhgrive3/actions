import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerOnsetRatio, stretchChargerPCM, PitchPreservingChargeCache } from
  '../runtime/audio/pitch-preserving-charge.mjs';

const SR = 48000;
const sine = (seconds, hz, phase = 0) => {
  const data = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < data.length; i++) data[i] = .5 * Math.sin(2 * Math.PI * hz * i / SR + phase);
  return data;
};
const pitchHz = data => {
  let crossings = 0, first = -1, last = -1;
  const start = Math.round(data.length * .16), end = Math.round(data.length * .84);
  for (let i = start + 1; i < end; i++) if (data[i - 1] <= 0 && data[i] > 0) {
    if (first < 0) first = i;
    last = i; crossings++;
  }
  return (crossings - 1) * SR / (last - first);
};
const mockBuffer = (channels, sr = SR) => ({
  length: channels[0].length, duration: channels[0].length / sr,
  sampleRate: sr, numberOfChannels: channels.length,
  getChannelData(n) { return channels[n]; },
});
const mockContext = () => ({ sampleRate: SR, state: 'running',
  createBuffer(n, length, sr) {
    assert.equal(sr, SR);
    return mockBuffer(Array.from({ length: n }, () => new Float32Array(length)), sr);
  },
});
class FakeWorker {
  constructor() { this.terminated = false; this.calls = 0; }
  postMessage(data) {
    this.calls++;
    queueMicrotask(() => {
      if (this.terminated) return;
      let samples;
      try { samples = stretchChargerPCM(data.samples, data.sampleRate, data.ratio); }
      catch { samples = null; }
      this.onmessage?.({ data: { serial: data.serial, key: data.key, samples } });
    });
  }
  terminate() { this.terminated = true; }
}

test('scaling follows 60 Hz weapon charge clocks, but never invents unknown clocks', () => {
  assert.equal(chargerOnsetRatio(1), 1);
  assert.ok(Math.abs(chargerOnsetRatio(.45) - .45) < .001);
  assert.ok(Math.abs(chargerOnsetRatio(20/60) - 1/3) < .001, 'Bamboo 20-frame clock must not clamp to 0.42');
  assert.equal(chargerOnsetRatio(.1), .30);
  assert.equal(chargerOnsetRatio(2), 1.65);
  for (const invalid of [undefined, 0, -1, NaN, Infinity, '0.5'])
    assert.equal(chargerOnsetRatio(invalid), null);
});

test('WSOLA compresses and lengthens an onset without transposing its fundamental', () => {
  for (const [seconds, ratio] of [[1.215, 1/3], [1.215, .75], [1.215, 1.533333], [.2351, 1.6], [.417959, .65]]) {
    const original = sine(seconds, 440);
    const [rendered] = stretchChargerPCM([original], SR, ratio);
    assert.equal(rendered.length, Math.round(original.length * ratio));
    assert.ok(rendered.every(Number.isFinite), 'no NaNs or Infinity');
    assert.ok(Math.max(...rendered) <= 1, 'no clipping on a 0.5-amplitude sine');
    const hz = pitchHz(rendered);
    assert.ok(Math.abs(hz - 440) < 9, `${seconds}s ${ratio}x preserves 440Hz, got ${hz}Hz`);
    assert.ok(Math.abs(rendered[0]) < 1e-6);
    assert.ok(Math.abs(rendered.at(-1)) < 1e-6);
  }
});

test('two identical channels remain coherent with exactly the same analysis offsets', () => {
  const a = sine(.33959, 700, .3);
  const result = stretchChargerPCM([a, a], SR, .6);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], result[1]);
});

test('invalid lengths, ratios, sample rates and channels fail closed', () => {
  const a = sine(.2351, 440);
  assert.throws(() => stretchChargerPCM([], SR, 1.4));
  assert.throws(() => stretchChargerPCM([a], 0, 1.4));
  assert.throws(() => stretchChargerPCM([a], SR, 5));
  assert.throws(() => stretchChargerPCM([sine(.01, 440)], SR, .8));
  assert.throws(() => stretchChargerPCM([a, new Float32Array(1)], SR, .8));
});

test('off-thread cache prepares only recorded onset and returns same-pitch AudioBuffer at 1x', async () => {
  const source = mockBuffer([sine(.2351, 440)]);
  const ctx = mockContext();
  const worker = new FakeWorker();
  const cache = new PitchPreservingChargeCache(ctx, { workerFactory: () => worker });
  assert.equal(cache.lookup('s3-charger-quick', source, .45), null);
  assert.equal(cache.prepare('s3-charger-quick', source, .45), true);
  assert.equal(cache.prepare('s3-charger-quick', source, .45), true, 'same pending job deduped');
  assert.equal(worker.calls, 1);
  await Promise.resolve();
  const converted = cache.lookup('s3-charger-quick', source, .45);
  assert.ok(converted && converted !== source);
  assert.equal(converted.length, Math.round(source.length * .45));
  assert.ok(Math.abs(pitchHz(converted.getChannelData(0)) - 440) < 9);
  assert.equal(source.length, Math.round(.2351 * SR), 'original decoded buffer was never modified');
  assert.equal(cache.lookup('s3-charger-quick', source, 1), null, 'normal charger remains recorded 1x');
  cache.dispose();
  assert.ok(worker.terminated);
  assert.equal(cache.stats().bytes, 0);
});

test('LRU is bounded; stale original sample cannot reuse old transformed source', async () => {
  const ctx = mockContext();
  const cache = new PitchPreservingChargeCache(ctx, { maxBytes: 100000, workerFactory: () => new FakeWorker() });
  const source = mockBuffer([sine(.33959, 523)]);
  for (let i = 0; i < 5; i++) {
    cache.prepare('charger'+i, source, .45 + i*.1);
    await Promise.resolve();
    assert.ok(cache.stats().bytes <= 100000);
  }
  const newSource = mockBuffer([sine(.33959, 523)]);
  assert.equal(cache.lookup('charger4', newSource, .85), null);
  cache.dispose();
});

test('worker absent or disposed retains original sound rather than blocking / synthesizing', async () => {
  const source = mockBuffer([sine(.2351, 440)]);
  const ctx = mockContext();
  const noWorker = new PitchPreservingChargeCache(ctx);
  assert.equal(noWorker.prepare('s3-charger-quick', source, .45), false);
  assert.equal(noWorker.lookup('s3-charger-quick', source, .45), null);
  const worker = new FakeWorker();
  const cache = new PitchPreservingChargeCache(ctx, { workerFactory: () => worker });
  assert.equal(cache.prepare('s3-charger-quick', source, .45), true);
  cache.dispose();
  await Promise.resolve();
  assert.equal(cache.lookup('s3-charger-quick', source, .45), null);
  assert.equal(cache.stats().ready, 0);
});
