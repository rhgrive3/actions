import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARGER_PAINT_TUNING,
  CHARGER_COMBAT_TUNING,
  classifyChargerArchetype,
  supportsChargeKeep,
  applyChargerTurfPaint,
  applyChargerCombat,
} from '../runtime/bot-ai-charger.mjs';

function makeMove(x = 0, z = 1) {
  return {
    x,
    y: 0,
    z,
    set(nx, ny, nz) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
      return this;
    },
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    },
  };
}

test('classifyChargerArchetype & supportsChargeKeep cover all 8 Splatoon 3 charger weapons accurately', () => {
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerQuick', id: 's3-charger-quick' }), 'quick');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerNormal', id: 'charger' }), 'standard');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerNormalScope', id: 's3-charger-normalscope' }), 'standardScope');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerLong', id: 's3-charger-long' }), 'long');
  assert.equal(classifyChargerArchetype({ id: 's3-eliter', chargeTime: 1.53 }), 'long');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerLongScope', id: 's3-charger-longscope' }), 'longScope');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerLight', id: 's3-charger-light' }), 'bamboo');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerKeeper', id: 's3-charger-keeper' }), 'keeper');
  assert.equal(classifyChargerArchetype({ sourceMainActor: 'WeaponChargerPencil', id: 's3-charger-pencil' }), 'pencil');

  // Charge Keep support across all 8 weapons
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerQuick', id: 's3-charger-quick' }, 'quick'), true);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerNormal', id: 'charger' }, 'standard'), true);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerNormalScope', id: 's3-charger-normalscope', scoped: true }, 'standardScope'), false);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerNormalScope', scoped: true }, 'standard'), false);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerLong', id: 's3-charger-long' }, 'long'), true);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerLongScope', id: 's3-charger-longscope', scoped: true }, 'longScope'), false);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerLight', id: 's3-charger-light' }, 'bamboo'), false);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerKeeper', id: 's3-charger-keeper' }, 'keeper'), true);
  assert.equal(supportsChargeKeep({ sourceMainActor: 'WeaponChargerPencil', id: 's3-charger-pencil' }, 'pencil'), false);
});

test('standard & long chargers use fast low-charge tap paint and organic non-overlapping fan sweeps', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const move = makeMove(0, 1);
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0 };
  const actor = {
    id: 1,
    groundTeam: 1,
    weapon: { sourceMainActor: 'WeaponChargerNormal', id: 'charger', chargeTime: 1.0 },
    weaponRunner: { charging: true, charge: CHARGER_PAINT_TUNING.standard.tapCharge + 0.01, cooldown: 0 },
    intent: { fire: true, squid: false },
  };

  // Releases promptly at low tapCharge (~0.14) instead of slow 0.42..0.50 crawl
  applyChargerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.80, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { effOwn: 0.45, effEnemy: 0.05, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, false, 'standard charger releases quickly at tapCharge');

  // Collect 12 consecutive released sweep angles and confirm organic variation (not rigid 5-lane repetition)
  const sweeps = [brain.sweep];
  for (let i = 0; i < 11; i++) {
    actor.intent.fire = true;
    // Provide enough charge for both tap slots (0.14) and periodic longLine slots (0.34)
    actor.weaponRunner.charge = CHARGER_PAINT_TUNING.standard.longLineCharge + 0.02;
    applyChargerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.78, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { effOwn: 0.45, effEnemy: 0.05, flankBias: 0 },
    });
    assert.equal(actor.intent.fire, false, `shot ${i + 2} releases cleanly`);
    assert.notEqual(brain.sweep, sweeps[sweeps.length - 1], 'consecutive shots must target distinct angular fan lanes');
    sweeps.push(brain.sweep);
  }
  const uniqueLanes = new Set(sweeps.map((s) => Math.round(s * 1000)));
  assert.ok(uniqueLanes.size >= 8, `expected organic non-repeating lanes (>= 8 unique in 12 shots), got ${uniqueLanes.size}`);

  // Strong positive flankBias pulls average sweep toward unpainted right flank
  const biasedBrain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0 };
  let sumBias = 0;
  for (let i = 0; i < 10; i++) {
    actor.intent.fire = true;
    actor.weaponRunner.charge = CHARGER_PAINT_TUNING.standard.longLineCharge + 0.02;
    applyChargerTurfPaint(biasedBrain, G, actor, 1 / 60, move, true, 0, 0.78, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { effOwn: 0.35, effEnemy: 0.15, flankBias: 0.45 },
    });
    sumBias += Math.sin(biasedBrain.sweep);
  }
  assert.ok(sumBias / 10 > 0.18, `expected sweep average pulled toward positive flankBias, got ${sumBias / 10}`);
});

