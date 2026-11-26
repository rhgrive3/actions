// Dedicated Splatoon 3 Roller Bot AI module (Turf War painting & combat).
// Purely operates on bot intent/movement/aim decisions with zero weapon stat cheats,
// zero aimError removal, and zero wall-hack vision.
// All hot paths are O(1) and zero-allocation (reusable per-brain aimOut objects).
//
// Grounded in authentic Splatoon 3 Roller guides & frame data:
// - Splatoon 3 Wiki* Roller family: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC%E5%B1%9E
// - Splat Roller:    https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC
// - Carbon Roller:   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%AB%E3%83%BC%E3%83%9C%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC
// - Dynamo Roller:   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%80%E3%82%A4%E3%83%8A%E3%83%A2%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC
// - Flingza Roller:  https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%B4%E3%82%A1%E3%83%AA%E3%82%A2%E3%83%96%E3%83%AB%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC
// - Big Swig Roller: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%AF%E3%82%A4%E3%83%89%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BC
// - MatchGuy Turf Painting Guide: https://spl3.ink/matchguy-vol03/

const EPS = 1e-6;
const GOLDEN_ANGLE = 2.399963229728653;
const _archetypeCache = new WeakMap();

/**
 * Per-archetype Splatoon 3 Roller tuning profiles.
 * Preserves the WeaponRollerCompact rollHold = 0.15 test contract.
 */
export const ROLLER_ARCHETYPES = Object.freeze({
  normal: Object.freeze({
    id: 'normal',
    rollHold: 0.45,
    swimGapOwn: 0.22,
    swimGapDry: 0.04,
    paintPitch: -0.20,
    paintStyle: 'flick_roll', // Splat Roller: balanced horizontal flick + calibrated roll
    horizKillDist: 7.2, // 1.4-line 1-shot horizontal flick
    horizMaxDist: 8.4,
    vertMinDist: 6.8,
    vertMaxDist: 13.5, // 3.2-line vertical flick
    preferredCombatDist: 4.5,
    keepDistMin: 2.4,
    elevVertDy: 0.75, // Proactive jump-vertical flick against ledge/high-ground foes
    canCrushKill: true, // 125 roll damage
    preferVerticalCombat: false,
    stealthApproach: false,
    minFlickInk: 0.09,
    minHorizFlickInk: 0.09,
    minVertFlickInk: 0.09,
    minPaintInk: 0.10,
    inkRecoverFloor: 0.22,
    vertPitchBias: -0.05,
    rollJitterAmp: 0.10,
    swimJitterAmp: 0.12,
    strafeFreq: 2.35,
    approachSideBias: 0.68,
    cooldownSwimMin: 0.12,
  }),
  compact: Object.freeze({
    id: 'compact',
    rollHold: 0.15, // Preserves WeaponRollerCompact existing test contract
    swimGapOwn: 0.22,
    swimGapDry: 0.04,
    paintPitch: -0.20,
    paintStyle: 'flick_roll', // Carbon Roller: rapid flick + brief roll + fast squid burst
    horizKillDist: 5.2, // 1.0-line 1-shot horizontal flick (31F cadence)
    horizMaxDist: 6.4,
    vertMinDist: 4.8, // Agile jump-vertical flick (42F) bridges short horizontal reach
    vertMaxDist: 11.2, // 2.7-line vertical reach
    preferredCombatDist: 3.2,
    keepDistMin: 1.8,
    elevVertDy: 0.70,
    canCrushKill: false, // 70 roll damage: bounces off full-HP targets
    preferVerticalCombat: false,
    stealthApproach: true, // Lightweight sharking / angled squid ambush
    minFlickInk: 0.05,
    minHorizFlickInk: 0.05,
    minVertFlickInk: 0.06,
    minPaintInk: 0.08,
    inkRecoverFloor: 0.16,
    vertPitchBias: -0.04,
    rollJitterAmp: 0.08, // Clamped <= maxRollHold to honor 0.15s ceiling
    swimJitterAmp: 0.14,
    strafeFreq: 3.30, // Snappy lightweight juking
    approachSideBias: 0.78, // Deeper flank angle when sharking in
    cooldownSwimMin: 0.06, // Re-submerges rapidly between swings
  }),
  heavy: Object.freeze({
    id: 'heavy',
    rollHold: 0.16,
    swimGapOwn: 0.22,
    swimGapDry: 0.04,
    paintPitch: -0.15,
    paintStyle: 'horiz_flick', // Dynamo: heavy horizontal flick suppression (far better than slow roll)
    horizKillDist: 11.8, // 2.1-line 1-shot horizontal flick (66F)
    horizMaxDist: 13.8, // 3.6-line splash pressure
    vertMinDist: 11.5,
    vertMaxDist: 19.5, // 4.8-line long vertical suppression (85F)
    preferredCombatDist: 9.5,
    keepDistMin: 6.8, // Avoids over-committing into point-blank duels
    elevVertDy: 0.85,
    canCrushKill: true, // 125 roll damage
    preferVerticalCombat: false,
    stealthApproach: false,
    minFlickInk: 0.21, // 21% ink per swing
    minHorizFlickInk: 0.21,
    minVertFlickInk: 0.21,
    minPaintInk: 0.22,
    inkRecoverFloor: 0.38, // Refills to a comfortable margin before resuming heavy swings
    vertPitchBias: -0.04,
    rollJitterAmp: 0.08,
    swimJitterAmp: 0.15,
    strafeFreq: 1.45, // Deliberate heavyweight spacing
    approachSideBias: 0.56,
    cooldownSwimMin: 0.07, // Uses long post-swing downtime to recover ink in own turf
  }),
  hunter: Object.freeze({
    id: 'hunter',
    rollHold: 0.20,
    swimGapOwn: 0.22,
    swimGapDry: 0.04,
    paintPitch: -0.14,
    paintStyle: 'vert_flick', // Flingza: 5.2-line vertical flick turf coverage + fast close horizontal flick
    horizKillDist: 6.8, // 1.4-line fast horizontal flick (40F, 8% ink)
    horizMaxDist: 8.0,
    vertMinDist: 6.5,
    vertMaxDist: 16.5, // 4.1-line combat / 5.2-line paint vertical flick (72F, 12% ink)
    preferredCombatDist: 8.2,
    keepDistMin: 3.6,
    elevVertDy: 0.75,
    canCrushKill: true, // 125 roll damage
    preferVerticalCombat: false,
    stealthApproach: false,
    minFlickInk: 0.12, // 12% vertical
    minHorizFlickInk: 0.08, // 8% horizontal: still allows close defensive flick when ink is 8-12%
    minVertFlickInk: 0.12,
    minPaintInk: 0.14,
    inkRecoverFloor: 0.28,
    vertPitchBias: -0.06,
    rollJitterAmp: 0.10,
    swimJitterAmp: 0.14,
    strafeFreq: 2.15,
    approachSideBias: 0.64,
    cooldownSwimMin: 0.09,
  }),
  wide: Object.freeze({
    id: 'wide',
    rollHold: 1.15,
    swimGapOwn: 0.22,
    swimGapDry: 0.04,
    paintPitch: -0.20,
    paintStyle: 'wide_roll', // Big Swig: wide ultra-efficient roll turfing + vertical-primary combat
    horizKillDist: 3.4, // Horizontal flick max 70 dmg (no 1-shot); emergency close sweep only
    horizMaxDist: 7.2,
    vertMinDist: 3.2, // Vertical flick is the only 1-shot (1.6-line) and strong 2-shot (3.9-line, 50F)
    vertMaxDist: 15.5,
    preferredCombatDist: 7.5,
    keepDistMin: 4.0,
    elevVertDy: 0.70,
    canCrushKill: false, // 70 roll damage
    preferVerticalCombat: true,
    stealthApproach: false,
    minFlickInk: 0.09,
    minHorizFlickInk: 0.09,
    minVertFlickInk: 0.09,
    minPaintInk: 0.10,
    inkRecoverFloor: 0.22,
    vertPitchBias: -0.05,
    rollJitterAmp: 0.12,
    swimJitterAmp: 0.14,
    strafeFreq: 2.10,
    approachSideBias: 0.62,
    cooldownSwimMin: 0.10,
  }),
});

