import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptGyro } from '../gyro-adapter.mjs';
import { gyroSource, gyroFixture, drain, section } from './gyro-fixture.mjs';

const DENIED = 'Gyro permission was denied. Allow motion access in Safari settings.';
const UNAVAILABLE = 'Gyro is not available on this device.';

test('gyro adapter fails closed on missing, duplicated or reapplied anchors for all target modules', () => {
  for (const rel of ['src/main.js', 'src/core/mobile.js', 'src/core/gyro.js']) {
    const before = gyroSource(rel, { before: true }), after = adaptGyro(rel, before);
    assert.notEqual(after, before);
    assert.throws(() => adaptGyro(rel, ''), /gyro anchor mismatch/);
    assert.throws(() => adaptGyro(rel, before + before), /gyro anchor mismatch/);
    assert.throws(() => adaptGyro(rel, after), /gyro anchor mismatch/);
  }
  assert.equal(adaptGyro('src/config.js', 'unchanged'), 'unchanged');
});

test('negative controls reproduce all three confirmed older permission failures', async () => {
  const a = await gyroFixture({ before: true });
  a.game._setSettings({ gyro: true }); a.game._setSettings({ gyro: false });
  a.asks[0].resolve('granted'); await drain();
  assert.equal(a.game.settings.gyro, false); assert.equal(a.mob.gyro.enabled, true);
  const b = await gyroFixture({ before: true });
  const pending = b.mob.setGyro(true); b.mob.setGyro(false);
  b.asks[0].resolve('granted'); await pending;
  assert.equal(b.mob.gyro.enabled, true);
  const c = await gyroFixture({ before: true }); c.G.mode = 'menu';
  c.game._setSettings({ gyro: true }); c.game._setSettings({ gyro: false }); c.game._setSettings({ gyro: true });
  c.asks[1].resolve('granted'); await drain(); c.asks[0].resolve('denied'); await drain();
  assert.equal(c.game.settings.gyro, false); assert.equal(c.mob.toastEl.textContent, DENIED);
  assert.equal(c.mob.gyro.granted, false);
});

test('settings ON then OFF cancels late grant without starting listeners or showing stale denial', async () => {
  for (const answer of ['granted', 'denied']) {
    const f = await gyroFixture();
    f.game._setSettings({ gyro: true });
    assert.equal(f.asks.length, 1, 'native request happens before the settings call returns');
    f.game._setSettings({ gyro: false }); f.asks[0].resolve(answer); await drain();
    assert.equal(f.game.settings.gyro, false); assert.equal(f.saves.at(-1).gyro, false);
    assert.equal(f.mob.gyro.enabled, false); assert.equal(f.mob.s.gyro, false);
    assert.equal(f.sensorListeners(), 0); assert.equal(f.mob.toastEl.textContent, undefined);
  }
});

test('explicit Mobile disable invalidates its older enable continuation', async () => {
  const f = await gyroFixture();
  const pending = f.mob.setGyro(true); assert.equal(f.asks.length, 1);
  await f.mob.setGyro(false); f.asks[0].resolve('granted');
  assert.equal(await pending, false);
  assert.equal(f.mob.gyro.enabled, false); assert.equal(f.mob.s.gyro, false); assert.equal(f.sensorListeners(), 0);
});

test('latest settings ON owns older grant and denial delivered in either order', async () => {
  for (const old of ['granted', 'denied']) for (const oldFirst of [false, true]) for (const mode of ['menu', 'match']) {
    const f = await gyroFixture(); f.G.mode = mode;
    f.game._setSettings({ gyro: true }); f.game._setSettings({ gyro: false }); f.game._setSettings({ gyro: true });
    if (oldFirst) { f.asks[0].resolve(old); await drain(); }
    f.asks[1].resolve('granted'); await drain();
    if (!oldFirst) { f.asks[0].resolve(old); await drain(); }
    assert.equal(f.game.settings.gyro, true); assert.equal(f.saves.at(-1).gyro, true);
    assert.equal(f.mob.gyro.granted, true); assert.equal(f.mob.s.gyro, true);
    assert.equal(f.mob.gyro.enabled, mode === 'match'); assert.equal(f.mob.toastEl.textContent, undefined);
    assert.equal(f.sensorListeners(), mode === 'match' ? 2 : 0);
  }
});

