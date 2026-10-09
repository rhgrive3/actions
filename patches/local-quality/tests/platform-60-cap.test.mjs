import {effectiveQuality} from '../../../inkwave-public/src/config.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { compose } from './idle-fixture.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { installPlatformGame } from '../platform-game.mjs';
import { PlatformFrameDriver, PlatformLifecycle } from '../platform-lifecycle.mjs';
import { installClock, runSimulation } from '../../splatoon3/runtime/clock.mjs';
import { pausedWorldFrame, idleAttractMenuBudget } from '../idle-resources.mjs';
import { syncPortraitFrame } from '../portrait-guard.mjs';
import { updateSplatGhosts } from '../../splatoon3/issue-284-adapter.mjs';

const source = adaptRange('src/main.js', adaptNetworkSource('src/main.js', compose('src/main.js')));
const dynStart = source.indexOf('  _dynRes(dt) {');
const frameStart = source.indexOf('  _frame(dt) {');
const frameEnd = source.indexOf('\n  // continuous sounds', frameStart);
assert.ok(dynStart >= 0 && frameStart > dynStart && frameEnd > frameStart, 'six-adapter composed Game methods exist');
const dynMethod = source.slice(dynStart, frameStart);
const frameMethod = source.slice(frameStart, frameEnd);

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    fire(type, event = {}) { for (const callback of [...(listeners.get(type) || [])]) callback(event); },
  };
}

function makeEnv() {
  let now = 0, wall = 0, id = 0;
  const rafs = new Map(), timers = new Map(), canceledRafs = new Map(), canceledTimers = new Map();
  const document = Object.assign(target(), { hidden: false, documentElement: { lang: 'en' }, hasFocus: () => true });
  const env = Object.assign(target(), {
    document, navigator: {}, screen: { orientation: target() }, performance: { now: () => now },
    Date: { now: () => wall }, console,
    requestAnimationFrame(callback) { const key = ++id; rafs.set(key, callback); return key; },
    cancelAnimationFrame(key) { if (rafs.has(key)) canceledRafs.set(key, rafs.get(key)); rafs.delete(key); },
    setTimeout(callback, delay) { const key = ++id; timers.set(key, { callback, at: now + delay }); return key; },
    clearTimeout(key) { if (timers.has(key)) canceledTimers.set(key, timers.get(key).callback); timers.delete(key); },
  });
  env.step = time => {
    now = wall = time;
    for (const [key, entry] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (entry.at <= time && timers.has(key)) { timers.delete(key); entry.callback(); }
    }
    const ready = [...rafs];
    for (const [key, callback] of ready) { rafs.delete(key); callback(time); }
    assert.ok(rafs.size + timers.size <= 1, 'driver keeps at most one pending timer or RAF');
  };
  env.staleTimer = () => {
    const entry = [...canceledTimers].at(-1); assert.ok(entry, 'a canceled timer callback is retained for the stale-callback check');
    canceledTimers.delete(entry[0]); entry[1]();
  };
  env.staleRAF = () => {
    const entry = [...canceledRafs].at(-1); assert.ok(entry, 'a canceled RAF callback is retained for the stale-callback check');
    canceledRafs.delete(entry[0]); entry[1](now);
  };
  env.queues = () => ({ rafs: rafs.size, timers: timers.size });
  return env;
}

