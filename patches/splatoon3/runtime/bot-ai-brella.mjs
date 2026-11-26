// Dedicated Splatoon 3 Brella (シェルター系) Bot AI module (turf painting & combat).
// Pure AI input, spacing, guard/purge timing, and tap-fire rhythm control —
// zero weapon stat edits, zero aimError manipulation, zero wall-hack peeking.
//
// Grounded in Splatoon 3 Wiki* & INKWAVE catalog 11.3.0 physics (BRELLA_MEASURED / main-weapon-catalog.mjs):
// - パラシェルター (s3-shelter-normal / WeaponShelterNormal):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%91%E3%83%A9%E3%82%B7%E3%82%A7%E3%83%AB%E3%82%BF%E3%83%BC
//   repeat 29F (0.483s), startup 10F, open 13F (0.217s), launch 107F (1.783s, total hold ~2.0s),
//   HP 500, ink 5.0%/shot & 30%/purge, naked 330F (5.5s). Preserves high-tempo tap-fire
//   for turf & combat, adding only brief post-hit reactive guard + strafe shift (射線ずらし).
// - キャンピングシェルター (s3-shelter-wide / WeaponShelterWide):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%AD%E3%83%A3%E3%83%B3%E3%83%94%E3%83%B3%E3%82%B0%E3%82%B7%E3%82%A7%E3%83%AB%E3%82%BF%E3%83%BC
//   repeat 51F (0.850s), startup 12F, open 46F (0.767s), launch 57F (0.950s, total hold ~1.92s),
//   HP 700 (0.6x launched dmg), ink 11.0%/shot & 23%/purge, naked 340F (5.67s), max 119 dmg (1-shot).
//   Uses wide canopy purges in open turf lanes & mid-range duels, squid steps between slow 51F shots,
//   and immediate close-range tap-fire for 1-shot kills.
// - スパイガジェット (s3-shelter-compact / WeaponShelterCompact):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%91%E3%82%A4%E3%82%AC%E3%82%B8%E3%82%A7%E3%83%83%E3%83%88
//   repeat 26F (0.433s), startup 10F, open 11F (0.183s), launch Infinity (IsCanopyShot=false),
//   HP 200, ink 3.7%/shot & 0%/open, naked 222F (3.7s), continuous auto-fire while canopy is open.
//   Holds fire for continuous shielded 26F firing + fast 0.72 strafing; kites defensively when canopy breaks.
// - 24式張替傘 (s3-shelter-focus / WeaponShelterFocus):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/24%E5%BC%8F%E5%BC%B5%E6%9B%BF%E5%82%98%E3%83%BB%E7%94%B2
//   repeat 34F (0.567s), startup 10F, open 11F (0.183s), launch 27F (0.450s, total hold ~0.80s),
//   HP 150, ink 6.0%/shot & 15%/purge, naked 130F (2.17s), tight 3.0 deg spread & 90 dmg (2-shot).
//   Weaves rapid low-cost purges for lane painting and mid-range skirmish pressure with longer spacing.

import { botRawWeaponFamily } from './bot-turf-paint.mjs';

const HZ = 60;
const EPS = 1e-6;

// State machine modes (primitive ints for O(1), zero-allocation state updates)
const MODE_TAP = 0;
const MODE_GUARD = 1;
const MODE_PURGE = 2;
const MODE_RELEASE = 3;

const CTX_NONE = 0;
const CTX_PAINT = 1;
const CTX_COMBAT = 2;

