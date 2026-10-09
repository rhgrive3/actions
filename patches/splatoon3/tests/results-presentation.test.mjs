import { syncPortraitFrame } from '../../local-quality/portrait-guard.mjs';
import { effectiveQuality } from '../../../inkwave-public/src/config.js';
import { idleAttractMenuBudget } from '../../local-quality/idle-resources.mjs';
import { updateSplatGhosts } from '../issue-284-adapter.mjs';
// #53: results presentation keeps only the draw/animation work it needs.
// The test drives the actually composed (installed) Game._frame — the full
// adapter chain output, not a mirror of the guard — and compares PLAYING vs
// RESULT work counters: gameplay FX and the paint atlas must stop behind
// RESULT (offline and online) while the results stage, GUI, backdrop draw and
// renderer keep running, and every counter resumes when a new match starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../../local-quality/tests/idle-fixture.mjs';
import { pausedWorldFrame } from '../../local-quality/idle-resources.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { fixture as nativeActorFixture } from './source-fixture.mjs';
import { installClock, installGame, runSimulation } from '../runtime/clock.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Keep the same ordered source adapters used by scripts/build-inkwave.mjs.
function productionMain() {
  const rel = 'src/main.js';
  const source = fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
  return adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel,
    adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source))))));
}

function matchClass(api) {
  const source = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/match.js'), 'utf8');
  const method = (begin, end) => {
    const start = source.indexOf(begin), finish = source.indexOf(end, start);
    assert.ok(start >= 0 && finish > start, `native Match source contains ${begin.trim()}`);
    return source.slice(start, finish);
  };
  const native = [
    method('  constructor(opts) {', '\n  playing() {'),
    method('  playing() {', '\n  canRespawn() {'),
    method('  canRespawn() {', '\n  setup() {'),
    method('  dispose() {', '\n  // Online, humans-only stage'),
    method('  update(dt) {', '\n  updateController(dt) {'),
    method('  updateController(dt) {', '\n  _judge() {'),
  ].join('\n');
  return new Function('G', 'MATCH', 'PLAYER', `return class NativeMatch {\n${native}\n}`)(api.G, api.MATCH, api.PLAYER);
}

async function nativeFrameFixture() {
  const api = await nativeActorFixture();
  const { G } = api;
  const calls = {}, count = key => (...args) => {
    calls[key] = (calls[key] || 0) + 1;
    return args;
  };
  const vector = { copy() { return this; }, set() { return this; }, getWorldDirection() { return this; } };
  Object.assign(G, {
    time: 0, level: {}, camera: { position: vector, up: vector },
    renderer: { info: { reset: count('info'), render: { calls: 0, triangles: 0 } }, shadowMap: { needsUpdate: false } },
    env: { theme: 'day', update: count('env') }, fx: { update: count('fx') },
    projectiles: {
      update: count('projectile'),
      updateArc(_actor, show) { count('arc')(); if (show) count('arcShown')(); },
    },
    paint: { sample: () => 1, splat: () => 0, flush: count('paint') },
    scene: { remove: count('actorRemoved') },
  });
  const input = { padPressed: new Set(), pollPad: count('pollPad'), endFrame: count('endFrame') };
  const source = productionMain();
  const slice = (begin, end) => {
    const start = source.indexOf(begin), finish = source.indexOf(end, start);
    assert.ok(start >= 0 && finish > start, `production-composed main.js contains ${begin.trim()}`);
    return source.slice(start, finish);
  };
  const frame = slice('  _frame(dt) {', '\n  // continuous sounds');
  const loop = slice('  _loop() {', '\n  // keep weaker GPUs playable');
  const Game = new Function('G', 'runSimulation', 'pausedWorldFrame', 'performance', 'damp', 'clamp', 'THREE', 'syncPortraitFrame', 'idleAttractMenuBudget', 'updateSplatGhosts', 'effectiveQuality',
    `return class Game {\n${frame}\n${loop}\n}`)
    (G, runSimulation, pausedWorldFrame, performance, api.damp, api.clamp, api.THREE, syncPortraitFrame, idleAttractMenuBudget, updateSplatGhosts, effectiveQuality);
  const f = new Game();
  Object.assign(f, {
    input, settings: { quality: 'high', frameRate: 'display' }, timer: { update() {}, getDelta: () => 1 / 60 },
    match: null, showcase: { fullFrame: false, mode: 'results', update: count('showcase'), render: count('showcaseRender') },
    R: { render: count('worldRender'), grade: { uniforms: {
      uHurt: { value: 0 }, uHurtColor: { value: { copy() {} } },
    } } },
    diorama: { update: count('diorama') }, decor: { update: count('decor') }, props: { update: count('props') },
    levelMat: { userData: { uniforms: {
      uTime: { value: 0 }, uSeeOn: { value: 0 }, uSeeA: { value: vector }, uSeeB: { value: vector },
    } } },
    rig: { update: count('rig'), setMap() {}, mapK: 0, mode: 'follow', target: null, follow() {} },
    _dioFog: count('fog'), menus: { update: count('ui'), current: null },
    screenfx: { update: count('screenfx') }, fxHooks: { update: count('fxHooks') },
    swimWake: { update: count('wake') }, _updateLocalLoops: count('loops'), _updateAmbience: count('ambience'),
    _dynRes() {}, _padMenus: count('padMenus'), fpsAcc: 0, fpsN: 0, frozen: false,
  });
  const Match = matchClass(api);
  const makeMatch = (state = 'playing') => {
    const actor = api.make('shooter');
    const nativeActorUpdate = actor.update;
    actor._resultsProbeUpdates = 0;
    actor.update = function (dt) {
      this._resultsProbeUpdates++;
      count('actor')();
      return nativeActorUpdate.call(this, dt);
    };
    const match = new Match({ duration: 1000, mode: 'turf', range: true });
    Object.assign(match, { state, stateT: 0, time: 1000, actors: [actor], local: actor, controller: null, paused: false, attract: false });
    const nativeUpdate = match.update, nativeController = match.updateController;
    match.update = function (dt) { count('match')(); return nativeUpdate.call(this, dt); };
    match.updateController = function (dt) { count('controller')(); return nativeController.call(this, dt); };
    G.match = match; G.actors = match.actors;
    return match;
  };
  installClock({ G });
  f.match = makeMatch();
  return { api, G, f, calls, makeMatch };
}

