import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { adaptStart } from '../start-adapter.mjs';
import { adaptResults } from '../results-adapter.mjs';
import { adaptIntro } from '../intro-adapter.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { turfExperience } from '../../splatoon3/runtime/results-scoring.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';

const RAW = fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');
const BEFORE = adaptIntro('src/main.js', adaptResults('src/main.js', adaptTouchLayout('src/main.js', adaptSource('src/main.js', RAW))));
const AFTER = adaptStart('src/main.js', BEFORE);
// Actual preceding results methods plus the current operation-aware start/quit
// methods reproduce the confirmed composition gap without inventing a judge.
const oldResults = section(BEFORE, '  async _bossResults() {', '\n  _fade(to, ms)')
  // The newer epoch guard independently closes part of this old race. Remove
  // it only in the explicit negative control so the missing operation owner is exercised.
  .replace("    if (this._s3JudgeEpoch !== judgeEpoch || this.match !== m || m.state !== 'judge') return;\n", '');
const RESULT_FLOW_BEFORE = AFTER.replace(section(AFTER, '  async _bossResults() {', '\n  _fade(to, ms)'), oldResults);
function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, start);
  return source.slice(at, until);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function boot(source, held = []) {
  const calls = [], resources = [], gates = {}, reached = {}, hooks = {};
  for (const phase of ['fade', 'boss', 'world', 'warm']) { gates[phase] = deferred(); reached[phase] = deferred(); }
  const record = (name, ...args) => { calls.push([name, ...args]); hooks[name]?.(); };
  const phase = (name, value) => { record(name); reached[name].resolve(); return held.includes(name) ? gates[name].promise : Promise.resolve(value); };
  const resource = (kind, extra = {}) => {
    const r = { kind, disposed: 0, dispose() { this.disposed++; record('disposeResource', kind); }, ...extra };
    resources.push(r); return r;
  };
  const scene = {
    children: new Set(), add(...items) { for (const item of items) if (item) this.children.add(item); },
    remove(...items) { for (const item of items) this.children.delete(item); },
  };
  const maps = ['old', 'a', 'b', 'c'].map(id => ({ id, name: id }));
  class Level {
    constructor(layout) { this.id = layout.id; this.bounds = {}; this.faces = [{}]; this.layoutHash = 'good'; }
    buildGeometry() { return resource('geometry:' + this.id, { index: { count: 1 } }); }
    layoutLightmap() { this.lightSize = 64; }
  }
  class PropKit {
    constructor(parent) { this.scene = parent; this.group = { kind: 'propsGroup' }; this.disposed = 0; resources.push(this); parent?.add(this.group); }
    add() { return { colliders: [] }; }
    build() {}
    dispose() { this.disposed++; this.scene?.remove(this.group); record('disposeProps'); }
  }
  class Match {
    constructor(opts) { this.opts = opts; this.attract = !!opts.attract; this.state = 'init'; this.actors = []; this.local = { team: 0, yaw: 0 }; this.disposed = 0; }
    setup() { record('setup', this.attract); }
    start() { this.state = 'intro'; record('start', this.attract); }
    dispose() { this.disposed++; record('disposeMatch', this.attract); }
  }
  const G = {
    scene, renderer: { compileAsync: () => { record('compile'); return Promise.resolve(); } }, teamColors: [null, null],
    net: { tr: {}, state: 'starting', code: 'ABCDE', myId: 'me', isHost: true }, netm: null,
    audio: { init: () => record('audio'), duck: () => record('duck') }, music: { stop: () => record('musicStop') },
    projectiles: { clear: () => record('clearProjectiles') }, fx: { clear: () => record('clearFx'), setLighting: () => record('lighting') },
    paint: resource('paint:old', { clear: () => record('clearPaint'), texture: {}, size: 64 }),
    level: { id: 'old' }, physics: { id: 'old' }, mode: 'menu',
    env: { setTheme: () => record('theme'), getSkyColors: () => ({}), rebuildForArena: () => record('arena') },
  };
  const sandbox = {
    console: { warn() {}, error() {} }, Promise, G, Match, Level, PropKit,
    MAPS: maps, OFFLINE_MAPS: maps, MAP_LAYOUTS: Object.fromEntries(maps.map(m => [m.id, m])),
    mapOfflineOk: () => true, mapBossOk: () => true, mapNoBots: () => false,
    DEV_STAGE: false, MATCH: { defaultDuration: 180 }, params: { has: () => false },
    mapTheme: (_map, time) => time, TEAM_PALETTES: [{}], COLORBLIND_PALETTE: {},
    effectiveQuality: () => ({ paintAtlas: 64 }), dressingFor: () => [{}],
    Physics: class { constructor(level) { this.id = level.id; } },
    PaintSystem: class { constructor(_renderer, level) { return resource('paint:' + level.id, { texture: {}, size: 64, clear() {} }); } },
    createLevelMaterial: () => resource('material'),
    SwimWake: class { reset() { record('wake'); } },
    Decor: class { constructor(parent) { this.scene = parent; this.group = {}; this.disposed = 0; parent.add(this.group); } dispose() { this.disposed++; this.scene.remove(this.group); } },
    NavGraph: class { constructor(level) { this.id = level.id; } },
    Minimap: class { constructor(level) { this.id = level.id; } setViewerTeam(team) { record('viewer', team); } },
    THREE: { Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } } },
    setTimeout: () => 1, clearTimeout: () => record('clearTimer'),
  };
  const methods = [
    section(source, '  async _buildWorld(', '\n  // deck slabs over the sea:'),
    section(source, '  _startAttract() {', '\n  _attractShot() {'),
    source.includes('  _beginMatchFlow() {') ? section(source, '  _beginMatchFlow() {', '\n  async startMatch(') : '',
    section(source, '  async startMatch(', '\n  // ---- online (src/net/session.js'),
    section(source, '  async startNetMatch(', '\n  // the room went away mid-match'),
    section(source, '  async quitToMenu() {', '\n  // Boss Battle intro:'),
    section(source, '  async _bossResults() {', '\n  _fade(to, ms)'),
  ].join('\n');
  const context = vm.createContext(sandbox);
  const Game = vm.runInContext(`class Game {${methods}}; Game`, context);
  const game = new Game(), initial = new Match({ attract: true });
  Object.assign(game, {
    match: initial, mapDef: maps[0], layoutId: 'old', time: 'day', theme: 'day', settings: { difficulty: 'normal', quality: 'high', matchLength: 180 },
    profile: { name: 'Player', weapon: 'shooter' }, PropKit,
    murals: { userData: { setStage: id => record('mural', id) } },
    rig: { follow: () => record('follow') },
    input: { requestLock: () => record('requestLock'), exitLock: () => record('exitLock'), mobile: { setVisible: value => record('mobile', value) } },
    menus: { current: 'main', show(screen) { this.current = screen; record('menu', screen); } },
    hud: { setVisible: value => record('hud', value), hideSplatted: () => record('hideSplatted') },
    showcase: { hide: () => record('showcase') }, minimap: { setViewerTeam: team => record('viewer', team) },
    _fade: to => to ? phase('fade') : Promise.resolve(record('fadeOut')),
    _loadBoss: () => phase('boss', { BOSS_MODE: { duration: 240 } }),
    _loadLightmap: () => phase('world', resource('lightmap')),
    _warmCharacters: () => phase('warm'),
    _applyNight: () => record('night'), _pickPalette: () => ({}), _setPalette: () => record('palette'),
    _startGyro: () => record('gyro'), _attractShot: () => record('attractShot'), _playMusic: track => record('music', track),
    _shadowRoots: () => record('shadow'), _footprint: () => [],
  });
  const nm = { bind(m) { G.netm = this; this.match = m; record('bind'); } };
  G.net.match = nm;
  G.net.leave = () => { G.net.tr = null; G.net.match = null; G.netm = null; G.net.state = 'offline'; record('leave'); };
  G.net.endMatch = () => { G.net.match = null; G.netm = null; record('endMatch'); };
  const cfg = { map: 'a', time: 'day', mode: 'boss', duration: 240, roster: [], palette: 0 };
  return {
    game, G, nm, cfg, maps, calls, resources, gates, reached, hooks, context, initial, phase,
    start(online) { return online ? game.startNetMatch(cfg, nm) : game.startMatch({ mapId: 'a', mode: 'boss' }); },
    count: name => calls.filter(c => c[0] === name).length,
    snapshot: () => ({ match: game.match, level: G.level, paint: G.paint, physics: G.physics, map: game.mapDef, layout: game.layoutId, mode: G.mode, menu: game.menus.current }),
  };
}

