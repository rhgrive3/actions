import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const FORM_RUNTIME = path.join(ROOT, 'patches/splatoon3/runtime/form-motion.mjs');
// Immutable b34 subject control is tracked so shallow and archive checkouts
// exercise the same native comparison without fetching repository history.
const BASELINE_FORM_RUNTIME = fileURLToPath(new URL('./fixtures/form-motion.b34a8aaf.source.txt', import.meta.url));
const BASELINE_SHA256 = 'f1ff0e192b4389a8b7e43a6b2ea98b7eb3fc1ec53e047aa47ce8ee14e868bed5';
const adaptBuildSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

function replaceExactlyOnce(source, before, after) {
  const index = source.indexOf(before);
  assert.notEqual(index, -1, `instrumentation anchor missing: ${before}`);
  assert.equal(source.indexOf(before, index + before.length), -1, `instrumentation anchor duplicated: ${before}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function instrumentRuntime(source, legacy) {
  source = replaceExactlyOnce(source, 'const states = new WeakMap();',
    'const states = globalThis.__formMotionStates = new WeakMap();');
  if (legacy) return replaceExactlyOnce(source, 'function shape(ch) {',
    'function shape(ch) { globalThis.__formMotionRecordAllocations++;');
  return replaceExactlyOnce(source, 'function makeShapeRecord() {',
    'function makeShapeRecord() { globalThis.__formMotionRecordAllocations++;');
}

async function production({ legacy = false } = {}) {
  const context = vm.createContext({ console, performance, URL, __formMotionRecordAllocations: 0 });
  vm.runInContext(`globalThis.__testSeed = 0x12345678;
    Math.random = () => { globalThis.__testSeed = (Math.imul(globalThis.__testSeed, 1664525) + 1013904223) >>> 0; return globalThis.__testSeed / 0x100000000; };`, context);
  const modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    let source = file === FORM_RUNTIME && legacy
      ? fs.readFileSync(BASELINE_FORM_RUNTIME, 'utf8')
      : fs.readFileSync(file, 'utf8');
    if (file === FORM_RUNTIME && legacy) {
      assert.equal(createHash('sha256').update(source).digest('hex'), BASELINE_SHA256, 'frozen b34 control changed');
    }
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file)
      : file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : null;
    if (rel && /\.(?:m?js)$/.test(file)) source = adaptBuildSource(rel, source);
    if (file === FORM_RUNTIME) source = instrumentRuntime(source, legacy);
    const module = new vm.SourceTextModule(source, {
      context, identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, module);
    return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installFormMotion, formMotionSnapshot, resetFormMotion } from './patches/splatoon3/runtime/form-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'form-motion-allocation-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installFormMotion(api, profile);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  return { api, context };
}

function rig(runtime, name) {
  const { api } = runtime, { Actor, Character, G, THREE } = api;
  const actor = new Actor({ team: 0, name, weapon: 'shooter', CharacterClass: Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = actor.character; ch.actor = actor; ch.onEvent = null;
  ch.s3FormMotionEnabled = true; ch.s3CarryMotionEnabled = false;
  G.scene.add(ch.root); G.actors.push(actor); actor.grounded = actor.ground.hit = true;
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(key => [key, () => {}]));
  return {
    actor, ch, api, runtime,
    step(dt = 1 / 60) {
      G.time += dt; actor.weaponRunner.update(dt, {}); actor._finishFrame(dt);
      return trajectory(actor, ch, api, runtime);
    },
    close() { G.actors = G.actors.filter(item => item !== actor); ch.dispose(); },
  };
}

function recordValues(record) {
  return record && [record.k, record.s, record.ky, record.kx, record.sy, record.sx, record.lift];
}

function trajectory(actor, ch, api, runtime) {
  const channels = api.CHARACTER_CHANNELS;
  const state = runtime.context.__formMotionStates.get(ch);
  return {
    actor: { pos: Array.from(actor.pos.toArray()), vel: Array.from(actor.vel.toArray()), form: actor.form,
      submerged: actor.submerged, ink: actor.ink, hp: actor.hp,
      move: Array.from(actor.intent.move.toArray()), fire: actor.intent.fire, sub: actor.intent.sub },
    character: { form: ch.form, formPrev: ch.formPrev, formT: ch.formT,
      scales: [ch.kidScale, ch.sqScale, ch.kidSY, ch.kidSXZ, ch.sqSY, ch.sqSXZ, ch.kidLift, ch.kidPop],
      visible: [ch.kid.visible, ch.squidRoot.visible],
      formPose: [ch.P[channels.SPINE], ch.P[channels.CHEST], ch.P[channels.HIPS_P + 1]],
      timers: Array.from(ch.tr), motion: { phase: state.phase, age: state.age,
        reversing: !!state.start, blocked: state.blocked, previous: recordValues(state.previous),
        start: recordValues(state.start) } },
  };
}

function firstDifference(actual, expected, at = 'root') {
  if (Object.is(actual, expected)) return null;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') {
    return { at, actual, expected };
  }
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    const difference = firstDifference(actual[key], expected[key], `${at}.${key}`);
    if (difference) return difference;
  }
  return null;
}

function setForm(rigs, value) {
  for (const { actor } of rigs) {
    actor.form = value === 'kid' ? 'kid' : 'squid';
    actor.submerged = value === 'swim'; actor.climbing = false;
  }
}

function motionState(rigged) {
  const state = rigged.runtime.context.__formMotionStates.get(rigged.ch);
  return state && { toKid: state.toKid, clock: state.clock, age: state.age, phase: state.phase,
    reversing: !!state.start, blocked: state.blocked, previous: state.previous && { ...state.previous } };
}

test('full six-adapter native Actor keeps form trajectories identical and reuses per-Character snapshots', async () => {
  const baseline = await production({ legacy: true }), optimized = await production();
  baseline.context.__testSeed = 0x12345678;
  const old = rig(baseline, 'form allocation baseline');
  optimized.context.__testSeed = 0x12345678;
  const current = rig(optimized, 'form allocation optimized');
  const rigs = [old, current];
  let frame = 0;
  const bothStep = (dt = 1 / 60) => {
    const seed = (0x12345678 + frame++) >>> 0;
    baseline.context.__testSeed = seed;
    const expected = old.step(dt);
    optimized.context.__testSeed = seed;
    const actual = current.step(dt);
    const difference = firstDifference(actual, expected);
    assert.deepEqual(actual, expected, difference ?
      `native Actor/Character trajectory differs at frame=${frame} dt=${dt}: ${JSON.stringify({
        difference, baselineState: motionState(old), optimizedState: motionState(current),
        baselineFidget: old.ch.fidget, optimizedFidget: current.ch.fidget,
        baselineTimer: Array.from(old.ch.tr), optimizedTimer: Array.from(current.ch.tr),
        baselineSeed: baseline.context.__testSeed, optimizedSeed: optimized.context.__testSeed,
      })}` : 'native Actor/Character trajectory differs');
  };
  try {
    for (let i = 0; i < 90; i++) bothStep();
    const idleCount = optimized.context.__formMotionRecordAllocations;
    for (const dt of [1 / 60, 1 / 120, 1 / 30, 0, 1 / 144]) {
      for (let i = 0; i < 12; i++) bothStep(dt);
    }
    assert.equal(optimized.context.__formMotionRecordAllocations, idleCount,
      'steady updates across different frame intervals allocate no additional form-shape records');
    assert.equal(baseline.context.__formMotionRecordAllocations, 90 + 60,
      'the frozen main implementation reproduces one shape snapshot per update');

    setForm(rigs, 'swim'); bothStep(1 / 60); bothStep(1 / 30); bothStep(0);
    setForm(rigs, 'kid'); bothStep(1 / 60);
    const state = optimized.context.__formMotionStates.get(current.ch);
    assert.ok(state?.start, 'the native Actor sequence entered an interrupted form reversal');
    assert.notStrictEqual(state.previous, state.start, 'previous and reversal start records never alias');
    assert.notStrictEqual(state.startBuffer, state.currentBuffer, 'the active blend record is independent');
    assert.notStrictEqual(state.currentBuffer, state.previous, 'current and previous records are independent');
    const afterFirstReverse = optimized.context.__formMotionRecordAllocations;

    for (let i = 0; i < 12; i++) bothStep(i % 2 ? 1 / 120 : 1 / 60);
    setForm(rigs, 'swim');
    for (let i = 0; i < 12; i++) bothStep(i % 2 ? 1 / 30 : 1 / 60);
    setForm(rigs, 'kid');
    for (let i = 0; i < 18; i++) bothStep(i % 3 ? 1 / 60 : 0);
    assert.equal(optimized.context.__formMotionRecordAllocations, afterFirstReverse,
      'later transitions and reversals reuse the per-Character records');

    for (const item of rigs) item.ch.s3FormMotionEnabled = false;
    for (let i = 0; i < 20; i++) bothStep(i % 2 ? 1 / 60 : 0);
    assert.equal(optimized.context.__formMotionRecordAllocations, afterFirstReverse,
      'disabled form motion refreshes its previous record without allocating');
    assert.ok(baseline.context.__formMotionRecordAllocations > optimized.context.__formMotionRecordAllocations);

    const peer = rig(optimized, 'second independent character');
    peer.step();
    const peerState = optimized.context.__formMotionStates.get(peer.ch);
    assert.notStrictEqual(peerState.previous, state.previous, 'different Characters own different records');
    peer.close();
    assert.equal(optimized.context.__formMotionStates.get(peer.ch), undefined, 'dispose deletes the WeakMap state');
    assert.equal(optimized.api.formMotionSnapshot(peer.ch), null);

    current.close(); old.close();
    assert.equal(optimized.context.__formMotionStates.get(current.ch), undefined);
    assert.equal(optimized.api.formMotionSnapshot(current.ch), null);
  } finally {
    old.close(); current.close();
  }
});
