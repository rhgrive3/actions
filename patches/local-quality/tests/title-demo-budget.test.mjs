import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { effectiveQuality } from '../../../inkwave-public/src/config.js';
import { idleAttractMenuBudget, pausedWorldFrame } from '../idle-resources.mjs';
import { syncPortraitFrame } from '../portrait-guard.mjs';
import { updateSplatGhosts } from '../../splatoon3/issue-284-adapter.mjs';
import { installClock, runSimulation } from '../../splatoon3/runtime/clock.mjs';
import { adaptTitleDemoBudget, prepareTitleDemoFrame, holdTitleDemoFrame, releaseTitleDemoBudget } from '../title-demo-budget-adapter.mjs';

function composed(rel) {
  const source = adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
  const installed = rel === 'src/main.js' ? source.includes('ZEVANT lightweight title demo') : source.includes('const titleTeamSize');
  return installed ? source : adaptTitleDemoBudget(rel, source);
}
const source = composed('src/main.js');
const start = source.indexOf('  _frame(dt) {'), end = source.indexOf('\n  // continuous sounds', start);
assert.ok(start >= 0 && end > start);
const vector = () => ({ copy() { return this; }, set() { return this; }, getWorldDirection() { return this; } });

function fixture({ touch = false, quality = 'high', reduced = false, savedScale = 1 } = {}) {
  const calls = { ticks: [], projectile: [], world: 0, menus: 0, network: 0, presents: 0, captures: 0, scales: [] };
  const count = key => () => { calls[key] = (calls[key] || 0) + 1; };
  const media = { matches: reduced };
  const env = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2, document: { hidden: false }, matchMedia: () => media };
  const G = {
    time: 0, mode: 'menu', mobile: { touch }, level: {}, teamColors: [{}, {}], actors: [],
    renderer: { info: { reset() {}, render: { calls: 0, triangles: 0 } }, shadowMap: { autoUpdate: false, needsUpdate: false } },
    fx: { update: count('fx') }, env: { theme: 'day', update: count('env') },
    projectiles: { update: dt => calls.projectile.push(dt), updateArc() {} }, paint: { flush: count('paint') },
    camera: { position: vector(), up: vector() }, net: { update: count('network') },
  };
  const bindings = {
    G, document: env.document, effectiveQuality, updateSplatGhosts, runSimulation, pausedWorldFrame, idleAttractMenuBudget,
    performance, damp: (a, b) => b, clamp: x => x, THREE: {}, syncPortraitFrame,
    INKWAVE_ART_MENU_SCREENS: new Set(['main', 'mode', 'setup', 'loadout', 'locker', 'settings', 'howto', 'credits', 'online']),
    prepareTitleDemoFrame: (game, g, dt) => prepareTitleDemoFrame(game, g, dt, env), holdTitleDemoFrame,
  };
  const Frame = new Function(...Object.keys(bindings), `return class Frame {${source.slice(start, end)}}`)(...Object.values(bindings));
  const game = new Frame();
  Object.assign(game, {
    match: { attract: true, paused: false, state: 'playing', actors: [], local: null,
      updateController() {}, update: dt => calls.ticks.push(dt) },
    mobile: { touch }, settings: { quality }, showcase: { fullFrame: false, mode: null, update() {}, render() {} },
    input: { padPressed: new Set(), _padEpoch: 0, pollPad: count('pad'), endFrame() {} },
    _padMenus: count('padMenu'), _updateAttract: count('attract'), screenfx: { update() {} },
    decor: { update() {} }, props: { update() {} },
    rig: { mode: 'orbit', target: null, setMap() {}, update: count('camera') },
    levelMat: { userData: { uniforms: { uTime: { value: 0 }, uSeeOn: { value: 0 }, uSeeA: { value: vector() }, uSeeB: { value: vector() } } } },
    R: { dynScale: savedScale, snapshot: false,
      render() { calls.world++; G.renderer.shadowMap.needsUpdate = false; },
      setDynamicScale(scale) { this.dynScale = scale; calls.scales.push(scale); },
      releasePausedFrame() { this.snapshot = false; },
      capturePausedFrame() { calls.captures++; this.snapshot = true; return true; },
      presentPausedFrame() { calls.presents++; return this.snapshot; },
      grade: { uniforms: { uHurt: { value: 0 }, uHurtColor: { value: { copy() {} } } } },
    },
    _dioFog() {}, _updateLocalLoops() {}, _updateAmbience() {},
    menus: { current: 'title', _scr: { name: 'title' }, update: count('menus') }, _skipRender: false,
  });
  installClock({ G });
  return { game, G, env, media, calls, frame: dt => game._frame(dt) };
}

