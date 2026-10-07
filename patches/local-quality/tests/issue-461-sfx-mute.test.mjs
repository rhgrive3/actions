// INKWAVE issue #461 focused regression.
//
// Negative main control: the *untransformed* upstream audio.js still builds an
// SFX voice for play()/loop() while `vol.sfx === 0`. The adapted source must
// not, must keep the handle valid across the muted interval, must rebuild each
// still-open loop exactly once on restore, and must leave music routing alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { adaptIssue461Source, ISSUE_461_AUDIO_REL } from '../issue-461-sfx-mute.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const upstreamAudio = () => read('inkwave-public/' + ISSUE_461_AUDIO_REL);
const taper = (v) => Math.pow(Math.min(1, Math.max(0, +v || 0)), 1.5);

const MUSIC_NAMES = ['makeImpulse', 'mulberry32', 'mtof', 'perc', 'ahr', 'adsr', 'pts', 'sweep', 'strokeWave', 'pulseWave', 'kick', 'snare', 'crash', 'tom', 'brass', 'bell', 'pad', 'bass'];

async function loadAudioEngine(source) {
  const context = vm.createContext({ console });
  const configMod = new vm.SourceTextModule(
    'export const DEFAULT_SETTINGS = { master: 0.8, music: 0.6, sfx: 0.85 };',
    { context, identifier: 'config' });
  const musicMod = new vm.SourceTextModule(
    `export class V { constructor(ctx, out, t) { this.ctx = ctx; this.t = t; this.nodes = []; this.dead = false; } }
export function kill() {} export function dispose() {} export function finish() {}
export const music = { _init() {} };
` + MUSIC_NAMES.map((n) => `export function ${n}() { return {}; }`).join('\n'),
    { context, identifier: 'music' });
  const mod = new vm.SourceTextModule(source, { context, identifier: 'audio.js' });
  await mod.link((spec) => {
    if (spec === '../config.js') return configMod;
    if (spec === './music.js') return musicMod;
    throw new Error('unexpected import ' + spec);
  });
  await mod.evaluate();
  return mod.namespace.AudioEngine;
}

function gainNode(record) {
  const param = {
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
    setTargetAtTime(v) { if (record) record.push(v); },
  };
  return { gain: param };
}

// Minimal engine surface: no real AudioContext, deterministic _voice spy.
function fakeEngine(AudioEngine) {
  const e = new AudioEngine({ music: false, raw: true });
  const voiceCalls = [];
  const musicBusTargets = [];
  e.ctx = { currentTime: 0, sampleRate: 48000 };
  e.master = gainNode();
  e.musicBus = gainNode(musicBusTargets);
  e.sfxBus = gainNode();
  e.byName = new Map();
  e.voices = [];
  e.loops = new Set();
  e.last = new Map();
  e.rng = () => 0.5;
  e.counts = { played: 0, dropped: 0, stolen: 0 };
  e._def = () => ({ gain: 0.5, build() {}, loop() { return {}; } });
  e._voice = (d, t, pos, vol, withFade) => {
    voiceCalls.push({ t, vol, withFade: !!withFade });
    const v = { dead: false, nodes: [], kill() { this.dead = true; }, finish() {}, dispose() {} };
    const voice = { v, out: gainNode(), def: d, t, vol, panner: null, lp: null, send: null, rev: 0, fade: null };
    if (withFade) voice.fade = gainNode();
    return voice;
  };
  return { e, voiceCalls, musicBusTargets };
}

test('#461 negative main control: baseline audio.js synthesizes SFX while vol.sfx === 0', async () => {
  const raw = upstreamAudio();
  assert.equal(/_sfxSilent/.test(raw), false, 'baseline must not already gate the SFX bus');
  const Raw = await loadAudioEngine(raw);
  const { e, voiceCalls } = fakeEngine(Raw);
  e.vol.sfx = 0;
  assert.notEqual(e.play('shooter_shot'), null);
  assert.equal(voiceCalls.length, 1, 'baseline one-shot still builds a voice behind a muted bus');
  e.loop('harbor_ambience', { volume: 0.55 });
  assert.equal(voiceCalls.length, 2, 'baseline loop still builds a graph behind a muted bus');
});