function clampVal(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function setMove(move, x, z) {
  if (!move) return;
  if (typeof move.set === 'function') {
    move.set(x, 0, z);
  } else {
    move.x = x;
    move.z = z;
  }
}

function resolveMatchTimeLeft(G, ctx) {
  if (Number.isFinite(ctx?.timeLeft)) return ctx.timeLeft;
  if (Number.isFinite(G?.match?.time)) return G.match.time;
  if (Number.isFinite(G?.timeLeft)) return G.timeLeft;
  return 120;
}

function resolveActorLife(actor) {
  if (Number.isSafeInteger(actor?.netLife)) return actor.netLife;
  if (Number.isSafeInteger(actor?.net?.lastLife)) return actor.net.lastLife;
  return null;
}

/**
 * Computes a deterministic lightweight O(1) phase seed from actor identity.
 */
function computeActorSeed(actor) {
  const id = actor?.id;
  if (typeof id === 'number' && Number.isFinite(id)) {
    return ((id * 2654435761) >>> 0) % 6283 * 0.001;
  }
  if (typeof id === 'string' && id.length > 0) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 6283) * 0.001;
  }
  return 0.73;
}

/**
 * Lightweight O(1) quasi-periodic phase jitter in [-1, 1] with zero allocations.
 */
function phaseWave(seed, step) {
  const a = seed + step * GOLDEN_ANGLE;
  return Math.sin(a) * 0.7 + Math.sin(a * 0.47 + 1.13) * 0.3;
}

/**
 * Resolves the specific Splatoon 3 Roller archetype (Carbon, Dynamo, Flingza, Big Swig, Splat).
 */
export function resolveRollerArchetype(weapon) {
  if (!weapon || typeof weapon !== 'object') return ROLLER_ARCHETYPES.normal;
  const actorName =
    weapon.sourceMainActor ||
    weapon.catalogRecord?.sourceActor ||
    weapon.catalogRecord?.sourceMainActor ||
    '';
  const wId = typeof weapon.id === 'string' ? weapon.id : '';
  const cached = _archetypeCache.get(weapon);
  if (cached && cached.actorName === actorName && cached.wId === wId) {
    return cached.arch;
  }

  const lowerId = wId.toLowerCase();
  let arch = ROLLER_ARCHETYPES.normal;
  if (actorName === 'WeaponRollerHeavy' || lowerId.includes('dynamo') || lowerId.includes('heavy')) {
    arch = ROLLER_ARCHETYPES.heavy;
  } else if (actorName === 'WeaponRollerHunter' || lowerId.includes('flingza') || lowerId.includes('hunter')) {
    arch = ROLLER_ARCHETYPES.hunter;
  } else if (actorName === 'WeaponRollerWide' || lowerId.includes('big_swig') || lowerId.includes('wide')) {
    arch = ROLLER_ARCHETYPES.wide;
  } else if (actorName === 'WeaponRollerCompact' || lowerId.includes('carbon') || lowerId.includes('compact')) {
    arch = ROLLER_ARCHETYPES.compact;
  }

  _archetypeCache.set(weapon, { actorName, wId, arch });
  return arch;
}

/**
 * Checks whether the roller is currently mid-swing windup (works for both native and catalog rollers).
 */
function isRollerSwinging(wr) {
  if (!wr) return false;
  if (typeof wr.flick === 'number' && wr.flick >= 0) return true;
  if (wr.catalogState?.pending) return true;
  return false;
}

/**
 * Checks whether the post-roll-stop main lock (16F in roller.mjs) is currently active.
 */