test('negative proof: raw online startup disposes a newer match after the first fade', async () => {
  const h = boot(RAW, ['fade']);
  const pending = h.start(true);
  h.game.match = { disposed: 0, dispose() { this.disposed++; } };
  const newer = h.game.match;
  h.G.net.tr = {};
  h.gates.fade.resolve(); await pending;
  assert.equal(newer.disposed, 1);
  assert.notEqual(h.game.match, newer);
});

function cancel(h, kind) {
  if (kind === 'match') h.game.match = { state: 'playing', dispose() { throw new Error('new match must survive'); } };
  if (kind === 'null match') h.game.match = null;
  if (kind === 'transport') h.G.net.tr = {}; // session and room code remain unchanged
  if (kind === 'session') h.G.net = { ...h.G.net };
  if (kind === 'network match') h.G.netm = {};
  if (kind === 'session match') h.G.net.match = {};
}

for (const online of [false, true]) {
  for (const phase of ['fade', 'boss', 'world', 'warm']) {
    for (const kind of ['match', 'null match', 'transport', 'session', 'network match', 'session match']) {
      test(`${online ? 'online' : 'offline'} ${phase} completion stops after changed ${kind}`, async () => {
        const h = boot(AFTER, [phase]);
        const pending = h.start(online);
        await h.reached[phase].promise;
        cancel(h, kind);
        const snapshot = h.snapshot(), at = h.calls.length;
        const tex = { disposed: 0, dispose() { this.disposed++; } };
        h.gates[phase].resolve(phase === 'world' ? tex : phase === 'boss' ? { BOSS_MODE: { duration: 240 } } : undefined);
        await pending;
        assert.deepEqual(h.snapshot(), snapshot, 'newer state remains unchanged');
        assert.deepEqual(h.calls.slice(at).filter(c => c[0] !== 'disposeProps'), [], 'no obsolete UI/game/global continuation');
        if (phase === 'world') assert.equal(tex.disposed, 1, 'only staged lightmap is disposed');
      });
    }
  }
  test(`${online ? 'online' : 'offline'} ordinary startup preserves call sequence and delivery`, async () => {
    const before = boot(BEFORE), after = boot(AFTER);
    await before.start(online); await after.start(online);
    const external = h => h.calls.filter(c => !['world', 'disposeResource', 'disposeProps'].includes(c[0]));
    assert.deepEqual(external(after), external(before));
    assert.equal(after.G.mode, 'match'); assert.equal(after.game.match.disposed, 0);
    assert.equal(after.game.layoutId, 'a'); assert.equal(after.G.level.id, 'a');
    assert.equal(after.game.match.opts.duration, before.game.match.opts.duration);
    assert.equal(after.count('bind'), Number(online));
    assert.equal(after.count('start'), Number(!online));
  });
  for (const phase of ['fade', 'boss', 'world', 'warm']) {
    test(`${online ? 'online' : 'offline'} active ${phase} error is propagated`, async () => {
      const h = boot(AFTER, [phase]);
      const pending = h.start(online);
      await h.reached[phase].promise;
      h.gates[phase].reject(new Error('active ' + phase));
      await assert.rejects(pending, new RegExp('active ' + phase));
      if (phase === 'world') assert.equal(h.resources.find(r => r instanceof h.game.PropKit).disposed, 1);
    });
  }
}

