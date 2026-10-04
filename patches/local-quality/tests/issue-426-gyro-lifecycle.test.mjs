// Focused native regression for issue #426: gyro sensor listeners must stop on
// menu transitions while the saved preference/permission survive, then restart
// exactly once for the next live match. Uses the real native Gyro class and
// the composed main.js _onScreen wiring (no mocks of nonexistent APIs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptGyroLifecycle } from '../issue-426-gyro-lifecycle.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => fs.readFileSync(new URL(rel, new URL('../../../', import.meta.url)), 'utf8');
const compose = (rel, code = fs.readFileSync(`${ROOT}/inkwave-public/${rel}`, 'utf8')) =>
  adaptGyroLifecycle(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

function listenerCounts() {
  const counts = { orientation: 0, motion: 0 };
  const added = [];
  const globals = {
    window: {},
    addEventListener: (t) => { added.push(['add', t]); if (t === 'deviceorientation') counts.orientation++; if (t === 'devicemotion') counts.motion++; },
    removeEventListener: (t) => { added.push(['remove', t]); if (t === 'deviceorientation') counts.orientation--; if (t === 'devicemotion') counts.motion--; },
    performance: { now: () => 0 },
  };
  return { counts, added, globals };
}

async function loadGyro({ baseline = false, globals }) {
  const rel = 'src/core/gyro.js';
  const raw = fs.readFileSync(`${ROOT}/inkwave-public/${rel}`, 'utf8');
  const code = baseline ? raw : compose(rel, raw);
  const context = vm.createContext({ console, ...globals });
  const deviceCode = fs.readFileSync(`${ROOT}/inkwave-public/src/core/device.js`, 'utf8');
  const deviceMod = new vm.SourceTextModule(deviceCode, { context, identifier: 'device.js' });
  await deviceMod.link(() => { throw new Error('no transitive imports expected'); });
  await deviceMod.evaluate();
  const mod = new vm.SourceTextModule(code.replace(`from './device.js'`, `from 'device.js'`), { context, identifier: 'gyro.mjs' });
  await mod.link((spec) => (spec === 'device.js' ? deviceMod : Promise.reject(new Error(`unexpected import ${spec}`))));
  await mod.evaluate();
  return mod.namespace;
}

test('patched adapter wires suspendForMenu + _onScreen stop exactly once', () => {
  const gyro = compose('src/core/gyro.js');
  assert.match(gyro, /suspendForMenu\(\)/);
  const main = compose('src/main.js');
  assert.match(main, /mob\.gyro\?\.suspendForMenu\?\.\(\)/);
  assert.match(main, /_suspendGyroForMenu\(\)/);
  assert.throws(() => compose('src/core/gyro.js', gyro), /anchor mismatch/);
});

test('negative control: baseline Gyro has no suspendForMenu and _onScreen only discards', () => {
  const gyro = fs.readFileSync(`${ROOT}/inkwave-public/src/core/gyro.js`, 'utf8');
  assert.doesNotMatch(gyro, /suspendForMenu/);
  const main = compose('src/main.js');
  const baselineMain = adaptReliability('src/main.js', adaptTouchLayout('src/main.js', adaptSource('src/main.js', fs.readFileSync(`${ROOT}/inkwave-public/src/main.js`, 'utf8'))));
  assert.match(baselineMain, /mob\.gyro\?\.discard\?\.\(\)/);
  assert.doesNotMatch(baselineMain, /suspendForMenu/);
  void main;
});

test('native Gyro: suspendForMenu stops listeners, keeps granted, clears deltas', async () => {
  const { counts, globals } = listenerCounts();
  const { Gyro } = await loadGyro({ globals });
  const g = new Gyro();
  g.supported = true;
  g.granted = true;
  g.start();
  assert.equal(g.enabled, true);
  assert.deepEqual([counts.orientation, counts.motion], [1, 1]);
  g.dYaw = 1.5; g.dPitch = -0.7; g._hasQ = true;
  const stopped = g.suspendForMenu();
  assert.equal(stopped, true);
  assert.equal(g.enabled, false);
  assert.deepEqual([counts.orientation, counts.motion], [0, 0]);
  assert.equal(g.dYaw, 0);
  assert.equal(g.dPitch, 0);
  assert.equal(g._hasQ, false);
  // Preference/permission state is untouched by the helper.
  assert.equal(g.granted, true);
  // Idempotent: second call is a no-op resync, never drives counts negative.
  assert.equal(g.suspendForMenu(), false);
  assert.deepEqual([counts.orientation, counts.motion], [0, 0]);
});

test('native Gyro: restart after menu restarts exactly one listener pair with clean baseline', async () => {
  const { counts, globals } = listenerCounts();
  const { Gyro } = await loadGyro({ globals });
  const g = new Gyro();
  g.supported = true;
  g.granted = true;
  g.start();
  g.suspendForMenu();
  g.start();
  assert.equal(g.enabled, true);
  assert.deepEqual([counts.orientation, counts.motion], [1, 1]);
  assert.equal(g.dYaw, 0);
  assert.equal(g.dPitch, 0);
  // Repeated match->menu->match cycles never stack listeners.
  g.suspendForMenu(); g.start(); g.suspendForMenu(); g.start();
  assert.deepEqual([counts.orientation, counts.motion], [1, 1]);
});

test('native Gyro.stop keeps existing granted flag (no permission reset)', async () => {
  const { globals } = listenerCounts();
  const { Gyro } = await loadGyro({ globals });
  const g = new Gyro();
  g.supported = true;
  g.granted = true;
  g.start();
  g.stop();
  assert.equal(g.granted, true);
  assert.equal(g.enabled, false);
});
