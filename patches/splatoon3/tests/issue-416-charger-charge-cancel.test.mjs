import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptIssue416, CHARGE_CANCEL_RECOVERY, chargeCancelActive } from '../runtime/issue-416-adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// Issue #416: a partial Splat Charger charge cancelled by a later ZL press
// must run the documented 6f charge-cancel recovery before ordinary
// squid/swim movement. Every scenario runs the real Actor/WeaponRunner tick
// on the native path through source-fixture; the production behavior is the
// `adaptIssue416` transform routed through the shared `adaptSource`
// dispatcher (`adaptRuntime`), with the raw main source kept as the negative
// control. Owner/actor isolation: a fresh fixture+actor per case, no remote
// play, no second gameplay engine.
//
// Native tick ordering this file pins down (src/game/actor.js):
//   form decision reads busy() → _horizontal(dt, isSquid) → weaponRunner.update()
// so the recovery is armed *inside* the cancel tick's busy() read and consumed
// once per gated frame by the weapon update that closes the same tick.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WEAPONS_REL = 'patches/splatoon3/runtime/weapons.mjs';
const production = () => fixture({ adaptRuntime: adaptSource });

// Hold ZR as a kid long enough to build a clear partial charge (chargeTime 1 s
// → ~0.53 after 30 ticks), never reaching the .999 keep threshold.
function charging(f, frames = 30) {
  const a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, frames);
  assert.ok(a.weaponRunner.charging, 'precondition: charging');
  assert.ok(a.weaponRunner.charge > 0 && a.weaponRunner.charge < .999, 'precondition: partial charge');
  return a;
}

// Press ZL after the ZR press and tick once: the cancel frame.
function cancel(f) {
  const a = charging(f);
  a.intent.squid = true;
  f.tick(a);
  return a;
}

test('issue-416 transform rewrites busy/charger/reset once and is routed through adaptSource', () => {
  const source = fs.readFileSync(path.join(ROOT, WEAPONS_REL), 'utf8');
  const patched = adaptIssue416(WEAPONS_REL, source);
  assert.equal(CHARGE_CANCEL_RECOVERY, 6 / 60, 'documented 6f at the 60 fps reference capture');
  assert.ok(patched.includes('beginChargeCancel(this);'), 'busy override arms the recovery');
  assert.ok(patched.includes('chargeCancelActive(this)'), 'busy override gates on the recovery');
  // Integration guard: the admission must also run inside _charger, before the
  // cancelRecovery snapshot, so an input path that never reads busy() (the
  // main-only Super Jump prelanding kid segment) cannot bypass #416.
  assert.ok(patched.includes('if (cancelPartialAdmission(this)) beginChargeCancel(this);'),
    'the shared weapon-update boundary admits #416 before the cancelRecovery snapshot');
  const head = patched.indexOf('if (cancelPartialAdmission(this)) beginChargeCancel(this);');
  const snapshot = patched.indexOf('const cancelRecovery = chargeCancelActive(this);');
  assert.ok(head > -1 && snapshot > head, 'the admission precedes the cancelRecovery snapshot');
  assert.ok(patched.includes('cancelPartialAdmission } from'), 'the shared predicate is imported');
  assert.ok(patched.includes('if (cancelRecovery) return;'), '_charger suppresses a fresh charge while recovering');
  assert.ok(patched.includes('this.s3ChargeCancelT = 0;'), 'reset clears the recovery');
  assert.ok(patched.includes(`from './issue-416-adapter.mjs'`), 'helper import injected');
  assert.ok(!patched.includes('this.a._squidPressT > this.a._firePressT) return false;'),
    'the same-tick 0f busy shortcut is gone');
  assert.equal(adaptIssue416('src/game/actor.js', source), source, 'other sources pass through untouched');
  assert.throws(() => adaptIssue416(WEAPONS_REL, 'no connections here'), /anchor mismatch/);
  assert.throws(() => adaptIssue416(WEAPONS_REL, patched), /anchor mismatch/, 'double apply fails closed');
  assert.ok(adaptSource(WEAPONS_REL, source).includes('beginChargeCancel(this);'),
    'the shared build dispatcher applies the transform');
  new vm.SourceTextModule(patched, { context: vm.createContext({ console }), identifier: WEAPONS_REL });
});

