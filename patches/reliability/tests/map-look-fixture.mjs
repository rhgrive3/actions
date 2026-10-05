// Real composed Input + PlayerController for the Turf Map gamepad look filter (#579).
// Input polling, the look filter and the map gate are production code; only display/collision are fixtures.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UP = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const { adaptSource } = await import(ROOT + '/patches/splatoon3/adapter.mjs');
const { adaptTouchLayout } = await import(ROOT + '/patches/touch-layout/adapter.mjs');
const { adaptMapLook } = await import(ROOT + '/patches/reliability/map-look.mjs');
const { fixture } = await import(ROOT + '/patches/splatoon3/tests/source-fixture.mjs');

export const HZ = [30, 60, 120, 144];
export const SENS = [0.2, 1, 3];
export const RIGHT = [0, 0, 1, 0];
export const NEUTRAL = [0, 0, 0, 0];

export async function saturated(patched, hz, padSensitivity, right = RIGHT) {
  const h = await boot({ patched, padSensitivity });
  h.setPads(pad(right));
  for (let i = 0; i < 240; i++) h.frame(1 / hz);
  return h;
}

// Load the vertical filter to ~1 while keeping rig.pitch clear of its clamp
// (240 frames drives pitch into clamp(rig.pitch, -1.05, 1.15), which would
// absorb a stale replay and hide it from the negative control).
export async function saturatedPitch(patched, hz, padSensitivity = 1) {
  const h = await boot({ patched, padSensitivity });
  h.setPads(pad([0, 0, 0, 1]));
  for (let i = 0; i < Math.max(3, Math.round(hz / 10)); i++) h.frame(1 / hz);
  return h;
}

// Every other production reliability adapter runs; only adaptMapLook is toggled, so the
// negative control stays available and real adapter drift cannot hide behind it.
const dispatcher = fs.readFileSync(ROOT + '/patches/reliability/adapter.mjs', 'utf8');
const order = dispatcher.match(/const adapters = \[([^\]]+)\]/)?.[1].split(',').map(s => s.trim());
const imports = new Map([...dispatcher.matchAll(/import \{ (\w+) \} from '(\.\/[^']+)';/g)].map(m => [m[1], m[2]]));
const preceding = [];
for (const name of order) {
  if (name === 'adaptMapLook') continue;
  assert.ok(imports.has(name), `actual dispatcher import ${name}`);
  const module = await import(new URL(imports.get(name), pathToFileURL(ROOT + '/patches/reliability/adapter.mjs')));
  preceding.push(module[name]);
}

export function composed(rel, patched = false) {
  let s = adaptTouchLayout(rel, adaptSource(rel, fs.readFileSync(path.join(UP, rel), 'utf8')));
  for (const adapt of preceding) s = adapt(rel, s);
  if (patched) s = adaptMapLook(rel, s);
  return s;
}

export const STEP = 1 / 60;

// A standard-mapping pad with explicit right-stick axes so the filter sees a known input.
export const pad = (axes = [0, 0, 0, 0], buttons = []) => [{
  connected: true, mapping: 'standard', axes: axes.slice(),
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
}];

export async function boot({ patched = true, padSensitivity = 1 } = {}) {
  const f = await fixture(), modules = new Map(), listeners = new Map();
  let pads = [];
  const cls = () => ({ add() {}, remove() {}, toggle() {} });
  const context = vm.createContext({
    console, performance, AbortController, setTimeout, clearTimeout,
    screen: { width: 1000, height: 700, orientation: { angle: 0 } }, innerWidth: 1000, innerHeight: 700,
    localStorage: { getItem: () => null },
    navigator: { userAgent: 'map look probe', maxTouchPoints: 0, getGamepads: () => pads },
    window: { addEventListener(n, fn) { listeners.set(n, [...(listeners.get(n) || []), fn]); } },
    document: { documentElement: { classList: cls() }, addEventListener() {}, pointerLockElement: null },
  });
  const synthetic = (id, v) => new vm.SyntheticModule(Object.keys(v), function () {
    for (const [n, x] of Object.entries(v)) this.setExport(n, x);
  }, { context, identifier: id });
  // Composed sources import patch runtime modules through the emitted tree (../../patches/...);
  // map those back onto this repository's patch directories, exactly as the build tree does.
  function resolveModule(spec, from) {
    if (spec === 'three') return 'three';
    const file = path.resolve(path.dirname(from), spec);
    return file.startsWith(path.join(UP, 'patches') + path.sep) ? path.join(ROOT, path.relative(UP, file)) : file;
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UP, file);
    let m;
    if (['src/core/ctx.js', 'src/config.js', 'src/game/physics.js'].includes(rel)) m = synthetic(file, f);
    else if (file === 'three') m = synthetic(file, { ...f.THREE });
    else m = new vm.SourceTextModule(file.startsWith(UP + path.sep) ? composed(rel, patched) : fs.readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, m); return m;
  }
  const entry = new vm.SourceTextModule(
    "export { Input } from './src/core/input.js'; export { PlayerController } from './src/game/player.js';",
    { context, identifier: path.join(UP, 'map-look-entry.js') });
  await entry.link((s, from) => load(resolveModule(s, from.identifier)));
  await entry.evaluate();
  const input = new entry.namespace.Input({});
  const actor = f.make('shooter');
  const rig = { yaw: 0, pitch: 0, mapK: 0 };
  const controller = new entry.namespace.PlayerController(actor, rig, input);
  controller.computeAim = () => {}; // camera-ray rendering is independent of look filtering
  f.G.settings = { aimAssist: 0, padSensitivity, invertY: false };
  f.G.rig = rig; f.G.actors = [actor]; f.G.time = 0;
  actor.canSuperJump = () => false;
  f.G.projectiles.update = () => {};

  return {
    ...f, input, actor, rig, controller,
    setPads(next) { pads = next; },
    frame(dt = STEP) { input.pollPad(); controller.update(dt); },
    openMap() { rig.mapK = 1; },
    closeMap() { rig.mapK = 0; },
  };
}

// #579 helpers. The suites live in map-look.test.mjs (filter regression),
// turf-map-look.test.mjs (map input ownership) and map-look-contract.test.mjs
// (build connection), so scripts/check-inkwave-patches.mjs discovers them.

// Open the Turf Map, centre the physical right stick and run one whole map
// second of frames: the pre-map filter state now has every chance to replay.
export const mapIdle = (h, hz) => { h.openMap(); h.setPads(pad(NEUTRAL)); for (let i = 0; i < hz; i++) h.frame(1 / hz); };

// Close the map and run `frames` gameplay frames, returning the camera angles
// from immediately before and after those frames. A stale replay shows up as
// before !== after; never compare a value against itself.
export function closeAndRun(h, hz, frames = 30) {
  h.closeMap();
  const before = { yaw: h.rig.yaw, pitch: h.rig.pitch };
  for (let i = 0; i < frames; i++) h.frame(1 / hz);
  return { before, after: { yaw: h.rig.yaw, pitch: h.rig.pitch } };
}