import test from 'node:test';
import assert from 'node:assert/strict';
import { blasterBlastExposed } from '../runtime/blast-occlusion.mjs';

const center = { x: 0, y: 0.7, z: 0 };
const actor = { pos: { x: 0, y: 0, z: 2 }, smoothY: 0, form: 'kid' };
const player = { radius: 0.4, height: 1.8, squidHeight: 0.8 };

test('#1043 a blocked torso ray does not hard-block an exposed player capsule', () => {
  let calls = 0;
  const physics = { los(_a, b) { calls++; return b.y > 1.1; } };
  assert.equal(blasterBlastExposed(physics, center, actor, player), true);
  assert.ok(calls > 1, 'visibility is evaluated against the player volume, not one point');
});

test('#1043 an exposed capsule side around a cover edge admits the burst', () => {
  const physics = { los(_a, b) { return b.x > 0.2; } };
  assert.equal(blasterBlastExposed(physics, center, actor, player), true);
});

test('#1043 genuinely full cover still blocks the whole burst', () => {
  const physics = { los() { return false; } };
  assert.equal(blasterBlastExposed(physics, center, actor, player), false);
});
