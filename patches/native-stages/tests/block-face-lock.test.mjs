import test from 'node:test';
import assert from 'node:assert/strict';
import { blockFaceLockFace, blockFaceLockCoplanar } from '../runtime/native-paint.mjs';

const v = (x, y, z) => ({ x, y, z });
// top face of a floor box: origin at (x0, y, z0), u along +x, v along +z
const top = (x0, x1, y, z0, z1) => ({ n: v(0, 1, 0), origin: v(x0, y, z0), u: v(1, 0, 0), v: v(0, 0, 1), su: x1 - x0, sv: z1 - z0 });

test('block stages: a face-locked stamp reaches the next floor at the same height', () => {
  const lane = top(0, 12, 0, 0, 50), gallery = top(-16, 0, 0, 0, 34);
  const level = { native: false, faces: [lane, gallery] };
  assert.equal(blockFaceLockFace(level, 0), lane);
  assert.equal(blockFaceLockFace({ native: true, faces: [lane] }, 0), null);
  assert.equal(blockFaceLockFace(level, -1), null);
  assert.equal(blockFaceLockCoplanar(lane, lane), true);
  assert.equal(blockFaceLockCoplanar(lane, gallery), true);
});

test('block stages: steps, plates, walls and undersides never share the stamp', () => {
  const lane = top(0, 12, 0, 0, 50);
  assert.equal(blockFaceLockCoplanar(lane, top(-1, 0, 0.05, 0, 2)), false);   // 5 cm plate
  assert.equal(blockFaceLockCoplanar(lane, top(-1, 0, -0.3, 0, 2)), false);   // lower floor
  const wall = { n: v(1, 0, 0), origin: v(0, 0, 0), u: v(0, 0, 1), v: v(0, 1, 0), su: 2, sv: 1 };
  assert.equal(blockFaceLockCoplanar(lane, wall), false);
  const under = { n: v(0, -1, 0), origin: v(-1, 0, 0), u: v(1, 0, 0), v: v(0, 0, 1), su: 1, sv: 1 };
  assert.equal(blockFaceLockCoplanar(lane, under), false);
});
