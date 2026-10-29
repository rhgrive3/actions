/**
 * Charge-onset timing without transposition. The Splat Charger recording is our single shared charge-up rise for ALL
 * Charger-family weapons. Stretch its 1.215s excerpt, never weapon-specific
 * 0.2-0.4s HoldNoise clicks or ready/fire/release recordings.
 * Never stretch fire/ready/release events or synthesize absent recordings.
 *
 * The actual WSOLA work is done in an isolated module Worker at loadout time.
 * Playback uses a ready AudioBuffer at exactly 1x; if preparation fails, the
 * unmodified, authorized recording continues to play without frame-time DSP.
 */

import { audioWorkerDeadline } from './worker-deadline.mjs';
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const CHARGE_REFERENCE_SECONDS = 1; // legacy/base Splat Charger gameplay clock
export const CHARGE_SPEED_LIMITS = Object.freeze({ minRatio: .30, maxRatio: 1.65 });

/** Return null for unknown clocks. Quantize to 60 Hz to bound cache variants. */
export function chargerOnsetRatio(chargeTime) {
  if (!Number.isFinite(chargeTime) || chargeTime <= 0) return null;
  const seconds = Math.round(chargeTime * 60) / 60;
  return clamp(seconds / CHARGE_REFERENCE_SECONDS, CHARGE_SPEED_LIMITS.minRatio, CHARGE_SPEED_LIMITS.maxRatio);
}

/**
 * Pitch-preserving Waveform Similarity Overlap-Add, shared analysis offsets for
 * all channels to retain phase coherence. Strictly offline; never call from a
 * game frame, AudioWorklet callback or sample event.
 * @param {Float32Array[]} channels decoded PCM copied away from AudioBuffer
 * @param {number} sampleRate source sample rate
 * @param {number} ratio desired duration / recorded duration
 * @returns {Float32Array[]} same number of channels, target-length samples
 */
export function stretchChargerPCM(channels, sampleRate, ratio) {
  if (!Array.isArray(channels) || !channels.length || channels.length > 2 ||
      channels.some(a => !(a instanceof Float32Array) || a.length !== channels[0].length) ||
      !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isFinite(ratio) || ratio < CHARGE_SPEED_LIMITS.minRatio || ratio > CHARGE_SPEED_LIMITS.maxRatio) {
    throw new RangeError('Invalid Charger time stretch arguments');
  }
  const sourceFrames = channels[0].length;
  if (sourceFrames < Math.round(sampleRate * .06) || sourceFrames > sampleRate * 3) {
    throw new RangeError('Charger onset duration outside supported range');
  }
  const targetFrames = Math.round(sourceFrames * ratio);
  if (Math.abs(targetFrames - sourceFrames) <= 2) return channels.map(c => c.slice());
  // 23ms grains at 48k: sufficient tonal content for phase-matching, while
  // attacks and the short Bamboo/Quick source still contain multiple grains.
  const grain = Math.min(1024, 1 << Math.floor(Math.log2(sourceFrames / 5)));
  const hop = Math.floor(grain / 2);
  if (grain < 128 || hop < 64 || targetFrames < grain + hop) {
    throw new RangeError('Charger onset too short for a pitch-preserving stretch');
  }
  const search = Math.max(12, Math.min(Math.round(sampleRate * .006), Math.floor(hop * .55)));
  const first = channels[0], weights = new Float32Array(targetFrames);
  const result = channels.map(() => new Float32Array(targetFrames));
  const window = new Float32Array(grain);
  for (let k = 0; k < grain; k++) window[k] = .5 - .5 * Math.cos(2 * Math.PI * k / (grain - 1));
  const lastOutput = targetFrames - grain, lastInput = sourceFrames - grain;
  const positions = [0];
  for (let p = hop; p < lastOutput; p += hop) positions.push(p);
  if (positions.at(-1) !== lastOutput) positions.push(lastOutput);
  let prevIn = 0, prevOut = 0;
  for (let j = 0; j < positions.length; j++) {
    const output = positions[j];
    // Time-domain analysis must reach the original end at the output end.
    const expected = j === 0 ? 0 : j === positions.length - 1 ? lastInput :
      Math.round(output / lastOutput * lastInput);
    let input = expected;
    if (j > 0 && j < positions.length - 1) {
      const overlap = Math.max(0, grain - (output - prevOut));
      const start = Math.max(0, Math.min(lastInput, expected - search), prevIn + 1);
      const end = Math.min(lastInput, expected + search);
      let best = Infinity;
      // Search in the mono reference but always apply the chosen alignment to
      // every channel, avoiding phase drift in decoded stereo samples.
      for (let candidate = start; candidate <= end; candidate += 2) {
        let error = 0, energy = 1e-9;
        for (let k = 0; k < overlap; k += 8) {
          const a = first[prevIn + grain - overlap + k];
          const b = first[candidate + k];
          const diff = a - b;
          error += diff * diff;
          energy += a * a + b * b;
        }
        const d = (candidate - expected) / search;
        const score = error / energy + .035 * d * d;
        if (score < best) { best = score; input = candidate; }
      }
    }
    for (let k = 0; k < grain; k++) {
      const at = output + k, w = window[k];
      weights[at] += w;
      for (let c = 0; c < channels.length; c++) result[c][at] += channels[c][input + k] * w;
    }
    prevIn = input; prevOut = output;
  }
  const fadeFrames = Math.min(Math.floor(sampleRate * .002), Math.floor(targetFrames / 16));
  for (let k = 0; k < targetFrames; k++) {
    const normalization = weights[k] > 1e-5 ? 1 / weights[k] : 0;
    const fade = fadeFrames ? Math.min(1, k / fadeFrames, (targetFrames - 1 - k) / fadeFrames) : 1;
    for (let c = 0; c < result.length; c++) result[c][k] *= normalization * fade;
  }
  return result;
}

