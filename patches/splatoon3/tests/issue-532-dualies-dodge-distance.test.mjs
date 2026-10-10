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
const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

test('#532 Splat Dualies profile sets the sourced 5.0 roll distance and keeps the 12F roll time', async () => {
  const f = await fixture({ composeProductionAdapters: true });
  const a = f.make('dualies');
  assert.equal(a.weapon.rollDist, TOTAL_DISTANCE);
  assert.ok(Math.abs(a.weapon.rollTime - ROLL_FRAMES / 60) < 1e-12);
});

for (const [x, z] of DIRECTIONS) {
  test(`#532 one Splat Dualies roll covers 5.0 units from rest in direction (${x}, ${z})`, async () => {
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
    assert.ok(Math.abs(Math.hypot(sx, sz) - TOTAL_DISTANCE) < 1e-6,
      `total displacement ${Math.hypot(sx, sz).toFixed(6)} should equal ${TOTAL_DISTANCE}`);
    assert.ok(Math.abs(sx - x * TOTAL_DISTANCE) < 1e-6 && Math.abs(sz - z * TOTAL_DISTANCE) < 1e-6,
      'displacement follows the input direction');
  });
}