function frameFixture() {
  const source = compose('src/main.js');
  const start = source.indexOf('  _frame(dt) {'), end = source.indexOf('\n  // continuous sounds', start);
  assert.ok(start >= 0 && end > start, 'composed Game._frame is present');
  const calls = {}, count = k => () => { calls[k] = (calls[k] || 0) + 1; };
  const vector = { copy() {}, set() {}, getWorldDirection() { return this; } };
  const G = {
    time: 1, level: {}, teamColors: [{}, {}],
    renderer: { info: { reset: count('info'), render: { calls: 0, triangles: 0 } }, shadowMap: { needsUpdate: false } },
    env: { theme: 'day', update: count('env') }, fx: { update: count('fx') },
    projectiles: { updateArc: count('arc') }, paint: { flush: count('paint') },
    camera: { position: vector, up: vector },
  };
  const Frame = new Function('G', 'runSimulation', 'pausedWorldFrame', 'performance', 'damp', 'clamp', 'THREE', 'syncPortraitFrame', 'idleAttractMenuBudget', 'updateSplatGhosts', 'effectiveQuality',
    'return class Frame {\n' + source.slice(start, end) + '\n}')
    (G, count('simulation'), pausedWorldFrame, performance, (a, b) => b, x => x, {}, syncPortraitFrame, idleAttractMenuBudget, updateSplatGhosts, effectiveQuality);
  const f = new Frame();
  f.settings = { quality: 'high' };
  f.match = { paused: false, attract: false, state: 'playing', local: null, actors: [] };
  f.showcase = { fullFrame: false, mode: 'results', update: count('showcase'), render: count('showcaseRender') };
  f.diorama = { update: count('diorama') };
  f.R = { render: count('worldRender'), grade: { uniforms: { uHurt: { value: 0 } } } };
  f.decor = { update: count('decor') };
  f.props = { update: count('props') };
  f.levelMat = { userData: { uniforms: { uTime: { value: 0 }, uSeeOn: { value: 0 }, uSeeA: { value: vector }, uSeeB: { value: vector } } } };
  f.rig = { update: count('rig'), setMap() {}, mapK: 0, mode: 'follow', target: null, follow() {} };
  f._dioFog = count('fog');
  f.menus = { update: count('ui'), current: null };
  f.screenfx = { update: count('screenfx') };
  f.fxHooks = { update: count('fxHooks') };
  f.swimWake = { update: count('wake') };
  f._updateLocalLoops = count('loops');
  f._updateAmbience = count('ambience');
  return { source, G, f, calls };
}
const snapshot = calls => ({ ...calls });
const delta = (now, before) => Object.fromEntries(Object.keys(now).map(k => [k, now[k] - (before[k] || 0)]));
const GAMEPLAY_WORK = ['fx', 'fxHooks', 'paint', 'wake'];