for (const older of [false, true]) {
  for (const newer of ['online', 'offline', 'quit']) {
    test(`${older ? 'online' : 'offline'} start loses ownership immediately to newer ${newer}`, async () => {
      const h = boot(AFTER, ['fade']);
      const oldPending = h.start(older);
      const oldGate = h.gates.fade;
      h.gates.fade = deferred(); // keep newer operation waiting without changing match identity yet
      const newPending = newer === 'quit' ? h.game.quitToMenu() : h.start(newer === 'online');
      const at = h.calls.length;
      oldGate.resolve(); await oldPending;
      assert.deepEqual(h.calls.slice(at), []);
      h.gates.fade.resolve(); await newPending;
      assert.equal(h.G.mode, newer === 'quit' ? 'menu' : 'match');
      assert.equal(h.game.match.attract, newer === 'quit');
    });
  }
}

for (const hook of ['audio', 'menu', 'showcase', 'setup', 'bind', 'start', 'palette']) {
  test(`synchronous ${hook} re-entry cannot finish obsolete startup`, async () => {
    const online = hook === 'bind';
    const h = boot(AFTER);
    h.hooks[hook] = () => { delete h.hooks[hook]; h.game._beginMatchFlow(); };
    await h.start(online);
    assert.equal(h.count('gyro'), 0);
    assert.equal(h.count('fadeOut'), 0);
    if (['audio', 'menu'].includes(hook)) assert.equal(h.count('fade'), 0);
    if (hook === 'showcase') assert.equal(h.initial.disposed, 0);
    if (hook === 'palette') assert.equal(h.count('setup'), 0);
  });
}

