import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

// #725: gyro gain endpoints. Ratios are output:input from the public controller-bridge footnote
// (DamianS-eng/GTuner-TitanTwo, footnote 2): 1:1 at the lowest in-game motion setting, about 1.8:1
// at default, 3:1 at the highest. Game version and measurement method are not stated there, so the
// intermediate settings (-2.5, +2.5) are NOT asserted here; they stay linear between verified points.
const publicRoot = process.env.INKWAVE_UPSTREAM_SOURCE
  ? pathToFileURL(process.env.INKWAVE_UPSTREAM_SOURCE + '/')
  : new URL('../../../inkwave-public/', import.meta.url);
const upstream = fs.readFileSync(new URL('src/core/gyro.js', publicRoot), 'utf8');

async function loadGyro(code) {
  const stubbed = code.replace("import { screenAngle } from './device.js';", 'const screenAngle = () => 0;');
  assert.notEqual(stubbed, code, 'device.js import stub applied');
  return import('data:text/javascript;base64,' + Buffer.from(stubbed).toString('base64'));
}

const gyro = await loadGyro(adaptSource('src/core/gyro.js', upstream));

// Feed a constant yaw rate directly into the sample stage (about the vertical axis, device held upright).
// Rates of 90 deg/s are far above the soft smoothing thresholds, so this isolates the raw sensitivity gain.
function integrateYaw(sens, hz, seconds, degPerSec) {
  const g = new gyro.Gyro();
  g.sens = sens;
  const w = degPerSec * Math.PI / 180;
  const n = Math.round(seconds * hz);
  for (let i = 0; i < n; i++) g._sample(0, 0, w, 1 / hz);
  return g.dYaw;
}

test('#725 sensitivity endpoints give the public Splatoon 3 bridge gains (1:1, 1.8:1, 3:1)', () => {
  const gain = (sens) => 360 / gyro.gyroTurnDeg(sens);
  assert.ok(Math.abs(gain(-5) - 1.0) < 1e-9, `-5 gain ${gain(-5)}`);
  assert.ok(Math.abs(gain(0) - 1.8) < 1e-9, `0 gain ${gain(0)}`);
  assert.ok(Math.abs(gain(5) - 3.0) < 1e-9, `+5 gain ${gain(5)}`);
  assert.equal(gyro.gyroTurnDeg(-9), 360, 'below -5 clamps to the lowest endpoint');
  assert.equal(gyro.gyroTurnDeg(9), 120, 'above +5 clamps to the highest endpoint');
});

test('#725 gain rises monotonically across the whole slider and never exceeds the 3:1 maximum', () => {
  let prev = -Infinity;
  for (let s = -5; s <= 5; s += 0.25) {
    const gain = 360 / gyro.gyroTurnDeg(s);
    assert.ok(gain >= prev - 1e-12, `gain decreased at ${s}`);
    assert.ok(gain <= 3 + 1e-9, `gain ${gain} above 3:1 at ${s}`);
    prev = gain;
  }
});

test('#725 sustained 90 deg/s yaw integrates to the endpoint ratio at -5, 0 and +5', () => {
  const seconds = 2, rate = 90; // 180 device degrees
  const physical = rate * seconds * Math.PI / 180;
  assert.ok(Math.abs(integrateYaw(-5, 60, seconds, rate) / physical - 1.0) < 1e-9);
  assert.ok(Math.abs(integrateYaw(0, 60, seconds, rate) / physical - 1.8) < 1e-9);
  assert.ok(Math.abs(integrateYaw(5, 60, seconds, rate) / physical - 3.0) < 1e-9);
});

test('#725 30 / 60 / 120 Hz synthetic traces integrate to the same turn for the same physical rotation', () => {
  for (const sens of [-5, 0, 5]) {
    const ref = integrateYaw(sens, 60, 2, 90);
    for (const hz of [30, 120]) {
      const got = integrateYaw(sens, hz, 2, 90);
      assert.ok(Math.abs(got - ref) < 1e-9 * Math.max(1, Math.abs(ref)), `sens ${sens} at ${hz} Hz: ${got} vs ${ref}`);
    }
  }
});