test('latest denial remains authoritative after an older grant', async () => {
  const f = await gyroFixture();
  f.game._setSettings({ gyro: true }); f.game._setSettings({ gyro: false }); f.game._setSettings({ gyro: true });
  f.asks[1].resolve('denied'); await drain(); f.asks[0].resolve('granted'); await drain();
  assert.equal(f.game.settings.gyro, false); assert.equal(f.mob.gyro.granted, false);
  assert.equal(f.mob.gyro.enabled, false); assert.equal(f.mob.toastEl.textContent, DENIED);
});

test('quick second tap cancels pending first tap and saves OFF once without stale toast', async () => {
  const f = await gyroFixture();
  f.mob._toggleGyroFromTap(); assert.equal(f.asks.length, 1);
  f.mob._toggleGyroFromTap(); await drain();
  assert.equal(f.asks.length, 1); assert.equal(f.mob.toastEl.textContent, 'Gyro OFF');
  f.asks[0].resolve('granted'); await drain();
  assert.equal(f.mob.gyro.enabled, false); assert.equal(f.game.settings.gyro, false);
  assert.equal(f.saves.length, 1); assert.equal(f.mob.toastEl.textContent, 'Gyro OFF');
});

test('quick ON→OFF→ON preserves latest grant despite late older denial', async () => {
  const f = await gyroFixture();
  f.mob._toggleGyroFromTap(); f.mob._toggleGyroFromTap(); f.mob._toggleGyroFromTap();
  f.asks[1].resolve('granted'); await drain(); f.asks[0].resolve('denied'); await drain();
  assert.equal(f.mob.gyro.enabled, true); assert.equal(f.mob.gyro.granted, true);
  assert.equal(f.game.settings.gyro, true); assert.equal(f.mob.toastEl.textContent, 'Gyro ON');
  assert.equal(f.saves.length, 1); assert.equal(f.notice().ms, 1500);
});

test('settings and quick taps share one intent owner in both directions', async () => {
  const a = await gyroFixture();
  a.game._setSettings({ gyro: true }); a.mob._toggleGyroFromTap(); await drain();
  a.asks[0].resolve('granted'); await drain();
  assert.equal(a.game.settings.gyro, false); assert.equal(a.mob.gyro.enabled, false);
  const b = await gyroFixture();
  b.mob._toggleGyroFromTap(); b.game._setSettings({ gyro: false });
  b.asks[0].resolve('granted'); await drain();
  assert.equal(b.game.settings.gyro, false); assert.equal(b.mob.gyro.enabled, false);
  assert.equal(b.mob.toastEl.textContent, undefined); assert.equal(b.saves.length, 1);
});

test('destroy invalidates direct, settings and tap requests and makes future enables inert', async () => {
  for (const kind of ['direct', 'settings', 'tap']) {
    const f = await gyroFixture();
    if (kind === 'direct') f.mob.setGyro(true);
    if (kind === 'settings') f.game._setSettings({ gyro: true });
    if (kind === 'tap') f.mob._toggleGyroFromTap();
    const saved = f.saves.length;
    f.mob.root = { remove() { this.removed = true; } };
    f.mob.destroy(); f.asks[0].resolve('granted'); await drain();
    assert.equal(f.mob.gyro.enabled, false); assert.equal(f.mob.s.gyro, false); assert.equal(f.sensorListeners(), 0);
    assert.equal(f.mob.root.removed, true); assert.equal(f.mob._abort.signal.aborted, true);
    assert.equal(f.saves.length, saved); assert.equal(f.mob.toastEl.textContent, undefined);
    assert.equal(await f.mob.setGyro(true), false); f.mob._toggleGyroFromTap();
    assert.equal(f.asks.length, 1); assert.equal(f.timers.size, 0);
  }
});

test('obsolete Mobile cannot start after replacement or persist its old boot callback', async () => {
  const f = await gyroFixture();
  f.game._setSettings({ gyro: true });
  f.game.input.mobile = {}; f.asks[0].resolve('granted'); await drain();
  assert.equal(f.mob.gyro.enabled, false); assert.equal(f.saves.length, 1);
  f.mob.onGyroToggle(false);
  assert.equal(f.game.settings.gyro, true); assert.equal(f.saves.length, 1);
});

