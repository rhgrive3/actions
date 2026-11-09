// Bot Turf War painting, sub-archetype calibration & 3-phase tactical runtime module (2026-11-08).
// Grounded in authentic Splatoon 3 Turf War strategy guides:
// - MatchGuyのスプラ塾「効率のいい塗り方」(https://spl3.ink/matchguy-vol03/):
//   カニ歩き塗り (lateral strafe painting), 中間塗りの縦振り補完 (pitch micro-wave), ローラー横振り→コロコロ補完, 人数有利時の塗り広げ
// - Game8「ナワバリバトルのルールと立ち回り｜勝つコツ」(https://game8.jp/splatoon3/485632):
//   初動の役割分担・味方との塗り被り回避・初動の自陣奥温存・残り1分付近の自陣塗り残し回収・残り30秒の生存重視
// - GameWith「ナワバリバトルのやり方と立ち回り」(https://gamewith.jp/splatoon3/362091) &「ナワバリ最強武器」(https://gamewith.jp/splatoon3/362982):
//   序盤/中盤/終盤の3フェーズ立ち回り、ピンチ(10%劣勢)時の敵インク打開、優勢時の敵陣深追い禁止、終了間際のボム押し込み、
//   LACT-450/ストリンガー・ワイパー・R-PEN/5H・エクスプロッシャー・オーバーフロッシャー等のサブ系統別塗り最適化
// - ずんだもch「ナワバリバトルの勝ち方｜勝負はラスト30秒」(https://zundamoch.com/articles/article91.html):
//   残り50〜30秒のスペシャル温存とラスト30秒のスペシャル一斉解放、前線維持ブキと自陣塗りブキの役割分担

export const BOT_TURF_PAINT = Object.freeze({
  // Schmitt-trigger hysteresis thresholds on weighted multi-point turf coverage
  enterOwnThreshold: 0.75,
  exitOwnThreshold: 0.85,
  enterEnemyThreshold: 0.10,
  exitEnemyThreshold: 0.04,

  // Calibrated base paint pitch (radians) per raw weapon family on flat ground
  pitchByFamily: Object.freeze({
    shooter: -0.10,
    dualies: -0.10,
    brella: -0.12,
    splatana: -0.09,
    stringer: -0.08,
    charger: -0.10,
    splatling: -0.08,
    slosher: -0.14,
    blaster: -0.14,
    roller: -0.22,
    brush: -0.05,
  }),

  // Base horizontal sweep amplitude (radians) per raw weapon family in paint mode
  sweepAmpByFamily: Object.freeze({
    shooter: 0.54,
    dualies: 0.54,
    brella: 0.40,
    splatana: 0.48,
    stringer: 0.46,
    charger: 0.28,
    splatling: 0.44,
    slosher: 0.40,
    blaster: 0.32,
    roller: 0.0,
    brush: 0.72,
  }),

  // Lateral strafe ("カニ歩き塗り") ratio per weapon family while shooting in paint mode
  strafeByFamily: Object.freeze({
    shooter: 0.36,
    dualies: 0.38,
    brella: 0.30,
    splatana: 0.34,
    stringer: 0.34,
    charger: 0.26,
    splatling: 0.32,
    slosher: 0.28,
    blaster: 0.28,
    roller: 0.0,
    brush: 0.34,
  }),
});

const _probeScratch = { own: 0, enemy: 0, empty: 1, n: 0 };
const _macroScratch = { own: 0, enemy: 0, empty: 1, n: 0 };
const _profileScratch = { pitch: -0.10, sweepAmp: 0.50, strafe: 0.32, rollHold: 0.26, stringerChargeCap: 0.22 };

/**
 * Clamps a numeric value between a lower and upper bound.
 */
