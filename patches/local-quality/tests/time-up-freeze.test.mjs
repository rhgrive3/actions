// #923: the real composed Match.update body (extracted the way tenacity.test.mjs does) with counting Actor stubs, plus the
// real fixed clock. Logic-only: counts gameplay-simulation calls between TIME UP and results; not a browser profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce } from '../adapter.mjs';
import { adaptTimeUpFreeze } from '../time-up-freeze-adapter.mjs';
import { advanceTenacity } from '../tenacity.mjs';
import { installClock, runSimulation, STEP } from '../../splatoon3/runtime/clock.mjs';

const raw = fs.readFileSync('inkwave-public/src/game/match.js', 'utf8');
const sources = { baseline: adaptReliability('src/game/match.js', adaptTouchLayout('src/game/match.js', adaptSource('src/game/match.js', raw))) };
sources.patched = adaptQualitySource('src/game/match.js', sources.baseline);

function build(kind) {
  const source = sources[kind], start = source.indexOf('  update(dt) {'), end = source.indexOf('\n  updateController', start);
  const G = { projectiles: { clears: 0, clear() { this.clears++; } } }, events = [];
  const Match = vm.runInNewContext(`class Match {${source.slice(start, end)}};Match`, { G, emit: (...x) => events.push(x), advanceTenacity, PLAYER: { radius: 0.3 }, MATCH: { finalCountdown: 10 }, Math });
  return { Match, G, events };
}
function actor(i, team, counters) {
  const a = { team, alive: true, pos: { x: i * 0.2, y: 0, z: 0 }, intent: { move: { set() {}, x: 1 }, fire: true, squid: true, sub: true, jump: true, special: true } };
  a.update = () => { counters.updates++; a.pos.y += 0; };
  if (i % 2) a.bot = { update: () => { counters.bots++; } };
  return a;
}
function make(kind, patch = {}) {
  const { Match, G } = build(kind), counters = { updates: 0, bots: 0 };
  const m = Object.assign(new Match(), { mode: 'turf', state: 'playing', paused: false, time: 1, duration: 180, stateT: 0, lastMinuteFired: true, lastCount: 0, attract: false, follower: false, result: null,
    actors: Array.from({ length: 8 }, (_, i) => actor(i, i % 2, counters)), setState(s) { this.state = s; this.stateT = 0; } }, patch);
  m._judge = function () { this.result = { winner: 0 }; this.setState('judge'); };
  return { m, G, counters };
}
// push apart actors that overlap (soft push moves positions when the loop runs)
const positions = m => JSON.stringify(m.actors.map(a => [a.pos.x, a.pos.z]));

for (const kind of ['baseline', 'patched']) for (const hz of [30, 60, 120]) test(`#923 ${kind} ${hz}Hz: gameplay simulation calls between TIME UP and results`, () => {
  const { m, G, counters } = make(kind), dt = 1 / hz;
  // playing until the clock reaches zero, then finish -> judge (the HUD ends the judge reveal after 5.1 s)
  let frozenTicks = 0, finishAt = -1;
  for (let i = 0; i < hz * 20; i++) {
    const before = counters.updates; m.update(dt);
    if (m.state === 'finish' || m.state === 'judge') { if (finishAt < 0) { finishAt = i; counters.updates = 0; counters.bots = 0; } frozenTicks++; }
    if (m.state === 'judge' && m.stateT >= 5.1) { m.setState('results'); break; }
    void before;
  }
  assert.ok(finishAt >= 0 && m.state === 'results');
  const calls = counters.updates;
  if (kind === 'baseline') assert.ok(calls > 8 * hz * 7, `negative control: the unpatched game keeps simulating (${calls} Actor.update calls)`);
  else { assert.ok(calls <= 8, `patched: at most the TIME UP boundary tick simulates (${calls})`); assert.equal(G.projectiles.clears, 0, 'late projectiles are not globally discarded'); }
});

