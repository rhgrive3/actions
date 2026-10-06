// #53: results presentation keeps only the draw/animation work it needs.
// The test drives the actually composed (installed) Game._frame — the full
// adapter chain output, not a mirror of the guard — and compares PLAYING vs
// RESULT work counters: gameplay FX and the paint atlas must stop behind
// RESULT (offline and online) while the results stage, GUI, backdrop draw and
// renderer keep running, and every counter resumes when a new match starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../local-quality/tests/idle-fixture.mjs';
import { pausedWorldFrame } from '../../local-quality/idle-resources.mjs';

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
  const Frame = new Function('G', 'runSimulation', 'pausedWorldFrame', 'performance', 'damp', 'clamp', 'THREE',
    'return class Frame {\n' + source.slice(start, end) + '\n}')
    (G, count('simulation'), pausedWorldFrame, performance, (a, b) => b, x => x, {});
  const f = new Frame();
  f.settings = { quality: 'high' };
  f.match = { paused: false, attract: false, state: 'playing', local: null, actors: [] };
  f.showcase = { fullFrame: false, mode: 'results', update: count('showcase'), render: count('showcaseRender') };
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
