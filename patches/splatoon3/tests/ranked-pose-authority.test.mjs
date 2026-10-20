// #1648: the host scores ranked objectives from admitted owner poses, not from
// guest-supplied/extrapolated actor positions. Real guest NetMatch packets are
// delivered to the real host NetMatch + ranked network wrapper + buildFrame
// (see ranked-host-rig.mjs); world collision and the wall clock are fixtures.
// Logic-level regression, not a two-browser, GPU or Switch measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankedRig } from './ranked-host-rig.mjs';
import { admitRankedPose, createPoseState, POSE_LIMITS } from '../runtime/ranked/pose-admission.mjs';

const DT = 0.05;
// One 20 Hz owner tick: place the real guest actor, optionally forge the wire row, deliver, render the host proxy.
function step(r, i, pos, { vel = [0, 0, 0], dt = DT, row = null, grounded = true, life = null, sj = null, render = true } = {}) {
  const g = r.guests[i];
  r.advance(dt);
  g.actor.pos.set(...pos); g.actor.vel.set(...vel); g.actor.grounded = grounded;
  if (life !== null) g.actor.netLife = life;
  g.actor.superJumpState = sj;
  const packet = r.tick(i, row ? (_, wire) => row(wire) : null);
  r.deliver(i, packet);
  if (render) { r.nm.update(dt); r.nm.applyRemote(r.proxies[i], dt); }
  return packet;
}
const poseOf = (r, i = 0) => r.nm.rankedPose.get(String(r.proxies[i].nid));
const objective = (r, i = 0) => r.frameActor(i).pos;
const near = (a, b, eps = 0.02) => a.every((v, k) => Math.abs(v - b[k]) <= eps);
// A straight honest path at `speed` (u/s) from `from` to `to`, one tick at a time.
function walk(r, i, from, to, speed, opts = {}) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), ticks = Math.max(1, Math.round(length / speed / DT));
  const v = to.map((n, k) => (n - from[k]) / (ticks * DT));
  for (let n = 1; n <= ticks; n++) step(r, i, from.map((c, k) => c + (to[k] - c) * n / ticks), { vel: v, ...opts });
  return ticks;
}

test('legitimate running/swimming to the Rainmaker is fully admitted and picks it up', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  r.engine.rule.state.barrier.active = false;
  step(r, 0, [0, 0, 34]);
  walk(r, 0, [0, 0, 34], [0, 0, 0], 11.5);
  assert.equal(poseOf(r).rejected, 0, 'no legitimate sample is refused');
  assert.ok(near(objective(r), [0, 0, 0]));
  r.engine.update(1 / 60, r.frame());
  assert.equal(r.engine.rule.state.carrier, '2');
});

test('a forged one-tick relocation onto the Rainmaker never reaches the objective rules', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  r.engine.rule.state.barrier.active = false;
  for (let n = 0; n < 6; n++) step(r, 0, [0, 0, 34]);
  step(r, 0, [0, 0, 0]); // finite, in-stage, correct owner/life/monotonic time: teleport 34 m in one tick
  assert.ok(near(objective(r), [0, 0, 34]), 'the objective pose stays at the last accepted position');
  r.engine.update(1 / 60, r.frame());
  assert.equal(r.engine.rule.state.carrier, null, 'no pickup from the forged relocation');
  // the forged position keeps being reported: it only becomes a speed-limited slide, never an instant arrival
  for (let n = 0; n < 6; n++) step(r, 0, [0, 0, 0]);
  assert.ok(near(objective(r), [0, 0, 34]), 'still held 0.3 s later');
  r.engine.update(1 / 60, r.frame());
  assert.equal(r.engine.rule.state.carrier, null);
  for (let n = 0; n < 20; n++) step(r, 0, [0, 0, 0]);
  assert.ok(near(objective(r), [0, 0, 0]), 'a position consistently held and reachable at the speed ceiling is eventually adopted');
  assert.ok(poseOf(r).rejected >= 1);
});

test('a finite forged position cannot be chained in sub-budget steps within one receive instant', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  for (let n = 0; n < 4; n++) step(r, 0, [0, 0, 34]);
  // 40 packets, each only 6 u further (well under a one-tick budget when taken alone), delivered at one host instant
  for (let n = 1; n <= 40; n++) {
    const g = r.guests[0]; g.actor.pos.set(0, 0, 34 - 6 * n);
    r.clock.ms += 1; // ownership timestamps advance, host receive time barely does
    r.deliver(0, r.tick(0));
  }
  const z = objective(r)[2];
  assert.ok(z >= 34 - POSE_LIMITS.hSpeed * POSE_LIMITS.burst - 0.1, `admitted travel stays within the burst budget (z=${z})`);
});

