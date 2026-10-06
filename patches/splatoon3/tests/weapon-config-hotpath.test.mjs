import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

test('locked Dualies reuse a one-field lock view and a runner-owned four-frame gate input', async () => {
  const f = await fixture(), a = f.make('dualies'), runner = a.weaponRunner, weapon = a.weapon;
  const passed = [];
  f.G.projectiles.fireDualies = (_actor, config) => passed.push(config);
  runner.s3Turret = true;
  runner.lockT = .5;
  runner.cooldown = 0;
  runner.s3DodgeShotPending = 0;
  runner._dualies(1 / 60, { fire: true, firePressed: true, sub: false }, weapon);
  runner.cooldown = 0;
  runner._dualies(1 / 60, { fire: true, firePressed: true, sub: false }, weapon);

  assert.equal(passed.length, 2);
  assert.equal(passed[0], passed[1]);
  assert.equal(Object.getPrototypeOf(passed[0]), weapon);
  assert.deepEqual(Object.keys(passed[0]), ['fireInterval']);
  assert.equal(passed[0].fireInterval, weapon.lockInterval);

  const input = { fire: true, firePressed: true, sub: false };
  const shotsBeforeGate = passed.length;
  runner.s3DodgeShotPending = 4 / 60;
  runner._dualies(1 / 60, input, weapon);
  const scratch = runner.s3DualiesGateInput;
  runner._dualies(1 / 60, input, weapon);
  assert.equal(runner.s3DualiesGateInput, scratch);
  assert.equal(Object.getPrototypeOf(scratch), null);
  assert.deepEqual(Object.keys(scratch), ['fire', 'firePressed']);
  assert.equal(scratch.fire, false);
  assert.equal(scratch.firePressed, false);
  assert.equal(input.fire, true);
  assert.equal(passed.length, shotsBeforeGate);
});

test('streaming Splatling reuses a one-field zero-debit view without changing ink', async () => {
  const f = await fixture(), a = f.make('splatling'), runner = a.weaponRunner, weapon = a.weapon;
  const passed = [];
  f.G.projectiles.fireSplatling = (_actor, config) => passed.push(config);
  runner.streaming = true;
  runner.burstDur = runner.burstT = 1;
  runner.cooldown = 0;
  const inkBefore = a.ink;
  runner._splatling(1 / 60, { fire: true }, weapon);
  runner.cooldown = 0;
  runner._splatling(1 / 60, { fire: true }, weapon);

  assert.equal(passed.length, 2);
  assert.equal(passed[0], passed[1]);
  assert.equal(Object.getPrototypeOf(passed[0]), weapon);
  assert.deepEqual(Object.keys(passed[0]), ['inkPerShot']);
  assert.equal(passed[0].inkPerShot, 0);
  assert.equal(a.ink, inkBefore);
});

test('projectile keeps the fired actor-local config reference after weapon rebind', async () => {
  const f = await fixture(), a = f.make('shooter'), firedWeapon = a.weapon;
  const projectiles = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = projectiles;
  const projectile = projectiles._new();
  projectile.owner = a;
  projectile.wid = firedWeapon.id;
  projectiles._push(projectile);

  assert.equal(projectile.s3Weapon, firedWeapon);
  assert.equal(projectile.grav, firedWeapon.referenceGravity);
  a.setWeapon('dualies');
  assert.notEqual(a.weapon, firedWeapon);
  assert.equal(projectile.s3Weapon, firedWeapon);
  assert.equal(projectile.s3Weapon.kind, 'shooter');
  assert.equal(projectile.s3Weapon.damage, firedWeapon.damage);
  projectile.age = firedWeapon.damageReduceEnd;
  let applied;
  f.applyProjectileHit({ applyHit: (_owner, _victim, amount) => { applied = amount; } },
    projectile, {}, 100);
  assert.equal(applied, firedWeapon.damageMin);
});
