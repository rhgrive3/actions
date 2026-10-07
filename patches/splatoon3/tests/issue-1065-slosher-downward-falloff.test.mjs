import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityDamage } from '../runtime/weapons-fidelity.mjs';

const DAMAGE = Object.freeze({
  ValueMax: 700,
  ValueMin: 500,
  ReduceStartFallDistance: 1.5,
  ReduceEndFallDistance: 7.625,
});
const expected = fall => {
  const t = Math.max(0, Math.min(1, (fall - DAMAGE.ReduceStartFallDistance) /
    (DAMAGE.ReduceEndFallDistance - DAMAGE.ReduceStartFallDistance)));
  return (DAMAGE.ValueMax + (DAMAGE.ValueMin - DAMAGE.ValueMax) * t) / 10;
};
const shot = launchY => ({
  s3Weapon: { kind: 'slosher' },
  owner: { weapon: { kind: 'slosher' } },
  fidelitySloshUnit: { DamageParam: DAMAGE },
  fidelitySloshLaunchVelY: launchY,
  start: { y: 10 },
  straight: 2 / 60,
});

test('#1065 downward straight-state descent does not consume Bucket Slosher falloff', () => {
  const p = shot(-90);
  assert.equal(fidelityDamage(p, { y: 8 }), 70,
    'a hit 2 units below spawn but still above the straight-end anchor stays at max damage');
  assert.ok(Math.abs(fidelityDamage(p, { y: 5 }) - expected(2)) < 1e-12,
    'post-straight descent counts from the straight-end anchor, not from spawn height');
});

test('#1065 upward and legacy/unknown launch directions keep the spawn-height fall anchor', () => {
  for (const launchY of [90, null]) {
    const p = shot(launchY);
    assert.ok(Math.abs(fidelityDamage(p, { y: 8 }) - expected(2)) < 1e-12);
  }
});
