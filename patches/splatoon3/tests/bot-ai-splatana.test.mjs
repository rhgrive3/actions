import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPLATANA_PROFILES,
  isSplatanaWeapon,
  resolveSplatanaProfile,
  applySplatanaTurfPaint,
  applySplatanaCombat,
} from '../runtime/bot-ai-splatana.mjs';

function makeMove(x = 0, z = 1) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  };
}

function makeSplatanaActor(id = 's3-saber-normal', sourceMainActor = 'WeaponSaberNormal', overrides = {}) {
  return {
    id: 1,
    team: 0,
    hp: 100,
    grounded: true,
    groundTeam: 1,
    aimYaw: 0,
    aimPitch: 0,
    pos: { x: 0, y: 0, z: 0 },
    weapon: {
      id,
      sourceMainActor,
      range: id === 's3-saber-normal' ? 16.5 : id === 's3-saber-lite' ? 13.0 : 14.5,
      sub: id === 's3-saber-normal' ? 'burst' : id === 's3-saber-lite' ? 'torpedo' : 'suction',
      catalogRecord: { family: 'splatana', sourceActor: sourceMainActor },
    },
    intent: { fire: false, squid: false, sub: false, special: false, jump: false },
    _prevIntent: { fire: false },
    weaponRunner: {
      cooldown: 0,
      charging: false,
      charge: 0,
      catalogState: { pending: false, melee: false, saberReserve: null },
    },
    ...overrides,
  };
}

function makeCombatCtx(overrides = {}) {
  return {
    family: 'splatana',
    dist: 11.0,
    range: 16.5,
    dx: 0,
    dz: 11.0,
    enemyVisible: true,
    aimed: true,
    off: 0.02,
    inkFrac: 0.85,
    idealYaw: 0,
    idealPitch: 0,
    wantYaw: 0.03,
    wantPitch: -0.01,
    ...overrides,
  };
}

test('resolves exact archetype profiles for Stamper, Wiper, and Decavitator and ignores non-splatanas', () => {
  assert.equal(isSplatanaWeapon({ catalogRecord: { family: 'shooter' }, id: 's3-shooter-normal' }), false);
  assert.equal(isSplatanaWeapon({ catalogRecord: { family: 'splatana' }, id: 's3-saber-normal' }), true);

  assert.equal(resolveSplatanaProfile({ id: 's3-saber-normal', sourceMainActor: 'WeaponSaberNormal' }).archetype, 'normal');
  assert.equal(resolveSplatanaProfile({ id: 's3-saber-lite', sourceMainActor: 'WeaponSaberLite' }).archetype, 'lite');
  assert.equal(resolveSplatanaProfile({ id: 's3-saber-heavy', sourceMainActor: 'WeaponSaberHeavy' }).archetype, 'heavy');
  assert.ok(SPLATANA_PROFILES.heavy.stepMax > SPLATANA_PROFILES.normal.stepMax);

  const shooter = { weapon: { kind: 'shooter', id: 'shooter' }, intent: { fire: true }, weaponRunner: { cooldown: 0 } };
  assert.equal(applySplatanaTurfPaint({}, {}, shooter, 1 / 60, makeMove(), true, 0, 0.8, {}), null);
  assert.equal(applySplatanaCombat({}, {}, shooter, 1 / 60, makeMove(), makeCombatCtx({ family: 'shooter' })), null);
});

