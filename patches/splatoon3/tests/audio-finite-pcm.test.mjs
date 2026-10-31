import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { isFinitePCM, hasFiniteAudioBufferPCM } from '../runtime/audio/finite-pcm.mjs';
import { AuthorizedSamplePack } from '../runtime/audio/authorized-samples.mjs';
import { WeaponSoundBank } from '../runtime/audio/bank.mjs';
import { renderSound } from '../runtime/audio/render.mjs';
import { WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';
import { TEX, texture, hasTexture, publishTexturePCM, renderTexturePCM } from '../runtime/audio/grain-texture.mjs';
import { ReverbPrewarm } from '../runtime/audio/reverb-prewarm.mjs';
import { renderReverbPair } from '../runtime/audio/reverb-impulse.mjs';
import { PitchPreservingChargeCache, stretchChargerPCM } from '../runtime/audio/pitch-preserving-charge.mjs';
import { chargerRiseBuffer, chargerRecordedStatus, disposeChargerRise } from '../runtime/audio/charger-charge-rise.mjs';
import { spinnerPreload, spinnerCached, spinnerReleaseCache, spinnerCacheStats } from '../runtime/audio/spinner-charge-clips.mjs';

const invalid = [NaN, Infinity, -Infinity];
const bytes = pcm => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
function context() {
  return { sampleRate: 8000, state: 'running', allocations: 0,
    createBuffer(channels, length, sampleRate) {
      this.allocations++;
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
        getChannelData: channel => data[channel] };
    } };
}
const response = () => ({ ok: true, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(20000) });
const manifest = clips => ({ schema: 1, usageRights: 'Synthetic test recording owned by the test', clips });
const worker = () => ({ postMessage(job) { this.job = job; }, terminate() { this.terminated = true; } });

test('finite PCM validation preserves every finite bit and checks every decoded channel', () => {
  const pcm = new Float32Array([0, -0, .25, -2, 3.4028234663852886e38, -3.4028234663852886e38]);
  const before = Buffer.from(bytes(pcm));
  assert.equal(isFinitePCM(pcm), true);
  assert(bytes(pcm).equals(before));
  const ctx = context(), buffer = ctx.createBuffer(2, pcm.length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) buffer.getChannelData(c).set(pcm);
  assert.equal(hasFiniteAudioBufferPCM(buffer), true);
  assert(bytes(buffer.getChannelData(1)).equals(before));
  for (const value of invalid) for (const c of [0, 1]) for (const index of [0, 3, pcm.length - 1]) {
    buffer.getChannelData(c)[index] = value;
    assert.equal(hasFiniteAudioBufferPCM(buffer), false);
    buffer.getChannelData(c)[index] = pcm[index];
  }
  for (const malformed of [null, {}, { ...buffer, getChannelData: undefined },
    { ...buffer, getChannelData: () => new Float32Array(1) },
    { ...buffer, getChannelData() { throw Error('lost channel'); } }]) {
    assert.equal(hasFiniteAudioBufferPCM(malformed), false);
  }
  assert.equal(isFinitePCM(new Float32Array()), false);
  assert.equal(isFinitePCM([0, 1]), false);
  const foreign = vm.runInNewContext('new Float32Array([0, -0, .25])');
  assert.equal(foreign instanceof Float32Array, false);
  assert.equal(isFinitePCM(foreign), true);
  assert.equal(hasFiniteAudioBufferPCM({ length: foreign.length, numberOfChannels: 1, getChannelData: () => foreign }), true);
  foreign[2] = NaN;
  assert.equal(isFinitePCM(foreign), false);
  const spoofed = new Uint32Array([1]);
  Object.defineProperty(spoofed, Symbol.toStringTag, { value: 'Float32Array' });
  assert.equal(isFinitePCM(spoofed), false);
});

