// Issue #439: the strict Splatoon 3 profile must not expose motion-axis
// inversion. Positive tests exercise the actual native settings path —
// Game._setSettings (extracted from src/main.js) -> MobileInput.applySettings
// (src/core/mobile.js) -> Gyro.configure / Gyro._orientation (src/core/gyro.js)
// — and the real composed Touch settings rows. Negative controls compose the
// same source without this adapter (`invert: false`) and prove the tests detect
// the root rather than passing on fixtures. No regex-only assertions drive the
// gyro sign conclusion and no helper is faked.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { adaptGyroInvert } from '../gyro-invert-adapter.mjs';
import { gyroSource, gyroFixture, section } from './gyro-fixture.mjs';

// Evaluate the real composed TOUCH_TAB block (literal data + native pctFmt/sgnFmt).
const touchKeys = (rel, options) => {
  const block = section(gyroSource(rel, options), 'const pctFmt', 'const SETTINGS_TABS');
  return vm.runInNewContext(block + '\nTOUCH_TAB', {}).rows.map(row => row.key);
};

test('gyro-invert adapter fails closed on missing, duplicated or reapplied anchors and passes unrelated modules through', () => {
  for (const rel of ['src/ui/menus.js', 'src/core/mobile.js']) {
    const before = gyroSource(rel, { invert: false });
    const after = adaptGyroInvert(rel, before);
    assert.notEqual(after, before);
    assert.throws(() => adaptGyroInvert(rel, ''), /gyro-invert anchor mismatch/);
    assert.throws(() => adaptGyroInvert(rel, before + before), /gyro-invert anchor mismatch/);
    assert.throws(() => adaptGyroInvert(rel, after), /gyro-invert anchor mismatch/);
  }
  for (const rel of ['src/config.js', 'src/core/gyro.js', 'src/main.js', 'src/ui/hud.js']) {
    assert.equal(adaptGyroInvert(rel, 'unchanged'), 'unchanged');
  }
});

test('Touch settings drop only the gyro axis-inversion rows; gyro aim, sensitivity and other controls stay', () => {
  const fixed = touchKeys('src/ui/menus.js');
  assert.ok(!fixed.includes('gyroInvertX') && !fixed.includes('gyroInvertY'), 'no gyro inversion rows in the composed UI');
  for (const key of ['gyro', 'gyroSens', 'touchSens', 'fireAim', 'stickMode', 'touchScale', 'touchOpacity', '_layout']) {
    assert.ok(fixed.includes(key), 'native row preserved: ' + key);
  }
  // Negative control: without the adapter the two rows are still exposed.
  const root = touchKeys('src/ui/menus.js', { invert: false });
  assert.ok(root.includes('gyroInvertX') && root.includes('gyroInvertY'), 'root-present control: rows exist without the fix');
  // Right-stick/mouse inversion is Splatoon-supported and independently owned (#309); it stays.
  const menus = gyroSource('src/ui/menus.js');
  assert.ok(menus.includes("{ key: 'invertY', label: 'Invert vertical look'"), 'mouse/pad vertical inversion row preserved');
});

test('persisted gyroInvertX/Y cannot reach the native Gyro while gyroSens still applies through the real settings path', async () => {
  const fixed = await gyroFixture();
  fixed.game._setSettings({ gyroInvertX: true, gyroInvertY: true, gyroSens: 2.5 });
  assert.equal(fixed.mob.gyro.sens, 2.5, 'negative control: native sensitivity still configured from settings');
  assert.equal(fixed.mob.gyro.invX, false, 'persisted horizontal inversion is inert');
  assert.equal(fixed.mob.gyro.invY, false, 'persisted vertical inversion is inert');

  const root = await gyroFixture({ invert: false });
  root.game._setSettings({ gyroInvertX: true, gyroInvertY: true, gyroSens: 2.5 });
  assert.equal(root.mob.gyro.invX, true, 'positive control: without the fix the persisted root flows');
  assert.equal(root.mob.gyro.invY, true, 'positive control: without the fix the persisted root flows');
});

test('yaw/pitch output with persisted inversion equals the no-inversion run; listener lifetime unchanged', async () => {
  const feed = f => {
    f.mob.gyro.start();
    for (let i = 0; i <= 10; i++) {
      f.mob.gyro._orientation({ alpha: i * 15, beta: 5, gamma: 2, timeStamp: 100 + i * 1000 / 60 });
    }
    return { yaw: f.mob.gyro.dYaw, pitch: f.mob.gyro.dPitch, listeners: f.sensorListeners() };
  };
  const plain = await gyroFixture({ permission: false });
  plain.game._setSettings({});
  const fixed = await gyroFixture({ permission: false });
  fixed.game._setSettings({ gyroInvertX: true, gyroInvertY: true });
  const a = feed(plain), b = feed(fixed);
  assert.ok(Number.isFinite(b.yaw) && Math.abs(b.yaw) > 0, 'native sensor path produced aim');
  assert.equal(b.yaw, a.yaw, 'native yaw unchanged with persisted inversion present');
  assert.equal(b.pitch, a.pitch, 'native pitch unchanged with persisted inversion present');
  assert.equal(b.listeners, a.listeners, 'gyro listener lifetime unchanged');

  const root = await gyroFixture({ permission: false, invert: false });
  root.game._setSettings({ gyroInvertX: true, gyroInvertY: true });
  const c = feed(root);
  assert.ok(c.yaw === -a.yaw, 'negative control: root flips the yaw sign');
  assert.ok(c.pitch === -a.pitch, 'negative control: root flips the pitch sign');
});
