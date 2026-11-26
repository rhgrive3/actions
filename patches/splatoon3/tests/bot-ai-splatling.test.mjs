import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPLATLING_ARCHETYPES,
  resolveSplatlingArchetype,
  applySplatlingTurfPaint,
  applySplatlingCombat,
} from '../runtime/bot-ai-splatling.mjs';

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

function makeActor({ id = 1, weapon, wr = {}, groundTeam = 1 } = {}) {
  return {
    id,
    groundTeam,
    weapon,
    weaponRunner: {
      charging: false,
      streaming: false,
      charge: 0,
      cooldown: 0,
      burstFrac: 0,
      ...wr,
    },
    intent: { fire: false, squid: false, jump: false },
  };
}

test('resolveSplatlingArchetype accurately classifies all 6 Splatoon 3 splatlings and fallback', () => {
  assert.equal(resolveSplatlingArchetype({ id: 's3-spinner-quick' }), SPLATLING_ARCHETYPES.quick);
  assert.equal(resolveSplatlingArchetype({ id: 'splatling' }), SPLATLING_ARCHETYPES.standard);
  assert.equal(resolveSplatlingArchetype({ id: 's3-spinner-hyper' }), SPLATLING_ARCHETYPES.hyper);
  assert.equal(resolveSplatlingArchetype({ id: 's3-spinner-downpour' }), SPLATLING_ARCHETYPES.downpour);
  assert.equal(resolveSplatlingArchetype({ id: 's3-spinner-serein' }), SPLATLING_ARCHETYPES.serein);
  assert.equal(resolveSplatlingArchetype({ id: 's3-spinner-hypershort' }), SPLATLING_ARCHETYPES.hypershort);

  assert.equal(resolveSplatlingArchetype({ sourceMainActor: 'WeaponSpinnerQuick' }), SPLATLING_ARCHETYPES.quick);
  assert.equal(resolveSplatlingArchetype({ sourceMainActor: 'WeaponSpinnerStandard' }), SPLATLING_ARCHETYPES.standard);
  assert.equal(resolveSplatlingArchetype({ sourceMainActor: 'WeaponSpinnerHyper' }), SPLATLING_ARCHETYPES.hyper);
  assert.equal(resolveSplatlingArchetype({ sourceMainActor: 'WeaponSpinnerDownpour' }), SPLATLING_ARCHETYPES.downpour);
  assert.equal(resolveSplatlingArchetype({ sourceMainActor: 'WeaponSpinnerSerein' }), SPLATLING_ARCHETYPES.serein);
  assert.equal(resolveSplatlingArchetype({ sourceMainActor: 'WeaponSpinnerHyperShort' }), SPLATLING_ARCHETYPES.hypershort);

  assert.equal(resolveSplatlingArchetype({ id: 'custom-ballpoint-kit' }), SPLATLING_ARCHETYPES.downpour);
  assert.equal(resolveSplatlingArchetype(null), SPLATLING_ARCHETYPES.standard);
});

test('standard splatling paint contract: all 5 non-Ballpoint splatlings hold spin up to >= 0.88 across shots', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const standardIds = [
    's3-spinner-quick',
    'splatling',
    's3-spinner-hyper',
    's3-spinner-serein',
    's3-spinner-hypershort',
  ];

  for (const weaponId of standardIds) {
    const brain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0, t: 0 };
    const actor = makeActor({
      id: 7,
      weapon: { id: weaponId, catalogRecord: { family: 'splatling' } },
      wr: { charging: true, charge: 0.87, cooldown: 0 },
    });

    for (let shot = 0; shot < 8; shot++) {
      brain._splatlingShotCount = shot;
      actor.weaponRunner.charge = 0.87;
      actor.intent.fire = false;
      applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.80, {
        pitchReady: true,
        wantPaintNow: true,
      });
      assert.equal(actor.intent.fire, true, `${weaponId} shot ${shot} must NOT release at 0.87 (< 0.88 contract)`);

      actor.weaponRunner.charge = 1.0;
      applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.80, {
        pitchReady: true,
        wantPaintNow: true,
      });
      assert.equal(actor.intent.fire, false, `${weaponId} shot ${shot} releases at full spin`);
    }
  }
});

