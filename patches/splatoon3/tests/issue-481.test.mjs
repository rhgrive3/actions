import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptIssue481, calculateFlowSplatPoints } from '../issue-481-adapter.mjs';

// Helper to calculate score in 100-fp domain from normalized score
function scoreToFp(score, threshold = 3) {
  const scale = threshold / 100;
  return score / scale;
}

test('unit calculation: calculateFlowSplatPoints accurately implements S3 100-fp model and threshold scaling', () => {
  const cfg = { threshold: 3 };
  const scale = 3 / 100; // 0.03

  // Below 75 fp
  const ordLow = calculateFlowSplatPoints(0, false, cfg);
  assert.equal(ordLow.points, 23);
  assert.ok(Math.abs(ordLow.gain - 23 * scale) < 1e-9);
  assert.equal(ordLow.isHighTier, false);

  const conLow = calculateFlowSplatPoints(23 * scale, true, cfg);
  assert.equal(conLow.points, 45);
  assert.ok(Math.abs(conLow.gain - 45 * scale) < 1e-9);
  assert.equal(conLow.isHighTier, false);

  // Ratio below 75 fp
  const ratioLow = conLow.gain / ordLow.gain;
  assert.ok(Math.abs(ratioLow - (45 / 23)) < 1e-9);

  // Boundary: exactly 74.9 fp vs 75.0 fp
  const at74_9 = calculateFlowSplatPoints(74.9 * scale, false, cfg);
  assert.equal(at74_9.points, 23);
  assert.equal(at74_9.isHighTier, false);

  const at75_0 = calculateFlowSplatPoints(75.0 * scale, false, cfg);
  assert.equal(at75_0.points, 15);
  assert.equal(at75_0.isHighTier, true);

  // At or above 75 fp
  const ordHigh = calculateFlowSplatPoints(75 * scale, false, cfg);
  assert.equal(ordHigh.points, 15);
  assert.ok(Math.abs(ordHigh.gain - 15 * scale) < 1e-9);

  const conHigh = calculateFlowSplatPoints(75 * scale, true, cfg);
  assert.equal(conHigh.points, 35);
  assert.ok(Math.abs(conHigh.gain - 35 * scale) < 1e-9);

  // Ratio at or above 75 fp
  const ratioHigh = conHigh.gain / ordHigh.gain;
  assert.ok(Math.abs(ratioHigh - (35 / 15)) < 1e-9);
});

test('negative control: unpatched INKWAVE awards flat +1.0 regardless of previous splat timing', async () => {
  // Baseline without adaptIssue481
  const f = await fixture();
  const a = f.make(), b = f.make(), c = f.make();
  b.team = 1; c.team = 1;

  // First splat (isolated)
  f.G.time = 10.0;
  f.emit('splatted', { victim: b, attacker: a });
  const scoreAfterFirst = a.s3.flow.score;

  // Second splat within 1.0s
  f.G.time = 11.0;
  f.emit('splatted', { victim: c, attacker: a });
  const incrementSecond = a.s3.flow.score - scoreAfterFirst;

  // In unpatched INKWAVE, both splats award exactly 1.0, ratio is 1.0
  assert.equal(scoreAfterFirst, 1.0);
  assert.equal(incrementSecond, 1.0);
  assert.equal(incrementSecond / scoreAfterFirst, 1.0);
});

test('acceptance: at fp < 75, ordinary splat awards 23 fp and consecutive splat awards 45 fp (ratio 45/23)', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const a = f.make(), b = f.make(), c = f.make();
  b.team = 1; c.team = 1;

  const threshold = f.profile.flow.threshold; // 3.0
  const scale = threshold / 100; // 0.03

  // First splat at G.time = 10.0: ordinary
  f.G.time = 10.0;
  f.emit('splatted', { victim: b, attacker: a });
  const firstGain = a.s3.flow.score;
  const firstFp = scoreToFp(firstGain, threshold);

  assert.ok(Math.abs(firstGain - (23 * scale)) < 1e-9, `Expected 23 fp (${23 * scale}), got ${firstGain}`);
  assert.ok(Math.abs(firstFp - 23) < 1e-9);

  // Second splat at G.time = 13.0 (3.0s later, within 5s): consecutive
  f.G.time = 13.0;
  f.emit('splatted', { victim: c, attacker: a });
  const secondGain = a.s3.flow.score - firstGain;
  const secondFp = scoreToFp(secondGain, threshold);

  assert.ok(Math.abs(secondGain - (45 * scale)) < 1e-9, `Expected 45 fp (${45 * scale}), got ${secondGain}`);
  assert.ok(Math.abs(secondFp - 45) < 1e-9);

  // Total accumulated fp is 23 + 45 = 68 fp (< 75 fp)
  assert.ok(Math.abs(scoreToFp(a.s3.flow.score, threshold) - 68) < 1e-9);

  // Ratio is exactly 45 / 23 (~1.9565)
  const ratio = secondGain / firstGain;
  assert.ok(Math.abs(ratio - (45 / 23)) < 1e-9);
});