function makeGame(env, { touch = true, frameRate = 'auto' } = {}) {
  const calls = { dynRes: [], frame: [], frameTimes: [], network: [], pollPad: 0, endFrame: 0, matchUpdate: [] };
  const G = {
    time: 0, mode: 'match', mobile: { touch }, teamColors: [{}, {}],
    renderer: { info: { reset() {}, render: { calls: 0, triangles: 0 } }, shadowMap: { autoUpdate: false, needsUpdate: false } },
    net: { update(dt) { calls.network.push(dt); } },
  };
  installClock({ G });
  const Game = new Function('updateSplatGhosts', 'G', 'runSimulation', 'pausedWorldFrame', 'idleAttractMenuBudget', 'performance', 'damp', 'clamp', 'THREE', 'syncPortraitFrame', 'document', 'effectiveQuality',
    `return class Game {\n${dynMethod}\n${frameMethod}\n}`)
    (updateSplatGhosts, G, runSimulation, pausedWorldFrame, idleAttractMenuBudget, env.performance, (a, b) => b, x => x, {}, syncPortraitFrame, env.document,effectiveQuality);
  Game.prototype._onPointerUnlock = function (value) { this.unlockCalls = (this.unlockCalls || 0) + 1; return value; };
  const game = new Game();
  Object.assign(game, {
    frozen: false, settings: { quality: 'high', frameRate }, mobile: { touch }, fpsAcc: 0, fpsN: 0,
    input: { padPressed: new Set(), _padEpoch: 0, pollPad() { calls.pollPad++; }, endFrame() { calls.endFrame++; } },
    match: { attract: false, paused: true, state: 'playing', local: null, controller: {},
      updateController() {}, update(dt) { calls.matchUpdate.push(dt); } },
    showcase: { fullFrame: true, mode: null, update() {}, render() {} },
    menus: { setPlatformDriven() {}, update() {} }, R: { grade: { uniforms: { uHurt: { value: 0 } } } },
    _padMenus() {}, _updateLocalLoops() {}, _updateAmbience() {},
    _dynRes(dt) { calls.dynRes.push(dt); return Game.prototype.__dynRes.call(this, dt); },
    _frame(dt) { calls.frame.push(dt); calls.frameTimes.push(env.performance.now()); return Game.prototype.__frame.call(this, dt); },
  });
  Game.prototype.__dynRes = Game.prototype._dynRes;
  Game.prototype.__frame = Game.prototype._frame;
  installPlatformGame(Game, G, env);
  return { game, G, calls };
}

function runCase(hz, options = {}, seconds = 1) {
  const env = makeEnv(), { game, calls } = makeGame(env, options);
  game._loop();
  for (let i = 0; i < hz * seconds; i++) env.step(i * 1000 / hz);
  const frame = game.platform.driver.snapshot();
  const result = {
    hz, touch: options.touch ?? true, frameRate: options.frameRate ?? 'auto', hostTicks: hz * seconds,
    driverFrames: frame.frames, rafSchedules: frame.schedules, timerSchedules: frame.timerSchedules,
    timerWakes: frame.timerWakes, pendingRAF: frame.pendingRAF, pendingTimer: frame.pendingTimer,
    frameCalls: calls.frame.length, dynResCalls: calls.dynRes.length, networkCalls: calls.network.length,
    pollPadCalls: calls.pollPad, endFrameCalls: calls.endFrame, matchUpdateCalls: calls.matchUpdate.length,
    frameDtSum: calls.frame.reduce((sum, dt) => sum + dt, 0), frameTimes: calls.frameTimes,
  };
  game.disposePlatform();
  return result;
}