test('#461 transform is scoped, once-only, and parses as a module', async () => {
  const raw = upstreamAudio();
  assert.equal(adaptIssue461Source('src/main.js', 'unchanged'), 'unchanged');
  const once = adaptIssue461Source(ISSUE_461_AUDIO_REL, raw);
  assert.match(once, /_sfxSilent\(\)/);
  assert.throws(() => adaptIssue461Source(ISSUE_461_AUDIO_REL, once), /issue-461 patch conflict/);
  await loadAudioEngine(once); // throws on syntax error
});

test('#461 muted SFX short-circuits play() and defers loop() without building', async () => {
  const Engine = await loadAudioEngine(adaptIssue461Source(ISSUE_461_AUDIO_REL, upstreamAudio()));
  const { e, voiceCalls } = fakeEngine(Engine);
  e.vol.sfx = 0;
  assert.equal(e.play('shooter_shot'), null);
  assert.equal(e.play('splatling_shot', { pos: { x: 1, y: 2, z: 3 } }), null);
  assert.equal(voiceCalls.length, 0);
  const h = e.loop('harbor_ambience', { volume: 0.55 });
  assert.equal(voiceCalls.length, 0);
  assert.equal(h.playing, false);
  assert.equal(typeof h.set, 'function');
  assert.equal(typeof h.stop, 'function');
  h.set({ volume: 0.3, pos: { x: 1, y: 1, z: 1 } }); // recorded, never built
  assert.equal(voiceCalls.length, 0);
});

test('#461 restoring SFX rebuilds each open loop exactly once (no leak/duplicate)', async () => {
  const Engine = await loadAudioEngine(adaptIssue461Source(ISSUE_461_AUDIO_REL, upstreamAudio()));
  const { e, voiceCalls } = fakeEngine(Engine);
  e.vol.sfx = 0;
  const h = e.loop('harbor_ambience', { volume: 0.55 });
  e.setVolumes({ sfx: 0.7 });
  assert.equal(voiceCalls.length, 1, 'restore rebuilds once');
  assert.equal(h.playing, true);
  assert.equal(e._sfxReq.size, 1);
  for (let i = 0; i < 3; i++) { e.setVolumes({ sfx: 0 }); e.setVolumes({ sfx: 0.7 }); }
  assert.equal(voiceCalls.length, 4, 'each 0 -> audible cycle rebuilds exactly once');
  assert.equal(e._sfxReq.size, 1, 'no duplicate requests accumulate');
  assert.equal(h.playing, true);
});

test('#461 SFX mute keeps music routing and future audible events working', async () => {
  const Engine = await loadAudioEngine(adaptIssue461Source(ISSUE_461_AUDIO_REL, upstreamAudio()));
  const { e, voiceCalls, musicBusTargets } = fakeEngine(Engine);
  e.vol.music = 0.6;
  e.setVolumes({ sfx: 0 });
  assert.equal(e.vol.music, 0.6, 'SFX mute must not alter the music volume');
  assert.equal(musicBusTargets.every((v) => Math.abs(v - taper(0.6)) < 1e-12), true, 'musicBus gain still tracks music only');
  e.setVolumes({ sfx: 0.5 });
  assert.equal(e.vol.music, 0.6);
  const voice = e.play('jump');
  assert.notEqual(voice, null, 'future events synthesize normally once audible');
  assert.equal(voiceCalls.length, 1);
});

test('#461 stopping a deferred loop while muted cannot resurrect it; stopAll retires requests', async () => {
  const Engine = await loadAudioEngine(adaptIssue461Source(ISSUE_461_AUDIO_REL, upstreamAudio()));
  const a = fakeEngine(Engine);
  a.e.vol.sfx = 0;
  const h = a.e.loop('charger_charge', {});
  h.stop();
  a.e.setVolumes({ sfx: 0.8 });
  assert.equal(a.voiceCalls.length, 0);
  assert.equal(a.e._sfxReq.size, 0);

  const b = fakeEngine(Engine);
  b.e.vol.sfx = 0;
  b.e.loop('harbor_ambience', {});
  b.e.stopAll();
  b.e.setVolumes({ sfx: 1 });
  assert.equal(b.voiceCalls.length, 0, 'teardown must not be undone by a later unmute');
  assert.equal(b.e._sfxReq.size, 0);
});
