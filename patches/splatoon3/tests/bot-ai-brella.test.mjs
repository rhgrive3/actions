import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRELLA_ARCHETYPES,
  resolveBrellaArchetype,
  applyBrellaTurfPaint,
  applyBrellaCombat,
} from '../runtime/bot-ai-brella.mjs';

function makeMove(x = 0, z = 1) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  };
}

function makeBrellaWeapon(kind) {
  if (kind === 'wide') {
    return {
      id: 's3-shelter-wide',
      sourceMainActor: 'WeaponShelterWide',
      range: 15.0,
      catalogRecord: {
        id: 's3-shelter-wide',
        family: 'brella',
        sourceActor: 'WeaponShelterWide',
        sourceRow: 'Shelter_Wide_00',
        parameters: {
          spl__WeaponShelterCanopyParam: { CanopyNakedFrame: 340, InkConsumeUmbrella: 0.23 },
          spl__WeaponShelterShotgunParam: { InkConsume: 0.11, RepeatFrame: 0 },
        },
      },
    };
  }
  if (kind === 'compact') {
    return {
      id: 's3-shelter-compact',
      sourceMainActor: 'WeaponShelterCompact',
      range: 11.8,
      catalogRecord: {
        id: 's3-shelter-compact',
        family: 'brella',
        sourceActor: 'WeaponShelterCompact',
        sourceRow: 'Shelter_Compact_00',
        parameters: {
          spl__WeaponShelterCanopyParam: { CanopyNakedFrame: 222, InkConsumeUmbrella: 0, IsCanopyShot: false },
          spl__WeaponShelterShotgunParam: { InkConsume: 0.037, RepeatFrame: 26 },
        },
      },
    };
  }
  if (kind === 'focus') {
    return {
      id: 's3-shelter-focus',
      sourceMainActor: 'WeaponShelterFocus',
      range: 14.5,
      catalogRecord: {
        id: 's3-shelter-focus',
        family: 'brella',
        sourceActor: 'WeaponShelterFocus',
        sourceRow: 'Shelter_Focus_00',
        parameters: {
          spl__WeaponShelterCanopyParam: { CanopyNakedFrame: 130, InkConsumeUmbrella: 0.15, IsCanopyShot: true },
          spl__WeaponShelterShotgunParam: { InkConsume: 0.06, RepeatFrame: 0 },
        },
      },
    };
  }
  return {
    id: 's3-shelter-normal',
    sourceMainActor: 'WeaponShelterNormal',
    range: 12.5,
    catalogRecord: {
      id: 's3-shelter-normal',
      family: 'brella',
      sourceActor: 'WeaponShelterNormal',
      sourceRow: 'Shelter_Normal_00',
      parameters: {
        spl__WeaponShelterCanopyParam: { CanopyNakedFrame: 330, InkConsumeUmbrella: 0.30 },
        spl__WeaponShelterShotgunParam: { InkConsume: 0.05, RepeatFrame: 0 },
      },
    },
  };
}

function makeActor(weapon, overrides = {}) {
  return {
    id: 1,
    weapon,
    hp: 100,
    lastDamage: 9,
    grounded: true,
    groundTeam: 1,
    intent: { fire: false, squid: false, jump: false },
    _prevIntent: { fire: false, squid: false, jump: false },
    weaponRunner: {
      cooldown: 0,
      catalogState: {
        pending: null,
        naked: 0,
        canopy: { hp: 500, open: false, launched: false, age: 0 },
      },
    },
    ...overrides,
  };
}

function syncPrevIntent(actor) {
  actor._prevIntent.fire = actor.intent.fire;
  actor._prevIntent.squid = actor.intent.squid;
}

test('resolveBrellaArchetype classifies all 4 Splatoon 3 brella weapons without mutating weapon stats', () => {
  const normal = Object.freeze(makeBrellaWeapon('normal'));
  const wide = Object.freeze(makeBrellaWeapon('wide'));
  const compact = Object.freeze(makeBrellaWeapon('compact'));
  const focus = Object.freeze(makeBrellaWeapon('focus'));

  assert.equal(resolveBrellaArchetype(normal), BRELLA_ARCHETYPES.normal);
  assert.equal(resolveBrellaArchetype(wide), BRELLA_ARCHETYPES.wide);
  assert.equal(resolveBrellaArchetype(compact), BRELLA_ARCHETYPES.compact);
  assert.equal(resolveBrellaArchetype(focus), BRELLA_ARCHETYPES.focus);

  // Alternate kit IDs / parameter fallbacks
  assert.equal(resolveBrellaArchetype({ id: 'undercover-sorella' }), BRELLA_ARCHETYPES.compact);
  assert.equal(resolveBrellaArchetype({ id: 'tenta-crem' }), BRELLA_ARCHETYPES.wide);
  assert.equal(resolveBrellaArchetype({ id: 'recycled-mk2' }), BRELLA_ARCHETYPES.focus);
  assert.equal(resolveBrellaArchetype(null), BRELLA_ARCHETYPES.normal);
});