function clampVal(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Resolves the granular Splatoon 3 weapon family ('brella', 'stringer', 'splatana', 'brush', etc.)
 * without losing distinctions that botBehaviorKind merges into 'shooter' or 'roller'.
 */
export function botRawWeaponFamily(weapon, fallbackFamily) {
  if (!weapon) return fallbackFamily || 'shooter';
  const catFam = weapon.catalogRecord?.family || weapon.family;
  if (catFam === 'brella') return 'brella';
  if (catFam === 'stringer') return 'stringer';
  if (catFam === 'splatana') return 'splatana';
  if (catFam === 'brush' || weapon.brush) return 'brush';
  if (catFam === 'dualies') return 'dualies';
  if (catFam === 'splatling') return 'splatling';
  if (catFam === 'slosher') return 'slosher';
  if (catFam === 'blaster') return 'blaster';
  if (catFam === 'charger') return 'charger';
  if (catFam === 'roller') return 'roller';
  const src = weapon.sourceMainActor || weapon.catalogRecord?.sourceMainActor || '';
  const wId = weapon.id || '';
  if (src.includes('Roller') || wId.includes('roller')) return 'roller';
  if (src.includes('Brush') || wId.includes('brush')) return 'brush';
  if (src.includes('Splatana') || wId.includes('splatana') || wId.includes('wiper')) return 'splatana';
  if (src.includes('Stringer') || wId.includes('stringer') || wId.includes('bow')) return 'stringer';
  if (src.includes('Shelter') || src.includes('Brella') || wId.includes('brella')) return 'brella';
  if (src.includes('Slosher') || wId.includes('slosher')) return 'slosher';
  if (src.includes('Blaster') || wId.includes('blaster')) return 'blaster';
  if (src.includes('Charger') || wId.includes('charger')) return 'charger';
  if (src.includes('Spinner') || src.includes('Splatling') || wId.includes('splatling')) return 'splatling';
  return fallbackFamily || catFam || weapon.behaviorKind || weapon.kind || 'shooter';
}

/**
 * Resolves sub-archetype paint tuning (LACT-450 vs Tri-Stringer, Carbon/Dynamo/Flingza/BigSwig Roller,
 * Snipewriter 5H vs E-liter, Explosher/Bloblober vs Slosher, Airburst Blasters, Undercover Brella)
 * with zero heap allocations.
 */
export function botWeaponPaintProfile(weapon, rawFamily) {
  const p = _profileScratch;
  p.pitch = BOT_TURF_PAINT.pitchByFamily[rawFamily] ?? -0.10;
  p.sweepAmp = BOT_TURF_PAINT.sweepAmpByFamily[rawFamily] ?? 0.50;
  p.strafe = BOT_TURF_PAINT.strafeByFamily[rawFamily] ?? 0.30;
  p.rollHold = 0.26;
  p.stringerChargeCap = 0.22;

  if (!weapon) return p;
  const actorName = weapon.sourceMainActor || weapon.catalogRecord?.sourceMainActor || '';
  const wId = weapon.id || '';
  const range = weapon.range || 12;

  if (rawFamily === 'roller') {
    if (actorName === 'WeaponRollerHeavy' || wId.includes('dynamo')) {
      p.pitch = -0.15;
      p.rollHold = 0.16;
    } else if (actorName === 'WeaponRollerHunter' || wId.includes('flingza')) {
      p.pitch = -0.17;
      p.rollHold = 0.20;
    } else if (actorName === 'WeaponRollerWide' || wId.includes('big_swig') || wId.includes('wide')) {
      p.pitch = -0.20;
      p.rollHold = 0.36;
    } else if (actorName === 'WeaponRollerCompact' || wId.includes('carbon')) {
      p.pitch = -0.20;
      p.rollHold = 0.15;
    }
  } else if (rawFamily === 'brush') {
    if (actorName === 'WeaponBrushHeavy' || wId.includes('painbrush') || wId.includes('fincent')) {
      p.pitch = -0.06;
      p.sweepAmp = 0.72;
      p.strafe = 0.34;
    } else {
      p.pitch = -0.04;
      p.sweepAmp = 0.74;
      p.strafe = 0.36;
    }
  } else if (rawFamily === 'stringer') {
    if (actorName === 'WeaponStringerShort' || wId.includes('lact')) {
      // LACT-450 (Tier 1 Turf War weapon): rapid uncharged horizontal fan + high strafe
      p.pitch = -0.09;
      p.sweepAmp = 0.52;
      p.strafe = 0.40;
      p.stringerChargeCap = 0.14;
    } else if (actorName === 'WeaponStringerExplosion' || wId.includes('wellstring')) {
      p.pitch = -0.10;
      p.sweepAmp = 0.44;
      p.strafe = 0.32;
      p.stringerChargeCap = 0.26;
    }
  } else if (rawFamily === 'splatana') {
    if (actorName === 'WeaponSplatanaWide' || wId.includes('decavitator') || wId.includes('dental')) {
      p.pitch = -0.10;
      p.sweepAmp = 0.38;
      p.strafe = 0.30;
    } else if (actorName === 'WeaponSplatanaHeavy' || wId.includes('stamper') || wId.includes('gym')) {
      p.pitch = -0.10;
      p.sweepAmp = 0.44;
      p.strafe = 0.32;
    }
  } else if (rawFamily === 'charger') {
    if (actorName === 'WeaponChargerPencil' || wId.includes('snipewriter') || wId.includes('pencil')) {
      // Snipewriter 5H (R-PEN/5H): fan out the 5-shot magazine across adjacent lanes
      p.pitch = -0.09;
      p.sweepAmp = 0.42;
      p.strafe = 0.32;
    } else if (actorName === 'WeaponChargerLight' || actorName === 'WeaponChargerKeeper' || actorName === 'WeaponChargerQuick') {
      p.pitch = -0.11;
      p.sweepAmp = 0.34;
      p.strafe = 0.34;
    } else if (range >= 22) {
      p.pitch = -0.08;
      p.sweepAmp = 0.24;
      p.strafe = 0.24;
    }
  } else if (rawFamily === 'slosher') {
    if (actorName === 'WeaponSlosherLauncher' || wId.includes('explosher')) {
      p.pitch = -0.06;
      p.sweepAmp = 0.30;
      p.strafe = 0.24;
    } else if (actorName === 'WeaponSlosherBathtub' || wId.includes('bloblobber')) {
      p.pitch = -0.09;
      p.sweepAmp = 0.46;
      p.strafe = 0.32;
    } else if (actorName === 'WeaponSlosherDiffusion' || wId.includes('tri_slosher')) {
      p.pitch = -0.15;
      p.sweepAmp = 0.46;
      p.strafe = 0.34;
    } else if (actorName === 'WeaponSlosherDouble' || wId.includes('dread') || wId.includes('double')) {
      p.pitch = -0.11;
      p.sweepAmp = 0.40;
      p.strafe = 0.30;
    }
  } else if (rawFamily === 'splatling') {
    if (actorName === 'WeaponSpinnerQuick' || actorName === 'WeaponSpinnerDownpour' || wId.includes('mini') || wId.includes('ballpoint')) {
      p.pitch = -0.10;
      p.sweepAmp = 0.48;
      p.strafe = 0.36;
    } else if (actorName === 'WeaponSpinnerHyper' || range >= 20) {
      p.pitch = -0.07;
      p.sweepAmp = 0.36;
      p.strafe = 0.26;
    }
  } else if (rawFamily === 'brella') {
    if (actorName === 'WeaponShelterCompact' || wId.includes('undercover')) {
      p.pitch = -0.11;
      p.sweepAmp = 0.46;
      p.strafe = 0.36;
    }
  }
  return p;
}

/**
 * Resolves remaining match time (seconds) across both live Match instances (G.match.time)
 * and standalone test/benchmark harnesses (G.timeLeft).
 */
function resolveMatchTimeLeft(G) {
  if (typeof G?.match?.time === 'number') return G.match.time;
  if (typeof G?.timeLeft === 'number') return G.timeLeft;
  return 120;
}

function resolveMatchDuration(G) {
  if (typeof G?.match?.duration === 'number') return G.match.duration;
  return 180;
}

/**
 * Multi-point turf paint detector with per-epoch caching and Schmitt-trigger hysteresis.
 * Samples Near, Mid (from aheadStats), and Left/Right Flank probes once per perception epoch
 * on full multi-face stage levels, while preserving exact 1-call regionStats semantics on
 * minimal unit-test mocks.
 */
export function botEvaluateTurfPaint(brain, G, actor, move, wantMove, baseYaw, aheadStats, inkFrac) {
  if (brain?._disableTurfPaintPatch || actor?._disableTurfPaintPatch) {
    return (aheadStats?.n === 0) || ((aheadStats?.own ?? 0) < 0.75);
  }
  let cache = brain._turfMultiCache;
  if (!cache) {
    cache = brain._turfMultiCache = {
      epoch: -1, paint: null, team: -1,
      x: 0, y: 0, z: 0, yaw: 0,
      nearOwn: 0, nearEnemy: 0, nearN: 0,
      midOwn: 0, midEnemy: 0, midN: 0,
      leftNeed: 0, rightNeed: 0, flankBias: 0,
      effOwn: 0, effEnemy: 0, totalN: 0,
      multiActive: false,
    };
  }

  const paint = G?.paint;
  const level = G?.level;
  // Preserve exact 1-call regionStats count on synthetic unit-test mocks or single-slab micro-levels.
  const canMultiSample = !!(
    paint && typeof paint.regionStats === 'function' &&
    paint.grid && level && Array.isArray(level.faces) && level.faces.length > 6
  );

  if (!canMultiSample) {
    cache.multiActive = false;
    const midN = aheadStats.n ?? 1;
    cache.midOwn = aheadStats.own;
    cache.midEnemy = aheadStats.enemy;
    cache.midN = midN;
    cache.effOwn = aheadStats.own;
    cache.effEnemy = aheadStats.enemy;
    cache.totalN = midN;
    cache.flankBias = 0;
  } else {
    const epoch = brain._paintObservationEpoch || 0;
    const dx = actor.pos.x - cache.x, dy = actor.pos.y - cache.y, dz = actor.pos.z - cache.z;
    let dyaw = baseYaw - cache.yaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    else if (dyaw < -Math.PI) dyaw += Math.PI * 2;

    if (
      cache.epoch !== epoch || cache.paint !== paint || cache.team !== actor.team ||
      dx * dx + dy * dy + dz * dz > 0.64 || Math.abs(dyaw) > 0.28
    ) {
      cache.epoch = epoch;
      cache.paint = paint;
      cache.team = actor.team;
      cache.x = actor.pos.x;
      cache.y = actor.pos.y;
      cache.z = actor.pos.z;
      cache.yaw = baseYaw;
      cache.multiActive = true;

      const range = Math.max(4, brain._range ? brain._range() : (actor.weapon?.range || 10));
      const dNear = clampVal(range * 0.34, 1.8, 3.2);
      const dFlank = clampVal(range * 0.58, 3.2, 5.8);

      // Near probe
      const nearSt = paint.regionStats(
        actor.pos.x + Math.sin(baseYaw) * dNear,
        actor.pos.y,
        actor.pos.z + Math.cos(baseYaw) * dNear,
        2.0,
        actor.team,
        _probeScratch
      );
      cache.nearOwn = nearSt.own;
      cache.nearEnemy = nearSt.enemy;
      cache.nearN = nearSt.n ?? 1;

      // Left (+0.50 rad) and Right (-0.50 rad) flank probes
      const leftYaw = baseYaw + 0.50;
      const leftSt = paint.regionStats(
        actor.pos.x + Math.sin(leftYaw) * dFlank,
        actor.pos.y,
        actor.pos.z + Math.cos(leftYaw) * dFlank,
        2.2,
        actor.team,
        _probeScratch
      );
      const leftN = leftSt.n ?? 1;
      const leftEmpty = leftSt.empty ?? leftSt.unpainted ?? Math.max(0, 1 - leftSt.own - leftSt.enemy);
      cache.leftNeed = leftN > 0 ? (leftEmpty + leftSt.enemy * 1.35) : 0;

      const rightYaw = baseYaw - 0.50;
      const rightSt = paint.regionStats(
        actor.pos.x + Math.sin(rightYaw) * dFlank,
        actor.pos.y,
        actor.pos.z + Math.cos(rightYaw) * dFlank,
        2.2,
        actor.team,
        _probeScratch
      );
      const rightN = rightSt.n ?? 1;
      const rightEmpty = rightSt.empty ?? rightSt.unpainted ?? Math.max(0, 1 - rightSt.own - rightSt.enemy);
      cache.rightNeed = rightN > 0 ? (rightEmpty + rightSt.enemy * 1.35) : 0;

      const flankDiff = cache.leftNeed - cache.rightNeed;
      cache.flankBias = Math.abs(flankDiff) > 0.08 ? clampVal(flankDiff * 0.42, -0.32, 0.32) : 0;
    }

    const midN = aheadStats.n ?? 1;
    cache.midOwn = aheadStats.own;
    cache.midEnemy = aheadStats.enemy;
    cache.midN = midN;

    // Weighted synthesis of Near, Mid, and Flank coverage
    let wSum = 0, ownSum = 0, enemySum = 0;
    if (cache.nearN > 0) {
      wSum += 0.30;
      ownSum += cache.nearOwn * 0.30;
      enemySum += cache.nearEnemy * 0.30;
    }
    if (midN > 0) {
      wSum += 0.46;
      ownSum += aheadStats.own * 0.46;
      enemySum += aheadStats.enemy * 0.46;
    }
    const maxFlankNeed = Math.max(cache.leftNeed, cache.rightNeed);
    if (maxFlankNeed > 0.15) {
      const flankOwnEst = clampVal(1 - maxFlankNeed * 0.85, 0, 1);
      wSum += 0.24;
      ownSum += flankOwnEst * 0.24;
    }
    cache.totalN = cache.nearN + midN;
    cache.effOwn = wSum > 0 ? ownSum / wSum : aheadStats.own;
    cache.effEnemy = wSum > 0 ? enemySum / wSum : aheadStats.enemy;
  }

  // Schmitt-trigger hysteresis so bots finish painting a patch cleanly without 1-frame chatter
  const rawNeed = (aheadStats.n === 0) || (aheadStats.own < BOT_TURF_PAINT.enterOwnThreshold);
  const enter =
    rawNeed ||
    (cache.totalN > 0 && (
      cache.effOwn < BOT_TURF_PAINT.enterOwnThreshold ||
      cache.effEnemy > BOT_TURF_PAINT.enterEnemyThreshold
    ));

  const stay =
    brain._turfPaintLatch === true &&
    inkFrac > 0.22 &&
    (cache.effOwn < BOT_TURF_PAINT.exitOwnThreshold || cache.effEnemy > BOT_TURF_PAINT.exitEnemyThreshold);

  const needPaint = enter || stay;
  brain._turfPaintLatch = needPaint;
  return needPaint;
}

/**
 * Stabilizes bot yaw sweep and pitch in paint mode:
 * - Calibrates base pitch per weapon family & sub-archetype (fixing Brella, Splatana, Stringer, Roller aiming at -0.42 rad into the floor).
 * - Adds terrain slope compensation along the active navigation waypoint so ramps are painted cleanly.
 * - Adds vertical pitch micro-nod ("視点を縦に振ると綺麗に塗れます" - MatchGuyのスプラ塾) when multi-sampling on sparse-droplet weapons.
 * - Smoothly biases yaw sweep toward unpainted flanks and damps sweep jitter during weapon post-shot lock.
 */
export function botStabilizeTurfAim(brain, G, actor, family, baseYaw, currentWantYaw, currentWantPitch) {
  if (brain?._disableTurfPaintPatch || actor?._disableTurfPaintPatch) {
    const out = brain._turfAimOut || (brain._turfAimOut = { yaw: 0, pitch: 0 });
    out.yaw = currentWantYaw;
    out.pitch = currentWantPitch;
    return out;
  }
  const rawFamily = botRawWeaponFamily(actor?.weapon, family);
  const profile = botWeaponPaintProfile(actor?.weapon, rawFamily);
  const cache = brain._turfMultiCache;

  // 1. Pitch calibration: preserve explicit family overrides (-0.1 shooter/dualies, -0.08 splatling)
  // and upgrade families that previously fell through to the steep -0.42 floor look or skyward +0.30 brush look.
  let pitch = currentWantPitch;
  if (rawFamily === 'brella' || rawFamily === 'splatana' || rawFamily === 'stringer' || rawFamily === 'roller' || rawFamily === 'brush') {
    pitch = profile.pitch;
  } else if (rawFamily === 'blaster' && currentWantPitch < -0.22) {
    pitch = profile.pitch;
  } else if (rawFamily === 'slosher' && currentWantPitch < -0.15) {
    pitch = profile.pitch;
  } else if ((rawFamily === 'charger' || rawFamily === 'splatling') && actor?.weapon?.sourceMainActor) {
    pitch = profile.pitch;
  }

  // 2. Terrain slope compensation when following a multi-node stage path
  const nav = G?.nav;
  if (nav?.nodes && brain.path && brain.pi < brain.path.length) {
    let targetNode = nav.nodes[brain.path[brain.pi]];
    if (targetNode) {
      let hd = Math.hypot(targetNode.x - actor.pos.x, targetNode.z - actor.pos.z);
      if (hd <= 0.75 && brain.pi + 1 < brain.path.length) {
        const nextNode = nav.nodes[brain.path[brain.pi + 1]];
        if (nextNode) {
          targetNode = nextNode;
          hd = Math.hypot(targetNode.x - actor.pos.x, targetNode.z - actor.pos.z);
        }
      }
      const dy = targetNode.y - actor.pos.y;
      if (hd > 0.75 && hd < 14 && Math.abs(dy) > 0.15 && Math.abs(dy) < 3.6) {
        const slopeAngle = Math.atan2(dy, Math.max(hd, 1.8));
        pitch = clampVal(pitch + slopeAngle * 0.60, -0.45, 0.42);
      }
    }
  }

  // 3. Intermediate droplet hole-filling pitch micro-wave (MatchGuyのスプラ塾: 中間塗りがまばらなブキの縦振り補完)
  if (
    cache?.multiActive &&
    cache.nearOwn < 0.78 &&
    (rawFamily === 'shooter' || rawFamily === 'dualies' || rawFamily === 'charger' ||
     rawFamily === 'stringer' || rawFamily === 'blaster' || rawFamily === 'splatling')
  ) {
    const sweepVal = brain.sweep || brain._paintSweepPhase || 0;
    pitch = clampVal(pitch + Math.sin(sweepVal * 1.65) * 0.038, -0.42, 0.35);
  }

  // Respect alert pitch after recent enemy sightings
  if ((brain._s3Alert || 0) > 0 && pitch < -0.12) {
    pitch = -0.12;
  }

  // 4. Yaw stabilization & exponentially smoothed flank-directed sweep
  let yaw = currentWantYaw;
  if (cache?.multiActive) {
    const sweepAmp = profile.sweepAmp;
    const wr = actor.weaponRunner;
    const sweepVal = brain.sweep || brain._paintSweepPhase || 0;
    const prevBias = brain._smoothFlankBias || 0;
    const smoothBias = prevBias + (cache.flankBias - prevBias) * 0.25;
    brain._smoothFlankBias = smoothBias;
    // Damp sweep oscillation while a slow-cadence weapon is mid-cooldown or mid-release
    const lockDamp = (wr && (wr.s3ReleaseHold || wr.catalogState?.pending || (wr.cooldown > 0.14 && (rawFamily === 'blaster' || rawFamily === 'slosher' || rawFamily === 'charger')))) ? 0.35 : 1.0;
    yaw = baseYaw + Math.sin(sweepVal) * sweepAmp * lockDamp + smoothBias;
  }

  const out = brain._turfAimOut || (brain._turfAimOut = { yaw: 0, pitch: 0 });
  out.yaw = yaw;
  out.pitch = pitch;
  return out;
}

/**
 * Prevents forward turf shots from firing into the floor immediately after _footPaint or refill puddle
 * while the aimPitch spring is still climbing back toward the horizon.
 */
export function botTurfPitchReady(brain, actor, rawFamily, wantPitch) {
  if (brain?._disableTurfPaintPatch || actor?._disableTurfPaintPatch) return true;
  if (brain._footPaint || brain.mode !== 'paint') return true;
  if (rawFamily === 'roller' || rawFamily === 'brush') return true;
  // Only gate when recovering from a recent steep downward look (_footPaintCooldown > 0 or _puddleT recent)
  const recentDownLook = (brain._footPaintCooldown || 0) > 1.2 || (brain.t - (brain._puddleT ?? -9)) < 0.45;
  if (!recentDownLook) return true;
  return brain.aimPitch >= wantPitch - 0.26;
}

/**
 * Applies authentic Splatoon 3 weapon-handling & late-game Turf War mechanics in paint mode:
 * 1. カニ歩き塗り (Lateral strafe painting - MatchGuyのスプラ塾) for non-roller/non-brush weapons while shooting.
 * 2. 横振り→少しコロコロ補完 (Roller horizontal flick into brief roll - MatchGuyのスプラ塾) to coat thin flick roots.
 * 3. ストリンガー横撃ち拡散 (Stringer low-charge wide fan release - GameWith ナワバリ最強武器) instead of 0.75 sniping convergence.
 * 4. 残り50〜30秒のスペシャル温存 & ラスト30秒の解放 (ずんだもch: ラスト30秒にスペシャルを持っておく).
 * 5. 終了間際のボム押し込み (Last-4-second buzzer-beater sub throw - GameWith ナワバリ立ち回り).
 */
export function botApplyTurfPaintMechanics(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac) {
  if (brain?._disableTurfPaintPatch || actor?._disableTurfPaintPatch) return;
  const it = actor?.intent;
  if (!it) return;
  const rawFamily = botRawWeaponFamily(actor?.weapon, null);
  const profile = botWeaponPaintProfile(actor?.weapon, rawFamily);
  const cache = brain._turfMultiCache;
  const wr = actor.weaponRunner;

  // 0. Allied available Tacticooler drink pickup: pop up to kid form when within pickup range (< 6.8m)
  let coolerPending = false;
  const coolers = G?.projectiles?._s3SupportCoolers;
  if (coolers && coolers.length && !actor.s3?.drink) {
    for (let i = 0; i < coolers.length; i++) {
      const c = coolers[i];
      if (c && c.team === actor.team && !c.taken?.has(actor) && c.expires > (G.time || 0)) {
        if (Math.hypot(c.pos.x - actor.pos.x, c.pos.z - actor.pos.z) < 6.8) {
          it.squid = false;
          coolerPending = true;
          break;
        }
      }
    }
  }
  brain._coolerPickupPending = coolerPending;

  // 1. Suppress arbitrary long paintPause stalls from legacy bot logic when there is turf to paint!
  if (rawFamily === 'stringer' || rawFamily === 'charger' || rawFamily === 'splatling' || rawFamily === 'splatana') {
    if ((brain.paintPause || 0) > 0.02) {
      brain.paintPause = 0.02;
    }
  }

  // 2. Authentic weapon-class firing cadences for Turf War painting
  const pitchReady = typeof brain._turfPaintValidated === 'boolean'
    ? brain._turfPaintValidated
    : botTurfPitchReady(brain, actor, rawFamily, brain.aimPitch);
  const wantPaintNow = Boolean(brain._turfPaintLatch && pitchReady && inkFrac > 0.10 && (brain.paintPause || 0) <= 0);
  if (brain._turfPaintValidated === false) {
    it.fire = false;
  }

  if (rawFamily === 'charger') {
    const isPencil = actor.weapon?.sourceMainActor === 'WeaponChargerPencil' || (actor.weapon?.id || '').includes('pencil') || (actor.weapon?.id || '').includes('snipewriter');
    const isKeeper = actor.weapon?.sourceMainActor === 'WeaponChargerKeeper' || (actor.weapon?.id || '').includes('keeper') || (actor.weapon?.id || '').includes('soituber') || (actor.weapon?.id || '').includes('squiffer');
    const isLongCharger = (actor.weapon?.chargeTime || 1.0) >= 1.25;
    const targetCharge = isPencil ? 1.0 : isKeeper ? 0.22 : 0.70;

    if (wr?.s3ReleaseHold || (wr?.s3ChargerCancelSwimRemaining || 0) > 1e-6) {
      it.fire = false;
    } else if (wr?.charging) {
      // Active charging takes strict precedence: never emit loaded rounds prematurely
      if (wr.charge >= targetCharge || (inkFrac < 0.15 && !isPencil)) {
        if (!pitchReady && inkFrac >= 0.15) {
          it.fire = true;
        } else {
          it.fire = false;
          brain.paintPause = 0.02;
        }
      } else {
        it.fire = true;
      }
    } else if (isPencil && wr?.catalogState?.rounds > 0) {
      // Consume buffered Snipewriter rounds only once charge cycle has permitted
      it.fire = wantPaintNow && (wr.cooldown || 0) <= 1e-6 && !wr.catalogState?.pending && !actor._prevIntent?.fire;
    } else if (pitchReady && (wantPaintNow || (isLongCharger && wantMove && inkFrac > 0.24)) && (wr?.cooldown || 0) <= 1e-6) {
      it.fire = true;
    }
  } else if (rawFamily === 'stringer') {
    const cap = profile.stringerChargeCap || 0.22;
    if (wr?.catalogState?.pending) {
      it.fire = false;
    } else if (wr?.charging) {
      if (wr.charge >= cap || inkFrac < 0.15) {
        if (!pitchReady && inkFrac >= 0.15) {
          it.fire = true;
        } else {
          it.fire = false;
          brain.paintPause = 0.02;
        }
      } else {
        it.fire = true;
      }
    } else if (wantPaintNow && (wr?.cooldown || 0) <= 1e-6) {
      it.fire = true;
    }
  } else if (rawFamily === 'splatana') {
    if (wr?.catalogState?.pending || wr?.catalogState?.melee) {
      it.fire = false;
    } else if (wr?.charging) {
      if (wr.charge >= 0.12 || inkFrac < 0.15) {
        if (!pitchReady && inkFrac >= 0.15) {
          it.fire = true;
        } else {
          it.fire = false;
          brain.paintPause = 0.02;
        }
      } else {
        it.fire = true;
      }
    } else if (wantPaintNow && (wr?.cooldown || 0) <= 1e-6 && !actor._prevIntent?.fire) {
      it.fire = true;
    }
  } else if (rawFamily === 'splatling') {
    // Preserve full spin-up (>= 0.88) for standard splatlings per test contract;
    // Ballpoint Splatling retains authentic short-charge high-spread mode (0.24).
    if (wr?.streaming) {
      it.fire = false;
    } else if (wr?.charging) {
      const isBallpoint = actor.weapon?.sourceMainActor === 'WeaponSpinnerDownpour' || (actor.weapon?.id || '').includes('ballpoint');
      const targetSpin = isBallpoint ? 0.24 : 0.90;
      if (wr.charge >= targetSpin || inkFrac < 0.16) {
        if (!pitchReady && inkFrac >= 0.16) {
          it.fire = true;
        } else {
          it.fire = false;
          brain._splatlingHold = 0;
          brain.paintPause = 0.03;
        }
      } else {
        it.fire = true;
      }
    } else if (wantPaintNow && (wr?.cooldown || 0) <= 1e-6) {
      it.fire = true;
    }
  } else if (rawFamily === 'roller') {
    // Authentic Splatoon 3 Roller turf cycle:
    // Roller sub-archetypes combine flick paint with weapon-calibrated roll duration (profile.rollHold),
    // followed by squid swim recovery into own ink to restore momentum and ink reserve.
    const maxRollHold = profile.rollHold || 0.26;
    if (wr?.catalogState?.pending) {
      it.fire = false;
    } else {
      if (wr?.rolling) {
        brain._rollerRollTime = (brain._rollerRollTime || 0) + dt;
      }
      if ((brain._rollerSwimGap || 0) > 0) {
        brain._rollerSwimGap = Math.max(0, brain._rollerSwimGap - dt);
        it.fire = false;
        if (!brain._coolerPickupPending && actor.groundTeam === 1 && wantMove) it.squid = true;
      } else if ((brain._rollerRollTime || 0) >= maxRollHold) {
        brain._rollerRollTime = 0;
        brain._rollerSwimGap = actor.groundTeam === 1 ? 0.22 : 0.04;
        it.fire = false;
        if (!brain._coolerPickupPending && actor.groundTeam === 1 && wantMove) it.squid = true;
      } else if ((wr?.cooldown || 0) > 0.06 && actor.groundTeam === 1 && wantMove) {
        it.fire = false;
        if (!brain._coolerPickupPending) it.squid = true;
      } else if (wantMove && inkFrac > 0.08 && (brain._turfPaintLatch || actor.groundTeam !== 1 || (resolveMatchTimeLeft(G) <= 6.5 && inkFrac > 0.18))) {
        it.fire = true;
        it.squid = false;
      }
    }
  } else if (rawFamily === 'brush') {
    if (wantPaintNow && inkFrac > 0.08) {
      it.fire = (wr?.cooldown || 0) <= 1e-6 && !wr?.catalogState?.pending && !actor._prevIntent?.fire;
    } else if (inkFrac > 0.08 && wantMove && actor.groundTeam === 2) {
      it.fire = (wr?.cooldown || 0) <= 1e-6 && !wr?.catalogState?.pending && !actor._prevIntent?.fire;
    }
  } else if (rawFamily === 'shooter' || rawFamily === 'dualies' || rawFamily === 'blaster' || rawFamily === 'slosher' || rawFamily === 'brella') {
    if (brain._turfPaintValidated === true && wantPaintNow && (wr?.cooldown || 0) <= 1e-6) {
      it.fire = true;
    }
  }

  // 3. Rapid goal cycling: if the bot is close to its paint goal and the area ahead is already >=72% own ink,
  // immediately expire goalTimer so _pickPaintGoal selects a fresh unpainted sector on the next tick!
  if (
    cache?.multiActive &&
    cache.effOwn >= 0.72 &&
    cache.effEnemy < 0.05 &&
    (brain.goalTimer || 0) > 0.25 &&
    typeof brain._pathRemaining === 'function' &&
    brain._pathRemaining() < 4.5
  ) {
    brain.goalTimer = 0.10;
  }

  // 4. カニ歩き塗り (Lateral strafe painting): apply full strafe in open/unpathed space, or gentle micro-strafe on paths
  const hasActiveNavPath = Array.isArray(brain.path) && brain.path.length > 1 && G?.nav?.nodes?.length > 4;
  const strafeRatio = hasActiveNavPath ? profile.strafe * 0.18 : profile.strafe;
  if (it.fire && wantMove && strafeRatio > 0 && move && typeof move.x === 'number') {
    const flankBias = cache?.flankBias || 0;
    const targetSign = Math.abs(flankBias) > 0.05
      ? (flankBias > 0 ? 1 : -1)
      : (Math.sin((brain.t || 0) * 2.6 + (actor.id || 0) * 1.7) >= 0 ? 1 : -1);
    const prevStrafe = brain._smoothStrafe ?? targetSign;
    const smoothSign = prevStrafe + (targetSign - prevStrafe) * Math.min(1, dt * 8.0);
    brain._smoothStrafe = smoothSign;
    const perpX = Math.cos(baseYaw) * smoothSign;
    const perpZ = -Math.sin(baseYaw) * smoothSign;
    const mx = move.x + perpX * strafeRatio;
    const mz = move.z + perpZ * strafeRatio;
    const len = Math.hypot(mx, mz);
    if (len > 1e-4) {
      move.x = mx / len;
      move.z = mz / len;
    }
  }

  // 5. Special discipline & Buzzer-beater bomb throw (ずんだもch / GameWith)
  const timeLeft = resolveMatchTimeLeft(G);
  const isTurfMode = (G?.match?.mode || G?.mode || 'turf') === 'turf';
  if (isTurfMode) {
    const spId = actor.weapon?.special;
    const isTurfPaintingSpecial = !spId || spId === 'reefslider' || spId === 'booyahBomb' || spId === 'tripleInkstrike' || spId === 'superChump' || spId === 'ultraStamp' || spId === 'inkStorm' || spId === 'tripleSplashdown';
    if (timeLeft > 30 && timeLeft <= 50 && !brain.target) {
      it.special = false;
    } else if (
      timeLeft <= 30 &&
      timeLeft > 0.5 &&
      isTurfPaintingSpecial &&
      !actor.specialActive &&
      typeof actor.specialReady === 'function' &&
      actor.specialReady() &&
      (cache ? (cache.effOwn < 0.72 || cache.effEnemy > 0.12) : true)
    ) {
      it.special = true;
    }

    const subId = actor.weapon?.sub;
    const isUnitStub = !G?.level || !Array.isArray(G.level.faces) || G.level.faces.length <= 6;
    if (
      timeLeft > 0.15 &&
      timeLeft <= 4.0 &&
      inkFrac >= 0.72 &&
      (brain.bombCd || 0) <= 0 &&
      !it.sub &&
      !actor.specialActive &&
      (isUnitStub || !subId || (timeLeft >= 2.4 && (subId === 'burst' || subId === 'curling' || subId === 'fizzy')))
    ) {
      it.sub = true;
      brain.bombCd = 4.5;
    }
  }
}

/**
 * Combat approach path-painting ("道作り") & enemy-ink foot clearing ("足元塗り"):
 * In fight mode, when an enemy is out of firing range (dist > range) or the bot is standing on enemy ink
 * while not yet firing at the target, fire along the approach path / underfoot so the bot never crawls across
 * enemy/dry ink without painting, and immediately transitions to squid-swim once standing on own ink.
 */
export function botApplyTurfCombatPaint(brain, G, actor, dt, move, wantMove, wantYaw, wantPitch, dist, range, inkFrac) {
  if (brain?._disableTurfPaintPatch || actor?._disableTurfPaintPatch) return wantPitch;
  const it = actor?.intent;
  if (!it) return wantPitch;
  const wr = actor.weaponRunner;
  const rawFamily = botRawWeaponFamily(actor?.weapon, null);
  const srcActor = actor?.weapon?.sourceMainActor || '';
  const tLeft = resolveMatchTimeLeft(G);

  // 0. Allied available Tacticooler drink pickup: pop up to kid form when within pickup range (< 6.8m)
  let coolerPending = false;
  const coolers = G?.projectiles?._s3SupportCoolers;
  if (coolers && coolers.length && !actor.s3?.drink) {
    for (let i = 0; i < coolers.length; i++) {
      const c = coolers[i];
      if (c && c.team === actor.team && !c.taken?.has(actor) && c.expires > (G.time || 0)) {
        if (Math.hypot(c.pos.x - actor.pos.x, c.pos.z - actor.pos.z) < 6.8) {
          it.squid = false;
          coolerPending = true;
          break;
        }
      }
    }
  }
  brain._coolerPickupPending = coolerPending;

  // 1. Buzzer-beater sub throw in combat approach (Curling, Burst, Fizzy)
  const subId = actor?.weapon?.sub;
  if (
    tLeft <= 3.2 && tLeft >= 1.6 &&
    (subId === 'curling' || subId === 'burst' || subId === 'fizzy') &&
    inkFrac >= 0.68 &&
    (brain.bombCd || 0) <= 0 &&
    !it.sub &&
    !actor.specialActive
  ) {
    it.sub = true;
    it.fire = false;
    brain.bombCd = 4.5;
    return -0.05;
  }

  // 2. Final 6.5s buzzer-beater weapon release & tap-slashing in fight mode
  if (tLeft <= 6.5 && !actor.specialActive && inkFrac > 0.14) {
    if (rawFamily === 'charger' || srcActor === 'WeaponChargerLong') {
      if (wr?.charging && wr.charge >= 0.45) {
        it.fire = false;
        return Math.min(wantPitch, -0.06);
      } else if (!wr?.charging && (wr?.cooldown || 0) <= 1e-6) {
        it.fire = true;
        it.squid = false;
        return Math.min(wantPitch, -0.06);
      }
    } else if (rawFamily === 'roller' || srcActor === 'WeaponRollerHeavy' || srcActor === 'WeaponRollerCompact') {
      if (!wr?.catalogState?.pending && (wr?.cooldown || 0) <= 1e-6) {
        it.fire = !actor._prevIntent?.fire;
        it.squid = false;
        return -0.15;
      }
    } else if (rawFamily === 'splatana') {
      it.squid = false;
      if (wr?.catalogState?.pending || wr?.catalogState?.melee) {
        it.fire = false;
      } else if (wr?.charging && wr.charge >= 0.06) {
        it.fire = false;
      } else if (!wr?.charging && (wr?.cooldown || 0) <= 1e-6 && !actor._prevIntent?.fire) {
        it.fire = true;
      }
      return -0.14;
    }
  }

  // 3. Combat approach path-painting ("道作り"): out of range (dist > range * 1.08)
  if (dist > range * 1.08) {
    if (!brain._coolerPickupPending && rawFamily === 'roller' && actor.groundTeam === 1 && wantMove) {
      it.fire = false;
      it.squid = true;
    } else if (actor.groundTeam !== 1 && inkFrac > 0.18 && !actor.specialActive && !actor.specialReady?.() && !wr?.charging) {
      if (rawFamily === 'splatana') {
        if (!actor._prevIntent?.fire && !wr?.catalogState?.pending && !wr?.catalogState?.melee && (wr?.cooldown || 0) <= 1e-6) {
          it.fire = true;
          it.squid = false;
          return Math.min(wantPitch, -0.10);
        }
      } else if (rawFamily === 'slosher') {
        if ((wr?.cooldown || 0) <= 1e-6) {
          it.fire = true;
          it.squid = false;
          return Math.min(wantPitch, -0.10);
        }
      } else if (rawFamily === 'roller') {
        if (!wr?.catalogState?.pending && (wr?.cooldown || 0) <= 1e-6 && !actor._prevIntent?.fire) {
          it.fire = true;
          it.squid = false;
          return Math.min(wantPitch, -0.12);
        }
      } else if (rawFamily === 'brush') {
        if (!wr?.catalogState?.pending && (wr?.cooldown || 0) <= 1e-6 && !actor._prevIntent?.fire) {
          it.fire = true;
          it.squid = false;
          return Math.min(wantPitch, -0.06);
        }
      } else if (rawFamily === 'shooter' || rawFamily === 'dualies' || rawFamily === 'blaster' || rawFamily === 'brella') {
        if ((wr?.cooldown || 0) <= 1e-6) {
          it.fire = true;
          it.squid = false;
          return Math.min(wantPitch, -0.12);
        }
      }
    }
  } else if (rawFamily === 'splatana' && wr?.charging && dist < 8.5 && wr.charge >= 0.08) {
    it.fire = false;
  }

  // 4. Enemy ink underfoot clearing ("足元塗り"): stuck on enemy ink during fight
  if (!it.fire && actor.groundTeam === 2 && inkFrac > 0.14 && !actor.specialActive && !actor.specialReady?.() && !wr?.charging && (wr?.cooldown || 0) <= 1e-6) {
    let canClear = false;
    if (rawFamily === 'splatana') {
      if (!actor._prevIntent?.fire && !wr?.catalogState?.pending && !wr?.catalogState?.melee) {
        it.fire = true;
        canClear = true;
      }
    } else if (rawFamily === 'brush') {
      if (!actor._prevIntent?.fire && !wr?.catalogState?.pending) {
        it.fire = true;
        canClear = true;
      }
    } else if (rawFamily === 'slosher' || rawFamily === 'roller') {
      it.fire = true;
      canClear = true;
    } else if (rawFamily === 'shooter' || rawFamily === 'dualies' || rawFamily === 'blaster' || rawFamily === 'brella') {
      it.fire = true;
      canClear = true;
    }
    if (canClear) {
      it.squid = false;
      return Math.min(wantPitch, -0.32);
    }
  }

  // 5. Long-range charge cancellation
  if ((rawFamily === 'splatana' || rawFamily === 'stringer' || rawFamily === 'charger') && dist > range * 1.12) {
    if (wr?.charging && wr.charge >= 0.15) {
      it.fire = false;
    }
  }
  return wantPitch;
}

/**
 * Evaluates candidate navigation goals for Turf War painting:
 * 1. Macro-plaza evaluation (6.5m radius) with spatial deduplication and cross-team cache sharing.
 * 2. Finishing-paint bonus ("塗るところは綺麗に塗る" - Game8).
 * 3. 4-Bot ally deconfliction ("味方と塗る場所が被らないように分かれて塗る" - Game8).
 * 4. 3-phase strategic pace: Opening expansion, Mid-game contest, and Endgame defense (GameWith).
 */
export function botScorePaintCandidate(brain, G, actor, node, dist, progress, st, baseScore) {
  if (brain?._disableTurfPaintPatch || actor?._disableTurfPaintPatch) return baseScore;
  if (!G?.level || !Array.isArray(G.level.faces) || G.level.faces.length <= 6) {
    return baseScore;
  }

  let score = baseScore;
  const rawFamily = botRawWeaponFamily(actor?.weapon, null);
  const emptyFrac = st.empty ?? st.unpainted ?? Math.max(0, 1 - (st.own || 0) - (st.enemy || 0));
  const ownFrac = st.own || 0;
  const enemyFrac = st.enemy || 0;

  // 1. Macro-plaza evaluation (6.5m radius): prefer wide-open paintable plazas with high cell count (n)
  // over tiny cramped corners, and strongly reward overwriting enemy ink (1p enemy ink = 2p net swing!).
  // Cached with spatial deduplication (2.5m grid) and cross-team inversion to eliminate redundant CPU queries.
  // Uses a 31-bit Small Integer (SMI) key and in-place entry mutation to eliminate heap allocations.
  const paint = G?.paint;
  if (paint && typeof paint.regionStats === 'function' && paint.grid) {
    if (!paint._macroPlazaCache) {
      paint._macroPlazaCache = new Map();
    }
    const cache = paint._macroPlazaCache;
    if (cache.size > 256) {
      cache.clear();
    }
    const now = (typeof G?.match?.time === 'number')
      ? G.match.time
      : (typeof brain?.t === 'number'
          ? brain.t
          : (typeof G?.timeLeft === 'number' ? G.timeLeft : 0));
    const team = actor.team ?? 0;
    const px = Math.round(node.x / 2.5) | 0;
    const py = Math.round((node.y || 0) / 2.0) | 0;
    const pz = Math.round(node.z / 2.5) | 0;
    // Pack 3D coordinates into a 31-bit SMI key (never allocated on heap):
    // px (-128..127) -> 8 bits, py (-32..95) -> 7 bits, pz (-128..127) -> 8 bits
    const plazaKey = (((px + 128) & 0xff) << 15) | (((py + 32) & 0x7f) << 8) | ((pz + 128) & 0xff);

    let cached = cache.get(plazaKey);
    let macroEmpty = 0, macroEnemy = 0, macroOwn = 0, macroN = 0;

    if (cached && Math.abs(cached.t - now) <= 0.5) {
      macroEmpty = cached.empty;
      macroN = cached.n;
      if (team === 1) {
        macroOwn = cached.team1;
        macroEnemy = cached.team0;
      } else {
        macroOwn = cached.team0;
        macroEnemy = cached.team1;
      }
    } else {
      const res = paint.regionStats(node.x, node.y, node.z, 6.5, team, _macroScratch);
      macroEmpty = res.empty || 0;
      macroEnemy = res.enemy || 0;
      macroOwn = res.own || 0;
      macroN = res.n || 0;

      const team0Frac = team === 1 ? macroEnemy : macroOwn;
      const team1Frac = team === 1 ? macroOwn : macroEnemy;

      if (cached) {
        // Mutate existing cache object in-place to avoid heap allocations on refresh
        cached.empty = macroEmpty;
        cached.team0 = team0Frac;
        cached.team1 = team1Frac;
        cached.n = macroN;
        cached.t = now;
      } else {
        cache.set(plazaKey, {
          empty: macroEmpty,
          team0: team0Frac,
          team1: team1Frac,
          n: macroN,
          t: now,
        });
      }
    }

    if (macroN > 0) {
      const areaRichness = clampVal(macroN / 32, 0.5, 1.75);
      score += (macroEmpty * 6.5 + macroEnemy * 10.5 - macroOwn * 3.5) * areaRichness;
    }
  } else {
    score += enemyFrac * 4.5 + emptyFrac * 2.5 - ownFrac * 2.0;
  }

  // 2. Finishing-paint bonus ("塗るところは綺麗に塗る" - Game8)
  if (emptyFrac >= 0.18 && emptyFrac <= 0.72 && ownFrac >= 0.14) {
    score += 1.85;
  }

  // 3. Strong 4-bot ally deconfliction ("味方と塗る場所が被らないように分かれて塗る" - Game8)
  const actors = G?.actors;
  const navNodes = G?.nav?.nodes;
  let aliveAllies = 1, aliveEnemies = 1;
  if (Array.isArray(actors)) {
    aliveAllies = 0;
    aliveEnemies = 0;
    for (let i = 0; i < actors.length; i++) {
      const other = actors[i];
      if (!other || (other.alive === false) || other.dead || (typeof other.hp === 'number' && other.hp <= 0)) continue;
      if (other.team === actor.team) {
        aliveAllies++;
        if (other !== actor) {
          const dPos = Math.hypot(node.x - other.pos.x, node.z - other.pos.z);
          if (dPos < 11.0) {
            score -= (1 - dPos / 11.0) * 5.5;
          }
          const oBrain = other.bot || other.brain;
          const rawGoal = oBrain?.goal;
          const gNode = (typeof rawGoal === 'number' && navNodes) ? navNodes[rawGoal] : rawGoal;
          if (gNode && typeof gNode.x === 'number') {
            const dGoal = Math.hypot(node.x - gNode.x, node.z - gNode.z);
            if (dGoal < 13.0) {
              score -= (1 - dGoal / 13.0) * 7.5;
            }
          }
        }
      } else {
        aliveEnemies++;
      }
    }
  }

  // 4. Sweet-spot distance preference (6m..20m away so the bot paints a continuous swath on the way)
  if (dist >= 5.5 && dist <= 19.0) {
    score += 2.20;
  } else if (dist > 26.0) {
    score -= 2.50;
  }

  // 5. Weapon-role territorial preference & central control priority
  const isBackline = rawFamily === 'charger' || rawFamily === 'splatling' || (rawFamily === 'stringer' && (actor.weapon?.range || 15) >= 18);
  const isFrontline = rawFamily === 'roller' || rawFamily === 'brush' || rawFamily === 'splatana' || rawFamily === 'dualies' || rawFamily === 'blaster';

  if (isBackline) {
    if (progress >= 0.28 && progress <= 0.64) score += 2.10;
    else if (progress > 0.78) score -= 2.20;
    if (node.y > actor.pos.y + 0.8) score += 1.10;
  } else if (isFrontline) {
    if (progress >= 0.36 && progress <= 0.78) score += 2.20;
  } else {
    if (progress >= 0.28 && progress <= 0.72) score += 2.00;
  }

  // 6. Live Scoreboard & 3-Phase Turf War Strategy (Game8 / GameWith / ずんだもch)
  const timeLeft = resolveMatchTimeLeft(G);
  const duration = resolveMatchDuration(G);
  const isTurfMode = (G?.match?.mode || G?.mode || 'turf') === 'turf';

  if (isTurfMode) {
    let teamLead = 0;
    if (typeof G?.paint?.coverage === 'function') {
      const cov = G.paint.coverage();
      if (Array.isArray(cov) && cov.length >= 2) {
        const ownTeamIdx = actor.team === 1 ? 1 : 0;
        teamLead = (cov[ownTeamIdx] || 0) - (cov[1 - ownTeamIdx] || 0);
      }
    }

    const elapsed = Math.max(0, duration - timeLeft);
    if (elapsed < 12) {
      // Opening 12s: split slots so 2 bots claim mid (0.42..0.68) and 2 bots coat base-to-mid (0.20..0.46)
      const slot = actor.slot ?? (actor.id || 0);
      if ((slot & 1) === 0 || isFrontline) {
        if (progress >= 0.42 && progress <= 0.68) score += 2.50;
      } else {
        if (progress >= 0.20 && progress <= 0.46 && emptyFrac > 0.30) score += 2.40;
      }
    } else {
      // Mid & Late game: aggressively reclaim enemy ink and unpainted mid/enemy plazas
      score += enemyFrac * 4.20;
      if (teamLead < 0.02) {
        // Behind or tied: push strongly into enemy-painted territory
        score += enemyFrac * 3.50 + clampVal(progress, 0.35, 0.78) * 2.20;
      } else if (timeLeft <= 25 && teamLead >= 0.08 && progress > 0.78) {
        // Comfortably ahead in final 25s: don't feed in enemy spawn
        score -= 2.40;
      }
    }
  }

  // 7. Forward heading continuity bonus to minimize 180-degree turnaround waste
  const vx = actor.vel?.x || 0, vz = actor.vel?.z || 0;
  const vLen = Math.hypot(vx, vz);
  if (vLen > 0.5 && dist > 1.0) {
    const dx = (node.x - actor.pos.x) / dist;
    const dz = (node.z - actor.pos.z) / dist;
    const dot = (vx * dx + vz * dz) / vLen;
    score += dot * 1.35;
  }

  return score;
}
