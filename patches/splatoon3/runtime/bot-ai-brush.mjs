// Dedicated Splatoon 3 Brush (フデ系) Bot AI module (Turf War painting & combat).
// Purely operates on bot intent, movement, spacing, and rhythm decisions with zero weapon stat edits,
// zero aimError zeroing, zero wall-hack vision, zero per-frame allocations, and zero extra raycasts.
//
// Grounded in authentic Splatoon 3 Wiki specifications & playstyle guides:
// - フデ属 (Brush family): https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%95%E3%83%87%E5%B1%9E
//   Tap ZR for wide fan swings (fresh edge required per swing in INKWAVE catalog), hold ZR after a swing
//   to brush-roll across uninked/enemy terrain; narrow roll width is for mobility/escape rather than turf area.
// - パブロ (Inkbrush / s3-brush-mini / WeaponBrushMini):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%91%E3%83%96%E3%83%AD
//   7F cadence, 1F windup, 2.0% ink/swing (50 swings), 1.98 DU/F fastest roll with NoOpInkEffect=true
//   (completely ignores enemy ink slow/slip while rolling). Excels at wide fan turfing, zigzag evasion,
//   flanking/harassment, and rapid brush-roll escapes.
// - ホクサイ (Octobrush / s3-brush-normal / WeaponBrushNormal):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%9B%E3%82%AF%E3%82%B5%E3%82%A4
//   11F cadence, 1F windup, 2.7% ink/swing (37 swings), widest horizontal hitbox, 1.68 DU/F roll
//   (affected by enemy ink, quick 17F swing-to-roll transition). Prefers squid-swim approach, wide lateral
//   strafing in close 3-shot range, and short tactical roll transitions.
// - フィンセント (Painbrush / s3-brush-heavy / WeaponBrushHeavy):
//   https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%95%E3%82%A3%E3%83%B3%E3%82%BB%E3%83%B3%E3%83%88
//   14F sustained cadence, heavy 23F initial SwingFrame windup (1F on chained swings), 4.8% ink/swing
//   (20 swings), 50F ink lock, 1.80 DU/F roll (10.8%/s, affected by enemy ink). Mid-range 2-3 shot
//   powerhouse: never whiff outside reach, commit through initial 23F windup without squid-canceling,
//   chain swings once engaged, disengage if enemy escapes range, and use burst painting with ink recovery.

const EPS = 1e-6;
const _archetypeCache = new WeakMap();

/**
 * Per-archetype Splatoon 3 Brush tuning profiles (mini / normal / heavy).
 */
