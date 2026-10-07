// #615: Splatoon 3-style stationary gyro stability calibration.
// A small trusted constant raw-rate offset must converge while the device is
// held still; deliberate aiming must never be learned as bias; rrA/rrB and
// 30/60/90/120 Hz traces must behave equivalently. Thresholds here are
// engineering fixtures, NOT unpublished Nintendo calibration constants.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

const D2R = Math.PI / 180;
const GAIN = 360 / 132;                 // sensitivity 0: 132 device degrees per in-game 360°

async function makeGyro() {
  const context = vm.createContext({
    console,
    performance: { now: () => 1 },
    navigator: { userAgent: 'iPhone' },
    isSecureContext: true,
    DeviceOrientationEvent: function () {},
    DeviceMotionEvent: function () {},
    window: { DeviceOrientationEvent: function () {}, DeviceMotionEvent: function () {} },
    setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, __angle: 0,
  });
  const entry = new vm.SourceTextModule(compose('src/core/gyro.js'), { context, identifier: 'src/core/gyro.js' });
  await entry.link(async spec => {
    if (spec === './device.js') return new vm.SourceTextModule('export function screenAngle(){return globalThis.__angle||0;}', { context, identifier: 'src/core/device.js' });
    if (spec === '../../patches/local-quality/gyro.mjs') return new vm.SourceTextModule(read('patches/local-quality/gyro.mjs'), { context, identifier: 'patches/local-quality/gyro.mjs' });
    if (spec === './platform-lifecycle.mjs') return new vm.SourceTextModule(read('patches/local-quality/platform-lifecycle.mjs'), { context, identifier: 'patches/local-quality/platform-lifecycle.mjs' });
    if (spec === '../../patches/local-quality/screen-angle.mjs') return new vm.SourceTextModule(read('patches/local-quality/screen-angle.mjs'), { context, identifier: 'patches/local-quality/screen-angle.mjs' });
    if (spec === './gyro-permission.mjs') return new vm.SourceTextModule(read('patches/local-quality/gyro-permission.mjs'), { context, identifier: 'patches/local-quality/gyro-permission.mjs' });
    throw new Error('unexpected import ' + spec);
  });
  await entry.evaluate();
  const g = new entry.namespace.Gyro();
  g.start();
  assert.equal(g.enabled, true, 'gyro must start for the stationary trace');
  return g;
}

// One simulated sensor frame. Rates are deg/s; attitude rotates about the
// device x axis (beta) at attRate, the raw rotationRate reports rate on the
// chosen axis. axis 'beta' calibrates rrA, axis 'alpha' calibrates rrB.
function frame(g, st, hz, { attRate, rate, axis }) {
  const dtMs = 1000 / hz;
  st.t += dtMs;
  st.beta += attRate * (dtMs / 1000);
  const rotationRate = { alpha: 0, beta: 0, gamma: 0 };
  rotationRate[axis] = rate;
  g._orientation({ timeStamp: st.t, alpha: 0, beta: st.beta, gamma: 0 });
  g._motion({ timeStamp: st.t, rotationRate });
  return g.consume({});
}

const newSt = () => ({ t: 100, beta: 25 });

// Promote the raw source with real turns about the chosen axis, then ramp
// smoothly down to stillness. The raw channel always reports attitude rate +
// a constant 0.7 deg/s zero-rate offset, and every rate change is gradual
// enough that the existing one-frame source-trust window stays satisfied.
function trace(g, st, hz, axis, seconds, rateAt, offset = 0.7, onSample = null) {
  const n = Math.round(seconds * hz);
  const out = { yaw: 0, pitch: 0 };
  for (let i = 0; i < n; i++) {
    const att = rateAt(i / hz);
    const d = frame(g, st, hz, { attRate: att, rate: att + offset, axis });
    out.yaw += d.yaw; out.pitch += d.pitch;
    onSample?.(i, d);
  }
  return out;
}

const lerpRate = (from, to, seconds) => t => from + (to - from) * Math.min(1, t / seconds);

function promote(g, st, hz, axis, turnDegPerSec = 72) {
  trace(g, st, hz, axis, 1, () => turnDegPerSec);           // raw-source calibration turn
  trace(g, st, hz, axis, 4, lerpRate(turnDegPerSec, 0.1, 4)); // ramp to stillness
}

// Stationary window with a constant raw zero-rate offset: the apparent
// attitude wander (attRate) plus the sensor offset ride on the raw channel
// the same way a real still device reports them.
function stationary(g, st, hz, seconds, { offset = 0.7, attRate = 0.1, axis = 'beta' } = {}) {
  let early = { yaw: 0, pitch: 0 }, late = { yaw: 0, pitch: 0 };
  const total = Math.round(seconds * hz), lateFrom = Math.round((seconds - 5) * hz);
  for (let i = 0; i < total; i++) {
    const d = frame(g, st, hz, { attRate, rate: attRate + offset, axis });
    if (i < 3 * hz) { early.yaw += d.yaw; early.pitch += d.pitch; }
    if (i >= lateFrom) { late.yaw += d.yaw; late.pitch += d.pitch; }
  }
  return { early, late };
}

const rate = s => (Math.abs(s.yaw) + Math.abs(s.pitch));