test('a stale NetMatch cannot reserve a new startup operation', async () => {
  const h = boot(AFTER);
  const current = h.game._beginMatchFlow();
  await h.game.startNetMatch(h.cfg, { bind() { throw new Error('stale bind'); } });
  assert.equal(h.game._matchFlow, current);
  assert.equal(h.calls.length, 0);
});

for (const online of [false, true]) {
  for (const sameLayout of [false, true]) {
    test(`ordinary ${online ? 'online' : 'offline'} turf start preserves ${sameLayout ? 'same' : 'changed'} layout behavior`, async () => {
      const before = boot(BEFORE), after = boot(AFTER), mapId = sameLayout ? 'old' : 'a';
      const start = h => online ? h.game.startNetMatch({ ...h.cfg, mode: 'turf', map: mapId }, h.nm) : h.game.startMatch({ mapId, mode: 'turf' });
      await start(before); await start(after);
      // The intentional transaction delays old-world disposal until lightmap load.
      // Compare external startup behavior; separate world tests assert disposal ownership.
      const external = h => h.calls.filter(c => !['world', 'disposeResource', 'disposeProps'].includes(c[0]));
      assert.deepEqual(external(after), external(before));
      assert.equal(after.game.match.opts.mode, 'turf');
      assert.equal(after.count('boss'), 0); assert.equal(after.count('world'), Number(!sameLayout));
      assert.equal(after.G.mode, 'match');
    });
  }
}

test('ordinary quit preserves upstream delivery despite intentional leave ownership changes', async () => {
  const before = boot(BEFORE), after = boot(AFTER);
  await before.game.quitToMenu(); await after.game.quitToMenu();
  assert.deepEqual(after.calls, before.calls);
  assert.equal(after.game.match.attract, true); assert.equal(after.G.mode, 'menu');
  assert.equal(after.game.menus.current, 'main');
});

test('rejoining synchronously from room leave invalidates quit instead of adopting the new room', async () => {
  const h = boot(AFTER);
  h.hooks.leave = () => { h.G.net.tr = {}; h.G.net.match = {}; h.G.net.state = 'connecting'; };
  await h.game.quitToMenu();
  assert.equal(h.count('exitLock'), 0); assert.equal(h.count('fade'), 0);
  assert.equal(h.initial.disposed, 0); assert.equal(h.game.menus.current, 'main');
});

for (const kind of ['match', 'null match', 'transport', 'session', 'network match', 'session match']) {
  test(`quit fade does not replace changed ${kind}`, async () => {
    const h = boot(AFTER, ['fade']);
    const pending = h.game.quitToMenu();
    cancel(h, kind);
    const before = h.snapshot(), at = h.calls.length;
    h.gates.fade.resolve(); await pending;
    assert.deepEqual(h.snapshot(), before); assert.deepEqual(h.calls.slice(at), []);
  });
}

test('new startup invalidates quit and room-return fade even before creating its match', async () => {
  for (const method of ['quitToMenu', 'netMatchEnd']) {
    const h = boot(AFTER, ['fade']);
    const pending = h.game[method]();
    const oldGate = h.gates.fade; h.gates.fade = deferred();
    const newer = h.start(false);
    const at = h.calls.length;
    oldGate.resolve(); await pending;
    assert.deepEqual(h.calls.slice(at), []);
    if (method === 'netMatchEnd') assert.equal(h.game._netEnding, false);
    h.gates.fade.resolve(); await newer;
    assert.equal(h.G.mode, 'match');
  }
});

test('ordinary room return preserves results-overlay behavior and rejected fade releases re-entrancy lock', async () => {
  const before = boot(BEFORE), after = boot(AFTER);
  await before.game.netMatchEnd(); await after.game.netMatchEnd();
  assert.deepEqual(after.calls, before.calls);
  assert.equal(after.game._netEnding, false); assert.equal(after.game.menus.current, 'lobby');
  const h = boot(AFTER, ['fade']), pending = h.game.netMatchEnd();
  const flow = h.game._matchFlow;
  await h.game.netMatchEnd(); assert.equal(h.game._matchFlow, flow, 'reentrant return cannot replace operation owner');
  h.gates.fade.reject(new Error('return fade failed'));
  await assert.rejects(pending, /return fade failed/); assert.equal(h.game._netEnding, false);
});

