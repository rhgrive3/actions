import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_ARCHETYPES,
  resolveBrushArchetype,
  applyBrushTurfPaint,
  applyBrushCombat,
} from '../runtime/bot-ai-brush.mjs';

function makeActor(overrides = {}) {
  return {
    id: 1,
    team: 0,
    hp: 100,
    pos: { x: 0, y: 0, z: 0 },
    grounded: true,
    groundTeam: 1,
    weapon: Object.freeze({
      id: 's3-brush-normal',
      sourceMainActor: 'WeaponBrushNormal',
      range: 8.2,
      catalogRecord: Object.freeze({
        family: 'brush',
        sourceActor: 'WeaponBrushNormal',
        parameters: Object.freeze({
          WeaponSwingParam: Object.freeze({ SwingFrame: 1, InkConsume: 0.027 }),
          WeaponRollParam: Object.freeze({ InkConsumeMaxPerFrame: 0.0015 }),
        }),
      }),
    }),
    weaponRunner: {
      rolling: false,
      cooldown: 0,
      catalogState: null,
    },
    intent: { fire: false, squid: false, jump: false, sub: false, special: false },
    _prevIntent: { fire: false, squid: false, jump: false, sub: false, special: false },
    ...overrides,
  };
}

function makeWeapon(kind) {
  if (kind === 'mini') {
    return Object.freeze({
      id: 's3-brush-mini',
      sourceMainActor: 'WeaponBrushMini',
      range: 6.6,
      catalogRecord: Object.freeze({
        family: 'brush',
        sourceActor: 'WeaponBrushMini',
        parameters: Object.freeze({
          WeaponSwingParam: Object.freeze({ SwingFrame: 1, InkConsume: 0.02 }),
          WeaponRollParam: Object.freeze({ NoOpInkEffect: true, SpeedNormal: 0.198 }),
        }),
      }),
    });
  }
  if (kind === 'heavy') {
    return Object.freeze({
      id: 's3-brush-heavy',
      sourceMainActor: 'WeaponBrushHeavy',
      range: 10.8,
      catalogRecord: Object.freeze({
        family: 'brush',
        sourceActor: 'WeaponBrushHeavy',
        parameters: Object.freeze({
          WeaponSwingParam: Object.freeze({ SwingFrame: 23, InkConsume: 0.048, InkRecoverStop: 50 }),
          WeaponRollParam: Object.freeze({ SpeedNormal: 0.18, InkConsumeMaxPerFrame: 0.0018 }),
        }),
      }),
    });
  }
  return Object.freeze({
    id: 's3-brush-normal',
    sourceMainActor: 'WeaponBrushNormal',
    range: 8.2,
    catalogRecord: Object.freeze({
      family: 'brush',
      sourceActor: 'WeaponBrushNormal',
      parameters: Object.freeze({
        WeaponSwingParam: Object.freeze({ SwingFrame: 1, InkConsume: 0.027 }),
        WeaponRollParam: Object.freeze({ InkConsumeMaxPerFrame: 0.0015 }),
      }),
    }),
  });
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

test('resolveBrushArchetype resolves all 3 Splatoon 3 brush archetypes and caches without mutating frozen weapons', () => {
  const mini = makeWeapon('mini');
  const normal = makeWeapon('normal');
  const heavy = makeWeapon('heavy');

  assert.equal(resolveBrushArchetype(mini), BRUSH_ARCHETYPES.mini);
  assert.equal(resolveBrushArchetype(normal), BRUSH_ARCHETYPES.normal);
  assert.equal(resolveBrushArchetype(heavy), BRUSH_ARCHETYPES.heavy);

  // Also works by id/alias fallbacks
  assert.equal(resolveBrushArchetype({ id: 's3-inkbrush' }).id, 'mini');
  assert.equal(resolveBrushArchetype({ id: 's3-octobrush' }).id, 'normal');
  assert.equal(resolveBrushArchetype({ id: 's3-painbrush' }).id, 'heavy');
  assert.equal(resolveBrushArchetype({ id: 'Brush_Heavy_02' }).id, 'heavy');
  assert.equal(resolveBrushArchetype(null).id, 'normal');

  // Distinctive Splatoon 3 parameters per archetype
  assert.equal(BRUSH_ARCHETYPES.mini.ignoresEnemyInkOnRoll, true);
  assert.equal(BRUSH_ARCHETYPES.normal.ignoresEnemyInkOnRoll, false);
  assert.equal(BRUSH_ARCHETYPES.heavy.hasHeavyWindup, true);
  assert.ok(BRUSH_ARCHETYPES.heavy.maxReach > BRUSH_ARCHETYPES.normal.maxReach);
  assert.ok(BRUSH_ARCHETYPES.normal.maxReach > BRUSH_ARCHETYPES.mini.maxReach);
  assert.ok(BRUSH_ARCHETYPES.heavy.inkRecoverTrigger > BRUSH_ARCHETYPES.normal.inkRecoverTrigger);
  assert.ok(BRUSH_ARCHETYPES.normal.inkRecoverTrigger > BRUSH_ARCHETYPES.mini.inkRecoverTrigger);
});

test('applyBrushTurfPaint preserves existing enemy-ink fresh-edge contract without breaking legacy tests', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);
  const actor = makeActor({
    weapon: Object.freeze({ catalogRecord: { family: 'brush' }, id: 's3-inkbrush' }),
    weaponRunner: { rolling: false, cooldown: 0, catalogState: null },
    groundTeam: 2, // Enemy ink
  });
  const brain = { _turfPaintLatch: false, _turfPaintValidated: false, t: 1.0, ph1: 0.2 };

  // Tick 1: _prevIntent.fire=false -> fires fresh press
  applyBrushTurfPaint(brain, G, actor, 0.02, move, true, 0, 0.8, { wantPaintNow: false });
  assert.equal(actor.intent.fire, true, 'must fire on fresh edge when moving on enemy ink');

  // Tick 2: _prevIntent.fire=true -> releases trigger to enforce fresh edge
  actor._prevIntent.fire = true;
  applyBrushTurfPaint(brain, G, actor, 0.02, move, true, 0, 0.8, { wantPaintNow: false });
  assert.equal(actor.intent.fire, false, 'must release trigger when held to enforce fresh edge');
});

