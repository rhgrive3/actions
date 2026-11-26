import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStringerTurfPaint,
  applyStringerCombat,
  classifyStringerArchetype,
  computeStringerCombatCharge,
  computeStringerArcPitch,
  stringerMicroNoise,
} from '../runtime/bot-ai-stringer.mjs';
import { botWeaponPaintProfile } from '../runtime/bot-turf-paint.mjs';

function makeMove(x = 0, z = 1) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  };
}

function makeTriStringerWeapon() {
  return {
    id: 's3-stringer-normal',
    sourceMainActor: 'WeaponStringerNormal',
    catalogRecord: {
      family: 'stringer',
      parameters: {
        spl__WeaponStringerParam: {
          ChargeParam: { ChargeFrameMinCharge: 9, ChargeFrameMidCharge: 30, ChargeFrameFullCharge: 72 },
        },
      },
    },
    range: 25,
    chargeTime: 72 / 60,
    firstChargeTime: 30 / 60,
  };
}

function makeLactWeapon() {
  return {
    id: 's3-stringer-short',
    sourceMainActor: 'WeaponStringerShort',
    catalogRecord: {
      family: 'stringer',
      parameters: {
        spl__WeaponStringerParam: {
          ChargeParam: { ChargeFrameMinCharge: 6, ChargeFrameMidCharge: 12, ChargeFrameFullCharge: 34 },
        },
      },
    },
    range: 15,
    chargeTime: 34 / 60,
    firstChargeTime: 12 / 60,
  };
}

function makeWellstringWeapon() {
  return {
    id: 's3-stringer-explosion',
    sourceMainActor: 'WeaponStringerExplosion',
    catalogRecord: {
      family: 'stringer',
      parameters: {
        spl__WeaponStringerParam: {
          ChargeParam: { ChargeFrameMinCharge: 12, ChargeFrameMidCharge: 40, ChargeFrameFullCharge: 80 },
        },
      },
    },
    range: 23,
    chargeTime: 80 / 60,
    firstChargeTime: 40 / 60,
  };
}

test('classifyStringerArchetype distinguishes Tri-Stringer, LACT-450, and Wellstring V', () => {
  assert.equal(classifyStringerArchetype(makeTriStringerWeapon()), 'normal');
  assert.equal(classifyStringerArchetype(makeLactWeapon()), 'short');
  assert.equal(classifyStringerArchetype(makeWellstringWeapon()), 'explosion');
});

test('Turf paint preserves WeaponStringerShort stringerChargeCap = 0.14 contract and grounded horizontal shot', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);
  const weapon = makeLactWeapon();
  const profile = botWeaponPaintProfile(weapon, 'stringer');
  assert.equal(profile.stringerChargeCap, 0.14);

  const actor = {
    id: 7,
    weapon,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: true },
    weaponRunner: { charging: true, charge: 0.15, cooldown: 0 },
  };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0 };

  // At 0.15 >= 0.14: releases fire and suppresses jump so fan stays horizontal
  applyStringerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8, { profile });
  assert.equal(actor.intent.fire, false, 'LACT-450 releases charge at 0.15 >= 0.14');
  assert.equal(actor.intent.jump, false, 'grounded turf shot stays horizontal');

  // At 0.12 < 0.14: continues charging
  actor.weaponRunner.charge = 0.12;
  actor.intent.fire = false;
  applyStringerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8, { profile });
  assert.equal(actor.intent.fire, true, 'LACT-450 holds charge at 0.12 < 0.14');
});

test('Turf paint holds charge when pitchReady is false (downward foot-paint recovery contract)', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);
  const actor = {
    id: 2,
    weapon: makeTriStringerWeapon(),
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.25, cooldown: 0 },
  };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: false };

  applyStringerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, true, 'stringer holds charge until aim pitch recovers');
});