test('Splat Brella (normal) turf paint preserves strict tap-fire cadence and never locks canopy open', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('normal');
  const actor = makeActor(weapon);
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0 };
  const move = makeMove(0, 1);

  let consecutiveFire = 0;
  let maxConsecutiveFire = 0;
  let shotsFired = 0;

  for (let i = 0; i < 60; i++) {
    actor.weaponRunner.cooldown = 0;
    applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.80, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { multiActive: true, effOwn: 0.15, flankBias: 0 },
    });
    if (actor.intent.fire) {
      consecutiveFire += 1;
      if (!actor._prevIntent.fire) shotsFired += 1;
    } else {
      consecutiveFire = 0;
    }
    if (consecutiveFire > maxConsecutiveFire) maxConsecutiveFire = consecutiveFire;
    syncPrevIntent(actor);
  }

  assert.equal(maxConsecutiveFire, 1, 'normal brella turf paint never holds fire for >1 tick');
  assert.equal(shotsFired, 30, 'fires cleanly on every rising edge');
});

test('Undercover Brella (compact) holds fire continuously for shielded 26F auto-fire in turf & combat', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('compact');
  const actor = makeActor(weapon);
  actor.weaponRunner.catalogState.canopy.hp = 200;
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0, strafeS: 1 };
  const move = makeMove(0, 1);

  // Turf paint: continuous fire hold
  for (let i = 0; i < 15; i++) {
    applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.75, {
      pitchReady: true,
      wantPaintNow: true,
    });
    assert.equal(actor.intent.fire, true, `compact holds fire in turf paint tick ${i}`);
    assert.equal(actor.intent.squid, false);
    syncPrevIntent(actor);
  }

  // Combat: continuous shielded auto-fire while canopy intact
  for (let i = 0; i < 15; i++) {
    const res = applyBrellaCombat(brain, G, actor, 1 / 60, move, {
      family: 'brella', dist: 8.0, range: 11.8, dx: 0, dz: 8.0,
      enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.70,
      wantYaw: 0.03, wantPitch: 0,
    });
    assert.equal(res, null, 'does not tamper with wantYaw / aimError');
    assert.equal(actor.intent.fire, true, `compact holds fire in combat tick ${i}`);
    syncPrevIntent(actor);
  }

  // Combat with broken canopy & low HP: withdraws defensively on own ink
  actor.weaponRunner.catalogState.naked = 3.0;
  actor.weaponRunner.catalogState.canopy = null;
  actor.hp = 40;
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 7.0, range: 11.8, dx: 0, dz: 7.0,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.60,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'stops trading naked at low HP when canopy is broken');
  assert.equal(actor.intent.squid, true, 'disengages in squid form on own ink');
  assert.ok(move.z < 0, 'moves away from enemy when retreating');
});

test('Tenta Brella (wide) executes turf canopy purge, releases cleanly on launch, and never locks canopy open', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('wide');
  const actor = makeActor(weapon);
  actor.weaponRunner.catalogState.canopy.hp = 700;
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true };
  const move = makeMove(0, 1);

  // Tick 0: starts wide canopy purge on unpainted lane with ample ink
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, true, 'starts tent purge');
  syncPrevIntent(actor);

  // Simulate holding through purge until canopy launches at 1.92s (~115 frames)
  for (let i = 0; i < 114; i++) {
    applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.70, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
    });
    assert.equal(actor.intent.fire, true);
    syncPrevIntent(actor);
  }

  // Canopy launches -> naked becomes 340/60
  actor.weaponRunner.catalogState.naked = 340 / 60;
  actor.weaponRunner.catalogState.canopy = null;
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.55, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, false, 'immediately releases fire when canopy launches');
  syncPrevIntent(actor);

  // Even if canopy never transitioned to naked (failsafe timeout), must hard-release at purgeMaxHoldS
  const actor2 = makeActor(weapon);
  const brain2 = { _turfPaintLatch: true, _turfPaintValidated: true };
  let releasedByTimeout = false;
  for (let i = 0; i < 140; i++) {
    applyBrellaTurfPaint(brain2, G, actor2, 1 / 60, move, true, 0, 0.80, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
    });
    if (i > 115 && !actor2.intent.fire) {
      releasedByTimeout = true;
      break;
    }
    syncPrevIntent(actor2);
  }
  assert.equal(releasedByTimeout, true, 'failsafe timeout prevents stuck canopy hold');
});

