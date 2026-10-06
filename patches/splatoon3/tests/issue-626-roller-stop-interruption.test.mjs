// #626: an authoritative roller roll that ends must hold the sourced S3
// action-interruption boundaries before main, sub and squid become admissible
// again. Real public modules plus the build adapter; no fake game model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { ROLL_STOP_LOCKS, rollStopBlocks } from '../runtime/roller.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const DT = 1 / 60;
const FRAMES = { main: 16, sub: 5, squid: 6 };

// Drives the real WeaponRunner with the real installRollerLogic wrapper.
function runnerTick(f, a, inp) {
  f.G.time += DT;
  a.weaponRunner.update(DT, inp);
}

// Hold fire long enough that the first swing has resolved, the repeat cooldown
// has expired and the roll is genuinely established (>1.5 s of rolling).
async function establishedRoll({ frames = 220 } = {}) {
  const f = await fixture();
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  runnerTick(f, a, { fire: true, firePressed: true });
  for (let i = 1; i < frames; i++) runnerTick(f, a, { fire: true });
  assert.equal(r.rolling, true, 'must be rolling');
  // The repeat gate is open: cooldown runs negative once the swing interval has
  // elapsed, so it must already be at or below zero before the roll is released.
  assert.ok(r.cooldown <= 0, `a residual swing cooldown remains (${r.cooldown})`);
  assert.equal(r.flick, -1, 'no swing may be in flight');
  assert.equal(r.s3RollStop, null, 'a continuing roll owns no interruption');
  return { f, a, r };
}

test('#626 the sourced interruption windows are 16F main, 5F sub, 6F squid', () => {
  assert.equal(ROLL_STOP_LOCKS.main, 16 / 60);
  assert.equal(ROLL_STOP_LOCKS.sub, 5 / 60);
  assert.equal(ROLL_STOP_LOCKS.squid, 6 / 60);
  // Three independent boundaries; none may substitute for another.
  assert.notEqual(ROLL_STOP_LOCKS.main, ROLL_STOP_LOCKS.sub);
  assert.notEqual(ROLL_STOP_LOCKS.squid, ROLL_STOP_LOCKS.sub);
  const locks = { main: 16 / 60, sub: 5 / 60, squid: 6 / 60 };
  assert.deepEqual(rollStopBlocks(0, locks), { main: true, sub: true, squid: true });
  assert.deepEqual(rollStopBlocks(5 / 60, locks), { main: true, sub: false, squid: true });
  assert.deepEqual(rollStopBlocks(6 / 60, locks), { main: true, sub: false, squid: false });
  assert.deepEqual(rollStopBlocks(16 / 60, locks), { main: false, sub: false, squid: false });
  assert.deepEqual(rollStopBlocks(0, null), { main: false, sub: false, squid: false });
});

test('#626 the roll-end tick arms exactly one interruption', async () => {
  const { f, a, r } = await establishedRoll();
  runnerTick(f, a, { fire: false });            // the roll-end tick
  assert.equal(r.rolling, false);
  assert.ok(r.s3RollStop, 'the roll-end tick must arm the interruption');
  const end = f.G.time;                        // time of the roll-end tick
  assert.ok(Math.abs(r.s3RollStop.main - (end + FRAMES.main / 60)) < 1e-12);
  assert.ok(Math.abs(r.s3RollStop.sub - (end + FRAMES.sub / 60)) < 1e-12);
  assert.ok(Math.abs(r.s3RollStop.squid - (end + FRAMES.squid / 60)) < 1e-12);
});

// Endpoint convention: the roll-end tick is frame 0. Frame N is the Nth fixed
// tick after it, and the action is first admitted on frame N.
test('#626 a main action cannot begin before the 16F boundary', async () => {
  const { f, a, r } = await establishedRoll();
  runnerTick(f, a, { fire: false });            // roll-end tick = frame 0
  const trace = [];
  for (let frame = 1; frame <= 40; frame++) {
    // A buffered press held through the window: the action itself must not
    // become authoritative before the boundary, the intent may survive.
    runnerTick(f, a, { fire: true, firePressed: true });
    trace.push([frame, r.flick, r.rolling]);
  }
  const admitted = trace.findIndex(([, flick]) => flick >= 0);
  assert.equal(admitted, FRAMES.main - 1, `main admitted on frame ${admitted + 1}`);
  for (let i = 0; i < FRAMES.main - 1; i++) {
    assert.equal(trace[i][1], -1, `a swing started early on frame ${trace[i][0]}`);
    assert.equal(trace[i][2], false, `a roll restarted early on frame ${trace[i][0]}`);
  }
  assert.ok(trace[FRAMES.main - 1][1] >= 0, 'the swing must be in flight at the boundary');
});

