import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { SPLATLING_INTERRUPT, splatlingInterrupt, tickSplatlingInterrupt } from '../runtime/weapons.mjs';

// Issue #679 — Splatoon 3 Ver. 11.3.0 charge interruption (Heavy Splatling):
// cancelling an established charge with a later ZL press keeps the kid form
// through the 6f interruption recovery. Squid form becomes eligible at the 6F
// boundary; sub admission (5f) and ink recovery (29f) are separate, unmodelled
// boundaries of the same reference table.
//
// Regression: before the fix, `WeaponRunner.busy()` returned false for a newer
// squid press on kind 'splatling', and Actor.update evaluates form admission
// before weaponRunner.update(), so the actor became squid on the very update
// that carried the ZL edge and `_splatling` cleared the charge in that tick.

const FRAME = 1 / 60;
const EPS = 1e-9;

async function chargingActor(f, frames = 48) {
  const a = f.make('splatling');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, frames);
  assert.ok(a.weaponRunner.charging, 'precondition: charge established');
  assert.equal(a.form, 'kid', 'precondition: humanoid while charging');
  return a;
}

test('#679: a charge-canceling ZL press holds squid admission for the 6f recovery', async () => {
  const f = await fixture();
  const a = await chargingActor(f);
  const r = a.weaponRunner;

  a.intent.squid = true;                 // ZL edge: _squidPressT becomes the newest press
  const transitions = [];
  let previousForm = a.form;

  for (let update = 1; update <= 6; update++) {
    f.tick(a);
    if (a.form !== previousForm) transitions.push({ update, form: a.form });
    previousForm = a.form;
    // Decisions are taken at the update boundary: with 5 completed
    // interruption frames the recovery still owns the form decision.
    assert.equal(a.form, 'kid', `still humanoid at interruption update ${update}`);
    assert.ok(r.charging, 'the charge is not cleared before the cancel commits');
    assert.ok(r.charge > 0, 'charge progress is retained until the cancel commits');
    assert.equal(r.streaming, false, 'the cancel never starts a burst');
    assert.equal(f.shots.length, 0, 'the cancel never emits Splatling projectiles');
  }
  assert.equal(transitions.length, 0, 'no form transition happens before the boundary');

  f.tick(a);                              // 6 completed frames: the 6F boundary
  assert.equal(a.form, 'squid', 'squid form is admitted at the 6F interruption boundary');
  if (a.form !== previousForm) transitions.push({ update: 7, form: a.form });
  assert.equal(transitions.length, 1, 'exactly one authoritative form transition, no extra snap');
  assert.equal(r.charging, false, 'the committed cancel clears the charge');
  assert.equal(r.charge, 0, 'the charge is cleared once, at commit');
  assert.equal(r.streaming, false, 'the cancel never converts into a release/stream');
  assert.equal(f.shots.length, 0, 'no projectile was emitted by the cancel');

  f.tick(a, 12);
  assert.equal(f.shots.length, 0, 'no delayed burst appears after the cancel');
  assert.equal(a.form, 'squid');
});

test('#679: the recovery is armed by the press edge and consumed on the authoritative weapon update', async () => {
  const f = await fixture();
  const a = await chargingActor(f);
  const r = a.weaponRunner;

  assert.equal(splatlingInterrupt(r, a, 'charge'), false, 'no window before the cancel press');
  a.intent.squid = true;
  f.tick(a);
  assert.ok(splatlingInterrupt(r, a, 'charge'), 'the charge-cancel press arms the 6f recovery');
  assert.equal(r.s3ChargeInterruptT, SPLATLING_INTERRUPT - FRAME,
    'one authoritative weapon update consumed exactly one frame of the window');

  // A press recorded while the weapon is idle must not arm a later charge.
  const idle = f.make('splatling');
  idle.ink = 100;
  idle.intent.squid = true;
  f.tick(idle);
  assert.equal(splatlingInterrupt(idle.weaponRunner, idle, 'charge'), false, 'an unarmed press edge stays unarmed');
  idle.intent.squid = false;
  idle.intent.fire = true;
  f.tick(idle, 30);
  assert.equal(splatlingInterrupt(idle.weaponRunner, idle, 'charge'), false,
    'charging after that press does not retroactively open the recovery window');
});