test('negative proof: raw old world completion overwrites a newer world and leaks its lightmap', async () => {
  const h = boot(RAW, ['world']);
  const old = h.game._buildWorld(h.maps[1]);
  const oldGate = h.gates.world;
  h.gates.world = deferred();
  const newer = h.game._buildWorld(h.maps[2]);
  const newTex = { disposed: 0, dispose() { this.disposed++; } };
  h.gates.world.resolve(newTex); await newer;
  const newPaint = h.G.paint;
  const oldTex = { disposed: 0, dispose() { this.disposed++; } };
  oldGate.resolve(oldTex); await old;
  assert.notEqual(h.G.paint, newPaint);
  assert.equal(h.game.stageLightmap, oldTex);
  assert.equal(newTex.disposed, 0, 'newer lightmap was overwritten without cleanup');
});

test('world replacement commits latest only; old staged cleanup cannot dispose newer resources', async () => {
  const h = boot(AFTER, ['world']);
  const originalPaint = h.G.paint;
  const old = h.game._buildWorld(h.maps[1]);
  assert.equal(h.game.layoutId, 'old'); assert.equal(h.G.level.id, 'old'); assert.equal(originalPaint.disposed, 0);
  const oldProps = h.resources.find(r => r instanceof h.game.PropKit);
  assert.equal(oldProps.scene, null); assert.equal(h.G.scene.children.has(oldProps.group), false);
  const oldGate = h.gates.world; h.gates.world = deferred();
  const newer = h.game._buildWorld(h.maps[2]);
  const newTex = { disposed: 0, dispose() { this.disposed++; } };
  h.gates.world.resolve(newTex); await newer;
  const snapshot = h.snapshot(), newProps = h.game.props;
  assert.equal(h.game.layoutId, 'b'); assert.equal(h.G.paint.kind, 'paint:b');
  assert.equal(newProps.scene, h.G.scene); assert.equal(h.G.scene.children.has(newProps.group), true);
  const oldTex = { disposed: 0, dispose() { this.disposed++; } };
  oldGate.resolve(oldTex); await old;
  assert.deepEqual(h.snapshot(), snapshot);
  assert.equal(h.game.stageLightmap, newTex); assert.equal(newTex.disposed, 0);
  assert.equal(oldTex.disposed, 1); assert.equal(oldProps.disposed, 1); assert.equal(newProps.disposed, 0);
});

test('cancelled world keeps old world intact and cleans rejected detached props', async () => {
  const h = boot(AFTER, ['world']);
  const before = h.snapshot(), paint = h.G.paint;
  const pending = h.game._buildWorld(h.maps[1]);
  h.gates.world.reject(new Error('lightmap failure'));
  await assert.rejects(pending, /lightmap failure/);
  assert.deepEqual(h.snapshot(), before); assert.equal(paint.disposed, 0);
  assert.equal(h.resources.find(r => r instanceof h.game.PropKit).disposed, 1);
});

test('boot world builds without an operation; newer start invalidates its pending world', async () => {
  const normal = boot(AFTER); await normal.game._buildWorld(normal.maps[1]);
  assert.equal(normal.G.level.id, 'a');
  const h = boot(AFTER, ['world']);
  const pending = h.game._buildWorld(h.maps[1]);
  h.game._beginMatchFlow();
  const tex = { disposed: 0, dispose() { this.disposed++; } };
  h.gates.world.resolve(tex); await pending;
  assert.equal(h.G.level.id, 'old'); assert.equal(tex.disposed, 1);
});

test('direct attract transition invalidates startup and world continuations', async () => {
  const h = boot(AFTER, ['world']);
  const pending = h.start(false); await h.reached.world.promise;
  h.game._startAttract(); const snapshot = h.snapshot();
  const tex = { disposed: 0, dispose() { this.disposed++; } };
  h.gates.world.resolve(tex); await pending;
  assert.deepEqual(h.snapshot(), snapshot); assert.equal(tex.disposed, 1);
});

test('returning to the already-current layout cancels an older pending replacement', async () => {
  const h = boot(AFTER, ['world']);
  const pending = h.game._buildWorld(h.maps[1]);
  await h.game._buildWorld(h.maps[0]);
  const tex = { disposed: 0, dispose() { this.disposed++; } };
  h.gates.world.resolve(tex); await pending;
  assert.equal(h.G.level.id, 'old'); assert.equal(tex.disposed, 1);
});

