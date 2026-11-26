import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLASTER_ARCHETYPES,
  getBlasterArchetype,
  applyBlasterTurfPaint,
  applyBlasterCombat,
} from '../runtime/bot-ai-blaster.mjs';

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

function makeBlasterActor(overrides = {}) {
  return {
    id: 1,
    team: 0,
    pos: { x: 0, y: 0, z: 0 },
    grounded: true,
    groundTeam: 1,
    lastDamage: 5.0,
    weapon: {
      id: 'blaster',
      kind: 'blaster',
      range: 10.5,
      splashRadius: 2.6,
      fireInterval: 0.78,
      inkPerShot: 9,
      directDamage: 125,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Middle_00' },
    },
    intent: { fire: false, squid: false, jump: false, sub: false, special: false },
    _prevIntent: { fire: false },
    weaponRunner: {
      cooldown: 0,
      s3PostShotRemaining: 0,
      s3BlasterInterruptSquid: 0,
      catalogState: { pending: false },
    },
    ...overrides,
  };
}

test('getBlasterArchetype classifies all 7 Splatoon 3 blaster sub-archetypes without mutating weapon stats', () => {
  const cases = [
    [{ id: 's3-blaster-short', catalogRecord: { sourceRow: 'Blaster_Short_00' } }, 'nova'],
    [{ id: 'blaster', catalogRecord: { sourceRow: 'Blaster_Middle_00' } }, 'hot'],
    [{ id: 's3-blaster-long', catalogRecord: { sourceRow: 'Blaster_Long_00' } }, 'long'],
    [{ id: 's3-blaster-lightshort', catalogRecord: { sourceRow: 'Blaster_LightShort_00' } }, 'clash'],
    [{ id: 's3-blaster-light', catalogRecord: { sourceRow: 'Blaster_Light_00' } }, 'rapid'],
    [{ id: 's3-blaster-lightlong', catalogRecord: { sourceRow: 'Blaster_LightLong_00' } }, 'rapid_pro'],
    [{ id: 's3-blaster-precision', catalogRecord: { sourceRow: 'Blaster_Precision_00' } }, 'sblast'],
  ];
  for (const [weapon, expected] of cases) {
    const frozen = Object.freeze({ ...weapon, range: 10.5, inkPerShot: 9, directDamage: 125 });
    const arch = getBlasterArchetype(frozen);
    assert.equal(arch.key, expected);
    assert.equal(arch, BLASTER_ARCHETYPES[expected]);
  }
});

test('non-blaster families are strictly untouched by both applyBlasterTurfPaint and applyBlasterCombat', () => {
  for (const family of ['shooter', 'dualies', 'slosher', 'roller', 'charger']) {
    const actor = makeBlasterActor({
      weapon: { id: family, kind: family, range: 12, catalogRecord: { family } },
      intent: { fire: true, squid: false, jump: false },
    });
    const brain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0, strafeS: 0.5, aimPitch: -0.08 };
    const move = makeMove(0, 1);

    applyBlasterTurfPaint(brain, { match: { time: 120 } }, actor, 1 / 60, move, true, 0, 0.8, {
      pitchReady: true,
      wantPaintNow: true,
    });
    assert.equal(actor.intent.fire, true);
    assert.equal(actor.intent.squid, false);

    const combatRes = applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
      family, dist: 8, range: 12, dx: 0, dz: 8,
      enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
      idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: -0.05,
    });
    assert.equal(combatRes, null);
    assert.equal(actor.intent.fire, true);
  }
});