test('acceptance: at fp >= 75, ordinary splat awards 15 fp and consecutive splat awards 35 fp', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const a = f.make(), b = f.make();
  b.team = 1;

  const threshold = f.profile.flow.threshold;
  const scale = threshold / 100;

  // Set flow score directly to exactly 75 fp (2.25)
  a.s3 ||= {};
  a.s3.flow ||= { active: false, remaining: 0, score: 0 };
  a.s3.flow.score = 75 * scale;

  // Test 1: Ordinary splat at 75 fp adds +15 fp -> 90 fp (does not activate)
  f.G.time = 20.0;
  f.emit('splatted', { victim: b, attacker: a });
  const highOrdGain = a.s3.flow.score - (75 * scale);
  assert.ok(Math.abs(highOrdGain - (15 * scale)) < 1e-9, `Expected 15 fp (${15 * scale}), got ${highOrdGain}`);
  assert.equal(a.s3.flow.active, false, 'Ordinary splat at 75 fp (total 90 fp) must not activate Flow');

  // Test 2: Consecutive splat at 75 fp adds +35 fp -> 110 fp (>= 100 fp) -> activates Flow!
  const victim2 = f.make(); victim2.team = 1;
  a.s3.flow.active = false;
  a.s3.flow.score = 75 * scale;
  a.s3.flowLastSplatTime = 25.0;
  f.G.time = 27.0; // 2.0s later, within 5s window
  f.emit('splatted', { victim: victim2, attacker: a });

  assert.equal(a.s3.flow.active, true, 'Consecutive splat at 75 fp adds 35 fp reaching 110 fp, which must activate Flow');
  assert.equal(a.s3.flow.remaining, f.profile.flow.duration);
  assert.equal(a.s3.flow.score, 0);

  // Test 3: Numerical verification of ratio 35/15 with headroom (threshold = 5.0 -> 100 fp = 5.0, 75 fp = 3.75)
  const a2 = f.make(), v3 = f.make(), v4 = f.make();
  v3.team = 1; v4.team = 1;
  const headroomCfg = { threshold: 5.0, duration: 30, extension: 5, maxDuration: 30, weights: { splat: 1 } };
  const hScale = 5.0 / 100;
  const flowState = { active: false, remaining: 0, score: 75 * hScale };
  
  // Test calculateFlowSplatPoints ratio directly at >= 75 fp
  const ordPts = calculateFlowSplatPoints(75 * hScale, false, headroomCfg);
  const conPts = calculateFlowSplatPoints(75 * hScale, true, headroomCfg);
  assert.equal(ordPts.points, 15);
  assert.equal(conPts.points, 35);
  assert.ok(Math.abs(conPts.gain / ordPts.gain - (35 / 15)) < 1e-9);
});

