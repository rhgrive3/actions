// One speculative rate only. A ready result is consumed only when the real
// context reports that exact rate; every cold/mismatch path falls back now.
import { isFinitePCM } from './finite-pcm.mjs';
export class ReverbPrewarm {
  constructor({ workerFactory, sampleRate = 48000, ttl = 30000 } = {}) {
    this.sampleRate = sampleRate; this.generation = 1; this.pair = null; this.worker = null;
    if (!workerFactory && typeof Worker === 'undefined') return;
    try {
      const worker = this.worker = workerFactory ? workerFactory() : new Worker(new URL('./reverb-worker.mjs', import.meta.url), { type: 'module', name: 'inkwave-reverb' });
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || data.generation !== this.generation || data.sampleRate !== sampleRate) return;
        const pair = data.pair;
        if (!Array.isArray(pair) || pair.length !== 2 || pair.some((channels, i) =>
          !Array.isArray(channels) || channels.length !== 2 || channels.some(a => !(a instanceof Float32Array) || a.length !== Math.floor(sampleRate * (i ? 2.2 : 1.5)) || !isFinitePCM(a)))) { this.dispose(); return; }
        this.pair = pair; worker.terminate(); this.worker = null;
      };
      worker.onerror = () => this.dispose();
      worker.postMessage({ sampleRate, generation: this.generation });
      this.timer = setTimeout(() => this.dispose(), ttl); this.timer.unref?.();
    } catch { this.dispose(); }
  }
  take(ctx, includeMusic = true) {
    const pair = ctx.sampleRate === this.sampleRate ? this.pair : null;
    this.dispose();
    if (!pair) return null;
    return (includeMusic ? pair : pair.slice(0, 1)).map(channels => {
      const buffer = ctx.createBuffer(2, channels[0].length, ctx.sampleRate);
      buffer.getChannelData(0).set(channels[0]); buffer.getChannelData(1).set(channels[1]);
      return buffer;
    });
  }
  dispose() {
    this.generation++; this.worker?.terminate(); this.worker = null; this.pair = null;
    clearTimeout(this.timer); this.timer = null;
  }
}

export function installReverbPrewarmCleanup(Engine) {
  const dispose = Engine.prototype.disposeWeaponAudio;
  Engine.prototype.disposeWeaponAudio = function (...args) {
    this._reverbPrewarm?.dispose(); this._reverbPrewarm = null;
    return dispose?.apply(this, args);
  };
}
