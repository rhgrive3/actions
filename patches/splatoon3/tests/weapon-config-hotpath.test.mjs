import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

test('locked Dualies reuse a full enumerable lock config and clear the four-frame gate overlay', async () => {
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
  assert.equal(Object.getPrototypeOf(passed[0]), Object.getPrototypeOf(weapon));
  assert.equal(Object.isFrozen(passed[0]), true);
  assert.deepEqual(Object.keys(passed[0]).sort(), Object.keys(weapon).sort());
  assert.equal(passed[0].fireInterval, weapon.lockInterval);
  const roundConfig = { ...passed[0], projSpeed: 20 };
  for (const key of ['kind', 'id', 'damage', 'damageMin', 'referenceGravity', 'spreadGround', 'spreadAir', 'impactRadius']) {
    assert.equal(roundConfig[key], weapon[key], `PR868 spread preserves ${key}`);
  }

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

  const throwingWeapon = Object.create(weapon);
  Object.defineProperty(throwingWeapon, 'lockInterval', { enumerable: true, get() { throw new Error('lock config getter failed'); } });
  runner.s3Turret = true;
  runner.s3DodgeShotPending = 4 / 60;
  assert.throws(() => runner._dualies(1 / 60, input, throwingWeapon), /lock config getter failed/);
  assert.equal(Object.getPrototypeOf(runner.s3DualiesGateInput), null);
  assert.equal(input.fire, true);

  const temporary = Object.create(weapon);
  Object.defineProperty(temporary, 'temporaryScale', { value: 17, enumerable: true });
  runner.s3DodgeShotPending = 0;
  runner.s3Turret = true;
  runner.cooldown = 0;
  runner._dualies(1 / 60, input, temporary);
  const temporaryConfig = passed.at(-1);
  assert.equal(temporaryConfig.temporaryScale, 17);
  assert.equal(temporaryConfig.kind, weapon.kind);
  assert.equal(Object.isFrozen(temporaryConfig), true);

  const previousWeapon = a.weapon;
  a.setWeapon('dualies');
  assert.notEqual(a.weapon, previousWeapon);
  runner.s3Turret = true;
  runner.cooldown = 0;
  runner._dualies(1 / 60, input, a.weapon);
  assert.notEqual(passed.at(-1), passed[0]);
  assert.equal(passed.at(-1).damage, a.weapon.damage);
  const reboundWeapon = a.weapon;
  a.s3.flow.active = true;
  a.s3.flow.remaining = 1;
  f.tick(a, 1);
  assert.equal(a.weapon, reboundWeapon);
});

test('streaming Splatling reuses the split owner config without changing ink', async () => {
  const f = await fixture(), a = f.make('splatling'), runner = a.weaponRunner, weapon = a.weapon;
  const passed = [];
  f.G.projectiles.fireSplatling = (_actor, config) => passed.push(config);
  const arm = (config, shots = 2) => {
    runner.streaming = true; runner.burstDur = runner.burstT = 1; runner.cooldown = 0;
    runner.s3Spin = { paid: 0, unspent: 0, elapsed: 0, emitted: 0, shots };
    runner._splatling(config.fireInterval + 1e-4, { fire: true }, config);
  };
  const inkBefore = a.ink;
  arm(weapon, 2);
  assert.equal(passed.length, 2);
  assert.strictEqual(passed[0], weapon);
  assert.strictEqual(passed[1], weapon);
  assert.equal(a.ink, inkBefore);

  const temporary = Object.create(weapon);
  Object.defineProperty(temporary, 'temporaryScale', { value: 23, enumerable: true });
  arm(temporary, 1);
  assert.strictEqual(passed.at(-1), temporary);
  assert.equal(passed.at(-1).temporaryScale, 23);

  const previousWeapon = a.weapon;
  a.setWeapon('splatling');
  assert.notEqual(a.weapon, previousWeapon);
  arm(a.weapon, 1);
  assert.strictEqual(passed.at(-1), a.weapon);
  assert.notEqual(passed.at(-1), passed[0]);
});

test('projectile keeps the fired actor-local config reference after weapon rebind', async () => {
  const f = await fixture(), a = f.make('shooter'), firedWeapon = a.weapon;
  const projectiles = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = projectiles;
  const projectile = projectiles._new();
  assert.equal(projectile.s3Weapon ?? null, null);
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

  projectiles.pool.push(projectile);
  const recycled = projectiles._new();
  assert.equal(recycled, projectile);
  assert.equal(recycled.s3Weapon ?? null, null);
  recycled.owner = a;
  recycled.wid = a.weapon.id;
  projectiles._push(recycled);
  assert.equal(recycled.s3Weapon, a.weapon);
  assert.notEqual(recycled.s3Weapon, firedWeapon);
});

test('Splatling speed scalar view is reusable and compatible with PR868 native round spread', async () => {
  const f = await fixture(), a = f.make('splatling');
  a.setWeapon('splatling');
  const weapon = a.weapon, projectiles = new f.Projectiles(new f.THREE.Scene()), emitted = [];
  f.setRandom(() => 0.8);
  projectiles._fireRound = (_actor, config) => {
    const speed = config.projSpeed;
    const roundConfig = { ...config, projSpeed: speed };
    emitted.push({ config, speed, roundConfig });
    return new f.THREE.Vector3(0, 0, 1);
  };

  projectiles.fireSplatling(a, weapon, 0);
  projectiles.fireSplatling(a, weapon, 0);

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].config, emitted[1].config);
  for (const { config, speed, roundConfig } of emitted) {
    assert.equal(Object.isFrozen(config), true);
    assert.deepEqual(Object.keys(config).sort(), Object.keys(weapon).sort());
    assert.equal(roundConfig.kind, weapon.kind);
    assert.equal(roundConfig.id, weapon.id);
    assert.equal(roundConfig.damage, weapon.damage);
    assert.equal(roundConfig.referenceGravity, weapon.referenceGravity);
    assert.equal(roundConfig.projSpeed, speed);
    assert.ok(Number.isFinite(speed) && speed > 0);
  }
  assert.equal(emitted[0].config.projSpeed, weapon.projSpeed);

  let failedConfig;
  projectiles._fireRound = (_actor, config) => {
    failedConfig = config;
    throw new Error('native round consumer failed');
  };
  assert.throws(() => projectiles.fireSplatling(a, weapon, 0), /native round consumer failed/);
  assert.equal(failedConfig.projSpeed, weapon.projSpeed);
});

test('Slosher firing keeps native projectile fields and cached override config survives PR868 spread', async () => {
  const f = await fixture(), a = f.make('slosher'), weapon = a.weapon;
  const projectiles = new f.Projectiles(new f.THREE.Scene()), emitted = [];
  projectiles._push = projectile => emitted.push(projectile);
  projectiles.fireSlosh(a, weapon);

  assert.ok(emitted.length > 0);
  assert.equal(emitted[0].wid, weapon.id);
  assert.ok(Number.isFinite(emitted[0].damage));
  const temporary = Object.create(weapon);
  Object.defineProperty(temporary, 'temporaryMarker', { value: 31, enumerable: true });
  const cached = f.cachedWeaponOverrideConfig(new WeakMap(), temporary, 'drops', emitted.length);
  const sloshConfig = { ...cached, drops: emitted.length };
  assert.equal(sloshConfig.temporaryMarker, 31);
  for (const key of ['kind', 'id', 'damage', 'damageHead', 'damageTail', 'referenceGravity', 'impactRadius']) {
    assert.equal(sloshConfig[key], weapon[key], `PR868 Slosher spread preserves ${key}`);
  }
});