test('#626 sub use cannot arm before the 5F boundary', async () => {
  const { f, a, r } = await establishedRoll();
  runnerTick(f, a, { fire: false });
  const trace = [];
  for (let frame = 1; frame <= 20; frame++) {
    runnerTick(f, a, { sub: true });
    trace.push([frame, r.aimingSub]);
  }
  const admitted = trace.findIndex(([, aiming]) => aiming);
  assert.equal(admitted, FRAMES.sub - 1, `sub admitted on frame ${admitted + 1}`);
  for (let i = 0; i < FRAMES.sub - 1; i++) {
    assert.equal(trace[i][1], false, `the sub armed early on frame ${trace[i][0]}`);
  }
  assert.equal(trace[FRAMES.sub - 1][1], true);
});

test('#626 squid entry cannot happen before the 6F boundary', async () => {
  const f = await fixture();
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  a.intent.fire = true; a.intent.firePressed = true;
  for (let i = 0; i < 220; i++) { f.G.time += DT; a.update(DT); }
  a.intent.firePressed = false;
  assert.equal(r.rolling, true, 'must be rolling');
  // Release fire on the roll-end tick itself so the interruption arms there.
  a.intent.fire = false;
  f.G.time += DT; a.update(DT);
  assert.equal(r.rolling, false, 'the roll must end on this tick');
  assert.ok(r.s3RollStop, 'the interruption must be armed before squid is requested');
  const trace = [];
  for (let frame = 1; frame <= 20; frame++) {
    a.intent.squid = true;
    f.G.time += DT; a.update(DT);
    trace.push([frame, a.form]);
  }
  const admitted = trace.findIndex(([, form]) => form === 'squid');
  assert.equal(admitted, FRAMES.squid - 1, `squid admitted on frame ${admitted + 1}`);
  for (let i = 0; i < FRAMES.squid - 1; i++) {
    assert.equal(trace[i][1], 'kid', `squid was entered early on frame ${trace[i][0]}`);
  }
});

// The roll-end tick is frame 0, so a release and a request on that same tick must
// already be owned by the window. A gate that only starts on the NEXT tick lets both
// through, which is what the real Actor ordering produces unless the stop is detected
// before its form decision.
test('#626 a simultaneous release and sub press on the roll-end tick cannot arm the sub', async () => {
  const f = await fixture();
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  a.intent.fire = true;
  for (let i = 0; i < 220; i++) { f.G.time += DT; a.update(DT); }
  assert.equal(r.rolling, true, 'must be rolling');
  a.intent.fire = false; a.intent.sub = true;     // frame 0: release and request together
  f.G.time += DT; a.update(DT);
  assert.equal(r.rolling, false, 'the roll must end on this tick');
  assert.ok(r.s3RollStop, 'the roll-end tick must arm the interruption');
  assert.equal(r.aimingSub, false, 'the sub armed on the roll-end tick itself');
  const trace = [];
  for (let frame = 1; frame <= 12; frame++) { f.G.time += DT; a.update(DT); trace.push([frame, r.aimingSub]); }
  const admitted = trace.findIndex(([, aiming]) => aiming);
  assert.equal(admitted, FRAMES.sub - 1, `sub admitted on frame ${admitted + 1}`);
  for (let i = 0; i < FRAMES.sub - 1; i++) assert.equal(trace[i][1], false, `the sub armed early on frame ${trace[i][0]}`);

  // The same tick driven straight through the runner, with no Actor above it.
  const direct = await establishedRoll();
  runnerTick(direct.f, direct.a, { fire: false, sub: true });
  assert.equal(direct.r.aimingSub, false, 'the runner armed the sub on the roll-end tick');
  assert.ok(direct.r.s3RollStop, 'the roll-end tick must arm the interruption');
});