test('Ballpoint Splatling paint contract: releases in short-range mode (~0.24) and supports bounded short-mode recharge', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0, t: 0 };
  const actor = makeActor({
    id: 3,
    weapon: { id: 's3-spinner-downpour', sourceMainActor: 'WeaponSpinnerDownpour' },
    wr: { charging: true, charge: 0.18, cooldown: 0 },
  });

  // Below ~0.24: keeps spinning
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.80, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, true, 'Ballpoint holds charge below short-range threshold');

  // At 0.27: releases in short-range mode
  actor.weaponRunner.charge = 0.27;
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.80, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false, 'Ballpoint releases around 0.24 short-range paint contract');

  // Near the end of the 0.50s short-range stream with healthy ink: triggers bounded recharge
  actor.weaponRunner.charging = false;
  actor.weaponRunner.streaming = true;
  actor.weaponRunner.catalogState = { stream: 1, streamElapsed: 0.46, streamTime: 0.65 };
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.75, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, true, 'Ballpoint recharges near 0.50s boundary to maintain short-range paint');
  assert.ok(brain._splatlingRechargeCd > 0, 'recharge sets cooldown to prevent infinite recharge loop');

  // Immediately next frame while cooldown active: does not spam recharge
  actor.intent.fire = false;
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.75, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false, 'cooldown prevents back-to-back recharge spam');
});

test('pitchReady=false contract: holds spin until aimPitch recovers from floor-paint', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: false };
  const actor = makeActor({
    weapon: { catalogRecord: { family: 'splatling' }, id: 'splatling' },
    wr: { charging: true, charge: 0.95, cooldown: 0 },
  });

  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.80, {
    pitchReady: false,
    wantPaintNow: false,
  });
  assert.equal(actor.intent.fire, true, 'splatling holds spin when pitchReady is false');

  brain._turfPaintValidated = true;
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.80, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false, 'splatling releases spin once pitchReady is true');
});

test('Hydra micro-refill hysteresis on own ink and stream-phase lateral strafe', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0, t: 1.0 };
  const actor = makeActor({
    id: 4,
    weapon: { id: 's3-spinner-hyper', sourceMainActor: 'WeaponSpinnerHyper' },
    wr: { charging: false, streaming: false, charge: 0, cooldown: 0 },
    groundTeam: 1,
  });

  // Hydra (35% ink cost) enters micro-refill below 0.34
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.30, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.squid, true, 'Hydra dives into own ink to refill before heavy 35% spin');
  assert.equal(actor.intent.fire, false);

  // Stays in refill until resume threshold (0.64)
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.50, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.squid, true, 'Hydra maintains refill hysteresis until ink recovers');

  // Resumes painting once ink >= 0.64
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.68, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.squid, false);
  assert.equal(actor.intent.fire, true, 'Hydra resumes spinning once ink is replenished');

  // Stream applies lateral strafe to movement vector
  const move = makeMove(0, 1);
  actor.weaponRunner.streaming = true;
  actor.weaponRunner.burstFrac = 0.6;
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.55, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { flankBias: 0.4 },
  });
  assert.ok(Math.abs(move.x) > 0.05, 'active stream applies lateral strafe painting');
});

