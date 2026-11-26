// Dedicated Splatoon 3 Blaster-family Bot AI module (turf painting & combat).
// Pure AI input, movement, spacing, pitch, and rhythm control — zero weapon stat edits,
// zero aimError cheats, zero wall-hack/live-target peeking behind cover.
// Designed for O(1) per-tick execution with zero hot-path allocations and natural human-like motion.
//
// Grounded in Splatoon 3 Wiki, Inkipedia & strategy guides:
// - ブラスター属 (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC%E5%B1%9E):
//   Airburst paint is far larger than terrain-impact paint; aim near-horizontal so shells
//   detonate mid-air close to the floor without hitting terrain; space shots so tip-blast
//   circles do not overlap; fight around the airburst distance and blast behind cover.
// - ノヴァブラスター (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%8E%E3%83%B4%E3%82%A1%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC):
//   Short range, wide airburst radius (3.9), 40F cadence, 7.5% ink, fast weight & low 5.5° jump swerve;
//   excels at close-range corner blasting and snappy lateral cutbacks.
// - ホットブラスター (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%9B%E3%83%83%E3%83%88%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC):
//   50F cadence with short 22F post-shot lock (28F window) enabling between-shot squid movement;
//   0° ground spread vs 10° jump spread; reliable 2-hit airburst (50-70 dmg).
// - ロングブラスター (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%AD%E3%83%B3%E3%82%B0%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC):
//   Heavy 11% ink consumption, 60F cadence, 30F post-shot lock, 70F ink lock; demands patient
//   long-range single-shot airburst placement, disciplined ink economy, and deliberate between-shot swim.
// - クラッシュブラスター (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%AF%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC):
//   Fast 20F cadence (= 20F post-shot lock), light 4% ink, widest 4.085 blast radius, fast 0.068 run speed;
//   sustains continuous strafe-chasing pressure without squid-startup overhead.
// - ラピッドブラスター (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%A9%E3%83%94%E3%83%83%E3%83%89%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC):
//   35F cadence, 7% ink, 0.055 run speed, 85 direct + 35 blast (2-hit combo, no 1-shot direct);
//   kites at mid-long range with rhythmic 2-shot pressure and 3-4 shot paint recovery cycles.
// - Rブラスターエリート (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/R%E3%83%96%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BC%E3%82%A8%E3%83%AA%E3%83%BC%E3%83%88):
//   Longest blaster range (19.2), 40F cadence, 9.12% ink, 60F ink lock, 85+35 2-hit combo;
//   enforces strict long-range kiting and grounded 0° precision without wasteful jump shots.
// - S-BLAST92 (https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/S-BLAST92):
//   55F cadence, 9.5% ink; dual-mode grounded long fast narrow blast (1.7 speed, 2.035 radius, 0° spread)
//   vs jump short wide blast (0.92 speed, 3.635 radius, 3.7 paint drop).
// - MatchGuyのスプラ塾「効率のいい塗り方」(https://spl3.ink/matchguy-vol03/):
//   Lateral strafe painting ("カニ歩き塗り") for blasters to paint wide lanes cleanly.
import { botRawWeaponFamily } from './bot-turf-paint.mjs';

const EPS = 1e-6;

