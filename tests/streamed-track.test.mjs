import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptWeaponAudio } from '../patches/splatoon3/audio-adapter.mjs';
import { StreamedTrack } from '../inkwave-public/src/audio/streamedTrack.js';
import { MusicEngine } from '../inkwave-public/src/audio/music.js';

function makeMock() {
  const calls = [];
  const param = { value: 0, cancelScheduledValues: (t) => calls.push(['cancel', t]), setValueAtTime(v, t) { this.value = v; calls.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { this.value = v; calls.push(['ramp', v, t]); } };
  let failed = 0, played = 0, paused = 0, removed = 0;
  const listeners = new Map();
  const element = {
    loop: false,
    addEventListener: (n, cb) => listeners.set(n, cb),
    removeEventListener: (n) => { listeners.delete(n); removed++; },
    play: () => { played++; return Promise.resolve(); },
    pause: () => { paused++; },
    removeAttribute: () => {},
    load: () => {},
  };
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const engine = { ctx: { createGain: () => ({ ...node(), gain: param }), createMediaElementSource: () => node() }, mix: node(), now: () => 7 };
  const track = new StreamedTrack(engine, 'battle', { bpm: 150 }, element, () => { failed++; });
  return { track, element, calls, listeners, get failed() { return failed; }, get played() { return played; }, get paused() { return paused; }, get removed() { return removed; } };
}

test('streamed track connects a looping element, fades in and releases it', async () => {
  const a = makeMock();
  assert.equal(a.element.loop, true);
  a.track.fadeIn(7.1, 0.2);
  await Promise.resolve();
  assert.equal(a.played, 1);
  assert.ok(a.calls.some(c => c[0] === 'ramp' && c[1] === 0.7));
  a.track.dispose();
  a.track.dispose();
  assert.equal(a.paused, 1);
  assert.equal(a.removed, 1);
});

test('START gesture primes the same media element without audible output', async () => {
  const a = makeMock();
  a.track.prime();
  await Promise.resolve();
  assert.equal(a.played, 1, 'trusted tap starts muted-by-WebAudio streaming early');
  assert.ok(!a.calls.some(c => c[0] === 'ramp' && c[1] > 0),
    'music stays silent until GO');
  a.track.element.currentTime = 0;
  a.track.fadeIn(7.1, 0.1);
  assert.equal(a.played, 2, 'GO reuses the already-playing media element');
  assert.equal(a.track.element.currentTime, 0);
  a.track.dispose();
});

test('media load failure is reported only once', () => {
  const a = makeMock();
  a.listeners.get('error')();
  a.track._fail();
  assert.equal(a.failed, 1);
  a.track.dispose();
  a.track._fail();
  assert.equal(a.failed, 1);
});

test('fade out stops and pauses without full-file decoding', () => {
  const a = makeMock();
  a.track.fadeOut(7, 0.01);
  assert.ok(Number.isFinite(a.track.stopAt));
  a.track.dispose();
  assert.equal(a.paused, 1);
});


test('streamed music passes production audio adapter without skipping final-minute grid', () => {
  const original = readFileSync(new URL('../inkwave-public/src/audio/music.js', import.meta.url), 'utf8');
  const streamedPredicate = 'if (cur && !element && !(cur instanceof StreamedTrack) && fade > 0 && cur.song.bpm === song.bpm)';
  const standardPredicate = 'if (cur && fade > 0 && cur.song.bpm === song.bpm)';
  assert.equal(original.split(streamedPredicate).length - 1, 1);
  const streamBuilt = adaptWeaponAudio('src/audio/music.js', original);
  const guard = "opts.sync !== false && track !== 'battle_final'";
  assert.equal(streamBuilt.split(guard).length - 1, 1, 'retain final-minute unsynced transition');
  assert.ok(streamBuilt.includes('cur && !element && !(cur instanceof StreamedTrack) && fade > 0'), 'never beat-sync a streamed recording');
  assert.ok(streamBuilt.includes('let t0 = Number.isFinite(opts.at)'), 'scheduled final-minute clock survives');
  const legacyBuilt = adaptWeaponAudio('src/audio/music.js', original.replace(streamedPredicate, standardPredicate));
  assert.equal(legacyBuilt.split(guard).length - 1, 1, 'normal procedural player keeps the same cutoff');
  assert.ok(legacyBuilt.includes('track !== \'battle_final\' && cur && fade > 0'), 'legacy beat-grid adapter remains accepted');
});

test('MusicEngine preload primes exactly one live source, and GO reuses it', async () => {
  const oldAudio = globalThis.Audio;
  const elements = [], mediaSources = [];
  class FakeAudio {
    constructor() { this.preload = ''; this.src = ''; this.loop = false; this.paused = true; this.currentTime = 3; this.plays = 0; this.listeners = new Map(); elements.push(this); }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name) { this.listeners.delete(name); }
  }
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, setTargetAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param() });
  globalThis.Audio = FakeAudio;
  const m = new MusicEngine();
  m.ctx = { currentTime: 10, createGain: node, createMediaElementSource(el) { mediaSources.push(el); return node(); } };
  m.offline = false;
  m.mix = node(); m.dA = { delayTime: param() }; m.dB = { delayTime: param() };
  m._tick = () => {};
  try {
    m.preloadFile('battle');
    assert.equal(elements.length, 1);
    assert.equal(elements[0].plays, 0, 'ordinary preload must not autoplay');
    m.preloadFile('battle', { prime: true });
    assert.equal(mediaSources.length, 1);
    assert.equal(elements[0].plays, 1, 'one trusted gesture starts playback');
    const primed = m._preloadedFile.player;
    assert.ok(primed instanceof StreamedTrack);
    assert.equal(primed.gain.gain.value, 0, 'intro remains silent');
    m.preloadFile('battle', { prime: true });
    assert.equal(elements[0].plays, 1, 'repeated gesture does not restart audio');
    m.play('battle', { fade: 0.6 });
    await Promise.resolve();
    assert.equal(m.current, primed, 'GO reuses the same connected player');
    assert.equal(m._preloadedFile, null);
    assert.equal(mediaSources.length, 1, 'never attach a second MediaElementSourceNode');
    assert.equal(elements[0].currentTime, 0, 'GO seeks back to the actual musical opening');
    assert.equal(elements[0].plays, 2, 'the second play on an already-running element is safe');
    assert.equal(m.players.length, 1);
  } finally {
    m.dispose();
    globalThis.Audio = oldAudio;
  }
});