test('partial charge + later ZL holds the kid form for exactly 6 fixed-60Hz frames, then ordinary swim', async () => {
  const f = await production();
  const a = charging(f);
  const r = a.weaponRunner;

  // Native ordering inside the cancel tick: busy() is consulted first for the
  // form decision, and _horizontal then receives isSquid=false — no same-tick
  // squid path. Ground + own ink throughout (fixture paint sample = 1).
  const busyReads = [];
  const horizontalArgs = [];
  const busy = r.busy;
  r.busy = function () { const value = busy.call(this); busyReads.push(value); return value; };
  const horizontal = a._horizontal;
  a._horizontal = function (dt, isSquid, onEnemy) { horizontalArgs.push(isSquid); return horizontal.call(this, dt, isSquid, onEnemy); };

  const inkBefore = a.ink;
  a.intent.squid = true; // the later ZL press
  f.tick(a); // frame 0: the cancel tick
  assert.equal(a.form, 'kid', 'no 0f swim on the cancel tick');
  assert.ok(busyReads.length >= 1 && busyReads[0] === true, 'form decision read busy() as true first');
  assert.equal(horizontalArgs[0], false, 'horizontal ran the kid path on the cancel tick');
  assert.equal(a.submerged, false, 'not submerged during recovery');
  assert.ok(chargeCancelActive(r), 'recovery is authoritative');
  assert.equal(r.charging, false, 'partial charge cleared immediately');
  assert.equal(r.charge, 0, 'charge discarded, not banked');
  assert.equal(r.s3Stored, null, 'no stored charge from a partial');
  assert.equal(a.ink, inkBefore, 'a discard spends no ink');

  // One fixed tick consumes exactly one recovery frame: the value checked
  // *before* a tick is what that frame's form decision receives, and the
  // weapon update that closes the tick consumes the frame.
  for (let frame = 1; frame <= 5; frame++) {
    assert.ok(chargeCancelActive(r), `recovery still owns the form decision at frame ${frame}`);
    f.tick(a);
    assert.equal(a.form, 'kid', `still recovering at frame ${frame} (no 1f..5f early swim)`);
    assert.equal(horizontalArgs[frame], false, `kid movement at frame ${frame}`);
    assert.equal(a.submerged, false, `not submerged at frame ${frame}`);
  }

  f.tick(a); // frame 6: the documented boundary
  assert.equal(a.form, 'squid', 'ordinary swim becomes available at the 6f boundary');
  assert.equal(a.submerged, true, 'submerges into own ink at the boundary');
  assert.ok(!chargeCancelActive(r), 'recovery consumed exactly at the boundary');
  assert.equal(r.s3Stored, null, 'still no stored charge');
  f.tick(a, 3);
  assert.equal(a.form, 'squid', 'ZL held keeps swimming after the boundary');
  assert.equal(f.shots.length, 0, 'no shot ever left the barrel');
});

test('raw main source without the transform still dives on the cancel tick (negative control)', async () => {
  const f = await fixture(); // raw runtime, no adaptRuntime — main bytes
  const a = charging(f);
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'raw busy() override dives in the same tick (the defect #416 fixes)');
  assert.ok(!chargeCancelActive(a.weaponRunner), 'raw file has no recovery state');
});