export const BLASTER_ARCHETYPES = Object.freeze({
  clash: Object.freeze({
    key: 'clash',
    sweetMinFrac: 0.70,
    sweetPrefFrac: 0.85,
    sweetMaxFrac: 0.98,
    defaultSplashRadius: 2.9,
    paintBurstShots: 8,
    burstJitter: 1.5,
    inkRecoverTrigger: 0.28,
    inkRecoverTarget: 0.58,
    inkRecoverLockS: 0.67,
    sweepStepRad: 0.34,
    paintStrafe: 0.40,
    paintStrafeFreq: 2.55,
    swimBetweenShots: false,
    combatSwimCdMin: 0.16,
    jumpPaintChance: 0,
    combatJumpClose: false,
    oneShotDirect: false,
    minAirburstPitch: -0.09,
    minCombatAirburstPitch: -0.14,
    kiteBackWeight: 0.82,
    kiteStrafeWeight: 0.64,
    sweetStrafeWeight: 0.94,
    combatStrafeFreq: 2.60,
    pushBias: 0.18,
    blastAimOffTol: 0.20,
    coverShotCap: 3,
    coverMinInk: 0.10,
    coverLostMax: 1.65,
    evadeJumpCd: 1.45,
  }),
  nova: Object.freeze({
    key: 'nova',
    sweetMinFrac: 0.72,
    sweetPrefFrac: 0.88,
    sweetMaxFrac: 0.98,
    defaultSplashRadius: 2.8,
    paintBurstShots: 4,
    burstJitter: 1.0,
    inkRecoverTrigger: 0.32,
    inkRecoverTarget: 0.64,
    inkRecoverLockS: 0.92,
    sweepStepRad: 0.52,
    paintStrafe: 0.36,
    paintStrafeFreq: 2.35,
    swimBetweenShots: true,
    combatSwimCdMin: 0.16,
    jumpPaintChance: 0,
    combatJumpClose: false,
    oneShotDirect: true,
    minAirburstPitch: -0.07,
    minCombatAirburstPitch: -0.12,
    kiteBackWeight: 0.82,
    kiteStrafeWeight: 0.68,
    sweetStrafeWeight: 0.96,
    combatStrafeFreq: 2.35,
    pushBias: 0.08,
    blastAimOffTol: 0.19,
    coverShotCap: 3,
    coverMinInk: 0.12,
    coverLostMax: 1.55,
    evadeJumpCd: 1.15,
  }),
  hot: Object.freeze({
    key: 'hot',
    sweetMinFrac: 0.74,
    sweetPrefFrac: 0.90,
    sweetMaxFrac: 1.00,
    defaultSplashRadius: 2.6,
    paintBurstShots: 4,
    burstJitter: 0.85,
    inkRecoverTrigger: 0.34,
    inkRecoverTarget: 0.66,
    inkRecoverLockS: 0.95,
    sweepStepRad: 0.48,
    paintStrafe: 0.32,
    paintStrafeFreq: 1.95,
    swimBetweenShots: true,
    combatSwimCdMin: 0.16,
    jumpPaintChance: 0,
    combatJumpClose: false,
    oneShotDirect: true,
    minAirburstPitch: -0.06,
    minCombatAirburstPitch: -0.11,
    kiteBackWeight: 0.85,
    kiteStrafeWeight: 0.62,
    sweetStrafeWeight: 0.88,
    combatStrafeFreq: 1.85,
    pushBias: 0,
    blastAimOffTol: 0.19,
    coverShotCap: 2,
    coverMinInk: 0.14,
    coverLostMax: 1.35,
    evadeJumpCd: 1.60,
  }),
  long: Object.freeze({
    key: 'long',
    sweetMinFrac: 0.78,
    sweetPrefFrac: 0.93,
    sweetMaxFrac: 1.03,
    defaultSplashRadius: 2.5,
    paintBurstShots: 3,
    burstJitter: 0.70,
    inkRecoverTrigger: 0.38,
    inkRecoverTarget: 0.70,
    inkRecoverLockS: 1.17,
    sweepStepRad: 0.42,
    paintStrafe: 0.28,
    paintStrafeFreq: 1.35,
    swimBetweenShots: true,
    combatSwimCdMin: 0.18,
    jumpPaintChance: 0,
    combatJumpClose: false,
    oneShotDirect: true,
    minAirburstPitch: -0.05,
    minCombatAirburstPitch: -0.10,
    kiteBackWeight: 0.90,
    kiteStrafeWeight: 0.54,
    sweetStrafeWeight: 0.78,
    combatStrafeFreq: 1.15,
    pushBias: -0.05,
    blastAimOffTol: 0.13,
    coverShotCap: 2,
    coverMinInk: 0.22,
    coverLostMax: 1.20,
    evadeJumpCd: 2.00,
  }),
  rapid: Object.freeze({
    key: 'rapid',
    sweetMinFrac: 0.80,
    sweetPrefFrac: 0.95,
    sweetMaxFrac: 1.05,
    defaultSplashRadius: 2.5,
    paintBurstShots: 4,
    burstJitter: 0.90,
    inkRecoverTrigger: 0.32,
    inkRecoverTarget: 0.65,
    inkRecoverLockS: 0.78,
    sweepStepRad: 0.38,
    paintStrafe: 0.32,
    paintStrafeFreq: 1.85,
    swimBetweenShots: true,
    combatSwimCdMin: 0.16,
    jumpPaintChance: 0,
    combatJumpClose: false,
    oneShotDirect: false,
    minAirburstPitch: -0.05,
    minCombatAirburstPitch: -0.10,
    kiteBackWeight: 0.96,
    kiteStrafeWeight: 0.48,
    sweetStrafeWeight: 0.84,
    combatStrafeFreq: 1.70,
    pushBias: -0.06,
    blastAimOffTol: 0.16,
    coverShotCap: 2,
    coverMinInk: 0.14,
    coverLostMax: 1.35,
    evadeJumpCd: 1.75,
  }),
  rapid_pro: Object.freeze({
    key: 'rapid_pro',
    sweetMinFrac: 0.82,
    sweetPrefFrac: 0.96,
    sweetMaxFrac: 1.06,
    defaultSplashRadius: 2.4,
    paintBurstShots: 3,
    burstJitter: 0.75,
    inkRecoverTrigger: 0.36,
    inkRecoverTarget: 0.68,
    inkRecoverLockS: 1.00,
    sweepStepRad: 0.34,
    paintStrafe: 0.28,
    paintStrafeFreq: 1.30,
    swimBetweenShots: true,
    combatSwimCdMin: 0.16,
    jumpPaintChance: 0,
    combatJumpClose: false,
    oneShotDirect: false,
    minAirburstPitch: -0.04,
    minCombatAirburstPitch: -0.09,
    kiteBackWeight: 1.00,
    kiteStrafeWeight: 0.36,
    sweetStrafeWeight: 0.76,
    combatStrafeFreq: 1.25,
    pushBias: -0.10,
    blastAimOffTol: 0.14,
    coverShotCap: 2,
    coverMinInk: 0.18,
    coverLostMax: 1.25,
    evadeJumpCd: 0,
  }),
  sblast: Object.freeze({
    key: 'sblast',
    sweetMinFrac: 0.74,
    sweetPrefFrac: 0.92,
    sweetMaxFrac: 1.02,
    defaultSplashRadius: 2.4,
    paintBurstShots: 3,
    burstJitter: 0.80,
    inkRecoverTrigger: 0.36,
    inkRecoverTarget: 0.68,
    inkRecoverLockS: 1.00,
    sweepStepRad: 0.46,
    paintStrafe: 0.30,
    paintStrafeFreq: 1.75,
    swimBetweenShots: true,
    combatSwimCdMin: 0.16,
    jumpPaintChance: 0.65,
    combatJumpClose: true,
    oneShotDirect: true,
    minAirburstPitch: -0.06,
    minCombatAirburstPitch: -0.10,
    kiteBackWeight: 0.84,
    kiteStrafeWeight: 0.60,
    sweetStrafeWeight: 0.84,
    combatStrafeFreq: 1.65,
    pushBias: 0,
    blastAimOffTol: 0.11,
    closeBlastAimOffTol: 0.18,
    coverShotCap: 2,
    coverMinInk: 0.16,
    coverLostMax: 1.35,
    evadeJumpCd: 0,
  }),
});

