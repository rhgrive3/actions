// Dedicated Splatoon 3 Stringer Bot AI module (2026-11-26).
// Purely controls bot inputs (fire/charge release, jump vertical shot, squid/kiting,
// ballistic arc pitch offset) without modifying weapon stats, aim error, or line-of-sight rules.
// Designed for O(1) zero-allocation execution per tick with organic, human-like pacing.
//
// Grounded in Splatoon 3 Wiki / Inkipedia & catalog 11.3.0 physics:
// - Tri-Stringer (WeaponStringerNormal): 3 arrows, mid=30/72 (0.417) unlocks explosive bolts
//   at SpawnSpeedMid=2.1 (~12.8m flat reach) & ArrowAngleMid=8 deg; 2nd ring scales speed 2.1->3.85
//   (~23.5m flat, ~28.5m arched) and converges spread 8->0 deg. Airborne charge is penalized.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%88%E3%83%A9%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%B3%E3%82%AC%E3%83%BC
//   Ref: https://splatoonwiki.org/wiki/Tri-Stringer
// - REEF-LUX 450 / LACT-450 (WeaponStringerShort): 3 arrows, NO explosive bolts, fast full charge
//   (34F = 0.567s, mid=12/34 = 0.353), NO airborne charge penalty (can jump-charge smoothly into
//   full-charge 0.5 deg 135-dmg vertical snipe), top-tier uncharged horizontal paint
//   (strictly preserves WeaponStringerShort stringerChargeCap = 0.14 test contract).
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/LACT-450
//   Ref: https://splatoonwiki.org/wiki/REEF-LUX_450
// - Wellstring V (WeaponStringerExplosion): 5 arrows, converges through 1st ring (12->-4 deg at
//   mid=40/80=0.50, ~14.0m flat reach with 5 tight explosive bolts for close-mid intercept), then
//   fans out to -12 deg at full charge (80F, ~21.4m flat, ~25.9m arched) for wide-area horizontal
//   5-arrow bombardment and turf carpet coverage.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%95%E3%83%AB%E3%82%A4%E3%83%89V
//   Ref: https://splatoonwiki.org/wiki/Wellstring_V

import { specialAllowsMain } from './bot-special-movement.mjs';

const EMPTY_CTX = Object.freeze({});
const FALLBACK_AIM_OUT = { wantYaw: 0, wantPitch: 0 };
const FALLBACK_TURF_OUT = { archetype: 'normal', cap: 0.09, fullSweep: false };
const TWO_PI_10 = Math.PI * 20;