test('only the partial-cancel path is delayed: plain dives, post-shot dives and Splatling stay 0f', async () => {
  const f = await production();

  // Plain dive: no charge in progress → immediate swim, no generic 6f delay.
  const plain = f.make('charger');
  plain.intent.squid = true;
  f.tick(plain);
  assert.equal(plain.form, 'squid', 'diving without charging is not delayed');
  assert.ok(!chargeCancelActive(plain.weaponRunner));

  // Post-shot entry (#122/#304 scope untouched): fire a full shot, then dive
  // on the next tick — still immediate, and the shot left normally.
  const shot = f.make('charger');
  shot.ink = 100;
  shot.intent.fire = true;
  f.tick(shot, 61);
  shot.intent.fire = false;
  f.tick(shot);
  assert.equal(f.shots.length, 1, 'the full shot fires on release');
  assert.equal(f.shots[0].charge, 1);
  shot.intent.squid = true;
  f.tick(shot);
  assert.equal(shot.form, 'squid', 'post-shot dive is not delayed by the cancel recovery');
  assert.ok(!chargeCancelActive(shot.weaponRunner));

  // Splatling keeps its original later-squid bypass — no #416 penalty.
  const splat = f.make('splatling');
  splat.ink = 100;
  splat.intent.fire = true;
  f.tick(splat, 20);
  assert.ok(splat.weaponRunner.charging, 'precondition: splatling spinning up');
  splat.intent.squid = true;
  f.tick(splat);
  assert.equal(splat.form, 'squid', 'splatling later-squid bypass unchanged');
  assert.ok(!chargeCancelActive(splat.weaponRunner), 'no recovery armed for Splatling');
});

test('a plain ZR hold charges on an identical trajectory with and without the transform (#304 surface)', async () => {
  const raw = await fixture(), prod = await production();
  const charges = [raw, prod].map(f => {
    const a = f.make('charger');
    a.ink = 100;
    a.intent.fire = true;
    f.tick(a, 30);
    return a.weaponRunner.charge;
  });
  assert.equal(charges[0], charges[1], 'charge build is byte-for-byte the same timing path');
});

test('input edges: ZL release mid-recovery never auto-dives; a fresh press with no charge is immediate', async () => {
  const f = await production();
  const a = cancel(f);
  f.tick(a, 1); // frame 1 of the recovery
  a.intent.squid = false; // release ZL
  a.intent.fire = false;  // and ZR, so no new charge can start
  for (let frame = 2; frame <= 6; frame++) {
    f.tick(a);
    assert.equal(a.form, 'kid', `releasing ZL mid-recovery never force-submerges (frame ${frame})`);
  }
  assert.ok(!chargeCancelActive(a.weaponRunner), 'the recovery still consumed its full 6f');
  a.intent.squid = true; // fresh ZL press with no charge in progress
  f.tick(a);
  assert.equal(a.form, 'squid', 'no lingering penalty once the recovery is over');
  assert.ok(!chargeCancelActive(a.weaponRunner));
  assert.equal(f.shots.length, 0);
});

test('the partial charge is discarded: no store, no shot, and ZR release during recovery fires nothing', async () => {
  const f = await production();
  const a = cancel(f);
  const r = a.weaponRunner;
  assert.equal(r.charge, 0, 'cleared on the cancel tick');
  const ink = a.ink;
  a.intent.fire = false; // physical ZR release while still recovering
  f.tick(a, 4);
  assert.ok(chargeCancelActive(r), 'still inside the recovery');
  assert.equal(f.shots.length, 0, 'releasing ZR after the cancel never fires the discarded charge');
  assert.equal(a.ink, ink, 'no ink spent by a discard');
  f.tick(a, 2); // frame 6 boundary with ZR already released
  assert.equal(a.form, 'squid', 'boundary unchanged by the ZR release');
  assert.ok(!chargeCancelActive(r));
  assert.equal(r.s3Stored, null, 'a partial never becomes a stored charge');
  f.tick(a, 30);
  assert.equal(f.shots.length, 0, 'no delayed shot survives the cancellation');
});

