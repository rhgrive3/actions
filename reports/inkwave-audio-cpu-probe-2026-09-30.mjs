// Run from repo root: node reports/inkwave-audio-cpu-probe-2026-09-30.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';

const base = 'd5d54d1d37274dfa82467b37b9b8009719783ed3';
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const blob = s => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(s) + '\0').update(s).digest('hex');
function source(path, expected) {
  const before = process.env.INKWAVE_BASELINE_DIR ? fs.readFileSync(process.env.INKWAVE_BASELINE_DIR + '/' + path, 'utf8')
    : execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' });
  if (expected) assert.equal(blob(before), expected);
  const after = fs.readFileSync(path, 'utf8');
  return { before, after, hashes: { before: hash(before), after: hash(after) } };
}
const net = source('inkwave-public/src/net/netmatch.js');
const music = source('inkwave-public/src/audio/music.js', '81985125bac1ce6989e5a03a91a5d080a73c8b79');
const strip = s => s.replace(/^import .*;\n/gm, '').replace(/\bexport (?=(class|const|function)\b)/g, '').replace(/^export \{.*\};\n/gm, '');

function voices(source) {
  const counts = { closures: 0, nearQueries: 0, starts: 0, sets: 0, stops: 0 };
  source = source.replace('const want = (key, on, snd, set) => {', 'counts.closures += 4; const want = (key, on, snd, set) => {');
  const G = {}, log = [];
  let id = 0, requests = 0;
  const audio = { loop(name, opts) {
    requests++;
    if (requests % 37 === 0) { log.push(['unavailable', name]); return undefined; }
    const serial = ++id; counts.starts++;
    log.push(['start', serial, name, opts.pos.toArray(), opts.volume]);
    return { id: serial, set(opts) { counts.sets++; log.push(['set', serial, opts.pos.toArray(), opts.volume, opts.pitch]); },
      stop(fade) { counts.stops++; log.push(['stop', serial, fade]); } };
  } };
  const NetMatch = vm.runInNewContext(strip(source) + '\nNetMatch', { THREE, G, counts, performance: { now: () => 0 },
    PLAYER: { gravity: 25 }, WEAPONS: {}, on() {}, emit() {} });
  const nm = new NetMatch({ myId: 'self', isHost: false }, {});
  for (let i = 0; i < 7; i++) nm.byNid.set(i, { remote: true, alive: true, near: true,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), weapon: { kind: 'charger' }, weaponRunner: {}, net: { loops: {} },
    _nearCamera() { counts.nearQueries++; return this.near; } });
  return { G, audio, nm, counts, log };
}
const voice = [voices(net.before), voices(net.after)], voiceTrace = crypto.createHash('sha256');
for (let frame = 0; frame < 3600; frame++) {
  for (const r of voice) {
    r.log.length = 0; r.G.audio = frame % 450 < 37 ? undefined : r.audio;
    for (const [i, a] of r.nm.byNid) {
      a.remote = i !== 6 || frame < 3200;
      a.alive = (frame + i * 11) % 151 > 8;
      a.near = (frame + i * 7) % 240 > 45;
      a.weapon.kind = ['charger', 'splatling', 'roller', 'dualies'][Math.floor(frame / 400 + i) % 4];
      a.weapon.rollSpeed = frame % 600 < 300 ? 5.3 : undefined;
      a.weaponRunner.charging = (frame + i * 13) % 113 < 65;
      a.weaponRunner.streaming = (frame + i * 17) % 143 < 49;
      a.weaponRunner.rolling = (frame + i * 9) % 97 < 38;
      a.weaponRunner.charge = ((frame + i) % 100) / 100;
      a.pos.set(Math.sin(frame * 0.01 + i) * 20, i * 0.3, Math.cos(frame * 0.007) * 14);
      a.vel.set(Math.cos(frame * 0.01) * 7, 0, Math.sin(frame * 0.014 + i) * 6);
    }
    r.nm._voices(1 / 60);
  }
  assert.deepEqual(voice[0].log, voice[1].log, 'voice frame ' + frame);
  const state = r => Array.from(r.nm.byNid, ([i, a]) => [i, Object.entries(a.net.loops).map(([key, h]) => [key, h && h.id])]);
  assert.deepEqual(state(voice[0]), state(voice[1]));
  voiceTrace.update(JSON.stringify(voice[0].log));
}
for (const r of voice) for (const a of r.nm.byNid.values()) r.nm._stopLoops(a);
assert.deepEqual(voice[0].log, voice[1].log);