test('turf paint drives fast horizontal tap-slashes with lateral crab-walk and respects reserve window', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const brain = { t: 1.0, paintPause: 0.35, _turfPaintLatch: true, _turfPaintValidated: true };
  const move = makeMove(0, 1);

  // Frame 1: idle & ready -> presses fire to start horizontal slash, clears paintPause, adds lateral crab-walk
  applySplatanaTurfPaint(brain, {}, actor, 1 / 60, move, true, 0, 0.8, { needPaint: true, pitchReady: true });
  assert.equal(actor.intent.fire, true, 'starts horizontal slash press');
  assert.equal(brain.paintPause, 0, 'clears legacy paintPause stall');
  assert.ok(Math.abs(move.x) > 0.15, 'applies lateral crab-walk strafe during paint');

  // Frame 2: charging at minimal charge (0.05) -> immediately releases to emit horizontal wave
  actor._prevIntent.fire = true;
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 0.05;
  applySplatanaTurfPaint(brain, {}, actor, 1 / 60, move, true, 0, 0.8, { needPaint: true, pitchReady: true });
  assert.equal(actor.intent.fire, false, 'releases immediately for fast horizontal turf slash');

  // Frame 3: inside ReserveAcceptFrame (11F = 0.183s) with fresh rising edge -> reserves next horizontal slash
  actor._prevIntent.fire = false;
  actor.weaponRunner.charging = false;
  actor.weaponRunner.charge = 0;
  actor.weaponRunner.cooldown = 0.12;
  applySplatanaTurfPaint(brain, {}, actor, 1 / 60, move, true, 0, 0.8, { needPaint: true, pitchReady: true });
  assert.equal(actor.intent.fire, true, 'uses saberReserve window for zero-gap turf slashing');
});

test('turf paint uses occasional vertical path-charge on Stamper/Wiper but keeps Decavitator on horizontal slashes', () => {
  const stamper = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal', { groundTeam: 2 });
  const brain = {
    t: 2.0, paintPause: 0, _turfPaintLatch: true, _turfPaintValidated: true,
    _pathRemaining: () => 14,
  };
  brain._splatanaAI = { plan: 'idle', comboFollowupT: 0, chargeHoldT: 0, wasCharging: false, lastCharge: 0, turfPathCharge: false, turfSwingCount: 3, aimOut: { wantYaw: 0, wantPitch: 0 } };
  const move = makeMove(0, 1);
  applySplatanaTurfPaint(brain, {}, stamper, 1 / 60, move, true, 0, 0.75, { needPaint: true, pitchReady: true });
  assert.equal(stamper.intent.fire, true);
  assert.equal(brain._splatanaAI.turfPathCharge, false, 'Stamper stays on rapid horizontal slashes for maximum turf rate');

  // When a path charge is active, holds until full charge and suppresses forward step on release
  brain._splatanaAI.turfPathCharge = true;
  stamper.weaponRunner.charging = true;
  stamper.weaponRunner.charge = 0.5;
  applySplatanaTurfPaint(brain, {}, stamper, 1 / 60, move, true, 0, 0.70, { needPaint: true, pitchReady: true });
  assert.equal(stamper.intent.fire, true, 'holds path-carving charge until full');

  // At 100% charge, releases and suppresses forward step so post-swing lag stays minimal
  stamper.weaponRunner.charge = 1.0;
  move.set(0, 0, 1);
  applySplatanaTurfPaint(brain, {}, stamper, 1 / 60, move, true, 0, 0.65, { needPaint: true, pitchReady: true });
  assert.equal(stamper.intent.fire, false, 'releases full vertical path slash');
  assert.ok(move.z < 0.85, 'suppresses accidental step-lunge on turf path slash');

  // Decavitator must NOT use vertical path-charge in turf mode
  const heavy = makeSplatanaActor('s3-saber-heavy', 'WeaponSaberHeavy', { groundTeam: 2 });
  const heavyBrain = {
    t: 2.0, paintPause: 0, _turfPaintLatch: true, _turfPaintValidated: true,
    _pathRemaining: () => 14,
    _splatanaAI: { plan: 'idle', comboFollowupT: 0, chargeHoldT: 0, wasCharging: false, lastCharge: 0, turfPathCharge: false, turfSwingCount: 3, aimOut: { wantYaw: 0, wantPitch: 0 } },
  };
  applySplatanaTurfPaint(heavyBrain, {}, heavy, 1 / 60, makeMove(0, 1), true, 0, 0.75, { needPaint: true, pitchReady: true });
  assert.equal(heavyBrain._splatanaAI.turfPathCharge, false, 'Decavitator stays on high-density horizontal turf slashes');
});

