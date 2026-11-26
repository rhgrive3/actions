import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLLER_ARCHETYPES,
  resolveRollerArchetype,
  applyRollerTurfPaint,
  applyRollerCombat,
} from '../runtime/bot-ai-roller.mjs';

function makeActor(overrides = {}) {
  return {
    id: 1,
    team: 0,
    hp: 100,
    pos: { x: 0, y: 0, z: 0 },
    grounded: true,
    groundTeam: 1,
    weapon: Object.freeze({ id: 'roller', sourceMainActor: 'WeaponRollerNormal', range: 7.2 }),
    weaponRunner: {
      flick: -1,
      rolling: false,
      cooldown: 0,
      catalogState: null,
      s3RollStop: null,
      s3FlickPostSquid: 0,
    },
    intent: { fire: false, squid: false, jump: false, sub: false, special: false },
    _prevIntent: { fire: false, squid: false, jump: false, sub: false, special: false },
    ...overrides,
  };
}

function makeMove(x = 0, z = 1) {
  return {
    x,
    y: 0,
    z,
    set(nx, ny, nz) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
    },
  };
}

test('resolveRollerArchetype identifies all 5 Splatoon 3 roller archetypes and preserves Carbon rollHold = 0.15', () => {
  assert.equal(resolveRollerArchetype({ sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-carbon' }).id, 'compact');
  assert.equal(ROLLER_ARCHETYPES.compact.rollHold, 0.15);
  assert.equal(resolveRollerArchetype({ sourceMainActor: 'WeaponRollerHeavy', id: 's3-roller-dynamo' }).id, 'heavy');
  assert.equal(resolveRollerArchetype({ sourceMainActor: 'WeaponRollerHunter', id: 's3-roller-flingza' }).id, 'hunter');
  assert.equal(resolveRollerArchetype({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }).id, 'wide');
  assert.equal(resolveRollerArchetype({ sourceMainActor: 'WeaponRollerNormal', id: 'roller' }).id, 'normal');
});

test('applyRollerTurfPaint preserves WeaponRollerCompact rollHold = 0.15 and Big Swig sustained roll contracts', () => {
  const G = { match: { mode: 'turf', time: 100 }, time: 10 };
  const move = makeMove(0, 1);

  // 1. Carbon Roller (rollHold = 0.15s)
  const carbonActor = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-carbon' }),
    weaponRunner: { flick: -1, rolling: true, cooldown: 0 },
    intent: { fire: true, squid: false, jump: false },
    groundTeam: 1,
  });
  const carbonBrain = { _turfPaintLatch: true, _rollerRollTime: 0.14 };
  applyRollerTurfPaint(carbonBrain, G, carbonActor, 0.02, move, true, 0, 0.8);
  assert.equal(carbonBrain._rollerRollTime, 0);
  assert.equal(carbonBrain._rollerSwimGap, 0.22);
  assert.equal(carbonActor.intent.fire, false);
  assert.equal(carbonActor.intent.squid, true);

  // 2. Big Swig Roller (rollHold = 1.15s) continues rolling past 0.25s on unpainted turf
  const bigSwigActor = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }),
    weaponRunner: { flick: -1, rolling: true, cooldown: 0 },
    intent: { fire: true, squid: false, jump: false },
    groundTeam: 1,
  });
  const bigSwigBrain = { _turfPaintLatch: true, _rollerRollTime: 0.20 };
  applyRollerTurfPaint(bigSwigBrain, G, bigSwigActor, 0.05, move, true, 0, 0.8);
  assert.ok(Math.abs(bigSwigBrain._rollerRollTime - 0.25) < 1e-6);
  assert.equal(bigSwigActor.intent.fire, true);
  assert.equal(bigSwigActor.intent.squid, false);
});

test('applyRollerTurfPaint keeps fire held through post-flick roll transition instead of aborting into squid', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);
  const actor = makeActor({
    weaponRunner: { flick: -1, rolling: false, cooldown: 0.18 },
    groundTeam: 1,
  });
  const brain = { _turfPaintLatch: true, _rollerRollTime: 0, _rollerSwimGap: 0 };

  applyRollerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.75);
  assert.equal(actor.intent.fire, true, 'must keep fire held so roller enters rolling after flick');
  assert.equal(actor.intent.squid, false, 'must not abort into squid during flick-to-roll transition');
});