/**
 * Classifies a blaster weapon into its Splatoon 3 sub-archetype without mutating weapon stats.
 */
export function getBlasterArchetype(weapon) {
  if (!weapon || typeof weapon !== 'object') return BLASTER_ARCHETYPES.hot;
  const id = String(weapon.id || weapon.catalogRecord?.id || '').toLowerCase();
  const actorName = String(weapon.sourceMainActor || weapon.catalogRecord?.sourceMainActor || '');
  const row = String(weapon.catalogRecord?.sourceRow || '');

  if (row.includes('LightShort') || actorName.includes('LightShort') || id.includes('lightshort') || id.includes('clash')) {
    return BLASTER_ARCHETYPES.clash;
  }
  if (row.includes('LightLong') || actorName.includes('LightLong') || id.includes('lightlong') || id.includes('rapid_pro') || id.includes('elite')) {
    return BLASTER_ARCHETYPES.rapid_pro;
  }
  if (row.includes('Light') || actorName.includes('Light') || id.includes('blaster-light') || id.includes('rapid')) {
    return BLASTER_ARCHETYPES.rapid;
  }
  if (row.includes('Precision') || actorName.includes('Precision') || id.includes('precision') || id.includes('sblast') || id.includes('s-blast')) {
    return BLASTER_ARCHETYPES.sblast;
  }
  if (row.includes('Long') || actorName.includes('Long') || id.includes('blaster-long') || id.includes('range_blaster') || id.includes('long_blaster')) {
    return BLASTER_ARCHETYPES.long;
  }
  if (row.includes('Short') || actorName.includes('Short') || id.includes('blaster-short') || id.includes('luna') || id.includes('nova')) {
    return BLASTER_ARCHETYPES.nova;
  }
  if (row.includes('Middle') || actorName.includes('Middle') || id === 'blaster') {
    return BLASTER_ARCHETYPES.hot;
  }
  // Fallback heuristic based on read-only weapon specs
  const fireInterval = weapon.fireInterval || 0.78;
  const range = weapon.range || 10.5;
  if (fireInterval <= 0.42) return BLASTER_ARCHETYPES.clash;
  if (range >= 15.5) return (weapon.directDamage || 125) < 100 ? BLASTER_ARCHETYPES.rapid_pro : BLASTER_ARCHETYPES.long;
  if (range <= 8.8) return BLASTER_ARCHETYPES.nova;
  return BLASTER_ARCHETYPES.hot;
}

