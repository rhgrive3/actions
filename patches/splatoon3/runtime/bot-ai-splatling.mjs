// Dedicated Splatoon 3 Splatling-family Bot AI module (Turf War painting & combat).
// Pure AI input, charge cadence, sweep, strafe, recharge, and charge-keep control:
// - Zero weapon stat mutations, zero aimError cheats, zero wall-hack peeking.
// - O(1) computation and zero per-frame object allocations on hot paths.
// - Strictly preserves existing standard splatling full spin-up paint contract (>= 0.88)
//   and Ballpoint Splatling short-range paint contract (~0.24).
//
// Grounded in Splatoon 3 Wiki & catalog 11.3.0 physics:
// - スピナー属: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%94%E3%83%8A%E3%83%BC%E5%B1%9E
// - スプラスピナー (s3-spinner-quick / WeaponSpinnerQuick):
//   Fastest charge (18F/27F), top mobility (0.086/0.072), 15% ink cost; mobile partial-charge
//   skirmishing at close range and brisk full-spin lane sweeps.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%82%B9%E3%83%94%E3%83%8A%E3%83%BC
// - バレルスピナー (splatling / WeaponSpinnerStandard):
//   Balanced mid-long splatling (48F/72F charge, 80F/160F stream, 30 dmg, 22.5% ink);
//   full spin-up lane painting and disciplined mid/long spacing with close partial-spin defense.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%90%E3%83%AC%E3%83%AB%E3%82%B9%E3%83%94%E3%83%8A%E3%83%BC
// - ハイドラント (s3-spinner-hyper / WeaponSpinnerHyper):
//   Heavy anchor (120F/150F charge, 130F/260F stream, 35% ink); full-charge damage bonus
//   (32.0 -> 40.0, 3-shot splat!) rewards committing to full spin at mid/long range, with
//   proactive ink-refill discipline and kiting when rushed.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%8F%E3%82%A4%E3%83%89%E3%83%A9%E3%83%B3%E3%83%88
// - クーゲルシュライバー (s3-spinner-downpour / WeaponSpinnerDownpour):
//   Dual-mode with recharge (EnableRecharge: true): first 30F (0.50s) is fast-fire (3F),
//   high-mobility (0.086) short-range paint/duel mode; transitions after 30F into pinpoint
//   (1.5 deg, 5F) long-range mode. Preserves ~0.24 short-range paint contract.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%AF%E3%83%BC%E3%82%B2%E3%83%AB%E3%82%B7%E3%83%A5%E3%83%A9%E3%82%A4%E3%83%90%E3%83%BC
// - ノーチラス47 (s3-spinner-serein / WeaponSpinnerSerein):
//   Anytime Charge Keep (200F = 3.33s) & Recharge, fast shot velocity, 15% ink cost, slow
//   charging walk (0.04); uses squid charge-keep to reposition/ambush on own ink and mid-stream
//   recharge when pressure needs extension.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%8E%E3%83%BC%E3%83%81%E3%83%A9%E3%82%B947
// - イグザミナー (s3-spinner-hypershort / WeaponSpinnerHyperShort):
//   High mobility (0.086/0.072), 20% ink cost, no recharge/keep; full charge (120F) unlocks
//   3F ultra-rapid fire (20 shots/s, 180F stream) that melts foes and carpets turf.
//   Ref: https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%A4%E3%82%B0%E3%82%B6%E3%83%9F%E3%83%8A%E3%83%BC

const EPS = 1e-6;
const STANDARD_PAINT_MIN_SPIN = 0.88;
const DOWNPOUR_SHORT_MODE_SEC = 0.50; // 30F short-range phase before variable long-range transition