test('Hydra & Heavy Edit commit to full charge at mid/long combat for damage / 3F fire-rate bonuses, partial only point-blank', () => {
  const G = { time: 10 };
  for (const weaponId of ['s3-spinner-hyper', 's3-spinner-hypershort']) {
    const brain = { react: 0, strafeS: 0.6, t: 2 };
    const actor = makeActor({
      weapon: { id: weaponId, range: 22 },
      wr: { charging: true, charge: 0.90, cooldown: 0 },
    });

    // Mid range (13m / 22m = 0.59): holds past 0.90 to reach full-charge bonus
    applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
      dist: 13, range: 22, dx: 0, dz: 13,
      enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.80,
    });
    assert.equal(actor.intent.fire, true, `${weaponId} holds past 0.90 at mid range for full-charge bonus`);

    // At 1.0: releases immediately when aimed
    actor.weaponRunner.charge = 1.0;
    applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
      dist: 13, range: 22, dx: 0, dz: 13,
      enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.80,
    });
    assert.equal(actor.intent.fire, false, `${weaponId} releases at 1.0 full charge`);

    // Point-blank emergency (5m / 22m = 0.23): releases quick partial charge and kites backward
    const move = makeMove(0, 1);
    actor.weaponRunner.charge = 0.48;
    applySplatlingCombat(brain, G, actor, 1 / 60, move, {
      dist: 5, range: 22, dx: 0, dz: 5,
      enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.80,
    });
    assert.equal(actor.intent.fire, false, `${weaponId} uses emergency partial spin when point-blank rushed`);
    assert.ok(move.z < 0, `${weaponId} kites backward when point-blank rushed`);
  }
});

test('Mini Splatling & Heavy Splatling combat: quick partial close duels vs full long-range spins', () => {
  const G = { time: 15 };
  for (const weaponId of ['s3-spinner-quick', 'splatling']) {
    const brain = { react: 0, strafeS: 0.7, t: 1 };
    const actor = makeActor({
      weapon: { id: weaponId, range: 20 },
      wr: { charging: true, charge: 0.48, cooldown: 0 },
    });

    // Close range (7m / 20m = 0.35): releases partial spin quickly
    applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
      dist: 7, range: 20, dx: 0, dz: 7,
      enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.75,
    });
    assert.equal(actor.intent.fire, false, `${weaponId} releases mobile partial spin at close range`);

    // Long range (18m / 20m = 0.90): holds 0.70 until full spin (~0.88)
    actor.weaponRunner.charge = 0.70;
    applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
      dist: 18, range: 20, dx: 0, dz: 18,
      enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.75,
    });
    assert.equal(actor.intent.fire, true, `${weaponId} holds charge at long range for full stream`);
  }
});

test('Ballpoint Splatling combat: short-range close duel + recharge vs long-range pinpoint beam', () => {
  const G = { time: 20 };
  const brain = { react: 0, strafeS: 0.6, t: 3 };
  const actor = makeActor({
    weapon: { id: 's3-spinner-downpour', sourceMainActor: 'WeaponSpinnerDownpour', range: 24 },
    wr: { charging: true, charge: 0.31, cooldown: 0 },
  });

  // Close duel (7m / 24m = 0.29): releases in short-range mode
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 7, range: 24, dx: 0, dz: 7,
    enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.80,
  });
  assert.equal(actor.intent.fire, false, 'Ballpoint releases quick short-range burst at close range');

  // Far duel (20m / 24m = 0.83): holds 0.55 to reach long-range beam charge
  actor.weaponRunner.charge = 0.55;
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 20, range: 24, dx: 0, dz: 20,
    enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.80,
  });
  assert.equal(actor.intent.fire, true, 'Ballpoint charges deep for long-range combat');

  // Long-range stream tail recharge when enemy stays visible and ink is ample
  actor.weaponRunner.charging = false;
  actor.weaponRunner.streaming = true;
  actor.weaponRunner.catalogState = { stream: 1, streamElapsed: 2.7, streamTime: 3.0 };
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 20, range: 24, dx: 0, dz: 20,
    enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.70,
  });
  assert.equal(actor.intent.fire, true, 'Ballpoint recharges near long-range stream tail to keep pressure');
});

