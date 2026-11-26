// Dedicated Charger-family Bot AI module for Turf War painting & combat (2026-11-26).
// Pure AI input / charge cadence / sweep / movement / spacing improvements — zero weapon stat edits or cheats.
// Covers all 8 Splatoon 3 Charger archetypes with lightweight O(1), zero-allocation human-like behavior:
// 1. Classic Squiffer (s3-charger-quick): https://splatoonwiki.org/wiki/Classic_Squiffer
//    (0.75s charge, 100% airborne charge rate -> jump-charge skirmishing, 1.25s full-charge keep, 440p/tank tap paint)
// 2. Splat Charger (charger): https://splatoonwiki.org/wiki/Splat_Charger
//    (1.0s charge, 26.0 range, 1.25s full-charge keep, 2.25% no-charge tap paint efficiency)
// 3. Splatterscope (s3-charger-normalscope): https://splatoonwiki.org/wiki/Splatterscope
//    (1.0s charge, 28.0 longer range, no Charge Keep, scoped stationary anchor discipline)
// 4. E-liter 4K (s3-charger-long): https://splatoonwiki.org/wiki/E-liter_4K
//    (1.53s charge, 25% full-charge cost, 1.25s full-charge keep, long-range anchor spacing)
// 5. E-liter 4K Scope (s3-charger-longscope): https://splatoonwiki.org/wiki/E-liter_4K_Scope
//    (1.53s charge, longest scoped reach, no Charge Keep, strictest stationary sightline discipline)
// 6. Bamboozler 14 Mk I (s3-charger-light): https://splatoonwiki.org/wiki/Bamboozler_14_Mk_I
//    (0.33s full charge, constant range regardless of charge, no Charge Keep, 85 + 30+ 2-tap rhythm)
// 7. Goo Tuber (s3-charger-keeper): https://splatoonwiki.org/wiki/Goo_Tuber
//    (1.18s full charge, 1-ring ~70% lethal, 5.0s partial/full Charge Keep, 480p/tank tap paint)
// 8. Snipewriter 5H (s3-charger-pencil): https://splatoonwiki.org/wiki/Snipewriter_5H
//    (1.2s full charge loads 5 rounds, 37.5% cost, no Charge Keep, 5-round sweeping fan & magazine preservation)

const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Per-weapon Charger Turf War paint & ink-management tuning across all 8 Charger sub-archetypes.
 * All values are pure AI decision thresholds (charge release targets, organic sweep stride/jitter,
 * lateral strafe blend, and micro-refill squid hysteresis).
 */
export const CHARGER_PAINT_TUNING = Object.freeze({
  standard: Object.freeze({
    tapCharge: 0.14,          // Fast low/no-charge paint: preserves proven Cov/Turf/Dmg performance
    longLineCharge: 0.34,     // Occasional longer stripe for distant unpainted/enemy turf
    longLineEvery: 4,         // Interleave 1 longer line every N shots when ink is healthy
    longLineInkMin: 0.54,     // Minimum ink fraction to weave a longer stripe
    sweepStep: 0.36,          // Base angular step (rad) metadata
    sweepHalfSpan: 0.56,      // Fan half-span (rad) around forward heading
    sweepStride: 0.46,        // Normalized per-shot organic sweep stride
    sweepJitter: 0.09,        // Lightweight O(1) phase breath/jitter amplitude
    flankPull: 0.46,          // Natural pull toward unpainted/enemy flank direction
    strafeRatio: 0.42,        // Lateral "カニ歩き" strafe ratio while painting
    swimRefillFloor: 0.24,    // Enter brief squid-swim recovery on own ink before hard 0.12 refill stall
    swimRefillResume: 0.50,   // Resume painting once ink recovers to this fraction
    postShotSwimMinCd: 0.05,  // Dive into own ink during post-shot cooldown to move faster & regen
  }),
  standardScope: Object.freeze({
    tapCharge: 0.14,          // Splatterscope: same tap-paint efficiency as Splat Charger
    longLineCharge: 0.36,     // Slightly longer interleaved stripe leveraging extra scoped reach
    longLineEvery: 4,
    longLineInkMin: 0.54,
    sweepStep: 0.34,
    sweepHalfSpan: 0.52,
    sweepStride: 0.42,        // Calmer, steadier sweep cadence suited to scoped framing
    sweepJitter: 0.07,
    flankPull: 0.44,
    strafeRatio: 0.35,        // Slightly more grounded stance than unscoped Splat Charger
    swimRefillFloor: 0.24,
    swimRefillResume: 0.50,
    postShotSwimMinCd: 0.05,
  }),
  long: Object.freeze({
    tapCharge: 0.13,          // E-liter 4K: avoid 0.15 DU/f crawl and 25% ink drain while painting
    longLineCharge: 0.32,     // Controlled partial-charge reach extension on open enemy/empty turf
    longLineEvery: 4,
    longLineInkMin: 0.60,
    sweepStep: 0.34,
    sweepHalfSpan: 0.52,
    sweepStride: 0.40,
    sweepJitter: 0.08,
    flankPull: 0.42,
    strafeRatio: 0.38,
    swimRefillFloor: 0.28,    // Higher floor for heavy 25%-cost tank
    swimRefillResume: 0.56,
    postShotSwimMinCd: 0.05,
  }),
  longScope: Object.freeze({
    tapCharge: 0.13,          // E-liter 4K Scope: low-cost tap paint with calm anchor sweeping
    longLineCharge: 0.34,
    longLineEvery: 5,
    longLineInkMin: 0.62,
    sweepStep: 0.32,
    sweepHalfSpan: 0.48,
    sweepStride: 0.36,        // Measured, unhurried scoped lane sweeping
    sweepJitter: 0.06,
    flankPull: 0.40,
    strafeRatio: 0.30,        // Stationary anchor bias while painting
    swimRefillFloor: 0.28,
    swimRefillResume: 0.56,
    postShotSwimMinCd: 0.05,
  }),
  quick: Object.freeze({
    tapCharge: 0.12,          // Classic Squiffer: 440p/tank no-charge efficiency
    longLineCharge: 0.28,
    longLineEvery: 5,
    longLineInkMin: 0.50,
    sweepStep: 0.38,
    sweepHalfSpan: 0.58,
    sweepStride: 0.50,        // Brisk, agile fan sweep matching Squiffer's skirmisher pace
    sweepJitter: 0.11,
    flankPull: 0.50,
    strafeRatio: 0.46,
    swimRefillFloor: 0.22,
    swimRefillResume: 0.46,
    postShotSwimMinCd: 0.05,
  }),
  keeper: Object.freeze({
    tapCharge: 0.09,          // Goo Tuber: 480p/tank no-charge turf powerhouse; never full-charge to paint
    longLineCharge: 0.14,
    longLineEvery: 6,
    longLineInkMin: 0.60,
    sweepStep: 0.40,
    sweepHalfSpan: 0.60,
    sweepStride: 0.52,        // Wide, fluid tap-paint fan
    sweepJitter: 0.11,
    flankPull: 0.52,
    strafeRatio: 0.48,
    swimRefillFloor: 0.20,
    swimRefillResume: 0.44,
    postShotSwimMinCd: 0.05,
  }),
  bamboo: Object.freeze({
    tapCharge: 0.94,          // Bamboozler 14: 0.33s full-charge eliminates no-charge line gaps
    longLineCharge: 0.98,
    longLineEvery: 1,
    longLineInkMin: 0.22,
    sweepStep: 0.34,
    sweepHalfSpan: 0.54,
    sweepStride: 0.44,        // Crisp rhythmic full-charge painting sweep
    sweepJitter: 0.09,
    flankPull: 0.48,
    strafeRatio: 0.48,        // High lightweight run speed while charging
    swimRefillFloor: 0.24,
    swimRefillResume: 0.50,
    postShotSwimMinCd: 0.05,
  }),
  pencil: Object.freeze({
    tapCharge: 1.0,           // Snipewriter 5H: must reach 1.0 to load 5-round magazine
    longLineCharge: 1.0,
    longLineEvery: 1,
    longLineInkMin: 0.38,
    sweepStep: 0.30,          // Fan all 5 loaded rounds cleanly across adjacent lanes
    sweepHalfSpan: 0.56,
    sweepStride: 0.41,        // 5 shots traverse one full organic arc (-0.82 -> +0.82)
    sweepJitter: 0.06,
    flankPull: 0.45,
    strafeRatio: 0.44,        // Fast strafing while firing 5 loaded rounds
    swimRefillFloor: 0.38,    // 37.5% full-charge cost: recover before next magazine load
    swimRefillResume: 0.66,
    postShotSwimMinCd: 0.05,
  }),
});