test('Tenta Brella (wide) combat purges at mid range, tap-fires for 1-shot at close range, and swims during slow 51F cooldown', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('wide');
  const move = makeMove(0, 1);

  // Close range (<= 0.58 * 15 = 8.7m): immediate tap-fire 1-shot, no purge hold
  const closeActor = makeActor(weapon);
  const closeBrain = { react: 0, strafeS: 1 };
  applyBrellaCombat(closeBrain, G, closeActor, 1 / 60, move, {
    family: 'brella', dist: 6.0, range: 15.0, dx: 0, dz: 6.0,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.80,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(closeActor.intent.fire, true, 'fires immediate close-range shot');
  syncPrevIntent(closeActor);

  // Next tick while on slow cooldown (0.70s): releases fire & squid-steps on own ink
  closeActor.weaponRunner.cooldown = 0.70;
  applyBrellaCombat(closeBrain, G, closeActor, 1 / 60, move, {
    family: 'brella', dist: 6.0, range: 15.0, dx: 0, dz: 6.0,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.69,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(closeActor.intent.fire, false, 'does not hold canopy at close range');
  assert.equal(closeActor.intent.squid, true, 'squid-steps between slow 51F shots');

  // Mid range (11.5m): initiates tent canopy purge
  const midActor = makeActor(weapon);
  const midBrain = { react: 0, strafeS: 1 };
  applyBrellaCombat(midBrain, G, midActor, 1 / 60, move, {
    family: 'brella', dist: 11.5, range: 15.0, dx: 0, dz: 11.5,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.85,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(midActor.intent.fire, true);
  syncPrevIntent(midActor);
  applyBrellaCombat(midBrain, G, midActor, 1 / 60, move, {
    family: 'brella', dist: 11.5, range: 15.0, dx: 0, dz: 11.5,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.80,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(midActor.intent.fire, true, 'holds canopy toward mid-range purge');
});

test('Recycled Brella 24 (focus) executes rapid 0.80s purge in turf & combat and maintains mid-range spacing', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('focus');
  const actor = makeActor(weapon);
  actor.weaponRunner.catalogState.canopy.hp = 150;
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0, strafeS: 1 };
  const move = makeMove(0, 1);

  // Turf: initiates rapid purge at lower ink threshold (0.40 >= 0.36)
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.40, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { multiActive: true, effOwn: 0.25, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, true);
  syncPrevIntent(actor);

  // Hold completes within <= 60 frames (0.92s cap) even if naked wasn't triggered externally
  let releasedTick = -1;
  for (let i = 0; i < 65; i++) {
    applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.35, {
      pitchReady: true,
      wantPaintNow: true,
      cache: { multiActive: true, effOwn: 0.25, flankBias: 0 },
    });
    if (!actor.intent.fire) {
      releasedTick = i;
      break;
    }
    syncPrevIntent(actor);
  }
  assert.ok(releasedTick > 45 && releasedTick < 60, `rapid focus purge capped cleanly around 0.92s (tick ${releasedTick})`);

  // Combat close-range spacing: backs up + strafes when closer than 0.62 * 14.5 (~9.0m)
  const combatActor = makeActor(weapon);
  combatActor.weaponRunner.catalogState.canopy.hp = 150;
  combatActor.weaponRunner.cooldown = 0.25;
  const combatBrain = { react: 0, strafeS: 1 };
  const closeMove = makeMove(0, 1);
  applyBrellaCombat(combatBrain, G, combatActor, 1 / 60, closeMove, {
    family: 'brella', dist: 5.0, range: 14.5, dx: 0, dz: 5.0,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.70,
    wantYaw: 0, wantPitch: 0,
  });
  assert.ok(closeMove.z < 0, 'Recycled Brella 24 kites backward to preserve tight mid-range spacing');
});

test('Splat Brella (normal) combat uses brief reactive post-hit guard + strafe shift and always returns to tap-fire', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('normal');
  const actor = makeActor(weapon, { lastDamage: 0.08 });
  const brain = { react: 0, strafeS: 1 };
  const move = makeMove(0, 1);

  // Taking damage triggers brief reactive guard hold
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 8.5, range: 12.5, dx: 0, dz: 8.5,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.65,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'starts brief reactive guard after taking hit');
  syncPrevIntent(actor);

  // Guard holds briefly (< 0.45s, far below 2.0s purge) and shifts laterally (射線ずらし)
  let holdTicks = 0;
  let shiftedLaterally = false;
  for (let i = 0; i < 40; i++) {
    applyBrellaCombat(brain, G, actor, 1 / 60, move, {
      family: 'brella', dist: 8.5, range: 12.5, dx: 0, dz: 8.5,
      enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.60,
      wantYaw: 0, wantPitch: 0,
    });
    if (actor.intent.fire) {
      holdTicks += 1;
      if (Math.abs(move.x) > 0.5) shiftedLaterally = true;
    } else {
      syncPrevIntent(actor);
      break;
    }
    syncPrevIntent(actor);
  }

  assert.ok(holdTicks >= 18 && holdTicks <= 25, `reactive guard lasts ~0.36s (${holdTicks} ticks), never near 2.0s purge`);
  assert.equal(shiftedLaterally, true, 'performs lateral strafe shift (射線ずらし) while guarding');

  // After release pulse, immediately resumes crisp tap-fire
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 8.5, range: 12.5, dx: 0, dz: 8.5,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.58,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'completes release pulse cleanly');
  syncPrevIntent(actor);

  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 8.5, range: 12.5, dx: 0, dz: 8.5,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.58,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'resumes tap-fire counterattack right after guard release');
});

