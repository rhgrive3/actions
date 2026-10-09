import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptLobbyResources, LOBBY_LOW_ATLAS_SCALE } from '../lobby-resource-adapter.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const raw = read('src/main.js');
const built = adaptQualitySource('src/main.js', adaptReliability('src/main.js', adaptTouchLayout('src/main.js', adaptSource('src/main.js', raw))));
function section(code, from, to) {
  const at = code.indexOf(from), end = code.indexOf(to, at);
  assert.ok(at >= 0 && end > at, `native source span ${from}`);
  return code.slice(at, end);
}
// Run the complete native boot tail with only external clocks/renderer mocked.
function bootTail(code, autostart = false) {
  const timers = [], calls = { preload: 0, audio: 0, loop: 0, start: 0 };
  const params = new URLSearchParams(autostart ? 'autostart=180' : '');
  const G = { mode: 'loading' }, game = {
    showcase: { preloadLobby() { calls.preload++; } },
    menus: { show() {} }, _applyAudioVolumes() { calls.audio++; },
    _loop() { calls.loop++; }, api: { startMatch() { calls.start++; G.mode = 'match'; } },
    settings: { difficulty: 'normal' },
  };
  const fn = vm.runInNewContext(`(function() {${section(code, '    this.timer = new THREE.Timer();', '    this.bootMs =')}})`, {
    THREE: { Timer: class { connect() {} } }, document: {}, G, params, map: { id: 'tidewater' },
    setTimeout(fn, ms) { timers.push({ fn, ms }); }, requestAnimationFrame(fn) { fn(); },
  });
  fn.call(game);
  return { G, calls, timers, advance() { for (const timer of timers) timer.fn(); } };
}

test('native menu idle no longer creates unused Online resources; baseline reproduces it', () => {
  const before = bootTail(raw); before.advance();
  assert.equal(before.calls.preload, 1);
  const after = bootTail(built); after.advance();
  assert.equal(after.calls.preload, 0);
  assert.equal(after.timers.length, 0);
  assert.equal(after.calls.audio, 1); assert.equal(after.calls.loop, 1);
  after.G.mode = 'match'; after.advance();
  assert.equal(after.calls.preload, 0);
});

test('autostart retains native match start and does not request Online resources', () => {
  const after = bootTail(built, true); after.advance();
  assert.equal(after.calls.start, 1); assert.equal(after.G.mode, 'match');
  assert.equal(after.calls.preload, 0); assert.equal(after.calls.audio, 1);
});

test('native Online hub and room entry remain demand-loaded and reuse the current set', () => {
  const source = read('src/game/showcase.js');
  const composed = adaptQualitySource('src/game/showcase.js', source);
  assert.match(composed, /installPortraitBudget\(Showcase, G\)/);
  assert.equal(adaptLobbyResources('src/game/showcase.js', composed), composed);
  // The class defines a legacy pedestal showHub earlier; the final Online
  // implementation is the one JavaScript actually installs on its prototype.
  const active = text => text.slice(text.lastIndexOf('  showHub(style, color, weapon) {'));
  const methods = section(active(composed), '  showHub(style, color, weapon) {', '\n  updateLobby(players, colors) {');
  assert.equal(methods, section(active(source), '  showHub(style, color, weapon) {', '\n  updateLobby(players, colors) {'));
  const Cls = vm.runInNewContext(`class Showcase { ${methods} }; Showcase`, {
    THREE: {}, G: { game: { profile: { weapon: 'shooter' } } }, HUB_ID: 'hub', styleKey: () => 'style',
  });
  const s = Object.create(Cls.prototype); let created = 0;
  Object.assign(s, { ui: {}, mode: 'menu', _lobEnsure() {
    if (!this.lob) { created++; this.lob = { room: false, colors: [{ copy() {} }, {}], members: new Map() }; }
    return this.lob;
  }, _enterSetMode(mode) { this.mode = mode; }, _lobShot() {}, _lobColors() {},
  _lobNew() { return {}; }, _lobArrive() {}, updateLobby() {} });
  assert.equal(created, 0);
  s.showHub({}, { isColor: true }, 'shooter'); assert.equal(created, 1);
  s.showLobby([], [], {}); assert.equal(created, 1); assert.equal(s.lob.room, true);
});