test('applyRollerTurfPaint ends Big Swig roll early when ahead turf is already >=80% own ink', () => {
  const G = { match: { mode: 'turf', time: 80 }, time: 30 };
  const move = makeMove(0, 1);
  const actor = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }),
    weaponRunner: { flick: -1, rolling: true, cooldown: 0 },
    groundTeam: 1,
  });
  const brain = {
    _turfPaintLatch: true,
    _rollerRollTime: 0.24,
    _turfMultiCache: { multiActive: true, effOwn: 0.84, effEnemy: 0.01, flankBias: 0 },
  };

  applyRollerTurfPaint(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(brain._rollerRollTime, 0);
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, true);
});

test('applyRollerTurfPaint uses jump-vertical flick cadence for Flingza Roller', () => {
  const G = { match: { mode: 'turf', time: 80 }, time: 15 };
  const move = makeMove(0, 1);
  const actor = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerHunter', id: 's3-roller-flingza' }),
    grounded: true,
    groundTeam: 1,
  });
  const brain = { _turfPaintLatch: true };

  // Frame 1: grounded -> jump first (B before ZR)
  applyRollerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(actor.intent.jump, true);
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, false);

  // Frame 2: airborne -> press fire to trigger vertical flick
  actor.grounded = false;
  applyRollerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, true);
  assert.equal(actor.intent.squid, false);
});

test('applyRollerTurfPaint enforces Dynamo ink discipline and respects s3RollStop main lock', () => {
  const G = { match: { mode: 'turf', time: 80 }, time: 10.0 };
  const move = makeMove(0, 1);

  // Dynamo low ink (< 22%): swim to recover instead of firing a weak depleted swing
  const dynamo = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerHeavy', id: 's3-roller-dynamo' }),
    groundTeam: 1,
  });
  const dBrain = { _turfPaintLatch: true };
  applyRollerTurfPaint(dBrain, G, dynamo, 1 / 60, move, true, 0, 0.16);
  assert.equal(dynamo.intent.fire, false);
  assert.equal(dynamo.intent.squid, true);

  // Post-roll-stop 16F lock active: do not spam fire while locked
  const lockedRoller = makeActor({
    weaponRunner: { flick: -1, rolling: false, cooldown: 0, s3RollStop: { main: 10.25, squid: 10.05 } },
    groundTeam: 1,
  });
  const lBrain = { _turfPaintLatch: true };
  applyRollerTurfPaint(lBrain, G, lockedRoller, 1 / 60, move, true, 0, 0.8);
  assert.equal(lockedRoller.intent.fire, false);
});

test('applyRollerCombat fixes Round 1 emergeDelay + squid chattering deadlock at 5.5m-7.4m', () => {
  const G = { time: 20 };
  const move = makeMove(0, 1);
  const actor = makeActor({ groundTeam: 1 });
  const brain = { react: 0, strafeS: 0.6 };

  const ctx = {
    family: 'roller',
    dist: 6.5,
    range: 6.0,
    dx: 0,
    dz: 6.5,
    enemyVisible: true,
    aimed: true,
    off: 0.06,
    inkFrac: 0.8,
    idealYaw: 0,
    idealPitch: 0,
    wantYaw: 0.04,
    wantPitch: -0.02,
  };

  // Simulate 5 frames of squid -> kid emergeDelay where weaponRunner has not started flick yet
  // and actor._prevIntent.fire becomes true after frame 1.
  for (let frame = 0; frame < 5; frame++) {
    applyRollerCombat(brain, G, actor, 1 / 60, move, ctx);
    assert.equal(actor.intent.fire, true, `frame ${frame}: must keep fire committed through emergeDelay`);
    assert.equal(actor.intent.squid, false, `frame ${frame}: must never drop back into squid while committing flick`);
    actor._prevIntent.fire = actor.intent.fire;
    actor._prevIntent.squid = actor.intent.squid;
  }

  // Once native weaponRunner enters flick windup (wr.flick >= 0), keep squid false and release fire to avoid unwanted rolling
  actor.weaponRunner.flick = 0.02;
  applyRollerCombat(brain, G, actor, 1 / 60, move, ctx);
  assert.equal(actor.intent.squid, false, 'must never interrupt native flick windup with squid');
  assert.equal(actor.intent.fire, false, 'release fire during windup so flick does not drop into slow rolling at 6.5m');
});

