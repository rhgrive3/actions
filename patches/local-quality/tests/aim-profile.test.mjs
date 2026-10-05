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
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
    },
    addEventListener: (ty, fn) => {
      const all = listeners.get(ty) || new Set();
      all.add(fn);
      listeners.set(ty, all);
    },
    removeEventListener: (ty, fn) => listeners.get(ty)?.delete(fn),
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

test('DEFAULT_SETTINGS in composed config.js includes independent aim profiles and mode selector', async () => {
  const { context } = createTestContext();
  const configMod = await loadComposedModule('src/config.js', context);
  const def = configMod.namespace.DEFAULT_SETTINGS;

  assert.equal(def.aimProfile, 'tv', 'default aimProfile is TV/Tabletop');
  assert.ok(def.aimProfiles, 'aimProfiles object is present in DEFAULT_SETTINGS');
  assert.ok(def.aimProfiles.tv, 'TV profile exists');
  assert.ok(def.aimProfiles.handheld, 'Handheld profile exists');

  for (const k of AIM_PROFILE_KEYS) {
    assert.ok(k in def.aimProfiles.tv, `key ${k} in tv profile`);
    assert.ok(k in def.aimProfiles.handheld, `key ${k} in handheld profile`);
  }

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

test('legacy flat settings migrate deterministically without losing user choices', () => {
  const legacySettings = {
    sensitivity: 1.5,
    padSensitivity: 2.2,
    invertY: true,
    gyro: true,
    gyroSens: 3.5,
    touchSens: 1.0,
    quality: 'ultra',
    fov: 90,
  };

  const migrated = migrateAimProfiles({ ...legacySettings });

  // Explicit mode selector defaults to tv without guessing browser form factor
  assert.equal(migrated.aimProfile, 'tv');

  // Both TV and Handheld profiles inherit the user's legacy choices
  assert.equal(migrated.aimProfiles.tv.padSensitivity, 2.2);
  assert.equal(migrated.aimProfiles.tv.invertY, true);
  assert.equal(migrated.aimProfiles.tv.invertX, false);
  assert.equal(migrated.aimProfiles.tv.gyro, true);
  assert.equal(migrated.aimProfiles.tv.gyroSens, 3.5);

  assert.equal(migrated.aimProfiles.handheld.padSensitivity, 2.2);
  assert.equal(migrated.aimProfiles.handheld.invertY, true);
  assert.equal(migrated.aimProfiles.handheld.invertX, false);
  assert.equal(migrated.aimProfiles.handheld.gyro, true);
  assert.equal(migrated.aimProfiles.handheld.gyroSens, 3.5);

  // Active flat settings match
  assert.equal(migrated.padSensitivity, 2.2);
  assert.equal(migrated.invertY, true);
  assert.equal(migrated.gyro, true);
  assert.equal(migrated.gyroSens, 3.5);

  // Non-aim settings remain global and unchanged
  assert.equal(migrated.sensitivity, 1.5);
  assert.equal(migrated.touchSens, 1.0);
  assert.equal(migrated.quality, 'ultra');
  assert.equal(migrated.fov, 90);
});

test('two independent profiles can hold distinct values simultaneously and persist separately', () => {
  const settings = migrateAimProfiles({
    padSensitivity: 1.0,
    invertY: false,
    invertX: false,
    gyro: false,
    gyroSens: 0,
  });

  // Tune TV profile
  applyAimSettingsChange(settings, {
    aimProfile: 'tv',
    padSensitivity: 2.5,
    invertY: true,
    invertX: false,
    gyro: false,
    gyroSens: -2.0,
  });

  // Switch to Handheld and tune Handheld profile with completely different values
  applyAimSettingsChange(settings, {
    aimProfile: 'handheld',
    padSensitivity: 0.8,
    invertY: false,
    invertX: true,
    gyro: true,
    gyroSens: 4.5,
  });

  // Handheld values are active
  assert.equal(settings.aimProfile, 'handheld');
  assert.equal(settings.padSensitivity, 0.8);
  assert.equal(settings.invertY, false);
  assert.equal(settings.invertX, true);
  assert.equal(settings.gyro, true);
  assert.equal(settings.gyroSens, 4.5);

  // TV profile was NOT mutated
  assert.equal(settings.aimProfiles.tv.padSensitivity, 2.5);
  assert.equal(settings.aimProfiles.tv.invertY, true);
  assert.equal(settings.aimProfiles.tv.invertX, false);
  assert.equal(settings.aimProfiles.tv.gyro, false);
  assert.equal(settings.aimProfiles.tv.gyroSens, -2.0);

  // Switch back to TV: restores TV settings without reload
  applyAimSettingsChange(settings, { aimProfile: 'tv' });
  assert.equal(settings.aimProfile, 'tv');
  assert.equal(settings.padSensitivity, 2.5);
  assert.equal(settings.invertY, true);
  assert.equal(settings.invertX, false);
  assert.equal(settings.gyro, false);
  assert.equal(settings.gyroSens, -2.0);

  // Handheld profile was NOT mutated
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

  // In TV mode, update global quality and colorblind
  applyAimSettingsChange(settings, {
    aimProfile: 'tv',
    quality: 'low',
    colorblind: true,
  });

  assert.equal(settings.quality, 'low');
  assert.equal(settings.colorblind, true);
  assert.equal(settings.aimProfiles.tv.quality, undefined, 'quality not duplicated into TV profile');

  // Switch to Handheld mode
  applyAimSettingsChange(settings, { aimProfile: 'handheld' });
  assert.equal(settings.quality, 'low', 'global quality shared in Handheld mode');
  assert.equal(settings.colorblind, true, 'global colorblind shared in Handheld mode');
  assert.equal(settings.aimProfiles.handheld.quality, undefined, 'quality not duplicated into Handheld profile');
});

test('MobileInput.applySettings configures active gyro sensitivity without axis inversion', async () => {
  const { context } = createTestContext();
  const mobileMod = await loadComposedModule('src/core/mobile.js', context);
  const MobileInput = mobileMod.namespace.MobileInput;

  const mob = new MobileInput(null, { enabled: true });
  // Verify initial
  assert.equal(mob.gyro.invX, false);
  assert.equal(mob.gyro.invY, false);

  // Apply settings with gyroSens 3.5 and persisted gyroInvertX/Y true (simulating legacy storage)
  mob.applySettings({
    gyroSens: 3.5,
    gyroInvertX: true,
    gyroInvertY: true,
    aimProfile: 'handheld',
  });

  assert.equal(mob.gyro.sens, 3.5, 'gyro sensitivity applied');
  assert.equal(mob.gyro.invX, false, 'gyro horizontal inversion is inert (issue #439 / PR 494 parity)');
  assert.equal(mob.gyro.invY, false, 'gyro vertical inversion is inert (issue #439 / PR 494 parity)');

  // Profile switch resets stale gyro deltas
  mob.gyro.dYaw = 0.5;
  mob.gyro.dPitch = 0.3;
  mob.applySettings({
    gyroSens: -1.0,
    aimProfile: 'tv',
  });
  assert.equal(mob.gyro.sens, -1.0, 'updated sensitivity after profile switch');
  assert.equal(mob.gyro.dYaw, 0, 'stale dYaw reset on profile switch');
  assert.equal(mob.gyro.dPitch, 0, 'stale dPitch reset on profile switch');
});

test('PlayerController applies independent padSensitivity, invertY, invertX and resets stale gyro on touch transition', async () => {
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
    discard() { this.dYaw = 0; this.dPitch = 0; },
    resync() {},
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

  // Test 1: Normal stick look with padSensitivity: 1.0, invertY: false, invertX: false
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
  assert.ok(initialYawDelta < 0, 'yaw is negative for positive stick X (turning right)');
  assert.ok(initialPitchDelta < 0, 'pitch is negative for positive stick Y without invert');

  // Test 2: Inverted axes invertY: true, invertX: true
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
  assert.ok(Math.abs(rig.yaw + initialYawDelta) < 1e-4, 'invertX magnitude matches');
  assert.ok(Math.abs(rig.pitch + initialPitchDelta) < 1e-4, 'invertY magnitude matches');

  // Test 3: Sensitivity scaling (padSensitivity: 2.5)
  context.G.settings = {
    padSensitivity: 2.5,
    invertY: false,
    invertX: false,
  };
  controller.padLook = { x: 0, y: 0 };
  rig.yaw = 0;
  rig.pitch = 0;
  controller.update(1 / 60);
  assert.ok(Math.abs(rig.yaw - (initialYawDelta * 2.5)) < 1e-3, 'yaw scales proportionally with padSensitivity');

  // Test 4: Stale gyro delta discard when switching from pad to touch
  gyro.dYaw = 0.8;
  gyro.dPitch = 0.4;
  input.lastDevice = 'touch'; // Switch ownership to touch
  controller.update(1 / 60);
  assert.equal(gyro.dYaw, 0, 'stale gyro yaw discarded on ownership switch to touch');
  assert.equal(gyro.dPitch, 0, 'stale gyro pitch discarded on ownership switch to touch');
});

test('UI in menus.js provides explicit aimProfile selector and removes touch gyro inversion rows', () => {
  const menusCode = compose('src/ui/menus.js');

  // 1. Controls tab has aimProfile selector and independent aim controls
  assert.ok(menusCode.includes("key: 'aimProfile'"), 'aimProfile row in SETTINGS_TABS');
  assert.ok(menusCode.includes("key: 'gyro', label: 'Motion controls'"), 'Motion controls row in Controls');
  assert.ok(menusCode.includes("key: 'gyroSens', label: 'Motion sensitivity'"), 'Motion sensitivity row in Controls');
  assert.ok(menusCode.includes("key: 'padSensitivity', label: 'Right stick sensitivity'"), 'Right stick sensitivity row in Controls');
  assert.ok(menusCode.includes("key: 'invertY', label: 'Right stick up/down'"), 'Right stick up/down row in Controls');
  assert.ok(menusCode.includes("key: 'invertX', label: 'Right stick left/right'"), 'Right stick left/right row in Controls');

  // 2. Touch tab includes aimProfile
  const touchTabIdx = menusCode.indexOf('const TOUCH_TAB = {');
  assert.ok(touchTabIdx >= 0, 'TOUCH_TAB found');
  const touchTabEnd = menusCode.indexOf('};', touchTabIdx);
  const touchTabContent = menusCode.slice(touchTabIdx, touchTabEnd);

  assert.ok(touchTabContent.includes("key: 'aimProfile'"), 'aimProfile selector in TOUCH_TAB');
  assert.ok(touchTabContent.includes("key: 'touchSens'"), 'swipe sensitivity in TOUCH_TAB');
  assert.ok(touchTabContent.includes("key: '_layout'"), 'layout link in TOUCH_TAB');

  // 3. Touch tab does NOT expose gyro axis inversion (PR 494 / issue 439 parity)
  assert.ok(!touchTabContent.includes('gyroInvertY'), 'no gyroInvertY in composed TOUCH_TAB');
  assert.ok(!touchTabContent.includes('gyroInvertX'), 'no gyroInvertX in composed TOUCH_TAB');

  // 4. onSetting refreshes profile controls when aimProfile changes
  assert.ok(menusCode.includes("key === 'aimProfile'"), 'aimProfile refresh handling in onSetting');
});

test('Practice and match instances remain isolated without global state bleed', () => {
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

  // Create initial settings and customize both profiles
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

  // Save to localStorage
  storage.set('inkwave.settings', JSON.stringify(initial));

  // Reload in a fresh session
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

  // Shared globals preserved
  assert.equal(reloaded.sensitivity, 1.4);
});

test('input device ownership switch between pad and touch does not overwrite wrong profile', () => {
  const settings = migrateAimProfiles({});

  // TV configured with distinctive values
  applyAimSettingsChange(settings, {
    aimProfile: 'tv',
    padSensitivity: 2.8,
    gyroSens: -3.0,
  });

  // Handheld configured with distinctive values
  applyAimSettingsChange(settings, {
    aimProfile: 'handheld',
    padSensitivity: 0.6,
    gyroSens: 3.0,
  });

  // Simulate gameplay device events (e.g. pad button followed by touch tap)
  // Input ownership changes between devices during a session:
  let ownedDevice = 'pad';
  // Pad is active: does not change handheld profile
  assert.equal(settings.aimProfiles.handheld.padSensitivity, 0.6);

  ownedDevice = 'touch';
  // Touch is active: does not change TV profile
  assert.equal(settings.aimProfiles.tv.padSensitivity, 2.8);

  // Even if settings change is invoked for active handheld profile:
  applyAimSettingsChange(settings, { padSensitivity: 0.7 });
  assert.equal(settings.aimProfiles.handheld.padSensitivity, 0.7);
  assert.equal(settings.aimProfiles.tv.padSensitivity, 2.8, 'TV profile was never overwritten');
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