export const SPLATLING_ARCHETYPES = Object.freeze({
  quick: Object.freeze({
    key: 'quick',
    id: 's3-spinner-quick',
    sourceMainActor: 'WeaponSpinnerQuick',
    // Turf paint
    paintTargetSpin: 0.90,
    paintSpinJitter: 0.02, // 0.88..0.92 (strictly >= 0.88)
    paintSweepSpeed: 2.35,
    paintStrafe: 0.38,
    paintPauseOnRelease: 0.02,
    swimRefillFloor: 0.18,
    swimRefillResume: 0.42,
    // Capabilities
    canRecharge: false,
    canChargeKeep: false,
    fullChargeDamageBonus: false,
    fullChargeFireRateBonus: false,
    dualMode: false,
    // Combat
    combatFullSpin: 0.88,
    combatMidSpin: 0.70,
    combatCloseSpin: 0.42,
    combatCloseDistRatio: 0.48,
    combatMidDistRatio: 0.76,
    prefRangeRatio: 0.78,
    retreatRangeRatio: 0.42,
    chargeMoveScale: 0.68,
    streamStrafeRatio: 0.56,
    maxHoldFar: 0.34,
    maxHoldClose: 0.16,
    rechargeStreamMinFrac: 0,
    rechargeInkFloor: 1,
    keepMaxSec: 0,
    keepInkFloor: 1,
  }),

  standard: Object.freeze({
    key: 'standard',
    id: 'splatling',
    sourceMainActor: 'WeaponSpinnerStandard',
    // Turf paint (preserves strong Heavy Splatling baseline & >= 0.88 test contract)
    paintTargetSpin: 0.90,
    paintSpinJitter: 0.02, // 0.88..0.92
    paintSweepSpeed: 2.05,
    paintStrafe: 0.32,
    paintPauseOnRelease: 0.03,
    swimRefillFloor: 0.24,
    swimRefillResume: 0.48,
    // Capabilities
    canRecharge: false,
    canChargeKeep: false,
    fullChargeDamageBonus: false,
    fullChargeFireRateBonus: false,
    dualMode: false,
    // Combat (preserves Heavy Splatling 0.38 / 0.65 / 0.88 combat rhythm)
    combatFullSpin: 0.88,
    combatMidSpin: 0.66,
    combatCloseSpin: 0.39,
    combatCloseDistRatio: 0.50,
    combatMidDistRatio: 0.80,
    prefRangeRatio: 0.84,
    retreatRangeRatio: 0.50,
    chargeMoveScale: 0.52,
    streamStrafeRatio: 0.38,
    maxHoldFar: 0.42,
    maxHoldClose: 0.20,
    rechargeStreamMinFrac: 0,
    rechargeInkFloor: 1,
    keepMaxSec: 0,
    keepInkFloor: 1,
  }),

  hyper: Object.freeze({
    key: 'hyper',
    id: 's3-spinner-hyper',
    sourceMainActor: 'WeaponSpinnerHyper',
    // Turf paint (full 4.33s stream carpets wide lanes; 35% ink demands clean refill discipline)
    paintTargetSpin: 0.99,
    paintSpinJitter: 0.01, // 0.98..1.00
    paintSweepSpeed: 1.75,
    paintStrafe: 0.26,
    paintPauseOnRelease: 0.03,
    swimRefillFloor: 0.34,
    swimRefillResume: 0.64,
    // Capabilities
    canRecharge: false,
    canChargeKeep: false,
    fullChargeDamageBonus: true, // 32.0 -> 40.0 (3-shot splat) at full charge
    fullChargeFireRateBonus: false,
    dualMode: false,
    // Combat (commit to full charge for 40 dmg bonus except point-blank emergencies)
    combatFullSpin: 1.0,
    combatMidSpin: 0.99,
    combatCloseSpin: 0.38,
    combatCloseDistRatio: 0.36,
    combatMidDistRatio: 0.72,
    prefRangeRatio: 0.90,
    retreatRangeRatio: 0.58,
    chargeMoveScale: 0.34,
    streamStrafeRatio: 0.26,
    maxHoldFar: 0.48,
    maxHoldClose: 0.18,
    rechargeStreamMinFrac: 0,
    rechargeInkFloor: 1,
    keepMaxSec: 0,
    keepInkFloor: 1,
  }),

  downpour: Object.freeze({
    key: 'downpour',
    id: 's3-spinner-downpour',
    sourceMainActor: 'WeaponSpinnerDownpour',
    // Turf paint (strictly preserves ~0.24 short-range mode contract)
    paintTargetSpin: 0.24,
    paintSpinJitter: 0.015, // 0.225..0.255
    paintSweepSpeed: 2.30,
    paintStrafe: 0.38,
    paintPauseOnRelease: 0.02,
    swimRefillFloor: 0.26,
    swimRefillResume: 0.52,
    // Capabilities
    canRecharge: true,
    canChargeKeep: false,
    fullChargeDamageBonus: false,
    fullChargeFireRateBonus: false,
    dualMode: true,
    // Combat (short-range 3F high-mobility close duels; long-range pinpoint beam at distance)
    combatFullSpin: 0.90,
    combatMidSpin: 0.68,
    combatCloseSpin: 0.26,
    combatCloseDistRatio: 0.42,
    combatMidDistRatio: 0.64,
    prefRangeRatio: 0.86,
    retreatRangeRatio: 0.52,
    chargeMoveScale: 0.66,
    streamStrafeRatio: 0.46,
    maxHoldFar: 0.40,
    maxHoldClose: 0.16,
    rechargeStreamMinFrac: 0.20,
    rechargeInkFloor: 0.32,
    keepMaxSec: 0,
    keepInkFloor: 1,
  }),

  serein: Object.freeze({
    key: 'serein',
    id: 's3-spinner-serein',
    sourceMainActor: 'WeaponSpinnerSerein',
    // Turf paint (full spin-up >= 0.88 with brisk 15% ink efficiency)
    paintTargetSpin: 0.90,
    paintSpinJitter: 0.02, // 0.88..0.92
    paintSweepSpeed: 2.10,
    paintStrafe: 0.32,
    paintPauseOnRelease: 0.025,
    swimRefillFloor: 0.20,
    swimRefillResume: 0.46,
    // Capabilities
    canRecharge: true,
    canChargeKeep: true, // Anytime Charge Keep (200F = 3.33s)
    fullChargeDamageBonus: false,
    fullChargeFireRateBonus: false,
    dualMode: false,
    // Combat (charge-keep ambush/reposition + mid-stream recharge)
    combatFullSpin: 0.90,
    combatMidSpin: 0.72,
    combatCloseSpin: 0.50,
    combatCloseDistRatio: 0.45,
    combatMidDistRatio: 0.76,
    prefRangeRatio: 0.80,
    retreatRangeRatio: 0.46,
    chargeMoveScale: 0.42,
    streamStrafeRatio: 0.42,
    maxHoldFar: 0.42,
    maxHoldClose: 0.18,
    rechargeStreamMinFrac: 0.18,
    rechargeInkFloor: 0.26,
    keepMaxSec: 1.15,
    keepInkFloor: 0.18,
  }),

  hypershort: Object.freeze({
    key: 'hypershort',
    id: 's3-spinner-hypershort',
    sourceMainActor: 'WeaponSpinnerHyperShort',
    // Turf paint (full charge unlocks 3F ultra-rapid 61-round carpet + 0.086 strafe speed)
    paintTargetSpin: 0.99,
    paintSpinJitter: 0.01, // 0.98..1.00
    paintSweepSpeed: 2.40,
    paintStrafe: 0.40,
    paintPauseOnRelease: 0.025,
    swimRefillFloor: 0.24,
    swimRefillResume: 0.50,
    // Capabilities
    canRecharge: false,
    canChargeKeep: false,
    fullChargeDamageBonus: false,
    fullChargeFireRateBonus: true, // RepeatFrame 4F -> 3F at full charge
    dualMode: false,
    // Combat (commit to full charge for 3F shredder except point-blank rush; aggressive strafe)
    combatFullSpin: 1.0,
    combatMidSpin: 0.99,
    combatCloseSpin: 0.44,
    combatCloseDistRatio: 0.38,
    combatMidDistRatio: 0.72,
    prefRangeRatio: 0.76,
    retreatRangeRatio: 0.44,
    chargeMoveScale: 0.66,
    streamStrafeRatio: 0.58,
    maxHoldFar: 0.36,
    maxHoldClose: 0.16,
    rechargeStreamMinFrac: 0,
    rechargeInkFloor: 1,
    keepMaxSec: 0,
    keepInkFloor: 1,
  }),
});

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic O(1) human-like micro-variation in [-1, +1] derived from shot index & actor id.
 * Avoids robotic fixed frame-exact thresholds while staying 100% deterministic & allocation-free.
 */