test('combat Stamper executes full-charge vertical slash -> horizontal cross-slash combo without cancelling mid-charge', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const brain = { react: 0, strafeS: 0.7, seeTimer: 1.2, bombCd: 5 };
  const move = makeMove(0, 1);

  // Mid range (10m): starts charging vertical slash (70 dmg)
  applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 10.0, dz: 10.0 }));
  assert.equal(actor.intent.fire, true, 'starts charging vertical slash at 10m');

  // Enemy steps closer to 7m while at 55% charge -> MUST commit to full charge (no Round 1 cancel bug!)
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 0.55;
  applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 7.0, dz: 7.0 }));
  assert.equal(actor.intent.fire, true, 'commits to vertical charge instead of cancelling into weak horizontal');

  // Full charge reached (1.0) at 8m -> releases non-stepped vertical slash (dot(move, aim) < 0.85)
  actor.weaponRunner.charge = 1.0;
  move.set(0, 0, 1);
  applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 8.0, dz: 8.0 }));
  assert.equal(actor.intent.fire, false, 'releases full-charge vertical slash');
  assert.ok(move.z < 0.85, 'suppresses accidental step-lunge at mid range');

  // Next tick: vertical slash released -> transitions into cross-slash horizontal follow-up (35 dmg -> 105 total!)
  actor.weaponRunner.charging = false;
  actor.weaponRunner.charge = 0;
  actor.weaponRunner.cooldown = 0;
  actor._prevIntent.fire = false;
  applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 8.0, dz: 8.0 }));
  assert.equal(brain._splatanaAI.plan, 'combo_followup', 'enters horizontal cross-slash follow-up window');
  assert.equal(actor.intent.fire, true, 'immediately presses horizontal follow-up slash');
});

test('combat Stamper chains Burst Bomb quick-combo after vertical slash when ink and cooldown allow', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const brain = { react: 0, strafeS: 0.5, seeTimer: 1.2, bombCd: 0 };
  const move = makeMove(0, 1);

  // Simulate full charge release on previous tick
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 1.0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 9.0, dz: 9.0 }));
  assert.equal(actor.intent.fire, false);

  // Next tick after release: Burst Bomb (sub === 'burst') throws for 70 + 35..60 lethal quick-combo
  actor.weaponRunner.charging = false;
  actor.weaponRunner.charge = 0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 9.0, dz: 9.0, inkFrac: 0.72 }));
  assert.equal(actor.intent.sub, true, 'throws Burst Bomb for vertical + quick-bomb lethal combo');
  assert.equal(actor.intent.fire, false);
});

test('combat prevents full-charge deadlock when aimed stays false beyond hold cap', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 1.0;
  const brain = { react: 0, strafeS: 0.6, seeTimer: 1.2 };
  const move = makeMove(0, 1);

  let released = false;
  for (let i = 0; i < 25; i++) {
    applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({
      dist: 12.0, dz: 12.0, aimed: false, off: 0.35,
    }));
    if (!actor.intent.fire) {
      released = true;
      break;
    }
  }
  assert.equal(released, true, 'force-releases full charge within bounded hold time instead of deadlocking');
});

test('combat deliberately triggers forward-step 1-shot in lunge band and suppresses pass-through at point-blank', () => {
  // Stamper at 3.2m (inside stepMin=1.6..stepMax=4.5): pushes move straight forward (dot >= 0.9) on release
  const stamper = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  stamper.weaponRunner.charging = true;
  stamper.weaponRunner.charge = 0.90;
  const brain = { react: 0, strafeS: 0.8, seeTimer: 1.2 };
  const move = makeMove(1, 0);
  applySplatanaCombat(brain, {}, stamper, 1 / 60, move, makeCombatCtx({ dist: 3.2, dx: 0, dz: 3.2 }));
  assert.equal(brain._splatanaAI.plan, 'step_slash');
  assert.ok(move.z >= 0.95, 'steers move straight toward target to trigger saberStepRequested (threshold 0.9)');

  // Decavitator at 1.2m (< stepMin=2.2): must NOT step-lunge past the enemy
  const heavy = makeSplatanaActor('s3-saber-heavy', 'WeaponSaberHeavy');
  heavy.weaponRunner.charging = true;
  heavy.weaponRunner.charge = 0.95;
  const heavyBrain = { react: 0, strafeS: 0.8, seeTimer: 1.2 };
  const heavyMove = makeMove(0, 1);
  applySplatanaCombat(heavyBrain, {}, heavy, 1 / 60, heavyMove, makeCombatCtx({ dist: 1.2, dx: 0, dz: 1.2 }));
  assert.equal(heavyBrain._splatanaAI.plan, 'charge_slash', 'uses stationary vertical slash at point-blank');
  assert.ok(heavyMove.z < 0.85, 'suppresses step-lunge at point-blank to prevent passing through enemy');
});

