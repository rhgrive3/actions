import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptInput } from '../input-adapter.mjs';
import { adaptNet } from '../net-adapter.mjs';
import { adaptResults } from '../results-adapter.mjs';
import { adaptMobile } from '../mobile-adapter.mjs';
import { adaptTouchEdges } from '../touch-edge-adapter.mjs';
import { adaptIntro } from '../intro-adapter.mjs';
import { adaptStart } from '../start-adapter.mjs';
import { adaptAttract } from '../attract-adapter.mjs';
import { adaptHud } from '../hud-adapter.mjs';
import { adaptGyro } from '../gyro-adapter.mjs';
import { adaptGyroInvert } from '../gyro-invert-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE_ROOT = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const PRECEDING = [adaptInput, adaptNet, adaptResults, adaptMobile, adaptTouchEdges, adaptIntro, adaptStart, adaptAttract, adaptHud];
export function gyroSource(rel, { before = false, invert = true } = {}) {
  let code = adaptTouchLayout(rel, adaptSource(rel, fs.readFileSync(path.join(SOURCE_ROOT, rel), 'utf8')));
  for (const adapt of PRECEDING) code = adapt(rel, code);
  if (!before) code = adaptGyro(rel, code);
  if (!before && invert) code = adaptGyroInvert(rel, code);
  return code;
}
export function section(code, start, end) {
  const at = code.indexOf(start), until = code.indexOf(end, at);
  assert.ok(at >= 0 && until > at, start);
  return code.slice(at, until);
}
export async function drain() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

// Full composed Gyro and MobileInput modules; real settings/start methods and boot
// callback. Permission APIs, DOM nodes and timers are deterministic platform fixtures.
// This is lifetime evidence, not browser user activation or physical sensor evidence.
export async function gyroFixture({ before = false, permission = true, supported = true, motion = false, invert = true } = {}) {
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
  const nativeRequest = kind => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    asks.push({ kind, resolve, reject }); events.push('request:' + kind);
    return promise;
  };
  const window = {};
  if (supported) window.DeviceOrientationEvent = permission ? { requestPermission: () => nativeRequest('orientation') } : {};
  if (motion) window.DeviceMotionEvent = permission ? { requestPermission: () => nativeRequest('motion') } : {};
  const storage = new Map();
  const G = { mode: 'match' };
  const context = vm.createContext({
    Promise, console, window, document: { documentElement: { classList: new Classes(), lang: 'en' } },
    AbortController, performance: { now: () => 1000 },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    addEventListener(type, fn) { const all = listeners.get(type) || new Set(); all.add(fn); listeners.set(type, all); events.push('listen:' + type); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); events.push('remove:' + type); },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    G, t: value => value, saveJSON: (_key, settings) => saves.push({ ...settings }),
  });
  const module = code => new vm.SourceTextModule(code, { context });
  const device = module('export const touchPrimary=false,touchCapable=false; export const screenAngle=()=>0;');
  const gyro = module(gyroSource('src/core/gyro.js', { before, invert }));
  await gyro.link(() => device); await gyro.evaluate();
  const i18n = module('export const t=value=>value;');
  const icons = module("export const WEAPON_ICONS={},SUB_ICONS={},SQUID='',specialIcon=()=>'';");
  const mobile = module(gyroSource('src/core/mobile.js', { before, invert }));
  await mobile.link(spec => ({ './gyro.js': gyro, './device.js': device, '../i18n.js': i18n, '../ui/ui-icons.js': icons })[spec]);
  await mobile.evaluate();
  const mob = new mobile.namespace.MobileInput({}, {});
  mob.toastEl = element(); mob.els = { gyro: element() };
  const main = gyroSource('src/main.js', { before, invert });
  const settings = section(main, '  _setSettings(partial) {', '  _applyAudioVolumes()');
  const starts = section(main, '  _prepareGyro() {', '\n}\n\ninstallGame(Game);');
  const Game = vm.runInContext('(class {' + settings + starts + '})', context);
  const game = Object.assign(new Game(), {
    settings: { gyro: false }, input: { mobile: mob }, match: { state: 'playing' },
    menus: { refreshSetting(key) { events.push('refresh:' + key); } },
  });
  // Invoke the unchanged boot assignment with the actual Game receiver.
  vm.runInContext('(function(mob) {' + section(main, '      mob.onGyroToggle = (on) => {', '\n    }\n    // after a focus steal') + '})', context).call(game, mob);
  return { mob, game, G, asks, events, saves, timers, listeners, gyro: gyro.namespace, context,
    notice() { return [...timers.values()].find(timer => timer.ms === 1500); },
    sensorListeners() { return [...listeners.values()].reduce((sum, all) => sum + all.size, 0); },
  };
}