test('an already-cancelled flow cannot reserve or cancel a newer world build', async () => {
  const h = boot(AFTER, ['world']);
  const oldFlow = h.game._beginMatchFlow(); h.game._beginMatchFlow();
  const newer = h.game._buildWorld(h.maps[2]);
  const owner = h.game._worldBuild;
  await h.game._buildWorld(h.maps[1], oldFlow);
  assert.equal(h.game._worldBuild, owner);
  h.gates.world.resolve(null); await newer;
  assert.equal(h.game.layoutId, 'b');
});

test('actual upstream PropKit supports null scene and disposes detached geometry/material/texture ownership', async () => {
  const THREE = await import('../../../inkwave-public/vendor/three/build/three.module.js');
  const props = fs.readFileSync(new URL('../../../inkwave-public/src/world/props.js', import.meta.url), 'utf8');
  const builder = section(props, 'class Builder {', '\n// ------------------------------------------------------------------------------------------------ neon path helpers');
  const klass = section(props, 'export class PropKit {', '\nexport const PROP_TYPES').replace('export ', '');
  const PropKit = vm.runInNewContext(`${builder}\n${klass}\nPropKit`, { THREE, Math });
  const kit = new PropKit(null, { quality: 'high', headless: true });
  assert.equal(kit.scene, null); assert.equal(kit.group.parent, null);
  assert.equal(kit.build(), kit);
  const disposed = { geometry: 0, template: 0, material: 0, texture: 0 };
  const geometry = new THREE.BoxGeometry(), template = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial(), texture = new THREE.Texture();
  for (const [name, item] of [['geometry', geometry], ['template', template], ['material', material], ['texture', texture]]) item.addEventListener('dispose', () => disposed[name]++);
  const mesh = new THREE.Mesh(geometry, material);
  kit.group.add(mesh); kit._meshes.push(mesh); kit.mat = { paint: material }; kit._tpl.fixture = template; kit.atlas = texture;
  kit.dispose();
  assert.deepEqual(disposed, { geometry: 1, template: 1, material: 1, texture: 1 });
  assert.equal(kit.group.children.length, 0); assert.equal(kit._disposed, true);
  const attached = new PropKit(null, { headless: true }), scene = new THREE.Scene();
  attached.scene = scene; scene.add(attached.group);
  assert.equal(attached.group.parent, scene);
  attached.dispose(); assert.equal(attached.group.parent, null);
});

test('actual delayed boss warming skips disposed/superseded match and preserves active compilation', async () => {
  for (const stale of [false, true]) {
    const h = boot(AFTER), ready = deferred();
    delete h.game._warmCharacters;
    h.game.match = { actors: [], boss: { model: { ready: ready.promise }, warm: () => { h.calls.push(['bossWarm']); return [{}]; } } };
    const flow = h.game._beginMatchFlow();
    const pending = h.game._warmCharacters(h.game.match, flow);
    if (stale) h.game._beginMatchFlow();
    ready.resolve(); await pending;
    assert.equal(h.count('bossWarm'), Number(!stale)); assert.equal(h.count('compile'), Number(!stale));
  }
});

