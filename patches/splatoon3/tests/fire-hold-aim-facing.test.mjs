import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { heldFireAimFacing } from '../runtime/fire-hold-facing.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// Holding FIRE keeps the body on the aim while walking backward (backward walk: the existing localMove
// animation shows it). The gameplay clock is the fixed 60 Hz tick (runtime/clock.mjs), so every check here
// steps Actor.update at 1/60 s; the frame-interval check drives the same FixedClock at 30/60/120 Hz.
const STEP = 1 / 60;
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const AIM = Math.PI / 2;
const BACK = AIM + Math.PI;   // straight back, relative to the aim

const plain = (over = {}) => ({
  alive: true, remote: false, form: 'kid', specialActive: null, superJumpState: null,
  intent: { fire: true, sub: false, move: { x: 0, z: -1 } },
  weapon: { kind: 'blaster', behaviorKind: 'blaster' },
  ...over,
});

test('heldFireAimFacing admits held FIRE for ordinary Kid shooters and keeps the owned exceptions', () => {
  assert.equal(heldFireAimFacing(plain()), true);
  assert.equal(heldFireAimFacing(plain({ weapon: { kind: 'catalog', catalogRecord: { family: 'slosher' } } })), true);
  assert.equal(heldFireAimFacing(plain({ intent: { fire: false, sub: false } })), false, 'not held');
  assert.equal(heldFireAimFacing(plain(), true), false, 'squid body faces its own motion');
  assert.equal(heldFireAimFacing(plain({ form: 'squid' })), false);
  assert.equal(heldFireAimFacing(plain({ remote: true })), false, 'remote proxies replicate their pose');
  assert.equal(heldFireAimFacing(plain({ alive: false })), false);
  assert.equal(heldFireAimFacing(plain({ specialActive: { id: 'storm' } })), false, 'special owns heading');
  assert.equal(heldFireAimFacing(plain({ superJumpState: {} })), false);
  for (const behaviorKind of ['roller', 'brush', 'brella']) {
    assert.equal(heldFireAimFacing(plain({ weapon: { kind: 'catalog', behaviorKind } })), false, behaviorKind + ' keeps its own facing rule');
  }
  assert.equal(heldFireAimFacing(plain({ weapon: { kind: 'catalog', catalogRecord: { family: 'brella' } } })), false);
  assert.equal(heldFireAimFacing(null), false);
});

test('real composed Actor: FIRE held + backward walk keeps the body on the aim for every firing family', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const ids = ['shooter', 'dualies', 'blaster', 'charger', 'splatling', 'slosher',
    's3-shooter-short', 's3-maneuver-long', 's3-blaster-long', 's3-blaster-short', 's3-slosher-washtub', 's3-slosher-double', 's3-spinner-quick'];
  for (const id of ids) {
    const a = f.make(id);
    a.form = 'kid'; a.grounded = true; a.kidT = 1;
    a.aimYaw = AIM; a.yaw = AIM; a.yawVel = 0; a.aimPitch = 0;
    let worstLate = 0, lastVel = null;
    for (let tick = 1; tick <= 90; tick++) {
      a.intent.fire = true; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
      f.G.time += STEP; a.update(STEP); a._face(STEP, false);
      if (tick > 30) worstLate = Math.max(worstLate, Math.abs(wrap(a.yaw - a.aimYaw)));
      lastVel = { x: a.vel.x, z: a.vel.z };
    }
    assert.ok(worstLate <= 0.02, id + ' body left the aim while FIRE was held (worst ' + worstLate.toFixed(3) + ' rad)');
    // Movement input is unchanged: the held backward walk still moves the actor backward along the aim.
    const fwd = { x: Math.sin(AIM), z: Math.cos(AIM) };
    assert.ok(lastVel.x * fwd.x + lastVel.z * fwd.z < -0.5, id + ' lost its backward walk');
  }
});

test('real composed Actor: a held Blaster through its shot-to-shot wait stays on the aim (the reported gap)', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('blaster');
  a.form = 'kid'; a.grounded = true; a.kidT = 1;
  a.aimYaw = AIM; a.yaw = AIM; a.yawVel = 0;
  // The first 60 ticks cover one full cycle of the wait (cooldown ≈ 0.67 s, firingT clears at about 0.35 s).
  let worst = 0;
  for (let tick = 1; tick <= 90; tick++) {
    a.intent.fire = true; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
    f.G.time += STEP; a.update(STEP); a._face(STEP, false);
    if (tick > 15) worst = Math.max(worst, Math.abs(wrap(a.yaw - a.aimYaw)));
  }
  assert.ok(worst <= 0.02, 'blaster wait turned the body ' + worst.toFixed(3) + ' rad off the aim');
});

test('the held Blaster trace is identical under 30/60/120 Hz presentation (fixed 60 Hz simulation ticks)', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
    const a = f.make('blaster');
    a.form = 'kid'; a.grounded = true; a.kidT = 1; a.aimYaw = AIM; a.yaw = AIM; a.yawVel = 0;
    const fixed = new FixedClock(), out = [];
    for (let frame = 0; frame < hz; frame++) {
      fixed.advance(1 / hz, (dt) => {
        a.intent.fire = true; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
        f.G.time += dt; a.update(dt); a._face(dt, false);
        out.push(a.yaw);
      });
    }
    traces.push(out);
  }
  assert.ok(traces[0].length >= 55, 'one second of simulation ticks');
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
});

test('rollers and brushes keep the rolling heading when FIRE is held while moving', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  for (const id of ['roller', 's3-roller-wide', 's3-brush-normal']) {
    const a = f.make(id);
    a.form = 'kid'; a.grounded = true; a.kidT = 1;
    a.aimYaw = AIM; a.yaw = AIM; a.yawVel = 0;
    for (let tick = 1; tick <= 90; tick++) {
      a.intent.fire = true; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
      f.G.time += STEP; a.update(STEP); a._face(STEP, false);
    }
    const travel = wrap(BACK);
    assert.ok(Math.abs(wrap(a.yaw - travel)) < 0.1, id + ' no longer follows its rolling heading (yaw ' + a.yaw.toFixed(3) + ')');
  }
});

test('squid body faces its own motion while FIRE is also held (no change to the squid form)', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('shooter');
  a.form = 'squid'; a.grounded = true;
  a.aimYaw = AIM; a.yaw = AIM; a.yawVel = 0;
  a.intent.fire = true; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
  for (let tick = 1; tick <= 120; tick++) a._face(STEP, true, 1);
  assert.ok(Math.abs(wrap(a.yaw - wrap(BACK))) < 0.05, 'squid yaw ' + a.yaw.toFixed(3) + ' should turn to its motion');
});

test('releasing FIRE while walking backward still hands the body to the travel direction', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('blaster');
  a.form = 'kid'; a.grounded = true; a.kidT = 1;
  a.aimYaw = AIM; a.yaw = AIM; a.yawVel = 0;
  for (let tick = 1; tick <= 60; tick++) {
    a.intent.fire = true; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
    f.G.time += STEP; a.update(STEP); a._face(STEP, false);
  }
  assert.ok(Math.abs(wrap(a.yaw - AIM)) <= 0.02, 'precondition: aimed while held');
  for (let tick = 1; tick <= 120; tick++) {
    a.intent.fire = false; a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
    f.G.time += STEP; a.update(STEP); a._face(STEP, false);
  }
  assert.ok(Math.abs(wrap(a.yaw - wrap(BACK))) < 0.3, 'released backpedal should turn toward travel (yaw ' + a.yaw.toFixed(3) + ')');
});