export const BRUSH_ARCHETYPES = Object.freeze({
  mini: Object.freeze({
    id: 'mini',
    sourceActor: 'WeaponBrushMini',
    weaponId: 's3-brush-mini',
    // Turf painting
    paintPitch: 0.055,
    paintSweepAmp: 0.78,
    paintStrafe: 0.36,
    paintBurstSwings: 12,
    paintCadenceJitter: 0.032, // Relaxed human rhythm in non-urgent turfing (Wiki: 差し迫ってない場面では程よく手を抜く)
    // Brush roll mobility
    ignoresEnemyInkOnRoll: true, // WeaponRollParam.NoOpInkEffect === true
    rollHoldPaintMax: 0.85,
    rollHoldCombatMax: 0.95,
    rollMinInk: 0.16,
    rollSwimGapOwn: 0.20,
    // Ink discipline (2.0% / swing, 30F lock)
    minPaintInk: 0.10,
    inkRecoverTrigger: 0.14,
    inkRecoverTarget: 0.42,
    minCombatInk: 0.05,
    // Combat spacing & engagement (1.3-line 4-shot, 1.5-line effective)
    killDist: 5.2,
    maxReach: 7.0,
    preferredDist: 3.4,
    aimTolerance: 0.46, // Wide fan forgiveness
    combatCadenceJitter: 0.012,
    zigzagFreq: 1.55,
    zigzagAmp: 0.92,
    retreatHpFrac: 0.42,
    hasHeavyWindup: false,
    elevPitchBias: 0.03,
  }),
  normal: Object.freeze({
    id: 'normal',
    sourceActor: 'WeaponBrushNormal',
    weaponId: 's3-brush-normal',
    // Turf painting
    paintPitch: 0.06,
    paintSweepAmp: 0.74,
    paintStrafe: 0.34,
    paintBurstSwings: 7,
    paintCadenceJitter: 0.026,
    // Brush roll mobility (1.68 DU/F, affected by enemy ink -> short tactical roll only)
    ignoresEnemyInkOnRoll: false,
    rollHoldPaintMax: 0.42,
    rollHoldCombatMax: 0.45,
    rollMinInk: 0.24,
    rollSwimGapOwn: 0.24,
    // Ink discipline (2.7% / swing, 30F lock)
    minPaintInk: 0.12,
    inkRecoverTrigger: 0.22,
    inkRecoverTarget: 0.56,
    minCombatInk: 0.06,
    // Combat spacing & engagement (1.4-line 3-shot, 1.9-line effective)
    killDist: 6.4,
    maxReach: 8.6,
    preferredDist: 4.8,
    aimTolerance: 0.48, // Widest horizontal spread in the game
    combatCadenceJitter: 0.016,
    zigzagFreq: 1.25,
    zigzagAmp: 0.95,
    retreatHpFrac: 0.38,
    hasHeavyWindup: false,
    elevPitchBias: 0.04,
  }),
  heavy: Object.freeze({
    id: 'heavy',
    sourceActor: 'WeaponBrushHeavy',
    weaponId: 's3-brush-heavy',
    // Turf painting (4.8% / swing, 50F ink lock -> disciplined burst painting)
    paintPitch: 0.04,
    paintSweepAmp: 0.62,
    paintStrafe: 0.28,
    paintBurstSwings: 4,
    paintCadenceJitter: 0.024,
    // Brush roll mobility (10.8%/s, 23F startup -> brief reposition/escape only)
    ignoresEnemyInkOnRoll: false,
    rollHoldPaintMax: 0.26,
    rollHoldCombatMax: 0.34,
    rollMinInk: 0.34,
    rollSwimGapOwn: 0.32,
    // Ink discipline
    minPaintInk: 0.16,
    inkRecoverTrigger: 0.30,
    inkRecoverTarget: 0.66,
    minCombatInk: 0.10,
    // Combat spacing & engagement (1.5-line 2-shot, 2.4-line 3-shot, 2.5-line effective)
    killDist: 8.8,
    maxReach: 11.4,
    preferredDist: 7.2,
    aimTolerance: 0.30, // Narrower fan than Inkbrush/Octobrush; avoid 23F whiff
    combatCadenceJitter: 0.014,
    zigzagFreq: 0.92,
    zigzagAmp: 0.68,
    retreatHpFrac: 0.35,
    hasHeavyWindup: true, // 23F initial SwingFrame windup; 1F on chained swings
    elevPitchBias: 0.06,  // Lobbing / arc attacks over ledges & cover
  }),
});