test('Wellstring V organically weaves full-charge horizontal 5-arrow sweeps on wide unpainted turf', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);
  const actor = {
    id: 3,
    weapon: makeWellstringWeapon(),
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.40, cooldown: 0 },
  };
  const brain = {
    _turfPaintLatch: true,
    _turfPaintValidated: true,
    _stringerPaintShotIdx: 2,
    _turfMultiCache: { multiActive: true, effOwn: 0.20 },
  };

  const info = applyStringerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(info.fullSweep, true);
  assert.equal(actor.intent.fire, true, 'Wellstring V holds past 0.40 for full-charge 5-arrow sweep');

  // Releasing a full sweep resets _stringerLowPaintRun so the next shot returns to low-charge horizontal fan
  actor.weaponRunner.charge = 0.98;
  applyStringerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'releases full-charge sweep at 0.98');
  assert.equal(brain._stringerLowPaintRun, 0, 'resets consecutive low-shot counter after full sweep');

  actor.weaponRunner.charge = 0.40;
  const nextInfo = applyStringerTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(nextInfo.fullSweep, false, 'next shot returns to nimble low-charge horizontal fan');
  assert.equal(nextInfo, info, 'reuses output object with zero per-tick allocation');
});

test('Tri-Stringer combat fixes 0.417 short-range bug: scales 2nd-ring charge across 13-19.5m instead of releasing at 0.417', () => {
  const w = makeTriStringerWeapon();
  // Close range (< 10.5m): quick 1st-ring explosive bolt with safety margin above 30/72 (0.4167)
  const closeCharge = computeStringerCombatCharge(w, 8.0, 25, 'normal');
  assert.ok(closeCharge > 30 / 72 && closeCharge < 0.50, `expected explosive 1st-ring ~0.44, got ${closeCharge}`);

  // Mid range (16m, where Round 1 erroneously released at 0.417 with only 12.8m reach!):
  // must charge well into the 2nd ring so SpawnSpeed reaches the target
  const midCharge = computeStringerCombatCharge(w, 16.0, 25, 'normal');
  assert.ok(midCharge >= 0.80, `expected 2nd-ring charge >= 0.80 at 16m, got ${midCharge}`);

  // Verify live combat call at dist = 16m does NOT release prematurely at charge = 0.45
  const actor = {
    id: 4,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: false, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.45, cooldown: 0 },
  };
  const move = makeMove(0, 1);
  const brain = { react: 0, strafeS: 0.5, target: { form: 'human' } };
  const aim = applyStringerCombat(brain, {}, actor, 1 / 60, move, {
    family: 'stringer', dist: 16, range: 25, dx: 0, dz: 16,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.01, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'Tri-Stringer must keep charging past 0.45 at 16m');
  assert.ok(aim && aim.wantPitch > 0, 'applies positive ballistic arc pitch at 16m');
  assert.equal(aim.wantYaw, 0.01, 'preserves natural aimError in wantYaw without zeroing it');

  // Consecutive combat tick reuses the same aim output object (zero allocation)
  const aim2 = applyStringerCombat(brain, {}, actor, 1 / 60, move, {
    family: 'stringer', dist: 16, range: 25, dx: 0, dz: 16,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.01, wantPitch: 0,
  });
  assert.equal(aim2, aim, 'reuses aim output object across ticks');
});

test('LACT-450 uses quick 1st-ring at close range (< 6.5m) and full charge at mid-long range (>= 10.5m)', () => {
  const w = makeLactWeapon();
  assert.ok(computeStringerCombatCharge(w, 5.0, 15, 'short') <= 0.45);
  assert.ok(computeStringerCombatCharge(w, 12.0, 15, 'short') >= 0.94);

  // At 12m, LACT-450 must NOT release at 0.40 (which only reaches ~9m)
  const actor = {
    id: 5,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: false, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.40, cooldown: 0 },
  };
  applyStringerCombat({ react: 0, target: { form: 'human' } }, {}, actor, 1 / 60, makeMove(), {
    family: 'stringer', dist: 12, range: 15, dx: 0, dz: 12,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'LACT-450 keeps charging past 0.40 at 12m');
});