export const BRELLA_ARCHETYPES = Object.freeze({
  normal: Object.freeze({
    key: 'normal',
    weaponId: 's3-shelter-normal',
    sourceActor: 'WeaponShelterNormal',
    repeatS: 29 / HZ,
    startupS: 10 / HZ,
    openS: 13 / HZ,
    launchS: 107 / HZ,
    nakedS: 330 / HZ,
    canopyHp: 500,
    continuousAutoFire: false,
    canPurge: true,
    // Turf painting: preserve high-performing pure tap-fire cadence (no slow 2.0s / 30% ink purges)
    paintUsePurge: false,
    paintPurgeMinInk: 1.0,
    paintPurgeMaxOwn: 0.0,
    paintPurgeCdS: 99,
    paintSwimBetweenShots: false,
    paintInkFloor: 0.10,
    paintStrafeBias: 0.0,
    // Combat: preserve tap-fire DPS, add brief reactive post-hit guard + strafe shift (射線ずらし)
    combatUseGuard: true,
    combatGuardHoldS: 0.36,      // 0.217s open + ~0.14s shield catch; safely well below 2.0s purge
    combatGuardMinInk: 0.32,
    combatGuardMinHp: 140,
    combatGuardCdS: 1.15,
    combatUsePurge: false,
    combatPurgeMinDistFrac: 0.0,
    combatPurgeMaxDistFrac: 0.0,
    combatPurgeMinInk: 1.0,
    combatPurgeCdS: 99,
    purgeMaxHoldS: 0.44,
    engageRangeFrac: 1.05,
    prefMinDistFrac: 0.42,
    prefMaxDistFrac: 0.72,
    combatSwimApproachFrac: 0.72,
    combatSwimBetweenShots: false,
    combatStrafeWeight: 0.72,
    nakedRetreatHp: 45,
  }),
  wide: Object.freeze({
    key: 'wide',
    weaponId: 's3-shelter-wide',
    sourceActor: 'WeaponShelterWide',
    repeatS: 51 / HZ,
    startupS: 12 / HZ,
    openS: 46 / HZ,
    launchS: 57 / HZ,
    nakedS: 340 / HZ,
    canopyHp: 700,
    continuousAutoFire: false,
    canPurge: true,
    // Turf painting: wide 2.4m-radius canopy purge (~47p) + squid steps between slow 51F shots
    paintUsePurge: true,
    paintPurgeMinInk: 0.48,
    paintPurgeMaxOwn: 0.62,
    paintPurgeCdS: 2.6,
    paintSwimBetweenShots: true,
    paintInkFloor: 0.14,
    paintStrafeBias: 0.0,
    // Combat: mid-range tent purge -> advance behind canopy -> close-range 119dmg 1-shot tap-fire
    combatUseGuard: false,       // 46F (0.767s) open is too slow for reactive micro-guard; commit to purge
    combatGuardHoldS: 0.0,
    combatGuardMinInk: 1.0,
    combatGuardMinHp: 200,
    combatGuardCdS: 99,
    combatUsePurge: true,
    combatPurgeMinDistFrac: 0.58,
    combatPurgeMaxDistFrac: 1.25,
    combatPurgeMinInk: 0.45,
    combatPurgeCdS: 2.4,
    purgeMaxHoldS: 2.05,         // (12 + 46 + 57) / 60 = 1.917s + 0.13s safety margin
    engageRangeFrac: 1.08,
    prefMinDistFrac: 0.40,
    prefMaxDistFrac: 0.78,
    combatSwimApproachFrac: 0.68,
    combatSwimBetweenShots: true,
    combatStrafeWeight: 0.55,
    nakedRetreatHp: 50,
  }),
  compact: Object.freeze({
    key: 'compact',
    weaponId: 's3-shelter-compact',
    sourceActor: 'WeaponShelterCompact',
    repeatS: 26 / HZ,
    startupS: 10 / HZ,
    openS: 11 / HZ,
    launchS: Infinity,
    nakedS: 222 / HZ,
    canopyHp: 200,
    continuousAutoFire: true,    // Unique: holds fire to auto-shoot at 26F while canopy stays open
    canPurge: false,
    // Turf painting: continuous shielded auto-fire + nimble lateral strafing
    paintUsePurge: false,
    paintPurgeMinInk: 1.0,
    paintPurgeMaxOwn: 0.0,
    paintPurgeCdS: 99,
    paintSwimBetweenShots: false,
    paintInkFloor: 0.12,
    paintStrafeBias: 0.12,
    // Combat: continuous shielded auto-fire while canopy intact; defensive kiting when canopy breaks
    combatUseGuard: false,
    combatGuardHoldS: 0.0,
    combatGuardMinInk: 1.0,
    combatGuardMinHp: 0,
    combatGuardCdS: 99,
    combatUsePurge: false,
    combatPurgeMinDistFrac: 0.0,
    combatPurgeMaxDistFrac: 0.0,
    combatPurgeMinInk: 1.0,
    combatPurgeCdS: 99,
    purgeMaxHoldS: 0.0,
    engageRangeFrac: 1.08,
    prefMinDistFrac: 0.56,
    prefMaxDistFrac: 0.88,
    combatSwimApproachFrac: 0.85,
    combatSwimBetweenShots: false,
    combatStrafeWeight: 0.88,
    nakedRetreatHp: 58,
  }),
  focus: Object.freeze({
    key: 'focus',
    weaponId: 's3-shelter-focus',
    sourceActor: 'WeaponShelterFocus',
    repeatS: 34 / HZ,
    startupS: 10 / HZ,
    openS: 11 / HZ,
    launchS: 27 / HZ,
    nakedS: 130 / HZ,
    canopyHp: 150,
    continuousAutoFire: false,
    canPurge: true,
    // Turf painting: rapid 0.80s / 15%-ink purges (2.17s rebuild) woven into tight tap-fire painting
    paintUsePurge: true,
    paintPurgeMinInk: 0.36,
    paintPurgeMaxOwn: 0.68,
    paintPurgeCdS: 1.8,
    paintSwimBetweenShots: false,
    paintInkFloor: 0.11,
    paintStrafeBias: 0.0,
    // Combat: longer mid-range spacing (tight 3 deg spread, 90 dmg) + fast purge & brief guard
    combatUseGuard: true,
    combatGuardHoldS: 0.32,      // 0.183s open + ~0.13s instant catch
    combatGuardMinInk: 0.28,
    combatGuardMinHp: 60,
    combatGuardCdS: 0.95,
    combatUsePurge: true,
    combatPurgeMinDistFrac: 0.52,
    combatPurgeMaxDistFrac: 1.15,
    combatPurgeMinInk: 0.34,
    combatPurgeCdS: 1.85,
    purgeMaxHoldS: 0.92,         // (10 + 11 + 27) / 60 = 0.80s + 0.12s safety margin
    engageRangeFrac: 1.10,
    prefMinDistFrac: 0.62,
    prefMaxDistFrac: 0.94,
    combatSwimApproachFrac: 0.86,
    combatSwimBetweenShots: false,
    combatStrafeWeight: 0.78,
    nakedRetreatHp: 45,
  }),
});