test('pitchReady=false contract: holds charge instead of firing into floor, and blocks long/longScope fallback', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);

  const stdActor = {
    id: 2,
    groundTeam: 1,
    weapon: { catalogRecord: { family: 'charger' }, id: 's3-charger-std' },
    weaponRunner: { charging: true, charge: 0.75, cooldown: 0 },
    intent: { fire: true, squid: false },
  };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: false };
  applyChargerTurfPaint(brain, G, stdActor, 1 / 60, move, true, 0, 0.8, {
    pitchReady: false,
    wantPaintNow: false,
  });
  assert.equal(stdActor.intent.fire, true, 'must hold charge when pitchReady is false');

  // Once pitchReady becomes true, releases shot
  applyChargerTurfPaint(brain, G, stdActor, 1 / 60, move, true, 0, 0.8, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(stdActor.intent.fire, false, 'must release charge once pitchReady is true');

  // Long & LongScope charger fallback must not fire when pitchReady is false
  for (const id of ['s3-eliter', 's3-charger-longscope']) {
    const longActor = {
      id: 3,
      groundTeam: 1,
      weapon: { catalogRecord: { family: 'charger' }, chargeTime: 1.53, id },
      weaponRunner: { charging: false, cooldown: 0 },
      intent: { fire: false, squid: false },
    };
    applyChargerTurfPaint({ _turfPaintLatch: true, _turfPaintValidated: false }, G, longActor, 1 / 60, move, true, 0, 0.8, {
      pitchReady: false,
      wantPaintNow: false,
    });
    assert.equal(longActor.intent.fire, false, `${id} fallback must respect pitchReady=false`);
  }
});

test('Bamboozler 14 holds to full charge to avoid no-charge gaps; Snipewriter 5H sweeps 5 loaded rounds cleanly', () => {
  const G = { match: { mode: 'turf', time: 100 } };

  // Bamboozler: at charge 0.40, must keep charging to ~0.94
  const bambooActor = {
    id: 4,
    groundTeam: 1,
    weapon: { sourceMainActor: 'WeaponChargerLight', id: 's3-charger-light', chargeTime: 0.33 },
    weaponRunner: { charging: true, charge: 0.40, cooldown: 0 },
    intent: { fire: false, squid: false },
  };
  const bambooBrain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0 };
  applyChargerTurfPaint(bambooBrain, G, bambooActor, 1 / 60, makeMove(), true, 0, 0.8, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(bambooActor.intent.fire, true, 'Bamboozler holds charge past 0.40 for gapless full-charge paint');

  bambooActor.weaponRunner.charge = 0.96;
  applyChargerTurfPaint(bambooBrain, G, bambooActor, 1 / 60, makeMove(), true, 0, 0.8, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(bambooActor.intent.fire, false, 'Bamboozler releases at full charge');

  // Snipewriter 5H: while charging at 0.70, keeps charging to 1.0 even if rounds > 0 is absent
  const pencilActor = {
    id: 5,
    groundTeam: 1,
    weapon: { sourceMainActor: 'WeaponChargerPencil', id: 's3-charger-pencil', chargeTime: 1.2 },
    weaponRunner: { charging: true, charge: 0.70, cooldown: 0, catalogState: { rounds: 0, pending: false } },
    intent: { fire: false, squid: false },
    _prevIntent: { fire: false },
  };
  const pencilBrain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0 };
  applyChargerTurfPaint(pencilBrain, G, pencilActor, 1 / 60, makeMove(), true, 0, 0.8, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(pencilActor.intent.fire, true, 'Snipewriter holds until 1.0 full magazine load');

  // Once loaded (rounds 5 -> 1), sweeps across a continuous fan arc covering distinct lanes
  pencilActor.weaponRunner.charging = false;
  const arc = [];
  for (let r = 5; r >= 1; r--) {
    pencilActor.weaponRunner.catalogState.rounds = r;
    pencilActor.intent.fire = false;
    pencilActor._prevIntent.fire = false;
    applyChargerTurfPaint(pencilBrain, G, pencilActor, 1 / 60, makeMove(), true, 0, 0.6, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { effOwn: 0.3, effEnemy: 0.1, flankBias: 0 },
    });
    assert.equal(pencilActor.intent.fire, true, `Snipewriter fires loaded round ${r}`);
    arc.push(Math.sin(pencilBrain.sweep));
  }
  const span = Math.max(...arc) - Math.min(...arc);
  assert.ok(span > 1.1, `Snipewriter 5-round sweep should fan widely across turf, got span=${span}`);
});

