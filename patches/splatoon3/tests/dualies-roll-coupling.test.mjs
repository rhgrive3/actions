// Dualies roll presentation coupled to the roll's own travel (2026-11-05).
// Logic only: pure curves, the composed startup block, and the catalogue
// facing owner in the production composition. No retail joint data exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dualiesRollTravelFraction, dualiesRollTurnFraction, dualiesStartupProgress, DUALIES_ROLL_TURN, DUALIES_ROLL_DROP } from '../runtime/dualies-motion.mjs';
import { dodgeIntervalDistance } from '../runtime/movement-physics.mjs';
import { catalogDualiesIntervalDistance } from '../runtime/catalog-dualies-motion.mjs';
import { adaptIssue477Source } from '../issue-477-adapter.mjs';

test('travel fraction is the same distance profile that moves the actor', () => {
  for (const frames of [7, 12, 18]) {
    const dur = frames / 60;
    for (let f = 0; f <= frames; f++) {
      const u = f / frames;
      assert.ok(Math.abs(dualiesRollTravelFraction(u) - dodgeIntervalDistance(1, dur, 0, f / 60)) < 1e-12, 'cubic default');
      const motion = { t: 0, dur, distance: 1, kd: .82, startup: 0 };
      assert.ok(Math.abs(dualiesRollTravelFraction(u, .82, dur) - catalogDualiesIntervalDistance(motion, f / 60)) < 1e-9, 'geometric MoveStepKd');
    }
  }
});

test('turn follows travel, completes at 96% of the distance and lands without a snap', () => {
  let previous = 0, maxStep = 0;
  for (let i = 1; i <= 600; i++) {
    const u = i / 600, turn = dualiesRollTurnFraction(u), travel = dualiesRollTravelFraction(u);
    assert.ok(turn >= previous - 1e-12, 'monotonic');
    if (travel / DUALIES_ROLL_TURN.completeAtTravel <= 1 - DUALIES_ROLL_TURN.landingEase) assert.ok(Math.abs(turn - travel / .96) < 1e-12, 'turn = distance before the landing ease');
    maxStep = Math.max(maxStep, turn - previous); previous = turn;
  }
  assert.equal(dualiesRollTurnFraction(0), 0);
  assert.equal(dualiesRollTurnFraction(1), 1);
  // Completed once 96% of the ground is covered (cubic: u ~ .83).
  assert.ok(dualiesRollTurnFraction(.84) > .9999);
  // At 60 Hz over the shortest (7-frame) roll no frame turns more than ~80 degrees,
  // the same peak rate as the previous time-only curve (f1->f2), now at the push-off.
  for (let f = 1; f <= 7; f++) assert.ok((dualiesRollTurnFraction(f / 7) - dualiesRollTurnFraction((f - 1) / 7)) * 360 < 82);
  // Unlike the time-only curve, the body already turns while it moves fastest.
  assert.ok(dualiesRollTurnFraction(1 / 7) > .2);
  // Landing ease is C1: slope at the end of the turn is ~0.
  const end = (() => { for (let u = 0; u <= 1; u += 1e-4) if (dualiesRollTurnFraction(u) >= 1 - 1e-9) return u; return 1; })();
  assert.ok((dualiesRollTurnFraction(end) - dualiesRollTurnFraction(end - .005)) < .002);
});

test('startup leans in progressively and lowers the body to the roll drop', () => {
  assert.equal(dualiesStartupProgress(null), 1);
  assert.equal(dualiesStartupProgress({ startupDur: 0 }), 1);
  const d = { startupDur: 4 / 60, startup: 4 / 60 };
  const seen = [];
  for (let f = 0; f <= 4; f++) { d.startup = (4 - f) / 60; seen.push(dualiesStartupProgress(d)); }
  assert.deepEqual(seen.map(v => +v.toFixed(3)), [0, .156, .5, .844, 1]);
  assert.equal(DUALIES_ROLL_DROP, .26);
  const raw = fs.readFileSync(new URL('../runtime/dualies-motion.mjs', import.meta.url), 'utf8');
  const composed = adaptIssue477Source('patches/splatoon3/runtime/dualies-motion.mjs', raw);
  assert.match(composed, /const lean = dualiesStartupProgress\(s\.runner\?\.dodge\);/);
  assert.match(composed, /this\.tumbleDrop = DUALIES_ROLL_DROP \* lean;/);
  assert.match(composed, /const tucked = motion\?\.startupDur > 0 \? Math\.max\(s\.progress, \.1\) : s\.progress;/);
  assert.match(composed, /2 \* Math\.PI \* dualiesRollTurnFraction\(s\.progress, motion\)/);
});

test('catalogue Dualies hold the aiming stance through roll, slide and turret, like legacy Dualies', async () => {
  const { fixture } = await import('./source-fixture.mjs');
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, vmMathRandom: () => .5 });
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  const rows = {};
  for (const id of ['dualies', 's3-maneuver-short', 's3-maneuver-long']) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = f.make(id);
    a.form = 'kid'; a.grounded = true; a.ink = 100; a.invuln = 0;
    a.pos.set(0, 5, 0); a.vel.set(0, 0, 0); a.aimYaw = a.yaw = 0; a.aimPitch = 0;
    a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 6.05, 50);
    a.intent.fire = true;
    const r = a.weaponRunner, right = a.vel.clone().set(1, 0, 0);
    assert.equal(r.tryDodge(right), true, id + ' roll admitted');
    // Actor._face turns toward the aim only while firingPose() holds; otherwise
    // it turns toward the stick / velocity (the roll direction). The roll,
    // its slide and the turret must all hold it, from the first frame.
    let posed = 0, frames = 0, first = -1;
    for (; frames < 50; frames++) {
      a.intent.fire = true; a.intent.move.copy(right);   // stick held toward the roll
      f.tick(a);
      if (r.firingPose()) posed++; else if (first < 0) first = frames;
    }
    rows[id] = { posed, firstUnposed: first };
    assert.equal(posed, frames, `${id}: aiming stance held through roll, slide and turret (first unposed frame ${first})`);
  }
  console.log('DUALIES_FACING', JSON.stringify(rows));
});
