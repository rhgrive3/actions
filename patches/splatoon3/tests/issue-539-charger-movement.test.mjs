import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { chargerPartialMoveSpeed } from '../runtime/weapons.mjs';

test('#539 verified Charger movement endpoints and monotonic partial progress', () => {
  const w = { kind: 'charger', moveSpeedFiring: 1.2, partialChargeMoveStart: 5.76,
    partialChargeMoveEnd: 1.26, minimumChargeTime: 8 / 60 };
  assert.equal(chargerPartialMoveSpeed(w, 0, 5.76), 5.76);
  assert.equal(chargerPartialMoveSpeed(w, 8 / 60, 5.76), 5.76);
  assert.equal(chargerPartialMoveSpeed(w, 1, 5.76), 1.2);
  const speeds = Array.from({ length: 52 }, (_, i) => chargerPartialMoveSpeed(w, (8 + i) / 60, 5.76));
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] <= speeds[i - 1]);
  assert.ok(speeds.at(-1) > 1.26);
  assert.ok(chargerPartialMoveSpeed(w, 1 - 1e-12, 5.76) > 1.259999);
  assert.equal(chargerPartialMoveSpeed(w, NaN, 5.76), 5.76);
});

test('#539 installed real WeaponRunner no longer locks partial charge to full-charge speed', async () => {
  const f = await fixture();
  const a = f.make('charger'), r = a.weaponRunner;
  const w = a.weapon;
  r.charging = true;
  for (const [c, expected] of [[0, 5.76], [8 / 60, 5.76], [1, w.moveSpeedFiring]]) {
    r.charge = c;
    assert.ok(Math.abs(r.moveSpeed() - expected) < 1e-8, `charger charge ${c}`);
  }
  r.charge = 0.5;
  assert.ok(r.moveSpeed() < 5.76 && r.moveSpeed() > 1.26);
  r.charging = false;
  assert.notEqual(r.moveSpeed(), 1.26, 'noncharging state remains owned by native runner');
});