test('a legal full-charge held keep bypasses the recovery entirely', async () => {
  const f = await production();
  const a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);
  assert.ok(a.weaponRunner.charge >= .999, 'precondition: full charge');
  a.intent.squid = true;
  f.tick(a);
  assert.equal(a.form, 'squid', 'charge keep submerges on the same tick — no 6f penalty');
  assert.ok(a.weaponRunner.s3Stored, 'the held full charge is kept');
  assert.ok(!chargeCancelActive(a.weaponRunner), 'no charge-cancel recovery armed');
  f.tick(a, 5);
  assert.ok(a.weaponRunner.s3Stored, 'keep survives while ZR stays held');
  assert.equal(f.shots.length, 0);
});

test('the 6f recovery counts fixed 60Hz simulation ticks, not render frames (30/60/120 Hz)', async () => {
  for (const renderHz of [30, 60, 120]) {
    const f = await production();
    const a = charging(f);
    const r = a.weaponRunner;
    a.intent.squid = true;
    f.tick(a); // frame 0: the cancel tick, outside the render loop
    assert.equal(a.form, 'kid', `cancel tick holds the kid form at ${renderHz} Hz`);

    // The same cancel replayed through the production render clock: however
    // the fixed ticks are grouped into render frames, exactly 6 of them own
    // the form before ordinary swim returns.
    const clock = new FixedClock();
    let ticks = 0, guard = 0;
    while (a.form === 'kid' && guard++ < 120) {
      clock.advance(1 / renderHz, () => { f.tick(a); ticks++; });
    }
    assert.equal(clock.ticks, ticks, 'the accumulator produced exactly the ticks consumed');
    assert.equal(ticks, 6, `${renderHz} Hz rendering still consumes exactly 6 fixed 60Hz ticks`);
    assert.equal(a.form, 'squid', `ordinary swim opens at the same boundary at ${renderHz} Hz`);
    assert.ok(!chargeCancelActive(r), 'recovery consumed at the boundary');
    assert.equal(r.s3Stored, null, 'no stored charge is invented by the cadence');
    assert.equal(f.shots.length, 0, 'no shot at any cadence');
  }
});

// --- Super Jump integration (blocker in b11-main-final-review.md) ----------
// The main-only Super Jump input path returns before the native latest-press
// form selection and its busy() read, then calls weaponRunner.update() with raw
// intent.fire. Without the shared-boundary admission in _charger, a later squid
// press during the pre-landing kid segment would release the partial on ZR
// release. The trajectory stays owned by native _updateSuperJump; only weapon
// admission is asserted here.
async function prelandingCharger(f) {
  const a = f.make('charger');
  a.ink = 100;
  // Enter the pre-landing kid window (k = .85 > SUPERJUMP_MAIN_PROGRESS .82)
  // with enough flight time left for the whole 6f recovery plus the release.
  a.superJumpState = {
    wallSupport: null, phase: 'flight', t: 8.5, dur: 10, marker: 0,
    from: a.pos.clone(), to: a.pos.clone(), target: null,
  };
  a.intent.fire = true;
  f.tick(a, 30);
  assert.equal(a.form, 'kid', 'precondition: still in the prelanding kid segment');
  assert.ok(a.superJumpState, 'precondition: still airborne');
  assert.ok(a.weaponRunner.charging, 'precondition: charging mid-flight');
  assert.ok(a.weaponRunner.charge > 0 && a.weaponRunner.charge < .999, 'precondition: partial charge');
  return a;
}

