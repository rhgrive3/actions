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
import {
  AIM_PROFILE_KEYS,
  AIM_PROFILES,
  DEFAULT_AIM_PROFILES,
  createDefaultAimProfiles,
  sanitizeAimProfile,
  migrateAimProfiles,
  syncActiveAimValues,
  applyAimSettingsChange,
} from '../aim-profile.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');
const read = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');

const compose = (rel, code = read(rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

// Exact PR 494 adapter function for proving dual raw vs PR494 composition
function adaptGyroInvertPR494(rel, code) {
  if (rel === 'src/ui/menus.js') {
    code = code.replace(
      "  { key: 'gyroInvertY', label: 'Gyro vertical', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Normal: tilt the top toward you to look up (like a window). Invert flips it.' },\n",
      '');
    return code.replace(
      "  { key: 'gyroInvertX', label: 'Gyro horizontal', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Normal: turn the device left to look left.' },\n",
      '');
  }
  if (rel === 'src/core/mobile.js') {
    return code.replace(
      '    this.gyro.configure({ sens: s.gyroSens, invX: s.gyroInvertX, invY: s.gyroInvertY });',
      '    this.gyro.configure({ sens: s.gyroSens });');
  }
  return code;
}

function nativeMethod(rel, start, next) {
  const source = compose(rel);
  const at = source.indexOf(start), end = source.indexOf(next, at);
  assert.ok(at >= 0 && end > at, `native method span ${rel}: ${start}`);
  return source.slice(at, end);
}

function settingsLoader(context, defaults) {
  const main = compose('src/main.js');
  const load = main.match(/^function loadJSON.*$/m)?.[0];
  const statement = main.match(/this\.settings = G\.settings = migrateAimProfiles\([^\n]+/)?.[0];
  assert.ok(load && statement, 'actual native boot load and migration must be present');
  return vm.runInNewContext(`${load}\nfunction bootSettings() { ${statement} return this.settings; }; bootSettings`, {
    localStorage: context.localStorage, G: context.G, DEFAULT_SETTINGS: defaults, migrateAimProfiles,
  });
}

// Minimal DOM & Web API mock environment for executing composed modules
function createTestContext(overrides = {}) {
  const listeners = new Map();
  const storage = new Map();
  const G = { mode: 'match', settings: null, camera: null, renderer: null };

  class Classes {
    constructor() { this.values = new Set(); }
    add(n) { this.values.add(n); }
    remove(n) { this.values.delete(n); }
    toggle(n, v) { v ? this.add(n) : this.remove(n); }
    contains(n) { return this.values.has(n); }
  }

  const makeElement = (tag = 'div') => ({
    tagName: tag.toUpperCase(),
    classList: new Classes(),
    style: {
      transform: '',
      width: '',
      setProperty() {},
      getPropertyValue() { return ''; },
    },
    dataset: {},
    children: [],
    childElementCount: 0,
    scrollTop: 0,
    scrollHeight: 100,
    clientHeight: 100,
    offsetLeft: 0,
    offsetWidth: 100,
    isConnected: true,
    append(...els) {
      for (const el of els) this.appendChild(el);
    },
    appendChild(el) {
      this.children.push(el);
      this.childElementCount = this.children.length;
      el.parentElement = this;
      return el;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    remove() { this.removed = true; },
    addEventListener(ty, fn) {
      const all = listeners.get(ty) || new Set();
      all.add(fn);
      listeners.set(ty, all);
    },
    removeEventListener(ty, fn) { listeners.get(ty)?.delete(fn); },
    dispatchEvent() { return true; },
  });

  const ctx = {
    Promise, console, AbortController,
    performance: { now: () => 1000 },
    G,
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener(ty, fn) {
        const all = listeners.get(ty) || new Set();
        all.add(fn);
        listeners.set(ty, all);
      },
      removeEventListener(ty, fn) { listeners.get(ty)?.delete(fn); },
    },
    document: {
      body: makeElement('body'),
      createElement: (t) => makeElement(t),
      createTextNode: (s) => ({ textContent: s }),
      getElementById: () => makeElement('div'),
      documentElement: { classList: new Classes(), lang: 'en' },
    },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
    },
    addEventListener: (ty, fn) => {
      const all = listeners.get(ty) || new Set();
      all.add(fn);
      listeners.set(ty, all);
    },
    removeEventListener(ty, fn) { listeners.get(ty)?.delete(fn); },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    ...overrides,
  };

  return { context: vm.createContext(ctx), storage, listeners, G };
}

async function loadComposedModule(rel, context) {
  const loadedModules = new Map();

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  }

  function getModule(absPath) {
    if (loadedModules.has(absPath)) return loadedModules.get(absPath);
    let code;
    if (absPath.startsWith(path.join(ROOT, 'patches'))) {
      code = fs.readFileSync(absPath, 'utf8');
    } else {
      const relSpec = path.relative(UPSTREAM, absPath);
      code = compose(relSpec);
      if (relSpec === 'src/core/ctx.js') {
        code = code.replace(/export const G = \{[\s\S]*?\};/, 'export const G = globalThis.G;');
      }
    }
    const mod = new vm.SourceTextModule(code, { context, identifier: absPath });
    loadedModules.set(absPath, mod);
    return mod;
  }

  function linker(spec, from) {
    if (spec === 'three') {
      if (!loadedModules.has('three')) {
        const syn = new vm.SyntheticModule(['Vector3'], function() {
          this.setExport('Vector3', Vector3);
        }, { context, identifier: 'three' });
        loadedModules.set('three', syn);
      }
      return loadedModules.get('three');
    }

    let absPath;
    if (spec.includes('patches/')) {
      absPath = path.resolve(ROOT, spec.slice(spec.indexOf('patches/')));
    } else if (spec.startsWith('.')) {
      absPath = path.resolve(path.dirname(from.identifier), spec);
    } else {
      absPath = path.resolve(UPSTREAM, spec);
    }

    return getModule(absPath);
  }

  const rootAbs = path.join(UPSTREAM, rel);
  const rootMod = getModule(rootAbs);
  await rootMod.link(linker);
  await rootMod.evaluate();
  return rootMod;
}

// ------------------------------------------------------------------------------------------
// 1. Startup load path regression: exact composed native loadJSON + settings constructor load
// ------------------------------------------------------------------------------------------

test('DEFAULT_SETTINGS in composed config.js sets aimProfiles to null with tv default selector', async () => {
  const { context } = createTestContext();
  const configMod = await loadComposedModule('src/config.js', context);
  const def = configMod.namespace.DEFAULT_SETTINGS;

  assert.equal(def.aimProfile, 'tv', 'default aimProfile is TV/Tabletop');
  assert.equal(def.aimProfiles, null, 'aimProfiles is null in DEFAULT_SETTINGS to prevent shallow merge sharing');

  // Active flat settings for backwards compatibility
  assert.equal(def.padSensitivity, 1.0);
  assert.equal(def.invertY, false);
  assert.equal(def.invertX, false);
  assert.equal(def.gyro, false);
  assert.equal(def.gyroSens, 0);

  // Non-aim settings remain global
  assert.equal(def.sensitivity, 1.0);
  assert.equal(def.touchSens, 0);
  assert.equal(def.quality, 'high');
});

test('exact composed native loadJSON merges legacy flat save without overwriting user choices', async () => {
  const { context, storage } = createTestContext();
  const configMod = await loadComposedModule('src/config.js', context);
  const DEFAULT_SETTINGS = configMod.namespace.DEFAULT_SETTINGS;

  // Persist legacy localStorage with distinctive values and no aimProfiles
  storage.set('inkwave.settings', JSON.stringify({
    gyroSens: 3.5,
    padSensitivity: 2.2,
    invertY: true,
  }));

  // EXACT native loadJSON function from composed src/main.js
  const nativeBootLoad = settingsLoader(context, DEFAULT_SETTINGS);

  // Exact native settings load expression from Game.prototype.boot in src/main.js
  const loadedShallow = nativeBootLoad.call({});
  assert.equal(loadedShallow.aimProfiles.tv.padSensitivity, 2.2, 'actual boot migrated the legacy profile');
  assert.equal(loadedShallow.gyroSens, 3.5, 'user distinctive gyroSens preserved in shallow merge');
  assert.equal(loadedShallow.padSensitivity, 2.2, 'user distinctive padSensitivity preserved in shallow merge');
  assert.equal(loadedShallow.invertY, true, 'user distinctive invertY preserved in shallow merge');

  const migrated = migrateAimProfiles(loadedShallow, DEFAULT_SETTINGS);

  // Both independent profiles now hold the user's distinctive values
  assert.equal(migrated.aimProfile, 'tv');
  assert.equal(migrated.aimProfiles.tv.gyroSens, 3.5);
  assert.equal(migrated.aimProfiles.tv.padSensitivity, 2.2);
  assert.equal(migrated.aimProfiles.tv.invertY, true);

  assert.equal(migrated.aimProfiles.handheld.gyroSens, 3.5);
  assert.equal(migrated.aimProfiles.handheld.padSensitivity, 2.2);
  assert.equal(migrated.aimProfiles.handheld.invertY, true);

  // Synchronized active values
  assert.equal(migrated.gyroSens, 3.5);
  assert.equal(migrated.padSensitivity, 2.2);
  assert.equal(migrated.invertY, true);
});

test('two cold loads prove deep ownership: no shared nested pointers and zero DEFAULT_SETTINGS mutation', async () => {
  const { context, storage } = createTestContext();
  const configMod = await loadComposedModule('src/config.js', context);
  const DEFAULT_SETTINGS = configMod.namespace.DEFAULT_SETTINGS;

  storage.set('inkwave.settings', JSON.stringify({
    gyroSens: 3.5,
    padSensitivity: 2.2,
    invertY: true,
  }));

  const nativeBootLoad = settingsLoader(context, DEFAULT_SETTINGS);

  // Cold load 1
  const cold1 = migrateAimProfiles(nativeBootLoad.call({}), DEFAULT_SETTINGS);

  // Cold load 2
  const cold2 = migrateAimProfiles(nativeBootLoad.call({}), DEFAULT_SETTINGS);

  // Deep ownership: no shared references between instances
  assert.notEqual(cold1.aimProfiles, cold2.aimProfiles, 'aimProfiles objects are distinct');
  assert.notEqual(cold1.aimProfiles.tv, cold2.aimProfiles.tv, 'tv profile objects are distinct');
  assert.notEqual(cold1.aimProfiles.handheld, cold2.aimProfiles.handheld, 'handheld profile objects are distinct');

  // DEFAULT_SETTINGS remains pristine
  assert.equal(DEFAULT_SETTINGS.aimProfiles, null, 'DEFAULT_SETTINGS.aimProfiles remained null');

  // Mutation in cold1 does not affect cold2 or DEFAULT_SETTINGS
  cold1.aimProfiles.tv.padSensitivity = 99.0;
  assert.equal(cold2.aimProfiles.tv.padSensitivity, 2.2, 'cold2 was completely isolated from cold1 mutation');
  assert.equal(DEFAULT_SETTINGS.aimProfiles, null, 'DEFAULT_SETTINGS unchanged after cold1 mutation');

  // Cold loads with empty storage (fresh install) also have distinct pointers
  storage.clear();
  const fresh1 = migrateAimProfiles(nativeBootLoad.call({}), DEFAULT_SETTINGS);
  const fresh2 = migrateAimProfiles(nativeBootLoad.call({}), DEFAULT_SETTINGS);
  assert.notEqual(fresh1.aimProfiles, fresh2.aimProfiles, 'fresh instances do not share aimProfiles');
  assert.notEqual(fresh1.aimProfiles.tv, fresh2.aimProfiles.tv, 'fresh instances do not share tv profile');
  assert.equal(DEFAULT_SETTINGS.aimProfiles, null);
});

// ------------------------------------------------------------------------------------------
// 2. Extracted composed native _setSettings tests: ON->OFF, OFF->ON, and scoped profile epoch
// ------------------------------------------------------------------------------------------

function createComposedSettingsFixture({ gyroSupported = true, needsPermission = false } = {}) {
  let permissionResolvers = [];
  const toastLog = [];
  const refreshedKeys = [];

  const gyro = {
    enabled: false,
    supported: gyroSupported,
    needsPermission,
    sens: 0,
    invX: false,
    invY: false,
    dYaw: 0,
    dPitch: 0,
    start() { this.enabled = true; },
    stop() { this.enabled = false; },
    request() {
      return new Promise((resolve) => {
        permissionResolvers.push(resolve);
      });
    },
    configure(cfg) {
      if (cfg.sens != null) this.sens = cfg.sens;
      if (cfg.invX != null) this.invX = cfg.invX;
      if (cfg.invY != null) this.invY = cfg.invY;
    },
    discard() { this.dYaw = 0; this.dPitch = 0; },
    resync() {},
  };

  const mobile = {
    gyro,
    s: {},
    _gyroIntent: 0,
    _gyroWanted: false,
    _profileEpoch: 0,
    _lastAimProfile: null,
    toast(msg) { toastLog.push(msg); },
  };

  const game = {
    settings: migrateAimProfiles({
      aimProfile: 'tv',
      aimProfiles: {
        tv: { gyro: false, gyroSens: 0, padSensitivity: 1.0, invertY: false, invertX: false },
        handheld: { gyro: true, gyroSens: 3.0, padSensitivity: 0.8, invertY: false, invertX: false },
      },
      gyro: false,
      gyroSens: 0,
      padSensitivity: 1.0,
      invertY: false,
      invertX: false,
    }),
    input: { mobile },
    menus: {
      refreshSetting(k) { refreshedKeys.push(k); },
    },
    match: { state: 'playing' },
    _aimProfileEpoch: 0,
    saved: [],

  };

  const sandbox = {
    applyAimSettingsChange, Promise, clearTimeout, G: { mode: 'match' }, t: value => value,
    localStorage: { setItem(_key, value) { game.saved.push(JSON.parse(value)); } },
  };
  const save = compose('src/main.js').match(/^function saveJSON.*$/m)[0];
  game._setSettings = vm.runInNewContext(`${save}\n({${nativeMethod('src/main.js', '  _setSettings(partial) {', '\n  _applyAudioVolumes()')}})._setSettings`, sandbox);
  mobile._gyroBtn = () => {};
  mobile.applySettings = vm.runInNewContext(`({${nativeMethod('src/core/mobile.js', '  applySettings(s) {', '\n  /** Turn gyro')}}).applySettings`, sandbox);
  mobile.setGyro = vm.runInNewContext(`({${nativeMethod('src/core/mobile.js', '  setGyro(on, canStart = null) {', '\n  setVisible(on)')}}).setGyro`, sandbox);

  return {
    game,
    mobile,
    gyro,
    toastLog,
    refreshedKeys,
    resolvePermission: (val) => {
      const fn = permissionResolvers.shift();
      if (fn) fn(val);
    },
  };
}

test('native _setSettings: profile switch OFF->ON starts gyro and ON->OFF stops gyro', async () => {
  const { game, mobile, gyro } = createComposedSettingsFixture();

  // Initially on TV with gyro OFF
  assert.equal(game.settings.aimProfile, 'tv');
  assert.equal(game.settings.gyro, false);
  assert.equal(gyro.enabled, false);

  // Profile switch TV (OFF) -> Handheld (ON)
  game._setSettings({ aimProfile: 'handheld' });
  await Promise.resolve(); // wait microtask for settings path

  assert.equal(game.settings.aimProfile, 'handheld');
  assert.equal(game.settings.gyro, true);
  assert.equal(gyro.enabled, true, 'gyro was started by profile switch to Handheld');
  assert.equal(mobile.s.gyro, true);

  // Profile switch Handheld (ON) -> TV (OFF)
  game._setSettings({ aimProfile: 'tv' });
  await Promise.resolve();

  assert.equal(game.settings.aimProfile, 'tv');
  assert.equal(game.settings.gyro, false);
  assert.equal(gyro.enabled, false, 'gyro was stopped by profile switch to TV');
  assert.equal(mobile.s.gyro, false);
});

test('native _setSettings: permission denied on OFF->ON reverts active profile and notifies UI', async () => {
  const { game, mobile, gyro, toastLog, refreshedKeys, resolvePermission } = createComposedSettingsFixture({
    needsPermission: true,
  });

  // Switch to Handheld which has gyro: true -> requests permission
  game._setSettings({ aimProfile: 'handheld' });
  assert.equal(gyro.enabled, false, 'gyro not started while permission pending');

  // Deny permission
  resolvePermission(false);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(gyro.enabled, false, 'gyro remains stopped');
  assert.equal(game.settings.aimProfiles.handheld.gyro, false, 'handheld profile gyro reverted to false');
  assert.equal(game.settings.gyro, false, 'active gyro reverted to false');
  assert.ok(refreshedKeys.includes('gyro'), 'menus refreshSetting was called for gyro');
  assert.ok(toastLog.length > 0, 'toast notification was displayed');
});

test('scoped profile epoch guards deferred permission: switching profiles/back prevents activation on replaced profile', async () => {
  const { game, mobile, gyro, resolvePermission } = createComposedSettingsFixture({
    needsPermission: true,
  });

  // Start on TV with gyro OFF, toggle gyro ON in TV mode
  game._setSettings({ gyro: true });
  assert.equal(gyro.enabled, false, 'permission pending');
  assert.equal(game._aimProfileEpoch, 0, 'epoch is 0');

  // Before permission resolves, user switches to Handheld mode where gyro was set to false
  game.settings.aimProfiles.handheld.gyro = false;
  game._setSettings({ aimProfile: 'handheld' });
  assert.equal(game._aimProfileEpoch, 1, 'profile switch incremented epoch to 1');
  assert.equal(game.settings.aimProfile, 'handheld');
  assert.equal(game.settings.gyro, false);

  // Now the deferred permission from TV resolves with true
  resolvePermission(true);
  await Promise.resolve();
  await Promise.resolve();

  // Epoch guard prevented activating gyro on Handheld!
  assert.equal(gyro.enabled, false, 'deferred permission did NOT activate gyro on Handheld');
  assert.equal(game.settings.gyro, false, 'Handheld gyro remains false');
  assert.equal(game.settings.aimProfiles.handheld.gyro, false, 'Handheld profile was not mutated');

  // Even switching back to TV increments epoch again, so obsolete request cannot activate
  game._setSettings({ aimProfile: 'tv' });
  assert.equal(game._aimProfileEpoch, 2);
  assert.equal(gyro.enabled, false);
});

test('same-ON profile replacement renews pending permission for the newly selected profile', async () => {
  const { game, gyro, resolvePermission } = createComposedSettingsFixture({ needsPermission: true });
  game._setSettings({ gyro: true });
  game._setSettings({ aimProfile: 'handheld' });
  assert.equal(game.settings.gyro, true);
  resolvePermission(true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(gyro.enabled, false, 'old profile permission must remain cancelled');
  resolvePermission(true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(gyro.enabled, true, 'newly selected ON profile must obtain its own effective permission');
  assert.equal(game.settings.aimProfiles.handheld.gyro, true);
});

test('MobileInput.setGyro scoped profile epoch prevents deferred request from activating replaced profile', async () => {
  let resolveReq = null;
  const gyro = {
    enabled: false,
    supported: true,
    needsPermission: true,
    sens: 0,
    start() { this.enabled = true; },
    stop() { this.enabled = false; },
    request() { return new Promise((r) => { resolveReq = r; }); },
    configure() {},
    discard() {},
    resync() {},
  };

  const mobile = {
    gyro,
    s: { gyro: false },
    _gyroIntent: 0,
    _gyroWanted: false,
    _profileEpoch: 0,
    _lastAimProfile: 'tv',
    applySettings(s) {
      if (this._lastAimProfile !== s.aimProfile) {
        this._profileEpoch = (this._profileEpoch || 0) + 1;
        this.gyro?.discard?.();
        this.gyro?.resync?.();
        this._lastAimProfile = s.aimProfile;
      }
      this.gyro.configure({ sens: s.gyroSens });
    },

  };

  // Start gyro request under profile 'tv'
  mobile._gyroBtn = () => {};
  mobile.setGyro = vm.runInNewContext(`({${nativeMethod('src/core/mobile.js', '  setGyro(on, canStart = null) {', '\n  setVisible(on)')}}).setGyro`, { Promise, clearTimeout });
  const p = mobile.setGyro(true);
  assert.equal(mobile._profileEpoch, 0);

  // Switch profile to 'handheld' while permission is in flight
  mobile.applySettings({ aimProfile: 'handheld', gyroSens: 1.5 });
  assert.equal(mobile._profileEpoch, 1, 'profile switch incremented mobile profile epoch');

  // Permission resolves
  resolveReq(true);
  const result = await p;

  assert.equal(result, false, 'finish returned false due to profile epoch mismatch');
  assert.equal(gyro.enabled, false, 'gyro was not started for replaced profile');
  assert.equal(mobile.s.gyro, false);
});

// ------------------------------------------------------------------------------------------
// 3. PR 494 separation: raw preserves existing gyroconfigure while PR 494 composition drops invX/invY
// ------------------------------------------------------------------------------------------

test('adapter composition retains existing gyro configure for both raw and PR494 applied sources', () => {
  const rawMobile = read('src/core/mobile.js');
  const rawMenus = read('src/ui/menus.js');

  // 1. Raw composition (PR 494 not applied)
  const adaptedRawMobile = adaptQualitySource('src/core/mobile.js', rawMobile);
  const adaptedRawMenus = adaptQualitySource('src/ui/menus.js', rawMenus);

  // Profile reset was prepended
  assert.ok(adaptedRawMobile.includes('this._lastAimProfile !== s.aimProfile'), 'profile reset added in raw');
  assert.ok(adaptedRawMobile.includes('this._profileEpoch = (this._profileEpoch || 0) + 1;'), 'profileEpoch tracked in raw');
  // Raw gyro configure arguments (invX, invY) remain intact
  assert.ok(adaptedRawMobile.includes('invX: s.gyroInvertX, invY: s.gyroInvertY'), 'raw mobile retains invX/invY');
  // Raw menus keep gyroInvertX/Y in Touch tab
  assert.ok(adaptedRawMenus.includes("key: 'gyroInvertY'"), 'raw menus retain gyroInvertY');
  assert.ok(adaptedRawMenus.includes("key: 'gyroInvertX'"), 'raw menus retain gyroInvertX');
  // aimProfile selector is added
  assert.ok(adaptedRawMenus.includes("key: 'aimProfile'"), 'aimProfile added to menus');

  // 2. PR 494 applied composition
  const pr494AppliedMobile = adaptGyroInvertPR494('src/core/mobile.js', rawMobile);
  const pr494AppliedMenus = adaptGyroInvertPR494('src/ui/menus.js', rawMenus);

  const adaptedPr494Mobile = adaptQualitySource('src/core/mobile.js', pr494AppliedMobile);
  const adaptedPr494Menus = adaptQualitySource('src/ui/menus.js', pr494AppliedMenus);

  assert.ok(adaptedPr494Mobile.includes('this._lastAimProfile !== s.aimProfile'), 'profile reset added in PR494');
  assert.ok(adaptedPr494Mobile.includes('this.gyro.configure({ sens: s.gyroSens });'), 'PR494 mobile configure without invX/Y preserved');
  assert.ok(!adaptedPr494Mobile.includes('invX: s.gyroInvertX'), 'no invX in PR494 mobile');
  assert.ok(!adaptedPr494Menus.includes("key: 'gyroInvertY'"), 'PR494 menus drop gyroInvertY');
  assert.ok(!adaptedPr494Menus.includes("key: 'gyroInvertX'"), 'PR494 menus drop gyroInvertX');
  assert.ok(adaptedPr494Menus.includes("key: 'aimProfile'"), 'aimProfile added to PR494 menus');
});

// ------------------------------------------------------------------------------------------
// 4. Native player controller & interactive UI refresh tests
// ------------------------------------------------------------------------------------------

test('PlayerController applies independent padSensitivity, invertY, invertX and resets stale gyro on native touch transition', async () => {
  const { context } = createTestContext();
  const playerMod = await loadComposedModule('src/game/player.js', context);
  const PlayerController = playerMod.namespace.PlayerController;

  const actor = {
    intent: {
      move: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
    },
    color: '#ff8a14',
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    update() {},
  };
  const rig = { yaw: 0, pitch: 0, camDist: 4 };

  const padStickState = { x: 1, y: 1, mag: 1.414 };
  const input = {
    lastDevice: 'pad',
    pad: {
      buttons: [],
      axes: [0, 0, 1, 1],
    },
    padStick(a1, a2, out) {
      out.x = padStickState.x;
      out.y = padStickState.y;
      out.mag = padStickState.mag;
    },
    mouse: { dx: 0, dy: 0 },
    keys: new Set(),
    padPressed: new Set(),
    down() { return false; },
    wasPressed() { return false; },
    padButton() { return false; },
    padValue() { return 0; },
  };

  let discarded = false;
  let resynced = false;
  const gyro = {
    enabled: true,
    dYaw: 0,
    dPitch: 0,
    consume(out) {
      out.yaw = this.dYaw;
      out.pitch = this.dPitch;
      this.dYaw = 0;
      this.dPitch = 0;
      return out;
    },
    discard() { discarded = true; this.dYaw = 0; this.dPitch = 0; },
    resync() { resynced = true; },
  };
  const touch = {
    active: true,
    root: {},
    down() { return false; },
    wasPressed() { return false; },
    consumeJumpTarget() { return -1; },
    moveX: 0,
    moveY: 0,
    mapOpen: false,
    lookDX: 0,
    lookDY: 0,
    gyro,
  };
  input.mobile = touch;

  const controller = new PlayerController(actor, rig, input);
  controller._assistTarget = () => null;
  controller.computeAim = () => {};

  // Normal look
  context.G.settings = {
    padSensitivity: 1.0,
    invertY: false,
    invertX: false,
  };
  controller.padLook = { x: 0, y: 0 };
  rig.yaw = 0;
  rig.pitch = 0;
  controller.update(1 / 60);

  const initialYawDelta = rig.yaw;
  const initialPitchDelta = rig.pitch;
  assert.ok(initialYawDelta < 0, 'yaw is negative for positive stick X');
  assert.ok(initialPitchDelta < 0, 'pitch is negative for positive stick Y');

  // Inverted axes
  context.G.settings = {
    padSensitivity: 1.0,
    invertY: true,
    invertX: true,
  };
  controller.padLook = { x: 0, y: 0 };
  rig.yaw = 0;
  rig.pitch = 0;
  controller.update(1 / 60);

  assert.ok(rig.yaw > 0, 'yaw is positive with invertX: true');
  assert.ok(rig.pitch > 0, 'pitch is positive with invertY: true');

  // Input device ownership transition: pad -> touch
  gyro.dYaw = 0.8;
  gyro.dPitch = 0.4;
  controller._gyro = { yaw: 0.8, pitch: 0.4 };
  input.lastDevice = 'touch'; // Real native device transition
  controller.update(1 / 60);

  assert.ok(discarded, 'gyro.discard was called on ownership switch to touch');
  assert.ok(resynced, 'gyro.resync was called on ownership switch to touch');
  assert.equal(gyro.dYaw, 0, 'stale gyro yaw discarded');
  assert.equal(gyro.dPitch, 0, 'stale gyro pitch discarded');
  assert.equal(controller._gyro.yaw, 0, 'player._gyro yaw cleared');
  assert.equal(controller._gyro.pitch, 0, 'player._gyro pitch cleared');
});

test('UI interactive settings change callback refreshes all aim controls on profile switch', () => {
  const menusCode = compose('src/ui/menus.js');

  // Verify the refresh logic was injected into onSetting
  assert.ok(menusCode.includes("if (key === 'aimProfile')"), 'aimProfile handler in onSetting');

  // Simulate native onSetting logic from _scr_settings
  const refreshed = {};
  const mockControls = new Map();
  for (const k of ['gyro', 'gyroSens', 'padSensitivity', 'invertY', 'invertX']) {
    mockControls.set(k, {
      refresh(val) { refreshed[k] = val; },
    });
  }

  const settingsState = {
    aimProfile: 'handheld',
    gyro: true,
    gyroSens: 4.5,
    padSensitivity: 0.75,
    invertY: false,
    invertX: true,
  };

  const at = menusCode.indexOf('      onSetting: (key, value) => {');
  const end = menusCode.indexOf('\n      onNav:', at);
  assert.ok(at >= 0 && end > at);
  const factory = vm.runInNewContext(`(function () { return ({${menusCode.slice(at, end)}}).onSetting; })`, {
    controls: mockControls, savedPulse() {}, safeCall: fn => fn(), P: {},
  });
  const onSettingAimProfile = factory.call({ _settings: () => settingsState });
  onSettingAimProfile('aimProfile', 'handheld');

  assert.equal(refreshed.gyro, true);
  assert.equal(refreshed.gyroSens, 4.5);
  assert.equal(refreshed.padSensitivity, 0.75);
  assert.equal(refreshed.invertY, false);
  assert.equal(refreshed.invertX, true);
});

test('Controls tooltip uses simple selected profile sensitivity explanation and legacy stick scale', () => {
  const menusCode = compose('src/ui/menus.js');

  const controlsIdx = menusCode.indexOf("id: 'controls'");
  assert.ok(controlsIdx >= 0, 'controls tab exists');
  const controlsEnd = menusCode.indexOf("id: 'view'", controlsIdx);
  const controlsTabContent = menusCode.slice(controlsIdx, controlsEnd);

  // 1. New Controls tab tooltip does NOT copy unneeded angle constants
  assert.ok(!controlsTabContent.includes('132°'), 'angle constant 132° not copied in Controls tooltip');
  assert.ok(!controlsTabContent.includes('110°'), 'angle constant 110° not copied in Controls tooltip');
  assert.ok(!controlsTabContent.includes('278°'), 'angle constant 278° not copied in Controls tooltip');
  assert.ok(controlsTabContent.includes('Motion-control aiming sensitivity for the selected profile.'), 'simple explanation used in Controls');

  // 2. Stick sensitivity uses INKWAVE legacy scale 0.2..3
  assert.ok(controlsTabContent.includes("min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×'"), 'stick scale is legacy 0.2..3');
});

// ------------------------------------------------------------------------------------------
// 5. Core aim profiles helpers: persistence, globals, idempotence, and isolation
// ------------------------------------------------------------------------------------------

test('two independent profiles can hold distinct values simultaneously and persist separately', () => {
  const settings = migrateAimProfiles({
    padSensitivity: 1.0,
    invertY: false,
    invertX: false,
    gyro: false,
    gyroSens: 0,
  });

  applyAimSettingsChange(settings, {
    aimProfile: 'tv',
    padSensitivity: 2.5,
    invertY: true,
    invertX: false,
    gyro: false,
    gyroSens: -2.0,
  });

  applyAimSettingsChange(settings, {
    aimProfile: 'handheld',
    padSensitivity: 0.8,
    invertY: false,
    invertX: true,
    gyro: true,
    gyroSens: 4.5,
  });

  assert.equal(settings.aimProfile, 'handheld');
  assert.equal(settings.padSensitivity, 0.8);
  assert.equal(settings.invertY, false);
  assert.equal(settings.invertX, true);
  assert.equal(settings.gyro, true);
  assert.equal(settings.gyroSens, 4.5);

  assert.equal(settings.aimProfiles.tv.padSensitivity, 2.5);
  assert.equal(settings.aimProfiles.tv.invertY, true);
  assert.equal(settings.aimProfiles.tv.invertX, false);
  assert.equal(settings.aimProfiles.tv.gyro, false);
  assert.equal(settings.aimProfiles.tv.gyroSens, -2.0);

  applyAimSettingsChange(settings, { aimProfile: 'tv' });
  assert.equal(settings.aimProfile, 'tv');
  assert.equal(settings.padSensitivity, 2.5);
  assert.equal(settings.invertY, true);
  assert.equal(settings.invertX, false);
  assert.equal(settings.gyro, false);
  assert.equal(settings.gyroSens, -2.0);

  assert.equal(settings.aimProfiles.handheld.padSensitivity, 0.8);
  assert.equal(settings.aimProfiles.handheld.invertY, false);
  assert.equal(settings.aimProfiles.handheld.invertX, true);
  assert.equal(settings.aimProfiles.handheld.gyro, true);
  assert.equal(settings.aimProfiles.handheld.gyroSens, 4.5);
});

test('globals remain shared across profile switches and are not duplicated', () => {
  const settings = migrateAimProfiles({
    sensitivity: 1.2,
    touchSens: 0.5,
    fov: 85,
    colorblind: false,
  });

  applyAimSettingsChange(settings, {
    aimProfile: 'tv',
    quality: 'low',
    colorblind: true,
  });

  assert.equal(settings.quality, 'low');
  assert.equal(settings.colorblind, true);
  assert.equal(settings.aimProfiles.tv.quality, undefined, 'quality not duplicated into TV profile');

  applyAimSettingsChange(settings, { aimProfile: 'handheld' });
  assert.equal(settings.quality, 'low', 'global quality shared in Handheld mode');
  assert.equal(settings.colorblind, true, 'global colorblind shared in Handheld mode');
  assert.equal(settings.aimProfiles.handheld.quality, undefined, 'quality not duplicated into Handheld profile');
});

test('Practice and match helper instances remain isolated without global state bleed', () => {
  const settingsA = migrateAimProfiles({ padSensitivity: 1.2 });
  const settingsB = migrateAimProfiles({ padSensitivity: 2.8 });

  applyAimSettingsChange(settingsA, { aimProfile: 'tv', padSensitivity: 1.5 });
  applyAimSettingsChange(settingsB, { aimProfile: 'handheld', padSensitivity: 0.5 });

  assert.equal(settingsA.aimProfile, 'tv');
  assert.equal(settingsA.padSensitivity, 1.5);
  assert.equal(settingsA.aimProfiles.tv.padSensitivity, 1.5);

  assert.equal(settingsB.aimProfile, 'handheld');
  assert.equal(settingsB.padSensitivity, 0.5);
  assert.equal(settingsB.aimProfiles.handheld.padSensitivity, 0.5);
  assert.equal(settingsB.aimProfiles.tv.padSensitivity, 2.8, 'instance A does not mutate instance B TV profile');
});

test('save and reload preserves independent profiles and active mode', () => {
  const { storage } = createTestContext();

  const initial = migrateAimProfiles({
    padSensitivity: 1.0,
    sensitivity: 1.4,
  });

  applyAimSettingsChange(initial, {
    aimProfile: 'tv',
    padSensitivity: 2.4,
    invertY: true,
    invertX: false,
    gyro: false,
    gyroSens: -1.5,
  });

  applyAimSettingsChange(initial, {
    aimProfile: 'handheld',
    padSensitivity: 0.7,
    invertY: false,
    invertX: true,
    gyro: true,
    gyroSens: 4.0,
  });

  storage.set('inkwave.settings', JSON.stringify(initial));

  const reloadedRaw = JSON.parse(storage.get('inkwave.settings'));
  const reloaded = migrateAimProfiles(reloadedRaw);

  assert.equal(reloaded.aimProfile, 'handheld', 'active profile preserved');
  assert.equal(reloaded.padSensitivity, 0.7, 'active padSensitivity preserved');
  assert.equal(reloaded.invertX, true, 'active invertX preserved');
  assert.equal(reloaded.gyro, true, 'active gyro preserved');
  assert.equal(reloaded.gyroSens, 4.0, 'active gyroSens preserved');

  assert.equal(reloaded.aimProfiles.tv.padSensitivity, 2.4, 'TV padSensitivity preserved');
  assert.equal(reloaded.aimProfiles.tv.invertY, true, 'TV invertY preserved');
  assert.equal(reloaded.aimProfiles.tv.gyroSens, -1.5, 'TV gyroSens preserved');

  assert.equal(reloaded.aimProfiles.handheld.padSensitivity, 0.7, 'Handheld padSensitivity preserved');
  assert.equal(reloaded.aimProfiles.handheld.invertX, true, 'Handheld invertX preserved');
  assert.equal(reloaded.aimProfiles.handheld.gyroSens, 4.0, 'Handheld gyroSens preserved');

  assert.equal(reloaded.sensitivity, 1.4);
});

test('re-migration is idempotent and preserves already split profiles without overwriting', () => {
  const settings = {
    aimProfile: 'handheld',
    aimProfiles: {
      tv: { gyro: false, gyroSens: -2.5, padSensitivity: 2.2, invertY: true, invertX: false },
      handheld: { gyro: true, gyroSens: 4.5, padSensitivity: 0.8, invertY: false, invertX: true },
    },
    padSensitivity: 0.8,
    gyroSens: 4.5,
  };

  const migratedAgain = migrateAimProfiles(settings);

  assert.equal(migratedAgain.aimProfile, 'handheld');
  assert.equal(migratedAgain.aimProfiles.tv.padSensitivity, 2.2);
  assert.equal(migratedAgain.aimProfiles.tv.gyroSens, -2.5);
  assert.equal(migratedAgain.aimProfiles.handheld.padSensitivity, 0.8);
  assert.equal(migratedAgain.aimProfiles.handheld.gyroSens, 4.5);
  assert.equal(migratedAgain.aimProfiles.handheld.invertX, true);
});