/**
 * Per-weapon Charger combat parameters (spacing, charge thresholds, hold & keep discipline).
 */
export const CHARGER_COMBAT_TUNING = Object.freeze({
  standard: Object.freeze({
    fullCharge: 0.95,
    closeCharge: 0.52,
    panicCharge: 0.24,
    closeDist: 10.5,
    panicDist: 6.0,
    prefRangeRatio: 0.80,
    retreatRangeRatio: 0.56,
    chargeMoveScale: 0.28,
    aimBlend: 0.45,
    maxHoldFar: 0.52,
    maxHoldClose: 0.26,
    keepMaxLost: 0.72,        // 1.25s S3 full-charge keep used cleanly for short repositions
    keepMinCharge: 0.98,
    losHoldMax: 0.60,
  }),
  standardScope: Object.freeze({
    fullCharge: 0.96,
    closeCharge: 0.54,
    panicCharge: 0.24,
    closeDist: 10.5,
    panicDist: 6.2,
    prefRangeRatio: 0.86,     // Plays slightly further back to exploit +2.0 scoped range
    retreatRangeRatio: 0.60,
    chargeMoveScale: 0.16,    // Stationary scoped anchor stance
    aimBlend: 0.40,           // Finer scoped tracking without zeroing aimError
    maxHoldFar: 0.56,
    maxHoldClose: 0.26,
    keepMaxLost: 0,           // Cannot Charge Keep
    keepMinCharge: 1.1,
    losHoldMax: 0.32,         // Brief pre-aim hold on LOS break, then cancel cleanly
  }),
  long: Object.freeze({
    fullCharge: 0.96,
    closeCharge: 0.50,
    panicCharge: 0.22,
    closeDist: 10.5,
    panicDist: 6.5,
    prefRangeRatio: 0.86,
    retreatRangeRatio: 0.62,
    chargeMoveScale: 0.22,
    aimBlend: 0.44,
    maxHoldFar: 0.56,
    maxHoldClose: 0.26,
    keepMaxLost: 0.78,        // 1.25s full-charge keep for anchor angle shifts
    keepMinCharge: 0.98,
    losHoldMax: 0.60,
  }),
  longScope: Object.freeze({
    fullCharge: 0.97,
    closeCharge: 0.50,
    panicCharge: 0.22,
    closeDist: 11.0,
    panicDist: 6.8,
    prefRangeRatio: 0.90,     // Deepest backline spacing for maximum scoped reach
    retreatRangeRatio: 0.66,
    chargeMoveScale: 0.12,    // Strongest stationary sightline discipline
    aimBlend: 0.38,           // Steady scoped aim convergence without zeroing aimError
    maxHoldFar: 0.60,
    maxHoldClose: 0.26,
    keepMaxLost: 0,           // Cannot Charge Keep
    keepMinCharge: 1.1,
    losHoldMax: 0.36,         // Short scoped pre-aim hold before cancelling
  }),
  quick: Object.freeze({
    fullCharge: 0.94,
    closeCharge: 0.48,
    panicCharge: 0.22,
    closeDist: 8.0,
    panicDist: 4.8,
    prefRangeRatio: 0.74,
    retreatRangeRatio: 0.48,
    chargeMoveScale: 0.44,    // Agile skirmisher strafing while charging
    aimBlend: 0.46,
    maxHoldFar: 0.45,
    maxHoldClose: 0.22,
    keepMaxLost: 0.75,        // 1.25s full-charge keep
    keepMinCharge: 0.98,
    losHoldMax: 0.55,
    allowJumpCharge: true,    // Authentic 100% airborne charge rate
  }),
  keeper: Object.freeze({
    fullCharge: 0.94,
    midLethalCharge: 0.74,    // Goo Tuber 1-ring (~70%) crosses 100 damage lethal threshold
    closeCharge: 0.45,
    panicCharge: 0.18,
    closeDist: 8.5,
    panicDist: 5.0,
    prefRangeRatio: 0.74,
    retreatRangeRatio: 0.50,
    chargeMoveScale: 0.40,
    aimBlend: 0.46,
    maxHoldFar: 0.48,
    maxHoldClose: 0.22,
    keepMaxLost: 2.80,        // Exploits 5.0s Charge Keep for extended swim-flanks & peeks
    keepMinCharge: 0.45,      // Authentic partial-charge keep support
    losHoldMax: 0.65,
  }),
  bamboo: Object.freeze({
    fullCharge: 0.95,
    followUpCharge: 0.16,     // Natural 85 + 30+ 2-tap rhythm after opening full charge
    closeCharge: 0.62,
    panicCharge: 0.20,
    closeDist: 9.0,
    panicDist: 5.0,
    prefRangeRatio: 0.78,
    retreatRangeRatio: 0.52,
    chargeMoveScale: 0.76,    // Fast lightweight strafing while charging
    aimBlend: 0.48,
    maxHoldFar: 0.32,
    maxHoldClose: 0.16,
    keepMaxLost: 0,           // Cannot Charge Keep
    keepMinCharge: 1.1,
    losHoldMax: 0.22,         // 0.33s charge is so fast that holding stale charges is wasteful
  }),
  pencil: Object.freeze({
    fullCharge: 1.0,
    closeCharge: 1.0,
    panicCharge: 0.20,
    closeDist: 9.5,
    panicDist: 5.5,
    prefRangeRatio: 0.84,
    retreatRangeRatio: 0.58,
    chargeMoveScale: 0.72,    // Fast strafing while loaded/charging
    aimBlend: 0.48,
    maxHoldFar: 0.40,
    maxHoldClose: 0.20,
    keepMaxLost: 0,           // Cannot Charge Keep
    keepMinCharge: 1.1,
    losHoldMax: 0.30,
    loadedHoldLostMax: 0.48,  // Stay in kid form briefly so 5-round magazine is not discarded
  }),
});

