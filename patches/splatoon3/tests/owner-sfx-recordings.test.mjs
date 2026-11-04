// Owner-recorded original SFX (2026-11-04): exact shipped files, fallback and
// recorded-definition semantics with a fake AudioContext, the seamless swim
// loop, and the final composed anchors. Logic only: no device listening test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { installOwnerSfxRecordings, OWNER_SFX, loadOwnerSfx, seamlessLoop, swimRate } from '../runtime/audio/owner-sfx-recordings.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = new URL('../../../', import.meta.url);
const asset = name => new URL('inkwave-public/assets/audio/' + name, ROOT);
const SHA = {
  'ui_select.mp3': 'ed10354a79cc11ea576e5fde8fab728a263690cb1835ebb5a6932811dbd0fbb1',
  'ui_press_a.mp3': '58decf12fabefbe6d79405db32c0ea67918e31c2d85c83582c67f8ac7ce55823',
  'ui_decide.mp3': 'eb4cd0294160dc75508884e90d6636c953f61f7c9f0e50a2f6bf9721d6184d3a',
  'ui_back.mp3': '78d3a2abb7c4cb4ab44cd2b2c47199f073abfe07758257cf467b0fa666ac7560',
  'whistle.mp3': 'cc1a382bd5b0f11b832d0c3a4db7d032ee8bc8f6c79525a9514a0e16effeceda',
  'sfx_special_ready.mp3': 'c13ead1735954aed2e0f9322f0a94e1602fbca46f88dd74551682569dbd91cda',
  'sfx_wipeout.mp3': '11f08b12c3eef96ffaafb8446bec0d83467e0e1679b1d1837e0297daae3d5460',
  'sfx_clam_blitz_collect.mp3': '009695aedd6ecfe105a306e4a044e50166e0e9c451d577858d8bb40729219661',
  'sfx_throw_smallfry.mp3': '14624eff492f8e6a5b15c27999223b4fec8403551e09b89af76dca5897311a45',
  'sfx_swimming_in_ink.mp3': '185e74038d3eccdfe9c914d9f1d1eccde3ecf9a056309f064a16b515cf90033e',
};

test('shipped recordings are the exact owner files and fit their byte limits', () => {
  assert.deepEqual(Object.values(OWNER_SFX).map(s => s.file).sort(), Object.keys(SHA).sort());
  for (const [name, sha] of Object.entries(SHA))
    assert.equal(createHash('sha256').update(fs.readFileSync(asset(name))).digest('hex'), sha, name);
  for (const spec of Object.values(OWNER_SFX)) assert.ok(fs.statSync(asset(spec.file)).size <= spec.maxBytes, spec.file);
});

function fakeBuffer(seconds, channels = 2, sampleRate = 100) {
  const length = Math.round(seconds * sampleRate), data = Array.from({ length: channels }, () => new Float32Array(length));
  return { duration: seconds, length, sampleRate, numberOfChannels: channels, getChannelData: c => data[c] };
}
function fakeContext() {
  const ctx = {
    state: 'running', currentTime: 3, sampleRate: 100,
    createBuffer: (channels, length, sampleRate) => fakeBuffer(length / sampleRate, channels, sampleRate),
    decodeAudioData: async bytes => fakeBuffer(ctx.durations.get(bytes.byteLength)),
  };
  return ctx;
}
function engineClass(SFX) {
  class Engine {
    constructor(ctx) { this.ctx = ctx; this.offline = false; this.loops = []; }
    loop(name, o) { const d = this._def(name), v = fakeVoice(); d.build(v, 1, o); const h = { name, o, v, stop(f) { h.stopped = f; } }; this.loops.push(h); return h; }
    init() { return this; }
    _def(name) { return SFX[name]; }
  }
  installOwnerSfxRecordings(Engine, SFX);
  return Engine;
}
function fakeVoice() {
  const calls = [];
  return {
    calls, t: 5, out: { out: true }, r: (a, b) => (a + b) / 2,
    buffer(buf, t0, t1, to, rate, offset) {
      const s = { loop: true, playbackRate: { value: rate, target: null, setTargetAtTime(v) { this.target = v; } } };
      calls.push({ buf, t0, t1, to, rate, offset, s }); return s;
    },
  };
}