function dsp(source) {
  const counts = { exp: 0, sin: 0, cos: 0, random: 0 };
  const math = Object.create(Math);
  for (const name of ['exp', 'sin', 'cos']) math[name] = (...args) => { counts[name]++; return Math[name](...args); };
  source = source.replace('return function () {', 'return function () { counts.random++;');
  const end = source.indexOf('\nconst fmin ='); assert(end > 0);
  const api = vm.runInNewContext(strip(source.slice(0, end)) + '\n({makeImpulse, strokeWave})',
    { Math: math, counts, Float32Array, Float64Array });
  return { ...api, counts };
}
const impulseCases = [
  [48000, 1.5, 3.4, { pre: 0.012, seed: 3 }], // AudioEngine.init actual arguments
  [44100, 1.6, 3.2, {}], [96000, 0.18, 0.4, { pre: 0, seed: 19, bright: 0.4, dark: 0.03 }],
  [22050, 0.05, 8, { pre: 0.004, seed: -17, taps: [[0, 0.7], [0.007, -0.2]] }],
  [8000, 0.01, 3.2, { pre: 0.1 }], [48000, 0, 3.2, { pre: 0 }],
  [16000, 0.04, 1.2, { seed: '3', bright: 0, dark: 1, taps: [] }],
];
const impulse = [];
for (const [sr, seconds, decay, opts] of impulseCases) {
  const runtimes = [dsp(music.before), dsp(music.after)];
  const context = () => ({ sampleRate: sr, createBuffer(channels, n) {
    const data = Array.from({ length: channels }, () => new Float32Array(n));
    return { data, getChannelData: ch => data[ch] };
  } });
  const a = runtimes[0].makeImpulse(context(), seconds, decay, opts), b = runtimes[1].makeImpulse(context(), seconds, decay, opts);
  const trace = crypto.createHash('sha256');
  for (let ch = 0; ch < 2; ch++) {
    const bytes = data => new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    assert.deepEqual(bytes(a.data[ch]), bytes(b.data[ch]), 'impulse channel ' + ch);
    trace.update(bytes(a.data[ch]));
  }
  assert.equal(runtimes[0].counts.random, runtimes[1].counts.random);
  impulse.push({ sampleRate: sr, seconds, decay, opts, samplesPerChannel: a.data[0].length,
    baseline: runtimes[0].counts, fixed: runtimes[1].counts, stereoBytesEqual: true, stereoSha256: trace.digest('hex') });
}
const waves = [];
for (const sharp of [0, 0.25, 1, 4, 7, 9, 12, 25, 80, -2]) {
  const runtimes = [dsp(music.before), dsp(music.after)];
  const context = () => ({ calls: 0, createPeriodicWave(re, im) {
    this.calls++; assert(re instanceof Float32Array && im instanceof Float32Array);
    return { re: re.slice(), im: im.slice() };
  } });
  const contexts = [context(), context()];
  const a = runtimes[0].strokeWave(contexts[0], sharp), b = runtimes[1].strokeWave(contexts[1], sharp);
  assert.deepEqual(a.re, b.re); assert.deepEqual(a.im, b.im);
  const trace = crypto.createHash('sha256'); trace.update(new Uint8Array(a.re.buffer)); trace.update(new Uint8Array(a.im.buffer));
  const beforeCounts = runtimes.map(r => ({ ...r.counts }));
  for (let i = 0; i < 2; i++) {
    assert.equal(runtimes[i].strokeWave(contexts[i], sharp), i === 0 ? a : b);
    assert.equal(contexts[i].calls, 1); assert.deepEqual(runtimes[i].counts, beforeCounts[i]);
  }
  waves.push({ sharp, baseline: runtimes[0].counts, fixed: runtimes[1].counts,
    float32CoefficientsEqual: true, cachedIdentityUnchanged: true, coefficientSha256: trace.digest('hex') });
}
console.log(JSON.stringify({ baseCommit: base, sourceSha256: { netmatch: net.hashes, music: music.hashes },
  voices: { frames: 3600, actors: 7, baseline: voice[0].counts, fixed: voice[1].counts,
    allLoopCallsAndHandleStatesEqual: true, callTraceSha256: voiceTrace.digest('hex') }, impulse, waves,
  scope: 'Actual JS functions in Node VM. Audio handles/context stubbed; compare call order, Float32 impulse bytes and PeriodicWave coefficients. No audio playback, OfflineAudioContext, mobile/FPS/GC timing measurement.' }, null, 2));