function humanCadenceWave(brain, actor) {
  const shotIdx = brain?._splatlingShotCount || 0;
  const actorId = typeof actor?.id === 'number' ? actor.id : 0;
  return Math.sin(shotIdx * 2.17 + actorId * 1.31);
}

/**
 * Resolves the remaining stream fraction [0, 1] from either legacy splatling or catalog runner state.
 */
function resolveStreamRemainingFrac(wr) {
  const cs = wr?.catalogState;
  if (cs && cs.stream > 0 && cs.streamTime > EPS) {
    return clamp(1 - (cs.streamElapsed || 0) / cs.streamTime, 0, 1);
  }
  if (typeof wr?.burstFrac === 'number' && Number.isFinite(wr.burstFrac)) {
    return clamp(wr.burstFrac, 0, 1);
  }
  if (typeof wr?.charge === 'number' && Number.isFinite(wr.charge)) {
    return clamp(wr.charge, 0, 1);
  }
  return 0.5;
}

/**
 * Resolves elapsed stream time in seconds (used for Ballpoint's 0.50s short-range window).
 */
function resolveStreamElapsedSec(wr) {
  const cs = wr?.catalogState;
  if (cs && typeof cs.streamElapsed === 'number' && Number.isFinite(cs.streamElapsed)) {
    return cs.streamElapsed;
  }
  if (wr?.s3Spin && typeof wr.s3Spin.elapsed === 'number') {
    return wr.s3Spin.elapsed;
  }
  return 0;
}