test('#679: the 6f boundary is a simulation-time boundary at 30/60/120 Hz rendering', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('splatling');
    a.ink = 100;
    a.intent.fire = true;
    const dt = 1 / hz;
    f.G.time += dt;
    a.update(dt);
    assert.ok(a.weaponRunner.charging, `precondition: charging at ${hz}Hz`);
    assert.ok(a.weaponRunner.charge > 0, `precondition: charge progressed at ${hz}Hz`);

    a.intent.squid = true;
    let elapsed = 0, admittedAt = null;
    for (let i = 1; i <= 40; i++) {
      f.G.time += dt;
      a.update(dt);
      elapsed += dt;
      if (a.form === 'squid') { admittedAt = elapsed; break; }
      assert.ok(elapsed < SPLATLING_INTERRUPT + EPS,
        `${hz}Hz: never admitted before the 6f boundary (elapsed ${elapsed})`);
    }
    assert.ok(admittedAt !== null, `${hz}Hz: the recovery completes`);
    assert.ok(admittedAt >= SPLATLING_INTERRUPT - EPS,
      `${hz}Hz: admitted at the shared 6f simulation boundary (elapsed ${admittedAt})`);
    assert.ok(admittedAt <= SPLATLING_INTERRUPT + dt + EPS,
      `${hz}Hz: admitted at the first update that reaches the boundary`);
    assert.equal(a.weaponRunner.charge, 0, `${hz}Hz: the committed cancel clears the charge`);
    assert.equal(f.shots.length, 0, `${hz}Hz: no projectile from the cancel`);
  }
});

test('#679: a plain ZR release keeps the normal release/stream path and arms no timer', async () => {
  const f = await fixture();
  const a = await chargingActor(f);
  const r = a.weaponRunner;
  assert.equal(r.s3ChargeInterruptT, 0, 'no timer without a charge-cancel press');

  a.intent.fire = false;                  // release only: no ZL press at all
  f.tick(a);
  assert.equal(r.streaming, true, 'the released charge starts the normal stream');
  assert.equal(r.s3ChargeInterruptT, 0, 'the release path arms no interruption timer');
  assert.equal(a.form, 'kid', 'a plain release never enters swim by itself');
  f.tick(a, 2);
  assert.ok(f.shots.length > 0, 'the normal stream fires');
});

test('#679: 48f first stage and 72f full charge timings are unchanged', async () => {
  const f = await fixture();
  const a = f.make('splatling');
  const w = a.weapon;
  a.ink = 100;
  a.intent.fire = true;

  f.tick(a, 48);
  assert.ok(Math.abs(a.weaponRunner.charge - w.firstChargeTime / w.chargeTime) < EPS,
    `first stage boundary at 48f (charge ${a.weaponRunner.charge})`);
  assert.ok(!splatlingInterrupt(a.weaponRunner, a, 'charge'), 'a plain charge opens no interruption window');

  f.tick(a, 24);
  assert.ok(a.weaponRunner.charge >= 1 - EPS, 'full charge at 72f');
  a.intent.fire = false;
  f.tick(a);
  assert.equal(a.weaponRunner.streaming, true, 'the full release still streams');
  const burst = a.weaponRunner.burstDur;
  assert.ok(burst > 0, 'burst duration derives from the untouched charge curve');
});

test('#679: the window only applies to the Splatling charge-cancel path', async () => {
  const f = await fixture();
  const charger = f.make('charger');
  charger.ink = 100;
  charger.intent.fire = true;
  f.tick(charger, 20);
  assert.ok(charger.weaponRunner.charging, 'precondition: charger is charging');
  assert.equal(splatlingInterrupt(charger.weaponRunner, charger, 'charge'), false,
    'the charge-interruption window is Splatling-only; the Charger path stays with issue #416');

  const shooter = f.make('shooter');
  shooter.intent.fire = true;
  f.tick(shooter, 5);
  shooter.intent.squid = true;
  f.tick(shooter);
  assert.equal(splatlingInterrupt(shooter.weaponRunner, shooter, 'charge'), false,
    'other weapon kinds are untouched');
});

test('#679/#686: each window consumes exactly one frame per authoritative weapon update', async () => {
  const f = await fixture();

  // Charge cancel: one decrement per actor update, never one per render frame.
  const a = await chargingActor(f);
  a.intent.squid = true;
  const seen = [];
  for (let i = 1; i <= 4; i++) { f.tick(a); seen.push(a.weaponRunner.s3ChargeInterruptT); }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(Math.abs((seen[i - 1] - seen[i]) - FRAME) < 1e-12,
      `charge window advances by exactly one frame per update (step ${i}: ${seen[i - 1]} -> ${seen[i]})`);
  }
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'the stream window never opens for a charge cancel');
  assert.equal(tickSplatlingInterrupt(a.weaponRunner, FRAME), 'charge', 'the live slot is reported once');
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'the shared tick never touches the other slot');

  // Stream cancel: the same helper, the other slot.
  const b = f.make('splatling');
  b.ink = 100;
  b.intent.fire = true;
  f.tick(b, 73);
  b.intent.fire = false;
  f.tick(b, 2);
  assert.equal(b.weaponRunner.streaming, true, 'precondition: active stream');
  b.intent.squid = true;
  const seenB = [];
  for (let i = 1; i <= 4; i++) { f.tick(b); seenB.push(b.weaponRunner.s3StreamInterrupt); }
  for (let i = 1; i < seenB.length; i++) {
    assert.ok(Math.abs((seenB[i - 1] - seenB[i]) - FRAME) < 1e-12,
      `stream window advances by exactly one frame per update (step ${i})`);
  }
  assert.equal(b.weaponRunner.s3ChargeInterruptT, 0, 'the charge window never opens for a stream cancel');
  assert.equal(tickSplatlingInterrupt(b.weaponRunner, FRAME), 'stream');
  assert.equal(tickSplatlingInterrupt(f.make('splatling').weaponRunner, FRAME), null, 'an idle runner consumes nothing');
});