test('mobile 60 cap aligns production driver wakeups to an absolute 60 Hz deadline at 90/120/144 Hz', t => {
  for (const hz of [90, 120, 144]) {
    const result = runCase(hz, { touch: true, frameRate: 'auto' });
    const gaps = result.frameTimes.slice(1).map((time, index) => time - result.frameTimes[index]);
    assert.equal(result.hostTicks, hz);
    assert.equal(result.driverFrames, 60, `${hz} Hz controlled vsync queue: driver callback cadence`);
    assert.equal(result.frameCalls, 60, `${hz} Hz: full composed Game._frame admissions`);
    assert.equal(result.dynResCalls, 60, `${hz} Hz: _dynRes remains paired with each game frame`);
    assert.equal(result.networkCalls, 60, `${hz} Hz: network cadence stays on admitted game frames`);
    assert.equal(result.pollPadCalls, 60, `${hz} Hz: input polling stays on admitted game frames`);
    assert.equal(result.matchUpdateCalls, 59, `${hz} Hz: installed fixed clock keeps its startup-inclusive 59 updates`);
    assert.equal(result.endFrameCalls, 59, `${hz} Hz: input edge finalization retains fixed-clock cadence`);
    assert.ok(Math.abs(result.frameDtSum - result.frameTimes.at(-1) / 1000) < 1e-8, `${hz} Hz: full elapsed time between admitted frames is preserved`);
    assert.ok(result.frameDtSum > 0.95, `${hz} Hz: the deadline scheduler does not lose elapsed simulation time`);
    assert.ok(Math.min(...gaps) >= 1000 / hz - 1e-8, `${hz} Hz: no callback occurs faster than the host vsync queue`);
    assert.ok(Math.max(...gaps) <= Math.ceil(hz / 60) * 1000 / hz + 1e-8, `${hz} Hz: maximum callback gap ${Math.max(...gaps)}ms exceeds the expected host slots`);
    assert.ok(Math.abs(result.frameTimes.at(-1) / (gaps.length * 1000) - 1 / 60) < 0.001, `${hz} Hz: mean callback cadence stays near 60 Hz`);
    assert.equal(result.pendingRAF, 0, `${hz} Hz: waiting on a deadline does not keep RAF active`);
    assert.equal(result.pendingTimer, 1, `${hz} Hz: one next deadline remains pending`);
    assert.equal(result.rafSchedules, 60);
    assert.equal(result.timerSchedules - result.timerWakes, 1);
    t.diagnostic(JSON.stringify({ hz, driverFrames: result.driverFrames, frameCalls: result.frameCalls,
      networkCalls: result.networkCalls, pollPadCalls: result.pollPadCalls,
      matchUpdateCalls: result.matchUpdateCalls, endFrameCalls: result.endFrameCalls,
      meanCallbackHz: Math.round(gaps.length * 1000 / (result.frameTimes.at(-1) - result.frameTimes[0]) * 100) / 100,
      minGapMs: Math.round(Math.min(...gaps) * 1000) / 1000,
      maxGapMs: Math.round(Math.max(...gaps) * 1000) / 1000,
      frameDtSum: result.frameDtSum }));
  }
});

test('capped production scheduling keeps its 30-second and three-minute cadence without deadline drift', t => {
  for (const hz of [90, 120, 144]) {
    const result = runCase(hz, { touch: true, frameRate: 'auto' }, 180);
    const firstThirty = result.frameTimes.filter(time => time < 30000).length;
    assert.ok(Math.abs(firstThirty - 1800) <= 1, `${hz} Hz: 30-second capped callback count`);
    assert.ok(Math.abs(result.driverFrames - 10800) <= 1, `${hz} Hz: three-minute capped callback count`);
    assert.equal(result.frameCalls, result.driverFrames, 'every admitted callback runs one composed frame');
    assert.equal(result.networkCalls, result.frameCalls, 'network work runs once per admitted frame');
    assert.equal(result.pollPadCalls, result.frameCalls, 'input polling runs once per admitted frame');
    assert.ok(Math.abs(result.frameDtSum - result.frameTimes.at(-1) / 1000) < 1e-7, 'elapsed frame time remains conserved');
    assert.ok(Math.abs(result.matchUpdateCalls - result.frameDtSum * 60) < 1.001, 'native fixed simulation retains elapsed cadence');
    assert.equal(result.endFrameCalls, result.matchUpdateCalls, 'input edges finalize once per simulation tick');
    t.diagnostic(JSON.stringify({ kind: 'controlled-native-queue; not a physical device trace', hostHz: hz,
      seconds: 180, firstThirtyCallbacks: firstThirty, totalCallbacks: result.driverFrames,
      composedFrames: result.frameCalls, fixedUpdates: result.matchUpdateCalls, elapsedSeconds: result.frameDtSum }));
  }
});

