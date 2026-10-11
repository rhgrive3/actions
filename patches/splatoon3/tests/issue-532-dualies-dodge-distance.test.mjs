import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

// #532: Splat Dualies roll displacement budget. Sources: Splatoon Wiki "Splat Dualies"
// (4.0 units during the roll animation + 1.0 unit of slide afterwards = 5.0 total) and
// the Splatoon Wiki measured table "User:XarrotD/newdata" (5.0 DU, 4f startup, 12f roll).
// The DU-to-INKWAVE world-unit scale is NOT sourced (Splatoon Wiki "DU" calls the metre
// label unofficial); the value follows the repo's 1:1 raw-number convention and the
// physical scale remains 未確認. Startup 4F, roll 12F, and the 4F post-roll gate are unchanged.
const DT = 1 / 60;
const ROLL_FRAMES = 12;
const TOTAL_DISTANCE = 5;
const MOVING_ROLL_DISTANCE = 4;
const POST_ROLL_GLIDE_DISTANCE = TOTAL_DISTANCE - MOVING_ROLL_DISTANCE;
const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

test('#532 Splat Dualies profile sets the sourced 5.0 roll distance and keeps the 12F roll time', async () => {
  const f = await fixture({ composeProductionAdapters: true });
  const a = f.make('dualies');
  assert.equal(a.weapon.rollDist, TOTAL_DISTANCE);
  assert.ok(Math.abs(a.weapon.rollTime - ROLL_FRAMES / 60) < 1e-12);
});

for (const [x, z] of DIRECTIONS) {
  test(`#532 12F moving roll covers 4.0 units before the separate 1.0 glide in direction (${x}, ${z})`, async () => {
    const f = await fixture({ composeProductionAdapters: true });
    const a = f.make('dualies');
    a.intent.fire = true;
    a.intent.move.set(x, 0, z);
    assert.equal(a.weaponRunner.tryDodge(a.intent.move), true, 'roll admitted');

    let sx = 0, sz = 0, owned = 0;
    for (let n = 0; n < 40 && a.weaponRunner.dodge; n++) {
      if (a.weaponRunner.dodgeVel(a.vel, DT)) {
        sx += a.vel.x * DT;
        sz += a.vel.z * DT;
        owned++;
      }
      a.weaponRunner.update(DT, { fire: true });
    }

    assert.equal(owned, ROLL_FRAMES, 'dodge-owned movement phase is exactly 12F');
    // The weapon's 5.0 budget is split into a 12F moving roll (4.0) and a
    // separate 4F post-roll glide (1.0). This runner-only harness cannot
    // integrate the actor-owned glide; weapon-audit-1130.test.mjs does so.
    assert.equal(a.weapon.rollDist, MOVING_ROLL_DISTANCE + POST_ROLL_GLIDE_DISTANCE);
    assert.ok(Math.abs(Math.hypot(sx, sz) - MOVING_ROLL_DISTANCE) < 1e-6,
      `moving roll displacement ${Math.hypot(sx, sz).toFixed(6)} should equal ${MOVING_ROLL_DISTANCE}`);
    assert.ok(Math.abs(sx - x * MOVING_ROLL_DISTANCE) < 1e-6 && Math.abs(sz - z * MOVING_ROLL_DISTANCE) < 1e-6,
      '12F moving-roll displacement follows the input direction');
  });
}
