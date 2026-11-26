// Dedicated Splatoon 3 Splatana (ワイパー系) Bot AI module.
// Grounded in authentic Splatoon 3 gameplay mechanics and weapon wiki data:
// - Inkipedia Splatana Stamper (ジムワイパー / s3-saber-normal): https://splatoonwiki.org/wiki/Splatana_Stamper
// - Inkipedia Splatana Wiper (ドライブワイパー / s3-saber-lite): https://splatoonwiki.org/wiki/Splatana_Wiper
// - Inkipedia Mint Decavitator (デンタルワイパーミント / s3-saber-heavy): https://splatoonwiki.org/wiki/Mint_Decavitator
// - Splatoon 3 Wiki* ブキ/ワイパー属: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%AF%E3%82%A4%E3%83%91%E3%83%BC%E5%B1%9E
//
// Fair-play invariants:
// - Never mutates weapon stats, damage, range, ink cost, or aimError.
// - Never reads live enemy position/velocity when enemy is hidden (no wallhack).
// - Controls only standard player inputs (fire, squid, sub, move, yaw/pitch lead).
// - O(1) time and zero per-tick heap allocations on the steady-state hot path.

const HZ = 60;
const EPS = 1e-6;
const FULL_CHARGE = 1.0 - 1e-5;
const INV_UINT32 = 2.3283064365386963e-10; // 1 / 2^32