test('display mode and desktop 60 setting stay dynamic; pointer gesture ownership is unchanged', () => {
  const uncappedMobile = runCase(120, { touch: true, frameRate: 'display' });
  assert.equal(uncappedMobile.driverFrames, 120, 'display mode still follows host RAF even on touch devices');
  assert.equal(uncappedMobile.timerSchedules, 0);
  const cappedDesktop = runCase(120, { touch: false, frameRate: 60 });
  assert.equal(cappedDesktop.driverFrames, 60, 'an explicit 60 setting still caps desktop work');

  const env = makeEnv(), { game } = makeGame(env, { touch: true, frameRate: 'auto' });
  game._loop();
  assert.equal(game._onPointerUnlock('initial-gesture'), 'initial-gesture');
  env.fire('blur');
  assert.equal(game._onPointerUnlock('blurred-gesture'), undefined);
  assert.equal(game._relock, true);
  env.fire('focus');
  assert.equal(game._onPointerUnlock('focused-gesture'), 'focused-gesture');
  assert.equal(game.unlockCalls, 2);
  game.disposePlatform();
});

test('changing a capped mobile setting to display switches the next admitted callback back to RAF cadence', () => {
  const hz = 120, env = makeEnv(), { game, calls } = makeGame(env, { touch: true, frameRate: 'auto' });
  game._loop();
  for (let i = 0; i < 30; i++) env.step(i * 1000 / hz);
  const before = calls.frame.length;
  game.settings.frameRate = 'display';
  for (let i = 30; i < hz; i++) env.step(i * 1000 / hz);
  assert.ok(calls.frame.length > 90, 'the live display setting restores display-cadence callbacks after the pending deadline');
  assert.ok(calls.frame.length > before + 60, 'the uncapped tail runs faster than the mobile cap');
  assert.equal(game.platform.driver.snapshot().pendingRAF, 1);
  assert.equal(game.platform.driver.snapshot().pendingTimer, 0);
  game.disposePlatform();
});

test('visibility, pagehide, freeze, stop and dispose cancel both handles and reject stale callbacks', () => {
  const env = makeEnv(), owner = new PlatformLifecycle(env), frames = [], rebases = [];
  const driver = new PlatformFrameDriver(owner, dt => frames.push(dt), reason => rebases.push(reason), () => 60);
  driver.start();
  assert.deepEqual(env.queues(), { rafs: 1, timers: 0 });
  env.step(0);
  assert.deepEqual(frames, [0]);
  assert.deepEqual(env.queues(), { rafs: 0, timers: 1 });

  env.document.hidden = true; env.document.fire('visibilitychange');
  assert.deepEqual(env.queues(), { rafs: 0, timers: 0 });
  env.staleTimer();
  assert.deepEqual(env.queues(), { rafs: 0, timers: 0 });
  env.document.hidden = false; env.document.fire('visibilitychange');
  assert.deepEqual(env.queues(), { rafs: 1, timers: 0 });

  env.fire('pagehide', { persisted: true });
  assert.deepEqual(env.queues(), { rafs: 0, timers: 0 });
  env.staleRAF();
  assert.deepEqual(frames, [0]);
  env.fire('pageshow', { persisted: true });
  env.step(1000);
  assert.deepEqual(frames, [0, 0], 'resume starts with a zero-delta frame');
  assert.deepEqual(env.queues(), { rafs: 0, timers: 1 });

  env.document.fire('freeze');
  assert.deepEqual(env.queues(), { rafs: 0, timers: 0 });
  env.staleTimer();
  env.document.fire('resume');
  env.step(2000);
  assert.deepEqual(frames, [0, 0, 0], 'freeze resume also rebases to zero delta');
  assert.deepEqual(env.queues(), { rafs: 0, timers: 1 });

  driver.stop();
  assert.deepEqual(env.queues(), { rafs: 0, timers: 0 });
  env.staleTimer();
  driver.start();
  assert.deepEqual(env.queues(), { rafs: 1, timers: 0 });
  driver.dispose();
  assert.deepEqual(env.queues(), { rafs: 0, timers: 0 });
  env.staleRAF();
  assert.deepEqual(frames, [0, 0, 0]);
  assert.ok(rebases.includes('suspend') && rebases.includes('resume') && rebases.includes('stop'));
  owner.dispose();
});