test('LACT-450 leverages no-air-deceleration to jump-charge earlier than Tri-Stringer', () => {
  // At 12m, charge=0.68 (target ~0.96): LACT-450 has no airborne charge penalty so it initiates
  // jump full-charge early, while Tri-Stringer stays grounded until late in the 2nd ring.
  const lactActor = {
    id: 11,
    weapon: makeLactWeapon(),
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.68, cooldown: 0 },
  };
  applyStringerCombat({ react: 0, target: { form: 'human' }, _stringerJumpCd: 0 }, {}, lactActor, 1 / 60, makeMove(), {
    family: 'stringer', dist: 12, range: 15, dx: 0, dz: 12,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(lactActor.intent.jump, true, 'LACT-450 jumps early during charge with zero airborne slowdown');

  const triActor = {
    id: 11,
    weapon: makeTriStringerWeapon(),
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.68, cooldown: 0 },
  };
  applyStringerCombat({ react: 0, target: { form: 'human' }, _stringerJumpCd: 0 }, {}, triActor, 1 / 60, makeMove(), {
    family: 'stringer', dist: 18, range: 25, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(triActor.intent.jump, false, 'Tri-Stringer stays grounded at 0.68 to avoid airborne charge penalty');
});

test('Wellstring V uses tight 1st-ring 5-arrow intercept (< 13.5m) and grounded long-range horizontal bombardment (>= 17.5m)', () => {
  const w = makeWellstringWeapon();
  const midClose = computeStringerCombatCharge(w, 11.0, 23, 'explosion');
  assert.ok(midClose >= 0.50 && midClose <= 0.58, `expected tight 1st-ring explosive cluster, got ${midClose}`);

  const far = computeStringerCombatCharge(w, 19.0, 23, 'explosion');
  assert.ok(far >= 0.94, `expected full-charge 5-arrow barrage at 19m, got ${far}`);

  // At 12m (1st-ring intercept), Wellstring V jumps right before release vs upright humanoid
  const interceptActor = {
    id: 12,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.48, cooldown: 0 },
  };
  applyStringerCombat({ react: 0, target: { form: 'human' }, _stringerJumpCd: 0 }, {}, interceptActor, 1 / 60, makeMove(), {
    family: 'stringer', dist: 12, range: 23, dx: 0, dz: 12,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(interceptActor.intent.jump, true, 'Wellstring V aligns tight 1st-ring 5-arrow intercept vertically');

  // At 19m (long-range -12 deg wide bombardment), Wellstring V stays grounded for horizontal carpet
  const bombardActor = {
    id: 12,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.90, cooldown: 0 },
  };
  applyStringerCombat({ react: 0, target: { form: 'human' }, _stringerJumpCd: 0 }, {}, bombardActor, 1 / 60, makeMove(), {
    family: 'stringer', dist: 19, range: 23, dx: 0, dz: 19,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(bombardActor.intent.jump, false, 'Wellstring V stays grounded for wide horizontal 5-arrow bombardment at 19m');
});

test('Combat triggers jump vertical shot right before release against humanoid targets, but stays grounded vs squid or fast strafer', () => {
  const w = makeTriStringerWeapon();
  const move = makeMove(0, 1);

  // Upright stationary humanoid enemy at 18m with charge 0.88: jumps for vertical shot
  const actorHuman = {
    id: 13,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.88, cooldown: 0 },
  };
  const brainHuman = { react: 0, target: { form: 'human', vel: { x: 0, z: 0 } }, _stringerJumpCd: 0 };
  applyStringerCombat(brainHuman, {}, actorHuman, 1 / 60, move, {
    family: 'stringer', dist: 18, range: 25, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actorHuman.intent.jump, true, 'jumps right before release for vertical 3-arrow line vs humanoid');

  // Swimming squid enemy: stays grounded for horizontal fan
  const actorSquid = {
    id: 13,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.88, cooldown: 0 },
  };
  const brainSquid = { react: 0, target: { form: 'squid' }, _stringerJumpCd: 0 };
  applyStringerCombat(brainSquid, {}, actorSquid, 1 / 60, move, {
    family: 'stringer', dist: 18, range: 25, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actorSquid.intent.jump, false, 'keeps grounded horizontal shot against swimming squid');

  // Fast lateral strafer (vx = 4.2 perpendicular to dz = 18): stays grounded for horizontal fan
  const actorStrafe = {
    id: 13,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.88, cooldown: 0 },
  };
  const brainStrafe = { react: 0, target: { form: 'human', vel: { x: 4.2, z: 0 } }, _stringerJumpCd: 0 };
  applyStringerCombat(brainStrafe, {}, actorStrafe, 1 / 60, move, {
    family: 'stringer', dist: 18, range: 25, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actorStrafe.intent.jump, false, 'stays grounded for horizontal coverage against fast lateral strafer');
});

test('Enemy motion responsiveness: shortens charge against rushers while respecting explosive floor', () => {
  const well = makeWellstringWeapon();
  const steady = computeStringerCombatCharge(well, 14.5, 23, 'explosion', 0, 0, 0);
  const rushed = computeStringerCombatCharge(well, 14.5, 23, 'explosion', 4.0, 0, 0);
  assert.ok(rushed < steady, `expected faster 1st-ring intercept when rushed (${rushed} < ${steady})`);
  assert.ok(rushed >= 0.525, `must stay above Wellstring explosive floor, got ${rushed}`);

  const tri = makeTriStringerWeapon();
  const triSteady = computeStringerCombatCharge(tri, 13.0, 25, 'normal', 0, 0, 0);
  const triRushed = computeStringerCombatCharge(tri, 13.0, 25, 'normal', 4.0, 0, 0);
  assert.ok(triRushed < triSteady, `Tri-Stringer releases earlier when rushed (${triRushed} < ${triSteady})`);
  assert.ok(triRushed >= 30 / 72 + 0.025, `Tri-Stringer preserves explosive floor, got ${triRushed}`);
});

test('Tri-Stringer kites backward when rushed inside close range (< 11.5m)', () => {
  const w = makeTriStringerWeapon();
  const move = makeMove(0, 1); // initially walking toward enemy (+z)
  const actor = {
    id: 14,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: false, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.30, cooldown: 0 },
  };
  applyStringerCombat({ react: 0, strafeS: 0.4, target: { form: 'human' } }, {}, actor, 1 / 60, move, {
    family: 'stringer', dist: 7.0, range: 25, dx: 0, dz: 7.0,
    enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.ok(move.z < 0, `expected backward kite move.z < 0, got ${move.z}`);
});

test('Explosive Stringer lobs cover-zoning bolt at lastSeenPos shortly after LOS break and cancels stale charge', () => {
  const w = makeTriStringerWeapon();
  const move = makeMove(0, 1);

  // Just lost LOS (0.3s) with full charge ready -> releases explosive bolt with arched pitch
  // Also attach a getter trap on target.vel to verify zero wallhack when !enemyVisible
  let velAccessed = false;
  const hiddenTarget = {
    form: 'human',
    get vel() {
      velAccessed = true;
      return { x: 3, z: -3 };
    },
  };
  const actor = {
    id: 15,
    weapon: w,
    grounded: true,
    groundTeam: 1,
    intent: { fire: true, squid: false, jump: false },
    weaponRunner: { charging: true, charge: 0.95, cooldown: 0 },
  };
  const aim = applyStringerCombat({ target: hiddenTarget, lostTimer: 0.3 }, {}, actor, 1 / 60, move, {
    family: 'stringer', dist: 16, range: 25, dx: 0, dz: 16,
    enemyVisible: false, aimed: true, off: 0.04, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(velAccessed, false, 'must never read target.vel when enemy is not visible (no wallhack)');
  assert.equal(actor.intent.fire, false, 'releases explosive zoning shot toward lastSeenPos');
  assert.ok(aim && aim.wantPitch > 0.04, 'adds extra lob angle to clear cover');

  // Stale LOS loss (>= 0.85s) -> cancels wasted charge cleanly
  actor.weaponRunner.charge = 0.50;
  actor.intent.fire = true;
  applyStringerCombat({ target: hiddenTarget, lostTimer: 1.0 }, {}, actor, 1 / 60, move, {
    family: 'stringer', dist: 16, range: 25, dx: 0, dz: 16,
    enemyVisible: false, aimed: false, off: 0.2, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'cancels wasted charge after prolonged LOS loss');
});

test('stringerMicroNoise produces bounded deterministic non-constant variation in [-1, 1]', () => {
  const vals = new Set();
  for (let i = 0; i < 16; i++) {
    const v = stringerMicroNoise(42, i, 7);
    assert.ok(v >= -1 && v <= 1, `noise out of range: ${v}`);
    vals.add(v);
  }
  assert.ok(vals.size >= 12, 'expected varied non-periodic micro-noise across shots');
  assert.equal(stringerMicroNoise(42, 5, 7), stringerMicroNoise(42, 5, 7), 'deterministic for same seed/step');
});

test('computeStringerArcPitch returns 0 at close range and bounded positive elevation at long range', () => {
  assert.equal(computeStringerArcPitch(5.0, 0.5, 'normal'), 0);
  const farArc = computeStringerArcPitch(22.0, 1.0, 'normal');
  assert.ok(farArc > 0.04 && farArc <= 0.13, `expected bounded arc pitch, got ${farArc}`);
});
