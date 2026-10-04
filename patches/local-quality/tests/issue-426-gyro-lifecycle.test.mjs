// Native regression for issue #426: the real deviceorientation/devicemotion
// listeners must stop when live play ends and the game actually lands in menus
// (G.mode 'match' → 'menu'), while pause/settings/results inside a live match
// keep them alive, the saved preference/permission survive untouched, and
// exactly one listener pair is restored for the next live match.
//
// Everything here executes real composed source: the Game methods (_onScreen,
// _suspendGyroForMenu, pause, resume, quitToMenu, netMatchEnd, netMatchAborted,
// _setSettings, _startGyro) are extracted from the composed src/main.js and run
// as a native class, and MobileInput/Gyro are the composed native modules with
// a listener-counting platform fixture. No mocks of APIs that do not exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptGyroLifecycle } from '../issue-426-gyro-lifecycle.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE_ROOT = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

// Build order identical to scripts/build-inkwave.mjs; the lifecycle adapter is
// applied after the quality dispatcher (the parent registers it there).
function compose(rel, { lifecycle = true } = {}) {
  const raw = fs.readFileSync(path.join(SOURCE_ROOT, rel), 'utf8');
  const code = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
  return lifecycle ? adaptGyroLifecycle(rel, code) : code;
}
function section(code, start, end) {
  const at = code.indexOf(start), until = code.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `section not found: ${start} .. ${end}`);
  return code.slice(at, until);
}
async function drain() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function settle() { await new Promise((r) => setTimeout(r, 0)); await drain(); }

async function fixture({ lifecycle = true, permission = true } = {}) {
  const asks = [], events = [], saves = [], timers = new Map(), listeners = new Map();
  let serial = 0;
  class Classes {
    constructor() { this.values = new Set(); }
    add(name) { this.values.add(name); }
    remove(name) { this.values.delete(name); }
    toggle(name, on) { on ? this.add(name) : this.remove(name); }
    contains(name) { return this.values.has(name); }
  }
  const element = () => ({ classList: new Classes(), style: { setProperty() {} }, remove() { this.removed = true; } });
  const nativeRequest = (kind) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    asks.push({ kind, resolve, reject }); events.push('request:' + kind);
    return promise;
  };
  const window = {};
  window.DeviceOrientationEvent = permission ? { requestPermission: () => nativeRequest('orientation') } : {};
  const storage = new Map();
  const G = { mode: 'match' };
  const context = vm.createContext({
    Promise, console, window, document: { documentElement: { classList: new Classes(), lang: 'en' } },
    AbortController, performance: { now: () => 1000 },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    addEventListener(type, fn) { const all = listeners.get(type) || new Set(); all.add(fn); listeners.set(type, all); events.push('listen:' + type); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); events.push('remove:' + type); },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    G, t: (value) => value, saveJSON: (_key, settings) => saves.push({ ...settings }),
  });
  const module = (code) => new vm.SourceTextModule(code, { context });
  const device = module('export const touchPrimary=false,touchCapable=false; export const screenAngle=()=>0;');
  const qualityGyro = module(fs.readFileSync(path.join(ROOT, 'patches/local-quality/gyro.mjs'), 'utf8'));
  // quality adapters inject imports of sibling patch modules (e.g. touch-relayout)
  const qualityModule = (spec) => {
    const at = spec.indexOf('patches/local-quality/');
    if (at < 0 || !spec.endsWith('.mjs')) return null;
    return module(fs.readFileSync(path.join(ROOT, spec.slice(at)), 'utf8'));
  };
  const resolve = (spec, map) => {
    const key = spec.includes('patches/') ? spec.slice(spec.indexOf('patches/')) : spec;
    const target = map[key] || qualityModule(spec);
    if (!target) throw new Error('unexpected import ' + spec);
    return target;
  };
  const gyro = module(compose('src/core/gyro.js', { lifecycle }));
  await gyro.link((spec) => resolve(spec, { './device.js': device, 'patches/local-quality/gyro.mjs': qualityGyro }));
  await gyro.evaluate();
  const i18n = module('export const t=value=>value;');
  const icons = module("export const WEAPON_ICONS={},SUB_ICONS={},SQUID='',specialIcon=()=>'';");
  const mobile = module(compose('src/core/mobile.js', { lifecycle }));
  await mobile.link((spec) => resolve(spec, {
    './gyro.js': gyro, './device.js': device, '../i18n.js': i18n, '../ui/ui-icons.js': icons,
  }));
  await mobile.evaluate();
  const mob = new mobile.namespace.MobileInput({}, {});
  mob.toastEl = element(); mob.els = { gyro: element() };


  const main = compose('src/main.js', { lifecycle });
  const settings = section(main, '  _setSettings(partial) {', '  _applyAudioVolumes()');
  const guard = main.includes('  _suspendGyroForMenu() {') ? section(main, '  _suspendGyroForMenu() {', '  _onScreen(s) {') : '';
  const onScreen = section(main, '  _onScreen(s) {', '  _playMusic(t) {');
  const flow = section(main, '  _beginMatchFlow() {', '  // Boss Battle intro');
  const starts = section(main, '  _prepareGyro() {', '\n}\n\ninstallGame(Game);');
  const Game = vm.runInContext('(class {' + settings + guard + onScreen + flow + starts + '})', context);

  const counts = () => ({
    orientation: listeners.get('deviceorientation')?.size || 0,
    motion: listeners.get('devicemotion')?.size || 0,
  });
  const count = () => counts().orientation + counts().motion;
  const shown = [];
  const game = new Game();
  game.menus = {
    current: null,
    // menus.show(name) → api.onScreenChange(name) → composed Game._onScreen(name)
    show(name) {
      this.current = name;
      const before = count();
      game._onScreen(name);
      shown.push({ name, mode: G.mode, before, after: count() });
    },
    hasScreen: () => true,
    refreshSetting(key) { events.push('refresh:' + key); },
    toast() {},
  };
  Object.assign(game, {
    settings: { gyro: true },
    input: { mobile: mob, exitLock() {}, requestLock() {} },
    match: { state: 'playing', paused: false, attract: false, controller: null },
    hud: { setVisible() {}, hideSplatted() {} },
    showcase: { mode: '', hide() {}, showLoadout() {} },
    profile: { weapon: 'shooter', style: {} },
    _fade: async () => {},
    _setPalette() {},
    _pickPalette: () => 'normal',
    _startAttract() {},
    _playMusic() {},
    _musicTrack: null,
    lastMatchOpts: null,
    _netEndT: null,
  });
  return { mob, game, G, asks, events, saves, timers, listeners, shown, main, counts, count };
}