test('Nautilus 47 combat: Charge Keep on LOS break, ambush pop-out, and bounded mid-stream recharge', () => {
  const G = { time: 25 };
  const brain = { react: 0, lostTimer: 0.20, strafeS: 0.6, t: 4 };
  const actor = makeActor({
    weapon: { id: 's3-spinner-serein', sourceMainActor: 'WeaponSpinnerSerein', range: 18 },
    wr: { charging: true, charge: 0.82, cooldown: 0 },
    groundTeam: 1,
  });

  // Enemy breaks LOS while charging on own ink -> enters Charge Keep (fire=true, squid=true)
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 12, range: 18, dx: 0, dz: 12,
    enemyVisible: false, aimed: false, off: 0.5, inkFrac: 0.70,
  });
  assert.equal(actor.intent.fire, true, 'Nautilus holds fire for Charge Keep');
  assert.equal(actor.intent.squid, true, 'Nautilus dives into squid Charge Keep when LOS breaks');

  // Enemy reappears while stored charge is active -> pops out of squid to attack
  actor.weaponRunner.charging = false;
  actor.weaponRunner.catalogState = { stored: { frames: 62, paid: 12, remaining: 2.5 } };
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 11, range: 18, dx: 0, dz: 11,
    enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.70,
  });
  assert.equal(actor.intent.squid, false, 'Nautilus pops out of squid when target appears in range');
  assert.equal(actor.intent.fire, true, 'Nautilus resumes stored charge on pop-out');

  // Mid-stream tail recharge when target stays visible
  actor.weaponRunner.catalogState = { stream: 1, streamElapsed: 1.75, streamTime: 2.0 };
  actor.weaponRunner.streaming = true;
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 11, range: 18, dx: 0, dz: 11,
    enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.60,
  });
  assert.equal(actor.intent.fire, true, 'Nautilus recharges near stream tail when enemy is visible');
});

test('integrity & lightweight performance: no weapon/aimError mutation, no wall-hack firing, O(1) hot path', () => {
  const G = { match: { mode: 'turf', time: 90 }, time: 12 };
  const frozenWeapon = Object.freeze({
    id: 'splatling',
    sourceMainActor: 'WeaponSpinnerStandard',
    range: 21,
  });
  const brain = {
    _turfPaintLatch: true,
    _turfPaintValidated: true,
    aimError: 0.14,
    react: 0,
    lostTimer: 0.9,
    sweep: 0,
    t: 0,
  };
  const actor = makeActor({ weapon: frozenWeapon, wr: { charging: false, streaming: false, charge: 0, cooldown: 0 } });
  const move = makeMove(0, 1);

  // Wall-hack check: enemy not visible -> must NOT start firing
  const ret = applySplatlingCombat(brain, G, actor, 1 / 60, move, {
    dist: 10, range: 21, dx: 0, dz: 10,
    enemyVisible: false, aimed: true, off: 0.0, inkFrac: 0.90,
  });
  assert.equal(ret, null, 'combat returns null to preserve native aimError pipeline');
  assert.equal(actor.intent.fire, false, 'must not open fire when enemy is behind cover');
  assert.equal(brain.aimError, 0.14, 'aimError is never modified');

  // Hot-path performance & NaN safety over 6000 frames
  const t0 = performance.now();
  for (let i = 0; i < 6000; i++) {
    brain.t = i / 60;
    actor.weaponRunner.charging = (i % 3) === 1;
    actor.weaponRunner.streaming = (i % 3) === 2;
    actor.weaponRunner.charge = (i % 100) / 100;
    applySplatlingTurfPaint(brain, G, actor, 1 / 60, move, true, 0.2, 0.75, {
      pitchReady: true,
      wantPaintNow: true,
    });
    applySplatlingCombat(brain, G, actor, 1 / 60, move, {
      dist: 12, range: 21, dx: 3, dz: 11.6,
      enemyVisible: true, aimed: true, off: 0.05, inkFrac: 0.75,
    });
  }
  const elapsedMs = performance.now() - t0;
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'movement stays finite');
  assert.ok(elapsedMs < 200, `6000 paint+combat ticks should stay lightweight (< 200ms), got ${elapsedMs.toFixed(2)}ms`);
});

