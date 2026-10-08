// #887 Splat Dualies normal-fire jump spread: landing must not snap to ground.
// Pinned S3 Ver. 11.3.0 WeaponManeuverNormal (7280ff9cde8bb1c5dcef46c700c326471584d2e6):
// Stand_DegSwerve = 2, Jump_DegSwerve = 7.5, Jump_DegBiasMax = 0.4,
// Jump_DegBiasDecreaseStartFrame = 25, Jump_DegBiasEndFrame = 70.
// Only boundaries + hold facts are asserted; the 25F->70F interior curve is
// UNKNOWN and never a specific intermediate value (issue requirement).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const close = (actual, expected, label, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} != ${expected}`);
const baseOf = (a, r) => { const first = a.weapon.spreadFirst ?? 0.45; return r.spread / (first + (1 - first) * r.bloom); };
const pinned = f => f.profile.weaponsFidelityCompletion.weapons.dualies.WeaponParam;

test('#887 pinned Dualies jump boundaries are the values under test', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const src = pinned(f);
  assert.equal(src.Jump_DegBiasDecreaseStartFrame, 25, 'sourced recovery start frame');
  assert.equal(src.Jump_DegBiasEndFrame, 70, 'sourced recovered endpoint frame');
  assert.equal(src.Jump_DegBiasMax, 0.4, 'sourced jump bias max (owned by #891, not rewritten here)');
  assert.equal(src.Jump_DegSwerve, 7.5, 'jump endpoint');
  assert.equal(src.Stand_DegSwerve, 2, 'grounded endpoint');
  assert.equal(f.WEAPONS.dualies.spreadAir, 7.5, 'composed air envelope');
  assert.equal(f.WEAPONS.dualies.spreadGround, 2, 'composed ground endpoint');
  assert.equal(f.WEAPONS.dualies.spreadLock, 0, 'turret endpoint');
});

test('#887 grounded Dualies keep 2 degrees with no jump state', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('dualies'), r = a.weaponRunner;
  f.tick(a, 4);
  assert.equal(a.grounded, true);
  close(baseOf(a, r), 2, 'stable grounded endpoint');
  assert.equal(r.s3DualiesJumpState(a.weapon).active, false, 'no jump clock while grounded');
});

test('#887 landing does not collapse the jump envelope; 25F holds, 70F recovers', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('dualies'), r = a.weaponRunner;
  f.tick(a, 2); a.grounded = true; f.tick(a, 2);
  a.grounded = false; f.tick(a); // leave-ground edge = frame 0
  assert.equal(r.s3DualiesJumpState(a.weapon).active, true, 'edge arms the clock');
  close(baseOf(a, r), 7.5, 'airborne jump endpoint');
  for (let i = 0; i < 25; i++) f.tick(a); // frame 25
  close(baseOf(a, r), 7.5, 'no recovery begins at or before 25F');
  assert.equal(r.s3DualiesJumpState(a.weapon).phase, 'held', '25F is the hold boundary');
  a.grounded = true; f.tick(a); // land at 26F
  close(baseOf(a, r), 7.5, 'landing does not snap to the grounded endpoint');
  for (let i = 0; i < 43; i++) f.tick(a); // frame 69
  close(baseOf(a, r), 7.5, 'still held just before 70F; interior curve UNKNOWN');
  f.tick(a); // frame 70
  assert.equal(r.s3DualiesJumpState(a.weapon).active, false, 'clock clears at 70F');
  close(baseOf(a, r), 2, 'recovered to the grounded endpoint at 70F');
});

test('#887 post-roll turret keeps spreadLock 0 and suppresses the jump clock', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('dualies'), r = a.weaponRunner;
  f.tick(a, 2); a.grounded = true; f.tick(a, 2);
  a.grounded = false; f.tick(a);
  assert.equal(r.s3DualiesJumpState(a.weapon).active, true);
  r.s3Turret = true; r.lockT = a.weapon.lockTime;
  f.tick(a);
  assert.equal(r.s3DualiesJumpState(a.weapon).active, false, 'turret suppresses the jump clock');
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadLock, 'turret cone owns spread');
});