test('delayed sensor notice belongs to one live enable and keeps its 1500ms/2.6s timing', async () => {
  const f = await gyroFixture({ permission: false });
  f.mob._toggleGyroFromTap(); await drain();
  const old = f.notice(); assert.equal(old.ms, 1500);
  f.mob._toggleGyroFromTap(); await drain(); f.mob._toggleGyroFromTap(); await drain();
  old.fn(); assert.equal(f.mob.toastEl.textContent, 'Gyro ON');
  const current = f.notice(); current.fn();
  assert.equal(f.mob.toastEl.textContent, UNAVAILABLE);
  assert.ok([...f.timers.values()].some(timer => timer.ms === 2600));
  f.mob.destroy(); assert.equal(f.timers.size, 0);
  current.fn(); assert.equal(f.mob.toastEl.textContent, UNAVAILABLE);
  assert.equal(f.sensorListeners(), 0);
});

test('actual sensor samples suppress delayed notice; destroyed timer callback cannot toast', async () => {
  const f = await gyroFixture({ permission: false });
  f.mob._toggleGyroFromTap(); await drain(); const notice = f.notice();
  f.mob.gyro._orientation({ alpha: 0, beta: 0, gamma: 0, timeStamp: 100 });
  f.mob.gyro._orientation({ alpha: 2, beta: 0, gamma: 0, timeStamp: 116 });
  assert.equal(f.mob.gyro.working, true); notice.fn();
  assert.equal(f.mob.toastEl.textContent, 'Gyro ON');
  f.mob.destroy(); notice.fn(); assert.equal(f.mob.toastEl.textContent, 'Gyro ON');
});

test('ordinary delivered permission enables in match and denial retains existing toast/default', async () => {
  const a = await gyroFixture(); a.game._setSettings({ gyro: true });
  a.asks[0].resolve('granted'); await drain();
  assert.equal(a.game.settings.gyro, true); assert.equal(a.mob.gyro.enabled, true); assert.equal(a.sensorListeners(), 2);
  const b = await gyroFixture(); b.game._setSettings({ gyro: true });
  b.asks[0].resolve('denied'); await drain();
  assert.equal(b.game.settings.gyro, false); assert.equal(b.mob.gyro.enabled, false);
  assert.equal(b.mob.toastEl.textContent, DENIED); assert.ok([...b.timers.values()].some(timer => timer.ms === 3200));
  const c = await gyroFixture(); c.mob._toggleGyroFromTap(); c.asks[0].resolve('denied'); await drain();
  assert.equal(c.game.settings.gyro, false); assert.equal(c.mob.toastEl.textContent, DENIED);
});

test('menu permission accepts preference without listening; completion observes current match state', async () => {
  const f = await gyroFixture(); f.G.mode = 'menu'; f.game._setSettings({ gyro: true });
  f.asks[0].resolve('granted'); await drain();
  assert.equal(f.game.settings.gyro, true); assert.equal(f.mob.gyro.enabled, false); assert.equal(f.sensorListeners(), 0);
  f.G.mode = 'match'; f.game._startGyro(); await drain();
  assert.equal(f.mob.gyro.enabled, true); assert.equal(f.asks.length, 1);
  const other = await gyroFixture(); other.game._setSettings({ gyro: true }); other.G.mode = 'menu';
  other.asks[0].resolve('granted'); await drain();
  assert.equal(other.game.settings.gyro, true); assert.equal(other.sensorListeners(), 0);
});