function clampVal(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * O(1) deterministic triangle wave in [-1, +1] with zero trig calls and zero allocations.
 */
function triWave(x) {
  const f = x - Math.floor(x);
  return f < 0.5 ? 4 * f - 1 : 3 - 4 * f;
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
  if (typeof ctx?.timeLeft === 'number') return ctx.timeLeft;
  if (typeof G?.match?.time === 'number') return G.match.time;
  if (typeof G?.timeLeft === 'number') return G.timeLeft;
  return 120;
}

function ensureBrushState(brain) {
  let st = brain._brushAI;
  if (!st) {
    st = brain._brushAI = {
      // Paint state
      paintSwings: 0,
      paintRecovering: false,
      paintPauseT: 0,
      rollT: 0,
      swimGapT: 0,
      // Combat state
      combatPauseT: 0,
      combatChaining: false,
      combatRollT: 0,
      // Reusable aim output (zero per-frame allocations)
      aimOut: { wantYaw: 0, wantPitch: 0 },
    };
  }
  return st;
}

/**
 * Resolves the specific Splatoon 3 Brush archetype ('mini' = パブロ, 'normal' = ホクサイ, 'heavy' = フィンセント).
 * Uses WeakMap memoization for zero per-frame allocations.
 */
export function resolveBrushArchetype(weapon) {
  if (!weapon || typeof weapon !== 'object') return BRUSH_ARCHETYPES.normal;
  const actorName =
    weapon.sourceMainActor ||
    weapon.catalogRecord?.sourceActor ||
    weapon.catalogRecord?.sourceMainActor ||
    '';
  const wId = typeof weapon.id === 'string' ? weapon.id : '';
  const noOpInk = weapon.catalogRecord?.parameters?.WeaponRollParam?.NoOpInkEffect === true;
  const swingFrame = weapon.catalogRecord?.parameters?.WeaponSwingParam?.SwingFrame || 0;

  const cached = _archetypeCache.get(weapon);
  if (
    cached &&
    cached.actorName === actorName &&
    cached.wId === wId &&
    cached.noOpInk === noOpInk &&
    cached.swingFrame === swingFrame
  ) {
    return cached.arch;
  }

  let arch = BRUSH_ARCHETYPES.normal;
  const lowerId = wId.toLowerCase();
  if (
    actorName === 'WeaponBrushHeavy' ||
    lowerId.includes('brush-heavy') ||
    lowerId.includes('brush_heavy') ||
    lowerId.includes('painbrush') ||
    lowerId.includes('fincent') ||
    swingFrame >= 15
  ) {
    arch = BRUSH_ARCHETYPES.heavy;
  } else if (
    actorName === 'WeaponBrushMini' ||
    lowerId.includes('brush-mini') ||
    lowerId.includes('brush_mini') ||
    lowerId.includes('inkbrush') ||
    lowerId.includes('pablo') ||
    noOpInk
  ) {
    arch = BRUSH_ARCHETYPES.mini;
  } else if (
    actorName === 'WeaponBrushNormal' ||
    lowerId.includes('brush-normal') ||
    lowerId.includes('brush_normal') ||
    lowerId.includes('octobrush') ||
    lowerId.includes('hokusai')
  ) {
    arch = BRUSH_ARCHETYPES.normal;
  }

  _archetypeCache.set(weapon, { actorName, wId, noOpInk, swingFrame, arch });
  return arch;
}

/**
 * Applies authentic, human-like, lightweight Splatoon 3 Brush Turf War painting AI:
 * - Preserves the existing test contract: on enemy ink (groundTeam === 2) when not actively rolling,
 *   enforces a strict fresh rising edge (!actor._prevIntent?.fire) for brush swings.
 * - Inkbrush (パブロ): wide fan swings with relaxed human cadence wobble; uses enemy-ink-immune
 *   fast brush-roll with O(1) triangle-wave zigzag when actively rolling across uninked/enemy turf.
 * - Octobrush (ホクサイ): wide fan painting with periodic ink-recovery dives and brief roll transitions.
 * - Painbrush (フィンセント): respects 23F initial windup (never squid-cancels pending), uses disciplined
 *   4-swing bursts with squid ink recovery to avoid 50F ink-lock exhaustion.
 */
export function applyBrushTurfPaint(brain, G, actor, dt, move, wantMove, baseYaw, inkFrac, ctx) {
  const it = actor?.intent;
  if (!it) return null;
  const wr = actor.weaponRunner;
  const stepDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  const arch = resolveBrushArchetype(actor.weapon);
  const st = ensureBrushState(brain);
  const cache = ctx?.cache || brain._turfMultiCache || null;
  const timeLeft = resolveMatchTimeLeft(G, ctx);
  const coolerPending = !!brain._coolerPickupPending;
  const onOwnInk = actor.groundTeam === 1;
  const onEnemyInk = actor.groundTeam === 2;
  const pending = !!wr?.catalogState?.pending;
  const rolling = !!wr?.rolling;
  const cooldown = wr?.cooldown || 0;
  const prevFire = !!actor._prevIntent?.fire;
  const wantPaintNow =
    typeof ctx?.wantPaintNow === 'boolean'
      ? ctx.wantPaintNow
      : Boolean(brain._turfPaintLatch && inkFrac > 0.10 && (brain.paintPause || 0) <= 0);
  const t = Number.isFinite(brain?.t) ? brain.t : 0;
  const ph1 = Number.isFinite(brain?.ph1) ? brain.ph1 : ((actor?.id || 0) * 0.37);

  // Reset combat-only timers when in turf-paint mode
  st.combatChaining = false;
  st.combatRollT = 0;
  st.combatPauseT = 0;

  if (st.paintPauseT > 0) {
    st.paintPauseT = Math.max(0, st.paintPauseT - stepDt);
  }

  // 1. Mid-windup (especially Painbrush 23F initial SwingFrame): never interrupt with squid or spam fire
  if (pending) {
    it.fire = false;
    it.squid = false;
    return null;
  }

  // 2. Active brush-roll mobility (ZR held after swing -> wr.rolling === true)
  if (rolling) {
    st.rollT += stepDt;
    const areaAlreadyOwn =
      cache?.multiActive && cache.effOwn >= 0.78 && cache.effEnemy < 0.04 && onOwnInk;
    const keepRolling =
      wantMove &&
      inkFrac > arch.rollMinInk &&
      st.rollT < arch.rollHoldPaintMax &&
      !areaAlreadyOwn &&
      (arch.ignoresEnemyInkOnRoll ? (!onOwnInk || !wantPaintNow) : !onOwnInk);

    if (keepRolling) {
      it.fire = true;
      it.squid = false;
      // Gentle O(1) triangle-wave weave while rolling so movement is human, never a rigid straight line
      if (move && typeof move.x === 'number') {
        const weave = triWave(t * arch.zigzagFreq * 0.65 + ph1) * (arch.ignoresEnemyInkOnRoll ? 0.34 : 0.20);
        const fx = Math.sin(baseYaw);
        const fz = Math.cos(baseYaw);
        const rx = Math.cos(baseYaw);
        const rz = -Math.sin(baseYaw);
        const mx = fx + rx * weave;
        const mz = fz + rz * weave;
        const ml = Math.hypot(mx, mz);
        if (ml > 1e-4) setMove(move, mx / ml, mz / ml);
      }
      return null;
    }

    // End roll cleanly and transition to squid swim recovery if on own ink
    st.rollT = 0;
    st.swimGapT = onOwnInk ? arch.rollSwimGapOwn : 0;
    it.fire = false;
    if (!coolerPending && onOwnInk && wantMove) {
      it.squid = true;
    }
    return null;
  }
  st.rollT = 0;

  // 3. Post-roll squid recovery gap (skip if suddenly standing on enemy ink)
  if (st.swimGapT > 0) {
    st.swimGapT = Math.max(0, st.swimGapT - stepDt);
    if (!onEnemyInk) {
      it.fire = false;
      if (!coolerPending && onOwnInk && wantMove) it.squid = true;
      return null;
    }
    st.swimGapT = 0;
  }

  // 4. Existing test contract: enemy-ink movement foot clearing ALWAYS enforces a strict fresh edge
  //    when not actively rolling and not in normal turf-painting latch.
  if (!wantPaintNow && onEnemyInk && wantMove && inkFrac > 0.08) {
    it.fire = cooldown <= EPS && !prevFire;
    if (it.fire) it.squid = false;
    return null;
  }

  // 5. Ink recovery hysteresis (critical for Painbrush 4.8% & 50F lock, and Octobrush 2.7%)
  if (st.paintRecovering) {
    if (inkFrac >= arch.inkRecoverTarget || (timeLeft <= 6.5 && inkFrac >= arch.minPaintInk)) {
      st.paintRecovering = false;
      st.paintSwings = 0;
    } else {
      it.fire = false;
      if (!coolerPending && onOwnInk) it.squid = true;
      return null;
    }
  } else if (
    inkFrac < arch.inkRecoverTrigger &&
    !(onEnemyInk && inkFrac > 0.08) &&
    !(timeLeft <= 6.5 && inkFrac >= arch.minPaintInk)
  ) {
    st.paintRecovering = true;
    st.paintSwings = 0;
    it.fire = false;
    if (!coolerPending && onOwnInk) it.squid = true;
    return null;
  }

  // 6. Burst-paint breather on own ink for heavy/normal brushes to avoid ink-lock burnout
  if (
    st.paintSwings >= arch.paintBurstSwings &&
    onOwnInk &&
    inkFrac < 0.72 &&
    timeLeft > 6.5
  ) {
    st.paintSwings = 0;
    st.swimGapT = arch.rollSwimGapOwn;
    it.fire = false;
    if (!coolerPending && wantMove) it.squid = true;
    return null;
  }

  // 7. No paint needed right now -> squid swim to next unpainted sector on own ink
  if (!wantPaintNow || inkFrac <= 0.08) {
    it.fire = false;
    if (!coolerPending && onOwnInk && wantMove) it.squid = true;
    return null;
  }

  // 8. Tap-swing execution with strict fresh edge (!prevFire) and human rhythm micro-variation
  if (prevFire || cooldown > EPS) {
    it.fire = false;
    // Keep kid form during rapid tap cadence so we don't trigger squid emerge delay every swing
    it.squid = false;
    return null;
  }

  // Small human cadence jitter in calm turfing (bypassed in enemy ink or final 6.5s rush)
  if (!onEnemyInk && timeLeft > 6.5 && st.paintPauseT > EPS) {
    it.fire = false;
    it.squid = false;
    return null;
  }

  it.fire = true;
  it.squid = false;
  st.paintSwings++;
  // Schedule next subtle human micro-pause (0 .. paintCadenceJitter) using O(1) triangle wave
  const wave01 = 0.5 + 0.5 * triWave(t * 2.1 + ph1 * 1.7 + st.paintSwings * 0.29);
  st.paintPauseT = wave01 * arch.paintCadenceJitter;

  // 9. Fan-shaped horizontal sweep aim with flank bias (reusing st.aimOut, zero allocation)
  const flankBias = cache?.flankBias || 0;
  const sweepWave = triWave(t * 1.35 + ph1 + st.paintSwings * 0.31);
  const yawOffset = clampVal(
    sweepWave * arch.paintSweepAmp * 0.72 + clampVal(flankBias, -0.32, 0.32),
    -arch.paintSweepAmp,
    arch.paintSweepAmp
  );
  const pitchWobble = triWave(t * 0.85 + ph1 * 0.6) * 0.018;
  const out = st.aimOut;
  out.wantYaw = Number.isFinite(baseYaw) ? baseYaw + yawOffset : yawOffset;
  out.wantPitch = arch.paintPitch + pitchWobble;
  return out;
}

/**
 * Applies authentic, human-like, lightweight Splatoon 3 Brush combat AI:
 * - Zero cheats: preserves ctx.wantYaw/wantPitch aimError, never peeks hidden targets, never mutates weapon stats.
 * - Inkbrush (パブロ): zigzag flanking approach (squid on own ink, enemy-ink-immune roll if rolling on enemy ink),
 *   rapid close-range swings, and evasive disengage at low HP.
 * - Octobrush (ホクサイ): squid-swim ambush/approach, wide lateral strafe-swings in 3-shot range to break
 *   enemy tracking while landing wide horizontal splashes.
 * - Painbrush (フィンセント): strict reach/aim discipline before committing the 23F initial SwingFrame windup;
 *   never squid-cancels during pending windup; chains fast 14F follow-up swings while target stays in reach;
 *   cuts swings early and resets if enemy escapes range or ink runs low.
 */
export function applyBrushCombat(brain, G, actor, dt, move, ctx) {
  const it = actor?.intent;
  const wr = actor?.weaponRunner;
  if (!it || !wr) return null;

  const stepDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  const arch = resolveBrushArchetype(actor.weapon);
  const st = ensureBrushState(brain);

  const dist = typeof ctx?.dist === 'number' ? ctx.dist : 6;
  const dx = typeof ctx?.dx === 'number' ? ctx.dx : 0;
  const dz = typeof ctx?.dz === 'number' ? ctx.dz : 1;
  const dy = typeof ctx?.dy === 'number' ? ctx.dy : 0;
  const enemyVisible = !!ctx?.enemyVisible;
  const aimed = !!ctx?.aimed;
  const off = typeof ctx?.off === 'number' ? ctx.off : (aimed ? 0.06 : 0.45);
  const inkFrac = typeof ctx?.inkFrac === 'number' ? ctx.inkFrac : 1;
  const wantYaw = typeof ctx?.wantYaw === 'number' ? ctx.wantYaw : (brain.aimYaw || 0);
  const wantPitch = typeof ctx?.wantPitch === 'number' ? ctx.wantPitch : (brain.aimPitch || 0);

  const nx = dx / Math.max(dist, 0.01);
  const nz = dz / Math.max(dist, 0.01);
  const onOwnInk = actor.groundTeam === 1;
  const onEnemyInk = actor.groundTeam === 2;
  const hpFrac = typeof actor.hp === 'number' ? actor.hp / 100 : 1;
  const pending = !!wr.catalogState?.pending;
  const rolling = !!wr.rolling;
  const cooldown = wr.cooldown || 0;
  const prevFire = !!actor._prevIntent?.fire;
  const reactReady = (brain.react || 0) <= 0;
  const t = Number.isFinite(brain?.t) ? brain.t : 0;
  const ph1 = Number.isFinite(brain?.ph1) ? brain.ph1 : ((actor?.id || 0) * 0.37);

  // Reset turf-only timers on combat entry
  st.rollT = 0;
  st.swimGapT = 0;
  st.paintRecovering = false;

  if (st.combatPauseT > 0) {
    st.combatPauseT = Math.max(0, st.combatPauseT - stepDt);
  }

  // Effective reach respects live weapon.range without ever mutating weapon stats
  const weaponRange = typeof actor.weapon?.range === 'number' && actor.weapon.range > 0
    ? actor.weapon.range
    : arch.maxReach;
  const maxReach = Math.max(arch.maxReach, weaponRange * 1.04);

  // O(1) human zigzag lateral sign & amplitude modulation
  const baseSide = brain.strafeS || brain.strafe || 0.75;
  const zigWave = triWave(t * arch.zigzagFreq + ph1);
  // Blend brain's strafe direction with smooth triangle-wave oscillation for natural evasiveness
  const lateralSign = (baseSide >= 0 ? 1 : -1) * (0.45 + 0.55 * zigWave);

  // 1. Mid-windup (critical for Painbrush 23F initial windup):
  //    NEVER cancel with squid; release fire so we don't accidentally drop into roll; step/strafe gently.
  if (pending) {
    it.fire = false;
    it.squid = false;
    const fwd = dist > arch.preferredDist ? 0.55 : -0.15;
    const mvx = nx * fwd - nz * lateralSign * 0.80;
    const mvz = nz * fwd + nx * lateralSign * 0.80;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-4) setMove(move, mvx / ml, mvz / ml);
    st.combatChaining = true;
    return null;
  }

  // 2. Low-HP disengage / reset when outside immediate kill distance
  if (hpFrac < arch.retreatHpFrac && enemyVisible && dist > arch.killDist * 0.85) {
    st.combatChaining = false;
    // Evade diagonally away with zigzag wobble
    const mvx = -nx * 0.76 - nz * lateralSign * 0.65;
    const mvz = -nz * 0.76 + nx * lateralSign * 0.65;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-4) setMove(move, mvx / ml, mvz / ml);

    if (rolling && arch.ignoresEnemyInkOnRoll && !onOwnInk && inkFrac > arch.rollMinInk && st.combatRollT < arch.rollHoldCombatMax) {
      // Inkbrush: keep high-speed enemy-ink-immune roll to escape cleanly
      st.combatRollT += stepDt;
      it.fire = true;
      it.squid = false;
    } else {
      st.combatRollT = 0;
      it.fire = false;
      if (onOwnInk) it.squid = true;
    }
    return null;
  }

  // 3. Active brush-roll in combat:
  //    - Inkbrush can zigzag-roll across enemy/uninked turf to close distance until inside killDist.
  //    - Octobrush / Painbrush exit rolling quickly to swing or squid-reposition (Painbrush has 23F restart!).
  if (rolling) {
    st.combatRollT += stepDt;
    const wantContinueRoll =
      arch.ignoresEnemyInkOnRoll &&
      enemyVisible &&
      !onOwnInk &&
      dist > arch.killDist * 0.92 &&
      dist < maxReach + 7.5 &&
      inkFrac > arch.rollMinInk &&
      st.combatRollT < arch.rollHoldCombatMax;

    if (wantContinueRoll) {
      it.fire = true;
      it.squid = false;
      const mvx = nx * 0.68 - nz * lateralSign * arch.zigzagAmp;
      const mvz = nz * 0.68 + nx * lateralSign * arch.zigzagAmp;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 1e-4) setMove(move, mvx / ml, mvz / ml);
      return null;
    }

    // Lift brush to return to swings or squid swim
    st.combatRollT = 0;
    it.fire = false;
    it.squid = false;
    return null;
  }
  st.combatRollT = 0;

  // 4. Target not visible: never wall-hack or peek live target positions; reposition/recover cleanly
  if (!enemyVisible) {
    st.combatChaining = false;
    it.fire = false;
    if (onOwnInk && dist > arch.preferredDist) {
      it.squid = true;
    }
    return null;
  }

  // 5. Determine whether we are in effective swing engagement range & aim envelope
  const inKillZone = dist <= arch.killDist;
  const inReach = dist <= maxReach;
  // Painbrush: stricter initial commitment (don't eat 23F windup out of range), looser once chaining swings
  const aimOk = aimed || off < (arch.hasHeavyWindup && !st.combatChaining ? arch.aimTolerance * 0.85 : arch.aimTolerance);
  const canSwing =
    reactReady &&
    inReach &&
    aimOk &&
    inkFrac >= arch.minCombatInk &&
    // Painbrush: if target fled past effective reach while chaining, stop swinging and reset
    (!arch.hasHeavyWindup || dist <= maxReach);

  // 6. Combat movement: evasive zigzag approach or lateral strafe-dueling (never straight-line robotic charge)
  if (dist > arch.preferredDist + 1.1) {
    // Closing distance on a dynamic zigzag vector
    const fwdWeight = dist > maxReach ? 0.78 : 0.62;
    const sideWeight = dist > maxReach ? arch.zigzagAmp * 0.78 : arch.zigzagAmp;
    const mvx = nx * fwdWeight - nz * lateralSign * sideWeight;
    const mvz = nz * fwdWeight + nx * lateralSign * sideWeight;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-4) setMove(move, mvx / ml, mvz / ml);
  } else if (dist < arch.preferredDist * 0.55 && arch.hasHeavyWindup) {
    // Painbrush: backpedal slightly while strafing so enemy doesn't slip behind narrow close-up sector
    const mvx = -nx * 0.38 - nz * lateralSign * 0.88;
    const mvz = -nz * 0.38 + nx * lateralSign * 0.88;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-4) setMove(move, mvx / ml, mvz / ml);
  } else {
    // Inside preferred combat zone: active lateral weaving to throw off enemy aim
    const fwdWeight = inKillZone ? 0.18 : 0.38;
    const mvx = nx * fwdWeight - nz * lateralSign * arch.zigzagAmp;
    const mvz = nz * fwdWeight + nx * lateralSign * arch.zigzagAmp;
    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-4) setMove(move, mvx / ml, mvz / ml);
  }

  // 7. Execute combat tap-swings (fresh rising edge required every swing)
  if (canSwing) {
    if (actor.form === 'squid') {
      // Emerge cleanly before firing so the 1-frame rising edge is not swallowed by emergeDelay
      it.fire = false;
      it.squid = false;
      return null;
    }
    if (prevFire || cooldown > EPS) {
      it.fire = false;
      it.squid = false;
      return null;
    }

    // Subtle human cadence micro-variation (zero delay when Painbrush is chaining or enemy is point-blank)
    if (!inKillZone && !st.combatChaining && st.combatPauseT > EPS) {
      it.fire = false;
      it.squid = false;
      return null;
    }

    it.fire = true;
    it.squid = false;
    st.combatChaining = true;

    const jitter01 = 0.5 + 0.5 * triWave(t * 3.3 + ph1 * 1.9);
    st.combatPauseT = (inKillZone || inReach) ? 0 : jitter01 * arch.combatCadenceJitter;

    // Lobbing pitch assist when target is elevated (preserving ctx.wantYaw/wantPitch aimError verbatim!)
    if (dy > 0.65 && arch.elevPitchBias > 0) {
      const out = st.aimOut;
      out.wantYaw = wantYaw;
      out.wantPitch = clampVal(wantPitch + arch.elevPitchBias, -0.45, 0.55);
      return out;
    }
    return null;
  }

  // 8. Out of reach or low ink: stop swinging, swim on own ink to close gap or recover ink
  st.combatChaining = false;
  it.fire = false;
  if (onOwnInk && (dist > maxReach || inkFrac < arch.minCombatInk + 0.06)) {
    it.squid = true;
  } else if (onEnemyInk && inkFrac > 0.14 && dist > maxReach && cooldown <= EPS && !prevFire) {
    // Stuck on enemy ink while closing in: fresh-edge foot-clearing flick
    it.fire = true;
    it.squid = false;
  }

  return null;
}
