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
// Splatoon 3 Ver.11.3.0 floor Squid Roll admits a stick direction >=60 deg from
// the current movement direction (splatoon3mix system details; dedicated move
// verification). The shipped profile must not require a 90-degree turn.
test('floor Squid Roll uses the S3 60-degree direction threshold', () => {
  const roll = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8')).movement.roll;
  assert.ok(Math.abs(roll.minimumAngle - Math.PI / 3) < 1e-12, `floor-roll minimumAngle must be pi/3, got ${roll.minimumAngle}`);
  const at = deg => {
    const rad = deg * Math.PI / 180;
    return rollEligible({ x: 0, z: 12 }, { x: Math.sin(rad), z: Math.cos(rad) }, roll);
  };
  assert.equal(at(59), false);
  assert.equal(at(60), true);
  assert.equal(at(75), true);
  assert.equal(at(89), true);
  assert.equal(at(90), true);
  assert.equal(at(180), true);
});
test('roll armor absorbs only its remaining capacity and passes lethal overflow', () => {
  const state = { armorHP: 100, armorTime: .1 };
  assert.equal(absorbArmor(state, 60), 0); assert.equal(state.armorHP, 40);
  assert.equal(absorbArmor(state, 180), 140); assert.equal(state.armorHP, 0);
  state.armorHP = 100; state.armorTime = 0; assert.equal(absorbArmor(state, 60), 60);
});