test('adapter composes the used native hooks exactly once and fails closed on reapply', () => {
  const main = compose('src/main.js');
  assert.match(main, /this\.input\?\.mobile\?\.suspendGyro\?\.\(\)/);
  assert.match(main, /if \(G\.mode !== 'match'\) this\._suspendGyroForMenu\(\); else if \(!playTouch\) mob\.gyro\?\.discard\?\.\(\);/);
  assert.match(main, /mob\.setGyro\(true, \(\) => G\.mode === 'match'\)/);
  assert.equal((main.match(/_suspendGyroForMenu/g) || []).length, 2, 'defined once and called once: no unused helper');
  assert.equal((main.match(/suspendForMenu/g) || []).length, 0, 'Game never reaches past Mobile');
  const mobile = compose('src/core/mobile.js');
  assert.match(mobile, /suspendGyro\(\) \{\n\s*\+\+this\._gyroIntent;/);
  assert.match(compose('src/core/gyro.js'), /suspendForMenu\(\)/);
  for (const rel of ['src/main.js', 'src/core/mobile.js', 'src/core/gyro.js']) {
    assert.throws(() => adaptGyroLifecycle(rel, compose(rel)), /anchor mismatch/);
  }
});

test('negative control: baseline native main-menu exit leaves the 1+1 listeners attached', async () => {
  const f = await fixture({ lifecycle: false });
  assert.doesNotMatch(f.main, /suspendForMenu|_suspendGyroForMenu/);
  await grantAndStart(f);
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
  await f.game.quitToMenu();
  assert.equal(f.G.mode, 'menu');
  assert.equal(f.shown.at(-1).name, 'main');
  assert.equal(f.shown.at(-1).after, 2, 'BUG REPRODUCED: listeners stay live in the menu');
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
});

test('composed quitToMenu detaches at the final menu transition and restores one pair per match', async () => {
  const f = await fixture();
  await grantAndStart(f);
  await f.game.quitToMenu();
  assert.equal(f.G.mode, 'menu');
  // the first menus.show(null) still has G.mode === 'match' (async fade pending)
  assert.deepEqual(f.shown[0], { name: null, mode: 'match', before: 2, after: 2 });
  const last = f.shown.at(-1);
  assert.deepEqual({ name: last.name, mode: last.mode, after: last.after }, { name: 'main', mode: 'menu', after: 0 });
  assert.equal(last.before, 2, 'sensors were live until the final mode/menu transition');
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  // preference and permission preserved: never setGyro(false)
  assert.equal(f.game.settings.gyro, true);
  assert.equal(f.mob._gyroWanted, true);
  assert.equal(f.mob.s.gyro, true);
  assert.equal(f.mob.gyro.granted, true);
  assert.equal(f.mob.gyro.enabled, false);
  // repeated cycles always restore exactly one pair and stop again
  for (let i = 0; i < 2; i++) {
    f.G.mode = 'match';
    f.game._startGyro(); await drain();
    assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
    await f.game.quitToMenu();
    assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  }
});

test('composed netMatchEnd and netMatchAborted detach through the same _onScreen path', async () => {
  const f = await fixture();
  await grantAndStart(f);
  await f.game.netMatchEnd();
  assert.equal(f.G.mode, 'menu');
  assert.equal(f.shown.at(-1).name, 'lobby');
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  f.G.mode = 'match';
  f.game._startGyro(); await drain();
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
  f.game.netMatchAborted('connection lost');
  await settle();
  assert.equal(f.G.mode, 'menu');
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
});

test('composed pause keeps sensors alive and resume needs no restart (no stacked pair)', async () => {
  const f = await fixture();
  await grantAndStart(f);
  f.game.pause();
  assert.equal(f.game.match.paused, true);
  assert.equal(f.G.mode, 'match');
  assert.equal(f.shown.at(-1).name, 'pause');
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 }, 'pause inside a live match must not stop the sensors');
  f.game.resume();
  assert.equal(f.game.match.paused, false);
  assert.equal(f.shown.at(-1).name, null);
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 }, 'resume must not need a restart nor stack listeners');
});