/**
 * Lightweight O(1) non-repeating human-like oscillation in [-1, 1] seeded by bot phase & clock.
 */
function humanWave(t, ph, freq) {
  const x = t * freq + ph;
  return Math.sin(x) * 0.62 + Math.sin(x * 1.73 + 0.9) * 0.38;
}

function resolvePhase(brain, actor) {
  if (typeof brain.ph1 === 'number') return brain.ph1;
  return ((actor?.id || 0) * 1.73) % 20;
}

function getBlasterState(brain) {
  let st = brain._blasterAiState;
  if (!st) {
    st = brain._blasterAiState = {
      prevCooldown: 0,
      burstShots: 0,
      microRecover: false,
      microRecoverT: 0,
      coverShots: 0,
      lastCoverTarget: null,
      sweepDir: 1,
      combatJumpCd: 0,
      paintJumpCd: 0,
      _aimOut: { wantYaw: 0, wantPitch: 0 },
    };
  }
  return st;
}

function isPostShotLocked(wr) {
  if (!wr) return false;
  return (wr.s3PostShotRemaining || 0) > EPS ||
    (wr.s3BlasterInterruptSquid || 0) > EPS ||
    !!wr.catalogState?.pending;
}

function setMoveXZ(move, x, z) {
  if (!move) return;
  if (typeof move.set === 'function') move.set(x, 0, z);
  else {
    move.x = x;
    move.z = z;
  }
}

function resolveMatchTimeLeft(G) {
  if (typeof G?.match?.time === 'number') return G.match.time;
  if (typeof G?.timeLeft === 'number') return G.timeLeft;
  return 120;
}

function isNearWaterSafe(brain, actor, radius) {
  if (typeof brain?._nearWater === 'function') {
    return !!brain._nearWater(actor, radius);
  }
  return false;
}

/**
 * Applies Splatoon 3 authentic Blaster Turf War painting behavior:
 * 1. Airburst pitch discipline: avoids wasting shots into the floor (terrain-impact paint is <40% area).
 * 2. Organic shot-spacing sweep stepping: advances horizontal sweep after each shell with subtle human
 *    variation so tip-blast circles tile cleanly without robotic fixed increments.
 * 3. Between-shot squid swim ("1発ごとのイカ移動"): releases fire after each shot and swims on own ink once
 *    post-shot lock expires, turning slow 40F-60F cooldowns into fast repositioning & forward advance.
 * 4. Organic burst micro-recovery: dips briefly in own ink before hitting the 12% refill cliff with
 *    natural per-bot burst rhythm variation instead of a rigid shot counter.
 * 5. S-BLAST '92/'91 short-range wide-blast jump painting with organic cadence on safe flat ground.
 * 6. Archetype-tuned lateral strafe painting ("カニ歩き塗り") with smooth sinusoidal flow.
 */
