import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
assert.ok(!process.env.INKWAVE_BUILT_SITE, 'Attract method extraction is a source boundary, not an emitted parser');
const main = adaptBuildSource('src/main.js', fs.readFileSync(path.join(ROOT, 'inkwave-public/src/main.js'), 'utf8'));
const start = main.indexOf('  _updateAttract(dt) {'), end = main.indexOf('\n  async _loadBoss()', start);
assert(start >= 0 && end > start, 'composed actual Game attract method boundary');
const f = await sourceLoadedActorFixture(), { G } = f;
const { FixedClock, installClock, runSimulation } = await import(pathToFileURL(path.join(ROOT, 'patches/splatoon3/runtime/clock.mjs')).href);
installClock({ G });
const Game = new Function('G', 'return class Game {\n' + main.slice(start, end) + '\n}')(G);
after(() => f.reset());

function fixture({ paused = false, cause = null, attractT = 5 } = {}) {
  const match = new f.Match({ duration: 180 });
  Object.assign(match, { state: 'playing', attract: true, paused, actors: [] });
  const calls = { paint: 0, coverage: 0, shot: 0, fade: 0, restart: 0, palette: 0 };
  const pending = [];
  const game = new Game();
  Object.assign(game, { match, settings: { quality: 'high' }, showcase: {}, rig: { mode: 'follow' },
    menus: { current: 'main' }, attractT, shotT: 5, _attractCoverageElapsed: 0, _attractFollow: null,
    s3Clock: new FixedClock(), R: { _contextLost: cause === 'context' }, frozen: false,
    input: { padPressed: new Set(), pollPad() {}, endFrame() {} }, _padMenus() {},
    _attractShot() { calls.shot++; },
    // Deferred transition provider; the production then-handler is unmodified.
    _fade() { calls.fade++; return new Promise(resolve => pending.push(resolve)); },
    _startAttract() { calls.restart++; }, _pickPalette() { return {}; }, _setPalette() { calls.palette++; },
  });
  if (cause === 'native-world') game._nativeWorldRecoveryFatal = { error: new Error('rollback failed'), recoveryErrors: [] };
  Object.assign(G, { game, match, mode: 'menu', actors: [], net: null, netm: null, time: 0,
    paint: { useFixedPaintClock() {}, advanceSimulation() { calls.paint++; }, coverage() { calls.coverage++; return [0, 0]; } },
  });
  return { game, match, calls, pending };
}
const tickSecond = (game, hz) => { for (let frame = 0; frame < hz; frame++) runSimulation(game, 1 / hz); };

for (const hz of [30, 60, 120]) {
  test(`actual fixed Clock ${hz}Hz: live attract still advances and paints`, () => {
    const h = fixture(); tickSecond(h.game, hz);
    assert(Math.abs(h.game.attractT - 6) < 1e-9);
    assert(Math.abs(h.game.shotT - 4) < 1e-9);
    assert(Math.abs(h.match.time - 179) < 1e-9);
    assert(Math.abs(G.time - 1) < 1e-9); assert.equal(h.game.s3Clock.ticks, 60);
    assert.equal(h.calls.paint, 60); assert(h.calls.coverage > 0);
    assert.equal(h.calls.fade, 0); assert.equal(h.calls.restart, 0);
  });
  test(`actual fixed Clock ${hz}Hz: paused attract cannot cross the reset boundary`, () => {
    const h = fixture({ paused: true, attractT: 111 }); tickSecond(h.game, hz);
    assert.equal(h.game.attractT, 111); assert.equal(h.game.shotT, 5);
    assert.equal(h.match.time, 180); assert.equal(h.calls.coverage, 0);
    assert.equal(h.calls.fade, 0); assert.equal(h.calls.restart, 0); assert.equal(h.calls.palette, 0);
    // This narrow guard freezes the attract driver. The existing fixed clock's
    // paint/global-time policy for an ordinary paused attract is unchanged.
    assert.equal(h.game.s3Clock.ticks, 60);
    h.match.paused = false; runSimulation(h.game, 1 / 60);
    assert.equal(h.calls.fade, 1, 'ordinary unpause still permits the existing reset transition');
  });
  for (const cause of ['context', 'native-world']) test(`actual fixed Clock ${hz}Hz: terminal ${cause} blocks even unpaused attract`, () => {
    const h = fixture({ cause, attractT: 111 });
    // A late ordinary unfreeze must not override the terminal recovery latch.
    h.game.frozen = false; h.match.paused = false; tickSecond(h.game, hz);
    assert.equal(h.game.attractT, 111); assert.equal(h.game.shotT, 5);
    assert.equal(h.match.time, 180); assert.equal(G.time, 0);
    assert.equal(h.game.s3Clock.ticks, 0);
    assert.deepEqual(h.calls, { paint: 0, coverage: 0, shot: 0, fade: 0, restart: 0, palette: 0 });
  });
  test(`actual fixed Clock ${hz}Hz: a previously queued attract fade cannot restart after pause`, async () => {
    const h = fixture({ attractT: 111 }); runSimulation(h.game, 1 / 60);
    assert.equal(h.calls.fade, 1); assert.equal(h.pending.length, 1);
    h.match.paused = true;
    const before = { attractT: h.game.attractT, shotT: h.game.shotT };
    h.pending.shift()(); await Promise.resolve(); await Promise.resolve();
    tickSecond(h.game, hz);
    assert.deepEqual({ attractT: h.game.attractT, shotT: h.game.shotT }, before);
    assert.equal(h.calls.restart, 0); assert.equal(h.calls.palette, 0);
    assert.equal(h.calls.fade, 1, 'no resume fade is started after a rejected reset');
  });
}