test('applyBrushTurfPaint differentiates Inkbrush enemy-ink roll mobility from Painbrush ink discipline', () => {
  const G = { match: { mode: 'turf', time: 90 } };

  // 1. Inkbrush (パブロ): continues high-speed roll over enemy ink with gentle zigzag weave
  const miniMove = makeMove(0, 1);
  const miniActor = makeActor({
    weapon: makeWeapon('mini'),
    weaponRunner: { rolling: true, cooldown: 0, catalogState: null },
    groundTeam: 2,
  });
  const miniBrain = { _turfPaintLatch: true, t: 2.3, ph1: 0.4 };
  applyBrushTurfPaint(miniBrain, G, miniActor, 1 / 60, miniMove, true, 0, 0.65, { wantPaintNow: true });
  assert.equal(miniActor.intent.fire, true, 'Inkbrush keeps rolling over enemy ink');
  assert.equal(miniActor.intent.squid, false);
  assert.ok(Math.abs(miniMove.x) > 0.01, 'Inkbrush applies human zigzag weave while rolling');

  // 2. Painbrush (フィンセント): dives to recover ink below 30% trigger instead of burning out into 50F lock
  const heavyMove = makeMove(0, 1);
  const heavyActor = makeActor({
    weapon: makeWeapon('heavy'),
    weaponRunner: { rolling: false, cooldown: 0, catalogState: null },
    groundTeam: 1,
  });
  const heavyBrain = { _turfPaintLatch: true, t: 4.0, ph1: 0.1 };
  applyBrushTurfPaint(heavyBrain, G, heavyActor, 1 / 60, heavyMove, true, 0, 0.24, { wantPaintNow: true });
  assert.equal(heavyActor.intent.fire, false, 'Painbrush stops painting below 30% ink on own ink');
  assert.equal(heavyActor.intent.squid, true, 'Painbrush swims to recover ink');

  // 3. Painbrush mid-windup (catalogState.pending=true): never interrupts with squid
  const pendingActor = makeActor({
    weapon: makeWeapon('heavy'),
    weaponRunner: { rolling: false, cooldown: 0.3, catalogState: { pending: true } },
    groundTeam: 1,
  });
  const pendingBrain = { _turfPaintLatch: true, t: 4.2, ph1: 0.1 };
  applyBrushTurfPaint(pendingBrain, G, pendingActor, 1 / 60, heavyMove, true, 0, 0.8, { wantPaintNow: true });
  assert.equal(pendingActor.intent.fire, false);
  assert.equal(pendingActor.intent.squid, false, 'must never squid-cancel pending 23F windup');
});