function finite(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resetStringerTransientState(brain) {
  if (!brain) return;
  brain._stringerHoldT = 0;
  brain._stringerJumpCd = 0;
  brain._stringerLowPaintRun = 0;
}

function syncStringerLife(brain, actor) {
  const life = typeof actor?.netLife === 'number' && Number.isFinite(actor.netLife)
    ? actor.netLife
    : null;
  if (actor?.alive === false) {
    resetStringerTransientState(brain);
    if (brain) brain._stringerLife = life;
    return false;
  }
  if (brain && life !== null) {
    if (brain._stringerLife != null && brain._stringerLife !== life) {
      resetStringerTransientState(brain);
    }
    brain._stringerLife = life;
  }
  return true;
}

/**
 * Derives a stable 32-bit integer seed per bot once (cached on brain) for O(1) human-like variation.
 */
function resolveStringerSeed(brain, actor) {
  if (brain && typeof brain._stringerSeed === 'number') {
    return brain._stringerSeed;
  }
  let s = 2166136261 | 0;
  const rawId = actor?.id ?? brain?.id ?? 1;
  if (typeof rawId === 'number') {
    s ^= (rawId | 0);
  } else if (typeof rawId === 'string') {
    for (let i = 0; i < rawId.length; i++) {
      s = Math.imul(s ^ rawId.charCodeAt(i), 16777619);
    }
  }
  s = Math.imul(s ^ ((actor?.team || 1) * 31), 0x85ebca6b) | 0;
  if (brain) brain._stringerSeed = s;
  return s;
}

/**
 * O(1) zero-allocation deterministic pseudo-random noise in [-1, 1] for subtle,
 * non-periodic human micro-variation across shots and bots.
 */
export function stringerMicroNoise(seed, step, salt = 0) {
  let h = (seed | 0) ^ Math.imul((step | 0) + 1, 0x9e3779b1) ^ Math.imul((salt | 0) + 17, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 2147483647.5) - 1.0;
}

function getAimOut(brain, wantYaw, wantPitch) {
  let out;
  if (brain) {
    out = brain._stringerAimOut;
    if (!out) {
      out = { wantYaw: 0, wantPitch: 0 };
      brain._stringerAimOut = out;
    }
  } else {
    out = FALLBACK_AIM_OUT;
  }
  out.wantYaw = wantYaw;
  out.wantPitch = wantPitch;
  return out;
}

function getTurfOut(brain, archetype, cap, fullSweep) {
  let out;
  if (brain) {
    out = brain._stringerTurfOut;
    if (!out) {
      out = { archetype: 'normal', cap: 0.09, fullSweep: false };
      brain._stringerTurfOut = out;
    }
  } else {
    out = FALLBACK_TURF_OUT;
  }
  out.archetype = archetype;
  out.cap = cap;
  out.fullSweep = fullSweep;
  return out;
}

/**
 * Classifies a Stringer weapon into its Splatoon 3 sub-archetype (zero-alloc fast path):
 * - 'short'     : REEF-LUX 450 (LACT-450)
 * - 'explosion' : Wellstring V (フルイドV)
 * - 'normal'    : Tri-Stringer (トライストリンガー) & generic fallback
 */
export function classifyStringerArchetype(weapon) {
  const actorName = weapon?.sourceMainActor || weapon?.catalogRecord?.sourceMainActor || '';
  if (actorName === 'WeaponStringerShort') return 'short';
  if (actorName === 'WeaponStringerExplosion') return 'explosion';
  if (actorName === 'WeaponStringerNormal') return 'normal';

  const rawId = weapon?.id || '';
  if (rawId === 's3-stringer-short') return 'short';
  if (rawId === 's3-stringer-explosion') return 'explosion';
  if (rawId === 's3-stringer-normal') return 'normal';

  if (rawId) {
    const id = rawId.toLowerCase();
    if (id.includes('stringer-short') || id.includes('lact') || id.includes('reef')) return 'short';
    if (id.includes('stringer-explosion') || id.includes('wellstring') || id.includes('fluid')) return 'explosion';
  }
  return 'normal';
}

/**
 * Resolves the first-ring charge fraction (ChargeFrameMidCharge / ChargeFrameFullCharge)
 * directly from the weapon definition or catalog parameters.
 */
export function resolveStringerFirstChargeFrac(weapon, archetype = classifyStringerArchetype(weapon)) {
  if (weapon?.firstChargeTime > 0 && weapon?.chargeTime > 0) {
    return clamp(weapon.firstChargeTime / weapon.chargeTime, 0.20, 0.85);
  }
  const cp = weapon?.catalogRecord?.parameters?.spl__WeaponStringerParam?.ChargeParam;
  if (cp?.ChargeFrameMidCharge > 0 && cp?.ChargeFrameFullCharge > cp.ChargeFrameMidCharge) {
    return clamp(cp.ChargeFrameMidCharge / cp.ChargeFrameFullCharge, 0.20, 0.85);
  }
  if (archetype === 'short') return 12 / 34;      // 0.353
  if (archetype === 'explosion') return 40 / 80;  // 0.500
  return 30 / 72;                                 // 0.417
}

/**
 * Computes the target combat charge fraction for a Stringer based on its archetype,
 * real catalog ballistics, distance to target, enemy motion (when visible), and subtle
 * human micro-variation.
 *
 * Extra scalar parameters (closingSpeed, latSpeed, noise) default to 0 for backward
 * compatibility and zero-allocation hot-path invocation.
 */
export function computeStringerCombatCharge(
  weapon,
  dist,
  range,
  archetype = classifyStringerArchetype(weapon),
  closingSpeed = 0,
  latSpeed = 0,
  noise = 0,
) {
  dist = finite(dist, 0);
  closingSpeed = finite(closingSpeed, 0);
  latSpeed = finite(latSpeed, 0);
  noise = finite(noise, 0);
  const firstFrac = resolveStringerFirstChargeFrac(weapon, archetype);
  // Small safety margin above ChargeFrameMidCharge so frame rounding never drops explosive bolts.
  const explosiveFloor = Math.min(0.95, firstFrac + 0.025);

  if (archetype === 'short') {
    // LACT-450 has NO explosive bolts and charges to full in 0.567s (34F).
    // 1st-ring flat reach is ~8.85m (spread 5 deg); full charge reaches ~15.6m (spread 0.5 deg, 135 dmg).
    const shortFloor = Math.max(0.36, firstFrac + 0.01);
    let base;
    if (dist < 6.5) {
      base = Math.max(0.38, firstFrac + 0.03);
    } else if (dist < 10.5) {
      base = lerp(0.58, 0.94, clamp((dist - 6.5) / 4.0, 0, 1));
    } else {
      base = 0.96;
    }
    // Punish close rushers with a snappy 1st-ring 135-dmg release; soften slightly vs fast strafers
    if (closingSpeed > 1.5 && dist < 8.8) {
      base -= clamp((closingSpeed - 1.5) * 0.032, 0, 0.10);
    } else if (latSpeed > 2.5 && dist < 10.5) {
      base -= clamp((latSpeed - 2.5) * 0.022, 0, 0.05);
    }
    return clamp(base + noise * 0.024, shortFloor, 0.99);
  }

  if (archetype === 'explosion') {
    // Wellstring V converges 5 arrows right around 1st ring (0.50, -4 deg, ~14.0m flat) with 5 explosive bolts.
    // 2nd ring fans back out (-4 -> -12 deg) while extending range to ~21.4m flat (~25.9m arched).
    let base;
    if (dist < 13.5) {
      base = Math.min(0.58, explosiveFloor);
    } else if (dist < 17.5) {
      base = lerp(0.62, 0.88, clamp((dist - 13.5) / 4.0, 0, 1));
    } else {
      base = 0.96;
    }
    // If enemy rushes into 1st-ring intercept envelope (< 15.2m), snap to tight 5-arrow 1st-ring cluster
    if (closingSpeed > 1.4 && dist < 15.2) {
      base -= clamp((closingSpeed - 1.4) * 0.045, 0, 0.14);
    } else if (dist >= 15.0 && (closingSpeed < -1.2 || latSpeed > 2.4)) {
      // Enemy backing off or strafing at range: commit fuller to wide -12 deg 5-arrow bombardment
      base += 0.035;
    }
    return clamp(base + noise * 0.020, explosiveFloor, 0.99);
  }

  // Tri-Stringer (normal):
  // 1st ring (0.417) has SpawnSpeedMid=2.1 (~12.8m flat reach) and ArrowAngleMid=8 deg.
  // Use quick 1st-ring explosive bolts inside < 10.5m; scale through the 2nd ring
  // across 10.5m..17.5m so arrows actually reach and converge (8->0 deg); full charge beyond 17.5m.
  let base;
  if (dist < 10.5) {
    base = explosiveFloor;
  } else if (dist < 17.5) {
    base = lerp(0.56, 0.94, clamp((dist - 10.5) / 7.0, 0, 1));
  } else {
    base = 0.96;
  }
  // Against an aggressive rusher in mid-close, release slightly earlier (still >= explosiveFloor);
  // against a retreating enemy in mid-range, draw slightly deeper into 2nd-ring speed.
  if (closingSpeed > 1.6 && dist < 14.5) {
    base -= clamp((closingSpeed - 1.6) * 0.030, 0, 0.08);
  } else if (closingSpeed < -1.5 && dist >= 10.5 && dist < 18.0) {
    base += clamp((-closingSpeed - 1.5) * 0.018, 0, 0.04);
  }
  return clamp(base + noise * 0.022, explosiveFloor, 0.99);
}

/**
 * Computes a purely physical ballistic arc pitch offset (radians) to compensate for
 * Stringer arrow gravity drop over medium/long distances without touching human aimError.
 */
export function computeStringerArcPitch(dist, charge, archetype) {
  if (!Number.isFinite(dist) || !Number.isFinite(charge)) return 0;
  // Approximate flat-fire body-height reach at the current charge level (from catalog physics)
  let flatReach;
  if (archetype === 'short') {
    flatReach = lerp(8.85, 15.56, clamp((charge - 0.35) / 0.65, 0, 1));
  } else if (archetype === 'explosion') {
    flatReach = charge <= 0.5
      ? lerp(8.85, 14.0, clamp(charge / 0.5, 0, 1))
      : lerp(14.0, 21.36, clamp((charge - 0.5) / 0.5, 0, 1));
  } else {
    flatReach = lerp(12.82, 23.50, clamp((charge - 0.417) / 0.583, 0, 1));
  }

  if (dist <= 6.5 || flatReach <= 1) return 0;
  const ratio = dist / flatReach;
  if (ratio <= 0.55) return 0;
  // Gentle upward lob (up to ~7.5 deg = 0.13 rad) so arrows drop cleanly onto target height
  return clamp((ratio - 0.55) * 0.21, 0, 0.13);
}

/**
 * Applies Splatoon 3 Stringer Turf War painting behavior:
 * - Tri-Stringer: rapid low-charge horizontal fan (cap 0.09) with organic sweep tiling.
 * - LACT-450: nimble rapid tap-shot horizontal painting (strictly preserving
 *   WeaponStringerShort stringerChargeCap = 0.14 contract) with crisp cadence & agile sweep.
 * - Wellstring V: low-charge horizontal fan by default (cap ~0.26), organically weaving in
 *   full-charge 5-arrow explosive horizontal sweeps when facing wide unpainted/enemy turf
 *   on full multi-sample stages with ample ink (no rigid modulo periodicity).
 * - Preserves pitchReady hold-charge safety contract when recovering from downward foot-paint.
 */
export function applyStringerTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx = EMPTY_CTX) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!it || !wr) return null;
  if (!syncStringerLife(brain, actor)) return null;
  if (actor.superJumpState || actor.climbing || !specialAllowsMain(actor) || it.special) {
    if (brain) brain._stringerHoldT = 0;
    return null;
  }
  if (it.sub || brain?._bombAim || wr.aimingSub) {
    it.fire = false;
    it.squid = false;
    if (brain) brain._stringerHoldT = 0;
    return null;
  }

  inkFrac = finite(inkFrac, 0);
  const curCharge = finite(wr.charge, 0);
  const w = actor.weapon;
  const archetype = classifyStringerArchetype(w);
  const cache = ctx.cache ?? brain?._turfMultiCache;
  const seed = resolveStringerSeed(brain, actor);
  const shotIdx = brain?._stringerPaintShotIdx || 0;
  const sweepNoise = stringerMicroNoise(seed, shotIdx, 11);

  // Suppress legacy long paintPause stalls so Stringers paint continuously
  if (brain && (brain.paintPause || 0) > 0.02) {
    brain.paintPause = 0.02;
  }

  // Resolve charge cap while strictly honoring existing WeaponStringerShort = 0.14 contract
  const hasExplicitCap = typeof ctx?.profile?.stringerChargeCap === 'number';
  let cap;
  if (hasExplicitCap) {
    cap = ctx.profile.stringerChargeCap;
  } else if (archetype === 'short') {
    cap = 0.14;
  } else if (archetype === 'explosion') {
    // Subtle organic variance around 0.26 for Wellstring low-charge horizontal fan
    cap = clamp(0.26 + stringerMicroNoise(seed, shotIdx, 13) * 0.02, 0.23, 0.29);
  } else {
    cap = 0.09;
  }

  // Wellstring V: organic (non-periodic) full-charge 5-arrow horizontal carpet sweep when
  // facing wide unpainted/enemy turf with healthy ink. Uses consecutive low-shot run count
  // modulated by turf emptiness & deterministic micro-noise instead of a robotic % 3 cycle.
  let useWellstringFullSweep = false;
  if (archetype === 'explosion' && Boolean(cache?.multiActive) && inkFrac > 0.42) {
    const effOwn = cache.effOwn ?? 1;
    if (effOwn < 0.35) {
      const lowRun = typeof brain?._stringerLowPaintRun === 'number'
        ? brain._stringerLowPaintRun
        : shotIdx;
      const cadenceNoise = stringerMicroNoise(seed, shotIdx, 17);
      // Wide-open unpainted vista + high ink: eager after 2 low shots (occasionally 1 if very bare)
      // Moderate unpainted vista: naturally alternates between 2 and 3 low shots
      let runThreshold = 2;
      if (effOwn < 0.14 && inkFrac > 0.62 && cadenceNoise > 0.45) {
        runThreshold = 1;
      } else if (effOwn >= 0.24 || inkFrac < 0.55) {
        runThreshold = cadenceNoise > 0.15 ? 3 : 2;
      }
      useWellstringFullSweep = lowRun >= runThreshold;
    }
  }

  const effectiveCap = useWellstringFullSweep
    ? clamp(0.955 + sweepNoise * 0.015, 0.93, 0.975)
    : cap;

  const pitchReady = typeof ctx.pitchReady === 'boolean'
    ? ctx.pitchReady
    : (typeof brain?._turfPaintValidated === 'boolean' ? brain._turfPaintValidated : true);
  const wantPaintNow = typeof ctx.wantPaintNow === 'boolean'
    ? ctx.wantPaintNow
    : Boolean(brain?._turfPaintLatch && pitchReady && inkFrac > 0.10 && (brain?.paintPause || 0) <= 0);

  if (brain?._turfPaintValidated === false) {
    it.fire = false;
  }

  // Grounded horizontal fan ("ヨコ射ち") is strictly superior for turf coverage on all Stringers;
  // avoid jumping while drawing a paint volley so bowTilt stays at 0 deg.
  if (wr.charging && actor.grounded) {
    it.jump = false;
  }

  if (wr.catalogState?.pending) {
    it.fire = false;
  } else if (wr.charging) {
    if (curCharge >= effectiveCap || inkFrac < 0.15) {
      if (!pitchReady && inkFrac >= 0.15) {
        // Hold charge briefly while aim pitch climbs back from downward foot-paint
        it.fire = true;
      } else {
        it.fire = false;
        if (brain) {
          // LACT-450 has ultra-crisp tap-shot rhythm; keep Tri-Stringer & Wellstring at <= 0.02
          brain.paintPause = archetype === 'short'
            ? (0.015 + Math.abs(sweepNoise) * 0.005)
            : 0.02;
          brain._stringerPaintShotIdx = shotIdx + 1;
          if (archetype === 'explosion') {
            brain._stringerLowPaintRun = (useWellstringFullSweep || curCharge >= 0.70)
              ? 0
              : ((typeof brain._stringerLowPaintRun === 'number' ? brain._stringerLowPaintRun : shotIdx) + 1);
          }
          // Organic sweep step on release so consecutive horizontal fans tile naturally without robotic banding
          if (typeof brain.sweep === 'number') {
            let sweepStep;
            if (archetype === 'short') {
              sweepStep = 0.42 + sweepNoise * 0.07;
            } else if (archetype === 'explosion') {
              sweepStep = useWellstringFullSweep
                ? (0.66 + sweepNoise * 0.08)
                : (0.56 + sweepNoise * 0.08);
            } else {
              sweepStep = 0.55 + sweepNoise * 0.07;
            }
            brain.sweep += sweepStep;
          }
        }
      }
    } else {
      it.fire = true;
    }
  } else if (wantPaintNow && (wr.cooldown || 0) <= 1e-6) {
    it.fire = true;
    it.squid = false;
  }

  return getTurfOut(brain, archetype, effectiveCap, useWellstringFullSweep);
}

