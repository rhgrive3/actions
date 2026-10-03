import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollEligible, absorbArmor } from '../runtime/movement.mjs';
const cfg = { minimumSpeed: 8, minimumInput: .3, minimumAngle: Math.PI / 2 };
test('Squid Roll uses direction change and pre-braking speed', () => {
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 0, z: -1 }, cfg), true);
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 1, z: 0 }, cfg), true);
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 0, z: 1 }, cfg), false);
  assert.equal(rollEligible({ x: 0, z: 7 }, { x: 0, z: -1 }, cfg), false);
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 0, z: -.1 }, cfg), false);
});
test('roll armor absorbs only its remaining capacity and passes lethal overflow', () => {
  const state = { armorHP: 100, armorTime: .1 };
  assert.equal(absorbArmor(state, 60), 0); assert.equal(state.armorHP, 40);
  assert.equal(absorbArmor(state, 180), 140); assert.equal(state.armorHP, 0);
  state.armorHP = 100; state.armorTime = 0; assert.equal(absorbArmor(state, 60), 60);
});
