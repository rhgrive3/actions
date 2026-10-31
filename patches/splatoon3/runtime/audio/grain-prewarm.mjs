import { TEX, hasTexture, publishTexturePCM } from './grain-texture.mjs';
export function cancelGrainPrewarm(engine) {
  const state = engine._grainPrewarm;
  engine._grainWarmGeneration = (engine._grainWarmGeneration || 0) + 1;
  if (!state) return;
  clearTimeout(state.admission); clearTimeout(state.timeout); state.worker?.terminate(); state.worker = null;
  engine._grainPrewarm = null;
}
export function prewarmGrainTextures(engine, fallback, { workerFactory, delay = 60, timeout = 20000 } = {}) {
  if (engine._sfxSilent?.()) { engine._grainWarmDeferred = true; return true; }
  if (!engine.ctx || engine.ctx.state === 'closed' || engine._grainWorkerFailed || (!workerFactory && typeof Worker === 'undefined')) return false;
  if (engine._grainPrewarm?.ctx === engine.ctx) return true;
  cancelGrainPrewarm(engine);
  const ctx = engine.ctx, generation = engine._grainWarmGeneration;
  const state = engine._grainPrewarm = { ctx, generation, worker: null, remaining: null };
  const live = () => !state.done && engine._grainPrewarm === state && engine._grainWarmGeneration === generation && engine.ctx === ctx && ctx.state !== 'closed';
  const finish = () => { state.done = true; clearTimeout(state.timeout); state.worker?.terminate(); state.worker = null; };
  const fail = () => { const retry = live(); finish(); if (retry) { engine._grainWorkerFailed = true; engine._grainPrewarm = null; fallback?.(); } };
  state.admission = setTimeout(() => {
    if (!live()) { finish(); return; }
    if (engine._sfxSilent?.()) { engine._grainWarmDeferred = true; cancelGrainPrewarm(engine); return; }
    const kinds = Object.keys(TEX).filter(kind => !hasTexture(ctx, kind));
    state.remaining = new Set(kinds);
    if (!kinds.length) { finish(); return; }
    try {
      const worker = state.worker = workerFactory ? workerFactory() : new Worker(new URL('./grain-worker.mjs', import.meta.url), { type: 'module', name: 'inkwave-grain' });
      worker.onmessage = ({ data }) => {
        if (!live()) { finish(); return; }
        if (data.generation !== generation || data.sampleRate !== ctx.sampleRate || !state.remaining.has(data.kind)) return;
        try { if (!publishTexturePCM(ctx, data.kind, data.pcm)) { fail(); return; } }
        catch { fail(); return; }
        state.remaining.delete(data.kind);
        if (!state.remaining.size) finish();
      };
      worker.onerror = fail;
      worker.postMessage({ sampleRate: ctx.sampleRate, generation, kinds });
      state.timeout = setTimeout(fail, timeout); state.timeout.unref?.();
    } catch { fail(); }
  }, delay);
  state.admission.unref?.();
  return true;
}
export function installGrainPrewarmCleanup(Engine) {
  const setVolumes = Engine.prototype.setVolumes;
  if (setVolumes) Engine.prototype.setVolumes = function (...args) {
    const result = setVolumes.apply(this, args);
    if (this._sfxSilent?.()) {
      if (this._grainPrewarm && !this._grainPrewarm.done) {
        this._grainWarmDeferred = true; cancelGrainPrewarm(this);
      }
    } else if (this._grainWarmDeferred && this.ctx && this.ctx.state !== 'closed') {
      this._grainWarmDeferred = false; this._warm?.();
    }
    return result;
  };
  const dispose = Engine.prototype.disposeWeaponAudio;
  Engine.prototype.disposeWeaponAudio = function (...args) {
    this._grainWarmDeferred = false; cancelGrainPrewarm(this); return dispose?.apply(this, args);
  };
}