test('applyBlasterTurfPaint weaves between-shot squid swim on own ink and steps sweep phase after each shell', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const actor = makeBlasterActor();
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0, aimPitch: -0.06, t: 1.0, ph1: 0.5 };
  const move = makeMove(0, 1);

  // Frame 1: ready to shoot -> fires shell and stays kid form
  applyBlasterTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, true);
  assert.equal(actor.intent.squid, false);

  // Frame 2: shot emitted -> post-shot lock active -> releases fire, waits out lock (no cancel penalty)
  actor.weaponRunner.cooldown = 0.78;
  actor.weaponRunner.s3PostShotRemaining = 0.35;
  applyBlasterTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.75, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false, 'releases fire during post-shot lock');
  assert.equal(actor.intent.squid, false, 'does not force squid while post-shot locked');
  assert.ok(brain.sweep > 0.3, 'steps sweep phase after shot to avoid tip-blast overlap');

  // Frame 3: post-shot lock finished, cooldown still active -> swims in own ink between shots
  actor.weaponRunner.s3PostShotRemaining = 0;
  actor.weaponRunner.cooldown = 0.38;
  applyBlasterTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.75, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, true, 'swims on own ink during between-shot cooldown window');
});

test('applyBlasterTurfPaint keeps Clash Blaster firing continuously without squid-startup overhead', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const actor = makeBlasterActor({
    weapon: {
      id: 's3-blaster-lightshort',
      kind: 'blaster',
      range: 9.5,
      fireInterval: 0.33,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_LightShort_00' },
    },
  });
  actor.weaponRunner.cooldown = 0.16;
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0, aimPitch: -0.06, t: 1.0 };
  const move = makeMove(0, 1);

  applyBlasterTurfPaint(brain, G, actor, 1 / 60, move, true, 0, 0.80, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, true, 'Clash Blaster maintains continuous paint cadence');
  assert.equal(actor.intent.squid, false);
});

test('applyBlasterTurfPaint performs burst micro-recovery before hitting 12% refill cliff, except in final 6.5s', () => {
  const actor = makeBlasterActor();
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0, aimPitch: -0.06, t: 2.0, ph1: 1.2 };
  const move = makeMove(0, 1);

  // Mid-game with inkFrac 0.30 (< 0.34 hot trigger) on own ink -> enters micro-recovery
  applyBlasterTurfPaint(brain, { match: { time: 90 } }, actor, 1 / 60, move, true, 0, 0.30, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, false, 'pauses firing for quick ink recovery');
  assert.equal(actor.intent.squid, true, 'submerges on own ink to recover');

  // Once ink recovers to target (0.68 >= 0.66 + 0.015), resumes painting immediately
  applyBlasterTurfPaint(brain, { match: { time: 89 } }, actor, 1 / 60, move, true, 0, 0.68, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, true, 'resumes painting once micro-recovery target reached');
  assert.equal(actor.intent.squid, false);

  // Final 6.5s endgame push: skips micro-recovery even at 0.25 ink
  applyBlasterTurfPaint(brain, { match: { time: 4.5 } }, actor, 1 / 60, move, true, 0, 0.25, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(actor.intent.fire, true, 'keeps painting through endgame buzzer-beater window');
});

