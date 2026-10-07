// INKWAVE issue #461 — SFX volume 0 must stop synthesizing voices/loops.
//
// Narrow build-only adapter. It transforms the upstream `src/audio/audio.js` at
// build time (never mutating inkwave-public/ itself) so that an effective-zero
// SFX bus becomes an execution/lifecycle state, not just a downstream gain:
//
//   * `play()` short-circuits while `taper(this.vol.sfx) <= 0` (no GainNode /
//     panner / filter / reverb-send / builder work for an inaudible one-shot).
//   * `loop()` while muted records the request but builds no graph. The returned
//     handle stays a valid handle object, so an app-held handle such as
//     `main.js::_amb` can no longer become a stale stopped handle that blocks
//     recreation.
//   * Going 0 stops any live SFX loops (frees their Web Audio graph); going back
//     above 0 rebuilds each still-open request exactly once.
//   * Music routing (`musicBus` / the music singleton) is never touched, so
//     SFX = 0 cannot mute or restart music.
//
// The shared dispatcher (`patches/local-quality/adapter.mjs`) and
// `patches/splatoon3/profile.json` are intentionally NOT edited by this lane.
// The parent must wire this in (see REQUIRED_WIRING below), adding the file to
// the dispatcher and its identity list.

// Parent-side wiring required (reported, not applied here):
//   1. `patches/local-quality/adapter.mjs`
//        import { adaptIssue461Source } from './issue-461-sfx-mute.mjs';
//        add 'issue-461-sfx-mute.mjs' to IDENTITY_FILES
//        and at the top of adaptQualitySource:
//          code = adaptIssue461Source(rel, code);
//   2. Re-run `scripts/build-inkwave.mjs` so the transform lands in the build.
export const REQUIRED_WIRING = 'adaptIssue461Source must be invoked inside adaptQualitySource and issue-461-sfx-mute.mjs added to IDENTITY_FILES';

export const ISSUE_461_AUDIO_REL = 'src/audio/audio.js';

function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-461 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

// Deferred-request lifecycle. The handle returned to callers survives the muted
// interval; `rec.live` is the actual engine loop handle while audible.
const HELPERS = `  _sfxSilent() { return taper(this.vol.sfx) <= 0; }
  _suspendSfxReqs() { for (const rec of this._sfxReq) if (rec.live) { rec.live.stop(0.05); rec.live = null; } }
  _resumeSfxReqs() { for (const rec of [...this._sfxReq]) this._activateSfxReq(rec); }
`;

export function adaptIssue461Source(rel, code) {
  if (rel !== ISSUE_461_AUDIO_REL) return code;

  // 1. Track requests for SFX loops that are open (or were open) while muted.
  code = replaceOnce(code,
    '    this.byName = new Map(); this.voices = []; this.loops = new Set(); this.last = new Map();\n',
    '    this.byName = new Map(); this.voices = []; this.loops = new Set(); this.last = new Map();\n' +
    '    this._sfxReq = new Set();\n',
    'sfx request registry');

  // 2. setVolumes: clamp as before, then react to the audible<->silent transition.
  code = replaceOnce(code,
    `  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx']) if (v[k] != null && Number.isFinite(+v[k])) this.vol[k] = Math.min(1, Math.max(0, +v[k]));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(taper(this.vol.master), t, 0.04);
    this.musicBus.gain.setTargetAtTime(taper(this.vol.music), t, 0.04);
    this.sfxBus.gain.setTargetAtTime(taper(this.vol.sfx), t, 0.04);
  }
`,
    `  setVolumes(v = {}) {
    const wasSilent = this._sfxSilent();
    for (const k of ['master', 'music', 'sfx']) if (v[k] != null && Number.isFinite(+v[k])) this.vol[k] = Math.min(1, Math.max(0, +v[k]));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(taper(this.vol.master), t, 0.04);
    this.musicBus.gain.setTargetAtTime(taper(this.vol.music), t, 0.04);
    this.sfxBus.gain.setTargetAtTime(taper(this.vol.sfx), t, 0.04);
    const nowSilent = this._sfxSilent();
    if (nowSilent && !wasSilent) this._suspendSfxReqs();
    else if (!nowSilent && wasSilent) this._resumeSfxReqs();
  }
`,
    'setVolumes transition');

  // 3. Insert the mute helpers ahead of `_def` so play()/loop() can consult them.
  code = replaceOnce(code,
    '  _def(name) {',
    HELPERS + '  _def(name) {',
    'sfx mute helpers');

  // 4. play(): skip voice/graph construction entirely while the bus is silent.
  code = replaceOnce(code,
    `  play(name, o = {}) {
    if (!this.ctx) return null;
    const d = this._def(name);
    if (!d) return null;
    o = o || {};
`,
    `  play(name, o = {}) {
    if (!this.ctx) return null;
    if (this._sfxSilent()) return null;
    const d = this._def(name);
    if (!d) return null;
    o = o || {};
`,
    'play mute gate');

  // 5. loop(): return a survivable deferred handle while muted; the original
  //    body becomes `_loopLive`, invoked only when audible / on restore.
  code = replaceOnce(code,
    `  loop(name, o = {}) {
    if (!this.ctx) return NOOP_HANDLE;
    const d = this._def(name);
    if (!d) return NOOP_HANDLE;
    o = o || {};
`,
    `  loop(name, o = {}) {
    if (!this.ctx) return NOOP_HANDLE;
    const d = this._def(name);
    if (!d) return NOOP_HANDLE;
    o = o || {};
    return this._requestSfxLoop(name, d, o);
  }

  _requestSfxLoop(name, d, o) {
    const eng = this;
    const rec = { name, d, o, stopped: false, live: null };
    const h = {
      name,
      get playing() { return !rec.stopped && !!rec.live && rec.live.playing; },
      set(p = {}) {
        if (rec.stopped || !p) return;
        if (rec.live) rec.live.set(p);
        if (p.volume != null && Number.isFinite(+p.volume)) rec.o.volume = Math.max(0, +p.volume);
        if (p.pitch != null && Number.isFinite(+p.pitch)) rec.o.pitch = +p.pitch;
        if (p.pos) rec.o.pos = p.pos;
      },
      stop(fade = 0.15) {
        if (rec.stopped) return;
        rec.stopped = true;
        eng._sfxReq.delete(rec);
        if (rec.live) { rec.live.stop(fade); rec.live = null; }
      },
    };
    this._sfxReq.add(rec);
    this._activateSfxReq(rec);
    return h;
  }

  _activateSfxReq(rec) {
    if (rec.stopped || this._sfxSilent()) return;
    if (rec.live && rec.live.playing) return;
    rec.live = null;
    rec.live = this._loopLive(rec.name, rec.d, rec.o || {});
  }

  _loopLive(name, d, o) {
`,
    'loop deferred handle');

  // 6. stopAll() must also retire deferred requests so a later unmute cannot
  //    resurrect loops the app explicitly tore down.
  code = replaceOnce(code,
    `  stopAll(fade = 0.1) {
    for (const h of [...this.loops]) h.stop(fade);
    if (!this.ctx) return;
`,
    `  stopAll(fade = 0.1) {
    for (const h of [...this.loops]) h.stop(fade);
    for (const rec of [...this._sfxReq]) rec.stopped = true;
    this._sfxReq.clear();
    if (!this.ctx) return;
`,
    'stopAll deferred cleanup');

  return code;
}