test('combat Wiper (lite) uses rapid horizontal slashes up close and full-charge slashes at range', () => {
  const wiper = makeSplatanaActor('s3-saber-lite', 'WeaponSaberLite');
  const brain = { react: 0, strafeS: 0.8, seeTimer: 1.2 };
  const move = makeMove(0, 1);

  // Close-mid (6.0m <= 8.8m): fast horizontal slash pressure
  applySplatanaCombat(brain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 6.0, dz: 6.0, range: 13.0 }));
  assert.equal(brain._splatanaAI.plan, 'horiz_spam');
  assert.equal(wiper.intent.fire, true);

  // Long range (13.5m > 8.8m): full-charge vertical slash
  wiper._prevIntent.fire = false;
  applySplatanaCombat(brain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 13.5, dz: 13.5, range: 13.0 }));
  assert.equal(brain._splatanaAI.plan, 'charge_slash');
  assert.equal(wiper.intent.fire, true);
});

test('fair-play invariants: preserves human aimError verbatim and never wallhacks hidden enemy velocity', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const move = makeMove(0, 1);
  const humanErrYaw = 0.075;
  const humanErrPitch = -0.025;

  // Visible moving enemy (seeTimer > 1): adds physical lead while keeping exact humanErrYaw/Pitch
  const brain = {
    react: 0, strafeS: 0.5, seeTimer: 1.2,
    target: { vel: { x: 6.0, y: 0, z: 0 } },
  };
  const res = applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({
    dist: 14.0, dx: 0, dz: 14.0,
    idealYaw: 0, idealPitch: 0,
    wantYaw: humanErrYaw, wantPitch: humanErrPitch,
  }));
  assert.ok(res, 'returns lead-adjusted aim for slow vertical wave');
  const withErrYaw = res.wantYaw;
  const withErrPitch = res.wantPitch;
  assert.ok(withErrYaw > humanErrYaw, 'leads positively in direction of enemy +X motion');
  assert.equal(withErrPitch, humanErrPitch, 'preserves human aimPitch error');

  // Verify exact error preservation: compare against zero-error input (copying scalar because aimOut is reused zero-GC)
  const resZeroErr = applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({
    dist: 14.0, dx: 0, dz: 14.0,
    idealYaw: 0, idealPitch: 0,
    wantYaw: 0, wantPitch: 0,
  }));
  assert.ok(Math.abs((withErrYaw - resZeroErr.wantYaw) - humanErrYaw) < 1e-6, 'human aimError offset is 100% preserved');

  // Hidden enemy (seeTimer <= 1): must NOT read target.vel
  brain.seeTimer = 0.8;
  const resHidden = applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({
    dist: 14.0, dx: 0, dz: 14.0,
    idealYaw: 0, idealPitch: 0,
    wantYaw: humanErrYaw, wantPitch: humanErrPitch,
  }));
  assert.equal(resHidden, null, 'does not read live enemy velocity when LOS is not active');
});

test('multi-frame simulation verifies Stamper lands repeated Charge -> Horizontal cross-slash combos', () => {
  // Simulates catalogue main-weapon-catalog.mjs charge/release timing for s3-saber-normal (20F full charge, 22F/26F cooldown)
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const brain = { react: 0, strafeS: 0.7, seeTimer: 1.2, bombCd: 99 };
  const move = makeMove(0, 1);

  let chargeF = 0;
  let verticalEmits = 0;
  let horizontalEmits = 0;
  let crossSlashPairs = 0;
  let lastEmit = '';
  const dt = 1 / 60;

  for (let frame = 0; frame < 180; frame++) {
    const wr = actor.weaponRunner;
    wr.cooldown = Math.max(0, wr.cooldown - dt);

    applySplatanaCombat(brain, {}, actor, dt, move, makeCombatCtx({ dist: 10.5, dz: 10.5 }));

    const fire = actor.intent.fire;
    if (fire && wr.cooldown <= 1e-6) {
      chargeF = Math.min(20, chargeF + 1);
      wr.charging = true;
      wr.charge = chargeF / 20;
    } else if (chargeF > 0 && !fire) {
      const isVertical = chargeF >= 20;
      if (isVertical) {
        verticalEmits++;
        wr.cooldown = 22 / 60;
        lastEmit = 'V';
      } else {
        horizontalEmits++;
        wr.cooldown = 26 / 60;
        if (lastEmit === 'V') crossSlashPairs++;
        lastEmit = 'H';
      }
      chargeF = 0;
      wr.charging = false;
      wr.charge = 0;
    }
    actor._prevIntent.fire = fire;
  }

  assert.ok(verticalEmits >= 2, `expected >=2 vertical slashes in 3s, got ${verticalEmits}`);
  assert.ok(horizontalEmits >= 2, `expected >=2 horizontal follow-up slashes in 3s, got ${horizontalEmits}`);
  assert.ok(crossSlashPairs >= 2, `expected >=2 Charge->Horizontal cross-slash combos in 3s, got ${crossSlashPairs}`);
});