test('#887 squid swim jump, dodge roll, reset and second actor keep independent state', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('dualies'), r = a.weaponRunner;
  // Squid swim jump on a FRESH actor: hold squid intent so form stays squid.
  a.intent.squid = true; a.form = 'squid'; a.submerged = true;
  a.grounded = true; f.tick(a, 2);
  assert.equal(a.form, 'squid', 'swim form held');
  a.grounded = false; f.tick(a);
  assert.equal(r.s3DualiesJumpState(a.weapon).active, false, 'squid jump does not arm');
  a.intent.squid = false; a.submerged = false;
  a.form = 'kid'; a.grounded = true; f.tick(a, 2);
  a.grounded = false; f.tick(a);
  assert.equal(r.s3DualiesJumpState(a.weapon).active, true, 'humanoid edge arms');
  const other = f.make('dualies');
  f.tick(other, 4);
  assert.equal(other.weaponRunner.s3DualiesJumpState(other.weapon).active, false, 'actors are independent');
  a.intent.fire = true; a.intent.move.set(0, 0, 1);
  assert.equal(r.tryDodge(a.intent.move), true);
  f.tick(a);
  assert.equal(r.s3DualiesJumpState(a.weapon).active, false, 'dodge suppresses the jump clock');
  r.s3DualiesJumpT = 0.5;
  r.reset();
  assert.equal(r.s3DualiesJumpT, null, 'reset clears the clock');
});

test('#887 normal Dualies 5F cadence and bloom layer are unchanged', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true });
  const a = f.make('dualies'), r = a.weaponRunner;
  f.G.mode = 'range'; f.G.match.mode = 'range'; f.G.netm = null;
  f.tick(a, 2); a.grounded = true; f.tick(a, 2);
  a.grounded = false; f.tick(a);
  a.grounded = true;
  a.intent.fire = true;
  const frames = [];
  for (let frame = 1; frame <= 16; frame++) {
    const before = f.shots.length;
    f.tick(a);
    if (f.shots.length > before) {
      frames.push(frame);
      assert.equal(f.shots.at(-1).kind, 'dualies');
      assert.equal(f.shots.at(-1).spread, r.spread, 'projectile and runner/HUD share one spread value');
    }
  }
  assert.equal(frames.length, 3, '5F cadence preserved during the held envelope');
  assert.deepEqual(frames.slice(1).map((frame, i) => frame - frames[i]), [5, 5]);
  assert.ok(Number.isFinite(r.s3DualiesJumpT), 'clock survives firing');
  assert.ok(r.bloom > 0, 'sustained-fire bloom remains independently observable');
});

test('#887 30/60/120 Hz render cadences give identical 70F recovery boundaries', async () => {
  async function traceAt(renderHz) {
    const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
    const a = f.make('dualies'), r = a.weaponRunner;
    f.tick(a, 2); a.grounded = true; f.tick(a, 2);
    a.grounded = false; f.tick(a);
    for (let i = 0; i < 25; i++) f.tick(a); // frame 25, still airborne
    a.grounded = true; f.tick(a); // land at 26F: held envelope through landing
    const trace = [baseOf(a, r)]; // index 0 = landed frame 26, held at 7.5
    const clock = new FixedClock();
    // 26F..70F inclusive = 45 ticks: held until the last tick, 2 at 70F.
    for (let render = 0; trace.length < 45 && render < renderHz * 3; render++) {
      clock.advance(1 / renderHz, () => {
        if (trace.length < 45) { f.tick(a); trace.push(baseOf(a, r)); }
      });
    }
    assert.equal(trace.length, 45, `${renderHz}Hz schedule delivered 45 fixed ticks`);
    close(trace[0], 7.5, `${renderHz}Hz landed frame 26 held`);
    close(trace[43], 7.5, `${renderHz}Hz frame 69 still held after landing`);
    close(trace[44], 2, `${renderHz}Hz frame 70 recovers to the grounded endpoint`);
    return trace;
  }
  const at30 = await traceAt(30), at60 = await traceAt(60), at120 = await traceAt(120);
  assert.deepEqual(at30, at60);
  assert.deepEqual(at60, at120);
});