function clampVal(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function readyPress(actor) {
  const wr = actor?.weaponRunner;
  if (!wr) return false;
  return (wr.cooldown || 0) <= 1e-6 && !wr.catalogState?.pending && !actor._prevIntent?.fire;
}

function resetChargerLifeState(brain) {
  if (!brain) return;
  brain._chargerMicroRefill = false;
  brain._bambooComboT = 0;
  brain._chargerJumpCd = 0;
  brain._weakChargeHold = 0;
  brain._chargerFlankSmooth = undefined;
  brain._chargerSmoothStrafe = undefined;
  brain._chargerPencilDir = undefined;
  brain._chargerSweepPos = undefined;
  brain._chargerSweepDir = undefined;
  brain._chargerLastNorm = undefined;
}

function syncChargerLifeState(brain, actor) {
  if (!brain || !actor) return;
  if (actor.alive === false) {
    resetChargerLifeState(brain);
    return;
  }
  const life = actor.netLife;
  if (life !== undefined && brain._chargerLife !== life) {
    if (brain._chargerLife !== undefined) {
      resetChargerLifeState(brain);
    }
    brain._chargerLife = life;
  }
}

/**
 * Classifies a charger weapon into its authentic Splatoon 3 sub-archetype (all 8 main variants).
 * @param {object} weapon
 * @returns {'pencil'|'bamboo'|'keeper'|'quick'|'longScope'|'long'|'standardScope'|'standard'}
 */
export function classifyChargerArchetype(weapon) {
  if (!weapon) return 'standard';
  const src = weapon.sourceMainActor || weapon.catalogRecord?.sourceMainActor || '';
  const rawId = weapon.id || '';
  const id = typeof rawId === 'string' ? rawId.toLowerCase() : '';
  const isScoped = Boolean(
    weapon.scoped ||
    weapon.scopedCharge ||
    (typeof src === 'string' && src.includes('Scope')) ||
    id.includes('scope')
  );

  if (src === 'WeaponChargerPencil' || id.includes('pencil') || id.includes('snipewriter')) {
    return 'pencil';
  }
  if (src === 'WeaponChargerLight' || id.includes('bamboozler') || id.includes('bamboo') || id.includes('charger-light')) {
    return 'bamboo';
  }
  if (src === 'WeaponChargerKeeper' || id.includes('keeper') || id.includes('soituber') || id.includes('gootuber')) {
    return 'keeper';
  }
  if (src === 'WeaponChargerQuick' || id.includes('quick') || id.includes('squiffer')) {
    return 'quick';
  }
  if (
    src === 'WeaponChargerLongScope' ||
    id.includes('longscope') ||
    (isScoped && (src === 'WeaponChargerLong' || id.includes('eliter') || id.includes('charger-long') || (weapon.chargeTime || 0) >= 1.25))
  ) {
    return 'longScope';
  }
  if (
    src === 'WeaponChargerLong' ||
    id.includes('eliter') ||
    id.includes('charger-long') ||
    (weapon.chargeTime || 0) >= 1.25
  ) {
    return 'long';
  }
  if (src === 'WeaponChargerNormalScope' || isScoped) {
    return 'standardScope';
  }
  return 'standard';
}

/**
 * Cached O(1) archetype lookup per brain to avoid per-frame string allocations.
 */
function resolveCachedArchetype(brain, weapon) {
  if (brain && brain._chargerWeaponRef === weapon && brain._chargerArchetype) {
    return brain._chargerArchetype;
  }
  const arch = classifyChargerArchetype(weapon);
  if (brain) {
    brain._chargerWeaponRef = weapon;
    brain._chargerArchetype = arch;
  }
  return arch;
}

/**
 * Checks whether the given charger supports Splatoon 3 Charge Keep.
 * Scoped chargers (Splatterscope, E-liter 4K Scope), Bamboozler 14, and Snipewriter 5H cannot keep charge.
 */
export function supportsChargeKeep(weapon, archetype) {
  if (!weapon) return false;
  if (
    archetype === 'bamboo' ||
    archetype === 'pencil' ||
    archetype === 'standardScope' ||
    archetype === 'longScope'
  ) {
    return false;
  }
  if (weapon.scoped || weapon.scopedCharge) return false;
  const src = weapon.sourceMainActor || weapon.catalogRecord?.sourceMainActor || '';
  const id = typeof weapon.id === 'string' ? weapon.id.toLowerCase() : '';
  if ((typeof src === 'string' && src.includes('Scope')) || id.includes('scope')) return false;
  const keepParam = weapon.catalogRecord?.parameters?.WeaponKeepChargeParam;
  if (keepParam && keepParam.KeepChargeFullFrame <= 0) return false;
  return true;
}

/**
 * Advances the bot's sweep phase with organic, human-like breathing rhythm,
 * lightweight O(1) non-periodic phase jitter, and natural pull toward unpainted flanks.
 * Zero allocations; guarantees consecutive shots target distinct lanes to avoid double-painting.
 */
function advanceChargerFanSweep(brain, actor, tuning, cache, archetype, loadedRounds) {
  const shotIdx = (brain._chargerShotCount || 0) + 1;
  brain._chargerShotCount = shotIdx;

  const actorId = actor?.id || 0;
  const seed = (actorId * 1.7320508) % 6.2831853;

  // Smoothly track flank bias so sweep center & turn-around gently gravitate toward unpainted turf
  const rawFlank = clampVal(cache?.flankBias || 0, -0.65, 0.65);
  const smoothFlank = brain._chargerFlankSmooth === undefined
    ? rawFlank
    : brain._chargerFlankSmooth * 0.65 + rawFlank * 0.35;
  brain._chargerFlankSmooth = smoothFlank;

  let targetNorm;

  if (archetype === 'pencil' && loadedRounds > 0) {
    // Snipewriter 5H: sweep 5 loaded rounds across one fluid fan arc instead of choppy resets
    if (loadedRounds >= 5 || brain._chargerPencilDir === undefined) {
      const prevDir = brain._chargerPencilDir ?? ((actorId & 1) === 0 ? 1 : -1);
      // Sweep toward the unpainted flank when clear, else alternate naturally per magazine
      brain._chargerPencilDir = Math.abs(smoothFlank) > 0.08
        ? (smoothFlank > 0 ? 1 : -1)
        : -prevDir;
    }
    const dir = brain._chargerPencilDir;
    const roundStep = 5 - clampVal(loadedRounds, 1, 5); // 0, 1, 2, 3, 4
    const baseArc = (-0.82 + roundStep * tuning.sweepStride) * dir;
    const jitter = Math.sin(shotIdx * GOLDEN_ANGLE + seed) * tuning.sweepJitter;
    targetNorm = clampVal(baseArc + smoothFlank * tuning.flankPull * 0.75 + jitter, -0.98, 0.98);
    brain._chargerSweepPos = targetNorm;
    brain._chargerSweepDir = dir;
  } else {
    // Initialize organic sweep position & direction
    if (brain._chargerSweepPos === undefined) {
      brain._chargerSweepDir = Math.abs(smoothFlank) > 0.08
        ? (smoothFlank > 0 ? 1 : -1)
        : ((actorId & 1) === 0 ? 1 : -1);
      brain._chargerSweepPos = -0.55 * brain._chargerSweepDir;
    }

    let dir = brain._chargerSweepDir || 1;
    // Breathing cadence: stride organically expands/contracts (0.86x..1.14x) across shots
    const breath = 0.86 + 0.28 * (0.5 + 0.5 * Math.sin(shotIdx * 1.17 + seed));
    // Slow down slightly when sweeping into unpainted flank (denser coverage), faster across painted side
    const movingIntoUnpainted = (dir * smoothFlank) > 0.04;
    const flankPace = movingIntoUnpainted ? 0.90 : 1.08;
    const step = tuning.sweepStride * breath * flankPace;

    // Asymmetric soft bounds: linger further on the unpainted flank, turn around earlier on painted side
    const hiBound = clampVal(0.90 + smoothFlank * 0.32, 0.56, 0.98);
    const loBound = clampVal(-0.90 + smoothFlank * 0.32, -0.98, -0.56);

    let nextPos = brain._chargerSweepPos + dir * step;
    if (nextPos > hiBound) {
      nextPos = hiBound - (nextPos - hiBound) * 0.45;
      dir = -1;
    } else if (nextPos < loBound) {
      nextPos = loBound + (loBound - nextPos) * 0.45;
      dir = 1;
    }

    brain._chargerSweepPos = clampVal(nextPos, -0.96, 0.96);
    brain._chargerSweepDir = dir;

    const jitter = Math.sin(shotIdx * GOLDEN_ANGLE + seed) * tuning.sweepJitter;
    targetNorm = clampVal(brain._chargerSweepPos + smoothFlank * tuning.flankPull + jitter, -0.98, 0.98);
  }

  // Ensure consecutive narrow charger stripes never overlap on the exact same angle
  const prevNorm = brain._chargerLastNorm;
  if (prevNorm !== undefined && Math.abs(targetNorm - prevNorm) < 0.16) {
    const pushDir = brain._chargerSweepDir || (targetNorm >= 0 ? -1 : 1);
    const nudged = targetNorm + pushDir * 0.24;
    targetNorm = (nudged > 0.98 || nudged < -0.98)
      ? clampVal(targetNorm - pushDir * 0.24, -0.98, 0.98)
      : nudged;
  }

  brain._chargerLastNorm = targetNorm;
  // Convert normalized lane into sin()-compatible phase so botStabilizeTurfAim
  // (`baseYaw + Math.sin(brain.sweep) * sweepAmp`) lands directly on the target stripe.
  brain.sweep = Math.asin(clampVal(targetNorm, -0.995, 0.995));
}

/**
 * Blends organic lateral "カニ歩き" strafe into `move` while painting so parallel charger lines
 * cover a clean swath with natural breathing cadence instead of robotic square reversals.
 */
function applyChargerPaintStrafe(brain, actor, dt, move, baseYaw, strafeRatio, cache) {
  if (!move || !Number.isFinite(move.x) || !Number.isFinite(move.z) || !Number.isFinite(baseYaw) || strafeRatio <= 0) return;
  const safeDt = dt > 0 && dt < 0.5 ? dt : 1 / 60;
  const flankBias = Number.isFinite(cache?.flankBias) ? cache.flankBias : 0;
  let targetSign;
  if (Math.abs(flankBias) > 0.06) {
    targetSign = flankBias > 0 ? 1 : -1;
  } else if (brain._chargerSweepDir) {
    // Pair lateral drift naturally with the current fan sweep direction
    targetSign = brain._chargerSweepDir;
  } else {
    const block = Math.floor((brain._chargerShotCount || 0) / 4);
    const baseSign = ((actor.id || 0) & 1) === 0 ? 1 : -1;
    targetSign = (block & 1) === 0 ? baseSign : -baseSign;
  }

  // Subtle organic breath modulation on strafe speed (0.86..1.14)
  const phase = (brain._chargerStrafePhase || 0) + safeDt * 2.3;
  brain._chargerStrafePhase = phase > 62.831853 ? phase - 62.831853 : phase;
  const breathScale = 0.92 + 0.14 * Math.sin(phase + (actor.id || 0) * 1.1);

  const prev = brain._chargerSmoothStrafe ?? targetSign;
  const smooth = prev + (targetSign - prev) * Math.min(1, safeDt * 6.5);
  brain._chargerSmoothStrafe = smooth;

  const scaledStrafe = strafeRatio * breathScale;
  const perpX = Math.cos(baseYaw) * smooth;
  const perpZ = -Math.sin(baseYaw) * smooth;
  const mx = move.x + perpX * scaledStrafe;
  const mz = move.z + perpZ * scaledStrafe;
  const len = Math.hypot(mx, mz);
  if (len > 1e-4) {
    move.x = mx / len;
    move.z = mz / len;
  }
}

/**
 * Charger-specific Turf War painting controller.
 * Compatible with `botApplyTurfPaintMechanics` integration contract.
 *
 * @param {object} brain
 * @param {object} G
 * @param {object} actor
 * @param {number} dt
 * @param {object} move
 * @param {boolean} wantMove
 * @param {number} baseYaw
 * @param {number} inkFrac
 * @param {{ profile?: object, cache?: object, pitchReady?: boolean, wantPaintNow?: boolean }} [ctx]
 */
export function applyChargerTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx = {}) {
  const it = actor?.intent;
  if (!brain || !it) return;
  syncChargerLifeState(brain, actor);
  if (actor.alive === false || actor.superJumpState || actor.specialActive || actor.climbing) return;
  if (it.sub || it.special) {
    it.fire = false;
    return;
  }

  const wr = actor.weaponRunner;
  const w = actor.weapon;
  const archetype = resolveCachedArchetype(brain, w);
  const tuning = CHARGER_PAINT_TUNING[archetype] || CHARGER_PAINT_TUNING.standard;
  const safeInk = Number.isFinite(inkFrac) ? inkFrac : 1;
  const chargeVal = Number.isFinite(wr?.charge) ? wr.charge : 0;

  const cache = ctx?.cache !== undefined ? ctx.cache : brain._turfMultiCache;
  const pitchReady = typeof ctx?.pitchReady === 'boolean'
    ? ctx.pitchReady
    : (typeof brain._turfPaintValidated === 'boolean' ? brain._turfPaintValidated : true);
  const wantPaintNow = typeof ctx?.wantPaintNow === 'boolean'
    ? ctx.wantPaintNow
    : Boolean(brain._turfPaintLatch && pitchReady && safeInk > 0.10 && (brain.paintPause || 0) <= 0);

  const isPencil = archetype === 'pencil';
  const isLongFamily = archetype === 'long' || archetype === 'longScope';
  const onOwnInk = actor.groundTeam === 1;
  const coolerPending = !!brain._coolerPickupPending;
  const loadedRounds = isPencil ? (wr?.catalogState?.rounds || 0) : 0;
  const hasStoredCharge = Boolean(wr?.s3Stored || wr?.catalogState?.stored);

  // Keep legacy paintPause minimal so rapid tap-paint cadence never stalls
  if ((brain.paintPause || 0) > 0.02) {
    brain.paintPause = 0.02;
  }

  // Respect release-hold and partial-charge squid-cancel recovery windows strictly
  if (wr?.s3ReleaseHold || (wr?.s3ChargerCancelSwimRemaining || 0) > 1e-6) {
    it.fire = false;
    return;
  }

  // 1. Micro-refill squid hysteresis on own ink:
  //    Exploit Charger's ultra-short 20F ink recovery lag to swim-regen between bursts
  //    instead of draining below 12% and stalling in forced refill mode.
  if (brain._chargerMicroRefill) {
    if (safeInk >= tuning.swimRefillResume || !onOwnInk || coolerPending || wr?.charging || hasStoredCharge || loadedRounds > 0) {
      brain._chargerMicroRefill = false;
    } else {
      it.fire = false;
      it.squid = true;
      return;
    }
  } else if (
    !wr?.charging &&
    !hasStoredCharge &&
    loadedRounds <= 0 &&
    onOwnInk &&
    !coolerPending &&
    safeInk < tuning.swimRefillFloor &&
    safeInk > 0.08
  ) {
    brain._chargerMicroRefill = true;
    it.fire = false;
    it.squid = true;
    return;
  }

  // 1b. Stored Charge Keep resume when entering turf paint
  if (hasStoredCharge && wantPaintNow && pitchReady) {
    it.fire = true;
    it.squid = false;
    return;
  }

  // 2. Determine dynamic target charge for this paint shot
  let targetCharge = tuning.tapCharge;
  if (!isPencil && archetype !== 'bamboo' && archetype !== 'keeper') {
    const shotIdx = brain._chargerShotCount || 0;
    const enemyAhead = (cache?.effEnemy || 0) > 0.18;
    const wideOpenEmpty = (cache?.effOwn ?? 0.5) < 0.38;
    const isLongSlot = tuning.longLineEvery > 0 && (shotIdx % tuning.longLineEvery === tuning.longLineEvery - 1);
    if (safeInk >= tuning.longLineInkMin && (isLongSlot || (enemyAhead && wideOpenEmpty))) {
      targetCharge = tuning.longLineCharge;
    }
  }

  // 3. Active charging takes strict precedence (preserves pitchReady & pencil contract)
  if (wr?.charging) {
    const reachedTarget = chargeVal >= targetCharge;
    const lowInkEmergencyRelease = (safeInk < 0.15 && !isPencil) || safeInk <= 0.02;

    if (reachedTarget || lowInkEmergencyRelease) {
      if (!pitchReady && safeInk >= 0.15) {
        // Hold charge until aimPitch climbs back from floor-look (contract in bot-turf-paint.test.mjs)
        it.fire = true;
        it.squid = false;
      } else {
        // Release shot and step aim organically to the next non-overlapping fan lane
        it.fire = false;
        brain.paintPause = 0.015;
        advanceChargerFanSweep(brain, actor, tuning, cache, archetype, 0);
      }
    } else {
      it.fire = true;
      it.squid = false;
    }

    if (it.fire && wantMove) {
      const hasNav = Array.isArray(brain.path) && brain.path.length > 1 && (G?.nav?.nodes?.length || 0) > 4;
      const strafe = hasNav ? tuning.strafeRatio * 0.28 : tuning.strafeRatio;
      applyChargerPaintStrafe(brain, actor, dt, move, baseYaw, strafe, cache);
    }
    return;
  }

  // 4. Snipewriter 5H loaded magazine: fluidly sweep all 5 rounds across a single organic fan arc
  //    Already-paid rounds cost 0 ink, so fire them even if tank dropped below 10% after full load.
  if (isPencil && loadedRounds > 0) {
    const canFireLoaded = wantPaintNow || (pitchReady && safeInk <= 0.10 && brain._turfPaintLatch !== false && (brain.paintPause || 0) <= 0);
    if (canFireLoaded && readyPress(actor)) {
      it.fire = true;
      it.squid = false;
      advanceChargerFanSweep(brain, actor, tuning, cache, archetype, loadedRounds);
      if (wantMove) {
        const hasNav = Array.isArray(brain.path) && brain.path.length > 1 && (G?.nav?.nodes?.length || 0) > 4;
        const strafe = hasNav ? tuning.strafeRatio * 0.30 : tuning.strafeRatio;
        applyChargerPaintStrafe(brain, actor, dt, move, baseYaw, strafe, cache);
      }
    } else {
      it.fire = false;
      // Preserve loaded magazine in kid form rather than accidentally cancelling into squid
      it.squid = false;
    }
    return;
  }

  // 5. Post-shot cooldown on own ink: brief squid dip speeds repositioning & starts ink regen
  const cd = wr?.cooldown || 0;
  if (cd > 1e-6) {
    it.fire = false;
    if (cd >= tuning.postShotSwimMinCd && onOwnInk && wantMove && !coolerPending) {
      it.squid = true;
    }
    return;
  }

  // 6. Start next paint charge cycle when pitch is validated and turf needs paint
  //    Snipewriter full charge costs 37.5% ink; require >= 0.38 so charge never stalls at 0% ink.
  const canStartPencil = !isPencil || safeInk >= 0.38;
  const longMoveFallback = isLongFamily && wantMove && safeInk > 0.28 && (cache ? (cache.effOwn < 0.78 || cache.effEnemy > 0.06) : true);
  if (pitchReady && canStartPencil && (wantPaintNow || longMoveFallback)) {
    it.fire = true;
    it.squid = false;
    if (wantMove) {
      const hasNav = Array.isArray(brain.path) && brain.path.length > 1 && (G?.nav?.nodes?.length || 0) > 4;
      const strafe = hasNav ? tuning.strafeRatio * 0.28 : tuning.strafeRatio;
      applyChargerPaintStrafe(brain, actor, dt, move, baseYaw, strafe, cache);
    }
  } else if (!wantPaintNow && onOwnInk && wantMove && !coolerPending) {
    // Already painted sector: swim quickly to the next unpainted zone
    it.fire = false;
    it.squid = true;
  }
}

