import test from 'node:test';
import { updateSplatGhosts } from '../../splatoon3/issue-284-adapter.mjs';
import assert from 'node:assert/strict';
import { compose } from './idle-fixture.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { idleAttractMenuBudget, notePausedWorldChange, pausedWorldFrame } from '../idle-resources.mjs';
import { applyAimSettingsChange } from '../aim-profile.mjs';
import { installClock, runSimulation } from '../../splatoon3/runtime/clock.mjs';
import { syncPortraitFrame } from '../portrait-guard.mjs';

const source = adaptRange('src/main.js', adaptNetworkSource('src/main.js', compose('src/main.js')));
const start = source.indexOf('  _frame(dt) {');
const end = source.indexOf('\n  // continuous sounds', start);
assert.ok(start >= 0 && end > start, 'composed installed Game._frame exists');
const makeFrame = G => new Function('updateSplatGhosts', 'G', 'runSimulation', 'pausedWorldFrame', 'idleAttractMenuBudget', 'performance', 'damp', 'clamp', 'THREE', 'syncPortraitFrame',
  `return class Frame {\n${source.slice(start, end)}\n}`)
  (updateSplatGhosts, G, runSimulation, pausedWorldFrame, idleAttractMenuBudget, performance, (a, b) => b, x => x, {}, syncPortraitFrame);

const vector = () => ({ copy() { return this; }, set() { return this; }, getWorldDirection() { return this; } });
function fixture({ mode = 'menu', attract = true, touch = true, quality = 'high', fullFrame = false } = {}) {
  const calls = { matchDt: [], controllerDt: [], projectileDt: [], attractDt: [], renderDt: [],
    fx: [], environment: [], paint: [], screenfx: [], decor: [], props: [], rig: [], botUpdates: 0, actorUpdates: 0 };
  const count = key => () => { calls[key] = (calls[key] || 0) + 1; };
  const G = {
    time: 0, mode, mobile: { touch }, level: {}, teamColors: [{}, {}],
    renderer: { info: { reset() {}, render: { calls: 0, triangles: 0 } }, shadowMap: { autoUpdate: false, needsUpdate: false } },
    fx: { update: dt => calls.fx.push(dt) },
    env: { theme: 'day', update: dt => calls.environment.push(dt) },
    projectiles: { update: dt => calls.projectileDt.push(dt), updateArc: count('arc') },
    paint: { flush: dt => calls.paint.push(dt) },
    camera: { position: vector(), up: vector() },
    net: { update: count('network') },
  };
  const match = {
    attract, paused: false, state: 'playing', local: null,
    controller: { computeAim: count('aim') },
    updateController(dt) { calls.controllerDt.push(dt); },
    update(dt) { calls.matchDt.push(dt); calls.botUpdates += 8; calls.actorUpdates += 8; },
  };
  const game = new (makeFrame(G))();
  Object.assign(game, {
    match, mobile: { touch }, settings: { quality }, showcase: { fullFrame, mode: null, update: count('showcaseUpdate'), render: count('showcaseRender') },
    input: { padPressed: new Set(), _padEpoch: 0, pollPad() {}, endFrame: count('inputEnd') },
    _padMenus: count('padMenus'), _updateAttract: dt => calls.attractDt.push(dt),
    screenfx: { update: dt => calls.screenfx.push(dt) },
    decor: { update: dt => calls.decor.push(dt) }, props: { update: dt => calls.props.push(dt) },
    rig: { mode: 'orbit', target: null, setMap: count('setMap'), update: dt => calls.rig.push(dt) },
    levelMat: { userData: { uniforms: {
      uTime: { value: 0 }, uSeeOn: { value: 0 }, uSeeA: { value: vector() }, uSeeB: { value: vector() },
    } } },
    R: { render() { calls.worldRender = (calls.worldRender || 0) + 1; G.renderer.shadowMap.needsUpdate = false; },
      grade: { uniforms: { uHurt: { value: 0 }, uHurtColor: { value: { copy() {} } } } } },
    _dioFog: count('fog'), _updateLocalLoops: count('loops'), _updateAmbience: count('ambience'),
    menus: { current: 'settings', update: count('menuUpdate') }, _skipRender: false,
  });
  installClock({ G });
  return {
    G, game, calls,
    frame(dt) {
      game._frame(dt);
      if (game._menuAttractFrame) calls.renderDt.push(game._menuAttractFrameDelta);
    },
  };
}

