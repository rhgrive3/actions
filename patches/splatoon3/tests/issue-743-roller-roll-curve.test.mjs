// #743: the roller rolling target is owned by the build-connected movement
// physics and must follow the pinned 11.3.0 roll parameters — 6.48 normal,
// 7.92 dash, dash at 90F / 1.5 s — at every frame boundary, and the generic
// Actor acceleration must not reshape that curve. Real public modules plus the
// build adapter; no fake game model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const DT = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}${m ? ` (${m})` : ''}`);

// The pinned 11.3.0 weapon table supplies these three fields and no others:
// SpeedNormal 0.108, SpeedDash 0.132, DashFrame 90. The INKWAVE scale here is
// the profile's own; the test asserts the profile relationship, not a guess.
const ROLL_BASE = 6.48, ROLL_DASH = 7.92, DASH_FRAME = 90;

const loadout = (ability, points) => {
  const parts = Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
  if (points === 57) for (const part of parts) { part.main = ability; part.subs.fill(ability); }
  else if (points === 10) parts[0].main = ability;
  return parts;
};

async function rolling() {
  const f = await fixture();
  const a = f.make('roller');
  const r = a.weaponRunner;
  r.update(DT, { fire: true, firePressed: true });
  for (let i = 0; i < 42; i++) r.update(DT, { fire: true });
  assert.equal(r.rolling, true, 'must be rolling');
  r.rollT = 0;
  return { f, a, r };
}

// Drives the real WeaponRunner so rollT advances exactly as the game advances it.
async function played() {
  const { f, a, r } = await rolling();
  const target = [], actual = [];
  a.intent.move.set(0, 0, 1); a.vel.set(0, 0, 0); a.grounded = true;
  for (let i = 0; i < 150; i++) {
    a._horizontal(DT, false, false);
    target.push(r.moveSpeed());
    actual.push(a.vel.length());
    r.update(DT, { fire: true });
  }
  return { f, a, r, target, actual };
}

test('#743 the roll parameters stay sourced to the pinned 11.3.0 weapon table', async () => {
  const { a } = await rolling();
  near(a.weapon.rollBaseSpeed, ROLL_BASE, 'profile rollBaseSpeed');
  near(a.weapon.rollSpeed, ROLL_DASH, 'profile rollSpeed');
  near(a.weapon.rollDashTime, DASH_FRAME / 60, 'profile rollDashTime');
  // 1.08 and 1.32 at the profile's own 6x scale; 90F at 60 Hz.
  near(ROLL_BASE / ROLL_DASH, 1.08 / 1.32, 'base/dash ratio');
  near(a.weapon.rollDashTime * 60, DASH_FRAME, 'dash frame');
});

test('#743 the target is 6.48 through 89F and 7.92 from 90F', async () => {
  const { r } = await rolling();
  const at = frame => { r.rollT = frame / 60; return r.moveSpeed(); };
  for (const frame of [0, 1, 2, 30, 45, 60, 89]) near(at(frame), ROLL_BASE, `${frame}F target`);
  for (const frame of [90, 91, 120, 149]) near(at(frame), ROLL_DASH, `${frame}F target`);
  // The discarded 0.5x base and the 0.45 s ramp from the raw upstream branch
  // must never be produced by the composed path.
  const legacy = ROLL_DASH * 0.5;
  for (let frame = 0; frame < 180; frame++) assert.notEqual(at(frame), legacy, `${frame}F produced ${legacy}`);
});

test('#743 the dash boundary is the 90th frame, not the 27th of the raw branch', async () => {
  const { r } = await rolling();
  r.rollT = 0.45 - 1e-9;              // 27F: where the raw upstream ramp saturated
  near(r.moveSpeed(), ROLL_BASE, '27F must still be the normal roll speed');
  r.rollT = 1.5 - 1e-9;
  near(r.moveSpeed(), ROLL_BASE, 'just before the dash frame');
  r.rollT = 1.5;
  near(r.moveSpeed(), ROLL_DASH, 'at the dash frame');
  assert.equal(r.moveSpeed(), ROLL_DASH, 'a ramp would not be exactly 7.92 at 1.5 s');
});