test('failed preload releases player without substituting a synthesized soundtrack', async () => {
  const oldAudio = globalThis.Audio;
  let stopped = 0;
  class DeniedAudio {
    constructor() { this.paused = true; }
    play() { return Promise.reject(new Error('NotAllowedError')); }
    pause() { stopped++; }
    load() {}
    removeAttribute() {}
    addEventListener() {}
    removeEventListener() {}
  }
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param() });
  globalThis.Audio = DeniedAudio;
  const m = new MusicEngine();
  m.ctx = { currentTime: 1, createGain: node, createMediaElementSource: () => node() };
  m.mix = node(); m.offline = false;
  try {
    m.preloadFile('battle', { prime: true });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(m._preloadedFile, null);
    assert.ok(m._fileFailures.has('battle'));
    assert.ok(stopped >= 1, 'denied media element is released immediately');
  } finally {
    m.dispose();
    globalThis.Audio = oldAudio;
  }
});

test('live browser never replaces Jet Arrow with the old battle or final-minute synth when MP3 is unavailable', () => {
  const saved = { audio: globalThis.Audio, window: globalThis.window, timeout: globalThis.setTimeout, clear: globalThis.clearTimeout };
  const jobs = [];
  const fake = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; } });
  globalThis.window = {};
  globalThis.Audio = undefined;
  globalThis.setTimeout = (fn, ms) => { const job = { fn, ms, canceled: false }; jobs.push(job); return job; };
  globalThis.clearTimeout = job => { job.canceled = true; };
  const m = new MusicEngine();
  m.ctx = { currentTime: 2, createGain: () => ({ gain: fake(), connect() {}, disconnect() {} }) };
  m.offline = false;
  m._tick = () => {};
  let errors = 0;
  m.onFileError = () => { errors++; };
  try {
    m.play('battle');
    assert.equal(m.current, null, 'unsupported media must leave BGM silent');
    assert.equal(m.players.length, 0, 'never allocate legacy battle Player');
    assert.equal(jobs.length, 1, 'first Jet Arrow retry scheduled');
    m.play('battle_final', { fade: 0 });
    assert.equal(m.current, null, 'one-minute event must not play the old final-minute song');
    assert.equal(m._desiredTrack, 'battle');
    while (jobs.length) {
      const job = jobs.shift();
      if (!job.canceled) job.fn();
    }
    assert.equal(m._fileRetryCount, 2, 'exactly two bounded MP3 retries');
    assert.equal(m.players.length, 0);
    assert.equal(errors, 1, 'notify only after MP3 retries have failed');
    m.play('battle_final', { fade: 0 });
    assert.equal(errors, 1, 'final minute must not trigger another error toast');
    assert.equal(m.current, null, 'silence is preferable to a substituted track');
  } finally {
    m.dispose();
    globalThis.Audio = saved.audio;
    if (saved.window === undefined) delete globalThis.window; else globalThis.window = saved.window;
    globalThis.setTimeout = saved.timeout;
    globalThis.clearTimeout = saved.clear;
  }
});