test('touch/LOW ordinary menu attract simulation and 3D world run at 20 Hz across render cadences', () => {
  for (const fps of [30, 60, 120]) {
    const h = fixture({ mode: 'menu', attract: true, touch: true, quality: 'high' });
    for (let i = 0; i < fps; i++) h.frame(1 / fps);
    assert.equal(h.calls.matchDt.length, 20, `${fps} Hz render: Match cadence`);
    assert.equal(h.calls.controllerDt.length, 20, `${fps} Hz render: controller cadence`);
    assert.equal(h.calls.projectileDt.length, 20, `${fps} Hz render: projectile cadence`);
    assert.equal(h.calls.attractDt.length, 20, `${fps} Hz render: attract timer cadence`);
    assert.equal(h.calls.worldRender, 20, `${fps} Hz render: world render cadence`);
    assert.equal(h.calls.arc, 20, `${fps} Hz render: projectile arc presentation cadence`);
    for (const key of ['fx', 'environment', 'paint', 'screenfx', 'decor', 'props', 'rig']) {
      assert.equal(h.calls[key].length, 20, `${fps} Hz render: ${key} cadence`);
      assert.ok(Math.abs(h.calls[key].reduce((a, b) => a + b, 0) - 1) < 1e-9, `${fps} Hz render: ${key} receives elapsed time`);
    }
    assert.equal(h.calls.actorUpdates, 160, `${fps} Hz render: eight actor updates per Match step`);
    assert.equal(h.calls.botUpdates, 160, `${fps} Hz render: eight bot updates per Match step`);
    assert.equal(h.calls.menuUpdate, fps, 'DOM menu still updates at render cadence');
    assert.equal(h.calls.showcaseUpdate, fps, 'showcase/menu presentation updates at render cadence');
    assert.equal(h.calls.showcaseRender, fps, 'showcase render remains at render cadence');
    assert.equal(h.calls.network, fps, 'network pump remains at render cadence');
    assert.ok(Math.abs(h.G.time - 1) < 1e-9, 'the fixed 60 Hz game clock keeps advancing');
    assert.ok(Math.abs(h.calls.renderDt.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'world updates receive elapsed render time');
  }
});

test('only touch or LOW menu backdrops are budgeted; live matches and desktop HIGH stay at native cadence', () => {
  const cases = [
    { opts: { mode: 'menu', attract: true, touch: false, quality: 'high' }, expected: 60 },
    { opts: { mode: 'match', attract: false, touch: true, quality: 'high' }, expected: 60 },
    { opts: { mode: 'menu', attract: true, touch: false, quality: 'low' }, expected: 20 },
  ];
  for (const { opts, expected } of cases) {
    const h = fixture(opts);
    for (let i = 0; i < 60; i++) h.frame(1 / 60);
    assert.equal(h.calls.matchDt.length, expected, JSON.stringify(opts));
    assert.equal(h.calls.worldRender, expected, JSON.stringify(opts));
    assert.equal(h.calls.menuUpdate, 60, 'menu presentation cadence is unaffected');
    assert.ok(Math.abs(h.G.time - 1) < 1e-9);
  }
  assert.equal(idleAttractMenuBudget({ match: { attract: true }, mobile: { touch: true }, settings: {} }, { mode: 'menu' }), true);
  assert.equal(idleAttractMenuBudget({ match: { attract: true }, mobile: { touch: false }, settings: { quality: 'high' } }, { mode: 'menu' }), false);
  assert.equal(idleAttractMenuBudget({ match: { attract: false }, mobile: { touch: true }, settings: { quality: 'low' } }, { mode: 'menu' }), false);
  assert.equal(idleAttractMenuBudget({ match: { attract: true }, mobile: { touch: true }, showcase: { fullFrame: true } }, { mode: 'menu' }), false);
  assert.equal(idleAttractMenuBudget({ match: { attract: true }, mobile: { touch: true } }, { mode: 'match' }), false);
});

test('composed offline pause compares fixed controls without enumerating settings and invalidates through real settings writes', () => {
  const h = fixture({ mode: 'match', attract: false, touch: false });
  h.game.match.paused = true;
  let enumerations = 0;
  const values = { quality: 'high', shadows: true, bloom: true, fov: 82, lang: 'ja', gyro: false }; // native DEFAULT_SETTINGS starts with gyro disabled
  h.G.camera.fov = values.fov; // the native settings writer starts from an already applied camera FOV
  h.game.settings = new Proxy(values, { ownKeys(target) { enumerations++; return Reflect.ownKeys(target); } });
  const width = Object.hasOwn(globalThis, 'innerWidth') ? globalThis.innerWidth : undefined;
  const height = Object.hasOwn(globalThis, 'innerHeight') ? globalThis.innerHeight : undefined;
  const pixelRatio = Object.hasOwn(globalThis, 'devicePixelRatio') ? globalThis.devicePixelRatio : undefined;
  const hadWidth = Object.hasOwn(globalThis, 'innerWidth'), hadHeight = Object.hasOwn(globalThis, 'innerHeight');
  const hadPixelRatio = Object.hasOwn(globalThis, 'devicePixelRatio');
  globalThis.innerWidth = 800; globalThis.innerHeight = 600; globalThis.devicePixelRatio = 1;
  try {
    let steady;
    for (let i = 0; i < 120; i++) {
      h.frame(1 / 60);
      const status = pausedWorldFrame(h.game, h.G);
      if (steady) assert.equal(status, steady, 'unchanged paused frames reuse the same no-draw status without commit closures');
      steady = status;
      assert.equal(status.commit, undefined, 'unchanged path has no fresh commit closure');
    }
    assert.equal(h.calls.worldRender, 1, 'offline paused world renders once across 120 composed frames');
    assert.equal(enumerations, 0, 'unchanged RAF frames never enumerate or serialize the settings object');

    const setStart = source.indexOf('  _setSettings(partial) {');
    const setEnd = source.indexOf('\n  _applyAudioVolumes(', setStart);
    assert.ok(setStart >= 0 && setEnd > setStart, 'production settings writer remains in composed Game source');
    const SettingsWriter = new Function('notePausedWorldChange', 'applyAimSettingsChange', 'G', 'saveJSON',
      `return class SettingsWriter {\n${source.slice(setStart, setEnd)}\n}`)(notePausedWorldChange, applyAimSettingsChange, h.G, () => {});
    SettingsWriter.prototype._setSettings.call(h.game, { lang: 'en' });
    assert.equal(h.game._pausedWorldRevision || 0, 0, 'language-only writes do not invalidate the arena');
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 1);
    SettingsWriter.prototype._setSettings.call(h.game, { fov: 84 });
    assert.equal(h.game._pausedWorldRevision, 1, 'changed backdrop settings advance the real API revision');
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 2);
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 2, 'one settings write causes one redraw');

    h.game.settings.bloom = false;
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 3, 'direct native setting mutation is observed');
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 3);
    h.game.settings.gyro = true;
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 4, 'direct native UI gyro mutation is observed');
    h.G.camera.position.x = 2;
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 5, 'camera transform changes invalidate the frozen view');
    h.G.env.reflections = false;
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 6, 'reflection controls invalidate the frozen view');
    h.G.renderer.toneMapping = 'linear';
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 7, 'renderer controls invalidate the frozen view');
    globalThis.innerWidth = 1200;
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 8, 'viewport changes invalidate the frozen view');
    h.game.R.dynScale = .9;
    h.frame(1 / 60); assert.equal(h.calls.worldRender, 9, 'dynamic render scale changes invalidate the frozen view');
    const rangeRender = h.calls.showcaseRender;
    h.game.showcase.fullFrame = true; h.frame(1 / 60); h.frame(1 / 60);
    assert.equal(h.calls.showcaseRender, rangeRender + 2, 'full-frame Practice Range presentation remains live');
    assert.equal(h.calls.worldRender, 9, 'the covered arena backdrop remains isolated');
    h.game.showcase.fullFrame = false; h.G.netm = {};
    h.frame(1 / 60); h.frame(1 / 60);
    assert.equal(h.calls.worldRender, 11, 'online pause continues rendering at frame cadence');
  } finally {
    if (hadWidth) globalThis.innerWidth = width; else delete globalThis.innerWidth;
    if (hadHeight) globalThis.innerHeight = height; else delete globalThis.innerHeight;
    if (hadPixelRatio) globalThis.devicePixelRatio = pixelRatio; else delete globalThis.devicePixelRatio;
  }
});