/**
 * Checks whether the weapon supports Recharge from archetype or live catalog parameters.
 */
function canWeaponRecharge(weapon, arch) {
  const param = weapon?.catalogRecord?.parameters?.WeaponParam;
  if (param && typeof param.EnableRecharge === 'boolean') {
    return param.EnableRecharge;
  }
  return arch.canRecharge;
}

/**
 * Checks whether the weapon supports Charge Keep from archetype or live catalog parameters.
 */
function canWeaponChargeKeep(weapon, arch) {
  const kp = weapon?.catalogRecord?.parameters?.WeaponKeepChargeParam;
  if (kp) {
    return (kp.KeepChargeFullFrame || 0) > 0;
  }
  return arch.canChargeKeep;
}

/**
 * Applies smooth lateral strafe ("カニ歩き") to `move` in place with zero allocations.
 */
function applyLateralStrafeInPlace(brain, actor, dt, move, refYaw, ratio, flankBias) {
  if (!move || typeof move.x !== 'number' || typeof move.z !== 'number' || ratio <= 0) return;
  const actorId = typeof actor?.id === 'number' ? actor.id : 0;
  const t = brain?.t || 0;
  const targetSign = Math.abs(flankBias) > 0.05
    ? (flankBias > 0 ? 1 : -1)
    : (Math.sin(t * 2.1 + actorId * 1.7) >= 0 ? 1 : -1);
  const prev = typeof brain?._splatlingSmoothStrafe === 'number' ? brain._splatlingSmoothStrafe : targetSign;
  const smooth = prev + (targetSign - prev) * Math.min(1, dt * 7.0);
  if (brain) brain._splatlingSmoothStrafe = smooth;

  const perpX = Math.cos(refYaw) * smooth;
  const perpZ = -Math.sin(refYaw) * smooth;
  const mx = move.x + perpX * ratio;
  const mz = move.z + perpZ * ratio;
  const len = Math.hypot(mx, mz);
  if (len > 1e-4) {
    move.x = mx / len;
    move.z = mz / len;
  }
}

/**
 * Classifies any Splatoon 3 Splatling weapon into one of the 6 archetypes in O(1) time
 * with zero string allocations on the common fast path.
 *
 * @param {object} weapon
 * @returns {object} Frozen archetype entry from `SPLATLING_ARCHETYPES`
 */
export function resolveSplatlingArchetype(weapon) {
  if (!weapon) return SPLATLING_ARCHETYPES.standard;

  const src = weapon.sourceMainActor || weapon.catalogRecord?.sourceMainActor || '';
  if (src === 'WeaponSpinnerQuick') return SPLATLING_ARCHETYPES.quick;
  if (src === 'WeaponSpinnerStandard') return SPLATLING_ARCHETYPES.standard;
  if (src === 'WeaponSpinnerHyper') return SPLATLING_ARCHETYPES.hyper;
  if (src === 'WeaponSpinnerDownpour') return SPLATLING_ARCHETYPES.downpour;
  if (src === 'WeaponSpinnerSerein') return SPLATLING_ARCHETYPES.serein;
  if (src === 'WeaponSpinnerHyperShort') return SPLATLING_ARCHETYPES.hypershort;

  const id = weapon.id || '';
  if (id === 's3-spinner-quick') return SPLATLING_ARCHETYPES.quick;
  if (id === 'splatling' || id === 's3-spinner-standard') return SPLATLING_ARCHETYPES.standard;
  if (id === 's3-spinner-hyper') return SPLATLING_ARCHETYPES.hyper;
  if (id === 's3-spinner-downpour') return SPLATLING_ARCHETYPES.downpour;
  if (id === 's3-spinner-serein') return SPLATLING_ARCHETYPES.serein;
  if (id === 's3-spinner-hypershort') return SPLATLING_ARCHETYPES.hypershort;

  if (id) {
    const low = String(id).toLowerCase();
    if (low.includes('hypershort') || low.includes('edit') || low.includes('examiner')) {
      return SPLATLING_ARCHETYPES.hypershort;
    }
    if (low.includes('downpour') || low.includes('ballpoint') || low.includes('kugel')) {
      return SPLATLING_ARCHETYPES.downpour;
    }
    if (low.includes('serein') || low.includes('nautilus')) {
      return SPLATLING_ARCHETYPES.serein;
    }
    if (low.includes('hyper') || low.includes('hydra')) {
      return SPLATLING_ARCHETYPES.hyper;
    }
    if (low.includes('quick') || low.includes('mini')) {
      return SPLATLING_ARCHETYPES.quick;
    }
  }

  return SPLATLING_ARCHETYPES.standard;
}