test('applyRollerCombat selects horizontal 1-shot up close and jump-vertical flick at mid-range / elevation', () => {
  const G = { time: 25 };
  const move = makeMove(0, 1);

  // 1. Splat Roller at 5.0m -> horizontal flick (no jump)
  const splatNear = makeActor();
  const nearBrain = { react: 0, strafeS: 0.5 };
  applyRollerCombat(nearBrain, G, splatNear, 1 / 60, move, {
    dist: 5.0, dx: 0, dz: 5.0, dy: 0, enemyVisible: true, aimed: true, off: 0.08, inkFrac: 0.8, wantYaw: 0.05, wantPitch: 0,
  });
  assert.equal(splatNear.intent.fire, true);
  assert.equal(splatNear.intent.jump, false);

  // 2. Splat Roller at 10.0m -> jump-vertical flick (frame 1 jump, frame 2 air fire)
  const splatMid = makeActor({ grounded: true });
  const midBrain = { react: 0, strafeS: 0.5 };
  const aim1 = applyRollerCombat(midBrain, G, splatMid, 1 / 60, move, {
    dist: 10.0, dx: 0, dz: 10.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8, wantYaw: 0.09, wantPitch: 0.02,
  });
  assert.equal(splatMid.intent.jump, true);
  assert.equal(splatMid.intent.fire, false);
  // Must preserve aimError in wantYaw (no aimError zeroing cheat!)
  assert.equal(aim1.wantYaw, 0.09);

  splatMid.grounded = false;
  applyRollerCombat(midBrain, G, splatMid, 1 / 60, move, {
    dist: 10.0, dx: 0, dz: 10.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8, wantYaw: 0.09, wantPitch: 0.02,
  });
  assert.equal(splatMid.intent.fire, true);
  assert.equal(splatMid.intent.squid, false);

  // 3. Elevated target (+1.4m high at 5.5m) -> jump-vertical flick
  const elevActor = makeActor({ grounded: true });
  const elevBrain = { react: 0, strafeS: 0.5 };
  applyRollerCombat(elevBrain, G, elevActor, 1 / 60, move, {
    dist: 5.5, dx: 0, dz: 5.5, dy: 1.4, enemyVisible: true, aimed: true, off: 0.06, inkFrac: 0.8, wantYaw: 0, wantPitch: 0.2,
  });
  assert.equal(elevActor.intent.jump, true, 'elevated enemy should trigger jump-vertical flick');

  // 4. Big Swig Roller at 6.0m -> prefers vertical flick (only 1-shot option)
  const wideActor = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }),
    grounded: true,
  });
  const wideBrain = { react: 0, strafeS: 0.5 };
  applyRollerCombat(wideBrain, G, wideActor, 1 / 60, move, {
    dist: 6.0, dx: 0, dz: 6.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(wideActor.intent.jump, true, 'Big Swig should initiate vertical flick at 6m');
});

test('applyRollerCombat handles point-blank crush only on 1-shot rollers and lifts drum at range', () => {
  const G = { time: 30 };
  const move = makeMove(0, 1);

  // Splat Roller already rolling at 2.0m -> keep crushing (125-140 dmg 1-shot)
  const splat = makeActor({ weaponRunner: { flick: -1, rolling: true, cooldown: 0 } });
  applyRollerCombat({ react: 0 }, G, splat, 1 / 60, move, {
    dist: 2.0, dx: 0, dz: 2.0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.6,
  });
  assert.equal(splat.intent.fire, true);

  // Carbon Roller rolling at 2.2m -> cannot 1-shot crush (70 dmg), lifts drum
  const carbon = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-carbon' }),
    weaponRunner: { flick: -1, rolling: true, cooldown: 0 },
  });
  applyRollerCombat({ react: 0 }, G, carbon, 1 / 60, move, {
    dist: 2.2, dx: 0, dz: 2.2, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.6,
  });
  assert.equal(carbon.intent.fire, false);

  // Splat Roller rolling at 6.0m -> lifts drum instead of feeding while slowly rolling
  const splatFar = makeActor({ weaponRunner: { flick: -1, rolling: true, cooldown: 0 } });
  applyRollerCombat({ react: 0 }, G, splatFar, 1 / 60, move, {
    dist: 6.0, dx: 0, dz: 6.0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.6,
  });
  assert.equal(splatFar.intent.fire, false);
});