test('applyBrushTurfPaint reuses aimOut object across frames (zero per-frame allocation) and sweeps naturally', () => {
  const G = { match: { mode: 'turf', time: 110 } };
  const move = makeMove(0, 1);
  const actor = makeActor({ weapon: makeWeapon('normal'), groundTeam: 1 });
  const brain = { _turfPaintLatch: true, t: 0, ph1: 0.17 };

  const yaws = [];
  let firstAimRef = null;
  for (let i = 0; i < 40; i++) {
    brain.t = i * (1 / 60) * 6;
    actor._prevIntent.fire = false;
    actor.weaponRunner.cooldown = 0;
    const out = applyBrushTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, { wantPaintNow: true });
    if (out) {
      if (!firstAimRef) firstAimRef = out;
      assert.equal(out, firstAimRef, 'aimOut object must be reused with zero per-frame allocations');
      yaws.push(out.wantYaw);
    }
  }
  assert.ok(yaws.length >= 3, 'produces multiple painting swings');
  const minYaw = Math.min(...yaws);
  const maxYaw = Math.max(...yaws);
  assert.ok(maxYaw - minYaw > 0.25, 'brush painting sweeps across a wide fan instead of fixed heading');
});

test('applyBrushCombat enforces Painbrush 23F windup commitment, reach discipline, and aimError preservation', () => {
  const G = { time: 20 };
  const move = makeMove(0, 1);
  const actor = makeActor({ weapon: makeWeapon('heavy'), groundTeam: 1 });
  const brain = { react: 0, strafeS: 0.8, t: 1.5, ph1: 0.3 };

  // 1. Out of reach (13.5m > 11.4m): does NOT whiff a slow 23F swing; swims to close gap
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 13.5, dx: 0, dz: 13.5, dy: 0, enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8, wantYaw: 0.12, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'Painbrush must not whiff 23F swing outside effective reach');
  assert.equal(actor.intent.squid, true, 'Painbrush closes distance in squid form on own ink');

  // 2. Inside effective reach (9.5m) with elevated enemy: fires fresh press and preserves aimError in wantYaw
  const aimOut = applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 9.5, dx: 0, dz: 9.5, dy: 1.2, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8, wantYaw: 0.12, wantPitch: 0.05,
  });
  assert.equal(actor.intent.fire, true, 'Painbrush commits swing inside reach');
  assert.equal(actor.intent.squid, false);
  assert.equal(aimOut.wantYaw, 0.12, 'must preserve existing wantYaw aimError (no aimError zeroing cheat)');
  assert.ok(aimOut.wantPitch > 0.05, 'Painbrush applies gentle upward lob bias for elevated targets');

  // 3. During 23F pending windup: never squid-cancels
  actor.weaponRunner.catalogState = { pending: true };
  actor._prevIntent.fire = true;
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 9.5, dx: 0, dz: 9.5, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.75, wantYaw: 0.12, wantPitch: 0,
  });
  assert.equal(actor.intent.squid, false, 'must never squid-cancel during 23F pending windup');
  assert.equal(actor.intent.fire, false, 'releases fire during windup so it does not drop into unintended roll');
});

test('applyBrushCombat gives Inkbrush zigzag evasion, enemy-ink roll approach, and low-HP retreat without wallhack', () => {
  const G = { time: 30 };

  // 1. Zigzag approach varies lateral direction over time (not rigid straight-line or constant vector)
  const actor = makeActor({ weapon: makeWeapon('mini'), groundTeam: 2 });
  const brain = { react: 0, strafeS: 0.9, t: 0, ph1: 0.1 };
  const move = makeMove(0, 1);
  const xs = [];
  for (let i = 0; i < 12; i++) {
    brain.t = i * 0.12;
    actor._prevIntent.fire = false;
    actor.weaponRunner.rolling = true;
    applyBrushCombat(brain, G, actor, 1 / 60, move, {
      dist: 8.5, dx: 0, dz: 8.5, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.7, wantYaw: 0, wantPitch: 0,
    });
    xs.push(move.x);
    assert.equal(actor.intent.fire, true, 'Inkbrush maintains enemy-ink-immune roll while closing from 8.5m');
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.3, 'Inkbrush combat approach weaves laterally in a human zigzag');

  // 2. Low HP disengage outside killDist: retreats diagonally away from enemy (move.z < 0)
  actor.hp = 30;
  actor.weaponRunner.rolling = false;
  actor.groundTeam = 1;
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 6.5, dx: 0, dz: 6.5, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.7, wantYaw: 0, wantPitch: 0,
  });
  assert.ok(move.z < -0.3, 'low-HP Inkbrush retreats away from enemy');
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, true);

  // 3. Hidden enemy (enemyVisible=false): never fires blindly (no wallhack)
  actor.hp = 100;
  actor._prevIntent.fire = false;
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 4.0, dx: 0, dz: 4.0, dy: 0, enemyVisible: false, aimed: true, off: 0, inkFrac: 0.9, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'must never fire at hidden target (no wallhack)');
});