test('hysteresis prevents mechanical plan thrashing across Wiper horiz and Decavitator lunge boundaries', () => {
  // Wiper: enters horiz_spam at 8.5m (<= 8.8m) and stays in horiz_spam at 9.3m (<= 8.8 + 0.9 = 9.7m)
  const wiper = makeSplatanaActor('s3-saber-lite', 'WeaponSaberLite');
  const wBrain = { react: 0, strafeS: 0.5, seeTimer: 1.2 };
  const move = makeMove(0, 1);

  applySplatanaCombat(wBrain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 8.5, dz: 8.5, range: 13.0 }));
  assert.equal(wBrain._splatanaAI.plan, 'horiz_spam', 'enters horiz_spam inside 8.8m');

  applySplatanaCombat(wBrain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 9.3, dz: 9.3, range: 13.0 }));
  assert.equal(wBrain._splatanaAI.plan, 'horiz_spam', 'hysteresis holds horiz_spam at 9.3m without thrashing');

  applySplatanaCombat(wBrain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 10.2, dz: 10.2, range: 13.0 }));
  assert.equal(wBrain._splatanaAI.plan, 'charge_slash', 'exits horiz_spam cleanly past 9.7m');

  // Decavitator: enters step_slash at 6.5m (<= 6.8m) and holds through 7.1m (<= 6.8 + 0.55 = 7.35m)
  const heavy = makeSplatanaActor('s3-saber-heavy', 'WeaponSaberHeavy');
  const hBrain = { react: 0, strafeS: 0.4, seeTimer: 1.2 };
  applySplatanaCombat(hBrain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 6.5, dz: 6.5, range: 14.5 }));
  assert.equal(hBrain._splatanaAI.plan, 'step_slash', 'enters Decavitator long-lunge band at 6.5m');

  applySplatanaCombat(hBrain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 7.1, dz: 7.1, range: 14.5 }));
  assert.equal(hBrain._splatanaAI.plan, 'step_slash', 'hysteresis holds lunge band at 7.1m');

  applySplatanaCombat(hBrain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 7.6, dz: 7.6, range: 14.5 }));
  assert.equal(hBrain._splatanaAI.plan, 'charge_slash', 'exits lunge band cleanly past 7.35m');
});

test('Stamper kites backward diagonally while charging at mid-close range ("中距離引きタメ斬り")', () => {
  const stamper = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  stamper.weaponRunner.charging = true;
  stamper.weaponRunner.charge = 0.68;
  const brain = { react: 0, strafeS: 0.6, seeTimer: 1.2 };
  const move = makeMove(0, 1);

  applySplatanaCombat(brain, {}, stamper, 1 / 60, move, makeCombatCtx({ dist: 7.0, dx: 0, dz: 7.0 }));
  assert.equal(brain._splatanaAI.plan, 'charge_slash');
  assert.ok(move.z < 0, `expected Stamper to kite backward while charging at 7m, got move.z=${move.z}`);
  assert.ok(Math.abs(move.x) > 0.3, `expected diagonal lateral strafe during kiting, got move.x=${move.x}`);
});

