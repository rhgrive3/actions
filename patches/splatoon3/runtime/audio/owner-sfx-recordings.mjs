// Original sound effects recorded by the project owner (supplied 2026-11-04).
// Each recording replaces one synthesized SFX definition by name. The recording
// plays through the engine's ordinary voice graph (voice limits, 3D panner,
// distance filter, reverb send, SFX volume), so only the source changes. Until a
// file has been fetched and decoded, or if it fails, the original synthesized
// definition still plays: a cue is never silent and never doubled.
//
// Gains were set so each recording's loudest 300 ms RMS matches the synthesized
// cue it replaces (OfflineAudioContext render of the synth vs. decoded file).
// That is a mix decision for INKWAVE, not a Splatoon 3 measurement.
const assetURL = name => {
  try { return import.meta.url ? new URL('../../../../assets/audio/' + name, import.meta.url).href : null; }
  catch { return null; }
};
const KB = 1024;
// The Clam Blitz file holds nine pickup tones one second apart: eight rising
// steps (1st..8th clam; the 8th completes a Power Clam) and a Power Clam pickup.
const CLAM_SLICES = Object.freeze([...Array.from({ length: 8 }, (_, i) => Object.freeze([i, 1])), Object.freeze([8, 0.758])]);
export const OWNER_SFX = Object.freeze({
  ui_hover: Object.freeze({ file: 'ui_select.mp3', gain: 0.124, seconds: 0.205, maxBytes: 16 * KB, reverb: 0 }),
  ui_click: Object.freeze({ file: 'ui_press_a.mp3', gain: 0.108, seconds: 0.208, maxBytes: 16 * KB, reverb: 0 }),
  ui_confirm: Object.freeze({ file: 'ui_decide.mp3', gain: 0.122, seconds: 0.306, maxBytes: 16 * KB, reverb: 0 }),
  ui_back: Object.freeze({ file: 'ui_back.mp3', gain: 0.093, seconds: 0.384, maxBytes: 16 * KB, reverb: 0 }),
  // Referee whistle at the end of the match (the synthesized cue was whistle + stinger).
  times_up: Object.freeze({ file: 'whistle.mp3', gain: 0.088, seconds: 1.673, maxBytes: 48 * KB, reverb: 0.1 }),
  // Only the local special-gauge-full event; HUD streak callouts keep special_ready.
  special_charged: Object.freeze({ file: 'sfx_special_ready.mp3', gain: 0.146, seconds: 1.825, maxBytes: 96 * KB, reverb: 0.05, fallback: 'special_ready' }),
  team_wipeout: Object.freeze({ file: 'sfx_wipeout.mp3', gain: 0.112, seconds: 1.281, maxBytes: 64 * KB, reverb: 0.05, fallback: 'special_ready' }),
  clam_pickup: Object.freeze({ file: 'sfx_clam_blitz_collect.mp3', gain: 0.122, seconds: 8.758, maxBytes: 256 * KB, reverb: 0.04, slices: CLAM_SLICES }),
  // Splat Bomb throw (owner clarification 2026-11-05): the "throw" recording is
  // the release sound, played once when the bomb leaves the hand. It is NOT the
  // fuse: the landing / fuse beeps (`bomb_beep`) stay the fuse sound. Gain is the
  // RMS match against the synthesized `bomb_throw` made for the first mapping.
  splat_bomb_throw: Object.freeze({ file: 'sfx_throw_smallfry.mp3', gain: 0.062, seconds: 1.843, maxBytes: 96 * KB, reverb: 0.04, fallback: 'bomb_throw' }),
  // Looping swim bed. The ends are cross-faded into a seamless loop at decode time.
  swim: Object.freeze({ file: 'sfx_swimming_in_ink.mp3', gain: 0.186, seconds: 20.28, maxBytes: 1024 * KB, reverb: 0.03, loop: true, crossfade: 0.35 }),
  // Title screen: the A press (menus.js _titleGo plays it in place of ui_confirm). Provisional gain: the
  // loudest 300 ms RMS of this file scaled to the level of ui_decide at its gain. Not yet heard in-game.
  title_press: Object.freeze({ file: 'ui_title_press_a.mp3', gain: 0.062, seconds: 2.55, maxBytes: 128 * KB, fallback: 'ui_confirm' }),
  // Title screen: a single tone 300 ms after the A press (menus.js _titleGo). No synthesized equivalent.
  title_follow: Object.freeze({ file: 'sfx_n0010a10.mp3', gain: 0.025, seconds: 1.12, maxBytes: 64 * KB, reverb: 0.04 }),
  // Battle start GO (main.js plays go_horn): the same A recording, level matched to the special-gauge cue.
  go_horn: Object.freeze({ file: 'ui_title_press_a.mp3', gain: 0.125, seconds: 2.55, maxBytes: 128 * KB }),
  // Judge's decision moment (hud.js judge_reveal). Level matched to the special-gauge cue.
  judge_reveal: Object.freeze({ file: 'sfx_gear_put_on_cloth.mp3', gain: 0.149, seconds: 0.61, maxBytes: 48 * KB }),
  // Rolling loop (weapons.js loop 'roll'). Pitch follows the synth's own rate (q, 0.6..1.6), not swimRate.
  roll: Object.freeze({ file: 'sfx_roller_roll.mp3', gain: 0.33, seconds: 3.92, maxBytes: 256 * KB, loop: true, crossfade: 0.35, rate: 'linear' }),
});
// UI first: those are heard on the menu right after the first gesture.
const LOAD_ORDER = Object.freeze(['ui_hover', 'ui_click', 'ui_confirm', 'ui_back', 'title_press', 'title_follow', 'special_charged', 'times_up', 'team_wipeout', 'splat_bomb_throw', 'clam_pickup', 'go_horn', 'judge_reveal', 'roll', 'swim']);
const INSTALLED = Symbol.for('inkwave.owner-sfx-recordings.v1');
const LOAD_TIMEOUT_MS = 15000, RETRY_MS = 20000;
const permanent = message => Object.assign(new Error(message), { permanent: true });
// Speed changes the swim bed only slightly (synth: rate = q, q ≈ 0.6..1.6).
export const swimRate = q => Math.pow(Math.min(1.8, Math.max(0.4, Number(q) || 1)), 0.25);
// Rolling loop: the synthesized roll takes the pitch factor directly (about 0.6..1.6).
export const rollRate = q => Math.min(1.6, Math.max(0.6, Number(q) || 1));