test('Hidden enemy immediately cancels active guard/purge hold (no wall-hack and no stuck shield)', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('wide');
  const actor = makeActor(weapon);
  const brain = { react: 0, strafeS: 1 };
  const move = makeMove(0, 1);

  // Start mid-range purge while enemy is visible
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.85,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true);
  syncPrevIntent(actor);

  // Enemy breaks LOS -> must release canopy immediately
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: false, aimed: false, off: 0.5, inkFrac: 0.80,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'releases canopy when enemy is no longer visible');
});

test('Non-brella weapons are ignored cleanly by both turf and combat functions', () => {
  const shooter = { id: 'shooter', catalogRecord: { family: 'shooter' }, range: 12 };
  const actor = makeActor(shooter);
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0 };
  const move = makeMove(0, 1);

  applyBrellaTurfPaint(brain, {}, actor, 1 / 60, move, true, 0, 0.9, { pitchReady: true, wantPaintNow: true });
  assert.equal(actor.intent.fire, false);

  const res = applyBrellaCombat(brain, {}, actor, 1 / 60, move, {
    family: 'shooter', dist: 8, range: 12, dx: 0, dz: 8,
    enemyVisible: true, aimed: true, off: 0, inkFrac: 0.9,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(res, null);
  assert.equal(actor.intent.fire, false);
});

test('Brella AI resets stale canopy holds on death/respawn (netLife / !alive) and yields to specials, subs, and climbing', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('wide');
  const actor = makeActor(weapon, { alive: true, netLife: 1 });
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0, strafeS: 1 };
  const move = makeMove(0, 1);

  // Enter MODE_PURGE in life 1
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, true);
  syncPrevIntent(actor);

  // Die and respawn (netLife -> 2) with wantPaintNow=false: must NOT remain stuck holding canopy open
  actor.netLife = 2;
  actor._prevIntent.fire = false;
  actor.intent.fire = false;
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: false,
    cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, false, 'respawn clears stale MODE_PURGE hold');

  // Active special clears any active hold and leaves move/intent untouched
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.85,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true);
  syncPrevIntent(actor);

  const spMove = makeMove(0, 1);
  actor.specialActive = { kind: 'inkVac' };
  actor.intent.fire = false;
  applyBrellaCombat(brain, G, actor, 1 / 60, spMove, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.85,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'does not assert fire during active special');
  assert.equal(spMove.z, 1, 'does not overwrite move during active special');
  actor.specialActive = null;

  // Sub bomb throw releases active hold and prevents squid cancel
  actor.intent.sub = true;
  actor.intent.squid = true;
  applyBrellaCombat(brain, G, actor, 1 / 60, move, {
    family: 'brella', dist: 8.0, range: 15.0, dx: 0, dz: 8.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.85,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'clears fire when throwing sub');
  assert.equal(actor.intent.squid, false, 'clears squid when throwing sub');
  actor.intent.sub = false;

  // Climbing preserves squid form
  actor.climbing = true;
  actor.intent.squid = true;
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, true, 'preserves squid form while climbing');
});