test('applyRollerCombat performs corner pre-flick on recent LOS break (no wall-hack) and disengages at low HP', () => {
  const G = { time: 40 };
  const move = makeMove(0, 1);

  // Recent LOS break (lostTimer = 0.35s) within horizontal flick range -> pre-flick at lastSeenPos
  const cornerActor = makeActor();
  const cornerBrain = { react: 0, target: { pos: { x: 0, y: 0, z: 6 } }, lostTimer: 0.35 };
  applyRollerCombat(cornerBrain, G, cornerActor, 1 / 60, move, {
    dist: 6.0, dx: 0, dz: 6.0, enemyVisible: false, aimed: false, off: 0.12, inkFrac: 0.7,
  });
  assert.equal(cornerActor.intent.fire, true);

  // Stale LOS break (lostTimer = 1.5s) -> do not fire blindly through walls
  const staleActor = makeActor();
  const staleBrain = { react: 0, target: { pos: { x: 0, y: 0, z: 6 } }, lostTimer: 1.5 };
  applyRollerCombat(staleBrain, G, staleActor, 1 / 60, move, {
    dist: 6.0, dx: 0, dz: 6.0, enemyVisible: false, aimed: false, off: 0.12, inkFrac: 0.7,
  });
  assert.equal(staleActor.intent.fire, false);

  // Low HP (25 HP) spotted outside 1-shot range on own ink -> diagonal disengage + squid swim
  const lowHpActor = makeActor({ hp: 25, groundTeam: 1 });
  const lowHpMove = makeMove(0, 1);
  applyRollerCombat({ react: 0, strafeS: 0.8 }, G, lowHpActor, 1 / 60, lowHpMove, {
    dist: 8.5, dx: 0, dz: 8.5, enemyVisible: true, aimed: false, off: 0.4, inkFrac: 0.7,
  });
  assert.ok(lowHpMove.z < 0, 'low-HP roller outside lethal range should disengage away from threat');
  assert.equal(lowHpActor.intent.squid, true);
});

test('Carbon Roller (s3-roller-compact) performs stealth squid sharking and agile jump-vertical flicks', () => {
  const G = { time: 50 };
  const move = makeMove(0, 1);

  // Far vertical fringe (9.5m) on own ink without tight aim -> stays submerged and approaches at a deep flank angle
  const sharkActor = makeActor({
    id: 7,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-compact' }),
    groundTeam: 1,
    grounded: true,
  });
  const sharkBrain = { react: 0, strafeS: 0.7 };
  applyRollerCombat(sharkBrain, G, sharkActor, 1 / 60, move, {
    dist: 9.5, dx: 0, dz: 9.5, dy: 0, enemyVisible: true, aimed: false, off: 0.16, inkFrac: 0.85, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(sharkActor.intent.fire, false, 'Carbon should shark silently instead of exposing at far fringe');
  assert.equal(sharkActor.intent.squid, true, 'Carbon should swim in own ink while closing distance');
  assert.ok(Math.abs(move.x) > 0.45, 'Carbon should take an angled flank approach');

  // Mid-close range (6.5m) -> agile jump-vertical flick
  const vertActor = makeActor({
    id: 7,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-compact' }),
    groundTeam: 1,
    grounded: true,
  });
  const vertBrain = { react: 0, strafeS: 0.7 };
  applyRollerCombat(vertBrain, G, vertActor, 1 / 60, move, {
    dist: 6.5, dx: 0, dz: 6.5, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.85, wantYaw: 0.03, wantPitch: 0,
  });
  assert.equal(vertActor.intent.jump, true, 'Carbon should trigger agile jump-vertical flick at 6.5m');
  assert.equal(vertActor.intent.fire, false);
});

test('Dynamo Roller (s3-roller-heavy) enforces ink recovery hysteresis and heavyweight spacing', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);

  // Paint ink hysteresis: drops below 22% -> keeps recovering at 30% -> resumes firing at 40%
  const dynamo = makeActor({
    id: 3,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerHeavy', id: 's3-roller-heavy' }),
    groundTeam: 1,
  });
  const brain = { _turfPaintLatch: true };
  applyRollerTurfPaint(brain, G, dynamo, 1 / 60, move, true, 0, 0.18);
  assert.equal(dynamo.intent.fire, false);
  assert.equal(dynamo.intent.squid, true);

  applyRollerTurfPaint(brain, G, dynamo, 1 / 60, move, true, 0, 0.30);
  assert.equal(dynamo.intent.fire, false, 'Dynamo should wait until inkRecoverFloor before swinging again');
  assert.equal(dynamo.intent.squid, true);

  applyRollerTurfPaint(brain, G, dynamo, 1 / 60, move, true, 0, 0.42);
  assert.equal(dynamo.intent.fire, true, 'Dynamo resumes heavy horizontal flick once ink recovers');
  assert.equal(dynamo.intent.squid, false);

  // Combat spacing: when rushed inside keepDistMin (5.0m) during cooldown, backsteps diagonally
  const combatDynamo = makeActor({
    id: 3,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerHeavy', id: 's3-roller-heavy' }),
    weaponRunner: { flick: -1, rolling: false, cooldown: 0.35 },
    groundTeam: 1,
  });
  const cMove = makeMove(0, 1);
  applyRollerCombat({ react: 0, strafeS: 0.6 }, G, combatDynamo, 1 / 60, cMove, {
    dist: 5.0, dx: 0, dz: 5.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.65,
  });
  assert.ok(cMove.z < 0, 'Dynamo should backstep out of point-blank range during swing cooldown');
  assert.equal(combatDynamo.intent.squid, true, 'Dynamo recovers ink in own turf during long cooldown');
});

