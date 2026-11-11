import test from 'node:test';
import assert from 'node:assert/strict';
import { screenTravel, screenStep } from '../runtime/screen-motion.mjs';

const near = (a, b) => Math.abs(a - b) < 1e-9;
test('Screen holds 60F, ramps to MoveSpeed over 300F, then runs to 560F of travel', () => {
  const v = 2.4;
  assert.equal(screenTravel(0.5, v), 0);
  assert.equal(screenTravel(1, v), 0);
  assert.ok(near(screenTravel(1 + 2.5, v), v * 2.5 * 2.5 / 10));
  assert.ok(near(screenTravel(6, v), v * 2.5));
  assert.ok(near(screenTravel(1 + 560 / 60, v), v * 2.5 + v * 260 / 60));
  assert.ok(near(screenTravel(99, v), screenTravel(1 + 560 / 60, v)));
});
test('Screen steps sum to the same travel at 30/60/120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    let d = 0; for (let i = 1; i <= 12 * hz; i++) d += screenStep(i / hz, 1 / hz, 2.4);
    assert.ok(near(d, screenTravel(99, 2.4)), hz + ' Hz');
  }
});