test('guards specialActive, it.sub, it.special, superJumpState, and climbing against input conflicts', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = { id: 'splatling', sourceMainActor: 'WeaponSpinnerStandard', range: 21 };

  // specialActive: must not overwrite fire/squid
  const spActor = makeActor({ id: 21, weapon, wr: { charging: false, streaming: false } });
  spActor.alive = true;
  spActor.specialActive = true;
  spActor.intent.fire = true;
  applySplatlingTurfPaint({ _turfPaintLatch: true, _turfPaintValidated: true }, G, spActor, 1 / 60, makeMove(), true, 0, 0.2, { pitchReady: true, wantPaintNow: true });
  assert.equal(spActor.intent.fire, true);
  assert.equal(spActor.intent.squid, false);

  // it.sub & it.special: clear fire, do not set squid
  for (const flag of ['sub', 'special']) {
    const act = makeActor({ id: 22, weapon, wr: { charging: false, streaming: false } });
    act.alive = true;
    act.intent.fire = true;
    act.intent[flag] = true;
    applySplatlingCombat({ react: 0 }, G, act, 1 / 60, makeMove(), {
      dist: 12, range: 21, dx: 0, dz: 12, enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    });
    assert.equal(act.intent.fire, false, `it.${flag} clears conflicting fire in combat`);
    assert.equal(act.intent.squid, false);

    act.intent.fire = true;
    applySplatlingTurfPaint({ _turfPaintLatch: true, _turfPaintValidated: true }, G, act, 1 / 60, makeMove(), true, 0, 0.2, { pitchReady: true, wantPaintNow: true });
    assert.equal(act.intent.fire, false, `it.${flag} clears conflicting fire in turf paint`);
  }

  // superJumpState & climbing: return early without mutating intent
  for (const patch of [{ superJumpState: { phase: 'air' } }, { climbing: true }]) {
    const act = makeActor({ id: 23, weapon, wr: { charging: false, streaming: false } });
    Object.assign(act, { alive: true, ...patch });
    act.intent.squid = true;
    applySplatlingTurfPaint({ _turfPaintLatch: true, _turfPaintValidated: true }, G, act, 1 / 60, makeMove(), true, 0, 0.8, { pitchReady: true, wantPaintNow: true });
    assert.equal(act.intent.fire, false);
    assert.equal(act.intent.squid, true);
  }
});

test('resets stale per-bot splatling state across deaths and netLife respawns', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = { id: 's3-spinner-hyper', sourceMainActor: 'WeaponSpinnerHyper', range: 24 };
  const brain = {
    _turfPaintLatch: true, _turfPaintValidated: true,
    _splatlingMicroRefill: 1, _splatlingRechargeCd: 0.7, _splatlingKeepT: 0.5, _splatlingHold: 0.3,
  };
  const actor = makeActor({ id: 24, weapon, wr: { charging: false, streaming: false } });
  actor.alive = true;
  actor.netLife = 1;

  // Initial call records netLife = 1 without wiping pre-populated state
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.40, { pitchReady: true, wantPaintNow: true });
  assert.equal(brain._splatlingMicroRefill, 1);

  // Respawn (netLife 1 -> 2) clears all stale per-life state
  actor.netLife = 2;
  applySplatlingTurfPaint(brain, G, actor, 1 / 60, makeMove(), true, 0, 0.40, { pitchReady: true, wantPaintNow: true });
  assert.equal(brain._splatlingMicroRefill, 0);
  assert.equal(brain._splatlingRechargeCd, 0);
  assert.equal(brain._splatlingKeepT, 0);
  assert.equal(brain._splatlingHold, 0);

  // Death resets state and returns early
  brain._splatlingMicroRefill = 1;
  actor.alive = false;
  actor.intent.fire = false;
  applySplatlingCombat(brain, G, actor, 1 / 60, makeMove(), {
    dist: 12, range: 24, dx: 0, dz: 12, enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
  });
  assert.equal(brain._splatlingMicroRefill, 0);
  assert.equal(actor.intent.fire, false);
});