test('Flingza Roller (s3-roller-hunter) uses 8%-ink close horizontal defense and 12%-ink mid-range vertical flick', () => {
  const G = { time: 35 };
  const move = makeMove(0, 1);

  // Close range (5.5m) with 10% ink: below 12% vertical cost, but above 8% horizontal cost -> fires horizontal flick
  const closeFlingza = makeActor({
    id: 5,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerHunter', id: 's3-roller-hunter' }),
    grounded: true,
    groundTeam: 1,
  });
  applyRollerCombat({ react: 0 }, G, closeFlingza, 1 / 60, move, {
    dist: 5.5, dx: 0, dz: 5.5, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.10,
  });
  assert.equal(closeFlingza.intent.fire, true, 'Flingza should fire close 8%-ink horizontal flick at 10% ink');
  assert.equal(closeFlingza.intent.jump, false);

  // Mid range (10.5m) with 60% ink -> jump-vertical flick
  const midFlingza = makeActor({
    id: 5,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerHunter', id: 's3-roller-hunter' }),
    grounded: true,
    groundTeam: 1,
  });
  applyRollerCombat({ react: 0 }, G, midFlingza, 1 / 60, move, {
    dist: 10.5, dx: 0, dz: 10.5, dy: 0, enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.60,
  });
  assert.equal(midFlingza.intent.jump, true, 'Flingza should switch to jump-vertical flick at mid range');
});

test('Big Swig Roller (s3-roller-wide) weaves organically while wide-rolling and prioritizes vertical combat down to 3.2m', () => {
  const G = { match: { mode: 'turf', time: 95 }, time: 18 };

  // Organic wide-roll weave past 0.28s
  const rollActor = makeActor({
    id: 9,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }),
    weaponRunner: { flick: -1, rolling: true, cooldown: 0 },
    groundTeam: 1,
  });
  const rollBrain = { _turfPaintLatch: true, _rollerRollTime: 0.45 };
  const rollMove = makeMove(0, 1);
  applyRollerTurfPaint(rollBrain, G, rollActor, 1 / 60, rollMove, true, 0, 0.85);
  assert.equal(rollActor.intent.fire, true);
  assert.ok(Math.abs(rollMove.x) > 0.01, 'Big Swig wide-roll should apply a gentle organic weave');
  assert.ok(rollMove.z > 0.9, 'Big Swig weave should keep strong forward progress');

  // Combat at 4.0m -> jump-vertical flick (only 1-shot); at 2.6m -> emergency close horizontal sweep
  const wideVert = makeActor({
    id: 9,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }),
    grounded: true,
  });
  applyRollerCombat({ react: 0 }, G, wideVert, 1 / 60, makeMove(0, 1), {
    dist: 4.0, dx: 0, dz: 4.0, dy: 0, enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8,
  });
  assert.equal(wideVert.intent.jump, true, 'Big Swig should prioritize vertical flick at 4.0m');

  const widePointBlank = makeActor({
    id: 9,
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' }),
    grounded: true,
  });
  applyRollerCombat({ react: 0 }, G, widePointBlank, 1 / 60, makeMove(0, 1), {
    dist: 2.6, dx: 0, dz: 2.6, dy: 0, enemyVisible: true, aimed: true, off: 0.08, inkFrac: 0.8,
  });
  assert.equal(widePointBlank.intent.fire, true, 'Big Swig falls back to close horizontal sweep at 2.6m');
  assert.equal(widePointBlank.intent.jump, false);
});