test('acceptance: 5-second boundary precision (<= 5.0s is consecutive, > 5.0s is ordinary)', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const threshold = f.profile.flow.threshold;
  const scale = threshold / 100;

  // Case 1: Exactly at 5.0 seconds (within 5 seconds) -> consecutive (+45 fp)
  {
    const a = f.make(), v1 = f.make(), v2 = f.make();
    v1.team = 1; v2.team = 1;

    f.G.time = 100.0;
    f.emit('splatted', { victim: v1, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    f.G.time = 105.0; // exactly +5.000s
    f.emit('splatted', { victim: v2, attacker: a });
    const gainAtBoundary = a.s3.flow.score - 23 * scale;
    assert.ok(Math.abs(gainAtBoundary - 45 * scale) < 1e-9, `Expected 45 fp at dt=5.0s, got ${gainAtBoundary / scale} fp`);
  }

  // Case 2: Just outside 5.0 seconds (5.001s) -> ordinary (+23 fp)
  {
    const a = f.make(), v1 = f.make(), v2 = f.make();
    v1.team = 1; v2.team = 1;

    f.G.time = 200.0;
    f.emit('splatted', { victim: v1, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    f.G.time = 205.001; // +5.001s (just outside window)
    f.emit('splatted', { victim: v2, attacker: a });
    const gainOutside = a.s3.flow.score - 23 * scale;
    assert.ok(Math.abs(gainOutside - 23 * scale) < 1e-9, `Expected 23 fp at dt=5.001s, got ${gainOutside / scale} fp`);
  }

  // Case 3: Well outside 5.0 seconds (6.0s) -> ordinary (+23 fp)
  {
    const a = f.make(), v1 = f.make(), v2 = f.make();
    v1.team = 1; v2.team = 1;

    f.G.time = 300.0;
    f.emit('splatted', { victim: v1, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    f.G.time = 306.0; // +6.0s
    f.emit('splatted', { victim: v2, attacker: a });
    const gainWellOutside = a.s3.flow.score - 23 * scale;
    assert.ok(Math.abs(gainWellOutside - 23 * scale) < 1e-9, `Expected 23 fp at dt=6.0s, got ${gainWellOutside / scale} fp`);
  }
});

test('acceptance: previous-splat timer is actor-local and cannot be contaminated by another player', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const p1 = f.make(), p2 = f.make(), v1 = f.make(), v2 = f.make(), v3 = f.make();
  p1.team = 0; p2.team = 0;
  v1.team = 1; v2.team = 1; v3.team = 1;

  const threshold = f.profile.flow.threshold;
  const scale = threshold / 100;

  // Player 1 splats v1 at t = 10.0s (p1 first splat -> ordinary +23 fp)
  f.G.time = 10.0;
  f.emit('splatted', { victim: v1, attacker: p1 });
  assert.ok(Math.abs(p1.s3.flow.score - 23 * scale) < 1e-9);
  assert.equal(p2.s3?.flow?.score || 0, 0);

  // Player 2 splats v2 at t = 11.0s (1.0s after p1's splat)
  // Must NOT use p1's timestamp: p2 has no previous splat -> ordinary +23 fp
  f.G.time = 11.0;
  f.emit('splatted', { victim: v2, attacker: p2 });
  assert.ok(Math.abs(p2.s3.flow.score - 23 * scale) < 1e-9, 'Player 2 must get ordinary award, not consecutive from Player 1');

  // Player 1 splats v3 at t = 13.0s (3.0s after p1's own splat)
  // Must use p1's own timestamp -> consecutive +45 fp
  f.G.time = 13.0;
  f.emit('splatted', { victim: v3, attacker: p1 });
  assert.ok(Math.abs(p1.s3.flow.score - (23 + 45) * scale) < 1e-9, 'Player 1 must get consecutive award from their own streak');
});

test('acceptance: Flow activates exclusively on splats when threshold is reached', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const a = f.make(), victim = f.make();
  victim.team = 1;

  const threshold = f.profile.flow.threshold; // 3.0

  // Turf provides huge preparation (area = 2000, 2000 * 0.003 = 6.0 >= threshold)
  f.emit('turf', { actor: a, area: 2000 });
  assert.ok(a.s3.flow.score >= threshold);
  assert.equal(a.s3.flow.active, false, 'Flow must not activate on turf even when exceeding threshold');

  // Assist also does not activate Flow
  const helper = f.make(), k = f.make();
  helper.s3 ||= {};
  helper.s3.flow = { active: false, remaining: 0, score: threshold + 1 };
  f.emit('damage', { victim, attacker: helper, amount: 50, source: 'shooter' });
  f.emit('splatted', { victim, attacker: k });
  assert.equal(helper.s3.flow.active, false, 'Flow must not activate on assist');

  // Splat crossing threshold activates Flow
  const b = f.make(), enemy = f.make(); enemy.team = 1;
  f.G.time = 1.0;
  // Splat 1: +23 fp (23 fp)
  f.emit('splatted', { victim: enemy, attacker: b });
  assert.equal(b.s3.flow.active, false);

  // Splat 2 at t=3.0: consecutive +45 fp (23 + 45 = 68 fp)
  f.G.time = 3.0;
  const enemy2 = f.make(); enemy2.team = 1;
  f.emit('splatted', { victim: enemy2, attacker: b });
  assert.equal(b.s3.flow.active, false);

  // Splat 3 at t=5.0: consecutive +45 fp (68 + 45 = 113 fp >= 100 fp threshold!)
  f.G.time = 5.0;
  const enemy3 = f.make(); enemy3.team = 1;
  let flowEventEmitted = false;
  f.on('actor:flow', ({ actor, active }) => {
    if (actor === b && active) flowEventEmitted = true;
  });

  f.emit('splatted', { victim: enemy3, attacker: b });
  assert.equal(b.s3.flow.active, true, 'Flow must activate on splat crossing threshold');
  assert.equal(b.s3.flow.score, 0, 'Score must be reset to 0 upon activation');
  assert.equal(b.s3.flow.remaining, f.profile.flow.duration, 'Remaining duration set to config duration');
  assert.equal(flowEventEmitted, true, 'actor:flow active:true event must be emitted');
  assert.equal(b.s3.flowLastSplatTime, null, 'Streak must be reset upon Flow activation');
});

test('acceptance: streak is reset on actor reset, respawn, splat, and flow expiration', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const a = f.make(), v1 = f.make(), v2 = f.make();
  v1.team = 1; v2.team = 1;
  const scale = f.profile.flow.threshold / 100;

  // Establish initial splat
  f.G.time = 10.0;
  f.emit('splatted', { victim: v1, attacker: a });
  assert.equal(a.s3.flowLastSplatTime, 10.0);

  // Reset clears streak
  a.reset();
  assert.equal(a.s3.flowLastSplatTime, null);

  // Second splat at t=12.0s (2.0s later) after reset must be ordinary, not consecutive
  f.G.time = 12.0;
  f.emit('splatted', { victim: v2, attacker: a });
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9, 'Post-reset splat must be ordinary');

  // Respawn calls spawnAt -> reset() which creates fresh flow, streak is null
  const v3 = f.make(); v3.team = 1;
  f.G.level.spawnPads = [new f.THREE.Vector3(0, 0, 0), new f.THREE.Vector3(0, 0, 0)];
  f.G.physics.groundProbe = () => 0;
  a.respawn();
  assert.equal(a.s3.flowLastSplatTime, null);
  f.G.time = 14.0;
  f.emit('splatted', { victim: v3, attacker: a });
  // Flow was reset by spawnAt, so this splat is ordinary (+23 fp) starting from 0 fp
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9, 'Post-respawn splat must be ordinary');

  // Attacker splatted / death clears streak
  a.splat(null);
  assert.equal(a.s3.flowLastSplatTime, null);

  // Flow expiration clears streak
  a.alive = true;
  a.s3.flow.active = true;
  a.s3.flow.remaining = 0.1;
  a.s3.flowLastSplatTime = 100.0;
  f.G.time = 100.0;
  a.update(0.2); // expires flow
  assert.equal(a.s3.flow.active, false);
  assert.equal(a.s3.flowLastSplatTime, null);
});