test('applyBrushCombat preserves Octobrush wide strafe-dueling and strict fresh-edge tap cadence', () => {
  const G = { time: 40 };
  const move = makeMove(0, 1);
  const actor = makeActor({ weapon: makeWeapon('normal'), groundTeam: 1 });
  const brain = { react: 0, strafeS: 0.85, t: 1.0, ph1: 0.25 };

  // Inside 3-shot range (5.0m): fires on fresh edge and strafes laterally
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 5.0, dx: 0, dz: 5.0, dy: 0, enemyVisible: true, aimed: false, off: 0.35, inkFrac: 0.75, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'Octobrush swings within wide horizontal tolerance at 5.0m');
  assert.equal(actor.intent.squid, false);
  assert.ok(Math.abs(move.x) > 0.4, 'Octobrush strafes laterally during close combat');

  // Next tick with _prevIntent.fire=true: releases trigger to generate next fresh edge
  actor._prevIntent.fire = true;
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 5.0, dx: 0, dz: 5.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.72, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'Octobrush releases trigger on held frame to enforce fresh edge');
});

test('applyBrushTurfPaint and applyBrushCombat respect superJumpState, specialActive, it.special, it.sub, and climbing', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);
  const combatCtx = {
    dist: 5.0, dx: 0, dz: 5.0, dy: 0, enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.85, wantYaw: 0.1, wantPitch: 0,
  };

  // 1. superJumpState: suppresses fire/squid and resets timers
  const sjActor = makeActor({ superJumpState: { phase: 'flight' }, intent: { fire: true, squid: true, jump: false, sub: false, special: false } });
  const sjBrain = { _turfPaintLatch: true, t: 1 };
  applyBrushTurfPaint(sjBrain, G, sjActor, 1 / 60, move, true, 0, 0.8, { wantPaintNow: true });
  assert.equal(sjActor.intent.fire, false);
  assert.equal(sjActor.intent.squid, false);

  // 2. specialActive: preserves special intent without clobbering
  const spActor = makeActor({ specialActive: { id: 'stamp' }, intent: { fire: true, squid: false, jump: false, sub: false, special: false } });
  assert.equal(applyBrushCombat({ react: 0, t: 1 }, G, spActor, 1 / 60, move, combatCtx), null);
  assert.equal(spActor.intent.fire, true, 'specialActive intent must not be overwritten');

  // 3. it.sub & it.special: suppresses main fire/squid so sub/special executes cleanly
  const subActor = makeActor({ intent: { fire: false, squid: false, jump: false, sub: true, special: false } });
  assert.equal(applyBrushCombat({ react: 0, t: 1 }, G, subActor, 1 / 60, move, combatCtx), null);
  assert.equal(subActor.intent.fire, false);
  assert.equal(subActor.intent.squid, false);
  assert.equal(subActor.intent.sub, true);

  const trigSpActor = makeActor({ intent: { fire: false, squid: false, jump: false, sub: false, special: true } });
  assert.equal(applyBrushTurfPaint({ _turfPaintLatch: true, t: 1 }, G, trigSpActor, 1 / 60, move, true, 0, 0.8, { wantPaintNow: true }), null);
  assert.equal(trigSpActor.intent.fire, false);
  assert.equal(trigSpActor.intent.special, true);

  // 4. climbing: never fires or cancels squid while climbing wall
  const climbActor = makeActor({ climbing: true, intent: { fire: false, squid: true, jump: false, sub: false, special: false } });
  assert.equal(applyBrushTurfPaint({ _turfPaintLatch: true, t: 1 }, G, climbActor, 1 / 60, move, true, 0, 0.8, { wantPaintNow: true }), null);
  assert.equal(climbActor.intent.fire, false);
  assert.equal(climbActor.intent.squid, true);
  assert.equal(applyBrushCombat({ react: 0, t: 1 }, G, climbActor, 1 / 60, move, combatCtx), null);
  assert.equal(climbActor.intent.fire, false);
  assert.equal(climbActor.intent.squid, true);
});