test('#743 a played roll reaches each target without the acceleration reshaping it', async () => {
  const { target, actual } = await played();
  // Target values, frame by frame, as the real update advances rollT.
  for (let frame = 0; frame < target.length; frame++) {
    const expected = frame >= DASH_FRAME ? ROLL_DASH : ROLL_BASE;
    near(target[frame], expected, `${frame}F target`);
    // The generic acceleration may only approach the target, never exceed it.
    assert.ok(actual[frame] <= expected + 1e-9, `${frame}F actual ${actual[frame]} exceeded target ${expected}`);
  }
  // 0 -> base inside the attack/aim acceleration budget of 72 WU/s^2.
  const framesToBase = actual.findIndex(v => Math.abs(v - ROLL_BASE) < 1e-9);
  assert.ok(framesToBase >= 0, 'never reached the normal roll speed');
  assert.ok(framesToBase <= Math.ceil(ROLL_BASE / 72 * 60) + 1,
    `base reached on frame ${framesToBase}, outside the acceleration budget`);
  // The dash target is reached one tick after the boundary, never earlier.
  const framesToDash = actual.findIndex(v => Math.abs(v - ROLL_DASH) < 1e-9);
  assert.ok(framesToDash >= DASH_FRAME, `dash speed arrived on frame ${framesToDash}, before 90F`);
  assert.ok(framesToDash <= DASH_FRAME + 1, `dash speed took ${framesToDash - DASH_FRAME} extra frames`);
  near(actual.at(-1), ROLL_DASH, 'settled speed');
});

test('#743 the Run Speed gear ability cannot reshape the rolling target', async () => {
  const { a, r } = await rolling();
  for (const points of [0, 10, 57]) {
    a.s3.loadout = loadout('runSpeed', points);
    a.setWeapon('roller');
    r.rolling = true; r.rollT = 0;
    near(r.moveSpeed(), ROLL_BASE, `Run Speed AP ${points}`);
    r.rollT = 1.5;
    near(r.moveSpeed(), ROLL_DASH, `Run Speed AP ${points} dash`);
  }
  // The gear owner classifies a locked roll as its own mode, so the ability's
  // own curve never multiplies the sourced roll target. Confirm the ability is
  // actually doing something to an ordinary runner, so the assertions above
  // are not vacuous.
  a.s3.loadout = loadout('runSpeed', 0);
  a.setWeapon('roller');
  r.rolling = false;
  const plain = r.moveSpeed();
  a.s3.loadout = loadout('runSpeed', 57);
  a.setWeapon('roller');
  r.rolling = false;
  const boosted = r.moveSpeed();
  assert.ok(boosted > plain, `Run Speed AP 57 must raise the ordinary roller's speed (${plain} -> ${boosted})`);
  r.rolling = true; r.rollT = 0;
  near(r.moveSpeed(), ROLL_BASE, 'AP 57 roll target stays the sourced base');
});

test('#743 the rolling target is released to the ordinary states and reset', async () => {
  const { a, r } = await rolling();
  r.aimingSub = true;
  assert.notEqual(r.moveSpeed(), ROLL_BASE, 'a sub ready state must not roll');
  r.aimingSub = false;
  a.grounded = false;
  assert.notEqual(r.moveSpeed(), ROLL_BASE, 'airborne must not roll');
  a.grounded = true;
  near(r.moveSpeed(), ROLL_BASE);
  r.update(DT, { fire: false });
  assert.equal(r.rolling, false, 'releasing the stick ends the roll');
  assert.notEqual(r.moveSpeed(), ROLL_BASE, 'the roll target must not persist');
  r.reset();
  r.rolling = true; r.rollT = 0;
  near(r.moveSpeed(), ROLL_BASE, 'a reset roll starts from the normal speed');
});

test('#743 30/60/120 Hz render schedules produce the same rolling target trace', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const { f, a, r } = await rolling();
    a.intent.move.set(0, 0, 1); a.vel.set(0, 0, 0); a.grounded = true;
    const clock = new FixedClock(), trace = [];
    for (let frame = 0; frame < 150 / 60 * hz; frame++) {
      clock.advance(1 / hz, dt => {
        trace.push([r.moveSpeed(), a.vel.length()]);
        r.update(dt, { fire: true });
      });
    }
    assert.equal(clock.ticks, 150, `${hz} Hz tick count`);
    traces.push(trace);
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});