test('decoded imports reject non-finite one-shots and loops before publishing or repairing them', async () => {
  for (const value of invalid) for (const [id, event] of [['shooter', 'fire'], ['roller', 'roll']]) {
    const ctx = context(), original = ctx.createBuffer(2, 800, ctx.sampleRate);
    original.getChannelData(1).fill(.25);
    let decoded = original;
    ctx.decodeAudioData = async () => decoded;
    const pack = new AuthorizedSamplePack(ctx, { fetcher: async () => response() });
    const clip = { id, event, file: 'finite.wav', seamlessLoop: false };
    assert.equal((await pack.load(manifest([clip]))).loaded, 1);
    const resident = pack.pick(id, event);
    decoded = ctx.createBuffer(2, 800, ctx.sampleRate);
    decoded.getChannelData(1)[event === 'roll' ? 0 : 799] = value;
    const allocations = ctx.allocations;
    const result = await pack.load(manifest([{ id, event, file: 'invalid.wav' }]), { replace: false });
    assert.equal(result.loaded, 0);
    assert.equal(result.rejected, 1);
    assert.match(result.errors[0].error, /Invalid decoded sample/);
    assert.equal(result.repairedLoops, 0);
    assert.equal(ctx.allocations, allocations, 'invalid loop never reaches repair allocation');
    assert.equal(pack.pick(id, event), resident);
    assert.equal(resident.buffer, original);
    assert.equal(original.getChannelData(1)[799], .25);
    assert.equal(pack.pending, 0);
    pack.clear();
  }
});

test('decoded imports reject metadata-only decoder results', async () => {
  const ctx = context();
  ctx.decodeAudioData = async () => ({ length: 800, duration: .1, sampleRate: 8000, numberOfChannels: 1 });
  const pack = new AuthorizedSamplePack(ctx, { fetcher: async () => response() });
  const result = await pack.load(manifest([{ id: 'shooter', event: 'fire', file: 'invalid.wav' }]));
  assert.equal(result.loaded, 0);
  assert.equal(result.rejected, 1);
  assert.equal(pack.loaded.size, 0);
});

test('authored worker poison follows existing failure cleanup and retains exact finite fallback', () => {
  for (const value of invalid) {
    const ctx = context(), renderWorker = worker();
    const bank = new WeaponSoundBank(ctx, { workerFactory: () => renderWorker });
    bank.warm('shooter', { events: ['fire'] });
    const job = bank.inFlight, pcm = new Float32Array(800);
    pcm[400] = value;
    bank._pump = () => {}; // Inspect the failed job before the existing timer fallback drains it.
    renderWorker.onmessage({ data: { key: job[3], pcm } });
    assert.equal(bank.cache.size, 0);
    assert.equal(ctx.allocations, 0);
    assert.equal(bank.workerFailed, true);
    assert.equal(renderWorker.terminated, true);
    assert.equal(bank.worker, null);
    assert.equal(bank.inFlight, null);
    assert.equal(bank.jobs[0], job);
    const fallback = bank.get(...job.slice(0, 3));
    assert(bytes(fallback.getChannelData(0)).equals(bytes(renderSound(WEAPON_AUDIO[job[0]], job[1], job[2], ctx.sampleRate))));
    bank.dispose();
  }
});

test('grain publication rejects poison without allocating and retains the original finite buffer', () => {
  for (const value of invalid) {
    const ctx = context(), pcm = new Float32Array(TEX.bubbles.dur * ctx.sampleRate);
    pcm[pcm.length - 1] = value;
    assert.equal(publishTexturePCM(ctx, 'bubbles', pcm), false);
    assert.equal(hasTexture(ctx, 'bubbles'), false);
    assert.equal(ctx.allocations, 0);
    const fallback = texture(ctx, 'bubbles');
    assert(bytes(fallback.getChannelData(0)).equals(bytes(renderTexturePCM(ctx.sampleRate, 'bubbles'))));
    assert.equal(publishTexturePCM(ctx, 'bubbles', pcm), false);
    assert.equal(texture(ctx, 'bubbles'), fallback);
    assert.equal(ctx.allocations, 1);
  }
});

test('reverb prewarm rejects poison in either recipe and ear and leaves synchronous fallback available', () => {
  for (const value of invalid) for (const recipe of [0, 1]) for (const ear of [0, 1]) {
    const ctx = context(), renderWorker = worker();
    const warm = new ReverbPrewarm({ sampleRate: ctx.sampleRate, workerFactory: () => renderWorker });
    const pair = renderReverbPair(ctx.sampleRate);
    pair[recipe][ear][pair[recipe][ear].length - 1] = value;
    renderWorker.onmessage({ data: { ...renderWorker.job, pair } });
    assert.equal(renderWorker.terminated, true);
    assert.equal(warm.pair, null);
    assert.equal(warm.take(ctx), null);
    assert.equal(ctx.allocations, 0);
  }
});