test('combat ink exhaustion releases stuck spin; Nautilus keepExpired consumes stored charge and turf micro-refill preserves it', () => {
  // Combat ink exhaustion releases active spin instead of holding Fire forever
  const heavy = makeActor({
    id: 25,
    weapon: { id: 'splatling', sourceMainActor: 'WeaponSpinnerStandard', range: 21 },
    wr: { charging: true, charge: 0.40, cooldown: 0 },
  });
  heavy.intent.fire = true;
  applySplatlingCombat({ react: 0, _splatlingHold: 0.2 }, {}, heavy, 1 / 60, makeMove(), {
    dist: 12, range: 21, dx: 0, dz: 12, enemyVisible: true, aimed: false, off: 0.2, inkFrac: 0.01,
  });
  assert.equal(heavy.intent.fire, false, 'releases splatling spin immediately on combat ink exhaustion');

  // Nautilus keepExpired pops out with fire=true to consume catalogState.stored (preventing uncleared-stored oscillation)
  const naut = makeActor({
    id: 26,
    weapon: { id: 's3-spinner-serein', sourceMainActor: 'WeaponSpinnerSerein', range: 18 },
    wr: { charging: false, streaming: false, catalogState: { stored: { frames: 50, paid: 10, remaining: 2.0 } } },
    groundTeam: 1,
  });
  const nBrain = { react: 0, lostTimer: 1.2, _splatlingKeepT: 1.2 };
  applySplatlingCombat(nBrain, {}, naut, 1 / 60, makeMove(), {
    dist: 14, range: 18, dx: 0, dz: 14, enemyVisible: false, aimed: false, off: 0.5, inkFrac: 0.6,
  });
  assert.equal(naut.intent.squid, false, 'Nautilus surfaces when Charge Keep expires');
  assert.equal(naut.intent.fire, true, 'Nautilus holds fire on surface frame to consume catalogState.stored');
  assert.equal(nBrain._splatlingKeepT, 0);

  // Nautilus turf-paint micro-refill does not cancel stored charge
  const pBrain = { _turfPaintLatch: true, _turfPaintValidated: true, _splatlingMicroRefill: 1 };
  applySplatlingTurfPaint(pBrain, {}, naut, 1 / 60, makeMove(), true, 0, 0.15, { pitchReady: true, wantPaintNow: true });
  assert.equal(pBrain._splatlingMicroRefill, 0, 'stored charge clears micro-refill latch');
  assert.equal(naut.intent.fire, true, 'resumes stored charge for painting');
  assert.equal(naut.intent.squid, false);
});

test('NaN inputs never poison splatling movement or sweep state', () => {
  const actor = makeActor({
    id: 27,
    weapon: { id: 'splatling', sourceMainActor: 'WeaponSpinnerStandard', range: 21 },
    wr: { charging: true, charge: NaN, streaming: false, cooldown: 0 },
  });
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, sweep: 0, t: NaN };
  const move = makeMove(0, 1);
  applySplatlingTurfPaint(brain, {}, actor, NaN, move, true, NaN, NaN, { pitchReady: true, wantPaintNow: true });
  applySplatlingCombat(brain, {}, actor, NaN, move, {
    dist: NaN, range: NaN, dx: NaN, dz: NaN, enemyVisible: true, aimed: false, off: NaN, inkFrac: NaN,
  });
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z), 'move remains finite under NaN inputs');
  assert.ok(Number.isFinite(brain.sweep), 'sweep remains finite under NaN inputs');
});
