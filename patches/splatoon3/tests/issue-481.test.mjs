import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptIssue481, adaptIssue481Flow, calculateFlowSplatPoints } from '../issue-481-adapter.mjs';
import { adaptPR489Flow, pr489FlowProgress } from './pr-489-fixture.mjs';

import { adaptQualitySource } from '../../local-quality/adapter.mjs';
function claimMatchFirstSplat(f) {
  const match = f.G.match || (f.G.match = {});
  match.mode = 'turf'; match.attract = false; match.range = null;
  if (match.opts?.range) match.opts = { ...match.opts, range: null };
  const attacker = f.make(), victim = f.make(); attacker.team = 0; victim.team = 1;
  f.emit('splatted', { victim, attacker, cause: 'weapon' });
}
const productionFixture = async (extra = {}) => {
  const f = await fixture({ ...extra, productionComposition: true, adaptRuntime: adaptQualitySource });
  // The setup event claims #529's match bonus through the live event path.
  claimMatchFirstSplat(f);
  return f;
};

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
  claimMatchFirstSplat(f);
  const a = f.make(), b = f.make(), c = f.make();
  b.team = 1; c.team = 1;

  // First splat (isolated)
  f.emit('splatted', { victim: b, attacker: a });
  assert.equal(a.s3.flow.score, 1.0);

  // Second splat immediately after (2 seconds, within consecutive window)
  f.G.time = 2.0;
  f.emit('splatted', { victim: c, attacker: a });
  // Unpatched adds flat +1.0 -> 2.0 (ratio 1.0, failing consecutive multi-splat incentive)
  assert.equal(a.s3.flow.score, 2.0);
});

test('acceptance: at fp < 75, ordinary splat awards 23 fp and consecutive splat awards 45 fp (ratio 45/23)', async () => {
  const f = await productionFixture();
  const a = f.make(), b = f.make(), c = f.make();
  b.team = 1; c.team = 1;
  const threshold = f.profile.flow.threshold; // default 3
  const scale = threshold / 100; // 0.03

  // Initial state
  assert.equal(a.s3.flow.score, 0);

  // 1. First splat: ordinary award (+23 fp)
  f.G.time = 10.0;
  f.emit('splatted', { victim: b, attacker: a });
  const scoreAfter1 = a.s3.flow.score;
  const fpAfter1 = scoreToFp(scoreAfter1, threshold);
  assert.ok(Math.abs(fpAfter1 - 23) < 1e-9);
  assert.ok(Math.abs(scoreAfter1 - 23 * scale) < 1e-9);

  // 2. Second splat at t = 13.0 (within 5 seconds of previous splat at t = 10.0): consecutive award (+45 fp)
  f.G.time = 13.0;
  f.emit('splatted', { victim: c, attacker: a });
  const scoreAfter2 = a.s3.flow.score;
  const fpAfter2 = scoreToFp(scoreAfter2, threshold);
  assert.ok(Math.abs(fpAfter2 - (23 + 45)) < 1e-9);
  assert.ok(Math.abs(scoreAfter2 - (23 + 45) * scale) < 1e-9);

  // Check ratio of consecutive gain to ordinary gain
  const consecutiveGain = scoreAfter2 - scoreAfter1;
  const ordinaryGain = scoreAfter1;
  const ratio = consecutiveGain / ordinaryGain;
  assert.ok(Math.abs(ratio - (45 / 23)) < 1e-9);
});