test('Wiper uses lively crab-walk strafing, agile closing-in, and early 14F step-suppression', () => {
  const wiper = makeSplatanaActor('s3-saber-lite', 'WeaponSaberLite');
  const brain = { react: 0, seeTimer: 1.2 };
  const move = makeMove(0, 1);

  // Agile closing-in at 11.0m (between 8.8m and 12.8m) while not charging
  applySplatanaCombat(brain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 11.0, dx: 0, dz: 11.0, range: 13.0 }));
  assert.ok(move.z > 0.15, `expected Wiper to weave forward at 11m, got move.z=${move.z}`);
  assert.ok(Math.abs(move.x) > 0.3, `expected lateral crab-walk while closing in, got move.x=${move.x}`);

  // Fast 14F charge step-suppression kicks in by charge 0.58 (clears full 5F stick ring buffer)
  wiper.weaponRunner.charging = true;
  wiper.weaponRunner.charge = 0.58;
  move.set(0, 0, 1);
  applySplatanaCombat(brain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 11.0, dx: 0, dz: 11.0, range: 13.0 }));
  assert.ok(move.z < 0.80, `expected early step-suppression for 14F Wiper charge, got move.z=${move.z}`);

  // Over 2.5 seconds of close skirmish, Wiper naturally switches lateral strafe direction
  wiper.weaponRunner.charging = false;
  wiper.weaponRunner.charge = 0;
  let seenPosX = false;
  let seenNegX = false;
  for (let i = 0; i < 150; i++) {
    applySplatanaCombat(brain, {}, wiper, 1 / 60, move, makeCombatCtx({ dist: 6.5, dx: 0, dz: 6.5, range: 13.0 }));
    if (move.x > 0.25) seenPosX = true;
    if (move.x < -0.25) seenNegX = true;
  }
  assert.ok(seenPosX && seenNegX, 'expected natural left/right crab-walk direction switches over 2.5s');
});

test('Decavitator executes 80+40 combo, long 5.5m lunge ambush, and ink-economy squid recovery', () => {
  // 1. Long 5.5m lunge ambush at 5.8m commits straight forward on late charge
  const heavy = makeSplatanaActor('s3-saber-heavy', 'WeaponSaberHeavy');
  const brain = { react: 0, strafeS: 0.3, seeTimer: 1.2 };
  const move = makeMove(1, 0);
  heavy.weaponRunner.charging = true;
  heavy.weaponRunner.charge = 0.80;
  applySplatanaCombat(brain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 5.8, dx: 0, dz: 5.8, range: 14.5 }));
  assert.equal(brain._splatanaAI.plan, 'step_slash');
  assert.ok(move.z >= 0.95, 'Decavitator commits straight forward for 5.5m lunge ambush');

  // 2. Just outside lunge reach (8.0m) with healthy ink -> closes in aggressively to threaten lunge
  heavy.weaponRunner.charging = false;
  heavy.weaponRunner.charge = 0;
  brain._splatanaAI.inStepBand = false;
  applySplatanaCombat(brain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 8.0, dx: 0, dz: 8.0, range: 14.5, inkFrac: 0.70 }));
  assert.ok(move.z > 0.20, `expected Decavitator to close in from 8m toward 5.5m lunge band, got move.z=${move.z}`);

  // 3. Low ink (0.20 < 0.24) on own ink at safe mid-range (9.5m) -> brief squid ink recovery with hysteresis
  applySplatanaCombat(brain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 9.5, dx: 0, dz: 9.5, range: 14.5, inkFrac: 0.20 }));
  assert.equal(brain._splatanaAI.plan, 'ink_recover', 'enters squid ink recovery on low ink');
  assert.equal(heavy.intent.squid, true);
  assert.equal(heavy.intent.fire, false);

  // Stays recovering at 0.34 (< 0.44 exit threshold), then resumes combat at 0.48
  applySplatanaCombat(brain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 9.5, dx: 0, dz: 9.5, range: 14.5, inkFrac: 0.34 }));
  assert.equal(brain._splatanaAI.plan, 'ink_recover', 'hysteresis holds ink recovery until 44% ink');
  applySplatanaCombat(brain, {}, heavy, 1 / 60, move, makeCombatCtx({ dist: 9.5, dx: 0, dz: 9.5, range: 14.5, inkFrac: 0.48 }));
  assert.equal(brain._splatanaAI.plan, 'charge_slash', 'resumes charged slash once ink recovered');

  // 4. Multi-frame 80+40 combo simulation (20F charge, 32F charge cooldown, 30F horiz cooldown)
  const simActor = makeSplatanaActor('s3-saber-heavy', 'WeaponSaberHeavy');
  const simBrain = { react: 0, strafeS: 0.4, seeTimer: 1.2, bombCd: 99 };
  const simMove = makeMove(0, 1);
  let chargeF = 0;
  let chargedEmits = 0;
  let horizEmits = 0;
  let comboPairs = 0;
  let lastEmit = '';
  const dt = 1 / 60;

  for (let frame = 0; frame < 240; frame++) {
    const wr = simActor.weaponRunner;
    wr.cooldown = Math.max(0, wr.cooldown - dt);
    applySplatanaCombat(simBrain, {}, simActor, dt, simMove, makeCombatCtx({ dist: 10.5, dz: 10.5, range: 14.5 }));
    const fire = simActor.intent.fire;
    if (fire && wr.cooldown <= 1e-6) {
      chargeF = Math.min(20, chargeF + 1);
      wr.charging = true;
      wr.charge = chargeF / 20;
    } else if (chargeF > 0 && !fire) {
      if (chargeF >= 20) {
        chargedEmits++;
        wr.cooldown = 32 / 60;
        lastEmit = 'C';
      } else {
        horizEmits++;
        wr.cooldown = 30 / 60;
        if (lastEmit === 'C') comboPairs++;
        lastEmit = 'H';
      }
      chargeF = 0;
      wr.charging = false;
      wr.charge = 0;
    }
    simActor._prevIntent.fire = fire;
  }

  assert.ok(chargedEmits >= 2, `expected >=2 Decavitator 80-dmg charged slashes in 4s, got ${chargedEmits}`);
  assert.ok(horizEmits >= 2, `expected >=2 Decavitator 40-dmg horizontal follow-ups in 4s, got ${horizEmits}`);
  assert.ok(comboPairs >= 2, `expected >=2 Decavitator 80+40 combo pairs in 4s, got ${comboPairs}`);
});