export function applyBlasterTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx = {}) {
  if (!brain || !actor || !actor.intent) return;
  if (brain._disableTurfPaintPatch || actor._disableTurfPaintPatch) return;

  const rawFamily = botRawWeaponFamily(actor.weapon, null);
  if (rawFamily !== 'blaster') return;

  const it = actor.intent;
  const wr = actor.weaponRunner;
  const arch = getBlasterArchetype(actor.weapon);
  const st = getBlasterState(brain);

  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  st.paintJumpCd = Math.max(0, st.paintJumpCd - safeDt);

  const t = typeof brain.t === 'number' ? brain.t : 0;
  const ph = resolvePhase(brain, actor);
  const rhythmWave = humanWave(t, ph, 0.58);

  const cache = ctx.cache ?? brain._turfMultiCache;
  const pitchReady = typeof ctx.pitchReady === 'boolean'
    ? ctx.pitchReady
    : (typeof brain._turfPaintValidated === 'boolean' ? brain._turfPaintValidated : true);
  const wantPaintNow = typeof ctx.wantPaintNow === 'boolean'
    ? ctx.wantPaintNow
    : Boolean(brain._turfPaintLatch && pitchReady && inkFrac > 0.10 && (brain.paintPause || 0) <= 0);

  const cooldown = wr?.cooldown || 0;
  const postLocked = isPostShotLocked(wr);
  const onOwnInk = actor.groundTeam === 1;
  const onEnemyInk = actor.groundTeam === 2;
  const coolerPending = !!brain._coolerPickupPending;
  const timeLeft = resolveMatchTimeLeft(G);
  const isEndgamePush = timeLeft > 0 && timeLeft <= 6.5;

  // Detect fresh shot emission (cooldown jumped upward) to step sweep angle & count burst shots
  if (cooldown > st.prevCooldown + 0.08) {
    st.burstShots += 1;
    if (typeof brain.sweep === 'number') {
      // Advance sweep phase by organically modulated step so consecutive tip-blast circles tile naturally
      const flankBias = cache?.flankBias || 0;
      if (Math.abs(flankBias) > 0.10) {
        st.sweepDir = flankBias > 0 ? 1 : -1;
      } else if (Math.abs(humanWave(t, ph + 4.1, 0.37)) > 0.72) {
        st.sweepDir = humanWave(t, ph + 1.3, 0.29) >= 0 ? 1 : -1;
      }
      const stepScale = 1 + 0.22 * humanWave(t, ph, 1.35);
      brain.sweep += arch.sweepStepRad * stepScale * st.sweepDir;
    }
  }
  st.prevCooldown = cooldown;

  // Suppress legacy arbitrary paintPause stalls when actively painting
  if ((brain.paintPause || 0) > 0.02 && wantPaintNow) {
    brain.paintPause = 0.02;
  }

  // 1. Organic burst micro-recovery on own ink to prevent dropping below 12% into full-stop refill mode
  const dynRecoverTrigger = arch.inkRecoverTrigger + rhythmWave * 0.015;
  const dynRecoverTarget = arch.inkRecoverTarget + rhythmWave * 0.015;
  const dynBurstLimit = Math.max(2, arch.paintBurstShots + rhythmWave * arch.burstJitter);

  if (st.microRecover) {
    st.microRecoverT += safeDt;
    const maxRecoverTime = arch.inkRecoverLockS + 0.65;
    if (
      isEndgamePush ||
      !onOwnInk ||
      coolerPending ||
      inkFrac >= dynRecoverTarget ||
      st.microRecoverT >= maxRecoverTime
    ) {
      st.microRecover = false;
      st.microRecoverT = 0;
      st.burstShots = 0;
    } else {
      it.fire = false;
      it.squid = true;
      return;
    }
  } else if (
    !isEndgamePush &&
    !coolerPending &&
    onOwnInk &&
    !postLocked &&
    (inkFrac < dynRecoverTrigger || (st.burstShots >= dynBurstLimit && inkFrac < 0.56))
  ) {
    st.microRecover = true;
    st.microRecoverT = 0;
    it.fire = false;
    it.squid = true;
    return;
  }

  // 2. Guard against firing into the floor (terrain-impact blast shrinks paint radius from ~0.5-0.6 to 0.3)
  const aimPitch = typeof brain.aimPitch === 'number' ? brain.aimPitch : arch.minAirburstPitch;
  const floorRisk = !brain._footPaint && !onEnemyInk && aimPitch < -0.22;

  // 3. Shot cadence & between-shot squid swim (1発ごとのイカ移動キャンセル/慣性移動)
  if (postLocked) {
    // Release fire during post-shot lock so weapon-gates does not latch held-repeat cancel penalty
    it.fire = false;
    it.squid = false;
  } else if (cooldown > 0.14) {
    if (arch.swimBetweenShots) {
      // Between-shot window: release trigger and swim through own ink to cover distance at ~4x run speed
      it.fire = false;
      if (!coolerPending && onOwnInk && wantMove) {
        it.squid = true;
      }
    } else {
      // Clash Blaster (20F cadence): keep continuous firing cadence without squid-form startup overhead
      it.fire = wantPaintNow && !floorRisk && inkFrac > 0.12;
      if (it.fire) it.squid = false;
    }
  } else if (wantPaintNow && pitchReady && !floorRisk && inkFrac > 0.10) {
    // Ready to fire next airburst paint shell
    it.fire = true;
    it.squid = false;

    // S-BLAST '92/'91: jump-fire switches to short-range wide-blast mode for superior turf paint
    if (
      arch.jumpPaintChance > 0 &&
      actor.grounded &&
      st.paintJumpCd <= 0 &&
      !onEnemyInk &&
      !isNearWaterSafe(brain, actor, 1.8)
    ) {
      it.jump = true;
      st.paintJumpCd = 0.78 + 0.28 * (0.5 + 0.5 * humanWave(t, ph, 0.92));
    }
  } else {
    it.fire = false;
    if (!coolerPending && onOwnInk && wantMove && (!wantPaintNow || floorRisk)) {
      it.squid = true;
    }
  }

  // 4. Lateral strafe painting ("カニ歩き塗り") with smooth organic cadence per archetype
  if ((it.fire || postLocked) && wantMove && move && typeof move.x === 'number' && typeof move.z === 'number') {
    const hasActiveNavPath = Array.isArray(brain.path) && brain.path.length > 1 && (G?.nav?.nodes?.length || 0) > 4;
    const baseStrafe = ctx.profile?.strafe ?? arch.paintStrafe;
    const strafeMod = 1 + 0.18 * humanWave(t, ph + 2.4, 0.85);
    const strafeRatio = (hasActiveNavPath ? baseStrafe * 0.25 : baseStrafe) * strafeMod;
    if (strafeRatio > 0) {
      const flankBias = cache?.flankBias || 0;
      const targetSign = Math.abs(flankBias) > 0.05
        ? (flankBias > 0 ? 1 : -1)
        : humanWave(t, ph, arch.paintStrafeFreq);
      const prevStrafe = brain._smoothStrafe ?? targetSign;
      const smoothSign = prevStrafe + (targetSign - prevStrafe) * Math.min(1, safeDt * 6.5);
      brain._smoothStrafe = smoothSign;
      const perpX = Math.cos(baseYaw) * smoothSign;
      const perpZ = -Math.sin(baseYaw) * smoothSign;
      const mx = move.x + perpX * strafeRatio;
      const mz = move.z + perpZ * strafeRatio;
      const len = Math.hypot(mx, mz);
      if (len > 1e-4) {
        setMoveXZ(move, mx / len, mz / len);
      }
    }
  }
}