test('#923 patched: actors hold pose, no soft push, bots never think, and late projectiles are preserved', () => {
  const { m, G, counters } = make('patched', { time: 0.01 });
  m.update(1 / 60); assert.equal(m.state, 'finish'); assert.equal(m._timeUpFrozen, true);
  counters.updates = 0; counters.bots = 0; const pos = positions(m);
  for (let i = 0; i < 60 * 3; i++) m.update(1 / 60);       // finish -> judge (2.6 s), then judge
  assert.equal(m.state, 'judge'); assert.equal(counters.updates, 0); assert.equal(counters.bots, 0); assert.equal(positions(m), pos, 'soft push does not run');
  assert.equal(G.projectiles.clears, 0, 'TIME UP does not erase already-thrown bombs/specials');
  // negative control: the playing state still runs everything, including the soft push of overlapping actors
  const live = make('patched'); live.m.time = 100; live.m.update(1 / 60);
  assert.equal(live.counters.updates, 8); assert.equal(live.counters.bots, 4); assert.notEqual(positions(live.m), pos);
  assert.equal(live.m._timeUpFrozen, false);
});

test('#923 boss, attract, intro, results and paused matches are not frozen', () => {
  for (const patch of [{ bossMode: { update() {}, boss: { dead: true }, result: () => ({}) }, bossCfg: { finishWin: 99, finishLose: 99 }, state: 'finish' }, { attract: true, state: 'finish' }, { state: 'intro' }, { state: 'results' }]) {
    const { m, counters } = make('patched', { time: 100, ...patch }); m.update(1 / 60);
    assert.equal(counters.updates, 8, JSON.stringify(Object.keys(patch))); assert.equal(m._timeUpFrozen, false);
  }
  const { m, counters } = make('patched', { state: 'finish', paused: true }); m.update(1 / 60); assert.equal(counters.updates, 0);
});

test('#923 the finish -> judge transition and the clock-zero boundary are unchanged', () => {
  for (const kind of ['baseline', 'patched']) {
    const { m } = make(kind, { time: 0.02 }); const states = [];
    for (let i = 0; i < 60 * 4; i++) { const s = m.state; m.update(1 / 60); if (m.state !== s) states.push([m.state, i]); }
    assert.deepEqual(states.map(x => x[0]), ['finish', 'judge']); assert.equal(m.result.winner, 0);
    assert.equal(m.time, 0);
  }
  const a = make('baseline', { time: 0.02 }).m, b = make('patched', { time: 0.02 }).m, ta = [], tb = [];
  for (let i = 0; i < 60 * 4; i++) { const sa = a.state, sb = b.state; a.update(1 / 60); b.update(1 / 60); if (a.state !== sa) ta.push([a.state, i]); if (b.state !== sb) tb.push([b.state, i]); }
  assert.deepEqual(tb, ta);
});

test('#923 fixed clock keeps stepping projectiles after TIME UP while actor simulation is frozen', () => {
  const G = { time: 0, projectiles: { steps: 0, update() { this.steps++; } }, net: null };
  installClock({ G });
  const game = { input: { padPressed: new Set(), pollPad() {}, _padEpoch: 0, endFrame() {}, mobile: null }, _padMenus() {}, showcase: {}, rig: {}, _updateAttract() {} };
  const m = { paused: false, attract: false, state: 'playing', updateController() {}, update() {}, controller: null, local: null };
  game.match = m;
  runSimulation(game, STEP * 10); assert.equal(G.projectiles.steps, 10);
  m.state = 'finish'; m.update = function () { this._timeUpFrozen = true; };
  runSimulation(game, STEP * 10); assert.equal(G.projectiles.steps, 20, 'already-thrown projectiles still resolve after TIME UP');
  m.paused = true; runSimulation(game, STEP * 5); assert.equal(G.projectiles.steps, 20, 'pause still owns the projectile gate');
});

test('#923 adapter connects once and fails closed', () => {
  assert.equal(adaptTimeUpFreeze('src/game/actor.js', 'x', replaceOnce), 'x');
  const out = adaptTimeUpFreeze('src/game/match.js', sources.baseline, replaceOnce);
  assert.ok(out.indexOf('_timeUpFrozen') < out.indexOf('else a.update(dt)'));
  assert.throws(() => adaptTimeUpFreeze('src/game/match.js', out, replaceOnce));
  assert.throws(() => adaptTimeUpFreeze('src/game/match.js', sources.baseline.replace('nm.applyRemote(a, dt); else a.update(dt); }', 'nm.applyRemote(a, dt); else a.update(dt);  }'), replaceOnce));
  new vm.SourceTextModule(sources.patched);
});
