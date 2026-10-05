// #579 regression suite: opening the Turf Map must not freeze the gameplay
// camera filter, so closing it never replays a stale turn.
//
// Every case runs the real composed Input + PlayerController from
// map-look-fixture.mjs; only adaptMapLook is toggled, so the negative control
// proves the defect is still present on current main and cannot be hidden by
// other adapters drifting.
import assert from 'node:assert/strict';
import test from 'node:test';
import { HZ, SENS, closeAndRun, mapIdle, saturated, saturatedPitch } from './map-look-fixture.mjs';

for (const hz of HZ) {
  test(`${hz}Hz negative control: current main replays the frozen filter on map close`, async () => {
    const h = await saturated(false, hz, 1);
    mapIdle(h, hz);
    const { before, after } = closeAndRun(h, hz);
    assert.notEqual(after.yaw, before.yaw, 'without adaptMapLook the stale turn must replay');
    assert.ok(Math.abs(after.yaw - before.yaw) > 1e-3, 'the replay must be a real turn, not float noise');
  });

  test(`${hz}Hz neutral stick after map close applies zero residual yaw`, async () => {
    const h = await saturated(true, hz, 1);
    mapIdle(h, hz);
    const { before, after } = closeAndRun(h, hz);
    assert.equal(after.yaw, before.yaw, 'neutral stick must produce zero residual yaw');
    assert.equal(h.controller.padLook.x, 0, 'the filter must read the live neutral stick');
    assert.equal(h.controller.edgeT, 0, 'the rim-boost timer must not survive the map');
  });

  test(`${hz}Hz neutral stick after map close applies zero residual pitch`, async () => {
    const h = await saturatedPitch(true, hz);
    assert.ok(h.controller.padLook.y > 0.9, 'the vertical filter must be loaded before the map opens');
    mapIdle(h, hz);
    assert.equal(h.controller.padLook.y, 0, 'the vertical filter must read the live neutral stick');
    const { before, after } = closeAndRun(h, hz);
    assert.equal(after.pitch, before.pitch, 'neutral stick must produce zero residual pitch');
  });

  test(`${hz}Hz a deliberately held stick turns the camera on the first frame after close`, async () => {
    const h = await saturated(true, hz, 1);
    h.openMap();
    for (let i = 0; i < hz; i++) h.frame(1 / hz);
    h.closeMap();
    const start = h.rig.yaw;
    h.frame(1 / hz);
    assert.notEqual(h.rig.yaw, start, 'a held stick must still respond immediately');
    assert.ok(h.controller.padLook.x > 0.9, 'the filter must track the live held stick, not restart cold');
  });
}

for (const hz of HZ) {
  test(`${hz}Hz negative control: current main replays the frozen pitch too`, async () => {
    const h = await saturatedPitch(false, hz);
    mapIdle(h, hz);
    const { before, after } = closeAndRun(h, hz);
    assert.notEqual(after.pitch, before.pitch, 'without adaptMapLook the stale pitch must replay');
  });
}

test('a saturated edgeT before map entry cannot boost the camera after map exit', async () => {
  const h = await saturated(true, 60, 1);
  assert.ok(h.controller.edgeT > 0.4, 'the rim boost must be saturated before the map opens');
  mapIdle(h, 60);
  assert.equal(h.controller.edgeT, 0, 'the boost timer must be cleared while the map is up');
  const { before, after } = closeAndRun(h, 60, 60);
  assert.equal(after.yaw, before.yaw, 'a stale boost must not move a neutral camera');
  assert.equal(h.controller.edgeT, 0, 'the boost must not rebuild from the map interval');
});

for (const padSensitivity of SENS) {
  test(`padSensitivity ${padSensitivity} keeps the zero-residual requirement at every rate`, async () => {
    for (const hz of HZ) {
      const h = await saturated(true, hz, padSensitivity);
      mapIdle(h, hz);
      const { before, after } = closeAndRun(h, hz);
      assert.equal(after.yaw, before.yaw, `${padSensitivity}x @ ${hz}Hz replayed a residual`);
      assert.equal(h.controller.padLook.x, 0, `${padSensitivity}x @ ${hz}Hz left a stale filter value`);
    }
  });
}