const _archetypeCache = new WeakMap();

/**
 * Resolves a Brella weapon into its Splatoon 3 sub-archetype (normal / wide / compact / focus)
 * in O(1) with WeakMap caching and zero weapon mutation.
 */
export function resolveBrellaArchetype(weapon) {
  if (!weapon || typeof weapon !== 'object') return BRELLA_ARCHETYPES.normal;

  const cached = _archetypeCache.get(weapon);
  if (cached !== undefined) return cached;

  const src = weapon.sourceMainActor || weapon.catalogRecord?.sourceActor || weapon.catalogRecord?.sourceMainActor || '';
  const row = weapon.catalogRecord?.sourceRow || '';
  const id = typeof weapon.id === 'string' ? weapon.id : (typeof weapon.catalogRecord?.id === 'string' ? weapon.catalogRecord.id : '');

  let arch = null;
  if (src === 'WeaponShelterCompact' || row.indexOf('Compact') !== -1 || id.indexOf('compact') !== -1 || id.indexOf('undercover') !== -1) {
    arch = BRELLA_ARCHETYPES.compact;
  } else if (src === 'WeaponShelterWide' || row.indexOf('Wide') !== -1 || id.indexOf('wide') !== -1 || id.indexOf('tenta') !== -1 || id.indexOf('camp') !== -1) {
    arch = BRELLA_ARCHETYPES.wide;
  } else if (src === 'WeaponShelterFocus' || row.indexOf('Focus') !== -1 || id.indexOf('focus') !== -1 || id.indexOf('recycled') !== -1) {
    arch = BRELLA_ARCHETYPES.focus;
  } else if (src === 'WeaponShelterNormal' || row.indexOf('Normal') !== -1 || id.indexOf('normal') !== -1) {
    arch = BRELLA_ARCHETYPES.normal;
  } else {
    // Catalog parameter fallback (read-only)
    const cp = weapon.catalogRecord?.parameters?.spl__WeaponShelterCanopyParam;
    const sp = weapon.catalogRecord?.parameters?.spl__WeaponShelterShotgunParam;
    if (cp?.IsCanopyShot === false || (sp?.RepeatFrame || 0) >= 20) {
      arch = BRELLA_ARCHETYPES.compact;
    } else if ((cp?.CanopyNakedFrame || 0) > 0 && cp.CanopyNakedFrame <= 180) {
      arch = BRELLA_ARCHETYPES.focus;
    } else if ((sp?.InkConsume || 0) >= 0.09) {
      arch = BRELLA_ARCHETYPES.wide;
    } else {
      arch = BRELLA_ARCHETYPES.normal;
    }
  }

  _archetypeCache.set(weapon, arch);
  return arch;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function resetBrellaState(st, life) {
  st.life = life;
  st.mode = MODE_TAP;
  st.lastCtx = CTX_NONE;
  st.holdT = 0;
  st.maxHoldT = 0;
  st.guardCd = 0;
  st.purgeCd = 0;
  st.releaseTicks = 0;
  st.prevFire = false;
  st.prevNaked = 0;
  st.strafeSign = 1;
  st.strafeFlipT = 0.45;
}

function clearBrellaHold(st) {
  st.mode = MODE_TAP;
  st.holdT = 0;
  st.maxHoldT = 0;
  st.releaseTicks = 0;
  st.prevFire = false;
}

function getBrellaState(brain, actor) {
  let st = brain._brellaAiState;
  if (!st) {
    st = brain._brellaAiState = {
      life: actor?.netLife,
      mode: MODE_TAP,
      lastCtx: CTX_NONE,
      holdT: 0,
      maxHoldT: 0,
      guardCd: 0,
      purgeCd: 0,
      releaseTicks: 0,
      prevFire: false,
      prevNaked: 0,
      strafeSign: 1,
      strafeFlipT: 0.45,
    };
  } else if (actor && actor.netLife !== undefined && st.life !== actor.netLife) {
    if (st.life !== undefined) {
      resetBrellaState(st, actor.netLife);
    } else {
      st.life = actor.netLife;
    }
  }
  return st;
}

function getBrellaShotInkFrac(weapon) {
  const catConsume = weapon?.catalogRecord?.parameters?.spl__WeaponShelterShotgunParam?.InkConsume;
  if (Number.isFinite(catConsume) && catConsume > 0 && catConsume < 1) {
    return catConsume;
  }
  const perShot = weapon?.inkPerShot;
  if (Number.isFinite(perShot) && perShot > 0) {
    const frac = perShot > 1 ? perShot / 100 : perShot;
    if (frac > 0 && frac < 1) return frac;
  }
  return 0.02;
}

function setMoveXZ(move, x, z) {
  if (!move || !Number.isFinite(x) || !Number.isFinite(z)) return;
  if (typeof move.set === 'function') move.set(x, 0, z);
  else {
    move.x = x;
    move.z = z;
  }
}

function resolveMatchTimeLeft(G) {
  if (Number.isFinite(G?.match?.time)) return G.match.time;
  if (Number.isFinite(G?.timeLeft)) return G.timeLeft;
  return 120;
}

function getPrevFire(actor, st) {
  if (actor._prevIntent && typeof actor._prevIntent.fire === 'boolean') {
    return actor._prevIntent.fire;
  }
  return st.prevFire;
}

function isCanopyReady(cs) {
  if (!cs) return true;
  if (finite(cs.naked, 0) > EPS) return false;
  if (cs.canopy && cs.canopy.launched) return false;
  return true;
}

function getCanopyHp(cs, arch) {
  if (cs && cs.canopy && Number.isFinite(cs.canopy.hp)) return cs.canopy.hp;
  if (cs && finite(cs.naked, 0) > EPS) return 0;
  return arch.canopyHp;
}

function enterRelease(st, it) {
  st.mode = MODE_RELEASE;
  st.holdT = 0;
  st.maxHoldT = 0;
  st.releaseTicks = 1;
  it.fire = false;
}

/**
 * Applies authentic Splatoon 3 Brella Turf War painting behavior per sub-archetype:
 * - Splat Brella (normal): preserves high-tempo tap-fire (never locks canopy open).
 * - Undercover Brella (compact): holds fire for continuous 26F shielded auto-fire + nimble strafing.
 * - Tenta Brella (wide): weaves wide canopy purges on open unpainted lanes + squid steps between 51F shots.
 * - Recycled Brella 24 (focus): weaves rapid 0.80s / 15%-ink purges with tight tap-fire painting.
 *
 * O(1) time, zero per-tick allocations.
 */
export function applyBrellaTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx = {}) {
  if (!brain || !actor || !actor.intent) return;
  if (brain._disableTurfPaintPatch || actor._disableTurfPaintPatch) return;

  const rawFamily = botRawWeaponFamily(actor.weapon, null);
  if (rawFamily !== 'brella') return;

  const it = actor.intent;
  const wr = actor.weaponRunner;
  const cs = wr?.catalogState;
  const arch = resolveBrellaArchetype(actor.weapon);
  const st = getBrellaState(brain, actor);

  if (actor.alive === false) {
    resetBrellaState(st, actor.netLife);
    return;
  }
  if (actor.superJumpState || actor.climbing || actor.specialActive) {
    clearBrellaHold(st);
    return;
  }
  if (it.special) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) enterRelease(st, it);
    st.prevFire = false;
    return;
  }
  if (it.sub || brain._bombAim || brain._releaseBomb) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) enterRelease(st, it);
    else it.fire = false;
    it.squid = false;
    st.prevFire = false;
    return;
  }

  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / HZ;
  const safeInk = finite(inkFrac, 0);
  const minPaintInk = Math.max(arch.paintInkFloor, getBrellaShotInkFrac(actor.weapon));
  st.guardCd = Math.max(0, st.guardCd - safeDt);
  st.purgeCd = Math.max(0, st.purgeCd - safeDt);

  // Reset active combat holds cleanly when transitioning into paint context
  if (st.lastCtx !== CTX_PAINT) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) {
      enterRelease(st, it);
    }
    st.lastCtx = CTX_PAINT;
  }

  const cache = ctx.cache ?? brain._turfMultiCache;
  const pitchReady = typeof ctx.pitchReady === 'boolean'
    ? ctx.pitchReady
    : (typeof brain._turfPaintValidated === 'boolean' ? brain._turfPaintValidated : true);
  const wantPaintNow = typeof ctx.wantPaintNow === 'boolean'
    ? ctx.wantPaintNow
    : Boolean(brain._turfPaintLatch && pitchReady && safeInk > minPaintInk && (brain.paintPause || 0) <= 0);

  const cooldown = Math.max(0, finite(wr?.cooldown, 0));
  const pending = !!cs?.pending;
  const naked = Math.max(0, finite(cs?.naked, 0));
  const canopyLaunched = !!cs?.canopy?.launched;
  const canopyJustSpent = naked > EPS && st.prevNaked <= EPS;
  st.prevNaked = naked;

  const prevFire = getPrevFire(actor, st);
  const onOwnInk = actor.groundTeam === 1;
  const coolerPending = !!brain._coolerPickupPending;
  const timeLeft = resolveMatchTimeLeft(G);

  // 1. Undercover Brella (compact): continuous shielded auto-fire while holding trigger
  if (arch.continuousAutoFire) {
    st.mode = MODE_TAP;
    st.holdT = 0;
    if (wantPaintNow && pitchReady && safeInk > minPaintInk) {
      it.fire = true;
      it.squid = false;
    } else {
      it.fire = false;
      if (!coolerPending && onOwnInk && wantMove && (!wantPaintNow || safeInk <= minPaintInk)) {
        it.squid = true;
      }
    }

    // Subtle extra lateral glide for Undercover Brella's 0.72 strafe speed
    if (it.fire && wantMove && arch.paintStrafeBias > 0 && move && Number.isFinite(move.x) && Number.isFinite(move.z) && Number.isFinite(baseYaw)) {
      const sign = finite(cache?.flankBias, 0) >= 0 ? 1 : -1;
      const perpX = Math.cos(baseYaw) * sign;
      const perpZ = -Math.sin(baseYaw) * sign;
      const mx = move.x + perpX * arch.paintStrafeBias;
      const mz = move.z + perpZ * arch.paintStrafeBias;
      const len = Math.hypot(mx, mz);
      if (len > 1e-4) setMoveXZ(move, mx / len, mz / len);
    }

    st.prevFire = !!it.fire;
    return;
  }

  // 2. Non-continuous Brellas (normal / wide / focus):
  // Mandatory release pulse guarantees a clean rising edge and prevents canopy-stuck bugs.
  if (st.mode === MODE_RELEASE) {
    it.fire = false;
    st.releaseTicks -= 1;
    if (st.releaseTicks <= 0 && !prevFire) {
      st.mode = MODE_TAP;
    }
    st.prevFire = false;
    return;
  }

  // Active turf purge hold (wide / focus only)
  if (st.mode === MODE_PURGE) {
    st.holdT += safeDt;
    const minInkDuringPurge = arch.key === 'wide' ? 0.22 : 0.16;
    if (
      canopyJustSpent ||
      canopyLaunched ||
      naked > EPS ||
      st.holdT >= st.maxHoldT ||
      safeInk < minInkDuringPurge ||
      !pitchReady
    ) {
      st.purgeCd = arch.paintPurgeCdS;
      enterRelease(st, it);
      st.prevFire = false;
      return;
    }
    it.fire = true;
    it.squid = false;
    st.prevFire = true;
    return;
  }

  // Decide whether to initiate a turf lane purge (wide / focus only; never normal)
  const effOwn = cache?.multiActive ? finite(cache.effOwn, 0) : 0;
  const shouldStartPurge =
    arch.paintUsePurge &&
    arch.canPurge &&
    wantPaintNow &&
    pitchReady &&
    !pending &&
    cooldown <= EPS &&
    !prevFire &&
    isCanopyReady(cs) &&
    safeInk >= arch.paintPurgeMinInk &&
    effOwn < arch.paintPurgeMaxOwn &&
    st.purgeCd <= 0 &&
    timeLeft > 2.5;

  if (shouldStartPurge) {
    st.mode = MODE_PURGE;
    st.holdT = 0;
    st.maxHoldT = arch.purgeMaxHoldS;
    it.fire = true;
    it.squid = false;
    st.prevFire = true;
    return;
  }

  // Default & Splat Brella (normal): strict tap-fire shotgun cadence (never locks canopy open)
  if (wantPaintNow && pitchReady && safeInk > minPaintInk && cooldown <= EPS && !pending && !prevFire) {
    it.fire = true;
    it.squid = false;
  } else if (prevFire) {
    it.fire = false;
  } else {
    it.fire = false;
    // Tenta Brella (wide): swim on own ink between slow 51F (0.85s) shots to reposition cleanly
    if (arch.paintSwimBetweenShots && !coolerPending && onOwnInk && wantMove && !pending && cooldown > 0.18) {
      it.squid = true;
    }
  }

  st.prevFire = !!it.fire;
}