test('acceptance: at fp >= 75, ordinary splat awards 15 fp and consecutive splat awards 35 fp', async () => {
  const f = await productionFixture();
  const a = f.make(), b = f.make();
  b.team = 1;
  const threshold = f.profile.flow.threshold;
  const scale = threshold / 100;

  // Preset Flow score to 75 fp (2.25 normalized)
  a.s3.flow.score = 75 * scale;
  assert.ok(Math.abs(scoreToFp(a.s3.flow.score, threshold) - 75) < 1e-9);

  // 1. Isolated splat at 75 fp: ordinary high-tier award (+15 fp)
  f.G.time = 10.0;
  f.emit('splatted', { victim: b, attacker: a });
  assert.ok(Math.abs(scoreToFp(a.s3.flow.score, threshold) - (75 + 15)) < 1e-9);

  // Reset to 75 fp for consecutive test
  a.s3.flow.score = 75 * scale;
  a.s3.flowLastSplatTime = 10.0; // previous splat at 10.0s

  // 2. Consecutive splat at t = 12.5s (within 5s): consecutive high-tier award (+35 fp)
  const victim2 = f.make(); victim2.team = 1;
  f.G.time = 12.5;
  f.emit('splatted', { victim: victim2, attacker: a });
  // Crossing 100 fp triggers activation!
  // In awardFlow: state.active = true, state.remaining = cfg.duration (30), state.score = 0
  assert.equal(a.s3.flow.active, true);
  assert.equal(a.s3.flow.remaining, f.profile.flow.duration);
  assert.equal(a.s3.flow.score, 0);
  assert.equal(a.s3.flowLastSplatTime, null); // streak cleared on activation
});

