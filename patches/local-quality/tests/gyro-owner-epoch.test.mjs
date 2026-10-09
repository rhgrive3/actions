import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../../reliability/tests/action-fixture.mjs';
const STEP = 1 / 60;
async function rig() {
  const h = await boot({ weapon: 'shooter' });
  h.mobile.s.gyro = true; h.mobile.gyro.enabled = true;
  h.input.lastDevice = 'touch'; h.controller.update(STEP);
  return h;
}
test('event-owned touch rebase preserves samples arriving before the next controller tick', async () => {
  for (const hz of [30,60,120]) {
    const h = await rig(), g = h.mobile.gyro;
    for (let i = 0; i < 4; i++) {
      h.input.lastDevice = 'kbm'; h.controller.update(1/hz);
      g.dYaw = 3; g.dPitch = 2;
      h.input.lastDevice = 'touch';
      assert.equal(g.dYaw, 0, 'the event discards old-owner samples');
      g.dYaw = .2; g.dPitch = .15;
      h.controller.update(1/hz);
      assert.ok(Math.abs(h.rig.yaw - .2*(i+1)) < 1e-10);
      assert.ok(Math.abs(h.rig.pitch - .15*(i+1)) < 1e-10);
      assert.equal(g.dYaw,0,'fresh samples consumed exactly once');
    }
  }
});
test('an unnotified ownership mutation still discards stale gyro once, then accepts fresh samples', async () => {
  const h = await rig(), g = h.mobile.gyro;
  // Negative control: intentionally bypass the real setter/event receipt.
  h.input._dev = 'kbm'; h.controller.update(STEP);
  g.dYaw=3;g.dPitch=2;h.input._dev='touch';h.controller.update(STEP);
  assert.equal(h.rig.yaw,0);assert.equal(h.rig.pitch,0);
  g.dYaw=.2;g.dPitch=.15;h.controller.update(STEP);
  assert.equal(h.rig.yaw,.2);assert.equal(h.rig.pitch,.15);
});
