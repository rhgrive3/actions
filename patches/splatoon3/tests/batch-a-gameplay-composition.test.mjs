import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

/**
 * Batch A Combined Gameplay Composition Regression Test Suite
 *
 * Scope: Orchestrator A owned issues:
 *   - #377: Splat Charger charging movement speed initial-frame clamp (1.2 WU/s vs lerp 3.855 WU/s)
 *   - #386: Squid Roll consecutive chain reset window (~90F community reference vs 60F baseline)
 *   - #390: Splat Charger stored charge cancellation upon ZR release during charge keep
 *   - #726: 1F humanoid startup before the charge frames (entry/frame anchors below shifted +1F)
 *
 * Unified Scenario:
 *   1. Press ZR from tick 0: the #726 1F startup frame does not charge; movement speed is
 *      clamped to 1.2 WU/s immediately at the charging entry on tick 1 (#377).
 *   2. Reach full charge (1F startup + 60 ticks / 1.0167s), submerge into friendly ink holding fire -> charge stored (#390).
 *   3. Initiate first squid roll with physical held fire -> roll launches, charge keep maintained (#390/#386).
 *   4. While submerged with stored charge (60F remaining), release fire trigger -> store cancelled immediately
 *      without firing shot or consuming ink (#390, per evidence/charge-keep-reference-adjudication.md).
 *   5. Resurface into kid form and start fresh charging -> charge starts from 0, never resurrecting full charge (#390).
 *   6. At 70F after the first roll (within ~90F window), execute second action (floor roll or wall roll) ->
 *      chain count is retained (exactly 2) and launch speed applies 0.85 retention penalty (#386).
 *
 * Fixed Clock Schedules:
 *   Advance using FixedClock at 30Hz, 60Hz, and 120Hz schedules and verify invariant simulation outputs.
 *
 * Unchanged Baseline Lifecycle Checks:
 *   Verify Actor.reset(), splat(), and setWeapon() properly clear charge keep state.
 */

async function runScenario(hz, { secondAction = 'floor', keepSquid = false } = {}) {
  const f = await fixture();
  const a = f.make('charger');
  const clock = new FixedClock();
  const obs = {};

  const totalSeconds = 2.5; // 150 simulation ticks at 60 Hz
  const frames = Math.round(totalSeconds * hz);

  for (let fIdx = 0; fIdx < frames; fIdx++) {
    clock.advance(1 / hz, dt => {
      const t = clock.ticks;

      // Phase 1: Tick 0: press ZR on the #726 1F humanoid startup frame
      if (t === 0) {
        a.intent.fire = true;
        a.intent.move.set(0, 0, 1);
      }

      f.G.time += dt;
      a.update(dt);

      if (t === 0) {
        obs.firstTickMoveSpeed = a.weaponRunner.moveSpeed();
        obs.firstTickCharging = a.weaponRunner.charging;
        obs.firstTickCharge = a.weaponRunner.charge;
      }
      if (t === 1) {
        // #377 clamp now observes at the charging entry tick (startup 1F prior).
        obs.entryTickCharging = a.weaponRunner.charging;
        obs.entryTickMoveSpeed = a.weaponRunner.moveSpeed();
      }

      // Phase 2: Tick 60..61: full charge at 1F startup + 60 charge frames (#726),
      // then submerge into friendly ink holding fire -> charge stored (#390).
      if (t === 60) {
        a.intent.squid = true;
        a._squidPressT = f.G.time;
      }
      if (t === 61) {
        obs.submerged = a.submerged;
        obs.storedOnSubmerge = a.weaponRunner.s3Stored ? { ...a.weaponRunner.s3Stored } : null;
      }

      // Phase 3: Tick 61: Initiate first roll while holding physical fire
      if (t === 61) {
        a.vel.set(0, 0, 11.52);
        a.intent.move.set(0, 0, -1);
        a.intent.jump = true;
        a._jumpPressT = f.G.time;
      }
      if (t === 62) {
        a.intent.jump = false;
        obs.roll1Active = !!a.s3.actions.roll;
        obs.roll1Chain = a.s3.actions.chain;obs.roll1LaunchSpeed=a.s3.actions.chainSpeed;
        obs.roll1Stored = a.weaponRunner.s3Stored ? { ...a.weaponRunner.s3Stored } : null;
      }

      // Phase 4: Tick 75: Release physical fire while submerged (15 ticks into store, ~60 ticks remaining)
      if (t === 75) {
        a.grounded = true; // roll landed back in friendly ink
        a.ink = 50; // meaningful partial-ink case
        obs.inkBeforeCancel = a.ink;
        obs.lastFireBeforeCancel = a.lastFire;
        obs.cooldownBeforeCancel = a.weaponRunner.cooldown;
        a.intent.fire = false;
      }
      if (t === 76) {
        obs.storeAfterRelease = a.weaponRunner.s3Stored ? { ...a.weaponRunner.s3Stored } : null;
        obs.shotsOnRelease = f.shots.length;
        obs.inkOnRelease = a.ink;
        obs.lastFireOnRelease = a.lastFire;
        obs.cooldownOnRelease = a.weaponRunner.cooldown;
      }
      if (t === 79) {
        obs.inkAfterRefill = a.ink;
      }

      // Phase 5: Tick 80: Re-emerge to kid form
      if (t === 80 && !keepSquid) {
        a.intent.squid = false;
      }
      // Tick 85: Start fresh charging after cancellation
      if (t === 85 && !keepSquid) {
        a.intent.fire = true;
      }
      if (t === 86 && !keepSquid) {
        obs.reemergeCharge = a.weaponRunner.charge;
        obs.reemergeCharging = a.weaponRunner.charging;
        // Stop firing, return to squid for the upcoming 70F roll action
        a.intent.fire = false;
        a.intent.squid = true;
        a._squidPressT = f.G.time;
      }

      // Phase 6: Tick 61 + 70 = 131: Second action at 70F after first roll (floor roll or wall roll)
      if (t === 131) {
        if (secondAction === 'wall') {
          a._updateClimb = () => {};
          a.climbing = true;
          a.wallN.set(0, 0, 1);
          a.intent.move.set(0, 0, 1);
          a.vel.set(0, 11.52, 0);
        } else {
          a.grounded = true;
          a.vel.set(0, 0, 11.52);
          a.intent.move.set(0, 0, -1);
        }
        a.intent.jump = true;
        a._jumpPressT = f.G.time;
      }
      if (t === 132) {
        a.intent.jump = false;
        obs.secondActionChain = a.s3.actions.chain;
        obs.secondActionTimer = a.s3.actions.chainTimer;
        obs.secondActionSpeed = Math.hypot(a.vel.x, a.vel.z);
        obs.squidrollTriggers = a.character.events.filter(e => e[0] === 'squidroll').length;
      }
    });
  }

  return { hz, secondAction, obs, ticks: clock.ticks };
}