function stateOf(engine) {
  return engine._ownerSfx ||= { ctx: null, buffers: new Map(), loading: new Map(), failed: new Map(), defs: new Map() };
}

// Replace the loop's last `seconds` with an equal-power cross-fade into its head.
export function seamlessLoop(ctx, buffer, seconds) {
  const sr = buffer.sampleRate, n = buffer.length, x = Math.min(Math.floor(n / 4), Math.round(seconds * sr));
  if (!(x > 0) || typeof ctx.createBuffer !== 'function') return buffer;
  const out = ctx.createBuffer(buffer.numberOfChannels, n - x, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src.subarray(0, n - x));
    for (let i = 0; i < x; i++) {
      const k = (i + 0.5) / x;
      dst[i] = src[i] * Math.sin(k * Math.PI / 2) + src[n - x + i] * Math.cos(k * Math.PI / 2);
    }
  }
  return out;
}

export function loadOwnerSfx(engine, name, { fetcher = engine?._ownerSfxFetcher || globalThis.fetch?.bind(globalThis), url } = {}) {
  const spec = OWNER_SFX[name], ctx = engine?.ctx;
  if (!spec || !ctx || ctx.state === 'closed' || typeof ctx.decodeAudioData !== 'function') return Promise.resolve(null);
  const state = stateOf(engine);
  if (state.ctx !== ctx) { state.ctx = ctx; state.buffers.clear(); state.loading.clear(); state.failed.clear(); state.defs.clear(); }
  if (state.buffers.has(name)) return Promise.resolve(state.buffers.get(name));
  if (state.loading.has(name)) return state.loading.get(name);
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
    const decoded = await ctx.decodeAudioData(bytes);
    if (!decoded || !Number.isFinite(decoded.duration) || Math.abs(decoded.duration - spec.seconds) > 0.25) throw permanent(`${spec.file} duration mismatch`);
    return spec.loop ? seamlessLoop(ctx, decoded, spec.crossfade || 0) : decoded;
  })().then(buffer => {
    if (state.ctx !== ctx) return null;
    state.buffers.set(name, buffer); return buffer;
  }).catch(error => {
    if (state.ctx === ctx) state.failed.set(name, error?.permanent ? Infinity : Date.now() + RETRY_MS);
    console.warn('[audio] owner SFX recording unavailable; keeping the synthesized sound', name, error?.message || error);
    return null;
  }).finally(() => { clearTimeout(timer); if (state.loading.get(name) === job) state.loading.delete(name); });
  state.loading.set(name, job);
  return job;
}