test('pending permission completion after menu exit never reattaches; next match restores one pair', async () => {
  const f = await fixture();
  f.game.settings.gyro = true;
  const pending = f.mob.setGyro(true);   // real Mobile.setGyro with the real request still pending
  assert.equal(f.asks.length, 1);
  assert.equal(f.count(), 0);
  await f.game.quitToMenu();             // menu exit while the grant is still in flight
  f.asks[0].resolve('granted');
  assert.equal(await pending, false);
  await drain();
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 }, 'late grant must not reattach listeners in menus');
  assert.equal(f.mob.gyro.enabled, false);
  assert.equal(f.mob.gyro.granted, true, 'permission state preserved');
  assert.equal(f.mob._gyroWanted, true, 'saved intent preserved (no setGyro(false))');
  assert.equal(f.game.settings.gyro, true, 'saved preference preserved');
  f.G.mode = 'match';
  f.game._startGyro(); await drain();
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
  assert.equal(f.mob.s.gyro, true);
  await f.game.quitToMenu();
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  f.G.mode = 'match';
  f.game._startGyro(); await drain();
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
});

test('menu settings toggles and a disabled gyro preference never start listeners', async () => {
  const f = await fixture();
  f.game._prepareGyro(); f.asks[0].resolve('granted'); await drain();
  f.game.settings.gyro = false;
  await f.game.quitToMenu();
  assert.equal(f.G.mode, 'menu');
  f.game._setSettings({ gyro: true }); await drain();
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 }, 'menu settings ON must not listen');
  f.game._setSettings({ gyro: false }); await drain();
  assert.equal(f.mob.gyro.enabled, false);
  assert.equal(f.mob.s.gyro, false);
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  // gyro preference off: match start and menu exit stay at zero, never negative
  f.G.mode = 'match';
  f.game._startGyro(); await drain();
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  await f.game.quitToMenu();
  assert.deepEqual(f.counts(), { orientation: 0, motion: 0 });
  assert.equal(f.game.settings.gyro, false);
  assert.equal(f.mob.gyro.granted, true, 'permission survives a disabled preference');
});

/** Permission granted from the native request, then the native _startGyro restart. */
async function grantAndStart(f) {
  f.game._prepareGyro();
  assert.equal(f.asks.length, 1);
  f.asks[0].resolve('granted');
  await drain();
  assert.equal(f.mob.gyro.granted, true);
  f.game.settings.gyro = true;
  f.game._startGyro();
  await drain();
  assert.deepEqual(f.counts(), { orientation: 1, motion: 1 });
}