test('fixed clock schedules 30/60/120Hz produce invariant simulation traces', async () => {
  const r30 = await runScenario(30);
  const r60 = await runScenario(60);
  const r120 = await runScenario(120);

  assert.equal(r30.ticks, 150, '30Hz schedule advances 150 simulation ticks');
  assert.equal(r60.ticks, 150, '60Hz schedule advances 150 simulation ticks');
  assert.equal(r120.ticks, 150, '120Hz schedule advances 150 simulation ticks');

  assert.deepEqual(r30.obs, r60.obs, '30Hz schedule matches 60Hz schedule');
  assert.deepEqual(r120.obs, r60.obs, '120Hz schedule matches 60Hz schedule');
});

test('store while holding fire and roll maintaining charge (#390 / #386 baseline)', async () => {
  const { obs } = await runScenario(60);
  assert.equal(obs.submerged, true, 'actor is submerged in friendly ink');
  assert.ok(obs.storedOnSubmerge !== null, 'charge keep stored on submerge');
  assert.equal(obs.storedOnSubmerge.charge, 1, 'full charge stored');
  assert.equal(obs.roll1Active, true, 'first roll launched');
  assert.equal(obs.roll1Chain, 1, 'first roll increments chain');
  assert.ok(obs.roll1Stored !== null, 'charge keep maintained during roll with fire held');
  assert.equal(obs.roll1Stored.charge, 1, 'stored charge remains 1.0 during roll');
});

test('Issue #377 regression: charger charging movement speed capped at 1.2 WU/s from charging entry', async () => {
  const { obs } = await runScenario(60);
  // #726: the ZR edge is the 1F humanoid startup, so tick 1 is not charging and
  // keeps the uncharged run speed. S3 MoveSpeedFullCharge = 0.02 DU/frame
  // (pinned 0.02, not 0.20; 1.2 WU/s at 60Hz) then clamps immediately on the
  // charging entry tick without slow ease (#377 unchanged).
  assert.equal(obs.firstTickCharging, false, 'Charger is in its 1F startup on tick 1');
  assert.equal(obs.firstTickCharge, 0, 'the startup tick advances no charge progress');
  assert.equal(obs.entryTickCharging, true, 'Charger enters charging state on tick 2');
  assert.ok(obs.entryTickMoveSpeed <= 1.2 + 1e-5, `Expected <= 1.2 WU/s at charging entry, got ${obs.entryTickMoveSpeed}`);
});