function isRollStopMainLocked(wr, G) {
  const lock = wr?.s3RollStop;
  if (!lock) return false;
  const now = typeof G?.time === 'number' ? G.time : 0;
  return typeof lock.main === 'number' && now + EPS < lock.main;
}

/**
 * Checks whether the post-roll-stop squid lock (6F in roller.mjs) or post-flick squid lock is active.
 */
function isSquidLocked(wr, G) {
  if (!wr) return false;
  if ((wr.s3FlickPostSquid || 0) > EPS) return true;
  const lock = wr.s3RollStop;
  if (lock && typeof lock.squid === 'number') {
    const now = typeof G?.time === 'number' ? G.time : 0;
    if (now + EPS < lock.squid) return true;
  }
  return false;
}

function syncRollerLife(brain, actor) {
  const life = resolveActorLife(actor);
  if (life === null) return;
  if (brain._rollerLife !== undefined && brain._rollerLife !== null && brain._rollerLife !== life) {
    resetRollerTransientState(brain);
  }
  brain._rollerLife = life;
}

function ensureCombatState(brain, actor) {
  let st = brain._rollerCombatState;
  if (!st) {
    st = brain._rollerCombatState = {
      phase: 'idle', // 'idle' | 'prep_release' | 'jump_vert' | 'commit_flick'
      timer: 0,
      wantVertical: false,
      lastDist: 0,
      tempoTime: 0,
      seed: computeActorSeed(actor),
      recoveringInk: false,
      aimOut: { wantYaw: 0, wantPitch: 0 },
    };
  }
  syncRollerLife(brain, actor);
  return st;
}

function ensurePaintState(brain, actor) {
  let st = brain._rollerPaintState;
  if (!st) {
    st = brain._rollerPaintState = {
      phase: 'idle', // 'idle' | 'prep_release' | 'jump_vert' | 'commit_flick'
      timer: 0,
      flickCount: 0,
      rollCycles: 0,
      seed: computeActorSeed(actor),
      recoveringInk: false,
      aimOut: { wantYaw: 0, wantPitch: 0 },
    };
  }
  syncRollerLife(brain, actor);
  return st;
}

function resetRollerTransientState(brain) {
  brain._rollerRollTime = 0;
  brain._rollerSwimGap = 0;
  const p = brain._rollerPaintState;
  if (p) {
    p.phase = 'idle';
    p.timer = 0;
    p.recoveringInk = false;
  }
  const c = brain._rollerCombatState;
  if (c) {
    c.phase = 'idle';
    c.timer = 0;
    c.wantVertical = false;
    c.recoveringInk = false;
  }
}

function setAimOut(aimOut, wantYaw, wantPitch) {
  aimOut.wantYaw = wantYaw;
  aimOut.wantPitch = wantPitch;
  return aimOut;
}

/**
 * Computes natural, non-robotic swim-recovery duration after a roll cycle.
 * Preserves the exact baseline contract (arch.swimGapOwn) on the initial cycle (rollCycles === 0).
 */
function computeNaturalSwimGap(arch, pState, onOwnInk, inkFrac, timeLeft) {
  const baseGap = onOwnInk ? arch.swimGapOwn : arch.swimGapDry;
  if (pState.rollCycles <= 0) return baseGap;
  const jitter = 1 + phaseWave(pState.seed, pState.rollCycles + 3.1) * arch.swimJitterAmp;
  // Recover slightly longer when ink is getting low; hurry up during the final 10 seconds
  let contextScale = 1.0;
  if (onOwnInk && inkFrac < 0.35) {
    contextScale = arch.id === 'heavy' ? 1.45 : 1.25;
  } else if (timeLeft <= 10.0 && inkFrac > 0.30) {
    contextScale = 0.78;
  }
  return clampVal(baseGap * jitter * contextScale, onOwnInk ? 0.12 : 0.02, 0.42);
}

/**
 * Applies authentic Splatoon 3 Roller Turf War painting mechanics:
 * - Splat / Carbon / Big Swig: horizontal flick -> calibrated roll hold (covering flick root gaps
 *   and overriding long flick ink-lock with shorter roll ink-lock) -> squid swim recovery.
 *   Never aborts flick-to-roll transition during post-flick cooldown when rollHold has not expired.
 * - Dynamo: heavy horizontal flick cadence with ink recovery hysteresis (avoids depleted swings).
 * - Flingza: jump-vertical flick cadence for 5.2-line turf coverage, falling back to quick roll on dry feet.
 * - Big Swig: wide roll turfing with gentle organic weave and early stop on already-painted sectors.
 * - Preserves WeaponRollerCompact rollHold = 0.15 and _rollerRollTime / _rollerSwimGap state contracts.
 */