test('Human-like phase cadence varies across cycles, protects catalogState.pending, and reuses zero-allocation aimOut', () => {
  const G = { match: { mode: 'turf', time: 80 }, time: 12 };
  const move = makeMove(0, 1);

  // 1. catalogState.pending strictly forces fire=false
  const pendingActor = makeActor({
    weaponRunner: { flick: -1, rolling: false, cooldown: 0, catalogState: { pending: true } },
    intent: { fire: true, squid: false, jump: false },
  });
  applyRollerTurfPaint({ _turfPaintLatch: true }, G, pendingActor, 1 / 60, move, true, 0, 0.8);
  assert.equal(pendingActor.intent.fire, false, 'catalogState.pending must strictly suppress fire');

  // 2. Swim gap adapts organically across subsequent roll cycles & ink levels
  const normalActor = makeActor({
    id: 4,
    weaponRunner: { flick: -1, rolling: true, cooldown: 0 },
    groundTeam: 1,
  });
  const pBrain = { _turfPaintLatch: true, _rollerRollTime: 0.50 };
  applyRollerTurfPaint(pBrain, G, normalActor, 0.02, move, true, 0, 0.85);
  const gapCycle0 = pBrain._rollerSwimGap;
  assert.equal(gapCycle0, 0.22, 'initial cycle preserves baseline swimGapOwn');

  // Cycle 2 at low ink (0.28) -> naturally extends recovery gap
  pBrain._rollerSwimGap = 0;
  pBrain._rollerRollTime = 0.60;
  applyRollerTurfPaint(pBrain, G, normalActor, 0.02, move, true, 0, 0.28);
  const gapLowInk = pBrain._rollerSwimGap;
  assert.ok(gapLowInk > gapCycle0, 'low-ink cycle should naturally extend squid recovery duration');

  // 3. Zero-allocation aimOut object reuse in paint & combat
  const paintAimActor = makeActor({ id: 11, groundTeam: 1 });
  const paintAimBrain = { _turfPaintLatch: true };
  const aimA = applyRollerTurfPaint(paintAimBrain, G, paintAimActor, 1 / 60, move, true, 0, 0.85);
  paintAimActor._prevIntent.fire = false;
  const aimB = applyRollerTurfPaint(paintAimBrain, G, paintAimActor, 1 / 60, move, true, 0, 0.85);
  assert.ok(aimA && aimB);
  assert.strictEqual(aimA, aimB, 'applyRollerTurfPaint must reuse aimOut object (zero allocation)');

  const combatAimActor = makeActor({ id: 11, grounded: true, groundTeam: 1 });
  const combatAimBrain = { react: 0 };
  const cAim1 = applyRollerCombat(combatAimBrain, G, combatAimActor, 1 / 60, move, {
    dist: 10.0, dx: 0, dz: 10.0, dy: 0, enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8, wantYaw: 0.07, wantPitch: 0,
  });
  combatAimActor.grounded = false;
  const cAim2 = applyRollerCombat(combatAimBrain, G, combatAimActor, 1 / 60, move, {
    dist: 10.0, dx: 0, dz: 10.0, dy: 0, enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8, wantYaw: 0.07, wantPitch: 0,
  });
  assert.ok(cAim1 && cAim2);
  assert.strictEqual(cAim1, cAim2, 'applyRollerCombat must reuse aimOut object (zero allocation)');
  assert.equal(cAim2.wantYaw, 0.07, 'aimError in wantYaw must remain untouched');
});

test('resolveRollerArchetype supports catalogRecord.sourceActor and non-string/mixed-case weapon ids', () => {
  assert.equal(resolveRollerArchetype({ catalogRecord: { sourceActor: 'WeaponRollerHeavy' } }).id, 'heavy');
  assert.equal(resolveRollerArchetype({ catalogRecord: { sourceActor: 'WeaponRollerWide' } }).id, 'wide');
  assert.equal(resolveRollerArchetype({ id: 'S3_ROLLER_FLINGZA_01' }).id, 'hunter');
  assert.equal(resolveRollerArchetype({ id: 42 }).id, 'normal');
});

