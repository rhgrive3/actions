// Issue #245: Splatoon 3 Ver.11.3.0 holds a ground throwing stance at a fixed
// 0.72 DU/f, which is 0.75 of the 0.96 medium walk, and Run Speed Up gear does
// not apply while the throw button is held.
//
// These regressions drive the REAL installed Actor/WeaponRunner through the
// build adapter (weapon-edgecases-fixture). Neither moveSpeed() nor
// Actor._horizontal is stubbed, so the grounded/airborne admission that
// Actor._horizontal actually performs is what is under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const RUN_SPEED_GEAR = 1.5; // 57AP Human Speed Up
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// Real actor, grounded, with a real R hold through the real input path.
async function aiming(weapon = 'splatling', { gear = 1, grounded = true } = {}) {
  const f = await fixture();
  const a = f.make(weapon);
  f.G.actors = [a];
  f.G.projectiles.throwBomb = () => {};
  a.grounded = grounded;
  a.s3.modifiers.runSpeed = gear;   // 0AP = 1, 57AP Human Speed Up = 1.5
  a.intent.sub = true;
  f.tick(a, 2);
  assert.equal(a.weaponRunner.aimingSub, true, 'a real R hold must cock the sub');
  return { f, a, speed: a.weaponRunner.moveSpeed() };
}
async function walking(weapon = 'splatling', { gear = 1 } = {}) {
  const f = await fixture();
  const a = f.make(weapon);
  f.G.actors = [a];
  a.grounded = true;
  a.s3.modifiers.runSpeed = gear;
  f.tick(a, 2);
  assert.equal(a.weaponRunner.aimingSub, false);
  return { f, a, speed: a.weaponRunner.moveSpeed() };
}

test('#245 grounded R hold caps at 0.75 of normal walk and drops Run Speed Up', async () => {
  const f0 = await fixture();
  const cap = f0.PLAYER.runSpeed * 0.75;   // from the installed profile, not a literal

  const walk0 = await walking('splatling', { gear: 1 });
  const walk57 = await walking('splatling', { gear: RUN_SPEED_GEAR });
  const aim0 = await aiming('splatling', { gear: 1 });
  const aim57 = await aiming('splatling', { gear: RUN_SPEED_GEAR });

  close(aim0.speed, cap);
  close(aim0.speed / walk0.speed, 0.75);              // 0AP idle hold ratio
  close(aim57.speed / aim0.speed, 1.00, 1e-12);       // 57AP must not apply while held
  // Gear is untouched whenever the throw button is not held.
  close(walk57.speed / walk0.speed, RUN_SPEED_GEAR);
});

test('#245 every weapon idles at the same fixed cap while the throw button is held', async () => {
  const f0 = await fixture();
  const cap = f0.PLAYER.runSpeed * 0.75;
  for (const kind of Object.keys(f0.WEAPONS)) {
    const { speed } = await aiming(kind, { gear: RUN_SPEED_GEAR });
    close(speed, cap, 1e-9);   // a held bomb is one fixed ground speed, not per weapon
  }
});

test('#245 airborne steering is unchanged: the cap is grounded-humanoid only', async () => {
  // Pre-fix control: the same real airborne actor, throw button NOT held.
  const airIdle = await walking('splatling', { gear: RUN_SPEED_GEAR });
  const airAim = await aiming('splatling', { gear: RUN_SPEED_GEAR, grounded: false });
  close(airAim.speed, airIdle.speed, 1e-12);

  // And the grounded actor is still capped, proving the gate is the only change.
  const groundAim = await aiming('splatling', { gear: RUN_SPEED_GEAR });
  const f0 = await fixture();
  assert.ok(groundAim.speed < airIdle.speed, 'grounded hold is capped, airborne is not');
  close(groundAim.speed, f0.PLAYER.runSpeed * 0.75);
});

test('#245 squid form is not a ground humanoid and keeps the original path', async () => {
  const { a } = await aiming('splatling', { gear: RUN_SPEED_GEAR });
  assert.equal(a.grounded, true);
  const f0 = await fixture();
  a.form = 'squid';
  a.s3.modifiers.runSpeed = RUN_SPEED_GEAR;
  a.weaponRunner.aimingSub = true;
  close(a.weaponRunner.moveSpeed(), f0.PLAYER.runSpeed * RUN_SPEED_GEAR);
});

test('#245 releasing the throw button restores the gear multiplier', async () => {
  const f = await fixture();
  const a = f.make('splatling');
  f.G.actors = [a];
  f.G.projectiles.throwBomb = () => {};
  a.grounded = true;
  a.s3.modifiers.runSpeed = RUN_SPEED_GEAR;
  const before = a.weaponRunner.moveSpeed();

  a.intent.sub = true;
  f.tick(a, 2);
  assert.equal(a.weaponRunner.aimingSub, true);
  const held = a.weaponRunner.moveSpeed();
  assert.ok(held < before, 'the hold caps the speed');

  a.intent.sub = false;
  a._prevIntent.sub = false;   // real release edge, same idiom as weapon-edgecases
  f.tick(a, 3);
  assert.equal(a.weaponRunner.aimingSub, false, 'release clears the hold');
  close(a.weaponRunner.moveSpeed(), before);   // gear is back immediately
});