/**
 * Reusable zero-allocation aim output helper.
 */
function writeAimOut(brain, idealYaw, idealPitch, wantYaw, wantPitch, blend) {
  if (!Number.isFinite(idealYaw) || !Number.isFinite(idealPitch) || !Number.isFinite(wantYaw) || !Number.isFinite(wantPitch)) {
    return null;
  }
  const out = brain._chargerAimOut || (brain._chargerAimOut = { wantYaw: 0, wantPitch: 0 });
  let dy = wantYaw - idealYaw;
  if (dy > Math.PI) dy -= Math.PI * 2;
  else if (dy < -Math.PI) dy += Math.PI * 2;
  out.wantYaw = idealYaw + dy * blend;
  out.wantPitch = idealPitch + (wantPitch - idealPitch) * blend;
  return out;
}

/**
 * Charger-specific combat AI controller.
 * Drop-in compatible with `botWeakWeaponCombat` signature & contract.
 * Zero per-frame heap allocations; differentiates all 8 Splatoon 3 Charger archetypes authentically.
 *
 * @param {object} brain
 * @param {object} G
 * @param {object} actor
 * @param {number} dt
 * @param {object} move
 * @param {{
 *   family?: string,
 *   dist: number,
 *   range: number,
 *   dx: number,
 *   dz: number,
 *   enemyVisible: boolean,
 *   aimed: boolean,
 *   off: number,
 *   inkFrac: number,
 *   idealYaw: number,
 *   idealPitch: number,
 *   wantYaw: number,
 *   wantPitch: number
 * }} ctx
 * @returns {{ wantYaw: number, wantPitch: number } | null}
 */