test('an accepted position with a forged huge velocity is not extrapolated into the objective', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  r.engine.rule.state.barrier.active = false;
  for (let n = 0; n < 8; n++) step(r, 0, [0, 0, 27]);
  // accepted position stays z=27 while the row claims vz=-150: playback extrapolates ~0.18 s * 150 = 27 m
  step(r, 0, [0, 0, 27], { vel: [0, 0, -150], row: wire => { wire[6] = -150; } });
  for (let n = 0; n < 12; n++) { r.advance(0.02); r.nm.update(0.02); r.nm.applyRemote(r.proxies[0], 0.02); }
  assert.ok(r.proxies[0].pos.z < 12, `precondition: the playback pose really ran ahead (z=${r.proxies[0].pos.z})`);
  assert.ok(near(objective(r), [0, 0, 27]), 'objective pose is the admitted snapshot');
  r.engine.update(1 / 60, r.frame());
  assert.equal(r.engine.rule.state.carrier, null);
});

test('grounded forgery: an airborne pose claiming grounded is not grounded for the rules', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  step(r, 0, [0, 0, 34]);
  assert.equal(r.frameActor(0).grounded, true, 'control: standing on the floor');
  step(r, 0, [0, 12, 34], { grounded: true });
  assert.equal(r.frameActor(0).grounded, false, 'claimed grounded 12 above the known floor');
  assert.equal(poseOf(r).last.pos[1], 12);
  for (let n = 1; n <= 12; n++) step(r, 0, [0, 12 - n, 34], { grounded: n === 12 }); // an ordinary 20 u/s fall back to the floor
  assert.equal(r.frameActor(0).grounded, true, 'landing is believed again');
});

test('grounded on a moving platform the static floor does not know is believed', async () => {
  const r = await rankedRig({ mode: 'rainmaker', world: { supportedAt: p => p[1] > 2 && p[1] < 3 } });
  step(r, 0, [0, 2.5, 34], { grounded: true });
  assert.equal(r.frameActor(0).grounded, true);
});

test('tunnelling through a wall between consecutive owner samples is refused; the same step in the open is not', async () => {
  const wall = { blocked: (a, b) => (a[0] < 0) !== (b[0] < 0) };
  const r = await rankedRig({ mode: 'rainmaker', world: wall });
  for (let n = 0; n < 4; n++) step(r, 0, [-0.8, 0, 34]);
  step(r, 0, [0.8, 0, 34]); // 1.6 u in one tick: inside the speed budget but through the wall
  for (let n = 0; n < 4; n++) step(r, 0, [0.8, 0, 34]); // keeps claiming the far side for 0.25 s
  assert.ok(near(objective(r), [-0.8, 0, 34]), 'held on the near side of the wall');
  assert.equal(poseOf(r).rejected, 5);
  for (let n = 0; n < 6; n++) step(r, 0, [0.8, 0, 34]);
  assert.ok(near(objective(r), [0.8, 0, 34]), 'a pose held long enough is not blocked forever by a straight-line probe (self-heals)');
  const open = await rankedRig({ mode: 'rainmaker' });
  for (let n = 0; n < 4; n++) step(open, 0, [-0.8, 0, 34]);
  step(open, 0, [0.8, 0, 34]);
  assert.equal(poseOf(open).rejected, 0, 'control: no wall');
});

test('normal variation and low frame rate: 12 u/s at 20 Hz, 4 Hz, and a vertical jump arc are all admitted', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  step(r, 0, [0, 0, 34]);
  let z = 34;
  for (let n = 0; n < 40; n++) { z -= 12 * DT; step(r, 0, [0, 0, z], { vel: [0, 0, -12] }); }
  for (let n = 0; n < 12; n++) { z -= 12 * 0.25; step(r, 0, [0, 0, z], { vel: [0, 0, -12], dt: 0.25 }); } // 4 Hz owner
  // jump: +8.4 u/s launch with gravity 25 (config), airborne then landing
  let y = 0, vy = 8.4;
  for (let n = 0; n < 24; n++) { vy -= 25 * DT; y = Math.max(0, y + vy * DT); z -= 6 * DT; step(r, 0, [0, y, z], { vel: [0, 0, -6], grounded: y === 0 }); }
  assert.equal(poseOf(r).rejected, 0);
  assert.ok(near(objective(r), [0, y, z]));
});

