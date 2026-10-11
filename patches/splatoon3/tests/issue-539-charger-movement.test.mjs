import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { chargerPartialMoveSpeed } from '../runtime/weapons.mjs';

// #539: partial endpoints 5.76 / 1.26 are community-table values (未確認 as
// pinned data); the 1.2 full-charge endpoint is pinned. Interior is linear.
const w = { kind: 'charger', moveSpeedFiring: 1.2, partialChargeMoveStart: 5.76,
  partialChargeMoveEnd: 1.26, minimumChargeTime: 8 / 60, chargeTime: 1 };

test('#539 Charger partial movement keeps distinct start, maximum-partial and full endpoints', () => {
  assert.equal(chargerPartialMoveSpeed(w, 0, 5.76), 5.76);
  assert.equal(chargerPartialMoveSpeed(w, 8 / 60, 5.76), 5.76, 'the 8F minimum holds the normal-side endpoint');
  assert.ok(Math.abs(chargerPartialMoveSpeed(w, 1 - 1e-12, 5.76) - 1.26) < 1e-6, 'maximum-partial side');
  assert.equal(chargerPartialMoveSpeed(w, 1, 5.76), 1.2, 'true full charge');
  assert.equal(chargerPartialMoveSpeed(w, NaN, 5.76), 5.76, 'non-finite progress reads as no charge');
});

test('#539 partial curve is deterministic, non-increasing and bounded by its endpoints', () => {
  const speeds = Array.from({ length: 52 }, (_, i) => chargerPartialMoveSpeed(w, (8 + i) / 60, 5.76));
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] <= speeds[i - 1] + 1e-12, `frame ${8 + i}`);
  for (const s of speeds) assert.ok(s <= 5.76 + 1e-12 && s >= 1.26 - 1e-12, `bounded ${s}`);
  assert.ok(speeds.at(-1) > 1.26, 'interior stays above the maximum-partial endpoint');
});

test('#539 installed WeaponRunner moves by chargeT and ignores the damage-curve charge', async () => {
  const f = await fixture();
  const a = f.make('charger'), r = a.weaponRunner;
  assert.equal(a.weapon.partialChargeMoveStart, 5.76, 'profile start reaches the actor weapon copy');
  assert.equal(a.weapon.partialChargeMoveEnd, 1.26, 'profile maximum-partial endpoint reaches the actor weapon copy');
  r.charging = true;
  for (const [t, expected] of [[0, 5.76], [8 / 60, 5.76], [1, a.weapon.moveSpeedFiring]]) {
    r.chargeT = t; r.charge = 1 - t;
    assert.ok(Math.abs(r.moveSpeed() - expected) < 1e-8, `chargeT ${t}`);
  }
  r.chargeT = 0.5; r.charge = 1;
  assert.ok(Math.abs(r.moveSpeed() - chargerPartialMoveSpeed(a.weapon, 0.5, 5.76)) < 1e-12, 'mid-charge uses chargeT');
  r.charging = false;
  r.chargeT = 0; const idleAtZero = r.moveSpeed();
  r.chargeT = 1; assert.equal(r.moveSpeed(), idleAtZero, 'non-charging speed is independent of chargeT');
});