test('applyRollerTurfPaint and applyRollerCombat respect superJumpState, specialActive, it.special, it.sub, and climbing', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);
  const combatCtx = {
    dist: 5.0, dx: 0, dz: 5.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.85, wantYaw: 0.1, wantPitch: 0,
  };

  // 1. superJumpState: clears fire/jump/squid and resets roll timer
  const sjActor = makeActor({ superJumpState: { phase: 'flight' }, intent: { fire: true, squid: true, jump: true, sub: false, special: false } });
  const sjBrain = { _turfPaintLatch: true, _rollerRollTime: 0.3 };
  applyRollerTurfPaint(sjBrain, G, sjActor, 1 / 60, move, true, 0, 0.8);
  assert.equal(sjActor.intent.fire, false);
  assert.equal(sjActor.intent.jump, false);
  assert.equal(sjActor.intent.squid, false);
  assert.equal(sjBrain._rollerRollTime, 0);

  // 2. specialActive: does not overwrite special intent in paint or combat
  const spActor = makeActor({ specialActive: { id: 'kraken' }, intent: { fire: true, squid: true, jump: false, sub: false, special: false } });
  const spBrain = { react: 0, _turfPaintLatch: true };
  assert.equal(applyRollerCombat(spBrain, G, spActor, 1 / 60, move, combatCtx), null);
  assert.equal(spActor.intent.fire, true, 'specialActive intent must not be clobbered');
  assert.equal(spActor.intent.squid, true, 'specialActive squid intent must not be clobbered');

  // 3. it.sub (e.g. botCoverBomb) & it.special: suppresses main fire/jump/squid and preserves aim
  const subActor = makeActor({ intent: { fire: false, squid: false, jump: false, sub: true, special: false } });
  assert.equal(applyRollerCombat({ react: 0 }, G, subActor, 1 / 60, move, combatCtx), null);
  assert.equal(subActor.intent.fire, false);
  assert.equal(subActor.intent.jump, false);
  assert.equal(subActor.intent.squid, false);
  assert.equal(subActor.intent.sub, true);

  const trigSpActor = makeActor({ intent: { fire: false, squid: false, jump: false, sub: false, special: true } });
  assert.equal(applyRollerTurfPaint({ _turfPaintLatch: true }, G, trigSpActor, 1 / 60, move, true, 0, 0.8), null);
  assert.equal(trigSpActor.intent.fire, false);
  assert.equal(trigSpActor.intent.special, true);

  // 4. climbing: never fires or drops squid off wall
  const climbActor = makeActor({ climbing: true, intent: { fire: false, squid: true, jump: false, sub: false, special: false } });
  assert.equal(applyRollerTurfPaint({ _turfPaintLatch: true }, G, climbActor, 1 / 60, move, true, 0, 0.8), null);
  assert.equal(climbActor.intent.fire, false);
  assert.equal(climbActor.intent.squid, true, 'must preserve squid while climbing wall');
  assert.equal(applyRollerCombat({ react: 0 }, G, climbActor, 1 / 60, move, combatCtx), null);
  assert.equal(climbActor.intent.fire, false);
  assert.equal(climbActor.intent.squid, true);
});

test('applyRollerTurfPaint clears stale _rollerRollTime when rolling is interrupted externally', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);
  const actor = makeActor({
    weapon: Object.freeze({ sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-carbon' }),
    weaponRunner: { flick: -1, rolling: false, cooldown: 0 },
    groundTeam: 1,
  });
  const brain = { _turfPaintLatch: true, _rollerRollTime: 0.40, _rollerSwimGap: 0 };
  applyRollerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(brain._rollerRollTime, 0, 'stale _rollerRollTime must reset when not rolling');
  assert.equal(brain._rollerSwimGap, 0, 'interrupted non-rolling state must not trigger spurious swimGap');
  assert.equal(actor.intent.fire, true, 'roller resumes painting cleanly');
});