function finite(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  if (!Number.isFinite(a)) return 0;
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export const SPLATANA_PROFILES = Object.freeze({
  normal: Object.freeze({
    archetype: 'normal', // ジムワイパー (Splatana Stamper)
    horizRange: 16.5,
    vertRange: 20.5,
    horizSpeed: 169.2,   // 2.82 * 60
    vertSpeed: 48.0,     // 0.80 * 60
    chargeBulletDelay: 6 / HZ,
    stepMin: 1.6,        // Closer than this risks stepping past the enemy
    stepMax: 4.5,        // Step (3.0m) + vertical slash reach (~1.5m)
    stepHyst: 0.45,      // Schmitt-trigger hysteresis around lunge band
    stepCommitCharge: 0.72,   // Last ~5.6F of 20F charge pushes stick forward
    stepSuppressCharge: 0.64, // Last ~7F suppresses accidental forward step
    prefDistRatio: 0.78, // Mid-long spacing: outrange short shooters
    prefDistMax: 13.8,
    kiteChargeDist: 9.2, // Backpedal-kite while charging vertical wave at mid-close
    kiteBackBias: -0.58,
    preferHorizCloseDist: 0, // Stamper relies on Charge -> Horiz cross-slash even at mid-close
    horizHyst: 0,
    agileCloseDist: 0,
    agileFwdBias: 0,
    ambushCloseMin: 0,
    ambushCloseMax: 0,
    ambushFwdBias: 0,
    lowInkChargeFrac: 0.14,  // 11.7% charge ink cost
    inkRecoverFrac: 0.18,
    inkRecoverExitFrac: 0.36,
    paintPitch: -0.095,
    paintSweepAmp: 0.44,
    paintStrafe: 0.34,
    usePathChargeInTurf: false,
    reserveWindow: 11 / HZ,
    chargeHoldMax: 0.26,
    stepHoldMax: 0.16,
    holdJitter: 0.032,
    comboWindow: 0.90,
    comboMaxSlashes: 1,  // Crisp 70 + 35 = 105 cross-slash combo
    strafeMinT: 0.62,
    strafeMaxT: 1.12,
    strafeSmooth: 7.5,
    latWeight: 0.90,
  }),
  lite: Object.freeze({
    archetype: 'lite', // ドライブワイパー (Splatana Wiper)
    horizRange: 13.0,
    vertRange: 16.5,
    horizSpeed: 198.0,   // 3.30 * 60
    vertSpeed: 72.0,     // 1.20 * 60
    chargeBulletDelay: 6 / HZ,
    stepMin: 1.2,
    stepMax: 3.5,        // Step (2.0m) + vertical slash reach (~1.2m)
    stepHyst: 0.35,
    stepCommitCharge: 0.64,   // 14F charge -> commit ~5F before release
    stepSuppressCharge: 0.56, // Clears full 5F stepStick ring buffer cleanly
    prefDistRatio: 0.66, // Agile strafe-skirmish distance
    prefDistMax: 10.2,
    kiteChargeDist: 5.4,
    kiteBackBias: -0.25,
    preferHorizCloseDist: 8.8, // Fast 16F horiz slashes (112.5 DPS) + 0.0945 u/f walk speed
    horizHyst: 0.90,     // Hysteresis: enter <= 8.8m, exit > 9.7m
    agileCloseDist: 12.8,// Weave diagonally forward from mid range into skirmish band
    agileFwdBias: 0.42,
    ambushCloseMin: 0,
    ambushCloseMax: 0,
    ambushFwdBias: 0,
    lowInkChargeFrac: 0.09,  // Only 6% charge / 3% horiz ink cost
    inkRecoverFrac: 0.12,
    inkRecoverExitFrac: 0.28,
    paintPitch: -0.09,
    paintSweepAmp: 0.50,
    paintStrafe: 0.38,
    usePathChargeInTurf: false,
    reserveWindow: 14 / HZ,
    chargeHoldMax: 0.24,
    stepHoldMax: 0.14,
    holdJitter: 0.028,
    comboWindow: 0.78,
    comboMaxSlashes: 2,  // 60 + 30 (+ 30) fast skirmish follow-up
    strafeMinT: 0.38,    // Brisk human crab-walk feints
    strafeMaxT: 0.74,
    strafeSmooth: 10.5,
    latWeight: 1.12,
  }),
  heavy: Object.freeze({
    archetype: 'heavy', // デンタルワイパーミント / スミ (Decavitator)
    horizRange: 13.5,
    vertRange: 15.0,
    horizSpeed: 138.0,   // 2.30 * 60
    vertSpeed: 42.0,     // 0.70 * 60
    chargeBulletDelay: 23 / HZ,
    stepMin: 2.2,        // Long 5.5m lunge passes through enemies closer than ~2.2m
    stepMax: 6.8,        // Step (5.5m) + wide horizontal-blade 1-shot reach (~1.6m)
    stepHyst: 0.55,      // Stay committed to lunge band up to 7.35m, exit below 2.0m
    stepCommitCharge: 0.72,
    stepSuppressCharge: 0.64,
    prefDistRatio: 0.66,
    prefDistMax: 10.2,
    kiteChargeDist: 7.4,
    kiteBackBias: -0.32,
    preferHorizCloseDist: 0, // Heavy horiz is slow (30F); rely on 80+40 combo & step 1-shot
    horizHyst: 0,
    agileCloseDist: 0,
    agileFwdBias: 0,
    ambushCloseMin: 6.8, // Just outside lunge band: push in diagonally to threaten 5.5m lunge
    ambushCloseMax: 9.2,
    ambushFwdBias: 0.48,
    lowInkChargeFrac: 0.22,  // Heavy 13% charge cost + 50F ink recovery lag
    inkRecoverFrac: 0.24,    // Brief squid-recover on own ink when outside immediate danger
    inkRecoverExitFrac: 0.44,
    paintPitch: -0.10,
    paintSweepAmp: 0.40,
    paintStrafe: 0.30,
    usePathChargeInTurf: false, // Decavitator horiz painting is denser & far more ink-efficient
    reserveWindow: 14 / HZ,
    chargeHoldMax: 0.26,
    stepHoldMax: 0.16,
    holdJitter: 0.035,
    comboWindow: 1.15,   // Generous window for 23F bullet delay + 32F cycle -> 80+40=120 combo
    comboMaxSlashes: 1,
    strafeMinT: 0.72,
    strafeMaxT: 1.28,
    strafeSmooth: 6.5,
    latWeight: 0.84,
  }),
});

const PROFILE_CACHE = new WeakMap();

/**
 * Checks whether the given weapon belongs to the Splatana (ワイパー) family.
 */
export function isSplatanaWeapon(weapon) {
  if (!weapon) return false;
  const catFam = weapon.catalogRecord?.family || weapon.family;
  if (catFam === 'splatana') return true;
  if (weapon.behaviorKind === 'splatana' || weapon.kind === 'splatana') return true;
  const src = weapon.sourceMainActor || weapon.catalogRecord?.sourceActor || weapon.catalogRecord?.sourceMainActor || '';
  const id = (weapon.id || '').toLowerCase();
  return src.includes('Saber') || src.includes('Splatana') || id.includes('saber') || id.includes('splatana') || id.includes('wiper');
}

/**
 * Resolves the exact Splatana archetype profile (Stamper / Wiper / Decavitator)
 * from catalogue metadata or weapon id, reading live catalogue speeds when present.
 * Uses a WeakMap cache to remain O(1) and zero-allocation on hot ticks.
 */
export function resolveSplatanaProfile(weapon) {
  if (weapon && typeof weapon === 'object') {
    const cached = PROFILE_CACHE.get(weapon);
    if (cached) return cached;
  }

  const src = weapon?.sourceMainActor || weapon?.catalogRecord?.sourceActor || weapon?.catalogRecord?.sourceMainActor || '';
  const id = (weapon?.id || '').toLowerCase();

  let base = SPLATANA_PROFILES.normal;
  if (src === 'WeaponSaberLite' || id.includes('saber-lite') || id.includes('wiper')) {
    base = SPLATANA_PROFILES.lite;
  } else if (src === 'WeaponSaberHeavy' || id.includes('saber-heavy') || id.includes('decavitator') || id.includes('dental')) {
    base = SPLATANA_PROFILES.heavy;
  } else if (src === 'WeaponSaberNormal' || id.includes('saber-normal') || id.includes('stamper') || id.includes('gym')) {
    base = SPLATANA_PROFILES.normal;
  }

  // Respect live catalogue parameters if present on the weapon record without mutating anything.
  const params = weapon?.catalogRecord?.parameters;
  let resolved = base;
  if (params) {
    const swing = params.spl__WeaponSaberParam?.SwingParam;
    const bv = params.BulletSaberVerticalParam;
    const bh = params.BulletSaberHorizontalParam;
    const reserveFrames = swing?.ReserveAcceptFrame;
    const vSpeed = bv?.MoveParam?.SpawnSpeed ? bv.MoveParam.SpawnSpeed * HZ : base.vertSpeed;
    const hSpeed = bh?.MoveParam?.SpawnSpeed ? bh.MoveParam.SpawnSpeed * HZ : base.horizSpeed;
    const vDelay = finite(swing?.ChargeSwingShotBulletFrame, base.chargeBulletDelay * HZ) / HZ;
    const resWin = Number.isFinite(reserveFrames) ? reserveFrames / HZ : base.reserveWindow;

    if (
      vSpeed !== base.vertSpeed ||
      hSpeed !== base.horizSpeed ||
      vDelay !== base.chargeBulletDelay ||
      resWin !== base.reserveWindow
    ) {
      resolved = Object.freeze({
        ...base,
        vertSpeed: vSpeed,
        horizSpeed: hSpeed,
        chargeBulletDelay: vDelay,
        reserveWindow: resWin,
      });
    }
  }

  if (weapon && typeof weapon === 'object') {
    PROFILE_CACHE.set(weapon, resolved);
  }
  return resolved;
}

function nextRand01(st) {
  st.rng = (Math.imul(st.rng, 1664525) + 1013904223) >>> 0;
  return st.rng * INV_UINT32;
}

function nextRandSigned(st) {
  return nextRand01(st) * 2 - 1;
}

function initRuntimeFields(st, actorId) {
  const seed = (Math.imul((actorId | 0) + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
  st.rng = seed || 0x13579bdf;
  st.inStepBand = false;
  st.inHorizBand = false;
  st.inkRecovering = false;
  st.comboSlashesLeft = 0;
  st.strafeDir = (st.rng & 1) ? 1 : -1;
  st.strafeTimer = 0.45 + nextRand01(st) * 0.45;
  st.smoothSide = st.strafeDir * 0.75;
  st.turfStrafeDir = st.strafeDir;
  st.turfStrafeTimer = 0.65 + nextRand01(st) * 0.65;
  st.swingJitter = nextRandSigned(st);
  st.spacingBreath = nextRandSigned(st) * 0.45;
  st.life = null;
}

function resetSplatanaTransientState(st) {
  st.plan = 'idle';
  st.comboFollowupT = 0;
  st.comboSlashesLeft = 0;
  st.chargeHoldT = 0;
  st.wasCharging = false;
  st.lastCharge = 0;
  st.turfPathCharge = false;
  st.turfSwingCount = 0;
  st.inStepBand = false;
  st.inHorizBand = false;
  st.inkRecovering = false;
}

function syncSplatanaLife(st, actor) {
  const life = typeof actor.netLife === 'number' && Number.isFinite(actor.netLife)
    ? actor.netLife
    : null;
  if (actor.alive === false) {
    resetSplatanaTransientState(st);
    st.life = life;
    return false;
  }
  if (life !== null) {
    if (st.life != null && st.life !== life) {
      resetSplatanaTransientState(st);
    }
    st.life = life;
  }
  return true;
}

function getSplatanaState(brain, actorId) {
  let st = brain._splatanaAI;
  if (!st) {
    st = brain._splatanaAI = {
      plan: 'idle',
      comboFollowupT: 0,
      chargeHoldT: 0,
      wasCharging: false,
      lastCharge: 0,
      turfPathCharge: false,
      turfSwingCount: 0,
      aimOut: { wantYaw: 0, wantPitch: 0 },
    };
  }
  if (st.rng === undefined) {
    initRuntimeFields(st, actorId);
  }
  return st;
}

function setMove2D(move, x, z) {
  if (!move) return;
  const len = Math.hypot(x, z);
  if (Number.isFinite(len) && len > 1e-4) {
    if (typeof move.set === 'function') move.set(x / len, 0, z / len);
    else { move.x = x / len; move.y = 0; move.z = z / len; }
  } else {
    if (typeof move.set === 'function') move.set(0, 0, 0);
    else { move.x = 0; move.y = 0; move.z = 0; }
  }
}

/**
 * Prevents accidental forward-step lunge (saberStepRequested triggers when dot(move, aimDir) >= 0.9)
 * when we intentionally want a fast stationary/strafing vertical slash.
 */
function suppressForwardStep(move, aimYaw, strafeSign) {
  if (!move || typeof move.x !== 'number') return;
  const fx = Math.sin(aimYaw);
  const fz = Math.cos(aimYaw);
  const dot = move.x * fx + move.z * fz;
  if (dot >= 0.78) {
    const sign = strafeSign >= 0 ? 1 : -1;
    const rx = Math.cos(aimYaw) * sign;
    const rz = -Math.sin(aimYaw) * sign;
    // Redirect to mostly lateral crab-walk (dot with aimDir ~ 0.35 << 0.90)
    setMove2D(move, fx * 0.35 + rx * 0.94, fz * 0.35 + rz * 0.94);
  }
}

/**
 * Updates human-like irregular lateral strafing with smooth stick interpolation
 * and occasional same-direction feints (O(1), zero allocation).
 */
function updateHumanStrafe(st, profile, brain, safeDt) {
  st.strafeTimer -= safeDt;
  if (st.strafeTimer <= 0) {
    // 82% direction switch, 18% short same-direction feint to break metronomic feel
    if (nextRand01(st) < 0.82) {
      st.strafeDir = -st.strafeDir;
      st.strafeTimer = profile.strafeMinT + nextRand01(st) * (profile.strafeMaxT - profile.strafeMinT);
    } else {
      st.strafeTimer = (profile.strafeMinT * 0.55) + nextRand01(st) * (profile.strafeMinT * 0.45);
    }
    st.spacingBreath = nextRandSigned(st) * 0.55;
  }

  const rawTarget = st.strafeDir * (0.82 + 0.18 * Math.abs(st.swingJitter));
  const brainHint = typeof brain.strafeS === 'number' && Number.isFinite(brain.strafeS)
    ? clamp(brain.strafeS, -1, 1)
    : null;
  const blendedTarget = brainHint !== null
    ? (rawTarget * 0.65 + brainHint * 0.35)
    : rawTarget;

  const alpha = Math.min(1, safeDt * profile.strafeSmooth);
  st.smoothSide += (blendedTarget - st.smoothSide) * alpha;
  return st.smoothSide;
}

/**
 * Drives a clean Splatana horizontal tap-slash cycle compatible with main-weapon-catalog.mjs:
 * - Frame A (ready or inside ReserveAcceptFrame): fire = true (starts chargeF > 0 or registers saberReserve)
 * - Frame B (charging with charge > 0): fire = false (emits saber-horizontal immediately)
 */
function driveHorizontalTap(actor, wr, it, reserveWindow) {
  const cs = wr.catalogState;
  const prevFire = !!actor._prevIntent?.fire;
  const cd = wr.cooldown || 0;

  if (wr.charging) {
    // Release immediately on the frame after press so weak horizontal slash emits cleanly.
    it.fire = false;
    return;
  }
  if (cs?.pending || cs?.melee) {
    // Allow early input reservation only inside ReserveAcceptFrame on a fresh rising edge.
    if (reserveWindow > 0 && cd > EPS && cd <= reserveWindow + EPS && !prevFire && !cs?.saberReserve) {
      it.fire = true;
    } else {
      it.fire = false;
    }
    return;
  }
  if (cd <= EPS) {
    it.fire = !prevFire;
    return;
  }
  if (reserveWindow > 0 && cd <= reserveWindow + EPS && !prevFire && !cs?.saberReserve) {
    it.fire = true;
    return;
  }
  it.fire = false;
}

/**
 * Turf War painting AI dedicated to Splatana weapons:
 * - Fast horizontal tap-slashing with smooth, natural lateral crab-walking ("カニ歩き塗り")
 *   for dense, ink-efficient turfing (preserves Stamper high turf rate).
 * - Occasional full-charge path-carving ("道作りタメ斬り") if enabled by profile,
 *   while suppressing accidental forward-step lunges that add post-swing lag.
 * - Decavitator stays on high-density horizontal slashes (higher ink & area efficiency than its charged slash).
 */
export function applySplatanaTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx) {
  if (!brain || !actor || !isSplatanaWeapon(actor.weapon)) return null;
  const it = actor.intent;
  const wr = actor.weaponRunner;
  if (!it || !wr) return null;

  const profile = resolveSplatanaProfile(actor.weapon);
  const st = getSplatanaState(brain, actor.id);
  if (!syncSplatanaLife(st, actor)) return null;
  if (actor.superJumpState || actor.climbing || actor.specialActive || it.special) {
    st.chargeHoldT = 0;
    st.turfPathCharge = false;
    st.wasCharging = false;
    st.lastCharge = 0;
    st.inStepBand = false;
    st.inHorizBand = false;
    st.inkRecovering = false;
    return null;
  }
  if (it.sub || brain._bombAim || wr.aimingSub) {
    it.fire = false;
    it.squid = false;
    st.chargeHoldT = 0;
    st.turfPathCharge = false;
    st.wasCharging = false;
    st.lastCharge = 0;
    return null;
  }

  const safeDt = Number.isFinite(dt) && dt >= 0 ? dt : (1 / HZ);
  inkFrac = finite(inkFrac, 0);
  baseYaw = finite(baseYaw, 0);
  const curCharge = finite(wr.charge, 0);

  // Reset combat-only timers when in turf paint mode
  st.comboFollowupT = 0;
  st.comboSlashesLeft = 0;
  st.chargeHoldT = 0;
  st.inStepBand = false;
  st.inHorizBand = false;
  st.inkRecovering = false;

  // Clear legacy charger-style paintPause stalls; Splatana cadence is governed by weapon cooldown & reserve
  if ((brain.paintPause || 0) > 0) {
    brain.paintPause = 0;
  }

  const cache = brain._turfMultiCache;
  const pitchReady = typeof ctx?.pitchReady === 'boolean'
    ? ctx.pitchReady
    : (typeof brain._turfPaintValidated === 'boolean' ? brain._turfPaintValidated : true);
  const needPaint = typeof ctx?.needPaint === 'boolean'
    ? ctx.needPaint
    : Boolean(brain._turfPaintLatch ?? true);
  const wantPaintNow = Boolean(needPaint && pitchReady && inkFrac > 0.10);

  if (wr.charging && !pitchReady && inkFrac >= 0.15) {
    it.fire = true;
    return null;
  }
  if (brain._turfPaintValidated === false && ctx?.pitchReady !== true) {
    it.fire = false;
    st.turfPathCharge = false;
    return null;
  }

  // Track completed swings to pace occasional path-carving vertical slashes when enabled
  if (st.wasCharging && !wr.charging) {
    st.turfSwingCount++;
    st.turfPathCharge = false;
  }

  // Decide whether to do a full-charge vertical path-carving slash:
  // Only when enabled by profile, moving along an unpainted/enemy path with healthy ink.
  const onNonOwnInk = actor.groundTeam !== 1;
  const longPathAhead = typeof brain._pathRemaining === 'function' ? brain._pathRemaining() > 8.5 : false;
  const wantPathCharge = Boolean(
    profile.usePathChargeInTurf &&
    wantMove &&
    wantPaintNow &&
    inkFrac > 0.38 &&
    onNonOwnInk &&
    (longPathAhead || (cache?.multiActive && cache.effOwn < 0.30)) &&
    (st.turfSwingCount % 4 === 3)
  );

  if (wr.charging) {
    if (st.turfPathCharge) {
      if (inkFrac < 0.14 || !pitchReady) {
        it.fire = false;
        st.turfPathCharge = false;
      } else if (curCharge >= FULL_CHARGE) {
        // Release full-charge vertical path slash without accidental step-lunge lag
        it.fire = false;
        st.turfPathCharge = false;
        suppressForwardStep(move, baseYaw, brain._smoothStrafe ?? st.turfStrafeDir);
      } else {
        it.fire = true;
      }
    } else {
      // Standard horizontal turf slash: release immediately once charged past minimal frame
      if (curCharge >= 0.02 || inkFrac < 0.15) {
        it.fire = (!pitchReady && inkFrac >= 0.15);
      } else {
        it.fire = true;
      }
    }
  } else if (wantPaintNow) {
    if (wantPathCharge && (wr.cooldown || 0) <= EPS && !wr.catalogState?.pending && !wr.catalogState?.melee) {
      st.turfPathCharge = true;
      it.fire = true;
      it.squid = false;
    } else {
      st.turfPathCharge = false;
      driveHorizontalTap(actor, wr, it, profile.reserveWindow);
      if (it.fire) it.squid = false;
    }
  } else {
    st.turfPathCharge = false;
    it.fire = false;
  }

  // Natural lateral crab-walk ("カニ歩き塗り") while slashing or during short swing cooldown
  const activelyPainting = it.fire || wr.charging || ((wr.cooldown || 0) > EPS && needPaint);
  const hasActiveNavPath = Array.isArray(brain.path) && brain.path.length > 1 && G?.nav?.nodes?.length > 4;
  const strafeRatio = hasActiveNavPath ? profile.paintStrafe * 0.24 : profile.paintStrafe;

  if (activelyPainting && wantMove && strafeRatio > 0 && move && typeof move.x === 'number') {
    st.turfStrafeTimer -= safeDt;
    if (st.turfStrafeTimer <= 0) {
      st.turfStrafeDir = -st.turfStrafeDir;
      st.turfStrafeTimer = 0.75 + nextRand01(st) * 0.85;
    }
    const flankBias = cache?.flankBias || 0;
    const targetSign = Math.abs(flankBias) > 0.05
      ? (flankBias > 0 ? 1 : -1)
      : st.turfStrafeDir;
    const prevStrafe = brain._smoothStrafe ?? targetSign;
    const smoothSign = prevStrafe + (targetSign - prevStrafe) * Math.min(1, safeDt * 7.5);
    brain._smoothStrafe = smoothSign;

    const perpX = Math.cos(baseYaw) * smoothSign;
    const perpZ = -Math.sin(baseYaw) * smoothSign;
    setMove2D(move, move.x + perpX * strafeRatio, move.z + perpZ * strafeRatio);
  }

  st.wasCharging = !!wr.charging;
  st.lastCharge = curCharge;

  if (ctx && Number.isFinite(ctx.wantYaw)) {
    const out = st.aimOut;
    out.wantYaw = ctx.wantYaw;
    out.wantPitch = profile.paintPitch;
    return out;
  }
  return null;
}

/**
 * Combat AI dedicated to Splatana weapons (Stamper / Wiper / Decavitator):
 * - Hysteresis on lunge & close-skirmish bands eliminates mechanical distance-boundary flickering.
 * - Lightweight O(1) human strafe rhythm & subtle per-swing timing jitter replace metronomic movement.
 * - Weapon-authentic playstyles:
 *   1. Stamper (normal): Charge vertical (70) -> Horizontal (35) / Burst Bomb cross-slash combo + mid-range kiting charge.
 *   2. Wiper (lite): High-speed irregular crab-walk horizontal pressure (16F / 0.0945 u/f) inside 8.8m + agile closing-in.
 *   3. Decavitator (heavy): 80+40 lethal combo + 5.5m lunge ambush closing + 13%/50F ink-lag recovery management.
 * - Fair lead compensation for slow vertical waves while preserving full human aimError verbatim.
 */
export function applySplatanaCombat(brain, G, actor, dt, move, ctx) {
  if (!brain || !actor || !ctx || !isSplatanaWeapon(actor.weapon)) return null;
  const it = actor.intent;
  const wr = actor.weaponRunner;
  if (!it || !wr) return null;

  const profile = resolveSplatanaProfile(actor.weapon);
  const st = getSplatanaState(brain, actor.id);
  if (!syncSplatanaLife(st, actor)) return null;
  if (actor.superJumpState || actor.climbing || actor.specialActive || it.special) {
    st.chargeHoldT = 0;
    st.turfPathCharge = false;
    st.wasCharging = false;
    st.lastCharge = 0;
    st.inStepBand = false;
    st.inHorizBand = false;
    st.inkRecovering = false;
    return null;
  }
  if (it.sub || brain._bombAim || wr.aimingSub) {
    it.fire = false;
    it.squid = false;
    st.chargeHoldT = 0;
    st.wasCharging = false;
    st.lastCharge = 0;
    return null;
  }

  const safeDt = Number.isFinite(dt) && dt >= 0 ? dt : (1 / HZ);
  const dist = finite(ctx.dist, 0);
  const range = Number.isFinite(ctx.range) && ctx.range > 0 ? ctx.range : 12;
  const dx = finite(ctx.dx, 0);
  const dz = finite(ctx.dz, 0);
  const enemyVisible = Boolean(ctx.enemyVisible);
  const aimed = Boolean(ctx.aimed);
  const off = finite(ctx.off, 0);
  const inkFrac = finite(ctx.inkFrac, 0);
  const idealYaw = ctx.idealYaw;
  const wantYaw = ctx.wantYaw;
  const wantPitch = ctx.wantPitch;
  const curCharge = finite(wr.charge, 0);

  const safeDist = Math.max(dist, 0.01);
  const dirLen = Math.hypot(dx, dz);
  const nx = dirLen > 1e-4 ? dx / dirLen : 0;
  const nz = dirLen > 1e-4 ? dz / dirLen : 0;
  const effHorizRange = Math.max(profile.horizRange, range * 0.95);
  const effVertRange = Math.max(profile.vertRange, range * 1.15);

  // Decay follow-up combo window
  if (st.comboFollowupT > 0) {
    st.comboFollowupT = Math.max(0, st.comboFollowupT - safeDt);
    if (st.comboFollowupT <= 0) st.comboSlashesLeft = 0;
  }

  // Detect release transitions to drive natural combo flow & refresh per-swing human jitter
  if (st.wasCharging && !wr.charging) {
    if (st.lastCharge >= FULL_CHARGE - 0.05) {
      // Full-charge vertical/charged slash released -> open cross-slash follow-up window!
      st.comboFollowupT = profile.comboWindow;
      st.comboSlashesLeft = profile.comboMaxSlashes;
      st.chargeHoldT = 0;
    } else if (st.plan === 'combo_followup' && st.comboSlashesLeft > 0) {
      // Consumed one horizontal follow-up slash in the combo
      st.comboSlashesLeft = Math.max(0, st.comboSlashesLeft - 1);
      if (st.comboSlashesLeft === 0) {
        st.comboFollowupT = 0;
      }
    }
    st.swingJitter = nextRandSigned(st);
  }

  const cs = wr.catalogState;
  const canFight = Boolean(enemyVisible && (brain.react || 0) <= 0.08 && inkFrac > 0.04 && dist <= effVertRange * 1.06);
  const isCommittedCharge = Boolean(
    wr.charging &&
    curCharge >= 0.35 &&
    st.plan !== 'horiz_spam' &&
    st.plan !== 'combo_followup'
  );

  // Out-of-combat / target-lost handling
  if (!canFight) {
    st.inStepBand = false;
    st.inHorizBand = false;
    st.inkRecovering = false;
    if (wr.charging) {
      if (!enemyVisible && (brain.lostTimer || 0) > 0.55) {
        it.fire = false;
        st.chargeHoldT = 0;
      } else if (dist > effVertRange * 1.15 || inkFrac < 0.05) {
        it.fire = false;
        st.chargeHoldT = 0;
      } else {
        // Keep brief pre-charge while closing in or reacquiring
        it.fire = curCharge < FULL_CHARGE;
      }
    } else {
      it.fire = false;
      // Out of range: squid-swim on own ink, or path-paint on enemy/dry ink
      if (dist > effVertRange * 1.02) {
        if (actor.groundTeam === 1) {
          it.squid = true;
        } else if (inkFrac > 0.20 && !actor.specialActive) {
          driveHorizontalTap(actor, wr, it, profile.reserveWindow);
          if (it.fire) it.squid = false;
        }
      }
    }
    st.plan = 'idle';
    st.wasCharging = !!wr.charging;
    st.lastCharge = curCharge;
    return null;
  }

  // --- Hysteresis Band Evaluation (prevents mechanical threshold flipping) ---
  const nearWater = typeof brain._nearWater === 'function' && brain._nearWater(actor, 2.2);
  const lowInkForCharge = inkFrac < profile.lowInkChargeFrac;
  const stepEnterMin = profile.stepMin;
  const stepEnterMax = profile.stepMax;
  const stepExitMin = Math.max(0.8, profile.stepMin - profile.stepHyst * 0.35);
  const stepExitMax = profile.stepMax + profile.stepHyst;

  if (!actor.grounded || nearWater || lowInkForCharge) {
    st.inStepBand = false;
  } else if (st.inStepBand) {
    st.inStepBand = dist >= stepExitMin && dist <= stepExitMax;
  } else {
    st.inStepBand = dist >= stepEnterMin && dist <= stepEnterMax;
  }
  const canStepHere = st.inStepBand;

  if (profile.preferHorizCloseDist > 0) {
    if (st.inHorizBand) {
      st.inHorizBand = dist <= profile.preferHorizCloseDist + profile.horizHyst;
    } else {
      st.inHorizBand = dist <= profile.preferHorizCloseDist;
    }
  } else {
    st.inHorizBand = false;
  }

  // Emergency low-HP close fight: fast horizontal slashes rather than dying mid-charge
  const emergencyClose = dist < 5.5 && typeof actor.hp === 'number' && actor.hp < 45;

  // Decavitator ink-economy recovery hysteresis (13% charge + 50F ink recovery lag)
  const canSafeInkRecover = Boolean(
    profile.archetype === 'heavy' &&
    actor.groundTeam === 1 &&
    !wr.charging &&
    !cs?.pending &&
    !cs?.melee &&
    !actor.specialActive &&
    !emergencyClose &&
    st.comboFollowupT <= 0 &&
    dist > profile.stepMax + 1.0
  );
  if (st.inkRecovering) {
    if (!canSafeInkRecover || inkFrac >= profile.inkRecoverExitFrac) {
      st.inkRecovering = false;
    }
  } else if (canSafeInkRecover && inkFrac < profile.inkRecoverFrac) {
    st.inkRecovering = true;
  }

  // --- Determine Tactical Plan ---
  let plan = 'charge_slash';
  if (isCommittedCharge) {
    // Commitment guard: never throw away a 35%+ charge into a weak horizontal slash on distance jitter
    plan = canStepHere ? 'step_slash' : 'charge_slash';
  } else if (st.inkRecovering) {
    plan = 'ink_recover';
  } else if (st.comboFollowupT > 0 && st.comboSlashesLeft > 0 && dist <= effHorizRange * 1.02 && !canStepHere) {
    // Cross-slash follow-up (Stamper 70+35=105 / Decavitator 80+40=120 / Wiper 60+30)
    plan = 'combo_followup';
  } else if (lowInkForCharge || emergencyClose) {
    plan = 'horiz_spam';
  } else if (canStepHere) {
    // Deliberate forward-step 1-shot lethal vertical/charged slash (180-240 dmg)
    plan = 'step_slash';
  } else if (dist < profile.stepMin) {
    // Point-blank (< stepMin): stationary non-stepped charged slash (avoids stepping past enemy)
    // or rapid horizontal slash for Wiper
    plan = profile.archetype === 'lite' ? 'horiz_spam' : 'charge_slash';
  } else if (st.inHorizBand) {
    // Splatana Wiper excels at high-speed crab-walk horizontal skirmishing inside 8.8m (exit 9.7m)
    plan = 'horiz_spam';
  } else {
    // Standard mid/long range: charge vertical/charged slash to open the lethal combo
    plan = 'charge_slash';
  }

  st.plan = plan;

  // Brief squid ink recovery for Decavitator on own ink at safe distance
  if (plan === 'ink_recover') {
    it.fire = false;
    it.squid = true;
    const side = updateHumanStrafe(st, profile, brain, safeDt);
    const mvx = nx * -0.35 - nz * side * 0.92;
    const mvz = nz * -0.35 + nx * side * 0.92;
    setMove2D(move, mvx, mvz);
    st.wasCharging = !!wr.charging;
    st.lastCharge = curCharge;
    return null;
  }

  it.squid = false;

  // --- Sub-weapon quick-combo (e.g., Stamper Burst Bomb after vertical slash) ---
  const subId = actor.weapon?.sub;
  if (
    plan === 'combo_followup' &&
    subId === 'burst' &&
    !wr.charging &&
    !cs?.pending &&
    !cs?.melee &&
    !actor.specialActive &&
    aimed &&
    dist >= 4.5 &&
    dist <= 13.5 &&
    inkFrac >= 0.52 &&
    (brain.bombCd || 0) <= 0
  ) {
    it.sub = true;
    it.fire = false;
    brain.bombCd = 3.2;
    st.comboFollowupT = 0;
    st.comboSlashesLeft = 0;
    st.wasCharging = !!wr.charging;
    st.lastCharge = curCharge;
    return null;
  }

  // --- Fire & Charge Execution ---
  const aimYawRef = Number.isFinite(actor.aimYaw) ? actor.aimYaw : finite(idealYaw, 0);
  const side = updateHumanStrafe(st, profile, brain, safeDt);
  const strafeSign = side >= 0 ? 1 : -1;

  if (plan === 'combo_followup' || plan === 'horiz_spam') {
    st.chargeHoldT = 0;
    if (aimed || (off || 0) < 0.24) {
      driveHorizontalTap(actor, wr, it, profile.reserveWindow);
    } else {
      it.fire = false;
    }
  } else if (plan === 'charge_slash' || plan === 'step_slash') {
    const baseHoldMax = plan === 'step_slash' ? profile.stepHoldMax : profile.chargeHoldMax;
    const holdMax = Math.max(0.08, baseHoldMax + st.swingJitter * profile.holdJitter);
    const tightReleaseTol = plan === 'step_slash' ? 0.22 : Math.max(0.08, Math.atan2(0.75, safeDist));

    if (cs?.pending || cs?.melee) {
      it.fire = false;
    } else if (!wr.charging) {
      if ((wr.cooldown || 0) <= EPS) {
        // Pre-charge immediately even while finishing turn-in so charge finishes as aim settles
        it.fire = true;
        st.chargeHoldT = 0;
      } else {
        it.fire = false;
      }
    } else {
      if (curCharge < FULL_CHARGE) {
        it.fire = true;
        st.chargeHoldT = 0;
      } else {
        // Full charge reached! Release as soon as aimed, or force-release after bounded holdMax
        st.chargeHoldT += safeDt;
        if (aimed || (off || 0) <= tightReleaseTol || st.chargeHoldT >= holdMax) {
          it.fire = false;
          st.chargeHoldT = 0;
        } else {
          it.fire = true;
        }
      }
    }
  }

  // --- Human-like Combat Movement, Weapon-Specific Spacing & Step-Lunge Control ---
  const prefDist = Math.min(effHorizRange * profile.prefDistRatio, profile.prefDistMax) + st.spacingBreath;

  if (plan === 'step_slash' && wr.charging && curCharge >= profile.stepCommitCharge) {
    // Disguise the lunge during early charge, then snap straight into aim direction (dot >= 0.95)
    // for the final ~5 frames so saberStepRequested() reliably triggers the 1-shot lunge!
    setMove2D(move, nx, nz);
  } else {
    // Smooth proportional spacing instead of a hard mechanical staircase
    let fwd = clamp((dist - prefDist) / 2.6, -0.78, 0.70);

    if (plan === 'step_slash') {
      // Early charge inside lunge band: subtle diagonal approach while disguising the lunge
      fwd = clamp((dist - (profile.stepMin + profile.stepMax) * 0.48) / 2.0, -0.15, 0.38);
    } else if (profile.archetype === 'normal' && plan === 'charge_slash' && dist < profile.kiteChargeDist) {
      // Stamper mid-range kiting charge slash ("中距離引きタメ斬り")
      const kiteT = clamp((profile.kiteChargeDist - dist) / 4.0, 0, 1);
      fwd = Math.min(fwd, profile.kiteBackBias * (0.45 + 0.55 * kiteT));
    } else if (profile.archetype === 'lite' && dist > profile.preferHorizCloseDist && dist <= profile.agileCloseDist && inkFrac >= 0.25) {
      // Wiper agile closing-in ("軽快な詰め") into high-DPS horizontal skirmish band
      fwd = Math.max(fwd, profile.agileFwdBias);
    } else if (
      profile.archetype === 'heavy' &&
      dist >= profile.ambushCloseMin &&
      dist <= profile.ambushCloseMax &&
      inkFrac >= 0.34 &&
      !wr.charging
    ) {
      // Decavitator aggressive ambush closing ("長い踏み込み距離を活かした奇襲")
      fwd = Math.max(fwd, profile.ambushFwdBias);
    } else if (plan === 'charge_slash' && dist < profile.kiteChargeDist) {
      fwd = Math.min(fwd, profile.kiteBackBias);
    }

    const mvx = nx * fwd - nz * side * profile.latWeight;
    const mvz = nz * fwd + nx * side * profile.latWeight;
    setMove2D(move, mvx, mvz);

    // If about to release a non-stepped charged slash, keep dot(move, aimDir) < 0.80 across the
    // full 5-frame stick window so saberStepRequested() never misfires and adds 10-23F lunge lag.
    if (plan === 'charge_slash' && wr.charging && curCharge >= profile.stepSuppressCharge) {
      suppressForwardStep(move, aimYawRef, strafeSign);
    }
  }

  st.wasCharging = !!wr.charging;
  st.lastCharge = curCharge;

  // --- Fair Projectile-Speed Lead Compensation for Slow Vertical Waves ---
  // Only uses target velocity when enemy is actively visible in the latest perception tick
  // (seeTimer > 1, never wallhacks). Preserves bots.js human aimError verbatim.
  if (
    (plan === 'charge_slash' || plan === 'step_slash') &&
    enemyVisible &&
    (brain.seeTimer || 0) > 1 + EPS &&
    brain.target?.vel &&
    Number.isFinite(wantYaw) &&
    Number.isFinite(idealYaw) &&
    Number.isFinite(wantPitch)
  ) {
    const tvx = brain.target.vel.x;
    const tvz = brain.target.vel.z;
    if (Number.isFinite(tvx) && Number.isFinite(tvz) && tvx * tvx + tvz * tvz > 0.04) {
      const horizLead = safeDist / Math.max(profile.horizSpeed, 30);
      const vertLead = clamp(profile.chargeBulletDelay + safeDist / Math.max(profile.vertSpeed, 20), 0, 0.55);
      const extraLead = Math.max(0, vertLead - horizLead);
      if (extraLead > 0.01) {
        const predDx = dx + tvx * extraLead;
        const predDz = dz + tvz * extraLead;
        const predYaw = Math.atan2(predDx, predDz);
        if (Number.isFinite(predYaw)) {
          const yawShift = clamp(wrapAngle(predYaw - idealYaw), -0.35, 0.35);
          // Preserve exact human aimError offset from bots.js: wantYaw = idealYaw + errYaw
          const out = st.aimOut;
          out.wantYaw = wrapAngle(wantYaw + yawShift);
          out.wantPitch = wantPitch;
          return out;
        }
      }
    }
  }

  return null;
}