test('brush per-bot state resets cleanly on death (!actor.alive) and across netLife respawns', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 20 };
  const move = makeMove(0, 1);
  const actor = makeActor({ weapon: makeWeapon('heavy'), alive: true, netLife: 1, groundTeam: 1 });
  const brain = { _turfPaintLatch: true, react: 0, t: 2.0, ph1: 0.2 };

  // Enter paintRecovering in life 1
  applyBrushTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.20, { wantPaintNow: true });
  assert.equal(brain._brushAI.paintRecovering, true);
  brain._brushAI.swimGapT = 0.25;
  brain._brushAI.combatChaining = true;

  // Respawn with netLife = 2 (without brain.reset())
  actor.netLife = 2;
  applyBrushTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.50, { wantPaintNow: true });
  assert.equal(brain._brushAI.paintRecovering, false, 'stale paintRecovering must reset on respawn');
  assert.equal(brain._brushAI.swimGapT, 0, 'stale swimGapT must reset on respawn');
  assert.equal(brain._brushAI.combatChaining, false, 'stale combatChaining must reset on respawn');
  assert.equal(actor.intent.fire, true, 'respawned brush swings cleanly without stale recovery lock');

  // Dead actor (!actor.alive) clears fire/squid
  actor.alive = false;
  actor.intent.fire = true;
  applyBrushCombat(brain, G, actor, 1 / 60, move, {
    dist: 5.0, dx: 0, dz: 5.0, enemyVisible: true, aimed: true, off: 0, inkFrac: 1,
  });
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, false);
});

test('applyBrushTurfPaint and applyBrushCombat handle string actor.id and NaN/undefined inputs safely', () => {
  const G = { match: { mode: 'turf', time: NaN }, time: 10 };
  const move = makeMove(0, 1);
  const actor = makeActor({
    id: 'bot-alpha-3',
    hp: NaN,
    weapon: Object.freeze({ id: 's3-brush-mini', sourceMainActor: 'WeaponBrushMini', range: Infinity }),
    weaponRunner: { rolling: true, cooldown: NaN, catalogState: null },
    groundTeam: 2,
  });
  const brain = { _turfPaintLatch: true, react: NaN, strafeS: NaN, aimYaw: NaN, aimPitch: NaN, t: NaN };

  assert.equal(applyBrushTurfPaint(null, G, actor, NaN, move, true, NaN, NaN), null);
  assert.equal(applyBrushCombat(null, G, actor, NaN, move, {}), null);

  // Rolling with string actor.id and NaN baseYaw must keep move finite
  applyBrushTurfPaint(brain, G, actor, NaN, move, true, NaN, 0.7, { wantPaintNow: true, cache: { flankBias: NaN } });
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'move must stay finite with string id and NaN baseYaw');

  // Combat with string actor.id and NaN ctx values must keep move and aimOut finite
  actor.weaponRunner.rolling = false;
  const aim = applyBrushCombat(brain, G, actor, NaN, move, {
    dist: NaN, dx: NaN, dz: NaN, dy: 1.5, enemyVisible: true, aimed: true, off: NaN, inkFrac: NaN, wantYaw: NaN, wantPitch: NaN,
  });
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'combat move must stay finite under string id and NaN ctx');
  if (aim) {
    assert.ok(Number.isFinite(aim.wantYaw) && Number.isFinite(aim.wantPitch), 'aimOut must stay finite');
  }
});

test('applyBrushTurfPaint emerges cleanly from squid form before firing rising edge', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);
  const actor = makeActor({ weapon: makeWeapon('normal'), form: 'squid', groundTeam: 1 });
  const brain = { _turfPaintLatch: true, t: 1.0, ph1: 0.2 };

  // Frame 1: submerged -> pops up without wasting rising edge or incrementing paintSwings
  applyBrushTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, { wantPaintNow: true });
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, false);
  assert.equal(brain._brushAI.paintSwings, 0);

  // Frame 2: emerged -> fires fresh rising edge cleanly
  actor.form = 'human';
  applyBrushTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, { wantPaintNow: true });
  assert.equal(actor.intent.fire, true);
  assert.equal(brain._brushAI.paintSwings, 1);
});
