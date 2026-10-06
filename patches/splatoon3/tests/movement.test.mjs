import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollEligible, absorbArmor } from '../runtime/movement.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const cfg = { minimumSpeed: 8, minimumInput: .3, minimumAngle: Math.PI / 2 };
test('Squid Roll uses direction change and pre-braking speed', () => {
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 0, z: -1 }, cfg), true);
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 1, z: 0 }, cfg), true);
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 0, z: 1 }, cfg), false);
  assert.equal(rollEligible({ x: 0, z: 7 }, { x: 0, z: -1 }, cfg), false);
  assert.equal(rollEligible({ x: 0, z: 10 }, { x: 0, z: -.1 }, cfg), false);
});
test('roll armor separates 30 HP durability from the 100 HP per-hit threshold', () => {
  const state = { armorHP: 30, armorTime: .1 };
  assert.equal(absorbArmor(state, 20), 0); assert.equal(state.armorHP, 10);
  assert.equal(absorbArmor(state, 180), 80); assert.equal(state.armorHP, 0);
  state.armorHP = 100; state.armorTime = 0; assert.equal(absorbArmor(state, 60), 60);
});