function resultFixture(source, boss, online = false, existingFlow = true) {
  const h = boot(source, ['fade']), judge = deferred(), timers = [];
  const config = fs.readFileSync(new URL('../../../inkwave-public/src/config.js', import.meta.url), 'utf8');
  const progressionAt = config.indexOf('export const PROGRESSION = {'), progressionEnd = config.indexOf('\n};', progressionAt);
  assert.ok(progressionAt >= 0 && progressionEnd > progressionAt);
  vm.runInContext(config.slice(progressionAt, progressionEnd + 3).replace('export ', '') + '\nglobalThis.PROGRESSION = PROGRESSION;', h.context);
  h.context.TEAM_NAMES = ['A', 'B'];
  h.context.turfExperience = turfExperience;
  h.context.saveJSON = (key, profile) => h.calls.push(['saveProfile', key, { ...profile }]);
  h.context.setTimeout = (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; };
  h.G.teamHex = ['#f80', '#05f']; h.G.teamColors = ['orange', 'blue'];
  h.G.audio.play = sound => h.calls.push(['resultSound', sound]);
  if (online) { h.G.netm = h.nm; h.nm.sendEnd = () => h.calls.push(['sendEnd']); }
  else { h.G.net = null; h.G.netm = null; }
  const actor = { team: 0, name: 'A', weaponId: 'shooter', stats: { turf: 10.4, splats: 1, deaths: 0, bossDmg: 125 }, character: { style: {} }, isLocal: true, slot: 0 };
  const match = h.game.match;
  Object.assign(match, {
    state: 'judge', local: actor, actors: [actor],
    result: { mode: boss ? 'boss' : 'turf', coverage: [.6, .4], winner: 0, boss: { win: true, name: 'Boss', hp: 0, maxHp: 500, time: 60, phase: 2 } },
    setState(state) { this.state = state; h.calls.push(['resultState', state]); },
  });
  h.game.profile = { name: 'Player', weapon: 'shooter', level: 1, xp: 1100, matches: 3, wins: 2, totalTurf: 45 };
  const initialProfile = { ...h.game.profile };
  h.game.palette = { names: ['A', 'B'] };
  h.game.rig.overview = () => h.calls.push(['overview']);
  h.game.hud.judge = () => judge.promise;
  h.game.showcase.showResults = (...args) => h.calls.push(['podium', ...args]);
  h.game.menus.showResults = data => h.calls.push(['resultData', data]);
  if (existingFlow) h.game._beginMatchFlow();
  return {
    ...h, judge, timers, initialProfile,
    async resolveResults(pending) {
      if (boss) timers.find(t => t.ms === 400).fn(); else judge.resolve();
      await pending;
    },
    fire(ms) { const timer = timers.find(t => t.ms === ms); assert.ok(timer, `result timer ${ms}`); timer.fn(); },
  };
}

function beginDeparture(h, operation) {
  if (operation === 'quit') return h.game.quitToMenu();
  if (operation === 'room return') return h.game.netMatchEnd();
  return h.start(operation === 'online start');
}

for (const boss of [false, true]) {
  for (const operation of ['quit', 'offline start', 'online start', 'room return']) {
    const online = operation === 'online start' || operation === 'room return';
    test(`negative composition proof: old ${boss ? 'boss' : 'turf'} results escape during actual ${operation} fade`, async () => {
      const h = resultFixture(RESULT_FLOW_BEFORE, boss, online);
      const originalMatch = h.game.match, pending = h.game._judge();
      const departure = beginDeparture(h, operation);
      assert.equal(h.game.match, originalMatch, 'fade has not replaced match');
      await h.resolveResults(pending);
      assert.equal(h.count('saveProfile'), Number(boss || !online)); assert.equal(h.count('resultData'), 1);
      assert.equal(h.game.menus.current, 'results');
      h.gates.fade.resolve(); await departure;
    });
    test(`${boss ? 'boss' : 'turf'} result continuation stops during actual ${operation} fade before match replacement`, async () => {
      const h = resultFixture(AFTER, boss, online);
      const originalMatch = h.game.match, pending = h.game._judge();
      const departure = beginDeparture(h, operation), at = h.calls.length;
      assert.equal(h.game.match, originalMatch);
      await h.resolveResults(pending);
      assert.deepEqual(h.game.profile, h.initialProfile);
      assert.deepEqual(h.calls.slice(at), [], 'no XP/UI/state/sound continuation');
      assert.equal(h.timers.some(t => t.ms === 2600 || t.ms === 12000), false);
      assert.equal(h.game.menus.current, null);
      h.gates.fade.resolve(); await departure;
      if (operation === 'room return') assert.equal(h.game._netEnding, false);
      assert.equal(h.G.mode, operation.includes('start') ? 'match' : 'menu');
    });
  }
  for (const existingFlow of [false, true]) {
    test(`normal ${boss ? 'boss' : 'turf'} results preserve scoring/delivery with ${existingFlow ? 'existing' : 'absent'} operation generation`, async () => {
      const before = resultFixture(RESULT_FLOW_BEFORE, boss, true, existingFlow), after = resultFixture(AFTER, boss, true, existingFlow);
      await before.resolveResults(before.game._judge()); await after.resolveResults(after.game._judge());
      assert.deepEqual(after.game.profile, before.game.profile);
      assert.deepEqual(JSON.parse(JSON.stringify(after.calls)), JSON.parse(JSON.stringify(before.calls)));
      assert.equal(after.count('saveProfile'), Number(boss)); assert.equal(after.count('resultData'), 1);
      let returning;
      const actualReturn = after.game.netMatchEnd;
      after.game.netMatchEnd = function () { return (returning = actualReturn.call(this)); };
      after.fire(12000); assert.equal(after.count('sendEnd'), 1);
      assert.equal(after.game._netEnding, true, 'legitimate room-end owns its new return flow');
      after.gates.fade.resolve();
      await returning;
      assert.equal(after.game._netEnding, false); assert.equal(after.game.menus.current, 'lobby');
    });
  }
  for (const operation of ['quit', 'offline start', 'online start', 'room return']) {
    test(`${boss ? 'boss' : 'turf'} delayed callbacks stop during actual ${operation} fade`, async () => {
      const h = resultFixture(AFTER, boss, true);
      await h.resolveResults(h.game._judge());
      const match = h.game.match, departure = beginDeparture(h, operation), at = h.calls.length;
      assert.equal(h.game.match, match); assert.equal(match.state, 'results');
      h.fire(12000); if (!boss) h.fire(2600);
      assert.deepEqual(h.calls.slice(at), [], 'old timers do not sendEnd/play music/begin another return');
      h.gates.fade.resolve(); await departure;
    });
  }
}

