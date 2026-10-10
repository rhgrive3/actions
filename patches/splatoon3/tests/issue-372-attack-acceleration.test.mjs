import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

test('#372 sustained main-fire and attack states apply 2.0x acceleration from rest', async () => {
  const f = await fixture();
  const dt = 1 / 60;

  // 1. Normal actor without attack
  const normal = f.make('shooter');
  normal.grounded = true;
  normal.intent.move.set(0, 0, 1);
  normal._horizontal(dt, false, false);
  const normalAccel = normal.vel.length();
  assert.ok(normalAccel > 0, 'normal actor should accelerate');

  // 2. Firing actor (attack state)
  const firing = f.make('shooter');
  firing.grounded = true;
  firing.weaponRunner.firingT = 0.35;
  firing.intent.move.set(0, 0, 1);
  firing._horizontal(dt, false, false);
  const attackAccel = firing.vel.length();

  // Dimensioless 2.0x ratio
  const ratio = attackAccel / normalAccel;
  assert.ok(Math.abs(ratio - 2.0) < 1e-4, `attack acceleration ratio should be 2.0, got ${ratio}`);
});

test('#372 releasing stick applies 2.0x braking deceleration during attack state', async () => {
  const f = await fixture();
  const dt = 1 / 60;

  // 1. Normal braking from speed 2.0
  const normal = f.make('shooter');
  normal.grounded = true;
  normal.vel.set(0, 0, 2.0);
  normal.intent.move.set(0, 0, 0); // stick released
  normal._horizontal(dt, false, false);
  const normalDecel = 2.0 - normal.vel.length();
  assert.ok(normalDecel > 0, 'normal actor should decelerate');

  // 2. Attacking braking from speed 2.0
  const firing = f.make('shooter');
  firing.grounded = true;
  firing.weaponRunner.firingT = 0.35;
  firing.vel.set(0, 0, 2.0);
  firing.intent.move.set(0, 0, 0); // stick released
  firing._horizontal(dt, false, false);
  const attackDecel = 2.0 - firing.vel.length();

  const ratio = attackDecel / normalDecel;
  assert.ok(Math.abs(ratio - 2.0) < 1e-4, `attack deceleration ratio should be 2.0, got ${ratio}`);
});

test('#372 aiming sub and charging states also select 2.0x attack acceleration', async () => {
  const f = await fixture();
  const dt = 1 / 60;

  const normal = f.make('shooter');
  normal.grounded = true;
  normal.intent.move.set(0, 0, 1);
  normal._horizontal(dt, false, false);
  const normalDelta = normal.vel.length();

  // Sub aiming
  const subActor = f.make('shooter');
  subActor.grounded = true;
  subActor.weaponRunner.aimingSub = true;
  subActor.intent.move.set(0, 0, 1);
  subActor._horizontal(dt, false, false);
  const subDelta = subActor.vel.length();
  assert.ok(Math.abs(subDelta / normalDelta - 2.0) < 1e-4, 'sub aiming should have 2.0x acceleration');

  // Charger charging
  const charger = f.make('charger');
  charger.grounded = true;
  charger.weaponRunner.charging = true;
  charger.intent.move.set(0, 0, 1);
  charger._horizontal(dt, false, false);
  const chargerDelta = charger.vel.length();
  assert.ok(Math.abs(chargerDelta / normalDelta - 2.0) < 1e-4, 'charger charging should have 2.0x acceleration');
});