test('prepare remains synchronous permission-only and its late grant after OFF cannot resurrect listeners', async () => {
  const f = await gyroFixture(); f.game.settings.gyro = true;
  f.game._prepareGyro(); assert.equal(f.asks.length, 1); assert.equal(f.sensorListeners(), 0);
  f.game._setSettings({ gyro: false }); f.asks[0].resolve('granted'); await drain();
  f.game._startGyro(); assert.equal(f.sensorListeners(), 0); assert.equal(f.game.settings.gyro, false);
  const a = await gyroFixture(); a.game.settings.gyro = true; a.game._prepareGyro();
  a.asks[0].resolve('granted'); await drain(); assert.equal(a.sensorListeners(), 0);
  a.game._startGyro(); assert.equal(a.sensorListeners(), 2);
  const b = await gyroFixture(); b.game.settings.gyro = true; b.game._startGyro();
  assert.equal(b.asks.length, 0); assert.equal(b.mob.toastEl.textContent, 'Tap GYRO to turn on gyro aim');
  assert.ok([...b.timers.values()].some(timer => timer.ms === 2400));
  b.mob.destroy(); b.game._prepareGyro(); b.game._startGyro(); assert.equal(b.asks.length, 0);
});

test('prepare older denial cannot undo later settings grant', async () => {
  const f = await gyroFixture(); f.game.settings.gyro = true; f.game._prepareGyro();
  f.game._setSettings({ gyro: true }); f.asks[1].resolve('granted'); await drain();
  f.asks[0].resolve('denied'); await drain();
  assert.equal(f.mob.gyro.granted, true); assert.equal(f.mob.gyro.enabled, true); assert.equal(f.game.settings.gyro, true);
});

test('no-permission and unsupported devices preserve normal states and availability toast', async () => {
  const f = await gyroFixture({ permission: false });
  assert.equal(f.mob.gyro.needsPermission, false); assert.equal(await f.mob.setGyro(true), true);
  assert.equal(f.mob.gyro.enabled, true); assert.equal(f.sensorListeners(), 2); assert.equal(f.asks.length, 0);
  await f.mob.setGyro(false); assert.equal(f.sensorListeners(), 0);
  const g = await gyroFixture({ supported: false }); g.game._setSettings({ gyro: true }); await drain();
  assert.equal(g.game.settings.gyro, false); assert.equal(g.mob.gyro.enabled, false);
  assert.equal(g.mob.toastEl.textContent, UNAVAILABLE); assert.equal(g.asks.length, 0);
  const settings = await gyroFixture({ permission: false });
  settings.game._setSettings({ gyro: true });
  assert.equal(settings.sensorListeners(), 0, 'settings keep their deferred completion without a prompt');
  await drain(); assert.equal(settings.sensorListeners(), 2);
});

test('orientation/motion permission calls stay synchronous and either grant still authorizes gyro', async () => {
  const f = await gyroFixture({ motion: true });
  const pending = f.mob.setGyro(true);
  assert.deepEqual(f.asks.map(ask => ask.kind), ['orientation', 'motion']);
  f.asks[0].reject(new Error('denied')); f.asks[1].resolve('granted');
  assert.equal(await pending, true); assert.equal(f.mob.gyro.granted, true); assert.equal(f.sensorListeners(), 2);
});

test('permission overlay leaves sensitivity and sensor processing byte-identical with equal numeric output', async () => {
  const before = gyroSource('src/core/gyro.js', { before: true }), after = gyroSource('src/core/gyro.js');
  assert.equal(section(before, 'const D2R', 'export class Gyro'), section(after, 'const D2R', 'export class Gyro'));
  assert.equal(before.slice(before.indexOf('  start() {')), after.slice(after.indexOf('  start() {')));
  for (const hz of [30, 60, 120]) {
    const a = await gyroFixture({ before: true, permission: false }), b = await gyroFixture({ permission: false });
    a.mob.gyro.start(); b.mob.gyro.start();
    for (const sens of [-5, -2.5, 0, 2.5, 5]) assert.equal(a.gyro.gyroTurnDeg(sens), b.gyro.gyroTurnDeg(sens));
    for (let i = 0; i <= hz; i++) {
      const sample = { alpha: i * 30 / hz, beta: 5, gamma: 2, timeStamp: 100 + i * 1000 / hz };
      a.mob.gyro._orientation(sample); b.mob.gyro._orientation(sample);
    }
    assert.equal(a.mob.gyro.dYaw, b.mob.gyro.dYaw); assert.equal(a.mob.gyro.dPitch, b.mob.gyro.dPitch);
    assert.ok(Number.isFinite(b.mob.gyro.dYaw) && Math.abs(b.mob.gyro.dYaw) > 0);
  }
});