test('prelanding partial charge is discarded by a later squid press and recovers for exactly 6f', async () => {
  const f = await production();
  const a = await prelandingCharger(f);
  const r = a.weaponRunner;

  a.intent.squid = true; // the later ZL press, mid-flight
  f.tick(a); // cancel tick
  assert.ok(chargeCancelActive(r), 'the shared boundary armed #416 without busy() being read');
  assert.equal(r.charging, false, 'partial cleared on the cancel tick');
  assert.equal(r.charge, 0, 'charge discarded, not banked');
  assert.equal(r.s3Stored, null, 'a partial never becomes a stored charge');
  assert.equal(f.shots.length, 0, 'no shot left the barrel on the cancel tick');
  assert.equal(a.form, 'kid', 'prelanding kid segment retained on the cancel tick');

  // Release ZR *during* the recovery: the discarded partial must not come back
  // as a fresh charge, and nothing may be released once the window closes.
  a.intent.fire = false;
  let ticks = 1; // the cancel tick already consumed one frame
  while (chargeCancelActive(r) && ticks < 12) {
    f.tick(a);
    assert.equal(r.charge, 0, `no fresh charge re-arms at tick ${ticks}`);
    assert.equal(r.charging, false, `charger stays idle at tick ${ticks}`);
    assert.equal(f.shots.length, 0, `no shot at tick ${ticks}`);
    assert.equal(a.form, 'kid', `prelanding kid segment retained at tick ${ticks}`);
    ticks++;
  }
  assert.equal(ticks, 6, 'exactly the documented 6 fixed ticks own the gate after the cancel tick');
  assert.ok(!chargeCancelActive(r), 'recovery consumed exactly at the 6f boundary');
  f.tick(a, 5);
  assert.equal(f.shots.length, 0, 'releasing ZR during recovery never fires the discarded partial');
  assert.equal(r.charge, 0, 'and no later charge appears from the release');
  assert.ok(a.superJumpState, 'the native flight trajectory was left alone');

  // Reset still clears a recovery armed through this boundary. ZL is released
  // first so the re-arm uses a genuinely fresh later-squid edge.
  a.intent.squid = false;
  f.tick(a);
  a.intent.fire = true;
  f.tick(a, 10);
  assert.ok(r.charging && r.charge < .999, 'precondition: a fresh partial charge');
  a.intent.squid = true; // fresh rising edge -> new _squidPressT
  f.tick(a);
  assert.ok(chargeCancelActive(r), 're-armed through the same boundary on a fresh edge');
  a.intent.fire = false; // release during recovery, as before
  f.tick(a, 2);
  r.reset();
  assert.ok(!chargeCancelActive(r), 'weapon reset clears a boundary-armed recovery');
  assert.equal(r.s3Stored, null, 'reset keeps its existing stored-charge contract');
  f.tick(a, 3);
  assert.equal(f.shots.length, 0, 'nothing fired across the whole scenario');
});

test('negative control: without the boundary connection the prelanding partial fires on release', async () => {
  const f = await fixture(); // raw sources — no adaptRuntime, so no #416 connection
  const a = f.make('charger');
  a.ink = 100;
  a.superJumpState = {
    wallSupport: null, phase: 'flight', t: 8.5, dur: 10, marker: 0,
    from: a.pos.clone(), to: a.pos.clone(), target: null,
  };
  a.intent.fire = true;
  f.tick(a, 30);
  assert.equal(a.form, 'kid', 'precondition: prelanding kid segment');
  assert.ok(a.weaponRunner.charge > 0 && a.weaponRunner.charge < .999, 'precondition: partial charge');

  a.intent.squid = true;
  f.tick(a);
  assert.ok(!chargeCancelActive(a.weaponRunner), 'raw source has no #416 recovery state');
  a.intent.fire = false;
  f.tick(a);
  assert.equal(f.shots.length, 1, 'the defect #416 blocks: the partial is released mid-flight');
  assert.ok(f.shots[0].charge < .999, 'and it was only a partial charge');
});

test('the shared boundary leaves non-Charger weapons unchanged in the same window', async () => {
  const f = await production();
  const a = f.make('shooter');
  a.ink = 100;
  a.superJumpState = {
    wallSupport: null, phase: 'flight', t: 8.5, dur: 10, marker: 0,
    from: a.pos.clone(), to: a.pos.clone(), target: null,
  };
  a.intent.fire = true;
  f.tick(a, 10);
  const fired = f.shots.length;
  assert.ok(fired > 0, 'precondition: the shooter fired in the prelanding window');
  a.intent.squid = true;
  f.tick(a, 5);
  assert.ok(!chargeCancelActive(a.weaponRunner), 'no charge-cancel recovery for a shooter');
  assert.ok(f.shots.length > fired, 'the shooter keeps firing; no #416 penalty');
  assert.equal(a.weaponRunner.charging, false, 'shooter never charges');
  assert.equal(f.shots.filter(s => s.kind === 'charger').length, 0, 'no charger shot was invented');
});