test('composed Game._frame stops gameplay FX and the paint atlas behind RESULT, keeps stage/GUI/draw', () => {
  const { source, G, f, calls } = frameFixture();
  assert.match(source, /resultsQuiet/, 'the installed frame carries the results presentation gate');
  for (let i = 0; i < 60; i++) f._frame(1 / 60);
  const playing = snapshot(calls);
  assert.equal(playing.fx, 60); assert.equal(playing.fxHooks, 60);
  assert.equal(playing.paint, 60); assert.equal(playing.wake, 60);
  assert.equal(playing.worldRender, 60); assert.equal(playing.showcase, 60); assert.equal(playing.ui, 60);

  f.match.state = 'results';
  for (let i = 0; i < 60; i++) f._frame(1 / 60);
  const results = delta(calls, playing);
  assert.equal(results.fx, 0, 'gameplay FX must not update behind results');
  assert.equal(results.fxHooks, 0, 'gameplay FX hooks must not update behind results');
  assert.equal(results.paint, 0, 'the paint atlas must not flush behind results');
  assert.equal(results.wake, 0, 'swim wakes must not update behind results');
  assert.equal(results.simulation, 60, 'the fixed simulation/input driver keeps ticking (its own freeze is clock-tested)');
  assert.equal(results.showcase, 60, 'the results stage keeps animating (final reveal visible)');
  assert.equal(results.showcaseRender, 60, 'the results stage keeps rendering');
  assert.equal(results.diorama, 60, 'the results diorama keeps animating');
  assert.equal(results.ui, 60, 'the results GUI keeps updating');
  assert.equal(results.worldRender, 60, 'the renderer keeps drawing the results backdrop every frame');
  assert.equal(results.env, 60, 'the visible backdrop environment keeps its ambient animation');
  assert.equal(results.screenfx, 60, 'ScreenFX keeps its own results-state transition (flood fade-out)');
  const playingWork = GAMEPLAY_WORK.reduce((n, k) => n + playing[k], 0);
  const resultsWork = GAMEPLAY_WORK.reduce((n, k) => n + results[k], 0);
  assert.equal(playingWork, 240);
  assert.equal(resultsWork, 0, 'PLAYING vs RESULT work comparison: gameplay frame work drops to zero behind results');
  assert.ok(resultsWork < playingWork, 'RESULT does strictly less CPU frame work than PLAYING');
  assert.equal(G.renderer.shadowMap.needsUpdate, true, 'the stage reveal keeps its shadow refresh');
  assert.equal(calls.info, 120, 'every RESULT frame still resets renderer info (draw accounting stays live)');
});

test('rematch resumes every counter from the same frame loop without a second chain', () => {
  const { f, calls } = frameFixture();
  for (let i = 0; i < 30; i++) f._frame(1 / 60);            // playing
  f.match.state = 'results';
  for (let i = 0; i < 30; i++) f._frame(1 / 60);            // results
  const frozen = snapshot(calls);
  f.match = { paused: false, attract: false, state: 'playing', local: null, actors: [] };  // startMatch-style replacement
  for (let i = 0; i < 30; i++) f._frame(1 / 60);            // rematch
  const resumed = delta(calls, frozen);
  assert.equal(resumed.fx, 30, 'gameplay FX resume with the new match');
  assert.equal(resumed.paint, 30, 'the paint atlas resumes with the new match');
  assert.equal(resumed.wake, 30, 'swim wakes resume with the new match');
  assert.equal(resumed.worldRender, 30, 'the renderer never stopped and keeps drawing after rematch');
  assert.equal(resumed.simulation, 30, 'the single frame loop drives the same simulation driver');
});

test('online RESULT presents exactly like offline RESULT (presentation gate ignores the network)', () => {
  const { G, f, calls } = frameFixture();
  f.match.state = 'results';
  G.netm = { myId: 'peer' };
  for (let i = 0; i < 30; i++) f._frame(1 / 60);
  const results = snapshot(calls), n = k => results[k] || 0;
  assert.equal(n('fx'), 0, 'online results also stop gameplay FX');
  assert.equal(n('fxHooks'), 0, 'online results also stop gameplay FX hooks');
  assert.equal(n('paint'), 0, 'online results also stop the paint atlas');
  assert.equal(n('wake'), 0, 'online results also stop swim wakes');
  assert.equal(n('worldRender'), 30, 'online results keep drawing the stage/backdrop');
  assert.equal(n('showcase'), 30, 'online results keep the stage animating');
  assert.equal(n('ui'), 30, 'online results keep the GUI (back-to-room countdown) updating');
});