test('#626 a simultaneous release and squid press on the roll-end tick cannot enter squid', async () => {
  const f = await fixture();
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  a.intent.fire = true;
  for (let i = 0; i < 220; i++) { f.G.time += DT; a.update(DT); }
  assert.equal(r.rolling, true, 'must be rolling');
  a.intent.fire = false; a.intent.squid = true;  // frame 0: release and request together
  f.G.time += DT; a.update(DT);
  assert.equal(r.rolling, false, 'the roll must end on this tick');
  assert.ok(r.s3RollStop, 'the roll-end tick must arm the interruption');
  assert.equal(a.form, 'kid', 'squid was entered on the roll-end tick itself');
  const trace = [];
  for (let frame = 1; frame <= 12; frame++) { f.G.time += DT; a.update(DT); trace.push([frame, a.form]); }
  const admitted = trace.findIndex(([, form]) => form === 'squid');
  assert.equal(admitted, FRAMES.squid - 1, `squid admitted on frame ${admitted + 1}`);
  for (let i = 0; i < FRAMES.squid - 1; i++) assert.equal(trace[i][1], 'kid', `squid was entered early on frame ${trace[i][0]}`);
});

// Negative control for the pre-emptive stop detection: the Actor builds its own fire
// from the raw intent plus the pop-out buffer, so a release tick can still carry fire.
// That tick is the existing roll-into-swing transition and must arm nothing.
test('#626 a buffered pop-out shot on the release tick is a swing, not a roll stop', async () => {
  const f = await fixture();
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  a.intent.fire = true;
  for (let i = 0; i < 220; i++) { f.G.time += DT; a.update(DT); }
  assert.equal(r.rolling, true, 'must be rolling');
  a.intent.fire = false; a.fireBuffer = f.PLAYER.fireBuffer;
  f.G.time += DT; a.update(DT);
  assert.ok(r.flick >= 0, 'the buffered shot must run into the existing swing');
  assert.equal(r.s3RollStop, null, 'a release tick whose fire stays alive must arm nothing');
});

test('#626 the same-tick boundaries are exact at 30/60/120 Hz render schedules', async () => {
  const END = 100;
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('roller');
    a.grounded = true; a.intent.move.set(0, 0, 1);
    const r = a.weaponRunner;
    const clock = new FixedClock();
    let seen = false, endTick = -1, subAt = -1, squidAt = -1;
    for (let frame = 0; frame < 300 / 60 * hz; frame++) {
      clock.advance(1 / hz, dt => {
        const tick = clock.ticks;
        a.intent.fire = tick < END;
        if (tick >= END) { a.intent.sub = true; a.intent.squid = true; }
        f.G.time += dt; a.update(dt);
        if (r.rolling) seen = true;
        if (seen && endTick < 0 && !r.rolling) endTick = tick;
        if (subAt < 0 && r.aimingSub) subAt = tick;
        if (squidAt < 0 && a.form === 'squid') squidAt = tick;
      });
    }
    assert.equal(clock.ticks, 300, `${hz} Hz tick count`);
    assert.equal(endTick, END, `${hz} Hz roll-end tick`);
    // Frame 0 is the release tick itself, so both requests are already late there.
    assert.equal(subAt - endTick, FRAMES.sub, `${hz} Hz sub boundary`);
    assert.equal(squidAt - endTick, FRAMES.squid, `${hz} Hz squid boundary`);
  }
});

test('#626 a dry roll and a roll released into a flick keep their existing behaviour', async () => {
  // Dry roll (#541): no ink is not an interruption of the sourced kind.
  const dry = await establishedRoll({ frames: 60 });
  dry.a.ink = 0;
  runnerTick(dry.f, dry.a, { fire: true });
  assert.equal(dry.r.rolling, false, 'the dry roll ends');
  assert.equal(dry.r.s3RollStop, null, 'a dry roll must not arm the sourced interruption');

  // Releasing into a flick is a normal transition, not a roll stop.
  const into = await establishedRoll();
  runnerTick(into.f, into.a, { fire: true, firePressed: true });
  assert.ok(into.r.flick >= 0, 'the flick must start');
  assert.equal(into.r.s3RollStop, null, 'rolling into a swing must not arm the interruption');
});