test('live final-minute event leaves the same Jet Arrow decoder playing', async () => {
  const original = { audio: globalThis.Audio, window: globalThis.window };
  const elements = [], sources = [];
  class AudioFile {
    constructor() { this.listeners = new Map(); this.plays = 0; this.currentTime = 0; elements.push(this); }
    play() { this.plays++; return Promise.resolve(); }
    pause() {}
    load() {}
    removeAttribute() {}
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
  }
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; } });
  const node = () => ({ gain: param(), connect() {}, disconnect() {} });
  globalThis.Audio = AudioFile;
  globalThis.window = {};
  const m = new MusicEngine();
  m.ctx = { currentTime: 3, createGain: node, createMediaElementSource: element => { sources.push(element); return node(); } };
  m.offline = false;
  m.mix = node(); m.dA = { delayTime: param() }; m.dB = { delayTime: param() };
  m._tick = () => {};
  try {
    m.play('battle');
    await Promise.resolve();
    const originalPlayer = m.current;
    assert.ok(originalPlayer instanceof StreamedTrack);
    m.play('battle_final', { fade: 0 });
    assert.equal(m.current, originalPlayer, 'Jet Arrow continues through the last minute');
    assert.equal(m.players.length, 1);
    assert.equal(elements.length, 1);
    assert.equal(sources.length, 1, 'do not double-connect the decoder');
  } finally {
    m.dispose();
    globalThis.Audio = original.audio;
    if (original.window === undefined) delete globalThis.window; else globalThis.window = original.window;
  }
});

test('live retry is cancelled when the match soundtrack stops', () => {
  const saved = { audio: globalThis.Audio, window: globalThis.window, timeout: globalThis.setTimeout, clear: globalThis.clearTimeout };
  const scheduled = [];
  globalThis.Audio = undefined;
  globalThis.window = {};
  globalThis.setTimeout = fn => { const task = { fn, cleared: false }; scheduled.push(task); return task; };
  globalThis.clearTimeout = task => { task.cleared = true; };
  const m = new MusicEngine();
  m.ctx = { currentTime: 4 };
  m.offline = false;
  m._tick = () => {};
  try {
    m.play('battle');
    assert.equal(scheduled.length, 1);
    m.stop();
    assert.equal(scheduled[0].cleared, true, 'quitting the match cancels pending network retries');
    assert.equal(m._desiredTrack, null);
    assert.equal(m.players.length, 0);
    assert.equal(m._fileRetryTimer, null);
  } finally {
    m.dispose();
    globalThis.Audio = saved.audio;
    if (saved.window === undefined) delete globalThis.window; else globalThis.window = saved.window;
    globalThis.setTimeout = saved.timeout;
    globalThis.clearTimeout = saved.clear;
  }
});