export function applyRollerTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx = {}) {
  const it = actor?.intent;
  if (!brain || !it) return null;
  const wr = actor.weaponRunner;
  const pState = ensurePaintState(brain, actor);
  if (actor.alive === false || actor.superJumpState) {
    resetRollerTransientState(brain);
    it.fire = false;
    it.jump = false;
    it.squid = false;
    return null;
  }
  if (actor.specialActive) {
    resetRollerTransientState(brain);
    return null;
  }
  if (it.special || it.sub || wr?.aimingSub) {
    pState.phase = 'idle';
    pState.timer = 0;
    brain._rollerRollTime = 0;
    it.fire = false;
    it.jump = false;
    it.squid = false;
    return null;
  }
  if (actor.climbing) {
    pState.phase = 'idle';
    pState.timer = 0;
    brain._rollerRollTime = 0;
    it.fire = false;
    return null;
  }

  const stepDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  const safeInkFrac = Number.isFinite(inkFrac) ? clampVal(inkFrac, 0, 1) : 0;
  inkFrac = safeInkFrac;
  const arch = resolveRollerArchetype(actor.weapon);
  const cache = ctx?.cache || brain._turfMultiCache || null;
  const timeLeft = resolveMatchTimeLeft(G, ctx);
  const coolerPending = !!brain._coolerPickupPending;
  const maxRollHold =
    Number.isFinite(ctx?.profile?.rollHold) && ctx.profile.rollHold > 0
      ? ctx.profile.rollHold
      : arch.rollHold;
  const swinging = isRollerSwinging(wr);
  const rolling = !!wr?.rolling;
  const cooldown = Number.isFinite(wr?.cooldown) ? wr.cooldown : 0;
  const onOwnInk = actor.groundTeam === 1;
  const onEnemyInk = actor.groundTeam === 2;
  const needPaint = Boolean(brain._turfPaintLatch || !onOwnInk || (timeLeft <= 6.5 && inkFrac > 0.18));

  // Clear combat commit state when back in paint mode
  if (brain._rollerCombatState && brain._rollerCombatState.phase !== 'idle') {
    brain._rollerCombatState.phase = 'idle';
    brain._rollerCombatState.timer = 0;
    brain._rollerCombatState.wantVertical = false;
  }

  // 1. Track active roll duration (preserves existing _rollerRollTime / _rollerSwimGap contract)
  if (rolling) {
    brain._rollerRollTime = (Number.isFinite(brain._rollerRollTime) ? brain._rollerRollTime : 0) + stepDt;
    pState.phase = 'idle';
    pState.timer = 0;
  } else {
    brain._rollerRollTime = 0;
  }
  if (!Number.isFinite(brain._rollerSwimGap)) {
    brain._rollerSwimGap = 0;
  }

  // Compute natural roll hold with lightweight phase jitter (after initial cycle) and turf context.
  // Always honors the WeaponRollerCompact maxRollHold ceiling (0.15s) and initial cycle contract.
  let effectiveRollHold = maxRollHold;
  if (pState.rollCycles > 0) {
    const wave = phaseWave(pState.seed, pState.rollCycles * 1.37);
    let scaledHold = maxRollHold * (1 + wave * arch.rollJitterAmp);
    if (cache?.multiActive && cache.effEnemy >= 0.25 && inkFrac > 0.28) {
      // Lean into rolling slightly longer when sweeping through enemy turf
      scaledHold *= 1.12;
    } else if (inkFrac < 0.25) {
      scaledHold *= 0.85;
    }
    effectiveRollHold = arch.id === 'compact'
      ? Math.min(maxRollHold, Math.max(0.11, scaledHold))
      : clampVal(scaledHold, 0.12, maxRollHold * 1.18);
  }

  // If the area ahead is already well painted in own ink and has no enemy ink, finish wide rolls early
  // so the bot swims quickly to the next unpainted sector instead of rolling over own ink.
  if (
    rolling &&
    cache?.multiActive &&
    cache.effOwn >= 0.80 &&
    cache.effEnemy < 0.04 &&
    onOwnInk &&
    maxRollHold > 0.25
  ) {
    effectiveRollHold = Math.min(effectiveRollHold, 0.25);
  }

  // 2. Active squid-swim gap after completing a roll cycle (restores ink & covers distance fast)
  if ((brain._rollerSwimGap || 0) > 0) {
    brain._rollerSwimGap = Math.max(0, brain._rollerSwimGap - stepDt);
    it.fire = false;
    it.jump = false;
    pState.phase = 'idle';
    pState.timer = 0;
    if (!coolerPending && onOwnInk && wantMove && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
    return null;
  }

  // 3. Roll-hold expiry -> transition cleanly to squid swim recovery
  if ((brain._rollerRollTime || 0) >= effectiveRollHold) {
    brain._rollerRollTime = 0;
    brain._rollerSwimGap = computeNaturalSwimGap(arch, pState, onOwnInk, inkFrac, timeLeft);
    pState.rollCycles++;
    it.fire = false;
    it.jump = false;
    pState.phase = 'idle';
    pState.timer = 0;
    if (!coolerPending && onOwnInk && wantMove && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
    return null;
  }

  // 4. Mid-swing handling (strictly preserve catalogState.pending fire suppression contract)
  if (wr?.catalogState?.pending) {
    pState.phase = 'idle';
    pState.timer = 0;
    it.fire = false;
    it.squid = false;
    it.jump = false;
    return null;
  }
  if (swinging) {
    pState.phase = 'idle';
    pState.timer = 0;
    it.squid = false;
    it.jump = false;
    const wantFollowupRoll =
      (arch.paintStyle === 'flick_roll' || arch.paintStyle === 'wide_roll') ||
      !onOwnInk;
    it.fire = wantFollowupRoll && wantMove && inkFrac > 0.08;
    return null;
  }

  // 5. Continue active roll smoothly until effectiveRollHold expires (avoid triggering 16F rollStop lock!)
  if (rolling) {
    if (wantMove && inkFrac > 0.06 && (needPaint || (brain._rollerRollTime || 0) < effectiveRollHold)) {
      it.fire = true;
      it.squid = false;
      it.jump = false;
      // Big Swig wide-roll整地: apply a subtle organic weave when rolling over unpainted turf
      if (arch.paintStyle === 'wide_roll' && move && (brain._rollerRollTime || 0) > 0.28) {
        const mx = move.x || 0;
        const mz = move.z || 0;
        const ml = Math.hypot(mx, mz);
        if (ml > 0.01) {
          const weave = Math.sin((brain._rollerRollTime || 0) * 3.1 + pState.seed) * 0.16;
          const nx = mx / ml;
          const nz = mz / ml;
          const wx = nx - nz * weave;
          const wz = nz + nx * weave;
          const wl = Math.hypot(wx, wz);
          if (wl > 0.01) setMove(move, wx / wl, wz / wl);
        }
      }
    } else {
      brain._rollerRollTime = 0;
      brain._rollerSwimGap = computeNaturalSwimGap(arch, pState, onOwnInk, inkFrac, timeLeft);
      pState.rollCycles++;
      it.fire = false;
      if (!coolerPending && onOwnInk && wantMove && !isSquidLocked(wr, G)) it.squid = true;
    }
    return null;
  }

  // 6. Respect post-roll-stop lock: swim if possible instead of spamming blocked fire inputs
  if (isRollStopMainLocked(wr, G)) {
    it.fire = false;
    if (!coolerPending && onOwnInk && wantMove && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
    return null;
  }

  // 7. Low ink discipline with hysteresis (especially critical for Dynamo 21% / Flingza 12% per swing)
  if (inkFrac < arch.minPaintInk) {
    pState.recoveringInk = true;
  } else if (
    pState.recoveringInk &&
    (inkFrac >= arch.inkRecoverFloor || onEnemyInk || timeLeft <= 5.5)
  ) {
    pState.recoveringInk = false;
  }
  if (pState.recoveringInk) {
    it.fire = false;
    pState.phase = 'idle';
    pState.timer = 0;
    if (!coolerPending && onOwnInk && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
    return null;
  }

  // 8. If area ahead doesn't need paint, swim swiftly to the next unpainted sector
  if (!needPaint || !wantMove) {
    it.fire = false;
    pState.phase = 'idle';
    pState.timer = 0;
    if (!coolerPending && onOwnInk && wantMove && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
    return null;
  }

  // 9. Archetype-specific turf-painting cadence
  // 9a. Flingza Roller (WeaponRollerHunter): vertical flick turf painting (5.2-line reach + side droplets)
  if (arch.paintStyle === 'vert_flick' && !onEnemyInk && timeLeft > 3.5) {
    if (pState.phase === 'commit_flick') {
      pState.timer += stepDt;
      if (cooldown > 0.02 || pState.timer >= 0.16) {
        pState.phase = 'idle';
        pState.timer = 0;
        it.fire = false;
      } else {
        it.fire = true;
        it.squid = false;
      }
      return setAimOut(
        pState.aimOut,
        computePaintYaw(baseYaw, cache, pState.flickCount, pState.seed, 0.26),
        arch.paintPitch,
      );
    }
    if (pState.phase === 'jump_vert') {
      pState.timer += stepDt;
      if (!actor.grounded || pState.timer >= 0.08) {
        it.fire = true;
        it.squid = false;
        it.jump = false;
        pState.phase = 'commit_flick';
        pState.timer = 0;
        pState.flickCount++;
      } else {
        it.fire = false;
        it.squid = false;
        it.jump = true;
      }
      return setAimOut(
        pState.aimOut,
        computePaintYaw(baseYaw, cache, pState.flickCount, pState.seed, 0.26),
        arch.paintPitch,
      );
    }
    if (cooldown > EPS) {
      it.fire = false;
      if (!coolerPending && onOwnInk && cooldown > 0.07 && !isSquidLocked(wr, G)) {
        it.squid = true;
      }
      return null;
    }
    if (actor._prevIntent?.fire) {
      it.fire = false;
      it.squid = false;
      return null;
    }
    // Start jump-vertical flick
    if (actor.grounded !== false) {
      it.jump = true;
      it.fire = false;
      it.squid = false;
      pState.phase = 'jump_vert';
      pState.timer = 0;
    } else {
      it.fire = true;
      it.squid = false;
      pState.phase = 'commit_flick';
      pState.timer = 0;
      pState.flickCount++;
    }
    return setAimOut(
      pState.aimOut,
      computePaintYaw(baseYaw, cache, pState.flickCount, pState.seed, 0.26),
      arch.paintPitch,
    );
  }

  // 9b. Dynamo Roller (WeaponRollerHeavy): horizontal flick suppression with organic angle fan & ink discipline
  if (arch.paintStyle === 'horiz_flick' && onOwnInk) {
    if (pState.phase === 'commit_flick') {
      pState.timer += stepDt;
      if (cooldown > 0.02 || pState.timer >= 0.16) {
        pState.phase = 'idle';
        pState.timer = 0;
        it.fire = false;
      } else {
        it.fire = true;
        it.squid = false;
      }
      return setAimOut(
        pState.aimOut,
        computePaintYaw(baseYaw, cache, pState.flickCount, pState.seed, 0.32),
        arch.paintPitch,
      );
    }
    if (cooldown > EPS) {
      it.fire = false;
      if (!coolerPending && cooldown > 0.06 && !isSquidLocked(wr, G)) {
        it.squid = true;
      }
      return null;
    }
    if (actor._prevIntent?.fire) {
      it.fire = false;
      it.squid = false;
      return null;
    }
    it.fire = true;
    it.squid = false;
    pState.phase = 'commit_flick';
    pState.timer = 0;
    pState.flickCount++;
    return setAimOut(
      pState.aimOut,
      computePaintYaw(baseYaw, cache, pState.flickCount, pState.seed, 0.32),
      arch.paintPitch,
    );
  }

  // 9c. Splat / Carbon / Big Swig (and dry-foot fallback for Dynamo/Flingza):
  // Horizontal flick into calibrated roll hold.
  // Clear any stale Flingza/Dynamo phase if we fell through after stepping off own ink or into endgame.
  pState.phase = 'idle';
  pState.timer = 0;
  // Keep fire held continuously through cooldown <= 0.25 so the drum transitions smoothly into rolling
  // instead of aborting into squid during post-flick cooldown!
  if (cooldown > 0.25) {
    // Still in early post-flick lock before roll transition window
    it.fire = true;
    it.squid = false;
    return null;
  }

  if (actor._prevIntent?.fire && cooldown <= EPS && !rolling) {
    // Reset edge once if stuck with fire held and not rolling
    it.fire = false;
    it.squid = false;
    return null;
  }

  it.fire = true;
  it.squid = false;
  pState.flickCount++;
  const sweepStep = arch.id === 'wide' ? 0.24 : 0.18;
  return setAimOut(
    pState.aimOut,
    computePaintYaw(baseYaw, cache, pState.flickCount, pState.seed, sweepStep),
    arch.paintPitch,
  );
}

function computePaintYaw(baseYaw, cache, flickCount, seed, maxOffset) {
  if (!Number.isFinite(baseYaw)) return 0;
  const flankBias = Number.isFinite(cache?.flankBias) ? cache.flankBias : 0;
  // Smooth quasi-periodic fan using golden-angle progression (avoids robotic 3-step loop)
  const fan = phaseWave(seed, flickCount) * maxOffset * 0.72;
  if (Math.abs(flankBias) > 0.05) {
    return baseYaw + clampVal(flankBias * 0.75 + fan * 0.35, -maxOffset, maxOffset);
  }
  return baseYaw + clampVal(fan, -maxOffset, maxOffset);
}

/**
 * Applies authentic Splatoon 3 Roller combat AI:
 * - Preserves Round 1 emergeDelay protection (commit_flick holds fire through emergeDelay without squid chatter).
 * - Differentiates all 5 rollers with O(1) zero-allocation logic:
 *   * Carbon: rapid angled squid sharking, agile mid-close jump-vertical flicks, fast re-submerge.
 *   * Splat: horizontal 1-shot spacing + ledge/elevation jump-vertical flicks + point-blank crush.
 *   * Dynamo: mid-range heavy horizontal suppression, spacing discipline, and combat ink recovery.
 *   * Flingza: fast 8%-ink close horizontal defense + long 12%-ink mid-range vertical flicks.
 *   * Big Swig: vertical-flick primary combat (only 1-shot & strong 2-shot) + close wide sweep fallback.
 * - Uses lightweight O(1) phase modulation for human-like strafe/spacing rhythm while preserving full aimError.
 */
export function applyRollerCombat(brain, G, actor, dt, move, ctx = {}) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!brain || !it || !wr) return null;

  const cState = ensureCombatState(brain, actor);
  if (actor.alive === false || actor.superJumpState) {
    resetRollerTransientState(brain);
    it.fire = false;
    it.jump = false;
    it.squid = false;
    return null;
  }
  if (actor.specialActive) {
    resetRollerTransientState(brain);
    return null;
  }
  if (it.special || it.sub || wr.aimingSub) {
    cState.phase = 'idle';
    cState.timer = 0;
    cState.wantVertical = false;
    brain._rollerRollTime = 0;
    it.fire = false;
    it.jump = false;
    it.squid = false;
    return null;
  }
  if (actor.climbing) {
    cState.phase = 'idle';
    cState.timer = 0;
    cState.wantVertical = false;
    brain._rollerRollTime = 0;
    it.fire = false;
    return null;
  }

  const stepDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  const arch = resolveRollerArchetype(actor.weapon);
  cState.tempoTime += stepDt;

  const dist = Number.isFinite(ctx?.dist) && ctx.dist >= 0 ? ctx.dist : 6;
  const dx = Number.isFinite(ctx?.dx) ? ctx.dx : 0;
  const dz = Number.isFinite(ctx?.dz) ? ctx.dz : 1;
  const dy = Number.isFinite(ctx?.dy)
    ? ctx.dy
    : (Number.isFinite(brain.target?.pos?.y) && Number.isFinite(actor.pos?.y)
      ? brain.target.pos.y - actor.pos.y
      : 0);
  const enemyVisible = !!ctx?.enemyVisible;
  const aimed = !!ctx?.aimed;
  const off = Number.isFinite(ctx?.off) ? ctx.off : (aimed ? 0.05 : 0.4);
  const inkFrac = typeof ctx?.inkFrac === 'number'
    ? (Number.isFinite(ctx.inkFrac) ? clampVal(ctx.inkFrac, 0, 1) : 0)
    : 1;
  const wantYaw = Number.isFinite(ctx?.wantYaw)
    ? ctx.wantYaw
    : (Number.isFinite(brain.aimYaw) ? brain.aimYaw : 0);
  const wantPitch = Number.isFinite(ctx?.wantPitch)
    ? ctx.wantPitch
    : (Number.isFinite(brain.aimPitch) ? brain.aimPitch : 0);

  const horizLen = Math.hypot(dx, dz);
  const denom = Math.max(dist, horizLen, 0.01);
  const nx = dx / denom;
  const nz = dz / denom;
  const baseSide =
    Number.isFinite(brain.strafeS) && brain.strafeS !== 0
      ? brain.strafeS
      : (Number.isFinite(brain.strafe) && brain.strafe !== 0 ? brain.strafe : 0.65);
  // Subtle human tempo wave modulates strafe amplitude smoothly without sudden robotic reversals
  const tempoWave = Math.sin(cState.tempoTime * arch.strafeFreq + cState.seed);
  const side = baseSide * (1 + tempoWave * 0.14);
  const onOwnInk = actor.groundTeam === 1;
  const onEnemyInk = actor.groundTeam === 2;
  const hpFrac = Number.isFinite(actor.hp) ? actor.hp / 100 : 1;
  const swinging = isRollerSwinging(wr);
  const rolling = !!wr.rolling;
  const cooldown = Number.isFinite(wr.cooldown) ? wr.cooldown : 0;
  const reactReady = (Number.isFinite(brain.react) ? brain.react : 0) <= 0;

  // Reset paint roll tracking when entering combat
  brain._rollerRollTime = 0;
  brain._rollerSwimGap = 0;
  cState.lastDist = dist;

  // 1. Mid-swing: NEVER interrupt with squid! Release fire during windup so we don't accidentally
  //    drop into slow rolling (and incur 16F rollStop lock) unless crushing at point-blank.
  if (swinging) {
    cState.phase = 'idle';
    cState.timer = 0;
    it.squid = false;
    it.jump = false;
    it.fire = Boolean(enemyVisible && arch.canCrushKill && dist < 2.2 && inkFrac > 0.04);
    // Archetype-calibrated step during swing: Dynamo holds spacing; Carbon/Splat step into 1-shot zone
    let fwd = dist > arch.horizKillDist * 0.65 ? 0.85 : 0.25;
    if (arch.id === 'heavy' && dist < arch.keepDistMin) {
      fwd = -0.25;
    } else if (arch.id === 'compact' && dist > arch.preferredCombatDist) {
      fwd = 0.92;
    }
    const mvx = nx * fwd - nz * side * 0.45;
    const mvz = nz * fwd + nx * side * 0.45;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMove(move, mvx / ml, mvz / ml);
    return null;
  }

  // 2. Active rolling in combat: only keep rolling for an immediate point-blank crush!
  if (rolling) {
    const canCrushNow =
      enemyVisible &&
      inkFrac > 0.02 &&
      ((arch.canCrushKill && dist < 2.6) || (!arch.canCrushKill && dist < 1.6));
    if (canCrushNow) {
      it.fire = true;
      it.squid = false;
      it.jump = false;
      setMove(move, nx, nz);
      return null;
    }
    // Otherwise lift the drum immediately (must return with fire=false for 1 tick to exit rolling)
    it.fire = false;
    it.squid = false;
    it.jump = false;
    cState.phase = 'idle';
    cState.timer = 0;
    return null;
  }

  // 3. Ongoing flick commitment (survives squid -> kid emergeDelay without 1-frame tap drop!)
  if (cState.phase === 'commit_flick') {
    cState.timer += stepDt;
    if (cooldown > 0.02 || cState.timer >= 0.16 || inkFrac < 0.03 || isRollStopMainLocked(wr, G)) {
      cState.phase = 'idle';
      cState.timer = 0;
      cState.wantVertical = false;
      it.fire = false;
    } else {
      it.fire = true;
      it.squid = false;
      it.jump = false;
      if (cState.wantVertical && actor.grounded !== true) {
        return setAimOut(cState.aimOut, wantYaw, clampVal(wantPitch + arch.vertPitchBias, -1.1, 1.0));
      }
      return null;
    }
  }

  // 4. Ongoing jump-to-vertical flick transition (B -> air ZR edge)
  if (cState.phase === 'jump_vert') {
    cState.timer += stepDt;
    if (
      inkFrac < arch.minVertFlickInk ||
      isRollStopMainLocked(wr, G) ||
      (!enemyVisible && (brain.lostTimer || 0) > 0.45)
    ) {
      cState.phase = 'idle';
      cState.timer = 0;
      cState.wantVertical = false;
      it.fire = false;
      it.jump = false;
    } else if (!actor.grounded) {
      // Airborne: press ZR now to commit vertical flick!
      it.fire = true;
      it.squid = false;
      it.jump = false;
      cState.phase = 'commit_flick';
      cState.timer = 0;
      return setAimOut(cState.aimOut, wantYaw, clampVal(wantPitch + arch.vertPitchBias, -1.1, 1.0));
    } else if (cState.timer >= 0.08) {
      // Jump failed to take off (e.g. ceiling or grounded lock): abort vertical flick cleanly
      // instead of firing a grounded horizontal flick with vertical pitch bias.
      cState.phase = 'idle';
      cState.timer = 0;
      cState.wantVertical = false;
      it.fire = false;
      it.jump = false;
      return null;
    } else {
      it.fire = false;
      it.squid = false;
      it.jump = true;
      return setAimOut(cState.aimOut, wantYaw, clampVal(wantPitch + arch.vertPitchBias, -1.1, 1.0));
    }
  }

  // 5. Edge-reset frame when previous intent held fire
  if (cState.phase === 'prep_release') {
    cState.phase = 'idle';
    cState.timer = 0;
  }

  // 6. Determine combat attack decision (horizontal 1-shot vs jump-vertical mid-range vs corner pre-flick)
  const rollStopLocked = isRollStopMainLocked(wr, G);
  const canHorizFlick = !rollStopLocked && cooldown <= EPS && inkFrac >= arch.minHorizFlickInk;
  const canVertFlick = !rollStopLocked && cooldown <= EPS && inkFrac >= arch.minVertFlickInk;

  // Heavy roller (Dynamo) combat ink discipline: when ink is depleted outside emergency range,
  // briefly recover in own ink instead of stalling dry mid-fight.
  if (arch.id === 'heavy') {
    if (inkFrac < arch.minFlickInk) {
      cState.recoveringInk = true;
    } else if (cState.recoveringInk && (inkFrac >= 0.30 || dist < 6.5)) {
      cState.recoveringInk = false;
    }
  } else {
    cState.recoveringInk = false;
  }

  let wantAttack = false;
  let wantVertical = false;

  if (enemyVisible && reactReady && !cState.recoveringInk && (canHorizFlick || canVertFlick)) {
    const elevatedTarget = dy > arch.elevVertDy && dist <= arch.vertMaxDist;
    const inHorizKill = dist <= arch.horizKillDist;
    const inHorizMax = dist <= arch.horizMaxDist;
    const inVertZone = dist >= arch.vertMinDist && dist <= arch.vertMaxDist;

    // Wider aim tolerance for fan-shaped horizontal flick; tighter for narrow vertical flick
    const horizAimOk = aimed || off < 0.34;
    const vertAimOk = aimed || off < 0.20;

    if (elevatedTarget && vertAimOk && canVertFlick) {
      wantAttack = true;
      wantVertical = true;
    } else if (arch.preferVerticalCombat) {
      // Big Swig: vertical flick is the only 1-shot and main mid-range 2-shot tool;
      // use wide horizontal flick at point-blank (< 3.2m) or when enemy strafes wide.
      if (inVertZone && vertAimOk && canVertFlick) {
        wantAttack = true;
        wantVertical = true;
      } else if (inHorizMax && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      }
    } else if (arch.id === 'compact') {
      // Carbon: lethal close horizontal flick (31F), agile jump-vertical flick at 4.8-11.2m;
      // when sharking in own ink at far vertical fringe (> 8.8m) without tight aim, prefer closing silently first.
      if (inHorizKill && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      } else if (inVertZone && vertAimOk && canVertFlick && (dist <= 8.8 || !onOwnInk || aimed)) {
        wantAttack = true;
        wantVertical = true;
      } else if (inHorizMax && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      }
    } else if (arch.id === 'hunter') {
      // Flingza: crisp 40F horizontal flick at close range (even down to 8% ink),
      // long 4.1-line vertical flick at mid-range (6.5-16.5m).
      if (inHorizKill && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      } else if (inVertZone && vertAimOk && canVertFlick) {
        wantAttack = true;
        wantVertical = true;
      } else if (inHorizMax && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      }
    } else {
      // Splat & Dynamo: horizontal 1-shot/suppression in primary zone, jump-vertical at long range
      if (inHorizKill && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      } else if (inVertZone && vertAimOk && canVertFlick) {
        wantAttack = true;
        wantVertical = true;
      } else if (inHorizMax && horizAimOk && canHorizFlick) {
        wantAttack = true;
        wantVertical = false;
      }
    }
  } else if (
    // Corner / cover pre-flick right after target breaks LOS (uses lastSeenPos, zero wall-hack)
    !enemyVisible &&
    brain.target &&
    (brain.lostTimer || 0) > 0 &&
    (brain.lostTimer || 0) < 0.75 &&
    canHorizFlick &&
    !cState.recoveringInk &&
    dist <= arch.horizMaxDist &&
    inkFrac >= arch.minHorizFlickInk + 0.08 &&
    off < 0.28
  ) {
    wantAttack = true;
    wantVertical = false;
  }

  // 7. Execute attack initiation
  if (wantAttack) {
    if (actor._prevIntent?.fire) {
      // Must drop fire for 1 tick to generate a clean firePressed rising edge on the next tick
      it.fire = false;
      it.squid = false;
      it.jump = false;
      cState.phase = 'prep_release';
      cState.timer = 0;
      cState.wantVertical = wantVertical;
      return null;
    }

    if (wantVertical && actor.grounded !== false) {
      // Step 1 of jump-vertical flick: jump first (B), then fire in air (ZR)
      it.jump = true;
      it.fire = false;
      it.squid = false;
      cState.phase = 'jump_vert';
      cState.timer = 0;
      cState.wantVertical = true;
      return setAimOut(cState.aimOut, wantYaw, clampVal(wantPitch + arch.vertPitchBias, -1.1, 1.0));
    }

    // Commit horizontal flick (or airborne vertical flick) and hold through emergeDelay
    it.fire = true;
    it.squid = false;
    it.jump = false;
    cState.phase = 'commit_flick';
    cState.timer = 0;
    cState.wantVertical = wantVertical;
    return wantVertical
      ? setAimOut(cState.aimOut, wantYaw, clampVal(wantPitch + arch.vertPitchBias, -1.1, 1.0))
      : null;
  }

  // 8. Non-firing combat movement: stealth angled approach, spacing, or low-HP reposition
  it.fire = false;

  // 8a. Low-HP spotted outside lethal horizontal range: disengage diagonally into own ink to reset
  if (hpFrac < 0.35 && enemyVisible && dist > Math.max(5.0, arch.horizKillDist * 0.85)) {
    const mvx = -nx * 0.78 - nz * side * 0.62;
    const mvz = -nz * 0.78 + nx * side * 0.62;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMove(move, mvx / ml, mvz / ml);
    if (onOwnInk && !isSquidLocked(wr, G)) it.squid = true;
    return null;
  }

  // 8b. Enemy ink underfoot while out of lethal range: clear feet instead of crawling in squid
  if (onEnemyInk && canHorizFlick && dist > arch.horizKillDist) {
    if (!actor._prevIntent?.fire) {
      it.fire = true;
      it.squid = false;
      cState.phase = 'commit_flick';
      cState.timer = 0;
      cState.wantVertical = false;
      return setAimOut(cState.aimOut, wantYaw, Math.min(wantPitch, -0.26));
    }
  }

  // 8c. Spacing & evasive angled approach (calibrated per archetype + gentle tempo rhythm)
  if (dist > arch.preferredCombatDist + 1.2) {
    // Close distance on an angled vector instead of walking straight into gunfire
    const fwdWeight = dist > arch.vertMaxDist ? 0.86 : (arch.stealthApproach ? 0.70 : 0.74);
    const sideWeight = dist > arch.vertMaxDist ? 0.50 : arch.approachSideBias;
    const mvx = nx * fwdWeight - nz * side * sideWeight;
    const mvz = nz * fwdWeight + nx * side * sideWeight;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMove(move, mvx / ml, mvz / ml);

    // Swim in own ink ONLY when not mid-commit and outside immediate 1-shot range (or waiting on cooldown/ink)
    const shouldSwimApproach =
      onOwnInk &&
      !isSquidLocked(wr, G) &&
      (dist > arch.horizKillDist || cooldown > arch.cooldownSwimMin || cState.recoveringInk);
    if (shouldSwimApproach) {
      it.squid = true;
    }
  } else if (dist < arch.keepDistMin && enemyVisible && (arch.id === 'heavy' || arch.preferVerticalCombat)) {
    // Dynamo & Big Swig: backstep diagonally out of point-blank range to preserve sweet-spot spacing
    const mvx = -nx * 0.55 - nz * side * 0.82;
    const mvz = -nz * 0.55 + nx * side * 0.82;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMove(move, mvx / ml, mvz / ml);
    if (onOwnInk && (cooldown > arch.cooldownSwimMin || cState.recoveringInk) && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
  } else {
    // Inside close combat zone while waiting for cooldown: weave laterally with organic rhythm
    const fwdWeight = (dist > arch.preferredCombatDist * 0.6 ? 0.35 : -0.15) + tempoWave * 0.08;
    const mvx = nx * fwdWeight - nz * side * 0.90;
    const mvz = nz * fwdWeight + nx * side * 0.90;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMove(move, mvx / ml, mvz / ml);
    if (onOwnInk && (cooldown > arch.cooldownSwimMin || cState.recoveringInk) && !isSquidLocked(wr, G)) {
      it.squid = true;
    }
  }

  return null;
}