test('LOW/mobile LobbySet caps atlas backing pixels while HIGH keeps native dimensions', () => {
  const rawSet = read('src/game/lobbySet.js');
  const rawTex = read('src/game/lobbySet-tex.js');
  assert.match(rawSet, /decal: createDecalAtlas\(\), lit: createLitAtlas\(\), sky: createSkyline\(\)/);
  assert.match(rawTex, /canvas\(DA, DA\)/);
  assert.match(rawTex, /canvas\(LA\[0\], LA\[1\]\)/);
  assert.match(rawTex, /const W = 2048, H = 1024, c = canvas\(W, H\)/);
  assert.match(rawTex, /const W = 1024, H = 2048, c = canvas\(W, H\)/);

  const set = adaptQualitySource('src/game/lobbySet.js', rawSet);
  const tex = adaptQualitySource('src/game/lobbySet-tex.js', rawTex);
  const showcase = adaptQualitySource('src/game/showcase.js', read('src/game/showcase.js'));
  assert.match(showcase, /resolveLobbyQualityName\(G\.settings\?\.quality, G\.mobile \?\? G\.game\?\.mobile\)/);
  assert.match(set, new RegExp(`this\\.quality === 'low' \\? ${LOBBY_LOW_ATLAS_SCALE} : 1`));
  assert.match(set, /decal: createDecalAtlas\(atlasScale\), lit: createLitAtlas\(atlasScale\), sky: createSkyline\(atlasScale\)/);
  assert.match(set, /mask: createGroundMask\(PUDDLES, SPLATS, atlasScale\)/);
  for (const name of ['createDecalAtlas', 'createLitAtlas', 'createSkyline', 'createGroundMask']) {
    assert.match(tex, new RegExp(`export function ${name}\\([^)]*scale = 1`));
  }
  assert.equal((tex.match(/g\.scale\(scale, scale\)/g) || []).length, 4);

  const builder = (name, endMarker) => {
    const at = tex.indexOf(`export function ${name}(`);
    const end = tex.indexOf(endMarker, at);
    assert.ok(at >= 0 && end > at, `${name} source span`);
    return tex.slice(at, end).replace('export function', 'function');
  };
  const builders = [
    builder('createDecalAtlas', '\nfunction drawDecals('),
    builder('createLitAtlas', '\nfunction drawLit('),
    builder('createSkyline', '\n// ------------------------------------------------------------------------------------------------ neon glyphs'),
    builder('createGroundMask', '\n// ------------------------------------------------------------------------------------------------ lit atlas'),
  ].join('\n');
  const dimensionsAt = scale => vm.runInNewContext(`(() => {
    const DA = 2048, LA = [2048, 1024], GROUND_RECT = [-4, -14, 4, 7], PUDDLES = [], SPLATS = [];
    const THREE = { ClampToEdgeWrapping: 1, RepeatWrapping: 2 };
    const canvases = [], scales = [];
    function canvas(width, height) {
      const ctx = {
        scale(x, y) { scales.push([x, y]); }, clearRect() {}, fillRect() {},
        beginPath() {}, moveTo() {}, lineTo() {}, fill() {}, ellipse() {},
      };
      const c = { width, height, getContext() { return ctx; } };
      canvases.push(c); return c;
    }
    function tex(image) { return { image, userData: {} }; }
    function loadSetFonts() { return Promise.resolve(); }
    function drawDecals() {}
    function drawLit() {}
    function mulberry() { return () => 0.45; }
    ${builders}
    createDecalAtlas(${scale}); createLitAtlas(${scale}); createSkyline(${scale});
    createGroundMask(PUDDLES, SPLATS, ${scale});
    return { dimensions: canvases.map(c => [c.width, c.height]), scales };
  })()`);
  const lowCanvases = dimensionsAt(LOBBY_LOW_ATLAS_SCALE);
  assert.deepEqual(Array.from(lowCanvases.dimensions, d => Array.from(d)), [
    [1024, 1024], [1024, 512], [1024, 512], [512, 1024],
  ]);
  assert.deepEqual(Array.from(lowCanvases.scales, d => Array.from(d)), Array.from({ length: 4 }, () => [0.5, 0.5]));
  const fullCanvases = dimensionsAt(1);
  assert.deepEqual(Array.from(fullCanvases.dimensions, d => Array.from(d)), [
    [2048, 2048], [2048, 1024], [2048, 1024], [1024, 2048],
  ]);

  const fullPixels = 2048 * 2048 + 2048 * 1024 + 2048 * 1024 + 1024 * 2048;
  const lowPixels = lowCanvases.dimensions.reduce((sum, [w, h]) => sum + w * h, 0);
  assert.equal(fullPixels, 10_485_760);
  assert.equal(lowPixels, 2_621_440);
  assert.equal(lowPixels * 4, 10 * 1024 * 1024);
  assert.ok(Math.ceil(lowPixels * 4 * (4 / 3)) < 14 * 1024 * 1024);
  assert.throws(() => adaptLobbyResources('src/game/lobbySet.js', set), /patch conflict/);
  assert.throws(() => adaptLobbyResources('src/game/lobbySet-tex.js', tex), /patch conflict/);
});