test('applyBlasterTurfPaint prevents firing into floor (terrain-impact paint loss) and uses S-BLAST jump paint safely', () => {
  const G = { match: { mode: 'turf', time: 110 } };
  const move = makeMove(0, 1);

  // Steep downward pitch (-0.35) when not foot-painting -> holds fire to avoid floor-impact blast
  const hotActor = makeBlasterActor();
  const hotBrain = { _turfPaintLatch: true, _turfPaintValidated: true, _footPaint: false, aimPitch: -0.35, t: 1.0 };
  applyBlasterTurfPaint(hotBrain, G, hotActor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(hotActor.intent.fire, false, 'avoids firing into floor when aimPitch is steep downward');

  // S-BLAST '92 on safe flat ground -> uses jump-fire short wide blast for turf painting
  const sblastActor = makeBlasterActor({
    weapon: {
      id: 's3-blaster-precision',
      kind: 'blaster',
      range: 14.0,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Precision_00' },
    },
  });
  const sblastBrain = {
    _turfPaintLatch: true, _turfPaintValidated: true, aimPitch: -0.05, t: 1.0,
    _nearWater: () => false,
  };
  applyBlasterTurfPaint(sblastBrain, G, sblastActor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(sblastActor.intent.fire, true);
  assert.equal(sblastActor.intent.jump, true, 'S-BLAST uses wide short-range jump paint on safe ground');

  // Near water -> never jumps
  const waterActor = makeBlasterActor({
    weapon: sblastActor.weapon,
  });
  const waterBrain = {
    _turfPaintLatch: true, _turfPaintValidated: true, aimPitch: -0.05, t: 1.0,
    _nearWater: () => true,
  };
  applyBlasterTurfPaint(waterBrain, G, waterActor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(waterActor.intent.jump, false, 'S-BLAST suppresses jump paint near water');
});

test('applyBlasterCombat kites at close range, extends firing to airburst reach, and preserves wantYaw aimError', () => {
  const actor = makeBlasterActor();
  const brain = { react: 0, strafeS: 0.4, target: { id: 2 }, t: 1.5, ph1: 0.7 };
  const move = makeMove(0, 1);

  // Too close (dist = 5.0 < 10.5 * 0.74 = 7.77): backpedals away from enemy (+Z -> move.z < 0)
  const resClose = applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
    family: 'blaster', dist: 5.0, range: 10.5, dx: 0, dz: 5.0,
    enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.06, wantPitch: -0.05,
  });
  assert.ok(move.z < -0.5, 'backpedals away when enemy is inside airburst dead zone');
  assert.equal(actor.intent.fire, true);
  assert.equal(resClose, null);

  // Extended airburst zone (dist = 11.8 > range 10.5, < blastReach 10.5 + 2.6*0.82 = 12.63)
  // Low pitch (-0.24) on flat duel -> lifted to airburst pitch while wantYaw stays untouched!
  const resMid = applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
    family: 'blaster', dist: 11.8, range: 10.5, dx: 0, dz: 11.8,
    enemyVisible: true, aimed: false, off: 0.10, inkFrac: 0.8,
    idealYaw: 0, idealPitch: -0.04, wantYaw: 0.09, wantPitch: -0.24,
  });
  assert.equal(actor.intent.fire, true, 'fires in extended airburst reach');
  assert.ok(resMid !== null, 'lifts overly low pitch to prevent floor-impact damage halving');
  assert.equal(resMid.wantYaw, 0.09, 'never zeros or alters human aimError in wantYaw');
  assert.ok(resMid.wantPitch >= -0.11, 'keeps shell airborne to detonate at full splash damage');

  // Zero-allocation check: subsequent pitch adjustment reuses the same output object reference
  const resMid2 = applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
    family: 'blaster', dist: 11.6, range: 10.5, dx: 0, dz: 11.6,
    enemyVisible: true, aimed: false, off: 0.09, inkFrac: 0.8,
    idealYaw: 0, idealPitch: -0.04, wantYaw: 0.11, wantPitch: -0.26,
  });
  assert.equal(resMid2, resMid, 'reuses cached aim output object with zero hot-path allocation');
  assert.equal(resMid2.wantYaw, 0.11);
});

test('applyBlasterCombat preserves emergeDelay guard (cooldown > 0.16) for Hot Blaster between-shot squid step', () => {
  const actor = makeBlasterActor();
  const brain = { react: 0, strafeS: 0.3, target: { id: 2 }, t: 2.0, ph1: 0.4 };
  const move = makeMove(0, 1);

  // Cooldown 0.12 (<= 0.16 emergeDelay guard): must NOT submerge into squid form (would collide with emergeDelay)
  actor.weaponRunner.cooldown = 0.12;
  applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
    family: 'blaster', dist: 5.5, range: 10.5, dx: 0, dz: 5.5,
    enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: -0.02,
  });
  assert.equal(actor.intent.squid, false, 'does not enter squid when cooldown <= 0.16');
  assert.equal(actor.intent.fire, true, 'stays ready to fire without emergeDelay penalty');

  // Cooldown 0.26 (> 0.16) while out of sweet zone on own ink -> performs quick squid kite step
  actor.weaponRunner.cooldown = 0.26;
  actor.intent.fire = false;
  actor.intent.squid = false;
  applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
    family: 'blaster', dist: 5.5, range: 10.5, dx: 0, dz: 5.5,
    enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: -0.02,
  });
  assert.equal(actor.intent.fire, false);
  assert.equal(actor.intent.squid, true, 'swims on own ink when cooldown > 0.16 and repositioning');
});

