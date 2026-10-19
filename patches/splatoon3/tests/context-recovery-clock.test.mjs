import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
// Method extraction below is a source-consumer boundary, not a minified-build
// parser. Reject an emitted request rather than silently using source fallbacks.
assert.ok(!process.env.INKWAVE_BUILT_SITE, 'This source boundary test does not accept a minified site');
const SITE = path.join(ROOT, 'inkwave-public');
const RUNTIME = path.join(ROOT, 'patches/splatoon3/runtime');
const { installClock, installGame, runSimulation } = await import(pathToFileURL(path.join(RUNTIME, 'clock.mjs')).href);
const { nativeSpawnYaw } = await import(pathToFileURL(path.join(ROOT, 'patches/native-stages/runtime/native-spawn.mjs')).href);
const { installPlatformGame } = await import(pathToFileURL(path.join(ROOT, 'patches/local-quality/platform-game.mjs')).href);
const { terminalRecoveryRequired, installRecoveryEntryGuards } = await import(pathToFileURL(path.join(RUNTIME, 'recovery-gate.mjs')).href);
const raw = fs.readFileSync(path.join(SITE, 'src/main.js'), 'utf8');
const main = adaptBuildSource('src/main.js', raw);
function section(start, end) { const a = main.indexOf(start), b = main.indexOf(end, a); assert(a >= 0 && b > a); return main.slice(a, b); }
const f = await sourceLoadedActorFixture();
const { G } = f;
// The production clock receives the exact G used by the real VM Match. No
// fake clock, Match.update, resume, pad routing, or paint-admission gate.
installClock({ G });
const Game = new Function('G', `return class Game {
  ${section('  resume() {', '  async quitToMenu() {')}
  ${section('  _padMenus() {', '  _updateHud(dt) {')}
  ${section('  _startAttract() {', '  _attractShot() {')}
  ${section('  _beginMatchFlow() {', '  async _startMenuMatch(')}
}`)(G);
installGame(Game);
after(() => f.reset());

for (const hz of [30, 60, 120]) for (const cause of [null, 'context', 'native-world']) {
  test(`actual Game/Match/clock ${hz}Hz: ${cause || 'ordinary pause resume'}`, () => {
    const match = new f.Match({ duration: 180 }); match.state = 'playing'; match.paused = true;
    G.match = match; G.actors = []; G.net = G.netm = null; G.mode = 'match'; G.time = 0;
    let paintSteps = 0;
    const grid = new Uint8Array([1, 2, 1]), counts = new Uint32Array([2, 1]);
    G.paint = { grid, counts, useFixedPaintClock() {}, advanceSimulation() { paintSteps++; } };
    const game = new Game(); game.match = match; game.showcase = { fullFrame: false };
    game.settings = { quality: 'high' }; game.rig = { mode: 'follow' };
    game.R = { _contextLost: cause === 'context' };
    if (cause === 'native-world') game._nativeWorldRecoveryFatal = { error: new Error('rollback failed'), recoveryErrors: [] };
    game.menus = { current: 'pause', show(value) { this.current = value; } };
    game.input = { pad: { buttons: [], axes: [] }, padPressed: new Set(), padMenuPressed: new Set([9]),
      padAxis: () => 0, pollPad() {}, endFrame() {}, requestLock() {}, consumePadMenuButton() {} };
    for (let i = 0; i < hz; i++) runSimulation(game, 1 / hz);
    if (cause) {
      game.resume(); game._padMenus();
      assert.equal(game._startAttract(), false, 'late attract restart stays blocked');
      assert.equal(match.paused, true); assert.equal(match.time, 180); assert.equal(G.time, 0);
      assert.equal(paintSteps, 0); assert.equal(game.menus.current, 'pause');
      // A debug/unfreeze caller may change ordinary pause state directly.
      match.paused = false;
      for (let i = 0; i < hz; i++) runSimulation(game, 1 / hz);
      assert.equal(match.time, 180); assert.equal(G.time, 0); assert.equal(paintSteps, 0);
    } else {
      assert.equal(match.paused, false); assert(Math.abs(match.time - 179) < 1e-9);
      assert(Math.abs(G.time - 1) < 1e-9); assert.equal(paintSteps, 60);
    }
    assert.equal(G.paint.grid, grid); assert.equal(G.paint.counts, counts);
    assert.deepEqual([...grid], [1, 2, 1]); assert.deepEqual([...counts], [2, 1]);
  });
}