/**
 * Applies Splatoon 3 Stringer combat AI (O(1), zero-allocation steady state):
 * - Archetype-specific distance-aware & enemy-motion-responsive charge selection:
 *   - Tri-Stringer: 2nd-ring convergence (8->0 deg) & arched explosive bolts.
 *   - LACT-450: nimble close 1st-ring punish + no-air-deceleration early jump full-charge snipes.
 *   - Wellstring V: tight 1st-ring 5-arrow convergence intercept (<13.5m) & grounded long-range
 *     5-arrow horizontal bombardment (>=17.5m).
 * - Ballistic gravity-arc pitch compensation (preserves natural aimError).
 * - Natural jump vertical-shot ("ジャンプ縦撃ち") timing adapted to weapon air-charge physics
 *   and enemy movement (suppresses jump vs swimming squids or fast lateral strafers).
 * - Organic kiting & strafe weave ("間合い管理・引き撃ち") when rushed inside close range.
 * - Cover-lob explosive zoning ("置き矢・曲射牽制") at lastSeenPos right after LOS breaks
 *   (strictly never reads live enemy velocity when hidden).
 *
 * Returns reused { wantYaw, wantPitch } override when pitch compensation is active, or null.
 */
export function applyStringerCombat(brain, G, actor, dt, move, ctx = EMPTY_CTX) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!it || !wr) return null;
  if (!syncStringerLife(brain, actor)) return null;
  if (actor.superJumpState || actor.climbing || !specialAllowsMain(actor) || it.special) {
    if (brain) brain._stringerHoldT = 0;
    return null;
  }
  if (it.sub || brain?._bombAim || wr.aimingSub) {
    it.fire = false;
    it.squid = false;
    if (brain) brain._stringerHoldT = 0;
    return null;
  }

  const w = actor.weapon;
  const archetype = classifyStringerArchetype(w);
  const defaultRange = archetype === 'short' ? 15 : archetype === 'explosion' ? 23 : 25;
  const range = Number.isFinite(ctx.range) && ctx.range > 0
    ? ctx.range
    : (Number.isFinite(w?.range) && w.range > 0 ? w.range : defaultRange);
  const dist = finite(ctx.dist, 0);
  const dx = finite(ctx.dx, 0);
  const dz = finite(ctx.dz, 0);
  const enemyVisible = Boolean(ctx.enemyVisible);
  const aimed = Boolean(ctx.aimed);
  const off = finite(ctx.off, 0);
  const inkFrac = finite(ctx.inkFrac, 1);
  const wantYaw = finite(ctx.wantYaw, finite(actor.yaw, 0));
  const wantPitch = finite(ctx.wantPitch, 0);
  const curCharge = finite(wr.charge, 0);
  const stepDt = Number.isFinite(dt) && dt > 0 ? dt : 0;

  const hasExplosiveBolts = archetype !== 'short';
  const firstFrac = resolveStringerFirstChargeFrac(w, archetype);
  const explosiveFloor = Math.min(0.95, firstFrac + 0.025);

  const seed = resolveStringerSeed(brain, actor);
  const combatShotIdx = brain?._stringerCombatShotIdx || 0;
  const chargeNoise = stringerMicroNoise(seed, combatShotIdx, 23);
  const jumpNoise = stringerMicroNoise(seed, combatShotIdx, 29);
  const holdNoise = stringerMicroNoise(seed, combatShotIdx, 31);

  if (brain) {
    const prevJumpCd = finite(brain._stringerJumpCd, 0);
    const prevPhase = finite(brain._stringerPhase, 0);
    brain._stringerJumpCd = Math.max(0, prevJumpCd - stepDt);
    brain._stringerPhase = (prevPhase + stepDt) % TWO_PI_10;
  }

  // Unit vector toward target (or lastSeenPos)
  const dirLen = Math.hypot(dx, dz);
  const nx = dirLen > 1e-4 ? dx / dirLen : 0;
  const nz = dirLen > 1e-4 ? dz / dirLen : 0;

  // Fair-play enemy velocity projection: STRICTLY gated on enemyVisible === true (no wallhack)
  let closingSpeed = 0;
  let latSpeed = 0;
  if (enemyVisible && brain?.target?.vel) {
    const tvx = brain.target.vel.x;
    const tvz = brain.target.vel.z;
    if (Number.isFinite(tvx) && Number.isFinite(tvz)) {
      closingSpeed = -(tvx * nx + tvz * nz);
      latSpeed = Math.abs(-tvx * nz + tvz * nx);
    }
  }

  // 1. Distance management & organic kiting ("間合い管理・引き撃ち")
  const rushBuffer = closingSpeed > 1.8 ? 0.8 : 0;
  const minSafeDist = (archetype === 'short' ? 5.5 : archetype === 'explosion' ? 9.0 : 11.5) + rushBuffer;
  const prefDist = archetype === 'short' ? range * 0.68 : archetype === 'explosion' ? range * 0.65 : range * 0.74;

  if (move && typeof move.set === 'function') {
    if (enemyVisible && dist < minSafeDist) {
      // Kite backward + subtle organic strafe weave instead of rigid constant angle
      const baseSide = brain?.strafeS || 0.55;
      const weave = 0.82 + 0.24 * Math.sin((brain?._stringerPhase || 0) * 2.1 + (seed & 63));
      const side = baseSide * weave;
      const mvx = -nx * 0.90 - nz * side * 0.55;
      const mvz = -nz * 0.90 + nx * side * 0.55;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 0.01) move.set(mvx / ml, 0, mvz / ml);
      // If very close, not currently drawing, and on own ink, briefly squid-kite to reopen range
      if (!wr.charging && dist < minSafeDist * 0.72 && actor.groundTeam === 1 && !it.fire) {
        it.squid = true;
      }
    } else if (dist > prefDist + 2.5 && !wr.charging && !it.fire && actor.groundTeam === 1) {
      it.squid = true;
    }
  }

  // 2. Visible enemy in engagement envelope
  if (enemyVisible && dist < range * 1.12 && inkFrac > 0.05) {
    const wantCharge = computeStringerCombatCharge(
      w, dist, range, archetype, closingSpeed, latSpeed, chargeNoise,
    );
    const strafeTolBoost = latSpeed > 2.5 ? 1.18 : 1.0;
    const releaseTol = Math.max(0.055, Math.atan2(0.55, Math.max(dist, 2.0))) * 1.65 * strafeTolBoost;
    const pressureTrim = (closingSpeed > 1.8 || latSpeed > 2.6) ? 0.11 : 0;
    const maxHoldT = clamp(0.41 + holdNoise * 0.05 - pressureTrim, 0.24, 0.48);

    if (wr.catalogState?.pending) {
      it.fire = false;
    } else if (!wr.charging) {
      if ((wr.cooldown || 0) <= 1e-6 && (brain?.react || 0) <= 0.12) {
        it.fire = true;
        it.squid = false;
        if (brain) brain._stringerHoldT = 0;
      }
    } else {
      if (curCharge < wantCharge) {
        it.fire = true;
        if (brain) brain._stringerHoldT = 0;
      } else {
        const holdT = finite(brain?._stringerHoldT, 0) + stepDt;
        if (brain) brain._stringerHoldT = holdT;
        if (aimed || off <= releaseTol || holdT >= maxHoldT) {
          it.fire = false;
          if (brain) {
            brain._stringerHoldT = 0;
            brain._stringerCombatShotIdx = combatShotIdx + 1;
          }
        } else {
          it.fire = true;
        }
      }
    }

    // 3. Natural tactical jump vertical-shot ("ジャンプ縦撃ち") adapted per Stringer:
    // - Tri-Stringer: penalized air charge -> hop late right before 2nd-ring release.
    // - LACT-450: NO air charge penalty -> hop earlier during draw to finish full-charge snipe midair.
    // - Wellstring V: hop on tight 1st-ring 5-arrow intercept (9.5..15.0m); stay grounded at long
    //   range (>15.5m) so the wide -12 deg 5-arrow bombardment carpets horizontally!
    // Suppress vertical jump against swimming squids or fast lateral strafers (horizontal fan hits better).
    const targetHumanoid = brain?.target?.form !== 'squid';
    const fastStrafer = latSpeed > (archetype === 'short' ? 3.0 : archetype === 'explosion' ? 2.5 : 2.8);
    const verticalMinDist = archetype === 'short' ? 6.2 : archetype === 'explosion' ? 9.5 : 10.0;
    const verticalMaxDist = archetype === 'explosion' ? 15.5 : range * 1.08;
    const jumpLeadWindow = archetype === 'short'
      ? (0.36 + jumpNoise * 0.07)     // 0.29..0.43: early midair full-charge without slowdown
      : archetype === 'explosion'
        ? (0.12 + jumpNoise * 0.025)  // 0.095..0.145: late hop for 1st-ring 5-arrow intercept
        : (0.14 + jumpNoise * 0.03);  // 0.11..0.17: late hop right before 2nd-ring release
    const minJumpCharge = archetype === 'short'
      ? Math.max(firstFrac * 0.78, wantCharge - jumpLeadWindow)
      : Math.max(firstFrac * 0.85, wantCharge - jumpLeadWindow);
    const nearWater = typeof brain?._nearWater === 'function' && brain._nearWater(actor, 1.6);

    if (
      wr.charging &&
      it.fire &&
      actor.grounded &&
      targetHumanoid &&
      !fastStrafer &&
      dist >= verticalMinDist &&
      dist <= verticalMaxDist &&
      curCharge >= minJumpCharge &&
      (brain?._stringerJumpCd || 0) <= 0 &&
      !nearWater
    ) {
      it.jump = true;
      if (brain) {
        const baseCd = archetype === 'short' ? 0.78 : archetype === 'explosion' ? 1.20 : 1.15;
        const cdJitter = archetype === 'short' ? 0.16 : 0.22;
        brain._stringerJumpCd = baseCd + stringerMicroNoise(seed, combatShotIdx, 37) * cdJitter;
      }
    }

    // Stabilize movement while drawing (LACT-450 retains lighter skirmisher mobility)
    if (wr.charging && move && typeof move.multiplyScalar === 'function') {
      const kiting = dist < minSafeDist;
      const moveScale = archetype === 'short'
        ? (kiting ? 0.90 : 0.72)
        : (kiting ? 0.85 : 0.55);
      move.multiplyScalar(moveScale);
    }

    // 4. Ballistic arc pitch compensation (pure physics offset; leaves human aimError intact)
    const activeCharge = wr.charging ? Math.max(curCharge, wantCharge * 0.85) : wantCharge;
    const arcPitch = computeStringerArcPitch(dist, activeCharge, archetype);
    if (arcPitch > 1e-4) {
      return getAimOut(brain, wantYaw, clamp(wantPitch + arcPitch, -1.05, 0.95));
    }
    return null;
  }

  // 5. Target just ducked behind cover: lob an explosive bolt ("置き矢・曲射牽制") at lastSeenPos
  const lostT = brain?.lostTimer || 0;
  if (
    !enemyVisible &&
    hasExplosiveBolts &&
    brain?.target &&
    lostT > 0 &&
    lostT < 0.85 &&
    dist < range * 1.08 &&
    inkFrac > 0.12
  ) {
    const coverCharge = Math.max(
      explosiveFloor,
      computeStringerCombatCharge(w, dist, range, archetype, 0, 0, chargeNoise) * 0.92,
    );
    if (wr.catalogState?.pending) {
      it.fire = false;
    } else if (wr.charging) {
      if (curCharge >= coverCharge) {
        it.fire = false;
        if (brain) {
          brain._stringerHoldT = 0;
          brain._stringerCombatShotIdx = combatShotIdx + 1;
        }
      } else {
        it.fire = true;
      }
      const extraLob = (archetype === 'explosion' ? 0.048 : 0.042) + holdNoise * 0.008;
      const arcPitch = computeStringerArcPitch(dist, Math.max(curCharge, coverCharge), archetype) + extraLob;
      return getAimOut(brain, wantYaw, clamp(wantPitch + arcPitch, -1.05, 0.95));
    }
  } else if (wr.charging && (!enemyVisible || dist > range * 1.12 || inkFrac <= 0.05)) {
    // Release/cancel wasted charge when ink is exhausted, target is lost, or out of range
    if (inkFrac <= 0.05) {
      it.fire = false;
      if (brain) brain._stringerHoldT = 0;
    } else if (!enemyVisible && lostT >= 0.85) {
      it.fire = false;
      if (brain) brain._stringerHoldT = 0;
    } else if (dist > range * 1.12 && curCharge >= 0.15) {
      it.fire = false;
      if (brain) brain._stringerHoldT = 0;
    }
  }

  // 6. Enemy-ink underfoot clearing when out of range and not charging
  if (
    !it.fire &&
    !wr.charging &&
    actor.groundTeam === 2 &&
    dist > range * 1.05 &&
    inkFrac > 0.14 &&
    (wr.cooldown || 0) <= 1e-6 &&
    !wr.catalogState?.pending &&
    !actor._prevIntent?.fire
  ) {
    it.fire = true;
    it.squid = false;
    return getAimOut(brain, wantYaw, Math.min(wantPitch, -0.32));
  }

  return null;
}
