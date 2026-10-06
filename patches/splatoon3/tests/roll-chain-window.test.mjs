// #386 squid-roll chain window.
//
// Splatoon 3 community verification puts the interval that still counts as a
// consecutive roll at "about 90 frames", and the source page itself hedges the
// number. Nothing here asserts an official or hardware-measured boundary: the
// suite only pins the interval arithmetic that follows from the approximate
// window stored in the profile, and keeps retention, roll eligibility and roll
// armor exactly as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { rollLaunchSpeed } from '../runtime/movement.mjs';

const WINDOW_SECONDS = 1.5;          // profile movement.roll.chainReset
const WINDOW_FRAMES = 90;            // 1.5 s at the 60 Hz gameplay clock
const RETENTION = 0.85;              // profile movement.roll.chainRetention
const SPEED = 20;                    // constant eligible velocity across ticks
const CHAINED = [30, 59, 70, 80, 89];
const UNCHAINED = [90, 100];
const COMBOS = [['floor', 'floor'], ['wall', 'wall'], ['floor', 'wall'], ['wall', 'floor']];
const CADENCES = [[30, 1 / 30], [60, 1 / 60], [120, 1 / 120]];

const close = (actual, expected, note = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${note} ${actual} != ${expected}`);

// beforeActions returns "a movement action is live", which stays true for the
// whole roll duration, so launches are counted from the real animation triggers.
const rollLaunches = a => a.character.events.filter(event => event[0] === 'squidroll').length;

// A floor roll needs own ink plus a reverse input; a wall roll needs a climb and
// input aligned with the wall normal. Both hold the same eligible speed, so the
// chain window is the only variable between scenarios.
function prepare(a, kind) {
  a.form = 'squid'; a.specialActive = null; a.superJumpState = null;
  a.vel.set(0, 0, SPEED);
  if (kind === 'wall') {
    a.climbing = true; a.submerged = false;
    a.wallN.set(0, 0, 1); a.intent.move.set(0, 0, 1);
  } else {
    a.climbing = false; a.submerged = true;
    a.wallN.set(0, 0, 0); a.intent.move.set(0, 0, -1);
  }
}

function launch(f, a, kind, note) {
  prepare(a, kind);
  const before = rollLaunches(a);
  f.beforeActions(a, STEP, true);
  assert.equal(rollLaunches(a), before + 1, `${note} ${kind} roll must launch`);
  return Math.hypot(a.vel.x, a.vel.z);
}

// The second launch lands exactly on scheduled tick `gap`, counting the first
// launch as tick 0. beforeActions decrements the chain timer once per call
// before it evaluates the jump, so `gap` ticks elapse between the two launches.
async function scenario(firstKind, secondKind, gap) {
  const f = await fixture(), a = f.make();
  const note = `${firstKind}->${secondKind}@${gap}`;
  const first = launch(f, a, firstKind, note);
  for (let tick = 1; tick < gap; tick++) {
    prepare(a, secondKind);
    const before = rollLaunches(a);
    f.beforeActions(a, STEP, false);
    assert.equal(rollLaunches(a), before, `${note} idle tick ${tick} must not launch`);
  }
  const second = launch(f, a, secondKind, note);
  return { first, second, chain: a.s3.actions.chain, timer: a.s3.actions.chainTimer };
}

test('the profile chain window is the approximate 90-frame community value', async () => {
  const f = await fixture();
  close(f.profile.movement.roll.chainReset, WINDOW_SECONDS);
  close(WINDOW_SECONDS / STEP, WINDOW_FRAMES);
  // Still an unverified calibration value: no pinned-parameter binding was
  // invented for a number the reference only reports as approximate.
  assert.equal(f.profile.bindings['movement.roll.chainReset'], undefined);
});

test('consecutive rolls inside the window keep the retention penalty in every floor/wall combination', async () => {
  for (const [first, second] of COMBOS) for (const gap of CHAINED) {
    const r = await scenario(first, second, gap);
    close(r.first, SPEED, `${first} first launch`);
    close(r.second, SPEED * RETENTION, `${first}->${second} at ${gap} ticks must stay chained`);
    assert.equal(r.chain, 2, `${first}->${second} at ${gap} ticks`);
  }
});

test('a roll after the window returns to full first-roll speed in every floor/wall combination', async () => {
  for (const [first, second] of COMBOS) for (const gap of UNCHAINED) {
    const r = await scenario(first, second, gap);
    close(r.second, SPEED, `${first}->${second} at ${gap} ticks must have expired`);
    assert.equal(r.chain, 1, `${first}->${second} at ${gap} ticks`);
  }
});

test('the wall/floor boundary is shared, matching the reference shared roll penalty', async () => {
  // Floor and wall rolls increment one chain, so a wall roll started inside the
  // window opened by a floor roll is still penalised, and vice versa.
  for (const [first, second] of [['floor', 'wall'], ['wall', 'floor']]) {
    close((await scenario(first, second, 70)).second, SPEED * RETENTION, `${first}->${second} inside window`);
    close((await scenario(first, second, 100)).second, SPEED, `${first}->${second} outside window`);
  }
});

test('the window is scheduled identically at 30, 60 and 120 Hz render cadence', async () => {
  for (const [fps, frame] of CADENCES) for (const gap of [WINDOW_FRAMES - 1, WINDOW_FRAMES]) {
    const f = await fixture(), a = f.make(), clock = new FixedClock();
    const outcomes = [];
    const needed = gap + 1;
    let ticks = 0, frames = 0, simulated = 0;
    // Render at this cadence until the required gameplay ticks are scheduled.
    // A 30 Hz frame queues two 60 Hz ticks at once, so ticks past the target are
    // deliberately not simulated: the chain window must depend on gameplay ticks
    // consumed, never on how the render cadence batched them.
    for (let i = 0; i < 400 && ticks < needed; i++) {
      frames++;
      clock.advance(frame, step => {
        const index = ticks++;
        if (index >= needed) return;
        simulated++;
        prepare(a, index === 0 ? 'floor' : 'wall');
        const before = rollLaunches(a);
        f.beforeActions(a, step, index === 0 || index === gap);
        if (rollLaunches(a) > before) outcomes.push(Math.hypot(a.vel.x, a.vel.z));
      });
    }
    assert.equal(simulated, needed, `${fps} Hz simulates exactly ${needed} gameplay ticks`);
    // The render cadence differs but the queued gameplay span does not.
    assert.ok(frames >= Math.floor(needed * STEP / frame) && frames <= Math.ceil(needed * STEP / frame) + 1,
      `${fps} Hz used ${frames} render frames for ${needed} gameplay ticks`);
    assert.equal(outcomes.length, 2, `${fps} Hz must produce exactly two launches`);
    close(outcomes[0], SPEED, `${fps} Hz first launch`);
    close(outcomes[1], gap < WINDOW_FRAMES ? SPEED * RETENTION : SPEED, `${fps} Hz at ${gap} ticks`);
  }
});

test('roll retention is unchanged: one coefficient per launch, never compounded by chain count', async () => {
  const f = await fixture();
  assert.equal(f.profile.movement.roll.chainRetention, RETENTION);
  close(rollLaunchSpeed(SPEED, 0, RETENTION), SPEED);
  close(rollLaunchSpeed(SPEED, 1, RETENTION, SPEED), SPEED * RETENTION);
  close(rollLaunchSpeed(SPEED, 9, RETENTION, SPEED), SPEED * RETENTION);
  // A fresh actor has no Action Intensify AP, so the equipped factor is the
  // neutral profile value; the longer window must not change it.
  close(f.make().s3.modifiers.rollRetention, RETENTION);
});

test('roll eligibility is unchanged by the longer window', async () => {
  const f = await fixture(), cfg = f.profile.movement, a = f.make();
  const pressed = () => { const before = rollLaunches(a); f.beforeActions(a, STEP, true); return rollLaunches(a) > before; };
  // Own ink is still required for a floor roll.
  prepare(a, 'floor'); a.submerged = false;
  assert.equal(pressed(), false, 'floor roll needs own ink');
  // ...and the minimum floor speed and reverse-input angle are untouched.
  prepare(a, 'floor'); a.vel.set(0, 0, cfg.roll.minimumSpeed - 1e-6);
  assert.equal(pressed(), false, 'floor roll needs minimum speed');
  prepare(a, 'floor'); a.intent.move.set(0, 0, 1);
  assert.equal(pressed(), false, 'floor roll needs a reverse input');
  // A wall roll still needs climb input aligned with the wall normal.
  prepare(a, 'wall'); a.intent.move.set(0, 1, 0);
  assert.equal(pressed(), false, 'wall roll needs wall input');
  // No jump press, no roll, however much chain time is left.
  prepare(a, 'floor'); a.s3.actions = { chain: 3, chainTimer: cfg.roll.chainReset, roll: null, surge: null };
  const before = rollLaunches(a); f.beforeActions(a, STEP, false);
  assert.equal(rollLaunches(a), before, 'no jump press means no roll');
  assert.equal(a.s3.actions.chain, 3, 'an unpressed tick must not consume the chain');
});

test('roll armor is unchanged: the longer window does not extend or shorten the shield', async () => {
  const f = await fixture(), cfg = f.profile.movement.roll, a = f.make();
  launch(f, a, 'floor', 'armor');
  close(a.s3.roll.armorTime, cfg.armorTime);
  close(a.s3.roll.armorHP, cfg.armorHP);
  a.damage(cfg.armorHP, null, 'shooter'); close(a.hp, 100, 'a roll hit is absorbed inside the armor window');
  for (let i = 0; i < cfg.armorTime * 60; i++) { prepare(a, 'floor'); f.beforeActions(a, STEP, false); }
  close(a.s3.roll.armorTime, 0, 'armor expires on its own schedule, not the chain schedule');
  a.damage(60, null, 'shooter'); close(a.hp, 40, 'damage lands once the armor window closes');
});

test('chain history survives wall reattachment; former velocity-only rule is a negative control', async () => {
  for (const legacy of [false, true]) {
    const f = await fixture({ adaptRuntime: (rel, source) => legacy && rel === 'patches/splatoon3/runtime/movement.mjs'
      ? source.replace('return chain > 0 && previous > 0 ? previous * retention : speed;', 'return speed * (chain > 0 ? retention : 1);') : source });
    const a = f.make(), speeds = [];
    for (let i = 0; i < 3; i++) {
      a.form = 'squid'; a.climbing = true; a.submerged = false;
      a.wallN.set(0, 0, 1); a.intent.move.set(0, 0, 1);
      a.vel.set(0, 11.52, 0); // Actual reattachment loses planar launch velocity.
      const before = rollLaunches(a); f.beforeActions(a, STEP, true);
      assert.equal(rollLaunches(a), before + 1);
      speeds.push(Math.hypot(a.vel.x, a.vel.z));
    }
    const initial = f.profile.movement.roll.minimumSpeed;
    close(speeds[0], initial); close(speeds[1], initial * RETENTION);
    close(speeds[2], initial * (legacy ? RETENTION : RETENTION ** 2));
    if (!legacy) {
      close(a.s3.actions.chainSpeed, speeds[2]);
      f.beforeActions(a, WINDOW_SECONDS, false);
      assert.equal(a.s3.actions.chainSpeed, 0);
      close(launch(f, a, 'floor', 'expired history'), SPEED);
    }
  }
});