test('#615 stationary raw-rate offset drifts at first, then converges to near-zero camera velocity', async () => {
  const g = await makeGyro();
  const st = newSt();
  promote(g, st, 60, 'beta');
  assert.equal(g._src, 'rrA', 'axis/unit calibration must adopt the raw source');
  const { early, late } = stationary(g, st, 60, 45);
  const earlyRate = rate(early) / 3;
  const lateRate = rate(late) / 5;
  assert.ok(earlyRate > 0.02, `synthetic offset must drift first: ${earlyRate} rad/s`);
  assert.ok(lateRate < 0.0009, `stationary period must converge the camera velocity: ${lateRate} rad/s`);
  assert.equal(g._src, 'rrA', 'raw-source retention (#595) must survive the stationary window');
});

test('#615 a real turn right after calibration keeps its full response and sensitivity', async () => {
  const g = await makeGyro();
  const st = newSt();
  promote(g, st, 60, 'beta');
  stationary(g, st, 60, 8);
  trace(g, st, 60, 'beta', 4, lerpRate(0.1, 72, 4));        // ramp into the turn
  const turn = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 30; i++) {                 // 72°/s for 0.5 s = 36 device degrees
    const d = frame(g, st, 60, { attRate: 72, rate: 72.7, axis: 'beta' });
    turn.yaw += d.yaw; turn.pitch += d.pitch;
  }
  const expected = 36 * D2R * GAIN;
  assert.ok(Math.abs(turn.pitch) > expected * 0.9 && Math.abs(turn.pitch) < expected * 1.05,
    `turn response ${turn.pitch} must stay within 90-105% of ${expected}`);
  assert.ok(Math.abs(turn.yaw) < 0.05, `turn must not invent yaw: ${turn.yaw}`);
});

test('#615 slow deliberate aiming is never learned as bias', async () => {
  const g = await makeGyro();
  const st = newSt();
  promote(g, st, 60, 'beta');
  stationary(g, st, 60, 8);
  trace(g, st, 60, 'beta', 1, lerpRate(0.1, 5, 1));         // ramp into the aim
  let pitch = 0;
  for (let i = 0; i < 180; i++) {                // 5 deg/s deliberate aim for 3 s
    const d = frame(g, st, 60, { attRate: 5, rate: 5.7, axis: 'beta' });
    pitch += d.pitch;
  }
  const expected = 15 * D2R * GAIN;              // 15 device degrees over the aim
  assert.ok(Math.abs(pitch) > expected * 0.9 && Math.abs(pitch) < expected * 1.1,
    `slow aim ${pitch} must keep its response (${expected})`);
  const bias = g._qualityGyro?.bias;
  assert.ok(bias, 'stationary calibration state must exist');
  assert.ok(Math.hypot(...bias) < 0.02, `bias must not creep while aiming: ${bias}`);
});

test('#615 stationary convergence is equivalent at 30/60/90/120 Hz', async () => {
  const rates = [];
  for (const hz of [30, 60, 90, 120]) {
    const g = await makeGyro();
    const st = newSt();
    promote(g, st, hz, 'beta');
    const { late } = stationary(g, st, hz, 20);
    rates.push(rate(late) / 5);
  }
  for (const r of rates) assert.ok(r < 0.0009, `per-second drift must converge at every rate: ${rates}`);
  assert.ok(Math.max(...rates) - Math.min(...rates) < 0.0005, `equivalent convergence: ${rates}`);
});

test('#615 rrA and rrB pass the same stationary bias test', async () => {
  for (const axis of ['beta', 'alpha']) {
    const g = await makeGyro();
    const st = newSt();
    promote(g, st, 60, axis);
    assert.equal(g._src, axis === 'beta' ? 'rrA' : 'rrB');
    const { early, late } = stationary(g, st, 60, 30, { axis });
    assert.ok(rate(early) / 3 > 0.02, `${axis}: offset must drift first: ${rate(early) / 3}`);
    assert.ok(rate(late) / 5 < 0.0009, `${axis}: must converge: ${rate(late) / 5}`);
  }
});

test('#615 resync (screen change / suspend / restart) resets the learned bias', async () => {
  const g = await makeGyro();
  const st = newSt();
  promote(g, st, 60, 'beta');
  stationary(g, st, 60, 20);
  const bias = g._qualityGyro?.bias;
  assert.ok(bias && Math.hypot(...bias) > 0.005, 'bias must have been learned while still');
  g.resync();
  assert.deepEqual([...g._qualityGyro.bias], [0, 0, 0], 'resync must clear the learned bias');
});

test('#615 deliberate aiming below the stillness threshold retains the native attitude response', async () => {
  const g = await makeGyro(), reference = await makeGyro();
  const st = newSt(), referenceSt = newSt();
  promote(g, st, 60, 'beta');
  stationary(g, st, 60, 8);
  let actual = 0, expected = 0;
  for (let i = 0; i < 1200; i++) {
    const sample = frame(g, st, 60, { attRate: 0.2, rate: 0.9, axis: 'beta' });
    const control = frame(reference, referenceSt, 60, { attRate: 0.2, rate: 0.2, axis: 'beta' });
    if (i >= 900) { actual += sample.pitch; expected += control.pitch; }
  }
  assert.equal(reference._src, 'ori', 'control uses native attitude integration');
  assert.ok(Math.abs(expected) > 0.001, 'slow native aiming control remains observable');
  assert.ok(actual / expected > 0.9 && actual / expected < 1.1,
    `calibration must preserve slow motion: raw ${actual}, attitude ${expected}`);
});