test('synthesized cue until decoded, then a recorded definition with the base voice policy', async () => {
  const synth = (n) => ({ gain: 0.2, max: 3, minGap: 0.03, build() { return n; } });
  const SFX = { ui_hover: synth('hover'), special_ready: synth('ready'), bomb_beep: synth('beep'), bomb_throw: synth('throw'), clam_pickup: synth('clam'), swim: { gain: 0.18, max: 2, loop() {} } };
  const ctx = fakeContext(), sizes = {};
  ctx.durations = new Map();
  let size = 2000;
  for (const spec of Object.values(OWNER_SFX)) { sizes[spec.file] = size; ctx.durations.set(size, spec.seconds); size += 10; }
  const Engine = engineClass(SFX), e = new Engine(ctx);
  const fetched = [];
  e._ownerSfxFetcher = async url => { const name = Object.keys(sizes).find(n => String(url).endsWith('/' + n)); fetched.push(name); return { ok: true, arrayBuffer: async () => new ArrayBuffer(sizes[name]) }; };
  // New names alias their synthesized fallback.
  assert.equal(SFX.team_wipeout, SFX.special_ready);
  assert.equal(SFX.special_charged, SFX.special_ready);
  assert.equal(SFX.bomb_fuse, SFX.bomb_beep);
  // Not decoded: the synthesized definition, and the load starts.
  assert.equal(e._def('ui_hover'), SFX.ui_hover);
  await loadOwnerSfx(e, 'ui_hover');
  assert.deepEqual(fetched, ['ui_select.mp3']);
  const hover = e._def('ui_hover');
  assert.equal(hover.recorded, true); assert.equal(hover.gain, OWNER_SFX.ui_hover.gain);
  assert.equal(hover.max, 3); assert.equal(hover.minGap, 0.03); assert.equal(hover.jitter, 0);
  assert.equal(e._def('ui_hover'), hover, 'definition is cached per decoded buffer');
  const v = fakeVoice(); hover.build(v, 1.3, {});
  assert.equal(v.calls[0].rate, 1, 'UI recordings ignore pitch jitter'); assert.equal(v.calls[0].offset, 0);
  assert.equal(v.calls[0].s.loop, false); assert.ok(Math.abs(v.calls[0].t1 - (5 + OWNER_SFX.ui_hover.seconds)) < 1e-9);
  // Unrelated names are untouched.
  assert.equal(e._def('bomb_throw'), SFX.bomb_throw);
  // Clam pickups play one slice per held clam.
  await loadOwnerSfx(e, 'clam_pickup');
  const clam = e._def('clam_pickup'), cv = fakeVoice();
  clam.build(cv, 2, { slice: 3 }); clam.build(cv, 1, { slice: 8 }); clam.build(cv, 1, { slice: 99 });
  assert.deepEqual(cv.calls.map(c => [c.offset, +(c.t1 - c.t0).toFixed(3)]), [[3, 1], [8, 0.758], [8, 0.758]]);
  // Splat Bomb pre-explosion sound: none until decoded (the caller keeps its
  // beeps), then a stoppable voice offset so the falling sweep ends at the blast.
  assert.equal(e.startOwnerBombFuse({ x: 1, y: 0, z: 2 }, 1), null);
  await loadOwnerSfx(e, 'bomb_fuse');
  const fuse = e.startOwnerBombFuse({ x: 1, y: 0, z: 2 }, 1);
  assert.equal(fuse.name, 'bomb_fuse'); assert.deepEqual(fuse.o.pos, { x: 1, y: 0, z: 2 });
  const fc = fuse.v.calls[0];
  assert.ok(Math.abs(fc.offset - (OWNER_SFX.bomb_fuse.sweepEnd - 1)) < 1e-9);
  assert.ok(Math.abs(fc.t1 - fc.t0 - (OWNER_SFX.bomb_fuse.seconds - fc.offset)) < 1e-9);
  assert.equal(e.startOwnerBombFuse(null, 3).v.calls[0].offset, 0, 'a longer fuse starts from the top');
  // The swim bed loops seamlessly, starts at a varied offset and follows speed mildly.
  await loadOwnerSfx(e, 'swim');
  const swim = e._def('swim'), sv = fakeVoice();
  assert.equal(swim.build, undefined);
  const ctl = swim.loop(sv, 1.6);
  assert.equal(sv.calls[0].t1, null); assert.ok(sv.calls[0].offset > 0);
  assert.ok(Math.abs(sv.calls[0].buf.duration - (OWNER_SFX.swim.seconds - OWNER_SFX.swim.crossfade)) < 0.02);
  ctl.pitch(0.6, 4); assert.equal(sv.calls[0].s.playbackRate.target, swimRate(0.6));
  assert.ok(swimRate(0.6) > 0.85 && swimRate(1.6) < 1.15);
});

test('size or duration mismatches keep the synthesized cue', async () => {
  const SFX = { ui_back: { gain: 0.19, build() {} } };
  const ctx = fakeContext(); ctx.durations = new Map([[3000, 2.5]]);
  const Engine = engineClass(SFX), e = new Engine(ctx);
  e._ownerSfxFetcher = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3000) });
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(await loadOwnerSfx(e, 'ui_back'), null); } finally { console.warn = warn; }
  assert.equal(e._def('ui_back'), SFX.ui_back);
});

test('seamless loop cross-fades the tail into the head', () => {
  const ctx = fakeContext(), src = fakeBuffer(1, 1, 100), d = src.getChannelData(0);
  for (let i = 0; i < 100; i++) d[i] = i < 80 ? 0 : 1;   // a step at the old end
  const out = seamlessLoop(ctx, src, 0.2), o = out.getChannelData(0);
  assert.equal(out.length, 80);
  assert.ok(o[0] > 0.99, 'loop start continues the old tail'); assert.ok(o[19] < 0.05, 'and hands over to the head');
  assert.equal(o[79], 0);
});

test('composed sources install the recordings and route only the gauge-full cue', () => {
  const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
  const audio = adaptBuildSource('src/audio/audio.js', read('src/audio/audio.js'));
  assert.match(audio, /^import \{ installOwnerSfxRecordings \}/m);
  assert.ok(audio.trimEnd().endsWith('installOwnerSfxRecordings(AudioEngine, SFX);'));
  const main = adaptBuildSource('src/main.js', read('src/main.js'));
  assert.equal((main.match(/play\('special_charged'\)/g) || []).length, 1);
  assert.match(main, /play\('times_up'\)/);
  const weapons = adaptBuildSource('src/game/weapons.js', read('src/game/weapons.js'));
  assert.equal((weapons.match(/b\.s3FuseSfx = G\.audio\?\.startOwnerBombFuse\?\.\(b\.pos, b\.fuse\) \|\| null; if \(!b\.s3FuseSfx\) G\.audio\?\.play\('bomb_beep'/g) || []).length, 1);
  assert.equal((weapons.match(/if \(!b\.s3FuseSfx && G\.camera/g) || []).length, 1);
  assert.match(weapons, /_releaseBomb\(b\) \{\n    if \(b\?\.s3FuseSfx\) \{ b\.s3FuseSfx\.stop\(0\.03\); b\.s3FuseSfx = null; \}/);
});
