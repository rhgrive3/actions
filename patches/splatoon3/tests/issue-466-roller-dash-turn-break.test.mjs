// #466: the Splat Roller dash has a separate turn-break target. Straight normal
// roll 6.48, straight dash from 90F 7.92, and a dash reversal capped at
// SpeedDashTurnBreak 0.108/frame (6.48 with the profile scale). The reversal
// threshold (> 90 degrees) and the instant return to 7.92 are INKWAVE choices,
// not published S3 values. Real WeaponRunner and Actor via the build fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { rollingMovementSpeed, dashTurnBreakActive } from '../runtime/movement-physics.mjs';

const DT = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}${m ? ` (${m})` : ''}`);
const ROLL_BASE = 6.48, ROLL_DASH = 7.92, TURN_BREAK = 6.48;

async function rolling() {
  const f = await fixture();
  const a = f.make('roller');
  const r = a.weaponRunner;
  a.grounded = true;
  a.intent.move.set(0, 0, 1);
  r.update(DT, { fire: true, firePressed: true });
  for (let i = 0; i < 42; i++) r.update(DT, { fire: true });
  assert.equal(r.rolling, true, 'must be rolling');
  return { f, a, r };
}

test('#466 the profile carries the sourced turn-break speed beside the other roll speeds', async () => {
  const { a } = await rolling();
  near(a.weapon.rollDashTurnBreakSpeed, TURN_BREAK, 'profile rollDashTurnBreakSpeed');
  near(a.weapon.rollDashTurnBreakSpeed, a.weapon.rollBaseSpeed, 'SpeedDashTurnBreak 0.108 = SpeedNormal 0.108');
  near(a.weapon.rollSpeed, ROLL_DASH, 'dash target unchanged');
});

test('#466 straight normal roll before 90F targets 6.48 and straight dash from 90F targets 7.92', async () => {
  const { a, r } = await rolling();
  a.vel.set(0, 0, ROLL_BASE);
  r.rollT = 89 / 60; near(rollingMovementSpeed(r), ROLL_BASE, 'straight normal');
  r.rollT = 90 / 60; a.vel.set(0, 0, ROLL_DASH); near(rollingMovementSpeed(r), ROLL_DASH, 'straight dash');
});

test('#466 a dash reversal (stick more than 90 degrees from travel) targets the turn-break speed', async () => {
  const { a, r } = await rolling();
  r.rollT = 2; a.vel.set(0, 0, ROLL_DASH);
  a.intent.move.set(0, 0, -1);
  assert.equal(dashTurnBreakActive(a), true, 'straight reversal');
  near(rollingMovementSpeed(r), TURN_BREAK, 'straight reversal target');
  // 120 degrees from travel is still a reversal.
  a.intent.move.set(Math.sin(2 * Math.PI / 3), 0, Math.cos(2 * Math.PI / 3));
  near(rollingMovementSpeed(r), TURN_BREAK, '120 degree turn target');
});

test('#466 a 90-degree turn and a stationary or near-zero stick do not enter the turn-break state', async () => {
  const { a, r } = await rolling();
  r.rollT = 2; a.vel.set(0, 0, ROLL_DASH);
  a.intent.move.set(1, 0, 0);
  assert.equal(dashTurnBreakActive(a), false, '90 degrees is not a reversal');
  near(rollingMovementSpeed(r), ROLL_DASH, '90 degree target');
  a.intent.move.set(0, 0, 0);
  near(rollingMovementSpeed(r), ROLL_DASH, 'stationary stick');
  a.intent.move.set(0, 0, -1); a.vel.set(0, 0, 0);
  near(rollingMovementSpeed(r), ROLL_DASH, 'near-zero velocity');
});

test('#466 returning to a non-reversing direction recovers the dash without resetting the dash state', async () => {
  const { a, r } = await rolling();
  r.rollT = 2; a.vel.set(0, 0, ROLL_DASH);
  a.intent.move.set(0, 0, -1);
  near(rollingMovementSpeed(r), TURN_BREAK, 'reversed');
  a.intent.move.set(0, 0, 1);
  near(rollingMovementSpeed(r), ROLL_DASH, 'recovered straight');
  assert.equal(r.rolling, true, 'still rolling');
  near(r.rollT, 2, 'dash timer kept');
});

test('#466 the composed actor holds the turn-break target while reversing, then recovers the dash', async () => {
  const { a, r } = await rolling();
  r.rollT = 2; a.vel.set(0, 0, ROLL_DASH);
  a.intent.move.set(0, 0, -1);
  let reversing = 0;
  for (let i = 0; i < 240; i++) {
    if (dashTurnBreakActive(a)) {
      reversing++;
      near(r.moveSpeed(), TURN_BREAK, `reversal frame ${i} target`);
    }
    a._horizontal(DT, false, false);
    r.update(DT, { fire: true });
    a.intent.move.set(0, 0, -1);
  }
  assert.ok(reversing > 0, 'the reversal must be observed while velocity still points forward');
  // Once the velocity has turned with the stick the cap no longer applies and the dash resumes.
  assert.ok(a.vel.z < 0, 'velocity follows the reversed stick');
  assert.ok(Math.abs(a.vel.length() - ROLL_DASH) < 0.01, `dash did not recover: ${a.vel.length()}`);
  assert.equal(r.rolling, true, 'still rolling');
});