test('#679/#686: reset (death/respawn) closes both windows so no cancel sticks', async () => {
  const f = await fixture();
  const a = await chargingActor(f);
  a.intent.squid = true;
  f.tick(a);
  assert.ok(a.weaponRunner.s3ChargeInterruptT > 0, 'precondition: charge window open');
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0);

  a.reset();
  assert.equal(a.weaponRunner.s3ChargeInterruptT, 0, 'reset closes the charge window');
  assert.equal(a.weaponRunner.s3StreamInterrupt, 0, 'reset closes the stream window');
  assert.equal(a.weaponRunner.s3ChargeInterruptPressT, -1);
  assert.equal(a.weaponRunner.s3StreamInterruptPressT, -1);

  a.intent.squid = false;
  a.intent.fire = true;
  f.tick(a, 12);
  assert.equal(a.weaponRunner.charging, true, 'a fresh charge starts after reset');
  assert.equal(a.form, 'kid');
  assert.equal(a.weaponRunner.s3ChargeInterruptT, 0, 'the old cancel is not replayed');
});

test('#679/#686: local and remote owners take the same authoritative transition', async () => {
  const trajectory = async (isLocal) => {
    const f = await fixture();
    const a = f.make('splatling');
    a.isLocal = isLocal;                 // default fixture actors are remote
    a.ink = 100;
    a.intent.fire = true;
    f.tick(a, 48);
    a.intent.squid = true;
    const form = [];
    for (let i = 1; i <= 7; i++) { f.tick(a); form.push(a.form); }
    return { form, timer: a.weaponRunner.s3ChargeInterruptT };
  };
  const remote = await trajectory(false);
  const local = await trajectory(true);
  assert.deepEqual(local.form, remote.form, 'the owner of the actor does not change the transition tick');
  assert.deepEqual(local.form,
    ['kid', 'kid', 'kid', 'kid', 'kid', 'kid', 'squid'],
    'six completed interruption frames, then a single admission — no extra one-frame snap');
  assert.equal(local.timer, remote.timer, 'the authoritative window advances identically for both owners');
});

test('#679/#686: nothing outside these cancels changes ordinary admission', async () => {
  const f = await fixture();

  // An idle Splatling with no charge and no stream still dives on the press.
  const idle = f.make('splatling');
  idle.ink = 100;
  idle.intent.squid = true;
  f.tick(idle);
  assert.equal(idle.form, 'squid', 'an ordinary dive is not delayed by the interruption windows');
  assert.equal(idle.weaponRunner.s3ChargeInterruptT, 0);
  assert.equal(idle.weaponRunner.s3StreamInterrupt, 0);

  // Settling after a released charge (charge and stream both finished) is
  // ordinary too: no window survives a state the cancel no longer applies to.
  const settled = f.make('splatling');
  settled.ink = 100;
  settled.intent.fire = true;
  f.tick(settled, 6);
  settled.intent.fire = false;
  f.tick(settled, 60);
  assert.equal(settled.weaponRunner.charging, false, 'precondition: charge gone');
  assert.equal(settled.weaponRunner.streaming, false, 'precondition: stream ended');
  settled.intent.squid = true;
  f.tick(settled);
  assert.equal(settled.form, 'squid', 'a settled Splatling dives without a window');
  assert.equal(settled.weaponRunner.s3ChargeInterruptT, 0);
  assert.equal(settled.weaponRunner.s3StreamInterrupt, 0);

  // A shooter keeps its own (non-splatling) admission and no window state.
  const shooter = f.make('shooter');
  shooter.intent.fire = true;
  f.tick(shooter, 4);
  shooter.intent.squid = true;
  f.tick(shooter);
  assert.equal(shooter.weaponRunner.s3ChargeInterruptT ?? 0, 0, 'Shooter post-shot owner cannot arm a Splatling window');
  shooter.intent.fire = false; f.tick(shooter, 30);
  assert.equal(shooter.form, 'squid', 'Shooter admits squid after its existing post-shot owner releases');
  assert.equal(shooter.weaponRunner.s3StreamInterrupt ?? 0, 0);
});