test('micro-refill squid hysteresis prevents hard refill stalls on own ink and applies lateral strafe painting', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0 };
  const actor = {
    id: 6,
    groundTeam: 1,
    weapon: { sourceMainActor: 'WeaponChargerNormal', id: 'charger' },
    weaponRunner: { charging: false, charge: 0, cooldown: 0 },
    intent: { fire: false, squid: false },
  };

  // Low ink (< 0.24) on own ink -> enters brief squid micro-refill instead of draining to 0.12
  applyChargerTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.20, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(brain._chargerMicroRefill, true, 'enters micro-refill below floor');
  assert.equal(actor.intent.squid, true, 'dives into own ink to recover');
  assert.equal(actor.intent.fire, false, 'pauses firing while recovering');

  // Hysteresis: still refilling at 0.35 (< 0.50 resume)
  applyChargerTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.35, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(brain._chargerMicroRefill, true);
  assert.equal(actor.intent.squid, true);

  // Resumes painting with lateral strafe once ink recovers >= 0.50
  const move = makeMove(0, 1);
  applyChargerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.55, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { effOwn: 0.4, effEnemy: 0.1, flankBias: 0.25 },
  });
  assert.equal(brain._chargerMicroRefill, false);
  assert.equal(actor.intent.fire, true);
  assert.ok(Math.abs(move.x) > 0.15, `expected lateral strafe in move.x, got ${move.x}`);
});

