import test from 'node:test';
import assert from 'node:assert/strict';
import { gyroCapability, GyroPermission } from '../gyro-permission.mjs';
import { installGyroQuality } from '../gyro.mjs';
import { installMobilePlatform } from '../mobile-platform.mjs';
import { gyroFixture } from '../../reliability/tests/gyro-fixture.mjs';

const environment = policy => ({ isSecureContext: true, DeviceOrientationEvent: function () {},
  DeviceMotionEvent: function () {}, document: { permissionsPolicy: policy } });

test('either relative-sensor denial blocks permission before activation', async () => {
  for (const denied of ['accelerometer', 'gyroscope']) {
    const queried = [];
    const env = environment({ allowsFeature(name) { queried.push(name); return name !== denied; } });
    const access = new GyroPermission(env, { active: true, epoch: 0 });
    assert.equal(access.capability.supported, false);
    assert.equal(access.reason, 'permissions-policy');
    assert.equal(access.allowed, false);
    assert.equal(await access.request(), false);
    assert.equal(access.wanted, false);
    assert.deepEqual(queried, ['accelerometer', 'gyroscope']);
  }
});

test('allowed relative sensors do not require magnetometer', () => {
  const queried = [];
  const env = environment({ allowsFeature(name) { queried.push(name); return name !== 'magnetometer'; } });
  assert.equal(gyroCapability(env).supported, true);
  assert.deepEqual(queried, ['accelerometer', 'gyroscope']);
});

test('missing/throwing policy stays unknown but cannot mask another explicit denial', () => {
  for (const policy of [undefined, {}, { allowsFeature() { throw new Error('unknown'); } }]) {
    assert.equal(gyroCapability(environment(policy)).supported, true);
  }
  for (const throws of ['accelerometer', 'gyroscope']) {
    const env = environment({ allowsFeature(name) { if (name === throws) throw new Error('unknown'); return false; } });
    assert.equal(gyroCapability(env).reason, 'permissions-policy');
  }
  const env = environment(undefined);
  env.document.featurePolicy = { allowsFeature: name => name !== 'accelerometer' };
  assert.equal(gyroCapability(env).reason, 'permissions-policy');
});

test('actual Gyro/Mobile platform enable refuses blocked sensors and retains allowed control', async () => {
  for (const denied of ['accelerometer', 'gyroscope', null]) {
    const f = await gyroFixture({ permission: false, motion: true });
    const env = f.context;
    env.DeviceOrientationEvent = env.window.DeviceOrientationEvent;
    env.DeviceMotionEvent = env.window.DeviceMotionEvent;
    env.document.permissionsPolicy = { allowsFeature: name => name !== denied };
    const button = f.mob.els.gyro;
    button.dataset = {}; button.setAttribute = () => {}; button.addEventListener = () => {};
    f.mob.visible = true;
    installGyroQuality(f.gyro.Gyro, () => 0, () => true, env);
    installMobilePlatform(f.mob.constructor, env);
    const ok = await f.mob.setGyro(true);
    assert.equal(ok, denied === null);
    assert.equal(f.mob._gyroWanted, denied === null);
    assert.equal(f.mob.s.gyro, denied === null);
    assert.equal(f.mob.gyro.enabled, denied === null);
    const sensors = ['deviceorientation', 'devicemotion'].reduce((n, kind) => n + (f.listeners.get(kind)?.size || 0), 0);
    assert.equal(sensors, denied === null ? 2 : 0);
    if (denied) {
      assert.equal(f.mob.gyro.platformStatus.reason, 'permissions-policy');
      assert.equal(f.mob.gyro.start(), false, 'direct restart cannot bypass denied capability');
    }
    f.mob.gyro.disposePlatform();
  }
});
