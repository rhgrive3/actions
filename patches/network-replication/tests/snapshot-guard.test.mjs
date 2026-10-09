import test from 'node:test';
import assert from 'node:assert/strict';
import { validActorSnapshotRow, validRemoteActorPose } from '../snapshot-guard.mjs';
const row = () => [17, 4, 2, 8, 3, 0, 1, 0, 0, 0, 1, 100, 100, 0, 0, 12, 0, 0, 0, 1, 0, 0, 0];
test('#1178 full owner row accepts ordinary 20Hz packets and additional optional fields', () => {
  assert.equal(validActorSnapshotRow(row(), 2.5), true);
  assert.equal(validActorSnapshotRow([...row(), { sequence: 1 }], 2.55), true);
});
test('#1178 malformed owner scalars and truncated rows never reach Hermite', () => {
  for (const [index, bad] of [[1, null], [4, 'bad'], [4, NaN], [7, Infinity], [10, -1],
    [10, 0.5], [11, '100'], [15, -1], [16, -1], [17, 1e7], [20, Infinity], [21, -1], [22, '0']]) {
    const value = row(); value[index] = bad;
    assert.equal(validActorSnapshotRow(value, 2.5), false, `field ${index} accepted malformed value ${String(bad)}`);
  }
  assert.equal(validActorSnapshotRow(row().slice(0, 7), 2.5), false);
  assert.equal(validActorSnapshotRow([0], NaN), false);
  assert.equal(validActorSnapshotRow('row', 2.5), false);
  const value = row(); value[4] = 1e99;
  assert.equal(validActorSnapshotRow(value, 2.5), false);
});
test('#1178 render guard keeps poison out of actor and allows next valid snapshot', () => {
  const sample = { x: 4, y: 2, z: 8, vx: 3, vy: 0, vz: 1, yaw: 0, aimYaw: 0, aimPitch: 0,
    hp: 100, ink: 100, sp: 0, ch: 0, turf: 10, lock: 0, f: 1 };
  const err = {x:0,y:0,z:0};
  assert.equal(validRemoteActorPose(sample, err), true);
  assert.equal(validRemoteActorPose({...sample,x:NaN}, err), false);
  assert.equal(validRemoteActorPose(sample, {...err,x:Infinity}), false);
  assert.equal(validRemoteActorPose(sample, err), true);
});

// Pending lethal HP is not an ink/gauge resource and must survive owner transfer.
test('#1178 valid pending-lethal HP stays receivable without allowing poisoned scalars', () => {
  for (const hp of [-.01, -20, -300, 0, 100]) {
    const value = row(); value[11] = hp;
    assert.equal(validActorSnapshotRow(value, 2.5), true, `finite pending HP ${hp}`);
  }
  for (const hp of [NaN, Infinity, -Infinity, '-20', null, -1e5 - 1, 1e5 + 1]) {
    const value = row(); value[11] = hp;
    assert.equal(validActorSnapshotRow(value, 2.5), false, `invalid HP ${String(hp)}`);
  }
  for (const resource of [12, 13, 14]) {
    const value = row(); value[resource] = -1;
    assert.equal(validActorSnapshotRow(value, 2.5), false, `negative resource ${resource}`);
  }
});