test('applyBlasterCombat switches S-BLAST to jump-fire short wide blast up close and grounded long blast at range', () => {
  const sblastWeapon = {
    id: 's3-blaster-precision',
    kind: 'blaster',
    range: 14.0,
    splashRadius: 2.4,
    catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Precision_00' },
  };
  const actor = makeBlasterActor({ weapon: sblastWeapon });
  const brain = { react: 0, strafeS: 0.3, target: { id: 2 }, t: 1.0, ph1: 0.2, _nearWater: () => false };
  const move = makeMove(0, 1);

  // Close range (7.5m < 14 * 0.68 = 9.52m) -> jumps for wide short blast
  applyBlasterCombat(brain, {}, actor, 1 / 60, move, {
    family: 'blaster', dist: 7.5, range: 14.0, dx: 0, dz: 7.5,
    enemyVisible: true, aimed: true, off: 0.03, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: -0.02,
  });
  assert.equal(actor.intent.jump, true, 'S-BLAST triggers jump-shot wide blast when rushed');

  // Long range (12.5m >= 9.52m) -> stays grounded for 0° long-range precision and stricter aim tolerance
  const actorFar = makeBlasterActor({ weapon: sblastWeapon });
  const brainFar = { react: 0, strafeS: 0.3, target: { id: 2 }, t: 1.0, ph1: 0.2, _nearWater: () => false };
  applyBlasterCombat(brainFar, {}, actorFar, 1 / 60, move, {
    family: 'blaster', dist: 12.5, range: 14.0, dx: 0, dz: 12.5,
    enemyVisible: true, aimed: false, off: 0.14, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: -0.02,
  });
  assert.equal(actorFar.intent.jump, false, 'S-BLAST stays grounded for precision long blast at range');
  assert.equal(actorFar.intent.fire, false, 'S-BLAST long mode holds narrow-blast shot until aim tightens');

  // Close-range cover corner-blast -> uses jump short wide blast around corner
  const actorCover = makeBlasterActor({ weapon: sblastWeapon });
  const brainCover = { react: 0, strafeS: 0.3, target: { id: 5 }, lostTimer: 0.35, t: 1.0, ph1: 0.2, _nearWater: () => false };
  applyBlasterCombat(brainCover, {}, actorCover, 1 / 60, move, {
    family: 'blaster', dist: 8.5, range: 14.0, dx: 0, dz: 8.5,
    enemyVisible: false, aimed: false, off: 0.08, inkFrac: 0.7,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.02, wantPitch: -0.02,
  });
  assert.equal(actorCover.intent.fire, true);
  assert.equal(actorCover.intent.jump, true, 'S-BLAST uses wide short jump-blast on close cover corners');
});

test('applyBlasterCombat fires up to 2 airburst shells around cover after LOS break without infinite spam', () => {
  const actor = makeBlasterActor();
  const target = { id: 9 };
  const brain = { react: 0, strafeS: 0.5, target, lostTimer: 0.4 };
  const move = makeMove(0, 1);
  const ctx = {
    family: 'blaster', dist: 11.2, range: 10.5, dx: 0, dz: 11.2,
    enemyVisible: false, aimed: false, off: 0.12, inkFrac: 0.7,
    idealYaw: 0, idealPitch: -0.02, wantYaw: 0.05, wantPitch: -0.18,
  };

  // Shot 1 around cover
  const r1 = applyBlasterCombat(brain, {}, actor, 1 / 60, move, ctx);
  assert.equal(actor.intent.fire, true, 'fires 1st cover-blast shell');
  assert.ok(r1 && r1.wantPitch >= -0.04, 'elevates cover-blast pitch so shell explodes past corner');

  // Shot 2 around cover
  actor.intent.fire = false;
  applyBlasterCombat(brain, {}, actor, 1 / 60, move, ctx);
  assert.equal(actor.intent.fire, true, 'fires 2nd cover-blast shell');

  // Shot 3: capped at 2 shells to preserve ink
  actor.intent.fire = false;
  applyBlasterCombat(brain, {}, actor, 1 / 60, move, ctx);
  assert.equal(actor.intent.fire, false, 'stops cover-blast spam after 2 shells');
});

