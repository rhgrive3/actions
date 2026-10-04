import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentCapsuleEntry } from '../runtime/projectile-collision.mjs';
const point = (x, y = 1, z = 0) => ({ x, y, z });
const base = { x: 1, y: 0, z: 0 };
const entry = (a, b) => segmentCapsuleEntry(a, b, base, .4, 2, .5);
test('first cylinder contact precedes closest approach and intervening centre-distance cover', () => {
  assert.equal(entry(point(0), point(2)), .25);
  assert.ok(entry(point(0), point(2)) * 2 < .8);
});
test('end cap, tangent, start inside, misses and stationary segments', () => {
  assert.ok(Math.abs(entry(point(1, 3), point(1, 1)) - .45) < 1e-12);
  assert.equal(entry(point(0, 1, .5), point(2, 1, .5)), .5);
  assert.equal(entry(point(1), point(2)), 0);
  assert.equal(entry(point(0, 1, .51), point(2, 1, .51)), Infinity);
  assert.equal(entry(point(0), point(0)), Infinity);
  assert.equal(entry(point(1), point(1)), 0);
});
test('long segments preserve early contact and reversing traversal changes entry side', () => {
  assert.equal(entry(point(0), point(10)), .05);
  assert.equal(entry(point(2), point(0)), .25);
});