test('Issue #386 regression: roll-chain second floor action at 70F retains .85 attenuation', async () => {
  const { obs } = await runScenario(60, { secondAction: 'floor', keepSquid:true });
  // S3 roll chain window is ~90F (1.5s). At 70F (1.167s), chain must remain active (chain === 2) and retain 0.85 speed.
  assert.equal(obs.squidrollTriggers, 2, `Expected exactly 2 real squidroll triggers to prove second action launched, got ${obs.squidrollTriggers}`);
  assert.equal(obs.secondActionChain, 2, `Expected chain === 2 at 70F (90F window), got ${obs.secondActionChain}`);
  assert.ok(Math.abs(obs.secondActionSpeed - 11.52 * 0.85) < 1e-5, `Expected speed == ${11.52 * 0.85} WU/s, got ${obs.secondActionSpeed}; first=${obs.roll1LaunchSpeed}`);
});

test('Issue #386 regression: roll-chain second wall action at 70F retains .85 attenuation', async () => {
  const { obs } = await runScenario(60, { secondAction: 'wall', keepSquid:true });
  assert.ok(Math.abs(obs.roll1LaunchSpeed - 11.52) < 1e-5, 'first real floor launch records 11.52');
  // #808 keeps the prior floor launch across wall reattachment; the vertical
  // climb velocity does not replace the shared roll history with wall minimum.
  assert.equal(obs.squidrollTriggers, 2, `Expected exactly 2 real squidroll triggers to prove second action launched, got ${obs.squidrollTriggers}`);
  assert.equal(obs.secondActionChain, 2, `Expected chain === 2 at 70F (90F window), got ${obs.secondActionChain}`);
  assert.ok(Math.abs(obs.secondActionSpeed - obs.roll1LaunchSpeed * 0.85) < 1e-5, `Expected speed == ${obs.roll1LaunchSpeed * 0.85} WU/s, got ${obs.secondActionSpeed}`);
});

test('Issue #390 regression: releasing fire while squid cancels store without shot or ink consumption', async () => {
  const { obs } = await runScenario(60);
  // Releasing ZR while submerged must immediately extinguish stored charge.
  assert.equal(obs.storeAfterRelease, null, 'Releasing fire in squid must immediately cancel stored charge');
  assert.equal(obs.shotsOnRelease, 0, 'No projectile fired on store cancellation');
  // Captured with meaningful partial ink (50) so assertions cannot rely on tank capped at 100
  assert.equal(obs.inkOnRelease, obs.inkBeforeCancel, 'No ink consumed on store cancellation');
  assert.ok(Math.abs(obs.lastFireOnRelease - (obs.lastFireBeforeCancel + 1 / 60)) < 1e-9, 'lastFire only advances by the simulation tick');
  assert.ok(Math.abs(obs.cooldownOnRelease - (obs.cooldownBeforeCancel - 1 / 60)) < 1e-9, 'cooldown only decays by the simulation tick');
  // #1070: cancelling a stored charge owns a 3F recovery lock; sample after that boundary.
  assert.ok(obs.inkAfterRefill > obs.inkOnRelease, 'Legitimate ink refill resumes after the 3F stored-charge cancellation delay');
});

test('Issue #390 regression: re-emerge fresh charging never resurrects full charge', async () => {
  const { obs } = await runScenario(60);
  // Re-emerging after store cancellation must charge fresh from 0, not resurrect charge = 1.
  assert.ok(obs.reemergeCharge < 0.1, `Expected fresh charge < 0.1, got resurrected ${obs.reemergeCharge}`);
});

test('lifecycle resets, death and weapon switch clear stored charge on unchanged baseline', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.weaponRunner.s3Stored = { charge: 1, remaining: 1.25 };
  a.weaponRunner.charge = 1;

  a.reset();
  assert.equal(a.weaponRunner.s3Stored, null, 'a.reset() clears s3Stored');
  assert.equal(a.weaponRunner.charge, 0, 'a.reset() clears charge');

  a.weaponRunner.s3Stored = { charge: 1, remaining: 1.25 };
  a.splat(null, 'water');
  assert.equal(a.weaponRunner.s3Stored, null, 'a.splat() clears s3Stored');
  assert.equal(a.alive, false, 'a.splat() marks dead');

  a.reset();
  a.weaponRunner.s3Stored = { charge: 1, remaining: 1.25 };
  a.setWeapon('shooter');
  assert.equal(a.weaponRunner.s3Stored, null, 'a.setWeapon() clears s3Stored');
  assert.equal(a.weaponId, 'shooter');
});