/**
 * Applies Splatoon 3 Splatling Turf War painting AI.
 *
 * Guarantees:
 * - Standard splatlings (Heavy, Mini, Hydra, Nautilus, Heavy Edit) always spin up to >= 0.88
 *   before releasing (preserving `bot-splatling-charge.test.mjs` and `bot-turf-paint.test.mjs`).
 * - Ballpoint Splatling (`s3-spinner-downpour`) paints in its authentic ~0.24 short-range mode
 *   and may weave bounded short-mode recharges before the 0.50s long-range switch.
 * - Holds spin while `pitchReady === false` (preventing downward floor-paint releases).
 * - Adds natural human cadence variation, stream-phase sweep/strafe rhythm, and micro-refill
 *   squid hysteresis on own ink with zero per-frame allocations.
 */
export function applySplatlingTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!it || !wr) return;

  const safeDt = dt > 0 && dt < 0.5 ? dt : 1 / 60;
  const w = actor.weapon;
  const arch = resolveSplatlingArchetype(w);
  const cache = ctx?.cache ?? brain?._turfMultiCache;
  const onOwnInk = actor.groundTeam === 1;
  const coolerPending = Boolean(brain?._coolerPickupPending);
  const rechargeAllowed = canWeaponRecharge(w, arch);

  if (brain && (brain._splatlingRechargeCd || 0) > 0) {
    brain._splatlingRechargeCd = Math.max(0, brain._splatlingRechargeCd - safeDt);
  }

  // Keep paintPause short so splatlings don't stall idly between spin-up cycles
  if (brain && (brain.paintPause || 0) > 0.03) {
    brain.paintPause = 0.03;
  }

  const pitchReady = typeof ctx?.pitchReady === 'boolean'
    ? ctx.pitchReady
    : (typeof brain?._turfPaintValidated === 'boolean' ? brain._turfPaintValidated : true);

  const wantPaintNow = typeof ctx?.wantPaintNow === 'boolean'
    ? ctx.wantPaintNow
    : Boolean(brain?._turfPaintLatch && pitchReady && inkFrac > 0.10 && (brain?.paintPause || 0) <= 0);

  if (brain && brain._turfPaintValidated === false) {
    it.fire = false;
  }

  // 1. Micro-refill squid hysteresis on own ink when idle (crucial for Hydra's 35% tank cost)
  if (!wr.streaming && !wr.charging) {
    if (brain?._splatlingMicroRefill) {
      if (inkFrac >= arch.swimRefillResume || !onOwnInk || coolerPending) {
        brain._splatlingMicroRefill = 0;
      } else {
        it.fire = false;
        it.squid = true;
        return;
      }
    } else if (onOwnInk && !coolerPending && inkFrac < arch.swimRefillFloor && inkFrac > 0.06) {
      if (brain) brain._splatlingMicroRefill = 1;
      it.fire = false;
      it.squid = true;
      return;
    }
  }

  // 2. Stored charge-keep resume (Nautilus entering paint with a stored charge)
  if (wr.catalogState?.stored && wantPaintNow && pitchReady) {
    it.fire = true;
    it.squid = false;
    if (brain) brain._splatlingKeepT = 0;
    return;
  }

  // 3. Active firing stream: hose the lane with natural sweep modulation & lateral strafe
  if (wr.streaming) {
    it.squid = false;
    const elapsed = resolveStreamElapsedSec(wr);
    const remFrac = resolveStreamRemainingFrac(wr);

    // Ballpoint Splatling: optional short-range recharge right before the 0.50s mode switch
    // when unpainted turf remains ahead and ink is healthy (bounded by cooldown).
    if (
      arch.dualMode &&
      rechargeAllowed &&
      wantPaintNow &&
      pitchReady &&
      inkFrac >= arch.rechargeInkFloor &&
      elapsed >= DOWNPOUR_SHORT_MODE_SEC - 0.06 &&
      elapsed < DOWNPOUR_SHORT_MODE_SEC + 0.04 &&
      (brain?._splatlingRechargeCd || 0) <= 0
    ) {
      it.fire = true;
      if (brain) {
        brain._splatlingRechargeCd = 0.65;
        brain._splatlingShotCount = (brain._splatlingShotCount || 0) + 1;
      }
      return;
    }

    it.fire = false;

    // Human-like sweep cadence: wider, fluid sweep early/mid stream, steadying near tail
    if (brain && typeof brain.sweep === 'number') {
      const paceMod = 0.78 + 0.34 * remFrac;
      brain.sweep += safeDt * (arch.paintSweepSpeed * paceMod - 2.1) * 0.45;
    }

    // Active lateral strafe ("カニ歩き塗り") during stream emission
    if (wantMove && move) {
      const hasNav = Array.isArray(brain?.path) && brain.path.length > 1 && (G?.nav?.nodes?.length || 0) > 4;
      const strafe = hasNav ? arch.paintStrafe * 0.24 : arch.paintStrafe;
      applyLateralStrafeInPlace(brain, actor, safeDt, move, baseYaw, strafe, cache?.flankBias || 0);
    }
    return;
  }

  // 4. Active spin-up charging: respect archetype spin target & floor-pitch safety contract
  if (wr.charging) {
    const wave = humanCadenceWave(brain, actor);
    let targetSpin = arch.paintTargetSpin + wave * arch.paintSpinJitter;
    if (arch.dualMode) {
      // Ballpoint short-range paint contract (~0.24)
      targetSpin = clamp(targetSpin, 0.22, 0.26);
    } else {
      // Standard splatling full spin-up contract (>= 0.88)
      targetSpin = clamp(targetSpin, STANDARD_PAINT_MIN_SPIN, 1.0);
    }

    if (wr.charge >= targetSpin || inkFrac < 0.16) {
      if (!pitchReady && inkFrac >= 0.16) {
        // Hold spin while aimPitch recovers from floor-look (bot-turf-paint.test.mjs contract)
        it.fire = true;
        it.squid = false;
      } else {
        it.fire = false;
        it.squid = false;
        if (brain) {
          brain._splatlingHold = 0;
          brain.paintPause = arch.paintPauseOnRelease;
          brain._splatlingShotCount = (brain._splatlingShotCount || 0) + 1;
        }
      }
    } else {
      it.fire = true;
      it.squid = false;
    }
    return;
  }

  // 5. Idle / ready to spin up next paint burst
  if (wantPaintNow && (wr.cooldown || 0) <= EPS) {
    it.fire = true;
    it.squid = false;
  } else if (!wantPaintNow && onOwnInk && wantMove && !coolerPending) {
    // Reposition quickly via squid-swim when current sector is already painted
    it.fire = false;
    it.squid = true;
  }
}