test('resolveSplatanaProfile caches custom catalogue profiles O(1) without per-tick allocation', () => {
  const customWeapon = {
    id: 's3-saber-normal',
    sourceMainActor: 'WeaponSaberNormal',
    catalogRecord: {
      family: 'splatana',
      parameters: {
        spl__WeaponSaberParam: { SwingParam: { ReserveAcceptFrame: 12, ChargeSwingShotBulletFrame: 7 } },
        BulletSaberVerticalParam: { MoveParam: { SpawnSpeed: 0.85 } },
        BulletSaberHorizontalParam: { MoveParam: { SpawnSpeed: 2.9 } },
      },
    },
  };
  const p1 = resolveSplatanaProfile(customWeapon);
  const p2 = resolveSplatanaProfile(customWeapon);
  assert.strictEqual(p1, p2, 'returns cached profile instance with zero per-tick allocation');
  assert.equal(p1.vertSpeed, 0.85 * 60);
});

test('Splatana guards against dead, superJumpState, climbing, specialActive/it.special and avoids post-special ghost combo', () => {
  for (const stateOverride of [
    { alive: false },
    { superJumpState: { phase: 'charge' } },
    { climbing: true },
    { specialActive: { id: 'zipcaster' } },
  ]) {
    const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal', stateOverride);
    const move = makeMove(0, 1);
    const brain = { react: 0, strafeS: 0.5, seeTimer: 1.2, _turfPaintLatch: true, _turfPaintValidated: true };
    assert.equal(applySplatanaCombat(brain, {}, actor, 1 / 60, move, makeCombatCtx({ dist: 10, dz: 10 })), null);
    assert.equal(actor.intent.fire, false);
    assert.equal(applySplatanaTurfPaint(brain, {}, actor, 1 / 60, move, true, 0, 0.8, { needPaint: true, pitchReady: true }), null);
    assert.equal(actor.intent.fire, false);
  }

  // Pre-special full charge cancelled by special must NOT trigger ghost combo_followup after special ends
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const brain = { react: 0, strafeS: 0.5, seeTimer: 1.2, bombCd: 0 };
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 1.0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0 }));
  // Special activates and cancels charge
  actor.specialActive = { id: 'zipcaster' };
  actor.weaponRunner.charging = false;
  actor.weaponRunner.charge = 0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0 }));
  // Special ends
  actor.specialActive = null;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0 }));
  assert.equal(actor.intent.sub, false, 'does not fire ghost Burst Bomb from pre-special charge');
  assert.notEqual(brain._splatanaAI.plan, 'combo_followup');
});

