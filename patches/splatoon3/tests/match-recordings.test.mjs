// Owner-supplied match recordings (Drive, 2026-11-03): runtime fallback/playback
// semantics with a fake AudioContext, the exact shipped files, and the final
// composed anchors. Logic only: no browser playback or device listening test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { installMatchRecordings, MATCH_RECORDINGS, loadMatchRecording } from '../runtime/audio/match-recordings.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = new URL('../../../', import.meta.url);
const asset = name => new URL('inkwave-public/assets/audio/' + name, ROOT);

function fakeContext(durations) {
  const started = [], stopped = [];
  const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });
  const ctx = {
    state: 'running', currentTime: 10,
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createBufferSource() {
      const s = { buffer: null, onended: null, connect() {}, disconnect() {}, start(at, offset = 0) { started.push({ s, at, offset }); }, stop(at) { stopped.push(at); } };
      return s;
    },
    decodeAudioData: async bytes => ({ duration: durations.get(bytes.byteLength), sampleRate: 48000 }),
  };
  return { ctx, started, stopped };
}
function engineClass() {
  class Engine {
    constructor(ctx) { this.ctx = ctx; this.offline = false; this.musicBus = { bus: 'music' }; this.sfxIn = { bus: 'sfx' }; this.synth = []; this.stopped = 0; }
    play(name, o) { this.synth.push(name); return { synth: name }; }
    stopAll() { this.stopped++; }
  }
  installMatchRecordings(Engine);
  return Engine;
}
function fetcherFor(sizes) {
  return async url => {
    const name = Object.keys(sizes).find(n => String(url).endsWith(n));
    return { ok: !!name, status: name ? 200 : 404, arrayBuffer: async () => new ArrayBuffer(sizes[name]) };
  };
}

test('shipped recordings are the exact Drive files with their measured durations', () => {
  const expected = {
    'battle_opening.mp3': 'fee4f839ed5f3538dc02e9c414833755af5c31e0a3fb81f29a2866c3405b97b6',
    'result_victory_jingle.mp3': '932b907103e547c45a86ff64bf336397c64858ab047c6aa91ba656702950ee65',
    'result_defeat_jingle.mp3': '670bd6f59a06fcdba93bf9077c00b39068231837c893278d86cdd8806d74e924',
    'result_win_turf_master.mp3': 'fd9b3cbfaab82da4efcd8f6f1375fc603dc14fda0cad8661222933b65b3c64e6',
    'result_lose_battle_defeat.mp3': 'dee2a28e8856b76cd633a683e2c581bd950c77413bd89cb1f00cd8f0b9faed45',
    'UI_VS_ResultMeter_00.mp3': 'f9f5210e4acf6f117b9770da651767dbc412f21041456125dba944742b59c336',
  };
  for (const [name, sha] of Object.entries(expected))
    assert.equal(createHash('sha256').update(fs.readFileSync(asset(name))).digest('hex'), sha, name);
  for (const spec of Object.values(MATCH_RECORDINGS)) assert.ok(fs.statSync(asset(spec.file)).size <= spec.maxBytes, spec.file);
});

test('cues keep the synthesized sound until decoded, then play the recording on the right bus', async () => {
  const sizes = { 'result_victory_jingle.mp3': 192678, 'result_defeat_jingle.mp3': 219619, 'UI_VS_ResultMeter_00.mp3': 61677 };
  const durations = new Map([[192678, 5.825], [219619, 6.922], [61677, 2.544]]);
  const { ctx, started } = fakeContext(durations);
  const Engine = engineClass(), e = new Engine(ctx);
  e._matchRecordingsFetcher = fetcherFor(sizes);
  // Not loaded yet: the original synthesized cue still plays (and starts the load).
  assert.deepEqual(e.play('judge_drumroll'), { synth: 'judge_drumroll' });
  for (const name of Object.keys(MATCH_RECORDINGS)) await loadMatchRecording(e, name);
  const meter = e.play('judge_drumroll'), win = e.play('victory_fanfare');
  assert.equal(meter.recorded, true); assert.equal(win.recorded, true);
  assert.equal(started.length, 2);
  assert.equal(started[0].offset, 0, 'the meter starts at its head');
  assert.equal(started[1].offset, MATCH_RECORDINGS.victory_fanfare.lead, 'the victory jingle starts after its silence');
  assert.deepEqual(e.synth, ['judge_drumroll'], 'no synthesized duplicate once recorded');
  // The jingles skip their leading silence (owner request 2026-11-07).
  assert.ok(Math.abs(e.recordedCueSeconds('defeat_jingle') - (6.922 - MATCH_RECORDINGS.defeat_jingle.lead)) < 1e-9);
  assert.ok(MATCH_RECORDINGS.victory_fanfare.lead > .3 && MATCH_RECORDINGS.defeat_jingle.lead > .3);
  assert.equal(e.recordedCueSeconds('reveal'), null);
  // Unrelated sounds are untouched.
  assert.deepEqual(e.play('judge_reveal'), { synth: 'judge_reveal' });
  // stopAll (quit / rematch) silences recorded cues too.
  e.stopAll(0.1); assert.equal(e.stopped, 1);
  assert.equal(meter.done, false, 'stop schedules a fade, onended releases');
  for (const { s } of started) s.onended?.();
  assert.equal(meter.done, true);
});

test('a missing or mismatched recording falls back to the synthesized cue', async () => {
  const durations = new Map([[61677, 9]]);
  const { ctx } = fakeContext(durations);
  const Engine = engineClass(), e = new Engine(ctx);
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(await loadMatchRecording(e, 'judge_drumroll', { fetcher: fetcherFor({ 'UI_VS_ResultMeter_00.mp3': 61677 }) }), null);
    assert.equal(await loadMatchRecording(e, 'victory_fanfare', { fetcher: fetcherFor({}) }), null);
  } finally { console.warn = warn; }
  assert.deepEqual(e.play('judge_drumroll'), { synth: 'judge_drumroll' });
  assert.deepEqual(e.play('victory_fanfare'), { synth: 'victory_fanfare' });
  assert.equal(e.recordedCueSeconds('victory_fanfare'), null);
});

test('final composed sources route opening/results to the files and delay results BGM after the jingle', () => {
  const read = rel => adaptBuildSource(rel, fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8'));
  const music = read('src/audio/music.js'), stream = read('src/audio/streamedTrack.js'), main = read('src/main.js'), audio = read('src/audio/audio.js');
  for (const [track, file] of [['opening', 'battle_opening.mp3'], ['results_win', 'result_win_turf_master.mp3'], ['results_lose', 'result_lose_battle_defeat.mp3']])
    assert.equal(music.split(`  ${track}: new URL('../../assets/audio/${file}', import.meta.url).href,`).length, 2, track);
  assert.match(music, /const REQUIRED_FILE_TRACKS = new Set\(\['menu', 'battle'\]\);/, 'menu/battle stay the only required tracks');
  assert.match(music, /for \(const track of Object\.keys\(FILE_TRACK_URLS\)\) \{/, 'every file track is gesture-unlocked');
  assert.match(stream, /element\.loop = id !== 'opening';/);
  assert.match(main, /recordedCueSeconds\?\.\(won \? 'victory_fanfare' : 'defeat_jingle'\)/);
  assert.equal(audio.split("installMatchRecordings(AudioEngine);").length, 2);
});
