// #725: DeviceMotion/DeviceOrientation gyro sensitivity through the full production composition
// (scripts/inkwave-source-composition.mjs adaptBuildSource), fed through the real deviceorientation
// entry point. Separates the raw sensitivity gain (public bridge endpoints 1:1 / 1.8:1 / 3:1) from the
// INKWAVE low-speed smoothing band (3-10 deg/s) and checks that the same physical rotation turns the
// same camera angle at 30 / 60 / 120 Hz and with an irregular sensor period.
// Logic-only evidence: no physical device, browser sensor timing or Switch hardware is measured here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => fs.readFileSync(file, 'utf8');
const D2R = Math.PI / 180;
// Public controller-bridge endpoints recorded in reference/curated-numbers.json camera.gyro.
const ENDPOINT_GAIN = { '-5': 1, '0': 1.8, '5': 3 };
// INKWAVE smoothing constants from inkwave-public/src/core/gyro.js (not Nintendo values).
const TAU = 0.06, DIRECT_FROM = 3, DIRECT_SPAN = 7;

test('#725 composed touch and controls help describe the active profile without obsolete gain claims', () => {
  const rel = 'src/ui/menus.js';
  const source = adaptBuildSource(rel, read(path.join(ROOT, 'inkwave-public', rel)));
  const rows = source.split('\n').filter(line => line.includes("key: 'gyroSens'"));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.match(row, /Motion-control aiming sensitivity for the selected profile\./);
    assert.doesNotMatch(row, /132°|110°|278°/);
  }
  const strings = read(path.join(ROOT, 'patches/splatoon3/runtime/ui-strings.mjs'));
  assert.ok(strings.includes("'Motion-control aiming sensitivity for the selected profile.':'選択中のモードのジャイロ感度です。'"));
});

async function composedGyro() {
  const context = vm.createContext({ console, performance: { now: () => 1 }, setTimeout: () => 1, clearTimeout() {},
    DeviceOrientationEvent: function () {}, DeviceMotionEvent: function () {}, navigator: { userAgent: 'iPad Safari' },
    window: { DeviceOrientationEvent: function () {}, DeviceMotionEvent: function () {} },
    addEventListener() {}, removeEventListener() {} });
  const rel = 'src/core/gyro.js', modules = new Map();
  const entry = new vm.SourceTextModule(adaptBuildSource(rel, read(path.join(ROOT, 'inkwave-public', rel))),
    { context, identifier: path.join(ROOT, 'inkwave-public', rel) });
  modules.set(entry.identifier, entry);
  await entry.link(async (spec, from) => {
    let file = path.resolve(path.dirname(from.identifier), spec);
    const publicPatches = path.join(ROOT, 'inkwave-public/patches');
    if (file.startsWith(publicPatches + '/')) file = path.join(ROOT, 'patches', path.relative(publicPatches, file));
    if (modules.has(file)) return modules.get(file);
    const text = spec === './device.js' ? 'export function screenAngle(){return 0;}' : read(file);
    const m = new vm.SourceTextModule(text, { context, identifier: file });
    modules.set(file, m);
    return m;
  });
  await entry.evaluate();
  return entry.namespace;
}
const ns = await composedGyro();

// Sample times (ms). Motion starts at 600 ms and stops at 1600 ms; both edges are sample times, so
// every interval sees one constant physical rate (zero-order hold) and all cadences share one rotation.
function cadence(hz) {
  const out = [];
  for (let i = 0; i <= Math.round(2.2 * hz); i++) out.push(100 + i * 1000 / hz);
  return out;
}
function jittered() {
  // Deterministic irregular period, 5-37 ms, as delivered by browsers under load.
  const pattern = [8, 16.7, 5, 33.3, 11, 24, 37, 9.5, 16.7, 13];
  const out = [100];
  for (let i = 0; out.at(-1) < 2300; i++) out.push(out.at(-1) + pattern[i % pattern.length]);
  return [...new Set([...out, 600, 1600])].sort((a, b) => a - b);
}
function turn(sens, rate, times, axis = 'pitch') {
  const g = new ns.Gyro();
  g.start();
  g.configure({ sens });
  const angle = t => rate * Math.max(0, Math.min(t, 1600) - 600) / 1000;
  for (const t of times) {
    const a = angle(t);
    // pitch: rotation about device x (beta) while flat; yaw: rotation about vertical (alpha) while flat.
    g._orientation({ timeStamp: t, alpha: axis === 'yaw' ? a : 0, beta: axis === 'pitch' ? 10 + a : 10, gamma: 0 });
  }
  return axis === 'yaw' ? g.dYaw : g.dPitch;
}
// Continuous first-order smoother with zero-order-hold input over the 1 s movement; the INKWAVE
// low-speed gate cuts the smoothed tail once the device stops (raw speed below 0.8 deg/s).
function expected(sens, rate) {
  const T = 1, u = rate * D2R, direct = Math.max(0, Math.min(1, (rate - DIRECT_FROM) / DIRECT_SPAN));
  return ENDPOINT_GAIN[sens] * u * (T - (1 - direct) * TAU * (1 - Math.exp(-T / TAU)));
}
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)), `${label}: ${got} vs ${want}`);

test('#725 composed gyro: raw gain above the smoothing band is exactly the -5 / 0 / +5 endpoint ratio', () => {
  for (const sens of [-5, 0, 5]) for (const rate of [12, 30, 90, 240]) for (const axis of ['pitch', 'yaw']) {
    const got = Math.abs(turn(sens, rate, cadence(60), axis));
    near(got / (rate * D2R), ENDPOINT_GAIN[sens], 1e-9, `sens ${sens} ${rate}deg/s ${axis}`);
  }
  assert.equal(ns.gyroTurnDeg(-5), 360);
  assert.equal(ns.gyroTurnDeg(0), 200);
  assert.equal(ns.gyroTurnDeg(5), 120);
});

test('#725 composed gyro: same physical rotation gives the same camera turn at 30 / 60 / 120 Hz and an irregular period', () => {
  const traces = { 30: cadence(30), 60: cadence(60), 120: cadence(120), jitter: jittered() };
  for (const sens of [-5, 0, 5]) for (const rate of [1, 2, 5, 8, 12, 90]) {
    const want = expected(sens, rate);
    for (const [name, times] of Object.entries(traces)) near(turn(sens, rate, times), want, 1e-9, `sens ${sens} ${rate}deg/s ${name}`);
  }
});

test('#725 low-speed smoothing is independent of the sensitivity gain', () => {
  for (const rate of [1, 5, 8]) {
    const ratio = sens => turn(sens, rate, cadence(30)) / ENDPOINT_GAIN[sens];
    near(ratio(-5), ratio(0), 1e-12, `${rate}deg/s -5 vs 0`);
    near(ratio(5), ratio(0), 1e-12, `${rate}deg/s +5 vs 0`);
    assert.ok(ratio(0) < rate * D2R, `${rate}deg/s is inside the smoothing band`);
  }
});