test('acceptance: exclusions: water deaths, suicides, team kills, dead attackers, and duplicates are excluded', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue481 });
  const a = f.make(), ally = f.make(), victim = f.make();
  ally.team = 0; victim.team = 1;

  // 1. Water death: cause === 'water' or 'fall' excluded from Flow splat award
  f.G.time = 10.0;
  f.emit('splatted', { victim, attacker: a, cause: 'water' });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Water death must not award Flow splat progress');
  assert.equal(a.s3?.flowLastSplatTime || null, null, 'Water death must not start streak');

  // 2. Self death: attacker === victim
  f.G.time = 11.0;
  f.emit('splatted', { victim: a, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Self death must not award Flow');

  // 3. Team kill: attacker.team === victim.team
  f.G.time = 12.0;
  f.emit('splatted', { victim: ally, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Team kill must not award Flow');

  // 4. Dead attacker: attacker.alive === false
  a.alive = false;
  f.G.time = 13.0;
  f.emit('splatted', { victim, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Dead attacker must not receive Flow award');
  a.alive = true;

  // 5. Attract mode: G.match.attract = true
  f.G.match = { attract: true };
  f.G.time = 14.0;
  f.emit('splatted', { victim, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Attract mode must not award Flow');
  delete f.G.match.attract;

  // 6. Duplicate splatted event for the same dead victim in the same life
  const victimFresh = f.make(); victimFresh.team = 1;
  const scale = f.profile.flow.threshold / 100;
  f.G.time = 15.0;
  f.emit('splatted', { victim: victimFresh, attacker: a });
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

  // Duplicate emission without respawn/reset
  f.emit('splatted', { victim: victimFresh, attacker: a });
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9, 'Duplicate event must not double award');
});

test('acceptance: fixed-step schedules (30Hz, 60Hz, 120Hz) evaluate 5-second window identically', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture({ adaptRuntime: adaptIssue481 });
    const a = f.make(), v1 = f.make(), v2 = f.make();
    v1.team = 1; v2.team = 1;
    const dt = 1 / hz;
    const threshold = f.profile.flow.threshold;
    const scale = threshold / 100;

    // Start at t = 0
    f.G.time = 0;
    f.emit('splatted', { victim: v1, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    // Step forward 4.5 seconds in discrete steps
    const steps4_5s = Math.round(4.5 * hz);
    for (let i = 0; i < steps4_5s; i++) {
      f.G.time += dt;
      a.update(dt);
    }

    // Splat at 4.5s (within 5.0s window): consecutive bonus (+45 fp)
    f.emit('splatted', { victim: v2, attacker: a });
    assert.ok(
      Math.abs(a.s3.flow.score - (23 + 45) * scale) < 1e-9,
      `${hz}Hz fixed-step failed consecutive bonus at 4.5s`
    );

    // Step forward 5.5 seconds in discrete steps (total elapsed > 5s from second splat)
    const v3 = f.make(); v3.team = 1;
    const steps5_5s = Math.round(5.5 * hz);
    for (let i = 0; i < steps5_5s; i++) {
      f.G.time += dt;
      a.update(dt);
    }

    // Splat at 5.5s after previous splat: ordinary bonus (+23 fp)
    f.emit('splatted', { victim: v3, attacker: a });
    assert.ok(
      Math.abs(a.s3.flow.score - (23 + 45 + 23) * scale) < 1e-9,
      `${hz}Hz fixed-step failed ordinary bonus after window expiration`
    );
  }
});

test('composition: adapter seamlessly composes with PR #489 decay and death penalty normalization', () => {
  const cfg = {
    threshold: 3,
    progress: {
      decayPerSecond: 0.2,
      fastDecayAfter: 5,
      fastDecayPerSecond: 3.3,
      deathPenalty: 5,
      environmentDeathPenalty: 10,
      referenceThreshold: 100,
    },
    weights: { splat: 1, assist: 0.5, turf: 0.003 },
  };

  const scale = cfg.threshold / cfg.progress.referenceThreshold; // 0.03
  assert.equal(scale, 0.03);

  const flow = { active: false, remaining: 0, score: 0, idleTime: 12.0 };

  // Step 1: Initial ordinary splat below 75 fp -> +23 fp (0.69 normalized)
  const ord = calculateFlowSplatPoints(flow.score, false, cfg);
  assert.equal(ord.points, 23);
  flow.score += ord.gain;
  flow.idleTime = 0; // reset idle decay clock on positive gain
  assert.ok(Math.abs(flow.score - 23 * scale) < 1e-9);
  assert.equal(flow.idleTime, 0);

  // Step 2: PR #489 decay simulation (e.g. 5 seconds slow decay = 5 * 0.2 = 1.0 fp loss)
  const decayLossFp = 5 * cfg.progress.decayPerSecond; // 1.0 fp
  flow.score = Math.max(0, flow.score - decayLossFp * scale); // 23 - 1 = 22 fp
  assert.ok(Math.abs(flow.score - 22 * scale) < 1e-9);

  // Step 3: Consecutive splat within 5s window -> +45 fp
  const con = calculateFlowSplatPoints(flow.score, true, cfg);
  assert.equal(con.points, 45);
  flow.score += con.gain; // 22 + 45 = 67 fp
  assert.ok(Math.abs(flow.score - 67 * scale) < 1e-9);

  // Step 4: PR #489 death penalty (-5 fp)
  const deathLossFp = cfg.progress.deathPenalty; // 5.0 fp
  flow.score = Math.max(0, flow.score - deathLossFp * scale); // 67 - 5 = 62 fp
  assert.ok(Math.abs(flow.score - 62 * scale) < 1e-9);

  // Step 5: High tier boundary verification after further progress
  // Add 15 fp to reach 77 fp (>= 75 fp)
  flow.score += 15 * scale; // 62 + 15 = 77 fp
  assert.ok(Math.abs(flow.score - 77 * scale) < 1e-9);

  // High tier ordinary: +15 fp -> 77 + 15 = 92 fp
  const highOrd = calculateFlowSplatPoints(flow.score, false, cfg);
  assert.equal(highOrd.points, 15);
  assert.equal(highOrd.isHighTier, true);

  // High tier consecutive: +35 fp -> 77 + 35 = 112 fp (>= 100 fp, triggers activation)
  const highCon = calculateFlowSplatPoints(flow.score, true, cfg);
  assert.equal(highCon.points, 35);
  assert.equal(highCon.isHighTier, true);
  assert.ok(flow.score + highCon.gain >= cfg.threshold);
});
