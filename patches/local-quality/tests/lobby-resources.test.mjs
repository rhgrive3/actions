import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptLobbyResources } from '../lobby-resource-adapter.mjs';

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
  // The boot-only adapter preserves Showcase; the combined dispatcher also
  // applies the lobby quality policy. Its native demand-load entry methods must remain exact.
  assert.equal(adaptLobbyResources('src/game/showcase.js', source), source);
  const composed = adaptQualitySource('src/game/showcase.js', source);
  const methods = section(composed, '  showHub(style, color, weapon) {', '\n  updateLobby(players, colors) {');
  assert.equal(methods, section(source, '  showHub(style, color, weapon) {', '\n  updateLobby(players, colors) {'));
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

test('lobby adapter fails closed on drift or double application and leaves gameplay modules intact', () => {
  assert.throws(() => adaptLobbyResources('src/main.js', built), /patch conflict/);
  assert.throws(() => adaptLobbyResources('src/main.js', raw.replace('}, 2500);', '}, 3000);')), /patch conflict/);
  for (const rel of ['src/game/actor.js', 'src/game/weapons.js', 'src/net/netmatch.js', 'src/game/match.js']) {
    const source = read(rel); assert.equal(adaptLobbyResources(rel, source), source);
  }
});