// Sequential: never more than one small request in flight next to the menu music.
export async function preloadOwnerSfx(engine, options) {
  const out = [];
  for (const name of LOAD_ORDER) out.push(await loadOwnerSfx(engine, name, options));
  return out;
}

// A recorded definition with the same voice policy as the synthesized one.
function recordedDef(base, spec, buffer) {
  const def = {
    gain: spec.gain, max: base?.max ?? 2, jitter: 0, reverb: spec.reverb ?? base?.reverb ?? 0.05,
    minGap: base?.minGap, ref: base?.ref, oneShot: base?.oneShot, recorded: true,
  };
  if (spec.loop) {
    const rateOf = spec.rate === 'linear' ? rollRate : swimRate;
    def.loop = (v, p) => {
      const s = v.buffer(buffer, v.t, null, v.out, rateOf(p), v.r(0, buffer.duration * 0.95));
      return { pitch(q, now) { s.playbackRate.setTargetAtTime(rateOf(q), now, 0.05); } };
    };
  } else {
    def.build = (v, p, o) => {
      let offset = 0, length = buffer.duration;
      if (Number.isFinite(o?.offset) && o.offset > 0) { offset = Math.min(o.offset, buffer.duration - 0.01); length = buffer.duration - offset; }
      if (spec.slices) {
        const i = Math.max(0, Math.min(spec.slices.length - 1, Math.round(Number(o?.slice) || 0)));
        [offset, length] = spec.slices[i];
        length = Math.max(0.01, Math.min(length, buffer.duration - offset));
      }
      const s = v.buffer(buffer, v.t, v.t + length, v.out, 1, offset);
      s.loop = false;
    };
  }
  return def;
}

export function installOwnerSfxRecordings(AudioEngine, SFX) {
  const P = AudioEngine?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  // New names keep a synthesized fallback until their recording is decoded.
  for (const [name, spec] of Object.entries(OWNER_SFX)) if (!SFX[name] && spec.fallback && SFX[spec.fallback]) SFX[name] = SFX[spec.fallback];
  const init = P.init, resolve = P._def;
  if (init) P.init = function (...args) {
    const result = init.apply(this, args);
    if (!this.offline && this.ctx && !this._ownerSfxQueued) {
      this._ownerSfxQueued = true;
      setTimeout(() => { this._ownerSfxQueued = false; preloadOwnerSfx(this); }, 400);
    }
    return result;
  };
  P._def = function (name) {
    const base = resolve.call(this, name);
    const spec = OWNER_SFX[name];
    if (!spec || !this.ctx || this.offline) return base;
    const state = stateOf(this);
    const buffer = state.ctx === this.ctx ? state.buffers.get(name) : null;
    if (!buffer) { if (!state.loading.has(name) && !state.failed.has(name)) loadOwnerSfx(this, name); return base; }
    let def = state.defs.get(name);
    if (!def || def.buffer !== buffer) { def = { buffer, def: recordedDef(base, spec, buffer) }; state.defs.set(name, def); }
    return def.def;
  };
  P.preloadOwnerSfx = function (options) { return preloadOwnerSfx(this, options); };
  P.ownerSfxReady = function (name) {
    const state = this._ownerSfx;
    return !!(OWNER_SFX[name] && this.ctx && !this.offline && state?.ctx === this.ctx && state.buffers.has(name));
  };
  // Splat Bomb throw: plays the decoded recording once and returns true, or
  // returns false while it is not decoded so the caller keeps its own cue (one
  // throw sound per throw, never two).
  P.playOwnerBombThrow = function (options = {}) {
    if (!this.ownerSfxReady('splat_bomb_throw')) return false;
    this.play('splat_bomb_throw', { pos: options.pos, volume: Number.isFinite(options.volume) ? options.volume : 1 });
    return true;
  };
}