test('death and weapon reset clear the recovery so no gate outlives the weapon lifecycle', async () => {
  const f = await production();

  // Death path: the actor's splat path calls weaponRunner.onDeath() → reset().
  const dead = cancel(f);
  assert.ok(chargeCancelActive(dead.weaponRunner), 'recovery armed before the death');
  dead.weaponRunner.onDeath();
  assert.ok(!chargeCancelActive(dead.weaponRunner), 'death clears the recovery');
  assert.equal(dead.weaponRunner.s3ChargeCancelT, 0, 'reset zeroes the timer');
  dead.intent.fire = false;
  f.tick(dead);
  assert.equal(dead.form, 'squid', 'no stuck gate after death: the next tick submerges immediately');
  assert.ok(!chargeCancelActive(dead.weaponRunner));

  // Explicit weapon reset (respawn / loadout change) does the same, and the
  // existing stored-charge contract of reset() is untouched.
  const rec = cancel(f);
  assert.ok(chargeCancelActive(rec.weaponRunner), 'recovery armed before the reset');
  rec.weaponRunner.reset();
  assert.ok(!chargeCancelActive(rec.weaponRunner), 'weapon reset clears the recovery');
  assert.equal(rec.weaponRunner.s3Stored, null, 'reset keeps its existing stored-charge contract');
  f.tick(rec);
  assert.equal(rec.form, 'squid', 'no stuck gate after a weapon reset');
  assert.equal(f.shots.length, 0, 'neither path leaves a shot behind');
});


test('partial cancel fits the actual 138F prelanding window and stays discarded after landing', async () => {
  const f = await production();
  // Use native Physics for the landing (the shared fixture otherwise omits
  // collision methods because its ordinary weapon cases never resolve bodies).
  const floor = { id: 0, solid: true, grate: false,
    aabbMin: new f.THREE.Vector3(-50, -1, -50), aabbMax: new f.THREE.Vector3(50, 0, 50),
    center: new f.THREE.Vector3(0, -.5, 0), half: new f.THREE.Vector3(50, .5, 50),
    axes: [new f.THREE.Vector3(1, 0, 0), new f.THREE.Vector3(0, 1, 0), new f.THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1] };
  f.G.level = { blocks: [floor], faces: [], groundHeight: () => 0,
    queryBlocks(_x, _z, _xx, _zz, out) { out.length = 0; out.push(0); return out; } };
  f.G.physics = new f.Physics(f.G.level);
  const a = f.make('charger');
  a.superJumpState = { phase: 'flight', t: 120 / 60, dur: a.s3.jumpFlightTime,
    marker: 0, from: a.pos.clone(), to: a.pos.clone(), target: null, wallSupport: null };
  assert.equal(a.superJumpState.dur, 138 / 60, 'current profile flight duration');
  a.intent.fire = true;
  f.tick(a, 6);
  assert.ok(a.weaponRunner.charging && a.weaponRunner.charge > 0 && a.weaponRunner.charge < .999);
  a.intent.squid = true;
  f.tick(a);
  a.intent.fire = false;
  f.tick(a, 5);
  assert.ok(!chargeCancelActive(a.weaponRunner), 'six ticks consumed');
  assert.equal(a.weaponRunner.charge, 0);
  assert.equal(f.shots.length, 0);
  assert.equal(a.superJumpState.phase, 'flight', 'cancel did not end flight');
  f.tick(a, 8);
  assert.equal(a.superJumpState, null, 'native flight landed on schedule');
  assert.equal(f.shots.length, 0, 'no discarded partial released after landing');
});