/**
 * Applies Splatoon 3 authentic Blaster combat AI:
 * 1. Sub-archetype airburst sweet-spot spacing & breathing feel (Luna/Hot/Long/Clash/Rapid/Pro/S-BLAST).
 * 2. Between-shot squid steps (引き撃ち / 追い撃ち / 横ステップ) during post-lock cooldown windows
 *    strictly guarded by `cooldown > arch.combatSwimCdMin` (>= 0.16s) to avoid emergeDelay collisions.
 * 3. S-BLAST '92/'91 natural mode switching: jump-shot wide short blast up close (and close cover),
 *    grounded 0° precision fast long blast at mid/far range.
 * 4. Extended airburst firing reach (range + splashRadius * 0.82) and anti-ground-impact pitch lift
 *    (preserves wantYaw / human aimError untouched, zero allocation via reusable aim output struct).
 * 5. Archetype-calibrated cover corner-blasting ("障害物裏の角撃ち"): up to 2-3 airburst shells at
 *    lastSeenPos after LOS break without peeking live hidden positions.
 *
 * Returns `{ wantYaw, wantPitch }` when pitch adjustment applies, or `null`.
 */
export function applyBlasterCombat(brain, G, actor, dt, move, ctx) {
  if (!brain || !actor || !ctx) return null;
  const w = actor.weapon;
  const rawFamily = botRawWeaponFamily(w, ctx.family);
  if (rawFamily !== 'blaster') return null;

  const it = actor.intent;
  const wr = actor.weaponRunner;
  if (!it || !wr) return null;

  const {
    dist, range, dx, dz,
    enemyVisible, aimed, off,
    inkFrac, idealPitch,
    wantYaw, wantPitch,
  } = ctx;

  const arch = getBlasterArchetype(w);
  const st = getBlasterState(brain);
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  st.combatJumpCd = Math.max(0, st.combatJumpCd - safeDt);

  const t = typeof brain.t === 'number' ? brain.t : 0;
  const ph = resolvePhase(brain, actor);
  const breathWave = humanWave(t, ph, 0.72);
  const strafeWave = humanWave(t, ph + 1.9, arch.combatStrafeFreq);

  const safeRange = Math.max(4, range || w?.range || 10.5);
  const splashRadius = w?.splashRadius || arch.defaultSplashRadius;
  const blastReach = safeRange + splashRadius * 0.82;
  const sweetMin = safeRange * (arch.sweetMinFrac + breathWave * 0.012);
  const sweetPref = safeRange * (arch.sweetPrefFrac + breathWave * 0.025);
  const sweetMax = safeRange * (arch.sweetMaxFrac + breathWave * 0.015);

  const nx = dx / Math.max(dist, 0.01);
  const nz = dz / Math.max(dist, 0.01);
  const baseSide = brain.strafeS || (brain.strafe || 1) * 0.65;
  // Blend bot's eased strafe with archetype-paced organic weave (keeps direction sign & natural cutbacks)
  const side = baseSide * (0.82 + 0.18 * strafeWave) + strafeWave * 0.16;
  const cooldown = wr.cooldown || 0;
  const postLocked = isPostShotLocked(wr);
  const onOwnInk = actor.groundTeam === 1;

  // Reset cover-shot budget when enemy is visible again or target changes
  if (enemyVisible || st.lastCoverTarget !== brain.target) {
    st.coverShots = 0;
    st.lastCoverTarget = brain.target || null;
  }

  let outPitch = wantPitch;
  let pitchAdjusted = false;

  // S-BLAST close-range mode threshold with subtle organic variation
  const sblastCloseDist = safeRange * (0.68 + breathWave * 0.025);
  const isSblastCloseMode = arch.combatJumpClose && dist < sblastCloseDist;

  // 1. Spacing & movement (爆風距離の維持・引き撃ち・追い撃ち・硬直明けイカステップ)
  if (dist < sweetMin) {
    // Too close: airburst would overshoot behind enemy -> backpedal + lateral strafe (引き撃ち)
    const backWeight = arch.kiteBackWeight;
    const strafeWeight = arch.kiteStrafeWeight;
    const mvx = -nx * backWeight - nz * side * strafeWeight;
    const mvz = -nz * backWeight + nx * side * strafeWeight;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);

    // S-BLAST '92/'91: jump-fire switches to short-range wide-blast mode when rushed
    if (
      isSblastCloseMode &&
      enemyVisible &&
      actor.grounded &&
      st.combatJumpCd <= 0 &&
      cooldown <= 0.08 &&
      !isNearWaterSafe(brain, actor, 1.6)
    ) {
      it.jump = true;
      st.combatJumpCd = 0.68 + 0.18 * (0.5 + 0.5 * breathWave);
    }
  } else if (dist > sweetMax) {
    // Out of optimal airburst zone: swim in on own ink when not firing (追い撃ち)
    if (onOwnInk && !postLocked && (!it.fire || cooldown > 0.06)) {
      it.squid = true;
    }
  } else {
    // Inside airburst sweet spot: archetype-calibrated lateral weave + gentle radial breathing
    const distErr = (dist - sweetPref) / Math.max(safeRange * 0.25, 1.0);
    const radial = Math.max(-0.35, Math.min(0.35, distErr * 0.4 + arch.pushBias));
    const sw = arch.sweetStrafeWeight;
    const mvx = nx * radial - nz * side * sw;
    const mvz = nz * radial + nx * side * sw;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 0.01) setMoveXZ(move, mvx / ml, mvz / ml);
  }

  // 2. Firing & between-shot squid step discipline
  if (enemyVisible) {
    const canEngage = (brain.react || 0) <= 0 && inkFrac > 0.04 && dist < blastReach;
    // Archetype-specific angular tolerance in airburst zone (narrow for S-BLAST long & Range, wide for Luna/Clash)
    const offTol = isSblastCloseMode && arch.closeBlastAimOffTol
      ? arch.closeBlastAimOffTol
      : arch.blastAimOffTol;
    const blastAimed = aimed || (dist >= sweetMin && dist < blastReach && off < offTol);

    if (postLocked) {
      it.fire = false;
      it.squid = false;
    } else if (cooldown > arch.combatSwimCdMin && arch.swimBetweenShots) {
      // Post-shot lock finished with ample cooldown (> emergeDelay): quick squid step only when repositioning out of sweet zone
      it.fire = false;
      if (onOwnInk && (dist < sweetMin || dist > sweetMax)) {
        it.squid = true;
      }
    } else if (canEngage && blastAimed) {
      it.fire = true;
      it.squid = false;
    } else if (dist >= blastReach) {
      it.fire = false;
    }

    // 3. Anti-ground-impact pitch discipline:
    // On flat ground within airburst zone, lift overly low pitch so the shell explodes mid-air (50-70 dmg)
    // instead of hitting the floor early (25-35 dmg). Never alters wantYaw (human aimError preserved).
    if (
      it.fire &&
      dist >= safeRange * 0.55 &&
      dist < blastReach &&
      idealPitch > -0.22 &&
      wantPitch < arch.minCombatAirburstPitch
    ) {
      outPitch = arch.minCombatAirburstPitch;
      pitchAdjusted = true;
    }

    // 4. Evasive jump-shot only under immediate fire at close/mid range (respecting grounded 0° accuracy otherwise)
    if (
      !arch.combatJumpClose &&
      arch.evadeJumpCd > 0 &&
      it.fire &&
      actor.grounded &&
      (actor.lastDamage ?? 9) < 0.25 &&
      st.combatJumpCd <= 0 &&
      dist < safeRange * 0.85 &&
      !isNearWaterSafe(brain, actor, 1.6)
    ) {
      it.jump = true;
      st.combatJumpCd = arch.evadeJumpCd * (0.9 + 0.2 * (0.5 + 0.5 * breathWave));
    }
  } else if (
    brain.target &&
    (brain.lostTimer || 0) > 0 &&
    (brain.lostTimer || 0) < arch.coverLostMax &&
    dist < blastReach &&
    inkFrac > arch.coverMinInk &&
    off < 0.22
  ) {
    // 5. Splash-around-cover ("障害物裏の角撃ち"): fire archetype-calibrated airburst shells at lastSeenPos
    if (postLocked) {
      it.fire = false;
      it.squid = false;
    } else if (cooldown > 0.05 && arch.swimBetweenShots) {
      it.fire = false;
      if (onOwnInk) it.squid = true;
    } else if (st.coverShots < arch.coverShotCap && cooldown <= EPS) {
      it.fire = true;
      it.squid = false;
      st.coverShots += 1;
      // S-BLAST uses short wide jump-blast for close cover corners, grounded long blast for far corners
      if (
        arch.combatJumpClose &&
        dist < safeRange * 0.72 &&
        actor.grounded &&
        st.combatJumpCd <= 0 &&
        !isNearWaterSafe(brain, actor, 1.6)
      ) {
        it.jump = true;
        st.combatJumpCd = 0.75;
      }
      // Keep cover-blast shells airborne so they detonate past the obstacle corner
      if (wantPitch < -0.04 && idealPitch > -0.22) {
        outPitch = -0.04;
        pitchAdjusted = true;
      }
    } else {
      it.fire = false;
    }
  }

  if (pitchAdjusted) {
    st._aimOut.wantYaw = wantYaw;
    st._aimOut.wantPitch = outPitch;
    return st._aimOut;
  }
  return null;
}