test('installed title uses 30/20 Hz world presentation without changing the actual 60 Hz simulation or native UI cadence', () => {
  for (const fps of [30, 60, 90, 120, 144]) for (const touch of [false, true]) {
    const h = fixture({ touch });
    for (let n = 0; n < fps * 2; n++) h.frame(1 / fps);
    assert.equal(h.calls.ticks.length, 120, `fixed ticks at ${fps} Hz, touch=${touch}`);
    assert.equal(h.calls.projectile.length, 120);
    assert.ok(h.calls.ticks.every(dt => dt === 1 / 60));
    assert.equal(h.calls.world, touch ? 40 : 60);
    assert.equal(h.calls.camera, h.calls.world);
    assert.equal(h.calls.paint, h.calls.world);
    assert.equal(h.calls.menus, fps * 2);
    assert.equal(h.calls.network, fps * 2);
    assert.ok(Math.abs(h.G.time - 2) < 1e-9);
    assert.deepEqual(h.calls.scales, [touch ? 0.6 : 0.75], 'density is resized once, never every frame');
  }
});

test('leaving title restores the previous density and real gameplay resumes at its native render cadence', () => {
  const h = fixture({ savedScale: 0.875 });
  const originalSettings = { ...h.game.settings };
  for (let i = 0; i < 60; i++) h.frame(1 / 60);
  assert.equal(h.calls.world, 30);
  h.G.mode = 'match'; h.game.match.attract = false;
  h.game.menus.current = null; h.game.menus._scr = null;
  for (let i = 0; i < 60; i++) h.frame(1 / 60);
  assert.equal(h.calls.world, 90, 'real world renders at 60 Hz immediately');
  assert.equal(h.calls.ticks.length, 120);
  assert.equal(h.game.R.dynScale, 0.875);
  assert.deepEqual(h.game.settings, originalSettings);
  assert.deepEqual(h.calls.scales, [0.75, 0.875]);
  assert.equal(h.game._titleDemo.active, false);
  assert.equal(h.game._titleDemo.match, null, 'release drops the disposed attract match and its actor graph');
  releaseTitleDemoBudget(h.game);
  assert.equal(h.calls.scales.length, 2, 'release is idempotent');
});

test('reduced motion keeps a single frozen scene, responsive controls, and no hidden simulation debt', () => {
  const h = fixture({ reduced: true });
  for (let i = 0; i < 120; i++) h.frame(1 / 60);
  assert.equal(h.calls.world, 1);
  assert.equal(h.calls.captures, 1);
  assert.equal(h.calls.ticks.length, 0);
  assert.equal(h.calls.menus, 120);
  assert.equal(h.calls.network, 120);
  assert.equal(h.calls.padMenu, 120);
  assert.equal(h.G.time, 0);
  h.env.innerWidth = 1000;
  h.frame(1 / 60);
  assert.equal(h.calls.world, 2, 'viewport changes redraw once');
  h.frame(1 / 60);
  assert.equal(h.calls.world, 2);
  h.game.R.snapshot = false;
  h.frame(1 / 60);
  assert.equal(h.calls.world, 3, 'missing GPU snapshot gets a real draw fallback');
  h.env.document.hidden = true;
  h.frame(20);
  assert.equal(h.calls.world, 3);
  assert.equal(h.calls.ticks.length, 0);
  h.env.document.hidden = false;
  h.media.matches = false;
  for (let i = 0; i < 60; i++) h.frame(1 / 60);
  assert.equal(h.calls.ticks.length, 60, 'only foreground elapsed time is simulated');
  assert.equal(h.calls.world, 33);
});