test('WSOLA rejects poisoned public source channels including its unchanged-duration shortcut', () => {
  for (const value of invalid) for (const ratio of [1, .7, 1.65]) {
    const channels = [new Float32Array(800), new Float32Array(800)];
    channels[1][400] = value;
    assert.throws(() => stretchChargerPCM(channels, 8000, ratio), /Invalid Charger time stretch arguments/);
    assert.equal(channels[1][400], value);
  }
});

test('WSOLA source and worker publication reject poison while retaining an earlier ready conversion', () => {
  for (const value of invalid) {
    const ctx = context(), renderWorker = worker(), source = ctx.createBuffer(2, 800, ctx.sampleRate);
    let created = 0;
    const cache = new PitchPreservingChargeCache(ctx, { workerFactory: () => { created++; return renderWorker; } });
    source.getChannelData(1)[400] = value;
    assert.equal(cache.prepare('charger', source, .7), false);
    assert.equal(created, 0);
    source.getChannelData(1)[400] = .25;
    assert.equal(cache.prepare('charger', source, .7), true);
    let job = renderWorker.job;
    const finite = stretchChargerPCM(job.samples, job.sampleRate, job.ratio);
    renderWorker.onmessage({ data: { ...job, samples: finite } });
    const before = cache.lookup('charger', source, .7);
    assert(before);
    for (let c = 0; c < 2; c++) assert(bytes(before.getChannelData(c)).equals(bytes(finite[c])));
    assert.equal(cache.prepare('charger', source, 1.2), true);
    job = renderWorker.job;
    const samples = stretchChargerPCM(job.samples, job.sampleRate, job.ratio);
    samples[1][samples[1].length - 1] = value;
    const allocations = ctx.allocations;
    renderWorker.onmessage({ data: { ...job, samples } });
    assert.equal(cache.stats().pending, 0);
    assert.equal(cache.stats().ready, 1);
    assert.equal(cache.lookup('charger', source, 1.2), null);
    assert.equal(cache.lookup('charger', source, .7), before);
    assert.equal(ctx.allocations, allocations);
    cache.dispose();
  }
});

test('recorded Charger decoder rejects non-finite channels before marking the recording ready', async () => {
  for (const value of invalid) {
    const ctx = context(), source = ctx.createBuffer(2, 16000, ctx.sampleRate);
    source.getChannelData(1)[15999] = value;
    ctx.decodeAudioData = async () => source;
    assert.equal(await chargerRiseBuffer(ctx, { fetcher: async () => response() }), null);
    assert.equal(chargerRecordedStatus(ctx).ready, false);
    assert.match(chargerRecordedStatus(ctx).error, /format mismatch/);
    disposeChargerRise(ctx);
  }
});

test('current Spinner clips reject non-finite decodes and preserve valid high-rate PCM', async t => {
  t.mock.method(globalThis, 'fetch', async () => response());
  for (const value of invalid) {
    const ctx = context(), source = ctx.createBuffer(2, 24000, ctx.sampleRate);
    source.getChannelData(1)[23999] = value;
    ctx.decodeAudioData = async () => source;
    const engine = { ctx };
    await assert.rejects(spinnerPreload(engine, 'splatling'), /Spinner charge PCM invalid/);
    assert.equal(spinnerCached(engine, 'splatling'), null);
    assert.equal(source.getChannelData(1)[23999], value, 'invalid decoded samples are not rewritten');
    spinnerReleaseCache(engine);
  }
  const ctx = context(), highRate = ctx.createBuffer(2, 384000, 192000);
  ctx.sampleRate = 192000;
  ctx.decodeAudioData = async () => highRate;
  const engine = { ctx };
  assert.equal(await spinnerPreload(engine, 'splatling'), highRate);
  assert.equal(spinnerCached(engine, 'splatling'), highRate,
    'preserve finite 192kHz PCM within the existing strict 3 MiB cache limit');
  spinnerReleaseCache(engine);
});