test('production-composed Game._loop keeps one RAF chain and resumes native Actor updates after RESULT disposal', async () => {
  const oldRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const queue = [];
  let scheduled = 0, maxQueued = 0;
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true,
    value: callback => { scheduled++; queue.push(callback); maxQueued = Math.max(maxQueued, queue.length); return scheduled; } });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { hidden: false } });
  try {
    const { G, f, calls, makeMatch } = await nativeFrameFixture();
    installGame(f.constructor);
    const runScheduledFrame = () => {
      const callback = queue.shift();
      assert.equal(typeof callback, 'function', 'the application RAF callback is pending');
      callback();
      assert.equal(queue.length, 1, 'each frame schedules exactly one successor');
    };

    f._loop();
    assert.equal(queue.length, 1);
    const fixedClock = f.s3Clock;
    const oldMatch = f.match, oldActor = oldMatch.local;
    assert.equal(calls.actor, 1, 'normal PLAYING reaches the native Actor.update path');
    assert.equal(calls.match, 1, 'normal PLAYING reaches native Match.update');
    assert.equal(calls.projectile, 1, 'normal PLAYING advances projectiles once');
    assert.equal(f.match.opts.range, true, 'a range-tagged PLAYING match remains on the normal update path');
    assert.equal(calls.paint, 1); assert.equal(calls.fx, 1); assert.equal(calls.fxHooks, 1);

    oldMatch.state = 'results';
    runScheduledFrame();
    assert.equal(calls.actor, 1, 'RESULT skips native Actor.update');
    assert.equal(calls.match, 1, 'RESULT skips native Match.update');
    assert.equal(calls.controller, 1, 'RESULT skips controller admission');
    assert.equal(calls.projectile, 1, 'RESULT skips Projectiles.update');
    assert.equal(calls.paint, 1, 'RESULT does not flush paint');
    assert.equal(calls.fx, 1); assert.equal(calls.fxHooks, 1); assert.equal(calls.wake, 1);
    assert.equal(calls.diorama, 2, 'the results diorama remains live');
    assert.equal(calls.showcase, 2, 'podium animation remains live');
    assert.equal(calls.showcaseRender, 2, 'podium rendering remains live');
    assert.equal(calls.worldRender, 2, 'the native backdrop still draws');
    assert.equal(calls.ui, 2, 'the results score UI continues updating');
    assert.equal(calls.screenfx, 2, 'the results transition effect continues');
    assert.equal(calls.endFrame, 2, 'input edges are consumed once per fixed tick');
    assert.equal(calls.arcShown || 0, 0, 'the hidden projectile arc is not shown');
    assert.equal(f.s3Clock, fixedClock, 'the existing fixed clock is reused without a second driver');

    const updatesBeforeDispose = oldActor._resultsProbeUpdates;
    oldMatch.dispose();
    assert.equal(oldActor._resultsProbeUpdates, updatesBeforeDispose);
    assert.equal(queue.length, 1, 'disposing a result match leaves only the single app callback');
    f.match = makeMatch('playing');
    runScheduledFrame();
    assert.equal(calls.actor, 2, 'a newly entered match restores native Actor updates');
    assert.equal(calls.match, 2, 'the new native Match resumes normally');
    assert.equal(calls.projectile, 2, 'a newly entered match restores projectile updates');
    assert.equal(oldActor._resultsProbeUpdates, updatesBeforeDispose, 'the retired actor is not retained by the RAF chain');
    assert.equal(calls.actorRemoved, 1, 'native Match.dispose releases the retired actor from the scene');
    assert.equal(calls.paint, 2); assert.equal(calls.fx, 2); assert.equal(calls.fxHooks, 2);
    assert.equal(calls.endFrame, 3);
    assert.equal(scheduled, 3);
    assert.equal(maxQueued, 1, 'RESULT, disposal and re-entry never retain duplicate callbacks');
  } finally {
    if (oldRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', oldRaf);
    else delete globalThis.requestAnimationFrame;
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else delete globalThis.document;
  }
});