export function applyChargerCombat(brain, G, actor, dt, move, ctx) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!brain || !it || !wr || !ctx) return null;
  syncChargerLifeState(brain, actor);
  if (actor.alive === false || actor.superJumpState || actor.specialActive || actor.climbing) return null;
  if (it.sub || it.special) {
    it.fire = false;
    return null;
  }

  const w = actor.weapon;
  const archetype = resolveCachedArchetype(brain, w);
  const tuning = CHARGER_COMBAT_TUNING[archetype] || CHARGER_COMBAT_TUNING.standard;
  const canKeep = supportsChargeKeep(w, archetype);
  const safeDt = dt > 0 && dt < 0.5 ? dt : 1 / 60;

  const dist = Number.isFinite(ctx.dist) ? ctx.dist : 0;
  const range = Number.isFinite(ctx.range) && ctx.range > 0 ? ctx.range : (w?.rangeMax || w?.range || 22);
  const dx = Number.isFinite(ctx.dx) ? ctx.dx : 0;
  const dz = Number.isFinite(ctx.dz) ? ctx.dz : 0;
  const enemyVisible = Boolean(ctx.enemyVisible);
  const aimed = Boolean(ctx.aimed);
  const off = Number.isFinite(ctx.off) ? ctx.off : 0;
  const inkFrac = Number.isFinite(ctx.inkFrac) ? ctx.inkFrac : 1;
  const idealYaw = ctx.idealYaw;
  const idealPitch = ctx.idealPitch;
  const wantYaw = ctx.wantYaw;
  const wantPitch = ctx.wantPitch;
  const chargeVal = Number.isFinite(wr.charge) ? wr.charge : 0;

  const safeDist = Math.max(dist, 0.01);
  const nx = dx / safeDist;
  const nz = dz / safeDist;
  const onOwnInk = actor.groundTeam === 1;
  const inThreatRange = dist < range * 1.12;
  const isPencil = archetype === 'pencil';
  const loadedRounds = isPencil ? (wr.catalogState?.rounds || 0) : 0;
  const hasStoredCharge = Boolean(wr.s3Stored || wr.catalogState?.stored);

  // Decay archetype timers (Bamboozler 2-tap window & Squiffer jump-charge cadence)
  if ((brain._bambooComboT || 0) > 0) {
    brain._bambooComboT = Math.max(0, brain._bambooComboT - safeDt);
  }
  if ((brain._chargerJumpCd || 0) > 0) {
    brain._chargerJumpCd = Math.max(0, brain._chargerJumpCd - safeDt);
  }

  // Respect release-hold / cancel-swim recovery locks
  if (wr.s3ReleaseHold || (wr.s3ChargerCancelSwimRemaining || 0) > 1e-6) {
    it.fire = false;
    return null;
  }

  // 0. Active Charge Keep continuation (wr.charging becomes false once stored in s3Stored / catalogState.stored)
  if (hasStoredCharge && canKeep) {
    const lost = brain.lostTimer || 0;
    if (enemyVisible && inThreatRange) {
      // Pop out of squid to surface and unleash the stored charge
      it.squid = false;
      it.fire = true;
      return writeAimOut(brain, idealYaw, idealPitch, wantYaw, wantPitch, tuning.aimBlend);
    }
    if (onOwnInk && inkFrac > 0.12 && ((!enemyVisible && lost <= tuning.keepMaxLost) || (enemyVisible && !inThreatRange))) {
      it.fire = true;
      it.squid = true;
      if (archetype === 'keeper' && !enemyVisible && move && typeof move.set === 'function') {
        const side = brain.strafeS || (((actor.id || 0) & 1) === 0 ? 0.8 : -0.8);
        const mvx = nx * 0.35 - nz * side * 0.90;
        const mvz = nz * 0.35 + nx * side * 0.90;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      }
      return null;
    }
    // Keep expired or off own ink: surface with fire=true for catalog stored consumption (or cancel s3Stored)
    it.squid = false;
    it.fire = Boolean(wr.catalogState?.stored);
    brain._weakChargeHold = 0;
    return null;
  }

  // 1. Snipewriter 5H loaded magazine: fire buffered 68-dmg rounds (0 ink cost) with steady kiting & magazine preservation
  if (isPencil && loadedRounds > 0) {
    if (enemyVisible && inThreatRange) {
      const tightTol = Math.max(0.045, Math.atan2(0.55, Math.max(dist, 2.0)));
      if ((aimed || off <= tightTol) && readyPress(actor)) {
        it.fire = true;
        it.squid = false;
      } else {
        it.fire = false;
        it.squid = false;
      }
      // Keep long-range spacing while strafing at fast run speed
      if (move && typeof move.set === 'function' && dist < range * tuning.retreatRangeRatio) {
        const side = brain.strafeS || 0.6;
        const mvx = -nx * 0.78 - nz * side * 0.62;
        const mvz = -nz * 0.78 + nx * side * 0.62;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      }
      return writeAimOut(brain, idealYaw, idealPitch, wantYaw, wantPitch, tuning.aimBlend);
    }
    // Enemy briefly broke LOS while rounds are loaded: stay in kid form briefly so magazine isn't wasted
    if (!enemyVisible && (brain.lostTimer || 0) <= tuning.loadedHoldLostMax) {
      it.fire = false;
      it.squid = false;
    }
    return null;
  }

  // 2. Active engagement inside threat range
  if (enemyVisible && inThreatRange && inkFrac > 0.06) {
    // Select authentic Splatoon 3 target charge by weapon archetype & distance band
    let targetCharge = tuning.fullCharge;
    let maxHold = tuning.maxHoldFar;

    if (dist < tuning.panicDist) {
      targetCharge = tuning.panicCharge;
      maxHold = tuning.maxHoldClose;
    } else if (archetype === 'bamboo' && (brain._bambooComboT || 0) > 0) {
      // Bamboozler 14: range is constant regardless of charge -> fire immediate 30+ follow-up after 85-dmg opener
      targetCharge = tuning.followUpCharge;
      maxHold = tuning.maxHoldClose;
    } else if (dist < tuning.closeDist) {
      targetCharge = tuning.closeCharge;
      maxHold = tuning.maxHoldClose;
    } else if (archetype === 'keeper' && dist < range * 0.88) {
      // Goo Tuber 1-ring (~70%) crosses 100-damage lethal threshold
      targetCharge = tuning.midLethalCharge;
      maxHold = tuning.maxHoldFar;
    }

    const tightTol = Math.max(0.032, Math.atan2(0.45, Math.max(dist, 2.0)));

    if (!wr.charging) {
      if ((wr.cooldown || 0) <= 1e-6 && (brain.react || 0) <= 0.14) {
        it.fire = true;
        it.squid = false;
        brain._weakChargeHold = 0;
      } else if (dist < range * tuning.retreatRangeRatio && onOwnInk && !it.fire) {
        // Post-shot cooldown while rushed: quick squid swim backwards to restore range advantage
        if (move && typeof move.set === 'function') {
          const side = brain.strafeS || 0.5;
          const mvx = -nx * 0.85 - nz * side * 0.45;
          const mvz = -nz * 0.85 + nx * side * 0.45;
          const ml = Math.hypot(mvx, mvz);
          if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
        }
        it.squid = true;
      }
    } else {
      // Currently charging
      if (chargeVal < targetCharge) {
        it.fire = true;
        it.squid = false;
        brain._weakChargeHold = 0;

        // Classic Squiffer: authentic 100% airborne charge rate -> periodic jump-charge evasive hop in mid-range duels
        if (
          tuning.allowJumpCharge &&
          actor.grounded !== false &&
          !actor.climbing &&
          (brain._chargerJumpCd || 0) <= 1e-6 &&
          chargeVal >= 0.10 &&
          chargeVal <= 0.72 &&
          dist >= tuning.panicDist * 0.85 &&
          dist <= range * 0.94
        ) {
          it.jump = true;
          const jitterCd = 0.35 * (0.5 + 0.5 * Math.sin((brain._chargerShotCount || 0) * 1.9 + (actor.id || 0)));
          brain._chargerJumpCd = 1.15 + jitterCd;
        }
      } else {
        // Hold briefly until aim ray converges cleanly onto target, then release
        brain._weakChargeHold = (brain._weakChargeHold || 0) + safeDt;
        if (off <= tightTol || brain._weakChargeHold >= maxHold) {
          it.fire = false;
          it.squid = false;
          brain._weakChargeHold = 0;
          if (archetype === 'bamboo') {
            if (targetCharge >= 0.85) {
              // Arm quick follow-up window for authentic 2-tap finish
              brain._bambooComboT = 0.75;
            } else {
              // Reset after follow-up shot so next cycle starts with full charge again
              brain._bambooComboT = 0;
            }
          }
        } else {
          it.fire = true;
          it.squid = false;
        }
      }
    }

    // Spacing & movement discipline while charging or being rushed
    if (wr.charging) {
      if (move && typeof move.set === 'function' && dist < range * tuning.retreatRangeRatio) {
        // Kite backward + slight strafe when an opponent closes inside preferred sniper distance
        const side = brain.strafeS || 0.4;
        const mvx = -nx * 0.82 - nz * side * 0.42;
        const mvz = -nz * 0.82 + nx * side * 0.42;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      }
      if (move && typeof move.multiplyScalar === 'function') {
        move.multiplyScalar(tuning.chargeMoveScale);
      }
      return writeAimOut(brain, idealYaw, idealPitch, wantYaw, wantPitch, tuning.aimBlend);
    }

    return null;
  }

  // 2b. Ink exhausted mid-charge: release immediately instead of deadlocking with Fire held forever
  if (wr.charging && inkFrac <= 0.06) {
    it.fire = false;
    it.squid = false;
    brain._weakChargeHold = 0;
    return null;
  }

  // 3. Target temporarily broke line-of-sight while charging:
  //    - Charge-Keep weapons (Squiffer / Splat Charger / E-liter 4K / Goo Tuber): swim-keep on own ink
  //      (Goo Tuber uniquely holds partial charges up to 5.0s -> 2.8s tactical reposition window).
  //    - Scoped & non-keep weapons (Splatterscope / 4K Scope / Bamboo / R-PEN): brief stationary pre-aim,
  //      never attempt invalid squid-keep, then cancel cleanly.
  if (wr.charging && !enemyVisible) {
    const lost = brain.lostTimer || 0;
    const canKeepNow = canKeep && onOwnInk && tuning.keepMaxLost > 0 && chargeVal >= tuning.keepMinCharge;

    if (canKeepNow && lost > 0.04 && lost <= tuning.keepMaxLost && inkFrac > 0.12) {
      it.fire = true;
      it.squid = true;
      // Goo Tuber extended keep: gently curve laterally around cover to re-open the sightline
      if (archetype === 'keeper' && move && typeof move.set === 'function') {
        const side = brain.strafeS || (((actor.id || 0) & 1) === 0 ? 0.8 : -0.8);
        const mvx = nx * 0.35 - nz * side * 0.90;
        const mvz = nz * 0.35 + nx * side * 0.90;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      }
    } else if (!canKeep && lost <= tuning.losHoldMax && chargeVal >= 0.70 && inkFrac > 0.15) {
      // Scoped anchor / non-keep pre-aim hold for a brief re-peek before cancelling
      it.fire = true;
      it.squid = false;
      if (move && typeof move.multiplyScalar === 'function') {
        move.multiplyScalar(tuning.chargeMoveScale);
      }
    } else if (lost > (canKeep ? tuning.keepMaxLost : tuning.losHoldMax) || inkFrac <= (canKeep ? 0.12 : 0.15)) {
      it.fire = false;
      it.squid = false;
      brain._weakChargeHold = 0;
    }
  }

  return null;
}