test('native Online atlas disposal remains on the ordinary release path at 30/60/120 Hz', () => {
  const showcase = adaptQualitySource('src/game/showcase.js', read('src/game/showcase.js'));
  const lobbySet = adaptQualitySource('src/game/lobbySet.js', read('src/game/lobbySet.js'));
  const updateBody = section(showcase, '  _updateSet(dt) {', '\n  _lobContact(');
  const releaseBody = section(showcase, '  _lobRelease() {', '\n  _enterSetMode(');
  const setDisposeBody = section(lobbySet, '  dispose() {', '\n}\n\n// ------------------------------------------------------------------------------------------------ data');
  const SET = vm.runInNewContext(`class LobbySet { ${setDisposeBody} }; LobbySet`);
  const Showcase = vm.runInNewContext(`class Showcase { ${updateBody} ${releaseBody} }; Showcase`, {
    SET_MODES: new Set(['hub', 'lobby']), SET_FADE: 0.45,
    G: { menus: { _stack: [], current: 'main' }, net: { state: 'offline' }, settings: { quality: 'low' } },
  });
  const disposeSet = () => {
    const counts = { texture: 0, mesh: 0, material: 0, shadow: 0, target: 0 };
    const d = key => ({ dispose() { counts[key]++; } });
    const node = { geometry: d('mesh'), material: d('material') };
    const set = Object.create(SET.prototype);
    Object.assign(set, {
      root: { traverse(fn) { fn(node); }, removeFromParent() {} },
      lights: { key: { shadow: d('shadow') }, spill: { map: d('target') } },
      tex: { decal: d('texture'), lit: d('texture'), sky: d('texture'), mask: d('texture') },
      halos: [{ material: { uniforms: { map: { value: d('texture') } } } }],
      _rRT: d('target'), _envRT: d('target'), _envOld: d('target'), _pmrem: d('target'),
      _envScene: { traverse(fn) { fn(node); } },
    });
    return { set, counts };
  };
  const resource = (counts, key) => ({
    dispose() { counts[key]++; },
    geometry: { dispose() { counts[key]++; } },
    material: { dispose() { counts[key]++; } },
  });

  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    const inst = Object.create(Showcase.prototype);
    inst.mode = 'menu';
    for (let cycle = 0; cycle < 2; cycle++) {
      const disposed = disposeSet();
      const fxCounts = { member: 0, fx: 0, ink: 0, spark: 0, trail: 0, contact: 0 };
      const fx = () => ({ mesh: resource(fxCounts, 'fx'), splats: resource(fxCounts, 'fx'), rings: resource(fxCounts, 'fx') });
      const L = {
        room: false, preload: false, k: 0, gone: 0, ready: false,
        members: new Map([['self', { c: { dispose() { fxCounts.member++; } } }]]),
        set: disposed.set, fx: [fx(), fx()], ink: [resource(fxCounts, 'ink'), resource(fxCounts, 'ink')],
        sparks: { mesh: resource(fxCounts, 'spark') }, trail: { dispose() { fxCounts.trail++; } },
        contact: { dispose() { fxCounts.contact++; } }, scene: { clear() {} },
      };
      inst.lob = L;
      for (let i = 0; i < Math.ceil(1.7 / dt) && inst.lob; i++) inst._updateSet(dt);
      assert.equal(inst.lob, null, `cycle ${cycle} is released at ${hz}Hz`);
      assert.deepEqual(disposed.counts, { texture: 5, mesh: 2, material: 2, shadow: 1, target: 5 });
      assert.equal(fxCounts.member, 1);
      assert.equal(fxCounts.fx, 12);
      assert.equal(fxCounts.ink, 2);
      assert.equal(fxCounts.spark, 3);
      assert.equal(fxCounts.trail, 1);
      assert.equal(fxCounts.contact, 1);
    }
  }
});

test('lobby adapter fails closed on drift or double application and leaves gameplay modules intact', () => {
  assert.throws(() => adaptLobbyResources('src/main.js', built), /patch conflict/);
  assert.throws(() => adaptLobbyResources('src/main.js', raw.replace('}, 2500);', '}, 3000);')), /patch conflict/);
  for (const rel of ['src/game/actor.js', 'src/game/weapons.js', 'src/net/netmatch.js', 'src/game/match.js']) {
    const source = read(rel); assert.equal(adaptLobbyResources(rel, source), source);
  }
});