test('#626 gameplay values, resets and per-runner isolation are preserved', async () => {
  const { f, a, r } = await establishedRoll();
  const w = a.weapon;
  const values = {
    rollSpeed: w.rollSpeed, rollBaseSpeed: w.rollBaseSpeed, rollDashTime: w.rollDashTime,
    flickWindup: w.flickWindup, verticalWindup: w.verticalWindup,
    flickInterval: w.flickInterval, verticalInterval: w.verticalInterval,
    flickInk: w.flickInk, rollInkPerMeter: w.rollInkPerMeter,
    flickDamageNear: w.flickDamageNear, verticalDamageNear: w.verticalDamageNear,
  };
  runnerTick(f, a, { fire: false });
  assert.ok(r.s3RollStop);
  for (const [k, v] of Object.entries(values)) assert.equal(w[k], v, `${k} changed while gated`);
  // Roll speed and ink bookkeeping are untouched by the interruption.
  assert.equal(r.moveSpeed(), f.PLAYER.runSpeed, 'a stopped roll is not the rolling target');

  // Reset clears the interruption completely.
  r.reset();
  assert.equal(r.s3RollStop, null, 'reset must clear the interruption');
  r.update(DT, { sub: true });
  assert.equal(r.aimingSub, true, 'sub must be admissible again after a reset');

  // A second actor on the other team is unaffected while the first is gated.
  const other = f.make('roller');
  other.team = 1; other.grounded = true;
  const shared = f.PLAYER.runSpeed;
  other.weaponRunner.update(DT, { sub: true });
  assert.equal(other.weaponRunner.aimingSub, true, 'another actor must not inherit the gate');
  assert.equal(f.PLAYER.runSpeed, shared);
});

test('#626 a remote actor gates its own actions identically and never borrows another gate', async () => {
  const f = await fixture();
  // A remote opponent owns the same runner path, so it must get the same windows.
  const remote = f.make('roller');
  remote.team = 1; remote.grounded = true; remote.remote = true; remote.owner = 'peer-1';
  remote.intent.move.set(0, 0, 1);
  const rr = remote.weaponRunner;
  runnerTick(f, remote, { fire: true, firePressed: true });
  for (let i = 1; i < 220; i++) runnerTick(f, remote, { fire: true });
  assert.equal(rr.rolling, true, 'the remote actor must roll');
  runnerTick(f, remote, { fire: false });
  assert.ok(rr.s3RollStop, 'a remote roll end must arm its own interruption');
  const trace = [];
  for (let frame = 1; frame <= 12; frame++) {
    runnerTick(f, remote, { sub: true });
    trace.push([frame, rr.aimingSub]);
  }
  const admitted = trace.findIndex(([, aiming]) => aiming);
  assert.equal(admitted, FRAMES.sub - 1, `remote sub admitted on frame ${admitted + 1}`);
  // The interruption lives on the runner and must not touch actor identity.
  assert.equal(remote.owner, 'peer-1', 'the gate must not reassign the remote actor');
  assert.equal(remote.team, 1, 'the gate must not change the remote actor team');
  assert.equal(remote.name, 'fixture', 'the gate must not change the remote actor name');

  // The local actor, gated separately, must not have been armed by the remote one.
  const local = f.make('roller');
  local.grounded = true; local.isLocal = true;
  assert.equal(local.weaponRunner.s3RollStop, null, 'a remote gate must not arm the local actor');
  local.weaponRunner.update(DT, { sub: true });
  assert.equal(local.weaponRunner.aimingSub, true, 'the local actor is admitted while only the remote is gated');
});

test('#626 30/60/120 Hz render schedules produce the same admission boundaries', async () => {
  const END = 100;                               // the roll-end tick
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('roller');
    a.grounded = true; a.intent.move.set(0, 0, 1);
    const r = a.weaponRunner;
    const clock = new FixedClock();
    const rows = [];
    const total = 300;
    for (let frame = 0; frame < total / 60 * hz; frame++) {
      clock.advance(1 / hz, dt => {
        // FixedClock increments its counter after the callback, so inside it the
        // counter is already this tick's 0-based index.
        const tick = clock.ticks;
        let inp = { fire: true };
        if (tick === 0) inp.firePressed = true;
        if (tick === END) inp = { fire: false };              // the roll ends here
        // A buffered press held through the interruption window.
        if (tick > END) inp = { fire: true, firePressed: true };
        f.G.time += dt;
        r.update(dt, inp);
        rows.push([r.flick, r.rolling, r.s3RollStop ? 1 : 0]);
      });
    }
    assert.equal(clock.ticks, total, `${hz} Hz tick count`);
    assert.equal(rows[END][2], 1, `${hz} Hz must arm on the roll-end tick`);
    // The boundary is the sourced number of fixed ticks at every render rate, not
    // merely self-consistent between them.
    let flickAt = -1;
    for (let t = END; t < rows.length; t++) if (rows[t][0] >= 0) { flickAt = t; break; }
    assert.equal(flickAt - END, FRAMES.main, `${hz} Hz main boundary`);
    for (let t = END; t < flickAt; t++) {
      assert.equal(rows[t][0], -1, `${hz} Hz swing started early on tick ${t}`);
      assert.equal(rows[t][1], false, `${hz} Hz roll restarted early on tick ${t}`);
    }
    traces.push(rows);
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});
