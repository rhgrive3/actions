// Owner report 2026-10-18: Roller held-swing rest, Slosher attack overlay,
// scope rim strength. Pure-module checks; browser/console comparison is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { horizontalRollerPose, verticalRollerPose, ROLLER_POSE } from '../runtime/roller.mjs';
import { sourceActionUpperOnly } from '../runtime/source-weapon-owner.mjs';
import { scopeOverlayStrength } from '../runtime/camera-aim-controls.mjs';

test('a held ZR keeps the released drum down instead of lifting it back to the carry', () => {
  for (const [pose, windup, interval] of [[horizontalRollerPose, 10 / 60, 31 / 60], [verticalRollerPose, 12 / 60, 33 / 60]]) {
    const end = pose(interval, windup, interval, null, true), lifted = pose(interval, windup, interval, null, false);
    assert.equal(end.weight, 1, 'held rest stays at full weight');
    assert.ok(lifted.weight < 1e-9, 'a released trigger still fades back to the carry');
    assert.ok(Math.abs(end.rotation[0] - ROLLER_POSE.READY_ROTATION[0]) > 1, 'not the raised carry grip');
    if (pose === verticalRollerPose) {
      // The upright drum lies down into the roll grip by the roll admission.
      assert.deepEqual(end.anchor.map(v => +v.toFixed(6)), ROLLER_POSE.ROLL_ANCHOR.map(v => +v.toFixed(6)));
      assert.deepEqual(end.rotation.map(v => +v.toFixed(6)), ROLLER_POSE.ROLL_ROTATION.map(v => +v.toFixed(6)));
    } else {
      // The level drum stays on its rest grip to the end instead of returning to READY.
      const before = pose(interval - 2 / 60, windup, interval, null, true);
      assert.deepEqual(end.anchor.map(v => +v.toFixed(6)), before.anchor.map(v => +v.toFixed(6)), 'held rest is steady');
    }
    const release = pose(windup, windup, interval, null, true), free = pose(windup, windup, interval, null, false);
    assert.deepEqual(release.anchor.map(v => +v.toFixed(9)), free.anchor.map(v => +v.toFixed(9)), 'release grip unchanged');
  }
  const heavy = horizontalRollerPose(80 / 60, 45 / 60, 66 / 60, 'heavy', true);
  assert.equal(heavy.weight, 1, 'Dynamo rest also holds while ZR is held');
});

test('the Wii U Slosher attack clip never drives the legs', () => {
  assert.equal(sourceActionUpperOnly('BBll', 'Attack_BBll'), true);
  assert.equal(sourceActionUpperOnly('Nrml', 'Attack_BBll'), true);
  assert.equal(sourceActionUpperOnly('Rllr', 'Attack_Rllr'), false);
  assert.equal(sourceActionUpperOnly('Chrg', 'Shoot_Chrg'), false);
});

test('scope rim strength follows the local follow camera zoom only', () => {
  const rig = { mode: 'follow', target: { isLocal: true }, zoom: 10, mapK: 0 };
  assert.equal(scopeOverlayStrength(rig, 20), .5);
  assert.equal(scopeOverlayStrength({ ...rig, zoom: 40 }, 20), 1);
  assert.equal(scopeOverlayStrength({ ...rig, target: { isLocal: false } }, 20), 0);
  assert.equal(scopeOverlayStrength({ ...rig, mode: 'spectate' }, 20), 0);
  assert.equal(scopeOverlayStrength({ ...rig, mapOpen: true }, 20), 0);
  assert.equal(scopeOverlayStrength(rig, 0), 0);
});
