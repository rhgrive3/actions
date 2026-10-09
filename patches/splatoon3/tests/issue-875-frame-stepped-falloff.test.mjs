import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityDamage } from '../runtime/weapons-fidelity.mjs';

const close = (actual, expected, msg = '', eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected} (diff: ${Math.abs(actual - expected)}) ${msg}`);

test('#875 projectile damage falloff uses integer frame steps instead of continuous subframe values', () => {
  const weapon = {
    kind: 'shooter',
    damage: 35,
    damageMin: 17.5,
    damageReduceStart: 7 / 60,
    damageReduceEnd: 15 / 60,
  };

  const getDamageAtAge = (ageSeconds) => {
    return fidelityDamage({
      s3Weapon: weapon,
      damage: weapon.damage,
      age: ageSeconds,
    }, null, 1);
  };

  // Exact frames 0..7: full damage (35)
  close(getDamageAtAge(0 / 60), 35, '0F');
  close(getDamageAtAge(7 / 60), 35, '7F');

  // Subframe age near 7F rounds to 7F (no continuous intermediate reduction)
  close(getDamageAtAge(7.2 / 60), 35, '7.2F rounds to 7F');
  close(getDamageAtAge(7.49 / 60), 35, '7.49F rounds to 7F');

  // Subframe age 7.51F rounds to 8F
  const expected8F = 35 + (17.5 - 35) * (1 / 8); // 32.8125
  close(getDamageAtAge(7.51 / 60), expected8F, '7.51F rounds to 8F');
  close(getDamageAtAge(8.0 / 60), expected8F, '8.0F');

  // Frame 11 (midpoint of 7..15, step 4/8 = 0.5)
  const expected11F = 35 + (17.5 - 35) * 0.5; // 26.25
  close(getDamageAtAge(11.0 / 60), expected11F, '11F');
  close(getDamageAtAge(11.3 / 60), expected11F, '11.3F rounds to 11F');

  // Frame 15 and beyond: minimum damage (17.5)
  close(getDamageAtAge(15.0 / 60), 17.5, '15F');
  close(getDamageAtAge(20.0 / 60), 17.5, '20F');
});

test('#875 Splat Dualies frame-stepped damage matches verified integer frame milestones', () => {
  const weapon = {
    kind: 'dualies',
    damage: 30,
    damageMin: 15,
    damageReduceStart: 7 / 60,
    damageReduceEnd: 15 / 60,
  };

  const atFrame = f => fidelityDamage({ s3Weapon: weapon, damage: 30, age: f / 60 }, null, 1);

  close(atFrame(0), 30, '0F');
  close(atFrame(7), 30, '7F');
  close(atFrame(8), 28.125, '8F');
  close(atFrame(12), 20.625, '12F');
  close(atFrame(15), 15, '15F');
  close(atFrame(20), 15, '20F');
});