test('applyChargerCombat matches pre-charge, aim-hold (zero-alloc), close-range half-charge, kiting, and charge-keep behavior', () => {
  // 1. Pre-charge on enemy sighting & aim-tightening release (contract with bot-weak-weapon-combat.test.mjs)
  const actor = {
    weapon: { kind: 'charger', id: 'charger', rangeMax: 24 },
    intent: { fire: false, squid: false },
    weaponRunner: { cooldown: 0, charging: false, charge: 0 },
    groundTeam: 1,
  };
  const brain = { react: 0.05, strafeS: 0.5 };
  const move = makeMove(0, 1);

  applyChargerCombat(brain, {}, actor, 1 / 60, move, {
    family: 'charger', dist: 18, range: 22, dx: 0, dz: 18,
    enemyVisible: true, aimed: false, off: 0.25, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.1, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'pre-charges immediately on enemy sighting');

  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 0.96;
  const aimFocus1 = applyChargerCombat(brain, {}, actor, 1 / 60, move, {
    family: 'charger', dist: 18, range: 22, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.09, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.08, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'holds full charge briefly while aim converges');
  assert.ok(aimFocus1 && aimFocus1.wantYaw < 0.08 && aimFocus1.wantYaw > 0, 'tightens aim smoothly without zeroing error');

  const aimFocus2 = applyChargerCombat(brain, {}, actor, 1 / 60, move, {
    family: 'charger', dist: 18, range: 22, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.015, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.01, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'releases shot once aim is squarely on target');
  assert.equal(aimFocus2, aimFocus1, 'reuses brain._chargerAimOut without per-frame heap allocation');

  // 2. Rushed at close range (8m < 10.5m): kites backward and fires quicker half-charge (~0.52)
  const kiteMove = makeMove(0, 1);
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = CHARGER_COMBAT_TUNING.standard.closeCharge + 0.02;
  applyChargerCombat(brain, {}, actor, 1 / 60, kiteMove, {
    family: 'charger', dist: 8, range: 22, dx: 0, dz: 8,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'fires quicker half-charge at close range');
  assert.ok(kiteMove.z < 0, `expected backward kiting (move.z < 0), got ${kiteMove.z}`);

  // 3. Charge Keep when target briefly ducks behind cover on own ink
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 1.0;
  brain.lostTimer = 0.25;
  applyChargerCombat(brain, {}, actor, 1 / 60, makeMove(), {
    family: 'charger', dist: 16, range: 22, dx: 0, dz: 16,
    enemyVisible: false, aimed: false, off: 0.1, inkFrac: 0.7,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'maintains charge during brief LOS break');
  assert.equal(actor.intent.squid, true, 'uses Charge Keep swim on own ink');

  // Cancels wasted charge if target stays hidden > keepMaxLost (0.72s)
  brain.lostTimer = 0.80;
  applyChargerCombat(brain, {}, actor, 1 / 60, makeMove(), {
    family: 'charger', dist: 16, range: 22, dx: 0, dz: 16,
    enemyVisible: false, aimed: false, off: 0.1, inkFrac: 0.7,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'cancels stale charge when target stays hidden');
});

test('scoped chargers (Splatterscope / 4K Scope) hold stationary anchor stance, never squid-keep, and pre-aim briefly', () => {
  for (const [id, src, expectedScale] of [
    ['s3-charger-normalscope', 'WeaponChargerNormalScope', CHARGER_COMBAT_TUNING.standardScope.chargeMoveScale],
    ['s3-charger-longscope', 'WeaponChargerLongScope', CHARGER_COMBAT_TUNING.longScope.chargeMoveScale],
  ]) {
    const actor = {
      id: 10,
      weapon: { sourceMainActor: src, id, scoped: true, rangeMax: 28 },
      intent: { fire: true, squid: false },
      weaponRunner: { cooldown: 0, charging: true, charge: 0.85 },
      groundTeam: 1,
    };
    const brain = { react: 0, strafeS: 0.5, lostTimer: 0.20 };
    const move = makeMove(0, 1);

    // Brief LOS break -> holds stationary pre-aim without attempting invalid squid-keep
    applyChargerCombat(brain, {}, actor, 1 / 60, move, {
      family: 'charger', dist: 22, range: 28, dx: 0, dz: 22,
      enemyVisible: false, aimed: false, off: 0.05, inkFrac: 0.7,
      idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
    });
    assert.equal(actor.intent.fire, true, `${id} briefly pre-aims on short LOS break`);
    assert.equal(actor.intent.squid, false, `${id} must never attempt squid Charge Keep`);
    assert.ok(Math.abs(move.z - expectedScale) < 1e-6, `${id} applies stationary anchor movement damping`);

    // Longer LOS break -> cancels cleanly
    brain.lostTimer = 0.50;
    applyChargerCombat(brain, {}, actor, 1 / 60, makeMove(), {
      family: 'charger', dist: 22, range: 28, dx: 0, dz: 22,
      enemyVisible: false, aimed: false, off: 0.05, inkFrac: 0.7,
      idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
    });
    assert.equal(actor.intent.fire, false, `${id} cancels stale scoped charge once target stays hidden`);
  }
});

test('Classic Squiffer uses jump-charge hops in mid-range combat while non-Squiffer chargers stay grounded', () => {
  const squiffer = {
    id: 11,
    grounded: true,
    climbing: false,
    weapon: { sourceMainActor: 'WeaponChargerQuick', id: 's3-charger-quick', rangeMax: 18.5 },
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { cooldown: 0, charging: true, charge: 0.35 },
    groundTeam: 1,
  };
  const sqBrain = { react: 0, strafeS: 0.5 };
  applyChargerCombat(sqBrain, {}, squiffer, 1 / 60, makeMove(), {
    family: 'charger', dist: 12, range: 18.5, dx: 0, dz: 12,
    enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.03, wantPitch: 0,
  });
  assert.equal(squiffer.intent.jump, true, 'Classic Squiffer triggers jump-charge hop leveraging 100% air charge rate');
  assert.ok(sqBrain._chargerJumpCd >= 1.15, 'Squiffer sets natural cooldown between jump-charge hops');

  // Splat Charger must not jump while charging (would incur 33% air-charge penalty)
  const std = {
    id: 12,
    grounded: true,
    climbing: false,
    weapon: { sourceMainActor: 'WeaponChargerNormal', id: 'charger', rangeMax: 26 },
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { cooldown: 0, charging: true, charge: 0.35 },
    groundTeam: 1,
  };
  applyChargerCombat({ react: 0, strafeS: 0.5 }, {}, std, 1 / 60, makeMove(), {
    family: 'charger', dist: 16, range: 26, dx: 0, dz: 16,
    enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.03, wantPitch: 0,
  });
  assert.equal(std.intent.jump, false, 'Splat Charger stays grounded while charging');
});

test('Goo Tuber uses 1-ring lethal charge & extended partial Charge Keep; Bamboozler chains full->tap 2-tap rhythm; Snipewriter protects loaded rounds', () => {
  // 1. Goo Tuber mid-range lethal half-charge (~0.74)
  const keeper = {
    id: 13,
    weapon: { sourceMainActor: 'WeaponChargerKeeper', id: 's3-charger-keeper', rangeMax: 19.8 },
    intent: { fire: true, squid: false },
    weaponRunner: { cooldown: 0, charging: true, charge: 0.76 },
    groundTeam: 1,
  };
  applyChargerCombat({ react: 0, strafeS: 0.4 }, {}, keeper, 1 / 60, makeMove(), {
    family: 'charger', dist: 14, range: 19.8, dx: 0, dz: 14,
    enemyVisible: true, aimed: true, off: 0.015, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(keeper.intent.fire, false, 'Goo Tuber releases at 1-ring 100+ dmg lethal threshold');

  // Goo Tuber extended partial Charge Keep (charge=0.55, lostTimer=1.9s -> still keeps & curves laterally)
  keeper.weaponRunner.charge = 0.55;
  keeper.intent.fire = true;
  keeper.intent.squid = false;
  const keepMove = makeMove(0, 1);
  applyChargerCombat({ react: 0, strafeS: 0.7, lostTimer: 1.9 }, {}, keeper, 1 / 60, keepMove, {
    family: 'charger', dist: 14, range: 19.8, dx: 0, dz: 14,
    enemyVisible: false, aimed: false, off: 0.1, inkFrac: 0.7,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(keeper.intent.fire, true, 'Goo Tuber sustains partial Charge Keep past standard 1.25s limit');
  assert.equal(keeper.intent.squid, true, 'Goo Tuber swims in ink during extended Charge Keep');
  assert.ok(Math.abs(keepMove.x) > 0.5, 'Goo Tuber curves laterally while keeping charge to re-open sightline');

  // 2. Bamboozler 14: opening full charge arms quick follow-up even inside closeDist, then resets
  const bamboo = {
    id: 14,
    weapon: { sourceMainActor: 'WeaponChargerLight', id: 's3-charger-light', rangeMax: 19.5 },
    intent: { fire: true, squid: false },
    weaponRunner: { cooldown: 0, charging: true, charge: 0.96 },
    groundTeam: 1,
  };
  const bambooBrain = { react: 0, strafeS: 0.5 };
  applyChargerCombat(bambooBrain, {}, bamboo, 1 / 60, makeMove(), {
    family: 'charger', dist: 13, range: 19.5, dx: 0, dz: 13,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(bamboo.intent.fire, false, 'Bamboozler fires opening full charge');
  assert.ok(bambooBrain._bambooComboT > 0.5, 'Bamboozler arms 2-tap follow-up window');

  // Follow-up tap at charge 0.18 inside closeDist (7.5m) releases immediately and resets combo
  bamboo.weaponRunner.charge = 0.18;
  bamboo.intent.fire = true;
  applyChargerCombat(bambooBrain, {}, bamboo, 1 / 60, makeMove(), {
    family: 'charger', dist: 7.5, range: 19.5, dx: 0, dz: 7.5,
    enemyVisible: true, aimed: true, off: 0.015, inkFrac: 0.75,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(bamboo.intent.fire, false, 'Bamboozler fires quick tap follow-up for 2-tap rhythm');
  assert.equal(bambooBrain._bambooComboT, 0, 'Bamboozler resets combo window after follow-up');

  // 3. Snipewriter 5H loaded rounds combat tap-fire & brief LOS magazine preservation
  const pencil = {
    id: 15,
    weapon: { sourceMainActor: 'WeaponChargerPencil', id: 's3-charger-pencil', rangeMax: 26 },
    intent: { fire: false, squid: false },
    _prevIntent: { fire: false },
    weaponRunner: { cooldown: 0, charging: false, charge: 0, catalogState: { rounds: 4, pending: false } },
    groundTeam: 1,
  };
  applyChargerCombat({ react: 0, strafeS: 0.5 }, {}, pencil, 1 / 60, makeMove(), {
    family: 'charger', dist: 18, range: 24, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.6,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: 0,
  });
  assert.equal(pencil.intent.fire, true, 'Snipewriter fires buffered magazine round in combat');

  // Brief LOS break while loaded -> stays in kid form instead of cancelling rounds into squid
  pencil.intent.squid = true;
  applyChargerCombat({ react: 0, strafeS: 0.5, lostTimer: 0.25 }, {}, pencil, 1 / 60, makeMove(), {
    family: 'charger', dist: 18, range: 24, dx: 0, dz: 18,
    enemyVisible: false, aimed: false, off: 0.1, inkFrac: 0.6,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(pencil.intent.squid, false, 'Snipewriter stays in kid form briefly to preserve loaded rounds');
});