test('applyBlasterCombat expresses distinct playstyles for Luna, Long, Clash, Rapid, and Rapid Pro', () => {
  const move = makeMove(0, 1);

  // 1. Luna Blaster (s3-blaster-short): 3-shell close corner-blast pressure thanks to 7.5% ink & wide 3.9 radius
  const lunaActor = makeBlasterActor({
    weapon: { id: 's3-blaster-short', kind: 'blaster', range: 8.5, splashRadius: 2.8, catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Short_00' } },
  });
  const lunaBrain = { react: 0, strafeS: 0.6, target: { id: 10 }, lostTimer: 0.3, t: 1.0, ph1: 0.5 };
  const lunaCoverCtx = {
    family: 'blaster', dist: 8.2, range: 8.5, dx: 0, dz: 8.2,
    enemyVisible: false, aimed: false, off: 0.10, inkFrac: 0.6,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.04, wantPitch: -0.02,
  };
  for (let i = 0; i < 3; i++) {
    lunaActor.intent.fire = false;
    applyBlasterCombat(lunaBrain, {}, lunaActor, 1 / 60, move, lunaCoverCtx);
    assert.equal(lunaActor.intent.fire, true, `Luna fires cover shell #${i + 1}`);
  }
  lunaActor.intent.fire = false;
  applyBlasterCombat(lunaBrain, {}, lunaActor, 1 / 60, move, lunaCoverCtx);
  assert.equal(lunaActor.intent.fire, false, 'Luna stops cover blasting after 3 shells');

  // 2. Range Blaster (s3-blaster-long): patient single-shot placement (tighter aim tolerance & higher cover ink floor)
  const longActor = makeBlasterActor({
    weapon: { id: 's3-blaster-long', kind: 'blaster', range: 14.5, splashRadius: 2.5, catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Long_00' } },
  });
  const longBrain = { react: 0, strafeS: 0.3, target: { id: 11 }, lostTimer: 0.3, t: 1.0, ph1: 0.5 };
  applyBlasterCombat(longBrain, {}, longActor, 1 / 60, move, {
    family: 'blaster', dist: 13.5, range: 14.5, dx: 0, dz: 13.5,
    enemyVisible: true, aimed: false, off: 0.15, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.05, wantPitch: -0.02,
  });
  assert.equal(longActor.intent.fire, false, 'Long Blaster holds sloppy off=0.15 shot to place airburst carefully');
  applyBlasterCombat(longBrain, {}, longActor, 1 / 60, move, {
    family: 'blaster', dist: 13.5, range: 14.5, dx: 0, dz: 13.5,
    enemyVisible: false, aimed: false, off: 0.08, inkFrac: 0.18,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.05, wantPitch: -0.02,
  });
  assert.equal(longActor.intent.fire, false, 'Long Blaster conserves heavy 11% ink instead of low-ink cover spam');

  // 3. Clash Blaster (s3-blaster-lightshort): fast run-speed forward pressure inside sweet spot & no squid interrupt
  const clashMove = makeMove(0, 1);
  const clashActor = makeBlasterActor({
    weapon: { id: 's3-blaster-lightshort', kind: 'blaster', range: 9.5, splashRadius: 2.9, fireInterval: 0.33, catalogRecord: { family: 'blaster', sourceRow: 'Blaster_LightShort_00' } },
  });
  clashActor.weaponRunner.cooldown = 0.22;
  applyBlasterCombat({ react: 0, strafeS: 0.5, target: { id: 12 }, t: 1.0, ph1: 0.1 }, {}, clashActor, 1 / 60, clashMove, {
    family: 'blaster', dist: 8.1, range: 9.5, dx: 0, dz: 8.1,
    enemyVisible: true, aimed: true, off: 0.04, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.01, wantPitch: -0.03,
  });
  assert.equal(clashActor.intent.fire, true, 'Clash Blaster keeps continuous fire pressure');
  assert.equal(clashActor.intent.squid, false, 'Clash Blaster never interrupts 20F cadence with squid swim');
  assert.ok(clashMove.z > 0.05, 'Clash Blaster applies forward chase bias inside its sweet spot');

  // 4. Rapid Blaster Pro (s3-blaster-lightlong): never wastes grounded 0° precision on evasive jumps even when hit
  const proActor = makeBlasterActor({
    lastDamage: 0.05,
    weapon: { id: 's3-blaster-lightlong', kind: 'blaster', range: 16.0, splashRadius: 2.4, catalogRecord: { family: 'blaster', sourceRow: 'Blaster_LightLong_00' } },
  });
  applyBlasterCombat({ react: 0, strafeS: 0.2, target: { id: 13 }, t: 1.0, ph1: 0.5, _nearWater: () => false }, {}, proActor, 1 / 60, move, {
    family: 'blaster', dist: 12.5, range: 16.0, dx: 0, dz: 12.5,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(proActor.intent.jump, false, 'Rapid Blaster Pro preserves grounded 0° accuracy instead of evasive jumping');
});

test('applyBlasterCombat enforces stricter kiting threshold for Rapid Blaster Pro than Nova Blaster', () => {
  const moveRapid = makeMove(0, 1);
  const rapidActor = makeBlasterActor({
    weapon: {
      id: 's3-blaster-lightlong',
      kind: 'blaster',
      range: 16.0,
      splashRadius: 2.4,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_LightLong_00' },
    },
  });
  // At 76% of range (12.16m): Rapid Pro (sweetMin 0.82) must kite backwards
  applyBlasterCombat({ react: 0, strafeS: 0.2, target: { id: 3 }, t: 1.0, ph1: 0.2 }, {}, rapidActor, 1 / 60, moveRapid, {
    family: 'blaster', dist: 12.16, range: 16.0, dx: 0, dz: 12.16,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.ok(moveRapid.z < -0.6, 'Rapid Blaster Pro kites backwards at 76% range');

  const moveNova = makeMove(0, 1);
  const novaActor = makeBlasterActor({
    weapon: {
      id: 's3-blaster-short',
      kind: 'blaster',
      range: 8.5,
      splashRadius: 2.8,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Short_00' },
    },
  });
  // At 76% of range (6.46m): Nova (sweetMin 0.72) holds sweet spot and strafes laterally instead of hard-backpedaling
  applyBlasterCombat({ react: 0, strafeS: 0.8, target: { id: 3 }, t: 1.0, ph1: 0.2 }, {}, novaActor, 1 / 60, moveNova, {
    family: 'blaster', dist: 6.46, range: 8.5, dx: 0, dz: 6.46,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.ok(Math.abs(moveNova.x) > 0.7, 'Nova Blaster strafes laterally inside its 76% sweet spot');
});

test('organic human-like variation modulates sweep step across different bot phases without robotic lockstep', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);
  const a1 = makeBlasterActor({ id: 1 });
  const a2 = makeBlasterActor({ id: 2 });
  const b1 = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0, aimPitch: -0.06, t: 1.0, ph1: 0.2 };
  const b2 = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, sweep: 0, aimPitch: -0.06, t: 1.0, ph1: 3.1 };

  // Emit a shot on both bots
  a1.weaponRunner.cooldown = 0.78;
  a2.weaponRunner.cooldown = 0.78;
  applyBlasterTurfPaint(b1, G, a1, 1 / 60, move, true, 0, 0.8, { pitchReady: true, wantPaintNow: true });
  applyBlasterTurfPaint(b2, G, a2, 1 / 60, move, true, 0, 0.8, { pitchReady: true, wantPaintNow: true });

  assert.notEqual(Math.abs(b1.sweep), Math.abs(b2.sweep), 'different bot phases produce organic non-identical sweep steps');
  assert.ok(Math.abs(b1.sweep) > 0.3 && Math.abs(b2.sweep) > 0.3, 'both steps remain calibrated to avoid tip-blast overlap');
});

test('Blaster AI clears s3BlasterCancelLatch deadlock and protects active s3BlasterWindup', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);

  // Clash Blaster with latched s3BlasterCancelLatch must release fire for 1 tick to break deadlock
  const clashActor = makeBlasterActor({
    weapon: {
      id: 's3-blaster-lightshort',
      kind: 'blaster',
      range: 9.5,
      fireInterval: 0.33,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_LightShort_00' },
    },
  });
  clashActor.intent.fire = true;
  clashActor.weaponRunner.s3BlasterCancelLatch = true;
  const clashBrain = { _turfPaintLatch: true, _turfPaintValidated: true, react: 0, strafeS: 0.4, t: 1.0 };

  applyBlasterTurfPaint(clashBrain, G, clashActor, 1 / 60, move, true, 0, 0.85, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(clashActor.intent.fire, false, 'turf paint releases fire to clear s3BlasterCancelLatch');
  assert.equal(clashActor.intent.squid, false);

  clashActor.intent.fire = true;
  applyBlasterCombat(clashBrain, G, clashActor, 1 / 60, move, {
    family: 'blaster', dist: 8.0, range: 9.5, dx: 0, dz: 8.0,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.85,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(clashActor.intent.fire, false, 'combat releases fire to clear s3BlasterCancelLatch');

  // Native blaster during s3BlasterWindup must not submerge into microRecover squid
  const hotActor = makeBlasterActor();
  hotActor.weaponRunner.s3BlasterWindup = 0.12;
  const hotBrain = { _turfPaintLatch: true, _turfPaintValidated: true, t: 1.0, ph1: 0.3 };
  applyBlasterTurfPaint(hotBrain, G, hotActor, 1 / 60, move, true, 0, 0.25, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(hotActor.intent.squid, false, 'does not interrupt active s3BlasterWindup with squid form');
});

test('Blaster AI yields cleanly to sub throws, active specials, superJumpState, and wall climbing', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = makeMove(0, 1);

  // Sub bomb aim (_bombAim / it.sub): must not fire or squid or overwrite coverBombLift pitch
  const subActor = makeBlasterActor({ intent: { fire: true, squid: true, jump: false, sub: true, special: false } });
  const subBrain = { react: 0, target: { id: 4 }, lostTimer: 0.3, _bombAim: true, t: 1.0 };
  const subRes = applyBlasterCombat(subBrain, G, subActor, 1 / 60, move, {
    family: 'blaster', dist: 10.0, range: 10.5, dx: 0, dz: 10.0,
    enemyVisible: false, aimed: false, off: 0.05, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0.25,
  });
  assert.equal(subRes, null, 'does not overwrite cover-bomb pitch');
  assert.equal(subActor.intent.fire, false, 'clears fire when throwing sub');
  assert.equal(subActor.intent.squid, false, 'clears squid when throwing sub');

  // Active special (e.g., Zipcaster): preserves existing intent.fire (normalIntent) without mutating coverShots or move
  const spMove = makeMove(0, 1);
  const spActor = makeBlasterActor({
    specialActive: { kind: 'zipcaster' },
    intent: { fire: true, squid: false, jump: false, sub: false, special: false },
  });
  const spBrain = { react: 0, target: { id: 4 }, t: 1.0 };
  const spRes = applyBlasterCombat(spBrain, G, spActor, 1 / 60, spMove, {
    family: 'blaster', dist: 4.5, range: 10.5, dx: 0, dz: 4.5,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: -0.25,
  });
  assert.equal(spRes, null);
  assert.equal(spActor.intent.fire, true, 'preserves native fire intent during specialActive (Zipcaster)');
  assert.equal(spMove.z, 1, 'does not overwrite move vector during specialActive');

  // Climbing wall or superJumpState: must not knock bot out of squid form
  const climbActor = makeBlasterActor({
    climbing: true,
    intent: { fire: false, squid: true, jump: false, sub: false, special: false },
  });
  const climbBrain = { _turfPaintLatch: true, _turfPaintValidated: true, t: 1.0 };
  applyBlasterTurfPaint(climbBrain, G, climbActor, 1 / 60, move, true, 0, 0.9, {
    pitchReady: true,
    wantPaintNow: true,
  });
  assert.equal(climbActor.intent.fire, false);
  assert.equal(climbActor.intent.squid, true, 'preserves squid form while climbing');
});

test('Blaster AI resets stale state on death/respawn (netLife / !alive), prevents ink-exhausted dry fire, and guards NaN inputs', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const target = { id: 77 };
  const actor = makeBlasterActor({ alive: true, netLife: 1 });
  const brain = { react: 0, target, lostTimer: 0.3, t: 1.0 };
  const move = makeMove(0, 1);
  const coverCtx = {
    family: 'blaster', dist: 10.0, range: 10.5, dx: 0, dz: 10.0,
    enemyVisible: false, aimed: false, off: 0.05, inkFrac: 0.7,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: -0.02,
  };

  // Exhaust 2-shot cover budget in life 1
  applyBlasterCombat(brain, G, actor, 1 / 60, move, coverCtx);
  applyBlasterCombat(brain, G, actor, 1 / 60, move, coverCtx);
  actor.intent.fire = false;
  applyBlasterCombat(brain, G, actor, 1 / 60, move, coverCtx);
  assert.equal(actor.intent.fire, false, 'budget exhausted in life 1');

  // Respawn (netLife increments to 2) -> cover budget resets cleanly
  actor.netLife = 2;
  applyBlasterCombat(brain, G, actor, 1 / 60, move, coverCtx);
  assert.equal(actor.intent.fire, true, 'fresh life resets stale cover-shot budget');

  // Cover blast while submerged in squid form emerges first without burning coverShots
  actor.netLife = 3;
  actor.form = 'squid';
  actor.intent.fire = false;
  actor.intent.squid = true;
  applyBlasterCombat(brain, G, actor, 1 / 60, move, coverCtx);
  assert.equal(actor.intent.squid, false, 'emerges from squid before cover blast');
  assert.equal(actor.intent.fire, false, 'does not burn cover shot while submerged');
  actor.form = 'kid';
  applyBlasterCombat(brain, G, actor, 1 / 60, move, coverCtx);
  assert.equal(actor.intent.fire, true, 'fires cover shot once emerged');

  // Ink exhaustion: Long Blaster (11% ink/shot) at 6% ink must clear bots.js fire intent
  const longActor = makeBlasterActor({
    weapon: {
      id: 's3-blaster-long',
      kind: 'blaster',
      range: 14.5,
      inkPerShot: 11,
      catalogRecord: { family: 'blaster', sourceRow: 'Blaster_Long_00' },
    },
    intent: { fire: true, squid: false, jump: false, sub: false, special: false },
  });
  applyBlasterCombat({ react: 0, target: { id: 8 }, t: 1.0 }, G, longActor, 1 / 60, move, {
    family: 'blaster', dist: 13.0, range: 14.5, dx: 0, dz: 13.0,
    enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.06,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(longActor.intent.fire, false, 'clears dry-fire intent when ink is below shot cost');

  // NaN / undefined inputs never produce NaN in move or aim output
  const nanMove = makeMove(0, 1);
  const nanBrain = { react: 0, t: Number.NaN, ph1: Number.NaN, strafeS: Number.NaN, sweep: Number.NaN };
  const nanActor = makeBlasterActor();
  const nanRes = applyBlasterCombat(nanBrain, G, nanActor, Number.NaN, nanMove, {
    family: 'blaster', dist: Number.NaN, range: Number.NaN, dx: Number.NaN, dz: Number.NaN,
    enemyVisible: true, aimed: true, off: Number.NaN, inkFrac: Number.NaN,
    idealYaw: Number.NaN, idealPitch: Number.NaN, wantYaw: Number.NaN, wantPitch: Number.NaN,
  });
  assert.equal(nanRes, null);
  assert.equal(nanActor.intent.fire, false);
  assert.ok(Number.isFinite(nanMove.x) && Number.isFinite(nanMove.z), 'move stays finite under NaN inputs');
});
