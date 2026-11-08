// Bot Turf War painting & aim stabilization adapter (2026-11-08).
// Applied after adaptBotPaintPitch on src/game/bots.js; preserves all upstream
// and earlier adapter anchors.
const IMPORT = "import { botEvaluateTurfPaint, botStabilizeTurfAim, botTurfPitchReady, botApplyTurfPaintMechanics, botApplyTurfCombatPaint, botScorePaintCandidate, botRawWeaponFamily } from '../../patches/splatoon3/runtime/bot-turf-paint.mjs';\n";

export function adaptBotTurfPaint(rel, code, replaceOnce) {
  if (rel !== 'src/game/bots.js') return code;
  if (code.includes(IMPORT)) throw new Error('INKWAVE bot turf paint: repeated bots.js transform');

  // 1. Reset multi-point cache and hysteresis latch in reset()
  code = replaceOnce(
    code,
    '    this._paintObservation = null; this._paintObservationEpoch = 0;\n',
    '    this._paintObservation = null; this._paintObservationEpoch = 0; this._turfPaintLatch = false; this._rollerRollTime = 0; this._rollerSwimGap = 0; this._smoothStrafe = null; this._smoothFlankBias = 0; if (this._turfMultiCache) this._turfMultiCache.epoch = -1;\n',
    'bot turf paint reset state'
  );

  // 1b. Wire combat approach path-painting ("道作り") & retreat foot-clearing ("足元塗り")
  code = replaceOnce(
    code,
    "        // out of range with own ink underfoot: swim in (fast, hard to hit) instead of walking\n" +
    "        if (!it.fire && !a.weaponRunner.charging && dist > range * 1.15 && a.groundTeam === 1) it.squid = true;",
    "        // out of range with own ink underfoot: swim in (fast, hard to hit) instead of walking\n" +
    "        if (!it.fire && !a.weaponRunner.charging && dist > range * 1.15 && a.groundTeam === 1) it.squid = true;\n" +
    "        wantPitch = botApplyTurfCombatPaint(this, G, a, dt, move, wantMove, wantYaw, wantPitch, dist, range, inkFrac);",
    'bot turf combat approach paint'
  );

  // 2. Wire multi-point paint evaluation with hysteresis + aim stabilization in paint mode
  code = replaceOnce(
    code,
    "      wantPitch = botAlertPitch(this, wantPitch);\n" +
    "      const aheadStats = this._observePaintRegion('turf', a.pos.x + Math.sin(wantYaw) * 4, a.pos.y, a.pos.z + Math.cos(wantYaw) * 4, 3);\n" +
    "      const needPaint = aheadStats.n === 0 || aheadStats.own < 0.75;",
    "      const _basePaintYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw;\n" +
    "      wantPitch = botAlertPitch(this, wantPitch);\n" +
    "      const aheadStats = this._observePaintRegion('turf', a.pos.x + Math.sin(wantYaw) * 4, a.pos.y, a.pos.z + Math.cos(wantYaw) * 4, 3);\n" +
    "      const _rawNeedPaint = aheadStats.n === 0 || aheadStats.own < 0.75;\n" +
    "      const _turfAim = botStabilizeTurfAim(this, G, a, family, _basePaintYaw, wantYaw, wantPitch);\n" +
    "      wantYaw = _turfAim.yaw; wantPitch = _turfAim.pitch;\n" +
    "      const needPaint = botEvaluateTurfPaint(this, G, a, move, wantMove, _basePaintYaw, aheadStats, inkFrac) && botTurfPitchReady(this, a, botRawWeaponFamily(w, family), wantPitch);",
    'bot turf multi-point paint and aim stabilization'
  );

  // 3. Wire strafe painting ("カニ歩き塗り"), roller flick-roll combo, stringer wide-fan release, and buzzer-beater sub throw
  code = replaceOnce(
    code,
    '      // travel as a squid through own ink when not painting\n' +
    '      if (!it.fire && this._pathRemaining() > 5 && a.groundTeam === 1) it.squid = true;',
    '      botApplyTurfPaintMechanics(this, G, a, dt, move, wantMove, _basePaintYaw, inkFrac);\n' +
    '      // travel as a squid through own ink when not painting\n' +
    '      if (!it.fire && this._pathRemaining() > 5 && a.groundTeam === 1) it.squid = true;',
    'bot turf paint mechanics hook'
  );

  // 4. Wire territorial, ally-deconfliction, and 3-phase strategy scoring into _pickPaintGoal
  code = replaceOnce(
    code,
    '      let score = (st.empty + st.enemy * 1.25) * 12 - d * 0.18 + clamp(progress, 0, 0.8) * 4 + Math.random() * 2.5;',
    '      let score = botScorePaintCandidate(this, G, a, n, d, progress, st, (st.empty + st.enemy * 1.25) * 12 - d * 0.18 + clamp(progress, 0, 0.8) * 4 + Math.random() * 2.5);',
    'bot turf goal candidate scoring'
  );

  // Fix upstream block-scoping of nx/nz in Dualies combat dodge-roll
  code = replaceOnce(
    code,
    "if (!this._nearWater(a, 3.2)) { move.set(-nz * side, 0, nx * side); it.jump = true; this.dodgeCd = 1.4 + Math.random() * 1.6; }",
    "if (!this._nearWater(a, 3.2)) { const _dnx = dx / Math.max(dist, 0.01), _dnz = dz / Math.max(dist, 0.01); move.set(-_dnz * side, 0, _dnx * side); it.jump = true; this.dodgeCd = 1.4 + Math.random() * 1.6; }",
    "bot dualies dodge-roll nx/nz scope fix"
  );

  return IMPORT + code;
}
