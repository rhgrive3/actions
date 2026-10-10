// #1151 regression: Gyro marks stream as stale after silence following first sample
import test from 'node:test';
import assert from 'node:assert/strict';
import { viabilityFixture } from './gyro-viability-fixture.mjs';
import { GYRO_STALE_MS, GyroPermission } from '../gyro-permission.mjs';

test('#1151 GyroPermission transitions to stale on prolonged silence after first sample', async () => {
  let timerId = 1;
  const timers = new Map();
  let now = 1000;
  const env = {
    DeviceOrientationEvent: { requestPermission: async () => 'granted' },
    DeviceMotionEvent: {},
    performance: { now: () => now },
    setTimeout: (fn, ms) => {
      const id = timerId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const lifecycle = { active: true, focused: true, epoch: 1 };
  const perm = new GyroPermission(env, lifecycle);
  perm.wanted = true;

  // 1. Begin listening
  perm.beginListening();
  assert.equal(perm.availability, 'waiting');
  assert.equal(perm.received, false);

  // 2. Deliver first sample
  now = 1100;
  perm.sample(now);
  assert.equal(perm.availability, 'active');
  assert.equal(perm.received, true);
  assert.equal(perm.hasSample, true);
  assert.ok(perm.healthProbe !== null, 'healthProbe must be active');

  // 3. Advance virtual time past GYRO_STALE_MS
  now += GYRO_STALE_MS + 100;
  // Trigger healthProbe timer
  const pending = [...timers.entries()].find(([, t]) => t.at <= now);
  assert.ok(pending, 'health probe timer should have expired');
  timers.delete(pending[0]);
  pending[1].fn();

  // Availability should now be stale, not indefinitely active!
  assert.equal(perm.availability, 'stale');
  assert.equal(perm.reason, 'sensor-data-stale');
  assert.equal(perm.state, 'supported-stale');

  // 4. Permission and preference remain preserved
  assert.equal(perm.permission, 'prompt'); // or not-required/granted
  assert.equal(perm.wanted, true);

  // 5. Fresh sample recovers to active
  now += 500;
  perm.sample(now);
  assert.equal(perm.availability, 'active');
  assert.equal(perm.reason, null);
});

test('#1151 viability fixture end-to-end: gyro UI reflects stale sensor without disabling preference', async (t) => {
  const h = await viabilityFixture({ permission: 'granted' });
  t.after(h.close);

  await h.m.setGyro(true);
  h.orientation({ alpha: 10 });
  assert.equal(h.m.gyro.platformStatus.availability, 'active');

  // Advance time past stale threshold
  await h.advance(GYRO_STALE_MS + 100);
  assert.equal(h.m.gyro.platformStatus.availability, 'stale');
  assert.equal(h.m.gyro.enabled, true, 'gyro preference remains enabled');
  assert.match(h.m.els.gyro.title, /No recent gyro samples/);

  // Sensor recovers
  h.orientation({ alpha: 20 });
  assert.equal(h.m.gyro.platformStatus.availability, 'active');
});