test('Brella AI handles canopy-launch desync, completes MODE_RELEASE while hidden, prevents low-ink dry fire, and guards NaN', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const weapon = makeBrellaWeapon('wide');
  const actor = makeActor(weapon);
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0, strafeS: 1 };
  const move = makeMove(0, 1);

  // Canopy marked launched before naked updates -> immediately exits MODE_PURGE
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, true);
  syncPrevIntent(actor);
  actor.weaponRunner.catalogState.canopy.launched = true;
  applyBrellaTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.80, {
    pitchReady: true,
    wantPaintNow: true,
    cache: { multiActive: true, effOwn: 0.10, flankBias: 0 },
  });
  assert.equal(actor.intent.fire, false, 'releases immediately when canopy.launched is true');

  // MODE_RELEASE completes while enemy is hidden so re-sighting fires immediately without 1-frame stall
  const cActor = makeActor(weapon);
  const cBrain = { react: 0, strafeS: 1 };
  applyBrellaCombat(cBrain, G, cActor, 1 / 60, move, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.85,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(cActor.intent.fire, true);
  syncPrevIntent(cActor);
  // Enemy hides (enters MODE_RELEASE)
  applyBrellaCombat(cBrain, G, cActor, 1 / 60, move, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: false, aimed: false, off: 0.4, inkFrac: 0.80,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(cActor.intent.fire, false);
  syncPrevIntent(cActor);
  // Enemy stays hidden 1 more tick -> MODE_RELEASE completes to MODE_TAP
  applyBrellaCombat(cBrain, G, cActor, 1 / 60, move, {
    family: 'brella', dist: 11.0, range: 15.0, dx: 0, dz: 11.0,
    enemyVisible: false, aimed: false, off: 0.4, inkFrac: 0.80,
    wantYaw: 0, wantPitch: 0,
  });
  syncPrevIntent(cActor);
  // Enemy reappears at close range -> fires immediately on first visible tick!
  applyBrellaCombat(cBrain, G, cActor, 1 / 60, move, {
    family: 'brella', dist: 6.0, range: 15.0, dx: 0, dz: 6.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.80,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(cActor.intent.fire, true, 'fires immediately when enemy reappears after hidden release');

  // Ink exhaustion: Tenta Brella (11% ink/shot, paintInkFloor 0.14) must not dry-fire at 10.5% turf or 5% combat
  const dryActor = makeActor(weapon);
  const dryBrain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0 };
  applyBrellaTurfPaint(dryBrain, G, dryActor, 1 / 60, move, true, 0, 0.105, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(dryActor.intent.fire, false, 'wide brella does not dry-fire below paintInkFloor in turf');

  applyBrellaCombat(dryBrain, G, dryActor, 1 / 60, move, {
    family: 'brella', dist: 6.0, range: 15.0, dx: 0, dz: 6.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.05,
    wantYaw: 0, wantPitch: 0,
  });
  assert.equal(dryActor.intent.fire, false, 'wide brella does not dry-fire below 11% shot cost in combat');

  // NaN / undefined inputs keep move finite and avoid bogus firing
  const nanMove = makeMove(0, 1);
  const nanActor = makeActor(makeBrellaWeapon('compact'));
  applyBrellaCombat({ react: 0, strafeS: Number.NaN }, G, nanActor, Number.NaN, nanMove, {
    family: 'brella', dist: Number.NaN, range: Number.NaN, dx: Number.NaN, dz: Number.NaN,
    enemyVisible: true, aimed: true, off: Number.NaN, inkFrac: Number.NaN,
    wantYaw: Number.NaN, wantPitch: Number.NaN,
  });
  assert.equal(nanActor.intent.fire, false);
  assert.ok(Number.isFinite(nanMove.x) && Number.isFinite(nanMove.z), 'move remains finite under NaN inputs');
});