test('applyRollerCombat avoids vertical-flick jump/pitch desync when grounded and aborts on rollStop lock', () => {
  const G = { time: 25 };
  const move = makeMove(0, 1);
  const actor = makeActor({ grounded: true, groundTeam: 1 });
  const brain = { react: 0, strafeS: 0.5 };
  const ctx = {
    dist: 10.0, dx: 0, dz: 10.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8, wantYaw: 0.05, wantPitch: 0.02,
  };

  // Frame 1: initiate jump_vert
  applyRollerCombat(brain, G, actor, 1 / 30, move, ctx);
  assert.equal(actor.intent.jump, true);
  assert.equal(actor.intent.fire, false);

  // Frame 2 (30 FPS = 0.033s, still grounded): must keep jumping rather than firing grounded horizontal flick at 0.03s!
  applyRollerCombat(brain, G, actor, 1 / 30, move, ctx);
  assert.equal(actor.intent.jump, true, 'must allow jump to lift off at 30 FPS before timing out');
  assert.equal(actor.intent.fire, false);

  // Frame 3 & 4 (total >= 0.08s, still blocked grounded under ceiling): aborts cleanly without firing grounded vertical bias
  applyRollerCombat(brain, G, actor, 0.06, move, ctx);
  assert.equal(actor.intent.fire, false, 'aborts vertical flick instead of firing grounded horizontal whiff at 10m');
  assert.equal(actor.intent.jump, false);
  assert.equal(brain._rollerCombatState.phase, 'idle');
  assert.equal(brain._rollerCombatState.wantVertical, false);

  // Roll-stop lock aborts ongoing commit_flick cleanly
  brain._rollerCombatState.phase = 'commit_flick';
  brain._rollerCombatState.timer = 0.02;
  actor.weaponRunner.s3RollStop = { main: 25.25, squid: 25.05 };
  applyRollerCombat(brain, G, actor, 1 / 60, move, ctx);
  assert.equal(brain._rollerCombatState.phase, 'idle');
  assert.equal(actor.intent.fire, false);
});

test('roller per-bot state resets cleanly on death (!actor.alive) and across netLife respawns', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);
  const actor = makeActor({ alive: true, netLife: 1, grounded: true, groundTeam: 1 });
  const brain = { react: 0, _turfPaintLatch: true, _rollerRollTime: 0.35, _rollerSwimGap: 0.18 };

  // Enter jump_vert in life 1
  applyRollerCombat(brain, G, actor, 1 / 60, move, {
    dist: 10.0, dx: 0, dz: 10.0, dy: 0, enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(brain._rollerCombatState.phase, 'jump_vert');

  // Respawn with netLife = 2 (without brain.reset())
  actor.netLife = 2;
  brain._rollerRollTime = 0.35;
  brain._rollerSwimGap = 0.18;
  applyRollerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.9);
  assert.equal(brain._rollerCombatState.phase, 'idle', 'stale combat phase must reset on respawn');
  assert.equal(brain._rollerSwimGap, 0, 'stale swim gap must reset on respawn');
  assert.equal(actor.intent.fire, true, 'respawned roller paints immediately without stale recovery stalls');

  // Dead actor (!actor.alive) resets state and suppresses inputs
  actor.alive = false;
  actor.intent.fire = true;
  applyRollerCombat(brain, G, actor, 1 / 60, move, {
    dist: 4.0, dx: 0, dz: 4.0, enemyVisible: true, aimed: true, off: 0, inkFrac: 1,
  });
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.jump, false);
});

test('applyRollerTurfPaint and applyRollerCombat guard against NaN/undefined inputs without poisoning move or aimOut', () => {
  const G = { match: { mode: 'turf', time: NaN }, time: 10 };
  const move = makeMove(0, 1);
  const actor = makeActor({ hp: NaN, groundTeam: 1 });

  assert.equal(applyRollerTurfPaint(null, G, actor, NaN, move, true, NaN, NaN), null);
  assert.equal(applyRollerCombat(null, G, actor, NaN, move, {}), null);

  const brain = { react: NaN, strafeS: NaN, aimYaw: NaN, aimPitch: NaN, _turfPaintLatch: true };
  applyRollerTurfPaint(brain, G, actor, NaN, move, true, NaN, NaN, { profile: { rollHold: NaN }, cache: { flankBias: NaN } });
  assert.equal(actor.intent.fire, false, 'NaN inkFrac in turf paint must not fire');
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z));

  const aim = applyRollerCombat(brain, G, actor, NaN, move, {
    dist: NaN, dx: NaN, dz: NaN, dy: NaN, enemyVisible: true, aimed: true, off: NaN, inkFrac: NaN, wantYaw: NaN, wantPitch: NaN,
  });
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'move must stay finite under NaN combat inputs');
  if (aim) {
    assert.ok(Number.isFinite(aim.wantYaw) && Number.isFinite(aim.wantPitch), 'aimOut must stay finite');
  }
});