test('normal same-generation turf results still play their music', async () => {
  const h = resultFixture(AFTER, false);
  await h.resolveResults(h.game._judge()); h.fire(2600);
  assert.deepEqual(h.calls.find(c => c[0] === 'music'), ['music', 'results_win']);
});

for (const phase of ['fetch', 'metadata', 'PNG']) {
  test(`actual lightmap loader finishing ${phase} after world replacement disposes only old texture`, async () => {
    const h = boot(AFTER), gate = deferred(), reached = deferred();
    const tex = { disposed: 0, dispose() { this.disposed++; } };
    const metadata = { ppm: 5, size: 64, hash: 'good' };
    const response = { json: () => { if (phase === 'metadata') { reached.resolve(); return gate.promise; } return Promise.resolve(metadata); } };
    delete h.game._loadLightmap;
    h.context.fetch = () => { if (phase === 'fetch') { reached.resolve(); return gate.promise; } return Promise.resolve(response); };
    h.context.THREE.TextureLoader = class { loadAsync() { if (phase === 'PNG') { reached.resolve(); return gate.promise; } return Promise.resolve(tex); } };
    const pending = h.game._buildWorld(h.maps[1]); await reached.promise;
    const newerTex = { disposed: 0, dispose() { this.disposed++; } };
    h.game._loadLightmap = async () => newerTex;
    await h.game._buildWorld(h.maps[2]);
    gate.resolve(phase === 'fetch' ? response : phase === 'metadata' ? metadata : tex); await pending;
    assert.equal(tex.disposed, 1); assert.equal(newerTex.disposed, 0);
    assert.equal(h.game.stageLightmap, newerTex); assert.equal(h.G.level.id, 'b');
  });
}

test('start adapter is fail-closed, requires results predecessor and leaves unrelated modules unchanged', () => {
  assert.equal(adaptStart('src/net/session.js', BEFORE), BEFORE);
  assert.throws(() => adaptStart('src/main.js', ''), /start conflict/);
  assert.throws(() => adaptStart('src/main.js', RAW), /start conflict/);
  assert.throws(() => adaptStart('src/main.js', AFTER), /start conflict/);
  for (const anchor of ['  async startMatch(o = {}) {', '  async startNetMatch(cfg, nm) {', '  async _buildWorld(map) {', '  async quitToMenu() {', '  async _warmCharacters(m) {', '  _startAttract() {', '  async netMatchEnd() {', '  async _bossResults() {', '  async _judge() {']) {
    assert.throws(() => adaptStart('src/main.js', BEFORE.replace(anchor, 'changed upstream')), /start conflict/);
    assert.throws(() => adaptStart('src/main.js', BEFORE + '\n' + anchor), /start conflict/);
  }
  const closure = '    const resultsCurrent = () => this.match === m && G.netm === netm && G.net === net && net?.tr === room;';
  for (const [start, end] of [['  async _bossResults() {', '\n  async _judge() {'], ['  async _judge() {', '\n  _fade(to, ms)']]) {
    const original = section(BEFORE, start, end);
    assert.throws(() => adaptStart('src/main.js', BEFORE.replace(original, original.replace(closure, 'changed result owners'))), /start conflict/);
    assert.throws(() => adaptStart('src/main.js', BEFORE.replace(original, original.replace(closure, closure + '\n' + closure))), /start conflict/);
  }
});