test('implemented special speeds are admitted: Zipcaster 19, Kraken dash 21, Reefslider 24.3 u/s', async () => {
  for (const speed of [19, 21, 24.3]) {
    const r = await rankedRig({ mode: 'rainmaker' });
    step(r, 0, [0, 0, 34]);
    const last = [0, 0, 34 - speed * DT * 18];
    for (let n = 1; n <= 18; n++) step(r, 0, [0, 0, 34 - speed * DT * n], { vel: [0, 0, -speed] });
    assert.equal(poseOf(r).rejected, 0, String(speed));
    assert.ok(near(objective(r), last), String(speed));
  }
});

test('a 1 s lag spike and a 3 s stall followed by packet bursts end at the true position without lasting rejection', async () => {
  for (const stall of [1, 3]) {
    const r = await rankedRig({ mode: 'rainmaker' });
    step(r, 0, [0, 0, 34]);
    for (let n = 0; n < 10; n++) step(r, 0, [0, 0, 34 - 12 * DT * (n + 1)], { vel: [0, 0, -12] });
    let z = 34 - 12 * DT * 10;
    // network stall: the owner keeps ticking but nothing arrives; then the queue is delivered at one instant
    const queued = [];
    for (let n = 0; n < Math.round(stall / DT); n++) { z -= 12 * DT; r.guests[0].actor.pos.set(0, 0, z); r.guests[0].actor.vel.set(0, 0, -12); r.advance(DT); queued.push(r.tick(0)); }
    for (const packet of queued) r.deliver(0, packet);
    // the live stream resumes at normal pacing
    for (let n = 0; n < 60; n++) { z -= 12 * DT; step(r, 0, [0, 0, z], { vel: [0, 0, -12] }); }
    assert.ok(near(objective(r), [0, 0, z]), `stall ${stall}s: objective pose caught up (z=${objective(r)[2]} vs ${z})`);
  }
});

test('respawn epoch: a new life at the team spawner is admitted at once; a new life anywhere else is not a free teleport', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  walk(r, 0, [0, 0, 34], [0, 0, -10], 12);
  step(r, 0, [0, 0, -10], { life: 1 });
  step(r, 0, [0, 6, 34], { life: 2 }); // died far from home, reappears at the spawner ring
  assert.ok(near(objective(r), [0, 6, 34]), 'respawn relocation admitted');
  const f = await rankedRig({ mode: 'rainmaker' });
  for (let n = 0; n < 4; n++) step(f, 0, [0, 0, 34]);
  step(f, 0, [0, 0, 0], { life: 2 }); // forged life bump mid-arena
  assert.ok(near(objective(f), [0, 0, 34]), 'a life bump away from the spawner earns no relocation');
});

// Real Actor.superJump/_updateSuperJump on the guest. `lostFlight` models an owner frame hitch/packet gap
// that swallows the whole flight, so the host sees the charge pose and then the landing pose.
function superJump(r, i, target, { lostFlight = true, abortAfter = null } = {}) {
  const g = r.guests[i].actor, nm = r.guests[i].nm;
  assert.equal(g.superJump(target), true);
  let charged = 0;
  for (let n = 0; n < 120 && g.superJumpState; n++) {
    r.advance(DT);
    r.f.G.netm = nm; for (let k = 0; k < 3; k++) g.update(DT / 3); r.f.G.netm = r.nm;
    const phase = g.superJumpState?.phase;
    if (phase === 'charge') charged += DT;
    if (abortAfter !== null && charged >= abortAfter) { g.superJumpState = null; g.pos.copy(target); break; }
    if (!lostFlight || phase === 'charge' || !g.superJumpState) { r.deliver(i, r.tick(i)); r.nm.update(DT); r.nm.applyRemote(r.proxies[i], DT); }
  }
  r.deliver(i, r.tick(i)); r.nm.update(DT); r.nm.applyRemote(r.proxies[i], DT);
}
test('Super Jump epoch: a charged and flown jump lands at a teammate; spoofed or unanchored landings are held back', async () => {
  const base = async () => {
    const r = await rankedRig({ mode: 'rainmaker', guestCount: 2, starts: [[0, 0, 34], [0, 0, -30]] });
    r.f = r; // fixture handle for G
    for (let n = 0; n < 6; n++) { step(r, 0, [0, 0, 34]); step(r, 1, [0, 0, -30]); }
    return r;
  };
  const landed = r => poseOf(r, 0).last.pos;
  const ok = await base();
  superJump(ok, 0, ok.guests[1].actor);
  assert.ok(Math.abs(ok.guests[0].actor.pos.z + 31) < 1.5, 'precondition: the real jump landed beside the teammate');
  assert.ok(near(landed(ok), ok.guests[0].actor.pos.toArray(), 0.05), 'landing beside a teammate is admitted immediately, 65 u from the charge pose');
  assert.equal(poseOf(ok, 0).last.relocation, true);

  const spoof = await base();
  superJump(spoof, 0, spoof.guests[1].actor, { abortAfter: 0.3 });
  assert.ok(landed(spoof)[2] > 10, 'SJ flags for 0.3 s (< the 0.75 s charge phase) buy no relocation');

  const nowhere = await base();
  superJump(nowhere, 0, new nowhere.THREE.Vector3(0, 0, 6)); // neither a teammate nor a home point
  assert.ok(landed(nowhere)[2] > 10, 'an unanchored landing is not adopted instantly');
  for (let n = 0; n < 60; n++) step(nowhere, 0, [0, 0, 6]);
  assert.ok(near(landed(nowhere), [0, 0, 6]), 'but it is adopted once reachable at the speed ceiling');

  // the home point is an anchor too
  const home = await base();
  superJump(home, 0, home.G.level.spawnPads[0].clone());
  assert.ok(near(landed(home), home.guests[0].actor.pos.toArray(), 0.05));
});

