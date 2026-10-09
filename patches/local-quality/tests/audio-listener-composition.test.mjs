import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const AUDIO = path.join(ROOT, 'inkwave-public/src/audio/audio.js');
const adaptBuildSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const MUSIC_NAMES = ['makeImpulse', 'mulberry32', 'mtof', 'perc', 'ahr', 'adsr', 'pts', 'sweep',
  'strokeWave', 'pulseWave', 'kick', 'snare', 'crash', 'tom', 'brass', 'bell', 'pad', 'bass'];
let cachedAudioEngine;

async function audioEngine() {
  if (cachedAudioEngine) return cachedAudioEngine;
  const context = vm.createContext({ console });
  const config = new vm.SourceTextModule(
    'export const DEFAULT_SETTINGS = { master: 0.8, music: 0.6, sfx: 0.85 };',
    { context, identifier: 'config.js' });
  const music = new vm.SourceTextModule(
    `export class V { constructor(ctx, out, t) { this.ctx = ctx; this.t = t; this.nodes = []; this.dead = false; } }
export function kill() {} export function dispose() {} export function finish() {}
export const music = { _init() {} };
${MUSIC_NAMES.map(name => `export function ${name}() { return {}; }`).join('\n')}`,
    { context, identifier: 'music.js' });
  const source = adaptBuildSource('src/audio/audio.js', fs.readFileSync(AUDIO, 'utf8'));
  assert.match(source, /updateAudioListener\(this, pos, forward, up\)/);
  const modules = new Map();
  const audio = new vm.SourceTextModule(source, { context, identifier: AUDIO });
  modules.set(AUDIO, audio);
  const load = file => {
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) {
      file = path.join(ROOT, path.relative(SRC, file));
    }
    if (file === AUDIO) return audio;
    if (modules.has(file)) return modules.get(file);
    const rel = file.startsWith(path.join(ROOT, 'patches') + path.sep)
      ? path.relative(ROOT, file)
      : file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : null;
    if (!rel) throw new Error(`unexpected module path: ${file}`);
    const code = adaptBuildSource(rel, fs.readFileSync(file, 'utf8'));
    const module = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, module);
    return module;
  };
  await audio.link((specifier, from) => {
    if (specifier === '../config.js') return config;
    if (specifier === './music.js') return music;
    return load(path.resolve(path.dirname(from.identifier), specifier));
  });
  await audio.evaluate();
  cachedAudioEngine = audio.namespace.AudioEngine;
  return cachedAudioEngine;
}

function modernListener(calls) {
  const listener = {};
  for (const name of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) {
    listener[name] = { setTargetAtTime(value, time, constant) { calls.push({ name, value, time, constant }); } };
  }
  return listener;
}

function audioContext(listener, state = 'running') {
  const callbacks = new Set();
  return {
    currentTime: 4,
    state,
    listener,
    addEventListener(name, callback) { if (name === 'statechange') callbacks.add(callback); },
    removeEventListener(name, callback) { if (name === 'statechange') callbacks.delete(callback); },
    resume() {
      this.state = 'running';
      for (const callback of callbacks) callback();
      return Promise.resolve();
    },
  };
}

test('full six-adapter AudioEngine skips identical modern transforms and tracks exact component changes', async () => {
  const AudioEngine = await audioEngine(), calls = [], engine = new AudioEngine({ music: false });
  const ctx = audioContext(modernListener(calls)); engine.ctx = ctx;
  const pos = { x: 1, y: 2, z: 3 }, forward = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 0, z: 0 };
  engine.setListener(pos, forward, up);
  assert.equal(calls.length, 9);
  assert.deepEqual(calls.map(call => call.name), [
    'positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
  ]);
  assert.deepEqual(calls.slice(6).map(call => call.value), [0, 1, 0], 'zero up keeps native default-up behavior');
  assert.ok(calls.every(call => call.time === 4 && call.constant === 0.01), 'keeps native target time and smoothing');

  engine.L.x = -99;
  engine.setListener(pos, forward, up);
  assert.equal(calls.length, 9, 'identical transforms schedule no new AudioParams');
  assert.equal(engine.L.x, 1, 'cached calls still keep AudioEngine.L current for source distance updates');

  pos.x += Number.EPSILON; forward.y = Number.MIN_VALUE;
  engine.setListener(pos, forward, up);
  assert.deepEqual(calls.slice(9).map(call => call.name), ['positionX', 'forwardY'],
    'finite sub-pixel changes are retained without scheduling unchanged components');
  assert.deepEqual(calls.slice(9).map(call => call.value), [pos.x, forward.y]);
});

test('new contexts, listener objects, and AudioContext resume force a fresh modern listener sync', async () => {
  const AudioEngine = await audioEngine(), engine = new AudioEngine({ music: false });
  const pos = { x: 2, y: 3, z: 4 }, forward = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 };
  const firstCalls = []; engine.ctx = audioContext(modernListener(firstCalls));
  engine.setListener(pos, forward, up); engine.setListener(pos, forward, up);
  assert.equal(firstCalls.length, 9);

  const secondCalls = [], secondContext = audioContext(modernListener(secondCalls));
  engine.ctx = secondContext;
  engine.setListener(pos, forward, up);
  assert.equal(secondCalls.length, 9, 'context identity forces all current listener values');

  const replacementCalls = [];
  secondContext.listener = modernListener(replacementCalls);
  engine.setListener(pos, forward, up);
  assert.equal(replacementCalls.length, 9, 'listener identity forces all current listener values');

  secondContext.state = 'suspended';
  engine.resume();
  engine.setListener(pos, forward, up);
  assert.equal(replacementCalls.length, 18, 'resume statechange invalidates a previously identical transform');
});

test('legacy listener setters keep identical, invalid-input, and default-up behavior', async () => {
  const AudioEngine = await audioEngine(), engine = new AudioEngine({ music: false }), calls = [];
  const listener = {
    setPosition(...values) { calls.push({ name: 'position', values }); },
    setOrientation(...values) { calls.push({ name: 'orientation', values }); },
  };
  engine.ctx = audioContext(listener);
  const pos = { x: 0, y: 1, z: 2 }, forward = { x: 0, y: 0, z: -1 }, zeroUp = { x: 0, y: 0, z: 0 };
  engine.setListener(pos, forward, zeroUp);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].values, [0, 0, -1, 0, 1, 0]);
  engine.setListener(pos, forward, zeroUp);
  assert.equal(calls.length, 2, 'legacy identical position and orientation are not resubmitted');

  pos.x = Number.MIN_VALUE;
  engine.setListener(pos, forward, zeroUp);
  assert.equal(calls.length, 3, 'tiny finite position changes reach legacy setPosition');
  assert.equal(calls[2].name, 'position');

  const beforeInvalid = { ...engine.L };
  engine.setListener({ x: Infinity, y: 5, z: 6 }, { x: 1, y: 0, z: 0 }, zeroUp);
  assert.deepEqual({ ...engine.L }, beforeInvalid, 'invalid position preserves the native early return');
  assert.equal(calls.length, 3);

  engine.setListener({ x: 2, y: 1, z: 2 }, null, zeroUp);
  assert.deepEqual(calls[3], { name: 'position', values: [2, 1, 2] });
  assert.equal(calls.length, 4, 'invalid forward keeps the prior orientation untouched');
});
