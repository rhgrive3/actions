import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageDamage, groupDamage, distanceDamage } from '../runtime/weapons.mjs';
test('shooter damage falls with flight time, retaining exact endpoints', () => {
  const w = { damage: 36, damageMin: 18, damageReduceStart: 8 / 60, damageReduceEnd: 40 / 60 };
  assert.equal(ageDamage(w, 0, 36), 36); assert.equal(ageDamage(w, 8 / 60, 36), 36);
  assert.equal(ageDamage(w, 24 / 60, 36), 27); assert.equal(ageDamage(w, 1, 36), 18);
});
test('one roller/slosher attack aggregates its largest hit instead of multiplying pellet damage', () => {
  const group = new Map(), a = {}, b = {};
  assert.equal(groupDamage(group, a, 50), 50); assert.equal(groupDamage(group, a, 70), 20);
  assert.equal(groupDamage(group, a, 50), 0); assert.equal(groupDamage(group, b, 70), 70);
});
test('bombs retain the lethal inner band and weak outer band; blaster interpolates', () => {
  assert.equal(distanceDamage([[3.6, 180], [7, 30]], 3.6, false), 180);
  assert.equal(distanceDamage([[3.6, 180], [7, 30]], 3.61, false), 30);
  assert.equal(distanceDamage([[1, 70], [3, 50]], 2), 60);
});