test('terminal loop and direct-frame gates survive an ordinary unfreeze', () => {
  const oldRAF = globalThis.requestAnimationFrame, oldDocument = globalThis.document;
  let raf = 0, timers = 0, loops = 0, frames = 0, resets = 0;
  globalThis.requestAnimationFrame = () => { raf++; }; globalThis.document = { hidden: false };
  try {
    class Probe { _loop() { loops++; return 13; } _frame() { frames++; return 17; } }
    installGame(Probe);
    const game = new Probe(); game.timer = { update() { timers++; } }; game.s3Clock = { reset() { resets++; } };
    assert.equal(game._loop(), 13); assert.equal(game._frame(), 17);
    for (const cause of ['context', 'native-world']) {
      game.R = { _contextLost: cause === 'context' }; game._nativeWorldRecoveryFatal = cause === 'native-world' ? {} : null;
      game.frozen = false; game._loop(); game._frame();
    }
    assert.equal(loops, 1); assert.equal(frames, 1); assert.equal(timers, 2); assert.equal(raf, 2); assert.equal(resets, 2);
  } finally {
    if (oldRAF === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = oldRAF;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('all guarded restart entries preserve normal return identity and reject terminal entry', async () => {
  const sync = ['resume', '_padMenus', '_startAttract', 'netMatchGo', 'netMatchAborted'];
  const asyncNames = ['_startMenuMatch', 'startMatch', 'startNetMatch', 'netMatchEnd', 'quitToMenu'];
  class Probe {}
  const result = {}, pending = Promise.resolve(result); let calls = 0;
  for (const name of sync) Probe.prototype[name] = function (x) { assert.equal(x, 42); calls++; return result; };
  for (const name of asyncNames) Probe.prototype[name] = function (x) { assert.equal(x, 42); calls++; return pending; };
  installRecoveryEntryGuards(Probe); installRecoveryEntryGuards(Probe);
  const game = new Probe();
  for (const name of sync) assert.equal(game[name](42), result);
  for (const name of asyncNames) assert.equal(game[name](42), pending);
  assert.equal(calls, 10);
  for (const cause of ['context', 'native-world']) {
    game.R = { _contextLost: cause === 'context' }; game._nativeWorldRecoveryFatal = cause === 'native-world' ? {} : null;
    for (const name of sync) assert.equal(game[name](42), false);
    for (const name of asyncNames) assert.equal(await game[name](42), false);
  }
  assert.equal(calls, 10);
});

test('existing real match-flow token loses publication authority only on terminal loss or prior owner change', () => {
  G.net = G.netm = null;
  const game = new Game(); game.match = {}; game.R = { _contextLost: false };
  const flow = game._beginMatchFlow(); assert.equal(game._matchFlow, flow); assert.equal(flow.current(), true);
  game.R._contextLost = true; assert.equal(flow.current(), false);
  game.R._contextLost = false; game._matchFlow = {}; assert.equal(flow.current(), false);
  // Clearing a terminal flag is not a supported runtime action; this reset is
  // only the separate prior-owner negative control on the predicate.
});

for (const withFlow of [false, true]) test(`late world-build continuation is fenced (flow=${withFlow})`, async () => {
  let finish, checks = 0;
  class Probe { _buildWorld(_map, flow) { return new Promise(resolve => { finish = () => { checks++; resolve(flow.current()); }; }); } }
  installRecoveryEntryGuards(Probe);
  const game = new Probe(); game._matchFlow = {}; game.R = { _contextLost: false };
  let current = true; const originalFlow = withFlow ? { current: () => current } : null;
  const first = game._buildWorld({}, originalFlow); finish(); assert.equal(await first, true);
  const second = game._buildWorld({}, originalFlow); game.R._contextLost = true; finish(); assert.equal(await second, false);
  assert.equal(await game._buildWorld({}, originalFlow), false); assert.equal(checks, 2);
  game.R._contextLost = false;
  const third = game._buildWorld({}, originalFlow);
  if (withFlow) current = false; else game._matchFlow = {};
  finish(); assert.equal(await third, false, 'pre-existing stale-owner rejection remains');
});

test('ordinary frozen or paused flags alone are not terminal recovery', () => {
  assert.equal(terminalRecoveryRequired({ frozen: true, match: { paused: true } }), false);
  assert.equal(terminalRecoveryRequired({ R: { _contextLost: false }, _nativeWorldRecoveryFatal: null }), false);
});

for (const cause of ['context', 'native-world']) test(`final installed PlatformFrameDriver cannot bypass terminal frame gate (${cause})`, () => {
  let now = 1000, id = 0, frames = 0, rendering = 0;
  const pending = new Map(), env = new EventTarget();
  env.document = new EventTarget(); env.document.hidden = false; env.document.hasFocus = () => true;
  env.performance = { now: () => now }; env.screen = { orientation: new EventTarget() };
  env.requestAnimationFrame = callback => { pending.set(++id, callback); return id; };
  env.cancelAnimationFrame = key => pending.delete(key);
  const canvas = new EventTarget(); canvas.setAttribute = canvas.removeAttribute = () => {};
  class Probe {
    _loop() { throw Error('legacy loop must be replaced by the production platform owner'); }
    _frame(dt) { frames++; runSimulation(this, dt); rendering++; }
    _dynRes() {}
    _padMenus() {}
  }
  installGame(Probe); installPlatformGame(Probe, G, env);
  const game = new Probe(), match = new f.Match({ duration: 180 });
  match.state = 'playing'; match.paused = false;
  Object.assign(G, { game, match, actors: [], net: null, netm: null, mode: 'match', time: 0,
    paint: { useFixedPaintClock() {}, advanceSimulation() {} } });
  Object.assign(game, { match, settings: { frameRate: 'display' }, timer: { update() {}, disconnect() {} },
    input: { padPressed: new Set(), pollPad() {}, endFrame() {} }, showcase: {}, rig: { mode: 'follow' },
    menus: { current: null, setPlatformDriven() {} }, fpsAcc: 0, fpsN: 0,
    R: { renderer: { domElement: canvas, resetState() {} }, resize() {} } });
  const step = () => { const [key, callback] = pending.entries().next().value; pending.delete(key); now += 1000 / 60; callback(now); };
  game._loop();
  try {
    step(); step(); step(); assert.ok(frames > 0); assert.ok(G.time > 0);
    const before = { frames, rendering, time: G.time, remaining: match.time };
    if (cause === 'context') {
      game.R._contextLost = true;
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      assert.equal(game.platform.owner.active, true, 'restored platform owner is active, terminal flag still fences its frame');
    } else game._nativeWorldRecoveryFatal = { error: new Error('rollback failed') };
    game.frozen = false;
    for (let i = 0; i < 10; i++) step();
    assert.deepEqual({ frames, rendering, time: G.time, remaining: match.time }, before);
    assert.equal(pending.size, 1, 'only the existing platform RAF chain remains');
  } finally { const owner = game.platform.owner; game.disposePlatform(); owner.dispose(); }
  assert.equal(pending.size, 0);
});

// Reuse the existing startup fixture, but execute the selected production
// main source composition rather than a predecessor adapter-only copy.
const startFixtureURL = new URL('../../reliability/tests/start.test.mjs', import.meta.url);
const fixtureSource = fs.readFileSync(startFixtureURL, 'utf8');
const fixtureEnd = fixtureSource.indexOf("\ntest('negative proof:");
assert(fixtureEnd > 0, 'existing startup fixture anchor');
const startFixture = fixtureSource.slice(0, fixtureEnd)
  .replace(/from (['"])(\.[^'"\n]+)\1/g, (_all, _q, spec) => 'from ' + JSON.stringify(new URL(spec, startFixtureURL).href))
  .replaceAll('import.meta.url', JSON.stringify(startFixtureURL.href));
const { boot: startupFixture } = await import('data:text/javascript;base64,' +
  Buffer.from(startFixture + '\nexport { boot };').toString('base64'));
function prepareStartup(h, online) {
  h.context.nativeSpawnYaw = nativeSpawnYaw;
  if (online) {
    h.G.net.hostId = h.G.net.myId;
    h.cfg.roster = [{ nid: 1, team: 0, slot: 0, owner: h.G.net.myId, bot: false, weapon: 'shooter' }];
  }
  installRecoveryEntryGuards(h.game.constructor); return h;
}
for (const online of [false, true]) {
  test(`actual ${online ? 'online' : 'offline'} startup normal delivery remains intact`, async () => {
    const h = prepareStartup(startupFixture(main), online);
    await h.start(online);
    assert.equal(h.G.mode, 'match'); assert.equal(h.game.layoutId, 'a');
    assert.equal(h.count('bind'), Number(online)); assert.equal(h.count('start'), Number(!online));
  });
  for (const phase of ['fade', 'boss', 'world', 'warm']) for (const cause of ['context', 'native-world']) {
    test(`actual ${online ? 'online' : 'offline'} startup ${phase} await rejects ${cause} continuation`, async () => {
      const h = prepareStartup(startupFixture(main, [phase]), online);
      const pending = h.start(online); await h.reached[phase].promise;
      if (cause === 'context') h.game.R = { _contextLost: true };
      else h.game._nativeWorldRecoveryFatal = { error: new Error('rollback failed') };
      const snapshot = h.snapshot(), at = h.calls.length;
      const texture = { disposed: 0, dispose() { this.disposed++; } };
      h.gates[phase].resolve(phase === 'world' ? texture : phase === 'boss' ? { BOSS_MODE: { duration: 240 } } : undefined);
      await pending;
      assert.deepEqual(h.snapshot(), snapshot);
      assert.deepEqual(h.calls.slice(at).filter(call => call[0] !== 'disposeProps'), []);
      if (phase === 'world') assert.equal(texture.disposed, 1, 'detached preparation is still released');
    });
  }
}