// Main bee246c (#1989), retained by bdf5083, reserves three stereo seconds
// at the actual context rate with the unchanged 3 MiB minimum. The previous
// 409600-frame positive fixture is inside that committed 192kHz bound.
// Preserve its exact input; calculate edge/rejection fixtures independently.
test('Spinner retains the original high-rate fixture inside the committed rate-scaled bound', async () => {
  const ctx = context(), original = ctx.createBuffer(2, 409600, 192000);
  ctx.sampleRate = 192000;
  ctx.decodeAudioData = async () => original;
  const engine = { ctx };
  assert.equal(original.length * original.numberOfChannels * 4, 3276800);
  assert.equal(spinnerCacheStats(engine).limit, Math.max(3 * 1024 * 1024, Math.ceil(ctx.sampleRate * 3) * 2 * Float32Array.BYTES_PER_ELEMENT));
  assert.equal(await spinnerPreload(engine, 'splatling', { fetcher: async () => response() }), original);
  assert.equal(spinnerCached(engine, 'splatling'), original);
  assert.equal(spinnerCacheStats(engine).bytes, 3276800);
  spinnerReleaseCache(engine);
});

test('Spinner accepts exactly one committed stereo reservation without raising its bound', async () => {
  const ctx = context(); ctx.sampleRate = 192000;
  const limit = Math.max(3 * 1024 * 1024, Math.ceil(ctx.sampleRate * 3) * 2 * Float32Array.BYTES_PER_ELEMENT);
  const decoded = ctx.createBuffer(2, limit / (2 * Float32Array.BYTES_PER_ELEMENT), ctx.sampleRate);
  ctx.decodeAudioData = async () => decoded;
  const engine = { ctx };
  assert.equal(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT, limit);
  assert.equal(spinnerCacheStats(engine).limit, limit);
  assert.equal(await spinnerPreload(engine, 'splatling', { fetcher: async () => response() }), decoded);
  assert.equal(spinnerCached(engine, 'splatling'), decoded);
  assert.equal(spinnerCacheStats(engine).bytes, limit);
  spinnerReleaseCache(engine);
});

for (const kind of ['one-frame-over-bound', 'nonfinite-high-rate-channel', 'inconsistent-channel-length'])
  test('Spinner rate-scaled publication rejects ' + kind, async () => {
    const ctx = context(); ctx.sampleRate = 192000;
    const limit = Math.max(3 * 1024 * 1024, Math.ceil(ctx.sampleRate * 3) * 2 * Float32Array.BYTES_PER_ELEMENT);
    const length = limit / (2 * Float32Array.BYTES_PER_ELEMENT) + (kind === 'one-frame-over-bound' ? 1 : 0);
    const decoded = ctx.createBuffer(2, length, ctx.sampleRate);
    const channel1 = decoded.getChannelData(1);
    if (kind === 'nonfinite-high-rate-channel') channel1[length - 1] = NaN;
    if (kind === 'inconsistent-channel-length') {
      const channels = [decoded.getChannelData(0), channel1.subarray(0, length - 1)];
      decoded.getChannelData = channel => channels[channel];
    }
    ctx.decodeAudioData = async () => decoded;
    const engine = { ctx };
    assert.equal(spinnerCacheStats(engine).limit, limit);
    assert.equal(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
      limit + (kind === 'one-frame-over-bound' ? 2 * Float32Array.BYTES_PER_ELEMENT : 0));
    await assert.rejects(spinnerPreload(engine, 'splatling', { fetcher: async () => response() }),
      kind === 'one-frame-over-bound' ? /oversized decoded Spinner/ : /Spinner charge PCM invalid/);
    assert.equal(spinnerCached(engine, 'splatling'), null);
    assert.deepEqual(spinnerCacheStats(engine), { bytes: 0, limit, entries: 0, pending: 0 });
    if (kind === 'nonfinite-high-rate-channel') assert.equal(channel1[length - 1], NaN, 'invalid PCM is not repaired or published');
    spinnerReleaseCache(engine);
  });
