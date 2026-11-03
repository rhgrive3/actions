// Recorded match cues supplied by the project owner (Google Drive, 2026-11-03).
// They replace three synthesized one-shots by name. Until a recording has been
// fetched and decoded (or if it fails), the original synthesized sound plays, so
// the cue is never silent. Music-like jingles follow the music volume; the result
// meter follows the SFX volume, like the synthesized cues they replace.
//
//  - victory_fanfare: "Victory! – Jingle"
//  - defeat_jingle:   "Defeat – Jingle"
//  - judge_drumroll:  Splatoon 3 UI_VS_ResultMeter_00 (the result meter fill)
//
// The owner supplied these files; distribution rights are the owner's to verify.
const assetURL = name => {
  try { return import.meta.url ? new URL('../../../../assets/audio/' + name, import.meta.url).href : null; }
  catch { return null; }
};
export const MATCH_RECORDINGS = Object.freeze({
  victory_fanfare: Object.freeze({ file: 'result_victory_jingle.mp3', bus: 'music', gain: 0.7, seconds: 5.825, maxBytes: 400 * 1024 }),
  defeat_jingle: Object.freeze({ file: 'result_defeat_jingle.mp3', bus: 'music', gain: 0.7, seconds: 6.922, maxBytes: 400 * 1024 }),
  judge_drumroll: Object.freeze({ file: 'UI_VS_ResultMeter_00.mp3', bus: 'sfx', gain: 1.5, seconds: 2.544, maxBytes: 200 * 1024 }),
});
const INSTALLED = Symbol.for('inkwave.match-recordings.v1');
const LOAD_TIMEOUT_MS = 10000, RETRY_MS = 20000;
const permanent = message => Object.assign(new Error(message), { permanent: true });

function stateOf(engine) {
  return engine._matchRecordings ||= { ctx: null, buffers: new Map(), loading: new Map(), failed: new Map(), voices: new Set() };
}

// Fetch + decode one recording for the engine's current AudioContext.
export function loadMatchRecording(engine, name, { fetcher = engine?._matchRecordingsFetcher || globalThis.fetch?.bind(globalThis), url } = {}) {
  const spec = MATCH_RECORDINGS[name], ctx = engine?.ctx;
  if (!spec || !ctx || ctx.state === 'closed' || typeof ctx.decodeAudioData !== 'function') return Promise.resolve(null);
  const state = stateOf(engine);
  if (state.ctx !== ctx) { state.ctx = ctx; state.buffers.clear(); state.loading.clear(); state.failed.clear(); }
  if (state.buffers.has(name)) return Promise.resolve(state.buffers.get(name));
  if (state.loading.has(name)) return state.loading.get(name);
  // A failed load (network, timeout) may retry after a pause; decode/size
  // mismatches stay failed for this context.
  if (state.failed.has(name) && Date.now() < state.failed.get(name)) return Promise.resolve(null);
  const href = url || assetURL(spec.file);
  if (!fetcher || !href) return Promise.resolve(null);
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => abort?.abort(), LOAD_TIMEOUT_MS);
  const job = (async () => {
    const response = await fetcher(href, { credentials: 'same-origin', cache: 'force-cache', ...(abort ? { signal: abort.signal } : {}) });
    if (!response?.ok) throw new Error(`${spec.file} unavailable (${response?.status ?? 'network'})`);
    const bytes = await response.arrayBuffer();
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 1024 || bytes.byteLength > spec.maxBytes) throw permanent(`${spec.file} has an unexpected size`);
    const buffer = await ctx.decodeAudioData(bytes);
    if (!buffer || !Number.isFinite(buffer.duration) || Math.abs(buffer.duration - spec.seconds) > 0.25) throw permanent(`${spec.file} duration mismatch`);
    return buffer;
  })().then(buffer => {
    if (state.ctx !== ctx) return null;
    state.buffers.set(name, buffer); return buffer;
  }).catch(error => {
    if (state.ctx === ctx) state.failed.set(name, error?.permanent ? Infinity : Date.now() + RETRY_MS);
    console.warn('[audio] recorded match cue unavailable; keeping the synthesized cue', name, error?.message || error);
    return null;
  }).finally(() => { clearTimeout(timer); if (state.loading.get(name) === job) state.loading.delete(name); });
  state.loading.set(name, job);
  return job;
}

export function preloadMatchRecordings(engine, options) {
  return Promise.all(Object.keys(MATCH_RECORDINGS).map(name => loadMatchRecording(engine, name, options)));
}

function playBuffer(engine, name, buffer, o) {
  const spec = MATCH_RECORDINGS[name], ctx = engine.ctx;
  const out = spec.bus === 'music' ? (engine.musicBus || engine.sfxIn) : (engine.sfxIn || engine.sfxBus);
  if (!out) return null;
  const volume = Math.max(0, o?.volume ?? 1) * spec.gain;
  if (volume < 1e-4) return null;
  const now = ctx.currentTime, at = Math.max(now, o?.at ?? now) + (o?.delay || 0);
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = buffer; gain.gain.value = volume;
  source.connect(gain); gain.connect(out);
  const state = stateOf(engine);
  // A replayed cue (rematch) replaces the previous one instead of stacking.
  for (const voice of state.voices) if (voice.name === name) voice.stop(0.02);
  const voice = {
    name, recorded: true, done: false,
    stop(fade = 0.05) {
      if (voice.done) return;
      const t = ctx.currentTime, end = t + Math.max(0.005, Number(fade) || 0);
      try { gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, end); source.stop(end + 0.01); }
      catch { /* already stopped */ }
    },
  };
  source.onended = () => {
    voice.done = true; state.voices.delete(voice);
    try { source.disconnect(); gain.disconnect(); } catch { /* released */ }
  };
  state.voices.add(voice);
  source.start(at);
  return voice;
}

export function installMatchRecordings(AudioEngine) {
  const P = AudioEngine?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const play = P.play, stopAll = P.stopAll, init = P.init;
  // Fetch the three short recordings (~0.5 MB) shortly after the audio
  // context exists (first user gesture), well before the first match ends.
  if (init) P.init = function (...args) {
    const result = init.apply(this, args);
    if (!this.offline && this.ctx && !this._matchRecordingsQueued) {
      this._matchRecordingsQueued = true;
      setTimeout(() => { this._matchRecordingsQueued = false; preloadMatchRecordings(this); }, 2500);
    }
    return result;
  };
  P.play = function (name, o) {
    if (MATCH_RECORDINGS[name] && this.ctx && !this.offline) {
      const state = stateOf(this);
      const buffer = state.ctx === this.ctx ? state.buffers.get(name) : null;
      if (buffer) {
        try { const voice = playBuffer(this, name, buffer, o); if (voice) return voice; }
        catch (error) { console.warn('[audio] recorded match cue failed; using the synthesized cue', name, error); }
      } else preloadMatchRecordings(this);
    }
    return play.call(this, name, o);
  };
  if (stopAll) P.stopAll = function (fade, ...rest) {
    for (const voice of this._matchRecordings?.voices || []) voice.stop(fade ?? 0.1);
    return stopAll.call(this, fade, ...rest);
  };
  // Seconds until a recorded cue (if it will be the one that plays) finishes.
  P.recordedCueSeconds = function (name) {
    const buffer = this._matchRecordings?.ctx === this.ctx ? this._matchRecordings?.buffers.get(name) : null;
    return buffer ? buffer.duration : null;
  };
  P.preloadMatchRecordings = function (options) { return preloadMatchRecordings(this, options); };
}