test('host promotion clears admission state; a re-seeded actor is scored from where it was drawn, not from a far forged tick', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  for (let n = 0; n < 6; n++) step(r, 0, [0, 0, 20]);
  r.nm.onLeave('departed-peer', true);
  assert.equal(r.nm.rankedPose.size, 0);
  const drawn = r.proxies[0].pos.toArray();
  step(r, 0, [0, 0, -30]); // first tick after the handoff is 50 m from where the host drew it
  assert.ok(near(objective(r), drawn, 0.05), 'forged first snapshot held at the drawn pose');
});

test('replayed, stale-owner and reordered snapshots cannot move the objective pose', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  const first = step(r, 0, [0, 0, 34]);
  step(r, 0, [0, 0, 33]);
  r.deliver(0, first); // replay of an older tick
  const intruder = r.tick(0, (_, row) => { row[1] = 0; row[3] = 0; });
  r.nm.onMessage('somebody-else', intruder); // another sender may not drive this actor
  assert.ok(near(objective(r), [0, 0, 33]));
});

test('a remote actor is scored from its admitted pose by the host only; guests and local actors keep their own', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  for (let n = 0; n < 4; n++) step(r, 0, [0, 0, 34]);
  step(r, 0, [0, 0, 0]);
  assert.ok(near(r.frameActor(0).pos, [0, 0, 34]));
  assert.ok(near(r.frame().actors.find(a => a.id === '1').pos, [0, 0, -30]), 'the host-owned actor is unchanged');
  r.nm.s.isHost = false; // a guest-built frame (bot planning) has no admission state
  assert.ok(near(r.frameActor(0).pos, r.proxies[0].pos.toArray()));
});

// ---- pure admission core ---------------------------------------------------------------------------------------------
const sample = (at, pos, extra = {}) => ({ t: at, at, pos, flags: 17, life: 1, ...extra });
test('admitRankedPose: budget is host-receive time only; owner timestamps cannot widen it', () => {
  const s = createPoseState([0, 0, 0], 0, true);
  // owner clock claims an hour passed between two packets that arrived 50 ms apart
  assert.equal(admitRankedPose(s, { ...sample(0.05, [0, 0, 5]), t: 3600 }), true, '5 u fits the 0.5 s burst');
  assert.equal(admitRankedPose(s, { ...sample(0.10, [0, 0, 60]), t: 7200 }), false);
  assert.deepEqual(s.last.pos, [0, 0, 5]);
});
test('admitRankedPose: a held-back pose may catch up at no more than the speed ceiling', () => {
  const s = createPoseState([0, 0, 0], 0, true);
  const target = [0, 0, 60];
  let admittedAt = null;
  for (let n = 1; n <= 200 && admittedAt === null; n++) if (admitRankedPose(s, sample(n * 0.05, target))) admittedAt = n * 0.05;
  const minimum = 60 / POSE_LIMITS.hSpeed - POSE_LIMITS.burst; // time the ceiling needs beyond the burst
  assert.ok(admittedAt >= minimum - 0.06, `adopted at ${admittedAt}s, not before ${minimum}s`);
  assert.ok(admittedAt <= 60 / POSE_LIMITS.hSpeed + 0.2);
});
test('admitRankedPose: malformed samples change nothing', () => {
  const s = createPoseState([0, 0, 0], 0, true);
  for (const bad of [{ ...sample(1, [NaN, 0, 0]) }, { ...sample(1, [0, 0]) }, { ...sample(1, [0, 0, 0]), flags: 1.5 }, { ...sample(NaN, [0, 0, 0]) }])
    assert.equal(admitRankedPose(s, bad), false);
  assert.equal(s.admitted + s.rejected, 0);
});
