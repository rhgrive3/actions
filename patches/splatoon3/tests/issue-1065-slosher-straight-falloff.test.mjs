import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityDamage } from '../runtime/weapons-fidelity.mjs';

const damage = Object.freeze({
  ValueMax: 700,
  ValueMin: 500,
  ReduceStartFallDistance: 1.5,
  ReduceEndFallDistance: 7.625,
});

function projectile(launchY) {
  return {
    owner: { weapon: { kind: 'slosher' } },
    s3Weapon: { kind: 'slosher' },
    fidelitySloshUnit: { DamageParam: damage },
    fidelitySloshLaunchVelY: launchY,
    start: { y: 10 },
    straight: 2 / 60,
  };
}

const expected = fall => {
  const t = Math.max(0, Math.min(1,
    (fall - damage.ReduceStartFallDistance) /
    (damage.ReduceEndFallDistance - damage.ReduceStartFallDistance)));
  return (damage.ValueMax + (damage.ValueMin - damage.ValueMax) * t) / 10;
};

test('#1065 downward descent during the 2F straight state does not consume falloff', () => {
  // -90 u/s = -1.5 u/F, therefore the 2F straight phase ends 3.0 units below spawn.
  const p = projectile(-90);
  assert.equal(fidelityDamage(p, { y: 8 }), 70,
    '2.0 units of straight-state descent is still max damage');
  assert.equal(fidelityDamage(p, { y: 7 }), 70,
    'the straight-end anchor itself is still max damage');
  assert.ok(Math.abs(fidelityDamage(p, { y: 5 }) - expected(2)) < 1e-12,
    'only post-straight descent advances the 1.5 -> 7.625 falloff interval');
});

test('#1065 upward shots keep the spawn-height anchor for apex-return semantics', () => {
  const p = projectile(90);
  assert.ok(Math.abs(fidelityDamage(p, { y: 8 }) - expected(2)) < 1e-12);
});
