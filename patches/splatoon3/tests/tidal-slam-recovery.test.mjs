import test from 'node:test';
import assert from 'node:assert/strict';
import { getBoot, STEP } from './tidal-slam-fixture.mjs';

// #924 Tidal Slam does not freeze natural HP recovery for the action.
// Logic-only: production installer on the real composed Actor; not a browser or Switch comparison.

test.after(async () => { (await getBoot()).close(); });

// Two identical wounded actors; one runs the Slam action. Entering the action alone must not suppress HP gain.
async function pair(f, hp = 50) {
  f.G.actors = []; const control = f.make({ pos: [-20, 0, 0] }), slam = f.make({ pos: [20, 0, 0] });
  for (const a of [control, slam]) { a.hp = hp; a.lastDamage = 5; }
  return { control, slam };
}
test('#924 Tidal Slam keeps natural HP recovery running for the whole action', async () => {
  const f = await getBoot(), { control, slam } = await pair(f), rate = f.profile.resources.regenRate;
  slam.special = slam.specialCost(); slam.intent.special = true;
  let ticks = 0;
  const step = () => { f.tick(slam); f.tick(control); ticks++; slam.intent.special = false; };
  step(); assert.equal(slam.specialActive?.id, 'slam');
  let previous = slam.hp, active = 0;
  while (slam.specialActive && ticks < 240) { step(); if (slam.specialActive) { active++; assert.ok(slam.hp > previous, `tick ${ticks}: HP rises during the action`); } previous = slam.hp; }
  assert.ok(active > 30, 'the action spans many fixed ticks');
  assert.equal(slam.specialActive, null);
  assert.ok(Math.abs(slam.hp - control.hp) < 1e-9, `identical gain with and without the special (${slam.hp} vs ${control.hp})`);
  assert.ok(Math.abs(slam.hp - (50 + rate * STEP * ticks)) < 1e-9, 'ordinary non-submerged rate every tick, including the activation tick');
});

test('#924 recovery stays capped at full HP, and new damage during the action resets the recovery delay', async () => {
  const f = await getBoot(), { slam } = await pair(f, 99.9), { PLAYER } = f;
  slam.special = slam.specialCost(); slam.intent.special = true; f.tick(slam); slam.intent.special = false;
  f.tick(slam, 5); assert.equal(slam.hp, PLAYER.hp, 'never exceeds full HP');
  const second = await pair(f, 50), hurt = second.slam, attacker = f.make({ team: 1, pos: [30, 0, 0] });
  hurt.special = hurt.specialCost(); hurt.intent.special = true; f.tick(hurt); hurt.intent.special = false; f.tick(hurt, 10);
  const before = hurt.hp; assert.ok(before > 50);
  attacker.invuln = 0; hurt.damage(10, attacker, 'weapon'); // slam armor scales it; recovery delay still restarts
  const after = hurt.hp; assert.ok(after < before);
  f.tick(hurt, 20); assert.ok(hurt.specialActive, 'still inside the action');
  assert.equal(hurt.hp, after, 'no recovery inside the post-damage delay');
});

test('#924 enemy ink still suppresses the recovery step (independent rule)', async () => {
  const f = await getBoot(), { slam } = await pair(f);
  slam.grounded = true; slam.ground.hit = true; slam.ground.face = 0; slam.form = 'kid';
  f.updateHealthRecovery(slam, STEP, true, false); // enemy surface suppresses natural recovery
  assert.equal(slam.hp, 50);
  f.updateHealthRecovery(slam, STEP, false, false); // own/neutral surface: ordinary rate
  assert.ok(slam.hp > 50);
});