test('acceptance: 5-second boundary precision (<= 5.0s is consecutive, > 5.0s is ordinary)', async () => {
  const f = await productionFixture();
  const a = f.make();
  const threshold = f.profile.flow.threshold;
  const scale = threshold / 100;

  // Case 1: Exactly 4.999s elapsed -> Consecutive (+45 fp)
  {
    const v1 = f.make(), v2 = f.make();
    v1.team = 1; v2.team = 1;
    f.G.time = 10.0;
    f.emit('splatted', { victim: v1, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    f.G.time = 14.999;
    f.emit('splatted', { victim: v2, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - (23 + 45) * scale) < 1e-9);
  }

  // Case 2: Exactly 5.000s elapsed -> Consecutive (+45 fp, boundary inclusive)
  {
    a.reset();
    const v3 = f.make(), v4 = f.make();
    v3.team = 1; v4.team = 1;
    f.G.time = 20.0;
    f.emit('splatted', { victim: v3, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    f.G.time = 25.000;
    f.emit('splatted', { victim: v4, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - (23 + 45) * scale) < 1e-9);
  }

  // Case 3: Exactly 5.001s elapsed -> Ordinary (+23 fp, window expired)
  {
    a.reset();
    const v5 = f.make(), v6 = f.make();
    v5.team = 1; v6.team = 1;
    f.G.time = 30.0;
    f.emit('splatted', { victim: v5, attacker: a });
    assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);

    f.G.time = 35.001;
    f.emit('splatted', { victim: v6, attacker: a });
    // Window expired: ordinary award (+23 fp)
    assert.ok(Math.abs(a.s3.flow.score - (23 + 23) * scale) < 1e-9);
  }
});

test('acceptance: previous-splat timer is actor-local and cannot be contaminated by another player', async () => {
  const f = await productionFixture();
  const p1 = f.make(), p2 = f.make();
  const v1 = f.make(), v2 = f.make(), v3 = f.make();
  v1.team = 1; v2.team = 1; v3.team = 1;
  const scale = f.profile.flow.threshold / 100;

  // t = 0: P1 splats V1
  f.G.time = 0.0;
  f.emit('splatted', { victim: v1, attacker: p1 });
  assert.ok(Math.abs(p1.s3.flow.score - 23 * scale) < 1e-9);
  assert.equal(p1.s3.flowLastSplatTime, 0.0);
  assert.equal(p2.s3?.flowLastSplatTime || null, null);

  // t = 2.0: P2 splats V2 (independent isolated splat for P2)
  f.G.time = 2.0;
  f.emit('splatted', { victim: v2, attacker: p2 });
  assert.ok(Math.abs(p2.s3.flow.score - 23 * scale) < 1e-9);
  assert.equal(p2.s3.flowLastSplatTime, 2.0);
  assert.equal(p1.s3.flowLastSplatTime, 0.0); // P1 unchanged

  // t = 4.0: P1 splats V3 (elapsed 4.0s from P1's previous splat at 0.0s -> consecutive)
  f.G.time = 4.0;
  f.emit('splatted', { victim: v3, attacker: p1 });
  // P1 gets consecutive bonus (+45 fp):
  assert.ok(Math.abs(p1.s3.flow.score - (23 + 45) * scale) < 1e-9);
  // P2 unchanged:
  assert.ok(Math.abs(p2.s3.flow.score - 23 * scale) < 1e-9);
});

test('acceptance: Flow activates exclusively on splats when threshold is reached', async () => {
  const f = await productionFixture();
  const a = f.make();
  const threshold = f.profile.flow.threshold; // 3.0
  const scale = threshold / 100;

  // Preset to 99 fp (just below 100 fp threshold)
  a.s3.flow.score = 99 * scale;
  assert.equal(a.s3.flow.active, false);

  // 1. Turf points crossing threshold must NOT activate Flow:
  f.emit('turf', { actor: a, area: 1000 });
  // Score accumulates past threshold:
  assert.ok(a.s3.flow.score >= threshold);
  // BUT active MUST remain false:
  assert.equal(a.s3.flow.active, false, 'Turf progress must never activate Flow');

  // 2. Damage points crossing threshold must NOT activate Flow:
  const enemy = f.make(); enemy.team = 1;
  f.emit('damage', { victim: enemy, attacker: a, amount: 200, source: 'weapon' });
  assert.equal(a.s3.flow.active, false, 'Damage progress must never activate Flow');

  // 3. Assist points crossing threshold must NOT activate Flow:
  const ally = f.make();
  const enemy2 = f.make(); enemy2.team = 1;
  enemy2.damage(50, a, 'shooter');
  f.emit('splatted', { victim: enemy2, attacker: ally });
  assert.equal(a.s3.flow.active, false, 'Assist progress must never activate Flow');

  // 4. Opponent splat DOES activate Flow:
  const enemy3 = f.make(); enemy3.team = 1;
  f.emit('splatted', { victim: enemy3, attacker: a });
  assert.equal(a.s3.flow.active, true, 'Splat event must activate Flow');
  assert.equal(a.s3.flow.score, 0);
  assert.equal(a.s3.flow.remaining, f.profile.flow.duration);
});

test('acceptance: streak is reset on actor reset, respawn, splat, and flow expiration', async () => {
  const f = await productionFixture();
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3(0, 0, 20)];
  f.G.physics.groundProbe = (_x, _y, _z, _r, _d, _foot, h) => { h.hit = false; return h; };
  const a = f.make(), v1 = f.make(), v2 = f.make(), v3 = f.make();
  v1.team = 1; v2.team = 1; v3.team = 1;
  const scale = f.profile.flow.threshold / 100;

  // Initial splat: starts streak at t = 10.0
  f.G.time = 10.0;
  f.emit('splatted', { victim: v1, attacker: a });
  assert.equal(a.s3.flowLastSplatTime, 10.0);

  // Actor reset clears streak
  a.reset();
  assert.equal(a.s3.flowLastSplatTime, null);

  // Second splat at t = 12.0 (2s later): because reset cleared streak, treated as ordinary (+23 fp)
  f.G.time = 12.0;
  f.emit('splatted', { victim: v2, attacker: a });
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9);
  assert.equal(a.s3.flowLastSplatTime, 12.0);

  // Respawn clears streak while current death-progress owner preserves earned score.
  const beforeRespawnScore = a.s3.flow.score;
  a.respawn();
  assert.equal(a.s3.flow.score, beforeRespawnScore);
  assert.equal(a.s3.flowLastSplatTime, null);

  // Third splat adds ordinary23fp on top of preserved progress.
  f.G.time = 14.0;
  f.emit('splatted', { victim: v3, attacker: a });
  assert.ok(Math.abs(a.s3.flow.score - beforeRespawnScore - 23 * scale) < 1e-9);
  assert.equal(a.s3.flowLastSplatTime, 14.0);

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

test('acceptance: exclusions: team kills, self splats, dead attackers, and attract mode are excluded', async () => {
  const f = await productionFixture();
  const a = f.make(), ally = f.make(), victim = f.make();
  ally.team = 0; victim.team = 1;

  // 1. Self death: attacker === victim
  f.G.time = 11.0;
  f.emit('splatted', { victim: a, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Self death must not award Flow');

  // 2. Team kill: attacker.team === victim.team
  f.G.time = 12.0;
  f.emit('splatted', { victim: ally, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Team kill must not award Flow');

  // 3. Dead attacker: attacker.alive === false
  a.alive = false;
  f.G.time = 13.0;
  f.emit('splatted', { victim, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Dead attacker must not receive Flow award');
  a.alive = true;

  // 4. Attract mode: G.match.attract = true
  f.G.match = { attract: true };
  f.G.time = 14.0;
  f.emit('splatted', { victim, attacker: a });
  assert.equal(a.s3?.flow?.score || 0, 0, 'Attract mode must not award Flow');
  delete f.G.match.attract;
});

test('Point 2 fix: environmental death attribution credits qualifying enemy attacker within 4s, while unattributed water awards nothing', async () => {
  const f = await productionFixture();
  const a = f.make(), enemy = f.make();
  enemy.team = 1;
  const scale = f.profile.flow.threshold / 100;

  // 1. Attacker damages enemy, and enemy falls into water within 4 seconds:
  // Native actor.js line 335: this.splat(this.lastDamage < 4 ? this.lastAttacker : null, 'water');
  enemy.lastAttacker = a;
  enemy.lastDamage = 1.5; // within 4 seconds
  f.G.time = 5.0;

  // Native actor.splat(enemy.lastAttacker, 'water') emits splatted with attacker = a and cause = 'water':
  enemy.splat(enemy.lastAttacker, 'water');

  // Attacker MUST be credited with Flow points for the qualifying environmental kill!
  assert.ok(
    Math.abs(a.s3.flow.score - 23 * scale) < 1e-9,
    `Qualifying attacker for water death must receive Flow splat award (+23 fp, actual: ${a.s3.flow.score / scale} fp)`
  );
  assert.equal(a.s3.flowLastSplatTime, 5.0, 'Qualifying water death starts streak timer');

  // 2. Second splat within 5.0s (e.g. at t = 8.0s) awards consecutive bonus (+45 fp)
  const enemy2 = f.make(); enemy2.team = 1;
  f.G.time = 8.0;
  enemy2.splat(a, 'weapon');
  assert.ok(
    Math.abs(a.s3.flow.score - (23 + 45) * scale) < 1e-9,
    'Subsequent splat within 5s gets consecutive bonus'
  );

  // 3. Unattributed water death: no attacker
  const b = f.make(); b.team = 0;
  const victimSolo = f.make(); victimSolo.team = 1;
  victimSolo.lastAttacker = null;
  victimSolo.lastDamage = 99;
  victimSolo.splat(null, 'water'); // attacker is null
  assert.equal(b.s3?.flow?.score || 0, 0, 'Unattributed water death awards zero Flow');
});

test('Point 1 fix: native NetMatch death/respawn epochs admit two accepted Flow events once each', async () => {
  const f = await productionFixture({ exportNet: true });
  const net = new f.NetMatch({ myId: 'A', isHost: true }, { map: 'reef' });
  const a = f.make(), remoteVictim = f.make();
  remoteVictim.team = 1;
  remoteVictim.remote = true;
  remoteVictim.nid = 2;
  remoteVictim.owner = 'B';
  remoteVictim.net = { buf: [], tp: 0 };
  f.G.fx = { splatted() {} };
  f.G.teamColors ||= [new f.THREE.Color(), new f.THREE.Color()];
  const scale = f.profile.flow.threshold / 100;

  // Initial state: remote victim alive, stats.deaths = 0, netLife = 0
  remoteVictim.stats.deaths = 0;
  remoteVictim.netLife = 0;
  remoteVictim.alive = true;

  // 1. Attacker kills remote victim for the first time
  f.G.time = 10.0;
  net._remoteSplat(remoteVictim, a, 'weapon');
  assert.equal(remoteVictim.stats.deaths, 1);
  // Invoke the accepted Flow event boundary separately; attribution/ACK transport
  // belongs to PR #494, while this test verifies native death/respawn life transitions.
  f.emit('splatted', { victim: remoteVictim, attacker: a, cause: 'weapon' });
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9, 'Initial kill of remote victim earns 23 fp');

  // 2. Duplicate splatted event for the same death/life (same netLife=0, deaths=1)
  f.emit('splatted', { victim: remoteVictim, attacker: a, cause: 'weapon' });
  assert.ok(Math.abs(a.s3.flow.score - 23 * scale) < 1e-9, 'Duplicate splatted event on same life is ignored');

  // The actual native method revives this object without calling Actor.reset/respawn.
  const priorFlow = remoteVictim.s3.flow;
  net._remoteRespawn(remoteVictim);
  assert.equal(remoteVictim.alive, true);
  assert.equal(remoteVictim.net.spawnPending, true);
  assert.equal(remoteVictim.s3.flow, priorFlow, 'native respawn bypasses Flow reset wrapper');

  // 4. Advance clock by 2.0s (within 5s window from t = 10.0s)
  f.G.time = 12.0;

  // 5. Attacker kills remote victim second time (new life: deaths becomes 2)
  net._remoteSplat(remoteVictim, a, 'weapon');
  assert.equal(remoteVictim.stats.deaths, 2);
  // Even before a new rendered packet advances netLife, the native death counter
  // distinguishes the next accepted death on the same remote Actor.
  f.emit('splatted', { victim: remoteVictim, attacker: a, cause: 'weapon' });

  // In the corrected adapter, new life is admitted and consecutive splat bonus (+45 fp) is awarded!
  assert.ok(
    Math.abs(a.s3.flow.score - (23 + 45) * scale) < 1e-9,
    `Remote victim second life kill must be admitted and award consecutive points (actual: ${a.s3.flow.score / scale} fp)`
  );

  // 6. Duplicate event for second life (netLife=1, deaths=2) is ignored
  f.emit('splatted', { victim: remoteVictim, attacker: a, cause: 'weapon' });
  assert.ok(
    Math.abs(a.s3.flow.score - (23 + 45) * scale) < 1e-9,
    'Duplicate event on second life must be ignored'
  );
});

test('acceptance: fixed-step schedules (30Hz, 60Hz, 120Hz) evaluate 5-second window identically', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await productionFixture();
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

    // Check the award independently of the existing natural decay.
    const beforeConsecutive = a.s3.flow.score;
    assert.ok(beforeConsecutive < 23 * scale);
    // Splat at 4.5s (within 5.0s window): consecutive bonus (+45 fp)
    f.emit('splatted', { victim: v2, attacker: a });
    assert.ok(
      Math.abs(a.s3.flow.score - beforeConsecutive - 45 * scale) < 1e-9,
      `${hz}Hz fixed-step failed consecutive bonus at 4.5s`
    );

    // Step forward 5.5 seconds in discrete steps (total elapsed > 5s from second splat)
    const v3 = f.make(); v3.team = 1;
    const steps5_5s = Math.round(5.5 * hz);
    for (let i = 0; i < steps5_5s; i++) {
      f.G.time += dt;
      a.update(dt);
    }

    const beforeOrdinary = a.s3.flow.score;
    // Splat at 5.5s after previous splat: ordinary bonus (+23 fp)
    f.emit('splatted', { victim: v3, attacker: a });
    assert.ok(
      Math.abs(a.s3.flow.score - beforeOrdinary - 23 * scale) < 1e-9,
      `${hz}Hz fixed-step failed ordinary bonus after window expiration`
    );
  }
});

test('composition: live PR #489 adapter and Issue #481 adapter compose cleanly in both orders', () => {
  const flowOriginal = fs.readFileSync(new URL('../runtime/flow.mjs', import.meta.url), 'utf8');

  // Order 1: 489 then 481
  const order1 = adaptIssue481Flow(adaptPR489Flow(flowOriginal));
  assert.ok(order1.includes('deadVictimEpochs = new WeakMap()'), 'Order 1 includes deadVictimEpochs');
  assert.ok(order1.includes('penalizeFlowDeath'), 'Order 1 includes penalizeFlowDeath');
  assert.ok(order1.includes('respawning.get(this)'), 'Order 1 includes respawning state persistence');
  assert.ok(order1.includes('isConsecutive = false'), 'Order 1 includes consecutive award signature');

  // Order 2: 481 then 489
  const order2 = adaptPR489Flow(adaptIssue481Flow(flowOriginal));
  assert.ok(order2.includes('deadVictimEpochs = new WeakMap()'), 'Order 2 includes deadVictimEpochs');
  assert.ok(order2.includes('penalizeFlowDeath'), 'Order 2 includes penalizeFlowDeath');
  assert.ok(order2.includes('respawning.get(this)'), 'Order 2 includes respawning state persistence');
  assert.ok(order2.includes('isConsecutive = false'), 'Order 2 includes consecutive award signature');
});

test('composition: native positive proof of Flow death persistence, decay, and 481 consecutive awards combined', async () => {
  const f = await fixture({
    adaptRuntime: (rel, code) => {
      if (rel.endsWith('runtime/flow.mjs')) {
        return adaptIssue481Flow(adaptPR489Flow(code));
      }
      return code;
    },
  });

  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3(0, 0, 20)];
  f.G.physics.groundProbe = (_x, _y, _z, _r, _d, _foot, h) => { h.hit = false; return h; };
  f.profile.flow.progress = { ...pr489FlowProgress };
  const attacker = f.make(), victim = f.make(), victim2 = f.make();
  victim.team = 1; victim2.team = 1;
  const threshold = f.profile.flow.threshold; // 3.0
  const scale = threshold / 100; // 0.03

  // 1. Attacker scores first splat: +23 fp (0.69)
  f.G.time = 0;
  f.emit('splatted', { victim, attacker });
  assert.ok(Math.abs(attacker.s3.flow.score - 23 * scale) < 1e-9);
  assert.equal(attacker.s3.flow.idleTime, 0);

  // 2. PR 489 idle decay: advance 2.0s (slow decay rate: 0.2 fp/s)
  // Loss = 2.0 * 0.2 = 0.4 fp -> remaining = 23 - 0.4 = 22.6 fp
  f.G.time += 2.0;
  attacker.update(2.0);
  assert.ok(Math.abs(attacker.s3.flow.score - 22.6 * scale) < 1e-9);
  assert.ok(Math.abs(attacker.s3.flow.idleTime - 2.0) < 1e-9);

  // 3. Attacker scores consecutive splat at t = 2.0s (within 5.0s window): +45 fp!
  // Score becomes 22.6 + 45 = 67.6 fp
  f.emit('splatted', { victim: victim2, attacker });
  assert.ok(Math.abs(attacker.s3.flow.score - 67.6 * scale) < 1e-9);
  assert.equal(attacker.s3.flow.idleTime, 0); // idleTime reset on positive gain

  // 4. PR 489 death penalty: victim with accumulated Flow dies
  victim.alive = true;
  victim.s3.flow = { active: false, remaining: 0, score: 50 * scale, idleTime: 0 };
  victim.splat(attacker, 'weapon');
  // Under unpatched main, victim score would be reset to 0.
  // Under PR 489 penalizeFlowDeath, victim loses only 5 fp (50 - 5 = 45 fp):
  assert.ok(Math.abs(victim.s3.flow.score - 45 * scale) < 1e-9, 'PR489 penalizeFlowDeath preserves score minus penalty');

  // 5. PR 489 respawn state persistence:
  victim.respawn();
  assert.ok(Math.abs(victim.s3.flow.score - 45 * scale) < 1e-9, 'PR489 respawn preserves Flow progress across death');

  // 6. Active Flow remains active across death per PR #489:
  victim.s3.flow = { active: true, remaining: 20, score: 0, idleTime: 0 };
  victim.splat(attacker, 'weapon');
  assert.equal(victim.s3.flow.active, true, 'Active Flow remains active while dead');
  victim.respawn();
  assert.equal(victim.s3.flow.active, true, 'Active Flow remains active after respawn');
});