/**
 * Applies authentic Splatoon 3 Brella combat AI per sub-archetype:
 * - Splat Brella (normal): preserves high-K/D tap-fire cadence + brief post-hit reactive guard
 *   with lateral strafe shift (射線ずらし), strictly capped well below purge time.
 * - Undercover Brella (compact): continuous shielded 26F auto-fire + nimble 0.72 strafing;
 *   defensive kiting/withdrawal when canopy is broken.
 * - Tenta Brella (wide): mid-range tent purge into sheltered advance, close-range 1-shot tap-fire,
 *   and between-shot squid steps during slow 51F recovery.
 * - Recycled Brella 24 (focus): longer mid-range spacing (3 deg tight spread, 90 dmg) +
 *   fast 0.80s purge pressure & brief guard catches.
 *
 * Returns `null` (preserves natural human aimError / wantYaw untouched).
 * O(1) time, zero per-tick allocations.
 */
export function applyBrellaCombat(brain, G, actor, dt, move, ctx) {
  if (!brain || !actor || !ctx) return null;
  const w = actor.weapon;
  const rawFamily = botRawWeaponFamily(w, ctx.family);
  if (rawFamily !== 'brella') return null;

  const it = actor.intent;
  const wr = actor.weaponRunner;
  if (!it || !wr) return null;

  const {
    dist, range, dx, dz,
    enemyVisible, aimed, inkFrac,
  } = ctx;

  const cs = wr.catalogState;
  const arch = resolveBrellaArchetype(w);
  const st = getBrellaState(brain, actor);

  if (actor.alive === false) {
    resetBrellaState(st, actor.netLife);
    return null;
  }
  if (actor.superJumpState || actor.climbing || actor.specialActive) {
    clearBrellaHold(st);
    return null;
  }
  if (it.special) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) enterRelease(st, it);
    st.prevFire = false;
    return null;
  }
  if (it.sub || brain._bombAim || brain._releaseBomb) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) enterRelease(st, it);
    else it.fire = false;
    it.squid = false;
    st.prevFire = false;
    return null;
  }

  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / HZ;
  st.guardCd = Math.max(0, st.guardCd - safeDt);
  st.purgeCd = Math.max(0, st.purgeCd - safeDt);
  st.strafeFlipT -= safeDt;
  if (st.strafeFlipT <= 0) {
    st.strafeSign = -st.strafeSign;
    st.strafeFlipT = 0.55;
  }

  if (st.lastCtx !== CTX_COMBAT) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) {
      enterRelease(st, it);
    }
    st.lastCtx = CTX_COMBAT;
  }

  const rawRange = Number.isFinite(range) && range > 0 ? range : (Number.isFinite(w?.range) && w.range > 0 ? w.range : 12.5);
  const safeRange = Math.max(4, rawRange);
  const safeDist = Number.isFinite(dist) && dist >= 0 ? dist : Infinity;
  const safeDx = finite(dx, 0);
  const safeDz = finite(dz, 0);
  const safeInk = finite(inkFrac, 0);
  const minShotInk = getBrellaShotInkFrac(w);
  const engageReach = safeRange * arch.engageRangeFrac;
  const prefMin = safeRange * arch.prefMinDistFrac;
  const prefMax = safeRange * arch.prefMaxDistFrac;

  const cooldown = Math.max(0, finite(wr.cooldown, 0));
  const pending = !!cs?.pending;
  const naked = Math.max(0, finite(cs?.naked, 0));
  const canopyLaunched = !!cs?.canopy?.launched;
  const canopyJustSpent = naked > EPS && st.prevNaked <= EPS;
  st.prevNaked = naked;

  const prevFire = getPrevFire(actor, st);
  const onOwnInk = actor.groundTeam === 1;
  const reactReady = (brain.react || 0) <= 0;
  const lastDamage = finite(actor.lastDamage, 9);
  const hp = finite(actor.hp, 100);

  // Unit direction to target (only used when enemyVisible; never peeks hidden enemies)
  const invDist = Number.isFinite(safeDist) ? 1 / Math.max(safeDist, 0.01) : 0;
  const nx = safeDx * invDist;
  const nz = safeDz * invDist;
  const strafeDir = Number.isFinite(brain.strafeS) && brain.strafeS !== 0
    ? (brain.strafeS > 0 ? 1 : -1)
    : st.strafeSign;

  // 1. Undercover Brella (compact): continuous shielded auto-fire
  if (arch.continuousAutoFire) {
    st.mode = MODE_TAP;
    st.holdT = 0;

    if (!enemyVisible) {
      it.fire = false;
      st.prevFire = false;
      return null;
    }

    const canopyBroken = naked > EPS;
    const lowHpRetreat = canopyBroken && hp < arch.nakedRetreatHp && safeDist < safeRange * 0.85;

    if (lowHpRetreat) {
      // Canopy broken & low HP: disengage briefly on own ink rather than trading naked
      it.fire = false;
      const mvx = -nx * 0.88 - nz * strafeDir * 0.48;
      const mvz = -nz * 0.88 + nx * strafeDir * 0.48;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);
      if (onOwnInk) it.squid = true;
      st.prevFire = false;
      return null;
    }

    if (reactReady && aimed && safeInk >= Math.max(0.04, minShotInk) - EPS && safeDist < engageReach) {
      // Hold fire continuously so canopy stays deployed while auto-firing every 26F
      it.fire = true;
      it.squid = false;
    } else {
      it.fire = false;
      if (safeDist > safeRange * arch.combatSwimApproachFrac && !pending && onOwnInk) {
        it.squid = true;
      }
    }

    // Nimble 0.72 strafe & spacing (kite harder if canopy is broken)
    if (safeDist < prefMin || (canopyBroken && safeDist < prefMax)) {
      const backW = canopyBroken ? 0.75 : 0.55;
      const sideW = arch.combatStrafeWeight;
      const mvx = -nx * backW - nz * strafeDir * sideW;
      const mvz = -nz * backW + nx * strafeDir * sideW;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);
    } else if (safeDist <= engageReach) {
      const sideW = arch.combatStrafeWeight;
      const mvx = -nz * strafeDir * sideW;
      const mvz = nx * strafeDir * sideW;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);
    }

    st.prevFire = !!it.fire;
    return null;
  }

  // 2. Non-continuous Brellas (normal / wide / focus):
  // Never hold canopy open when target is out of sight (no wall-hack & no stuck shield)
  if (!enemyVisible) {
    if (st.mode === MODE_GUARD || st.mode === MODE_PURGE) {
      enterRelease(st, it);
    } else if (st.mode === MODE_RELEASE) {
      it.fire = false;
      st.releaseTicks -= 1;
      if (st.releaseTicks <= 0 && !prevFire) {
        st.mode = MODE_TAP;
      }
    } else if (prevFire) {
      it.fire = false;
    }
    st.prevFire = !!it.fire;
    return null;
  }

  // Mandatory release pulse after any guard/purge hold
  if (st.mode === MODE_RELEASE) {
    it.fire = false;
    st.releaseTicks -= 1;
    if (st.releaseTicks <= 0 && !prevFire) {
      st.mode = MODE_TAP;
    }
    st.prevFire = false;
    return null;
  }

  // Active brief reactive guard hold (normal / focus) with lateral strafe shift (射線ずらし)
  if (st.mode === MODE_GUARD) {
    st.holdT += safeDt;
    const canopyHp = getCanopyHp(cs, arch);
    if (
      canopyJustSpent ||
      canopyLaunched ||
      naked > EPS ||
      st.holdT >= st.maxHoldT ||
      canopyHp < arch.combatGuardMinHp * 0.65 ||
      safeInk < 0.18 ||
      safeDist > safeRange * 1.25
    ) {
      st.guardCd = arch.combatGuardCdS;
      enterRelease(st, it);
      st.prevFire = false;
      return null;
    }

    it.fire = true;
    it.squid = false;
    // Lateral strafe shift (射線ずらし) while guarding so enemy fire misses when canopy closes
    const mvx = -nz * st.strafeSign * 0.92 - nx * 0.25;
    const mvz = nx * st.strafeSign * 0.92 - nz * 0.25;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);

    st.prevFire = true;
    return null;
  }

  // Active combat purge hold (wide / focus)
  if (st.mode === MODE_PURGE) {
    st.holdT += safeDt;
    const minInkDuringPurge = arch.key === 'wide' ? 0.20 : 0.15;
    if (
      canopyJustSpent ||
      canopyLaunched ||
      naked > EPS ||
      st.holdT >= st.maxHoldT ||
      safeInk < minInkDuringPurge ||
      safeDist < safeRange * 0.32
    ) {
      st.purgeCd = arch.combatPurgeCdS;
      enterRelease(st, it);
      st.prevFire = false;
      return null;
    }

    it.fire = true;
    it.squid = false;
    // Gentle lateral drift while deploying canopy before launch
    const mvx = -nz * strafeDir * 0.55 + nx * 0.20;
    const mvz = nx * strafeDir * 0.55 + nz * 0.20;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);

    st.prevFire = true;
    return null;
  }

  // 3. MODE_TAP: evaluate tactical purge / reactive guard triggers, otherwise execute crisp tap-fire
  const canopyReady = isCanopyReady(cs);
  const canopyHp = getCanopyHp(cs, arch);

  // 3a. Mid-range tactical canopy purge (Tenta Brella & Recycled Brella 24)
  const shouldCombatPurge =
    arch.combatUsePurge &&
    arch.canPurge &&
    reactReady &&
    aimed &&
    canopyReady &&
    !pending &&
    cooldown <= EPS &&
    !prevFire &&
    st.purgeCd <= 0 &&
    safeInk >= arch.combatPurgeMinInk &&
    safeDist >= safeRange * arch.combatPurgeMinDistFrac &&
    safeDist <= safeRange * arch.combatPurgeMaxDistFrac &&
    (arch.key === 'wide' || lastDamage < 0.30 || safeDist >= safeRange * 0.72);

  if (shouldCombatPurge) {
    st.mode = MODE_PURGE;
    st.holdT = 0;
    st.maxHoldT = arch.purgeMaxHoldS;
    it.fire = true;
    it.squid = false;
    st.prevFire = true;
    return null;
  }

  // 3b. Brief reactive post-hit canopy guard (Splat Brella & Recycled Brella 24)
  // Triggered right after taking damage while a shot has just fired (prevFire) or ready to fire,
  // capped well below purge duration so Splat Brella never stalls its tap-fire DPS.
  const shouldReactiveGuard =
    arch.combatUseGuard &&
    canopyReady &&
    canopyHp >= arch.combatGuardMinHp &&
    st.guardCd <= 0 &&
    lastDamage < 0.22 &&
    safeInk >= arch.combatGuardMinInk &&
    safeDist < safeRange * 1.15 &&
    (prevFire || (cooldown <= EPS && !pending && reactReady && aimed));

  if (shouldReactiveGuard) {
    st.mode = MODE_GUARD;
    st.holdT = 0;
    st.maxHoldT = arch.combatGuardHoldS;
    st.strafeSign = strafeDir;
    it.fire = true;
    it.squid = false;
    st.prevFire = true;
    return null;
  }

  // 3c. Core shotgun tap-fire (strict rising-edge fire so canopy never locks out shots)
  if (reactReady && aimed && safeInk >= minShotInk - EPS && safeInk > 0.02 && safeDist < engageReach) {
    it.fire = cooldown <= EPS && !pending && !prevFire;
    if (it.fire) it.squid = false;
  } else if (it.fire && prevFire) {
    it.fire = false;
  } else {
    it.fire = false;
  }

  // 4. Spacing & between-shot squid mobility
  if (arch.key === 'focus' && safeDist < prefMin && !it.fire) {
    // Recycled Brella 24: maintain tighter mid-range spacing (3 deg spread, 90 dmg)
    const mvx = -nx * 0.65 - nz * strafeDir * arch.combatStrafeWeight;
    const mvz = -nz * 0.65 + nx * strafeDir * arch.combatStrafeWeight;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);
  } else if (arch.combatSwimBetweenShots && !it.fire && !pending && cooldown > 0.18 && onOwnInk) {
    // Tenta Brella (wide): squid step between slow 51F shots
    it.squid = true;
  } else if (safeDist > safeRange * arch.combatSwimApproachFrac && !it.fire && !pending && onOwnInk) {
    // Close distance in squid form on own ink (matches baseline Splat Brella approach)
    it.squid = true;
  }

  st.prevFire = !!it.fire;
  return null;
}