test('Splatana yields on sub-weapon input conflicts (it.sub / _bombAim / aimingSub) and active cs.melee', () => {
  for (const [intentSub, bombAim, aimingSub] of [[true, false, false], [false, true, false], [false, false, true]]) {
    const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
    actor.intent.sub = intentSub;
    actor.intent.fire = true;
    actor.intent.squid = true;
    actor.weaponRunner.aimingSub = aimingSub;
    const brain = { react: 0, _bombAim: bombAim, _turfPaintLatch: true, _turfPaintValidated: true };
    assert.equal(applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9, dz: 9 })), null);
    assert.equal(actor.intent.fire, false);
    assert.equal(actor.intent.squid, false);
    actor.intent.fire = true;
    actor.intent.squid = true;
    assert.equal(applySplatanaTurfPaint(brain, {}, actor, 1 / 60, makeMove(), true, 0, 0.8, { needPaint: true, pitchReady: true }), null);
    assert.equal(actor.intent.fire, false);
    assert.equal(actor.intent.squid, false);
  }

  // Active melee swing hitbox blocks Burst Bomb quick-combo so melee slash is not interrupted
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal');
  const brain = { react: 0, strafeS: 0.5, seeTimer: 1.2, bombCd: 0 };
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 1.0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0 }));
  actor.weaponRunner.charging = false;
  actor.weaponRunner.charge = 0;
  actor.weaponRunner.catalogState.melee = true;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0, inkFrac: 0.75 }));
  assert.equal(actor.intent.sub, false, 'does not throw Burst Bomb while melee hitbox is active');
});

test('Splatana resets stale per-bot state across deaths and netLife respawns', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal', { alive: true, netLife: 1 });
  const brain = { react: 0, strafeS: 0.5, seeTimer: 1.2, bombCd: 0 };

  // Life 1: reaches full charge
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 1.0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0 }));
  assert.equal(brain._splatanaAI.wasCharging, true);

  // Dies and respawns on life 2 with fresh weaponRunner
  actor.netLife = 2;
  actor.weaponRunner.charging = false;
  actor.weaponRunner.charge = 0;
  applySplatanaCombat(brain, {}, actor, 1 / 60, makeMove(), makeCombatCtx({ dist: 9.0, dz: 9.0, inkFrac: 0.8 }));
  assert.equal(actor.intent.sub, false, 'respawned Splatana does not throw ghost Burst Bomb from prior life');
  assert.equal(brain._splatanaAI.comboFollowupT, 0);
  assert.equal(brain._splatanaAI.plan, 'charge_slash');
});

test('Splatana NaN/Infinity guards prevent wrapAngle infinite loop and non-finite aim/move outputs', () => {
  const actor = makeSplatanaActor('s3-saber-normal', 'WeaponSaberNormal', { aimYaw: NaN });
  const move = makeMove(0, 1);
  const brain = { react: 0, strafeS: NaN, seeTimer: 1.2, target: { vel: { x: Infinity, z: NaN } } };

  const res = applySplatanaCombat(brain, {}, actor, Infinity, move, makeCombatCtx({
    dist: NaN, range: NaN, dx: Infinity, dz: NaN, off: NaN,
    inkFrac: 0.8, idealYaw: Infinity, idealPitch: NaN, wantYaw: Infinity, wantPitch: NaN,
  }));
  assert.equal(res, null, 'skips lead override when yaw/vel inputs are non-finite');
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'move stays finite');

  const turfRes = applySplatanaTurfPaint(brain, {}, actor, NaN, move, true, NaN, NaN, {
    needPaint: true, pitchReady: true, wantYaw: NaN,
  });
  assert.equal(turfRes, null, 'skips turf aim override when wantYaw is NaN');
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'turf move stays finite');
});