test('online, full-frame showcase, mounted-screen mismatch and non-title screens cannot acquire the title budget', () => {
  for (const mutate of [
    h => { h.G.netm = {}; },
    h => { h.game.showcase.fullFrame = true; },
    h => { h.game.menus._scr.name = 'main'; },
    h => { h.game.menus.current = 'main'; },
    h => { h.game.match.attract = false; },
  ]) {
    const h = fixture(); mutate(h);
    const state = prepareTitleDemoFrame(h.game, h.G, 1 / 60, h.env);
    assert.equal(state.active, false);
    assert.deepEqual(h.calls.scales, []);
  }
});

test('actual Match.setup constructs only the title 2v2 roster; battle, boss, mannequins and online roster paths retain their sizes', () => {
  const matchSource = composed('src/game/match.js');
  const a = matchSource.indexOf('  setup() {'), b = matchSource.indexOf('\n  // Online:', a);
  assert.ok(a >= 0 && b > a);
  function setup(opts, { attract = true, boss = false } = {}) {
    const G = { scene: { add() {} }, level: { spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }] } };
    class Actor { constructor(o) { Object.assign(this, o); this.character = { root: {} }; } spawnAt() {} }
    class BotBrain { constructor() {} }
    const bindings = { G, MATCH: { teamSize: 4 }, WEAPON_ORDER: ['shooter', 'roller', 'charger', 'splatling'], BOT_NAMES: ['one', 'two'],
      safeWeaponId: id => id, queueWEAPONS: {}, shuffle: a => a, Actor, BotBrain, PlayerController: class {},
      randomStyle: () => ({}), _v: vector(), beginInitialSquidSpawn: () => false, nativeSpawnYaw: (level, team, fallback) => fallback,
      on: () => () => {}, rearmTeamWipe() {},
    };
    const Setup = new Function(...Object.keys(bindings), `return class Setup {${matchSource.slice(a, b)}}`)(...Object.values(bindings));
    const instance = new Setup();
    Object.assign(instance, { opts, attract, mode: boss ? 'boss' : 'turf', actors: [],
      bossCfg: boss ? { squad: 8 } : null, bossModule: boss ? { BossMode: class {} } : null,
      _setupRoster(o) { this.actors = o.roster.slice(); },
    });
    instance.setup();
    return instance.actors;
  }
  assert.equal(setup({ titleDemo: true }).length, 4);
  assert.deepEqual(setup({ titleDemo: true }).map(a => a.team), [0, 0, 1, 1]);
  assert.equal(setup({}).length, 8);
  assert.equal(setup({ titleDemo: true }, { attract: false }).length, 8);
  assert.equal(setup({ titleDemo: true }, { attract: false, boss: true }).length, 8);
  assert.equal(setup({ titleDemo: true, mannequins: true }).length, 8);
  assert.equal(setup({ titleDemo: true, noBots: true }).length, 0);
  const roster = [{ team: 0 }, { team: 0 }, { team: 0 }, { team: 1 }, { team: 1 }, { team: 1 }];
  assert.deepEqual(setup({ titleDemo: true, roster }), roster);
});

test('title adapter rejects missing or repeated semantic anchors and leaves unrelated files untouched', () => {
  assert.throws(() => adaptTitleDemoBudget('src/main.js', ''), /expected 1 anchor/);
  assert.throws(() => adaptTitleDemoBudget('src/main.js', source), /expected 1 anchor/);
  assert.equal(adaptTitleDemoBudget('src/game/weapons.js', 'unchanged'), 'unchanged');
  assert.match(source, /new Match\(\{ titleDemo: !DEV_STAGE, attract: true/);
});
