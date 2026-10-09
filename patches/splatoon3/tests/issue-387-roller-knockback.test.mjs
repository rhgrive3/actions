// #387 regression: Roller-body rolling contact knockback responses for opponent and roller player
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { applyRollerBodyKnockback, ROLLER_BODY_COLLISION } from '../runtime/roller.mjs';

const near = (actual, expected, eps = 1e-4) =>
  assert.ok(Math.abs(actual - expected) < eps, `Expected ${expected}, got ${actual}`);

test('#387 applyRollerBodyKnockback applies S3 opponent and player damage-on/damage-off responses', () => {
  const divisor = ROLLER_BODY_COLLISION.duPerWorldUnit * ROLLER_BODY_COLLISION.referenceHz; // 600

  // 1. Min speed rolling contact (hs = 1.0), damage on
  {
    const attacker = {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 1.0 },
      weapon: { rollSpeed: 7.92 },
      yaw: 0,
    };
    const victim = {
      pos: { x: 0, y: 0, z: 1.0 }, // ahead along +z
      vel: { x: 0, y: 0, z: 0 },
      alive: true,
    };

    const applied = applyRollerBodyKnockback(attacker, victim, 125);
    assert.equal(applied, true);

    // Opponent min accel = 420
    const expectedOppDv = 420 / divisor;
    near(victim.vel.z, expectedOppDv);
    near(victim.vel.x, 0);

    // Roller damage-on min accel = 410 -> recoil backward (-z)
    const expectedRollerDv = 410 / divisor;
    near(attacker.vel.z, 1.0 - expectedRollerDv);
    near(attacker.vel.x, 0);
  }

  // 2. Max speed rolling contact (hs = 7.92), damage on
  {
    const attacker = {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 7.92 },
      weapon: { rollSpeed: 7.92 },
      yaw: 0,
    };
    const victim = {
      pos: { x: 0, y: 0, z: 1.0 },
      vel: { x: 0, y: 0, z: 0 },
      alive: true,
    };

    applyRollerBodyKnockback(attacker, victim, 125);

    // Opponent max accel = 800
    const expectedOppDv = 800 / divisor;
    near(victim.vel.z, expectedOppDv);

    // Roller damage-on max accel = 550
    const expectedRollerDv = 550 / divisor;
    near(attacker.vel.z, 7.92 - expectedRollerDv);
  }

  // 3. Damage-off case (damage = 0) selects KnockBackRollerPlayerDamageOff
  {
    const attacker = {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 5.0 },
      weapon: { rollSpeed: 7.92 },
      yaw: 0,
    };
    const victim = {
      pos: { x: 0, y: 0, z: 1.0 },
      vel: { x: 0, y: 0, z: 0 },
      alive: true,
    };

    applyRollerBodyKnockback(attacker, victim, 0); // 0 damage

    // Roller damage-off fixed accel = 280 (AccelMin = 280, AccelMax = 280)
    const expectedRollerDv = 280 / divisor;
    near(attacker.vel.z, 5.0 - expectedRollerDv);
  }
});

test('#387 rolling contact against survivable opponent produces post-contact knockback in fixture', async () => {
  const f = await fixture();
  const roller = f.make('roller');
  roller.pos.set(0, 0, 0);
  roller.vel.set(0, 0, 4.0); // forward rolling speed
  roller.yaw = 0;
  roller.team = 0;
  roller.grounded = true;
  roller.intent.move.set(0, 0, 1);
  roller.weaponRunner.rolling = true;
  roller.weaponRunner.lastRollPos = roller.pos.clone();

  const victim = f.make('shooter');
  victim.pos.set(0, 0, 0.8); // in front of drum
  victim.vel.set(0, 0, 0);
  victim.team = 1; // opposing team
  victim.hp = 200; // survivable HP

  f.G.actors = [roller, victim];

  let appliedHit = false;
  f.G.projectiles.applyHit = (atk, vic, dmg, type) => {
    appliedHit = true;
    vic.hp -= dmg;
    return 'applied';
  };

  // Run roller tick with fire held
  roller.weaponRunner._roller(1 / 60, { fire: true, firePressed: false }, roller.weapon);

  assert.equal(appliedHit, true, 'rolling contact hit should be applied');
  assert.equal(victim.hp, 200 - roller.weapon.rollDamage, 'roll damage applied once');

  // Verify post-contact velocity changes:
  assert.ok(victim.vel.z > 0, 'victim should be knocked forward by roller contact');
  assert.ok(roller.vel.z < 4.0, 'roller player should experience recoil deceleration');
});