/**
 * Applies Splatoon 3 Splatling combat AI.
 *
 * Archetype highlights:
 * - Mini Splatling (`quick`): brisk partial-charge close duels + high-mobility strafing.
 * - Heavy Splatling (`standard`): preserves proven 0.39 / 0.66 / 0.88 distance spin curve + kiting.
 * - Hydra Splatling (`hyper`): commits to full charge (40 dmg 3-shot bonus) at mid/long range;
 *   emergency partial spin only when point-blank rushed, with strong spacing discipline.
 * - Ballpoint Splatling (`downpour`): short-range 3F high-mobility close duels (~0.26) with
 *   short-mode recharge vs. long-range pinpoint beam (~0.90) with bounded tail recharge.
 * - Nautilus 47 (`serein`): authentic squid Charge Keep when LOS breaks or closing on own ink,
 *   plus bounded mid-stream recharge to extend pressure.
 * - Heavy Edit Splatling (`hypershort`): commits to full charge for 3F ultra-rapid fire at
 *   mid/long range while aggressively strafing with 0.086 run speed during stream.
 *
 * Returns `null` so the engine's natural aim & human `aimError` pipeline remains completely untouched.
 */
export function applySplatlingCombat(brain, G, actor, dt, move, ctx) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!it || !wr || !ctx) return null;

  const safeDt = dt > 0 && dt < 0.5 ? dt : 1 / 60;
  const w = actor.weapon;
  const arch = resolveSplatlingArchetype(w);
  const rechargeAllowed = canWeaponRecharge(w, arch);
  const keepAllowed = canWeaponChargeKeep(w, arch);

  const dist = typeof ctx.dist === 'number' ? ctx.dist : 0;
  const range = ctx.range > 0 ? ctx.range : (w?.range || 18);
  const dx = typeof ctx.dx === 'number' ? ctx.dx : 0;
  const dz = typeof ctx.dz === 'number' ? ctx.dz : 0;
  const enemyVisible = Boolean(ctx.enemyVisible);
  const aimed = Boolean(ctx.aimed);
  const off = typeof ctx.off === 'number' ? ctx.off : 0;
  const inkFrac = typeof ctx.inkFrac === 'number' ? ctx.inkFrac : 1;

  const safeDist = dist > 0.01 ? dist : 0.01;
  const nx = dx / safeDist;
  const nz = dz / safeDist;
  const onOwnInk = actor.groundTeam === 1;
  const inThreatRange = dist < range * 1.12;

  if (brain && (brain._splatlingRechargeCd || 0) > 0) {
    brain._splatlingRechargeCd = Math.max(0, brain._splatlingRechargeCd - safeDt);
  }

  // 1. Nautilus active Charge Keep management (stored charge in squid form)
  if (keepAllowed && wr.catalogState?.stored) {
    const keepT = (brain?._splatlingKeepT || 0) + safeDt;
    if (brain) brain._splatlingKeepT = keepT;

    const readyPop = enemyVisible && dist < range * 1.06 && (aimed || off < 0.26 || keepT >= 0.22 || dist < range * 0.55);
    const keepExpired = keepT >= arch.keepMaxSec || !onOwnInk || inkFrac < arch.keepInkFloor;

    if (readyPop) {
      // Pop out of squid form to unleash the stored charge
      it.squid = false;
      it.fire = true;
      if (brain) brain._splatlingKeepT = 0;
      return null;
    }
    if (keepExpired) {
      it.squid = false;
      it.fire = false;
      if (brain) brain._splatlingKeepT = 0;
      return null;
    }
    // Maintain squid charge-keep while repositioning on own ink
    it.fire = true;
    it.squid = true;
    return null;
  } else if (brain && brain._splatlingKeepT) {
    brain._splatlingKeepT = 0;
  }

  // 2. Active firing stream: track, kite/strafe, and handle authentic Recharge / Charge Keep
  if (wr.streaming) {
    const elapsed = resolveStreamElapsedSec(wr);
    const remFrac = resolveStreamRemainingFrac(wr);

    // Nautilus: if LOS breaks mid-stream with ample charge left on own ink, dive into Charge Keep
    if (
      keepAllowed &&
      !enemyVisible &&
      onOwnInk &&
      remFrac > 0.25 &&
      inkFrac > arch.keepInkFloor &&
      (brain?.lostTimer || 0) > 0.06 &&
      (brain?.lostTimer || 0) <= arch.keepMaxSec
    ) {
      it.fire = true;
      it.squid = true;
      if (brain) brain._splatlingKeepT = safeDt;
      return null;
    }

    // Ballpoint & Nautilus: bounded tactical recharge while target stays visible in range
    if (rechargeAllowed && enemyVisible && inThreatRange && (brain?._splatlingRechargeCd || 0) <= 0) {
      // Ballpoint close duel: recharge right before 0.50s to stay in fast 3F short-range mode
      if (
        arch.dualMode &&
        dist < range * arch.combatCloseDistRatio &&
        inkFrac >= arch.rechargeInkFloor &&
        elapsed >= DOWNPOUR_SHORT_MODE_SEC - 0.06 &&
        elapsed < DOWNPOUR_SHORT_MODE_SEC + 0.04
      ) {
        it.fire = true;
        it.squid = false;
        if (brain) brain._splatlingRechargeCd = 0.70;
        return null;
      }

      // Ballpoint long-range tail recharge or Nautilus tail recharge to finish a visible foe
      const minInk = arch.dualMode ? arch.rechargeInkFloor + 0.08 : arch.rechargeInkFloor;
      if (remFrac > 0.02 && remFrac <= arch.rechargeStreamMinFrac && inkFrac >= minInk) {
        it.fire = true;
        it.squid = false;
        if (brain) brain._splatlingRechargeCd = 0.85;
        return null;
      }
    }

    // Default: keep Fire released so the stream completes cleanly
    it.fire = false;
    it.squid = false;

    // Spacing & human-like lateral strafe while streaming
    if (enemyVisible && move && typeof move.set === 'function') {
      const side = (brain?.strafeS || 0.6) * (Math.sin((brain?.t || 0) * 2.4 + (actor.id || 0) * 1.1) >= 0 ? 1 : -1);
      if (dist < range * arch.retreatRangeRatio) {
        // Kite backward + strafe when rushed inside preferred range
        const mvx = -nx * 0.78 - nz * side * arch.streamStrafeRatio;
        const mvz = -nz * 0.78 + nx * side * arch.streamStrafeRatio;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      } else if (dist < range * 1.05) {
        // Lateral strafe duel (especially strong on Mini, Heavy Edit, and Ballpoint short mode)
        const strafeBoost = (arch.dualMode && elapsed < DOWNPOUR_SHORT_MODE_SEC) ? 0.58 : arch.streamStrafeRatio;
        const mvx = move.x * 0.45 - nz * side * strafeBoost;
        const mvz = move.z * 0.45 + nx * side * strafeBoost;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      }
    }
    return null;
  }

  // 3. Active combat engagement: visible enemy within threat range
  if (enemyVisible && inThreatRange && inkFrac > 0.06) {
    const wave = humanCadenceWave(brain, actor);
    let wantSpin;
    let maxHold;

    if (dist < range * arch.combatCloseDistRatio) {
      wantSpin = clamp(arch.combatCloseSpin + wave * 0.03, 0.22, 0.62);
      maxHold = arch.maxHoldClose;
    } else if (dist < range * arch.combatMidDistRatio) {
      if (arch.fullChargeDamageBonus || arch.fullChargeFireRateBonus) {
        // Hydra (40 dmg 3-shot) and Heavy Edit (3F fire rate) commit to full charge at mid range
        wantSpin = clamp(arch.combatMidSpin + wave * 0.01, 0.98, 1.0);
      } else {
        wantSpin = clamp(arch.combatMidSpin + wave * 0.03, 0.55, 0.85);
      }
      maxHold = arch.maxHoldFar;
    } else {
      if (arch.fullChargeDamageBonus || arch.fullChargeFireRateBonus) {
        wantSpin = 1.0;
      } else {
        wantSpin = clamp(arch.combatFullSpin + wave * 0.025, 0.84, 0.98);
      }
      maxHold = arch.maxHoldFar;
    }

    if (!wr.charging) {
      if ((wr.cooldown || 0) <= EPS && (brain?.react || 0) <= 0.15) {
        it.fire = true;
        it.squid = false;
        if (brain) brain._splatlingHold = 0;
      } else if (dist < range * arch.retreatRangeRatio && onOwnInk) {
        // Brief post-stream squid dip to restore range advantage when rushed
        if (move && typeof move.set === 'function') {
          const side = brain?.strafeS || 0.5;
          const mvx = -nx * 0.84 - nz * side * 0.42;
          const mvz = -nz * 0.84 + nx * side * 0.42;
          const ml = Math.hypot(mvx, mvz);
          if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
        }
        it.fire = false;
        it.squid = true;
      }
    } else {
      // Currently charging
      if (wr.charge < wantSpin) {
        it.fire = true;
        it.squid = false;
        if (brain) brain._splatlingHold = 0;
      } else {
        const hold = (brain?._splatlingHold || 0) + safeDt;
        if (brain) brain._splatlingHold = hold;
        if (aimed || off < 0.22 || hold >= maxHold) {
          it.fire = false;
          it.squid = false;
          if (brain) {
            brain._splatlingHold = 0;
            brain._splatlingShotCount = (brain._splatlingShotCount || 0) + 1;
          }
        } else {
          it.fire = true;
          it.squid = false;
        }
      }

      // Movement & spacing discipline while charging
      if (move && typeof move.set === 'function' && dist < range * arch.retreatRangeRatio) {
        const side = brain?.strafeS || 0.45;
        const mvx = -nx * 0.80 - nz * side * 0.45;
        const mvz = -nz * 0.80 + nx * side * 0.45;
        const ml = Math.hypot(mvx, mvz);
        if (ml > 1e-4) move.set(mvx / ml, 0, mvz / ml);
      }
      if (move && typeof move.multiplyScalar === 'function') {
        move.multiplyScalar(arch.chargeMoveScale);
      }
    }

    return null;
  }

  // 4. Charging while enemy broke LOS or moved out of range
  if (wr.charging) {
    const lost = brain?.lostTimer || 0;

    // Nautilus: use Charge Keep on own ink to close distance or flank after LOS break
    if (
      keepAllowed &&
      onOwnInk &&
      wr.charge >= 0.45 &&
      inkFrac > arch.keepInkFloor &&
      ((!enemyVisible && lost > 0.05 && lost <= arch.keepMaxSec) || (enemyVisible && !inThreatRange))
    ) {
      it.fire = true;
      it.squid = true;
      if (brain) brain._splatlingKeepT = safeDt;
      return null;
    }

    // Cancel stale charge when target stays hidden
    if (!enemyVisible && lost > 0.65) {
      it.fire = false;
      it.squid = false;
      if (brain) brain._splatlingHold = 0;
    }
  }

  return null;
}