/** Bounded, optional, off-thread source-buffer conversions for selected Charger. */
export class PitchPreservingChargeCache {
  constructor(ctx, { workerFactory = null, maxBytes = 2 * 1024 * 1024, workerIdleMs = 10000, workerTimeoutMs = 20000 } = {}) {
    this.ctx = ctx;
    this.workerFactory = workerFactory;
    this.maxBytes = maxBytes;
    this.worker = null;
    this.workerIdle = null;
    this.workerIdleMs = Number.isFinite(workerIdleMs) && workerIdleMs >= 0 ? workerIdleMs : 10000;
    this.workerTimeoutMs = Number.isFinite(workerTimeoutMs) && workerTimeoutMs > 0 ? workerTimeoutMs : 20000;
    this.retryAfter = 0;
    this.workerTimeouts = 0;
    this.unavailable = false;
    this.entries = new Map();
    this.pending = new Map();
    this.bytes = 0;
    this.serial = 0;
    this.disposed = false;
  }
  _key(id, time) {
    const ratio = chargerOnsetRatio(time);
    if (!id || ratio == null || Math.abs(ratio - 1) < .005) return null;
    return { key: `${id}:${Math.round(time * 60)}`, ratio };
  }
  lookup(id, source, chargeTime) {
    if (this.disposed || !source) return null;
    const spec = this._key(id, chargeTime);
    if (!spec) return null;
    const row = this.entries.get(spec.key);
    if (row?.source !== source) return null;
    this.entries.delete(spec.key); this.entries.set(spec.key, row);
    return row.buffer;
  }
  prepare(id, source, chargeTime) {
    const spec = this._key(id, chargeTime);
    if (this.disposed || !spec || !source || !Number.isFinite(source.duration) ||
        source.duration < .06 || source.duration > 3 ||
        source.numberOfChannels < 1 || source.numberOfChannels > 2 ||
        !Number.isFinite(source.sampleRate) ||
        !Number.isFinite(source.length) || !Number.isInteger(source.length) ||
        !this.ctx || this.ctx.state === 'closed') return false;
    const old = this.entries.get(spec.key);
    if (old?.source === source) return true;
    if (this.pending.get(spec.key)?.source === source) return true;
    if (this.pending.size >= 4 || this.unavailable || Date.now() < this.retryAfter) return false;
    if (!this.worker) {
      try {
        if (!this.workerFactory && typeof Worker === 'undefined') return false;
        const worker = this.worker = this.workerFactory ? this.workerFactory() :
          new Worker(new URL('./pitch-preserving-charge-worker.mjs', import.meta.url),
            { type: 'module', name: 'inkwave-charger-stretch' });
        worker.onmessage = ({ data }) => this._complete(data, worker);
        worker.onerror = () => {
          if (this.worker !== worker) return;
          this.unavailable = true; this._clearPending(); this._releaseWorker(worker);
        };
      } catch { this.unavailable = true; return false; }
    }
    clearTimeout(this.workerIdle); this.workerIdle = null;
    try {
      // A transferred AudioBuffer channel would detach the game's decoded
      // source. Transfer independent copies only; the original remains live.
      const samples = Array.from({ length: source.numberOfChannels }, (_, c) =>
        source.getChannelData(c).slice());
      const job = { serial: ++this.serial, source, ratio: spec.ratio, key: spec.key };
      this.pending.get(spec.key)?.cancelDeadline?.();
      this.pending.set(spec.key, job);
      const worker = this.worker;
      worker.postMessage({ serial: job.serial, key: job.key,
        sampleRate: source.sampleRate, ratio: spec.ratio, samples },
        samples.map(channel => channel.buffer));
      if (this.worker === worker && this.pending.get(spec.key) === job) {
        job.cancelDeadline = audioWorkerDeadline(() => !this.disposed && this.worker === worker && this.pending.get(spec.key) === job, () => {
          this.workerTimeouts++;
          this._clearPending(); this._releaseWorker(worker);
          // Retry only on a later explicit prepare; do not resurrect jobs or
          // run WSOLA on the frame thread. Ready buffers remain usable.
          this.retryAfter = Date.now() + 4000;
        }, { timeoutMs: this.workerTimeoutMs });
      }
      return true;
    } catch {
      this.pending.get(spec.key)?.cancelDeadline?.();
      this.pending.delete(spec.key);
      this._retireIdleWorker();
      return false;
    }
  }
  _complete(data, worker) {
    if (this.disposed || worker !== this.worker || !data) return;
    const job = this.pending.get(data.key);
    if (!job || job.serial !== data.serial) return;
    job.cancelDeadline?.();
    this.pending.delete(data.key);
    this._retireIdleWorker();
    const samples = data.samples;
    if (!Array.isArray(samples) || samples.length !== job.source.numberOfChannels ||
        samples.some(ch => !(ch instanceof Float32Array) || ch.length < 1 || ch.length > this.ctx.sampleRate * 5) ||
        samples.some(ch => ch.length !== samples[0].length) ||
        this.ctx.state === 'closed' || this.ctx.sampleRate !== job.source.sampleRate) return;
    const bytes = samples[0].byteLength * samples.length;
    if (bytes > this.maxBytes) return;
    try {
      const output = this.ctx.createBuffer(samples.length, samples[0].length, this.ctx.sampleRate);
      for (let c = 0; c < samples.length; c++) output.getChannelData(c).set(samples[c]);
      const previous = this.entries.get(data.key);
      if (previous) { this.entries.delete(data.key); this.bytes -= previous.bytes; }
      while (this.entries.size && this.bytes + bytes > this.maxBytes) {
        const key = this.entries.keys().next().value, prior = this.entries.get(key);
        this.bytes -= prior.bytes; this.entries.delete(key);
      }
      this.entries.set(data.key, { source: job.source, buffer: output, bytes });
      this.bytes += bytes;
    } catch { /* Retain original recorded sound if context was lost. */ }
  }
  _clearPending() {
    for (const job of this.pending.values()) job.cancelDeadline?.();
    this.pending.clear();
  }
  _releaseWorker(worker = this.worker) {
    if (worker !== this.worker) return;
    clearTimeout(this.workerIdle); this.workerIdle = null; this.worker = null;
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
  }
  _retireIdleWorker() {
    if (this.disposed || !this.worker || this.pending.size || this.workerIdle !== null) return;
    const worker = this.worker;
    this.workerIdle = setTimeout(() => {
      if (this.worker !== worker || this.disposed) return;
      this.workerIdle = null;
      if (!this.pending.size) this._releaseWorker(worker);
    }, this.workerIdleMs);
    this.workerIdle.unref?.();
  }
  stats() { return { ready: this.entries.size, pending: this.pending.size,
    bytes: this.bytes, budget: this.maxBytes, worker: !!this.worker, unavailable: this.unavailable, workerTimeouts: this.workerTimeouts }; }
  dispose() {
    this.disposed = true;
    this._releaseWorker();
    this._clearPending(); this.entries.clear(); this.bytes = 0;
  }
}
