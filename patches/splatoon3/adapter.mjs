import { adaptLocalBatch01 } from './local-batch-01-adapter.mjs';
import { adaptAssistPresentation } from './assist-presentation-adapter.mjs';
import { adaptMatchHud } from './match-hud-adapter.mjs';
import { adaptChargerSurface } from './charger-surface-adapter.mjs';
import { adaptGearSub } from './gear-sub-adapter.mjs';
import { adaptContactRecovery } from './contact-recovery-adapter.mjs';
import { adaptWeaponPaintInertia } from './weapon-paint-inertia-adapter.mjs';
import { adaptWeaponEdgecases } from './weapon-edgecases-adapter.mjs';
import { adaptWeaponsFidelity } from './weapons-adapter.mjs';
import { adaptMinimapDirty } from './minimap-dirty-adapter.mjs';
import { adaptRespawnLifecycle } from './respawn-lifecycle-adapter.mjs';
import { adaptStormEffects } from './storm-effects-adapter.mjs';
import { adaptAgent3WeaponPhysics } from './agent3-weapon-physics-adapter.mjs';
import { adaptKitRescue } from './kit-rescue-adapter.mjs';
// Apply only to a disposable BUILD tree. Upstream sources are never modified.
// Every connection has a unique exact anchor; missing/duplicated hooks are errors.
import { adaptMovementPhysics } from './movement-physics-adapter.mjs';
import { adaptSubSpecialFidelity } from './sub-special-adapter.mjs';
import { adaptChargerSightCache } from './charger-sight-cache-adapter.mjs';
import { adaptJuddResult } from './judd-result-adapter.mjs';
import { adaptScoreHud } from './score-hud-adapter.mjs';
import { adaptPaintSplatPool } from './paint-splat-pool-adapter.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptIssue415 } from './runtime/issue-415-adapter.mjs';
export const PATCH_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

export function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE patch conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function checkCompatibility(src, patchRoot = PATCH_ROOT) {
  const lock = JSON.parse(fs.readFileSync(path.join(patchRoot, 'upstream-lock.json'), 'utf8'));
  const conflicts = [];
  for (const [file, hash] of Object.entries(lock.files)) {
    const abs = path.join(src, file);
    if (!fs.existsSync(abs) || sha256(fs.readFileSync(abs)) !== hash) conflicts.push(file);
  }
  if (conflicts.length) throw new Error(`INKWAVE patch compatibility review required: ${conflicts.join(', ')}. See patches/splatoon3/README.md. No unpatched fallback is published.`);
  return lock;
}

export function adaptSource(rel, code) {
  code = adaptLocalBatch01(rel, code, replaceOnce);
  // Storm owns the structural cloud-loop rewrite. Gear/Sub may then refine
  // the terminal frame boundary without hiding Storm's original connection.
  if (rel === 'src/game/weapons.js') code = adaptStormEffects(rel, code);
  code = adaptChargerSurface(rel, code, replaceOnce);
  code = adaptGearSub(rel, code, replaceOnce);
  code = adaptContactRecovery(rel, code, replaceOnce);
  code = adaptMatchHud(rel, code);
  code = adaptScoreHud(rel, code);
  code = adaptMinimapDirty(rel, code, replaceOnce);
  code = adaptRespawnLifecycle(rel, code, replaceOnce);
  if (rel !== 'src/game/weapons.js') code = adaptStormEffects(rel, code);
  code = adaptAssistPresentation(rel, code, replaceOnce);
  if (rel === 'src/config.js') return replaceOnce(code,
    '  minimap: true,', '  minimap: false,', 'optional corner map default');
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code,
      'const fnv = (str) => { let x = 2166136261;',
      'export const fnv = (str) => { let x = 2166136261;',
      'export fnv');
    code = replaceOnce(code,
      'const tagTitle = (name) => {',
      'export const tagTitle = (name) => {',
      'export tagTitle');
    code = replaceOnce(code,
      'const tagNum = (name) =>',
      'export const tagNum = (name) =>',
      'export tagNum');
    return replaceOnce(code,
    "{ key: 'minimap', label: 'Minimap', type: 'toggle', help: 'Show the turf minimap in the corner during matches.' },",
    "{ key: 'minimap', label: 'Corner map (non-S3 aid)', type: 'toggle', help: 'Optional aid outside the S3 baseline. The full Turf Map remains available.' },",
    'optional corner map explanation');
  }
  if (rel === 'src/i18n.js') return replaceOnce(code,
    "  'Minimap': 'ミニマップ',",
    "  'Corner map (non-S3 aid)': '画面端マップ（本家外の補助）', 'Optional aid outside the S3 baseline. The full Turf Map remains available.': '本家の標準とは異なる任意の補助です。全体マップは引き続き使用できます。',\n  'Minimap': 'ミニマップ',",
    'optional corner map Japanese explanation');
  if (rel === 'src/game/match.js') {
    // The lobby/roster protocol assigns team 0 to Alpha and team 1 to Bravo.
    // Preserve that match-side assignment; never redraw a winner at judgment.
    code = replaceOnce(code,
      'const win = cov[0] === cov[1] ? (Math.random() < 0.5 ? 0 : 1) : cov[0] > cov[1] ? 0 : 1;',
      'const win = cov[0] >= cov[1] ? 0 : 1; // Exact tie belongs to the assigned Alpha side.',
      'deterministic Alpha turf tie');
    code = replaceOnce(code, '  setState(s) {',
      '  setState(s) {\n    captureTurfFinish(this, s, G.paint);', 'Turf deadline snapshot before state listeners');
    code = replaceOnce(code, '    const cov = G.paint.coverage();',
      '    const cov = this.s3FinishCoverage ? [...this.s3FinishCoverage] : G.paint.coverage();', 'Turf judge deadline coverage');
    code = replaceOnce(code, "          if (!this.follower) this.setState('finish');",
      "          if (!this.follower) this.setState('finish'); else blockExpiredGuestInput(this);", 'guest local deadline input cancellation');
    code = replaceOnce(code, '    if (!this.controller) return;',
      '    if (blockExpiredGuestInput(this) || !this.controller) return;', 'guest deadline controller admission');
    code = "import { captureTurfFinish, blockExpiredGuestInput } from '../../patches/splatoon3/runtime/turf-finish.mjs';\n" + code;

    return code;
  }
  if (rel === 'src/game/actor.js' && !code.includes('_s3SlosherBirthEpoch = (this._s3SlosherBirthEpoch || 0) + 1')) {
    code = replaceOnce(code, '  reset() {',
      '  reset() {\n    this._s3SlosherBirthEpoch = (this._s3SlosherBirthEpoch || 0) + 1;',
      'cancel pending Slosher births when an actor resets');
  }
  if (rel === 'patches/splatoon3/runtime/resources.mjs') return adaptIssue415(rel, code);
  code = adaptMovementPhysics(rel, code, replaceOnce);
  code = adaptSubSpecialFidelity(rel, code, replaceOnce);
  code = adaptPaintSplatPool(rel, code, replaceOnce);
  if (rel !== 'src/game/weapons.js') code = adaptKitRescue(rel, code, replaceOnce);
  if (rel === 'src/world/paint.js') {
    code = replaceOnce(code,
      '  float tn = vGrow.x;',
      '  float tn = vGrow.x;\n  bool bodyOnly = vGrow.z > 1.5;',
      'paint body-only shader mode');
    code = replaceOnce(code,
      '    float grow = mix(0.4, 1.0, tb);',
      '    float grow = mix(0.4, 1.0, tb);',
      'paint native body growth');
    code = replaceOnce(code,
      '  if (vGrow.z < 0.5) {',
      '  if (vGrow.z < 0.5 || bodyOnly) {',
      'paint body visibility');
    code = replaceOnce(code,
      '    // ---- rays: short tapered streaks shot out ahead of the body (the splat\'s "star"), mostly stubby with the odd\n' +
      '    // long one, each ending in a bead where the ink collected as it flew',
      '    if (!bodyOnly) {\n' +
      '    // ---- rays: short tapered streaks shot out ahead of the body (the splat\'s "star"), mostly stubby with the odd\n' +
      '    // long one, each ending in a bead where the ink collected as it flew',
      'paint body-only ancillary effects');
    code = replaceOnce(code,
      '      sd = min(sd, length(p - u * r * (1.3 + 1.2 * h2)) - rad);\n' +
      '    }\n' +
      '  }\n' +
      '  // ---- drips on walls:',
      '      sd = min(sd, length(p - u * r * (1.3 + 1.2 * h2)) - rad);\n' +
      '    }\n' +
      '    }\n' +
      '  }\n' +
      '  // ---- drips on walls:',
      'paint body-only effect boundary');
    code = replaceOnce(code,
      '  if (isWall > 0.5 && fall > 0.3 && ks.w > 0.0) {',
      '  if (!bodyOnly && isWall > 0.5 && fall > 0.3 && ks.w > 0.0) {',
      'paint body-only drip suppression');
    code = replaceOnce(code, '  _emitGrowth(g, tn, dT, dripOnly) {', '  _emitGrowth(g, tn, dT, dripOnly) {', 'paint growth submission');
    code = replaceOnce(code, '  _pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) {', '  _pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) {', 'paint quad submission');
    code = replaceOnce(code, 'this.growing.push(g);', 'this.growing.push(g);', 'paint deferred growth record');
  }
  if (rel === 'src/game/character.js') {
    code = replaceOnce(code, 'const PN = _k;', 'const PN = _k;\nexport const CHARACTER_CHANNELS = Object.freeze({ HIPS_P,HIPS,SPINE,CHEST,NECK,HEAD,CLAVL,CLAVR,UARML,UARMR,FARML,FARMR,HANDL,HANDR,FOOTL,FOOTLR,FOOTR,FOOTRR,ANC,ANCR,POLER,POLEL,IKR,IKL,LTGT,LTGTR,LTW,LTROT,KNEEL,KNEER,STAB,WPL,WPR,TIPTOE,AFOLT,AFOLR,MODEL,MODELR,SQY,SQXZ,HLP });', 'character pose channels');
    code = replaceOnce(code, 'const BALL_Z = 0.11, HEEL_Z = 0.065;', 'const BALL_Z = 0.11, HEEL_Z = 0.065;\nexport const CHARACTER_FOOT_METRICS = Object.freeze({ ANKLE_H, BALL_Z, HEEL_Z });', 'character foot metrics');
    code = replaceOnce(code, 'const TN = _tk;', 'const TN = _tk;\nexport const CHARACTER_TIMERS = Object.freeze({ T_FLICK,T_LEAP,T_SLAM,T_DODGE,T_SPAWN,T_LAND,T_SHOOT,T_SHOOTL,T_THROW,T_SLOSH,T_REL });', 'character timers');
    code = replaceOnce(code, 'const M_GAIT = 0, M_CATCH = 1, M_SETTLE = 2;', 'const M_GAIT = 0, M_CATCH = 1, M_SETTLE = 2;\nexport const CHARACTER_FOOT_MODES = Object.freeze({ M_GAIT,M_CATCH,M_SETTLE });', 'character foot modes');
    const start = code.indexOf('    // ---------------- locomotion\n'), end = code.indexOf('    // ---------------- lean springs:', start);
    if(start<0 || end<0) throw new Error('INKWAVE patch conflict: walking pose');
    code=replaceOnce(code,code.slice(start,end),'    // ---------------- locomotion (independent calibrated motion layer)\n    if (walkActive(this)) applyWalkLocomotion(this, P);\n    else {\n'+code.slice(start,end)+'    }\n\n','walking pose');
    code=replaceOnce(code,'const lp = spr(sp, S_LEANP, clamp(af * 0.0075, -0.36, 0.3) * g, 2.2, 0.4, dt);',"const lp = walkLean(this, 'pitch', af, g, dt) ?? spr(sp, S_LEANP, clamp(af * 0.0075, -0.36, 0.3) * g, 2.2, 0.4, dt);",'walking pitch spring');
    code=replaceOnce(code,'const lr = spr(sp, S_LEANR, clamp(-al * 0.0068, -0.34, 0.34) * g, 2.0, 0.48, dt);',"const lr = walkLean(this, 'roll', al, g, dt) ?? spr(sp, S_LEANR, clamp(-al * 0.0068, -0.34, 0.34) * g, 2.0, 0.48, dt);",'walking roll spring');
    code=replaceOnce(code, '&& f.sw && f.su > 0.02 && f.su < 0.9) continue;', '&& walkSwingUnloaded(this, f)) continue;', 'walking support load');
    code=replaceOnce(code, 'const d = _v5.length(), mxr = this.legReach * 0.97;', 'const d = _v5.length(), mxr = walkFootReach(this, this.feet[i]);', 'walking planted ankle reach');
    code=replaceOnce(code, 'B.hips.position.y -= Math.max(drop * 0.85, this.hipDrop);', 'B.hips.position.y -= walkPelvisDrop(this, Math.max(drop * 0.85, this.hipDrop));', 'walking support pelvis reach');
    code=replaceOnce(code, 'this.tread = this.hs < 0.12 && sv > 0.4 && lml > 0.05 && this.grounded;', 'this.tread = walkTreadAllowed(this, this.hs < 0.12 && sv > 0.4 && lml > 0.05 && this.grounded);', 'walking actual root treadmill');
    code=replaceOnce(code, 'const lock = kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1));', 'const lock = dualiesMotionLock(this, R, kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1)));', 'dualies native pre-aim admission');
    code=replaceOnce(code, 'this.tr[T_DODGE] > this.dodgeDur * 0.86', 'dualiesMotionAllowsFootPlant(this, this.tr[T_DODGE] > this.dodgeDur * 0.86)', 'dualies native foot admission');
    code = replaceOnce(code, 'this.tr[T_LEAP] > 1.9 && this.tr[T_SLAM] > 1.4', 'specialMotionAllowsFootPlant(this, this.tr[T_LEAP] > 1.9 && this.tr[T_SLAM] > 1.4)', 'special foot-plant ownership');
    code = replaceOnce(code, 'st.sinceFlick = this.tr[T_FLICK];', 'st.sinceFlick = this.s3RollerFlick?.elapsed ?? this.tr[T_FLICK];', 'roller weapon elapsed clock');
    code = replaceOnce(code, "    if (tr[T_FLICK] < 0.7 && this.weaponKind === 'roller') this._poseFlick(P, tr[T_FLICK]);", "    if (this.weaponKind === 'roller' && (this.s3RollerFlick ? this.s3RollerFlick.elapsed < this.s3RollerFlick.interval : tr[T_FLICK] < 0.7)) this._poseFlick(P, tr[T_FLICK]);", 'roller recovery pose duration');
    // Capture actual native pose methods before installers decorate them.
    // Both named source connections are mandatory; no private pose copy.
    for (const [anchor, label] of [['  _poseThrow(P, tt) {', 'native bomb throw pose'], ['  _applyPose(dt, s) {', 'native bomb pose application']])
      code = replaceOnce(code, anchor, anchor, label);
    code += '\nexport const CHARACTER_BOMB_POSE = Object.freeze({ throw: Character.prototype._poseThrow, apply: Character.prototype._applyPose });\n';
    return "import { dualiesMotionLock, dualiesMotionAllowsFootPlant } from '../../patches/splatoon3/runtime/action-admission.mjs';\nimport { specialMotionAllowsFootPlant } from '../../patches/splatoon3/runtime/special-motion.mjs';\nimport { applyWalkLocomotion, walkLean, walkSwingUnloaded, walkFootReach, walkPelvisDrop, walkTreadAllowed, walkActive } from '../../patches/splatoon3/runtime/walk.mjs';\n"+code;
  }
  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(code,
      '        <circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/></svg>`;',
      '        <circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/></svg><span class="iw-ret__bias" hidden aria-hidden="true"></span>`;',
      'Blaster outer-bias cue element');
    code = replaceOnce(code,
      '    this._L.spread = null; this._L.charge = null; this._L.full = null;',
      '    this._L.spread = null; this._L.charge = null; this._L.full = null;\n' +
      '    this._L.blasterCue = null; this._L.blasterCuePhase = null;\n' +
      '    this._blasterBiasEl = kind === \'blaster\' ? r.querySelector(\'.iw-ret__bias\') : null;',
      'Blaster outer-bias cue ownership');
    code = replaceOnce(code,
      '    const ch = f.crosshair || {};',
      '    const ch = f.crosshair || {};\n' +
      '    const localActor = this._local();\n' +
      '    const jumpState = L.kind === \'blaster\' ? localActor?.weaponRunner?.s3BlasterJumpState?.(localActor.weapon) : null;\n' +
      '    const cueActive = !!(jumpState?.supported && jumpState.active);\n' +
      '    if (this._blasterBiasEl) {\n' +
      '      const percent = cueActive ? Math.round(jumpState.bias * 100) : 0;\n' +
      '      const cuePhase = cueActive ? jumpState.phase : \'idle\';\n' +
      '      const cue = !cueActive ? \'\' : cuePhase === \'held\' ? `OUTER ${percent}%`\n' +
      '        : cuePhase === \'recovering\' ? \'RECOVERING\' : `OUTER ${percent}%`;\n' +
      '      if (cue !== L.blasterCue || cuePhase !== L.blasterCuePhase) {\n' +
      '        L.blasterCue = cue; L.blasterCuePhase = cuePhase;\n' +
      '        this._blasterBiasEl.hidden = !cueActive;\n' +
      '        this._blasterBiasEl.textContent = cue;\n' +
      '        this._blasterBiasEl.dataset.phase = cuePhase;\n' +
      '      }\n' +
      '    }',
      'Blaster sourced bias and recovery presentation');
    code = replaceOnce(code,
      '// ------------------------------------------------------------------ HUD-only art',
      "// Splatoon 3 drives the charge reticle off the runner's fixed-tick charge clock, never the\n" +
      "// render cadence. The standard Splat Charger keeps the whole reticle off for its profile's\n" +
      "// 5F display delay, then fills (chargeFrames - delay) / (fullChargeFrames - delay), so 6F\n" +
      "// already reads 1/55. `delayed` separates a real charge still inside that dead period from\n" +
      "// an idle runner, so only the former hides the reticle: idle Charger/Splatling visibility is\n" +
      "// a separate owner and is deliberately not gated here. Presentation only: the authoritative\n" +
      "// runner charge, shot damage, range, ink cost and projectile timing are never read back.\n" +
      'function chargerReticleView(runner, w) {\n' +
      '  if (!runner || !runner.charging) return { visible: false, charging: false, delayed: false, gauge: 0 };\n' +
      '  const fullFrames = Math.max(1, Math.round((w.chargeTime || 1) * 60));\n' +
      '  const frames = Math.max(0, +runner.chargeT || 0) * fullFrames;\n' +
      '  const delay = Math.max(0, +w.reticleDelayF || 0);\n' +
      '  if (frames <= delay + 1e-9) return { visible: false, charging: true, delayed: true, gauge: 0 };\n' +
      '  return { visible: true, charging: true, delayed: false, gauge: clamp((frames - delay) / Math.max(1, fullFrames - delay)) };\n' +
      '}\n' +
      '\n' +
      '// ------------------------------------------------------------------ HUD-only art',
      'charger charge-reticle display delay helper');
    code = replaceOnce(code,
      "    if (L.kind === 'charger') {\n      const c = clamp(+f.charge || 0);\n      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {\n        L.charge = c;\n        this._chargeEl.style.strokeDashoffset = (this._chargeC * (1 - c)).toFixed(2);\n        this.ret.style.setProperty('--ch', c.toFixed(3));\n      }\n      const full = c >= 0.999;\n      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }\n      const charging = c > 0.001;\n      if (charging !== L.charging) { L.charging = charging; this.ret.classList.toggle('is-charging', charging); }\n    } else if",
      "    if (L.kind === 'charger') {\n      const view = chargerReticleView(this._local()?.weaponRunner, WEAPONS[w] || {});\n      const c = view.gauge;\n      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {\n        L.charge = c;\n        this._chargeEl.style.strokeDashoffset = this._chargeC * (1 - c);\n        this.ret.style.setProperty('--ch', c.toFixed(3));\n      }\n      const full = view.visible && c >= 0.999;\n      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }\n      const charging = view.visible;\n      if (charging !== L.charging) { L.charging = charging; this.ret.classList.toggle('is-charging', charging); }\n      const delayed = view.delayed;\n      if (delayed !== L.chargeDelay) { L.chargeDelay = delayed; this.ret.classList.toggle('is-charge-delay', delayed); }\n    } else if",
      'charger charge-reticle display delay');
    code = replaceOnce(code,
      '    this._L.spread = null; this._L.charge = null; this._L.full = null;',
      '    this._L.spread = null; this._L.charge = null; this._L.full = null; this._L.chargeDelay = null;',
      'reset the charge-delay reticle gate on rebuild');
    code = replaceOnce(code,
      "    if (L.kind === 'slosher') {",
      "    // S3 charge-reticle lifecycle (#594): a charging weapon shows no charge cluster while idle.\n" +
      "    if (L.kind === 'charger' || L.kind === 'splatling') {\n" +
      "      const retIdle = !(+f.charge > 0.001) && !(L.kind === 'splatling' && !!L.streaming);\n" +
      "      this.ret.classList.toggle('is-idle', retIdle);\n" +
      "    }\n" +
      "    if (L.kind === 'slosher') {",
      'idle charge reticle lifecycle');
    // #631: teammate death location is disclosed only by the explicit Ouch signal.
    code = replaceOnce(code, '    if (me && victim.team === me.team) this._allyDown(victim, attacker);\n', '', 'automatic ally-down marker (#631)');
    code = replaceOnce(code,
      "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {",
      "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES, winner: authoritativeWinner = null } = {}) {",
      'authoritative Turf winner HUD input');
    code = replaceOnce(code,
      '      const winner = Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
      '      const winner = authoritativeWinner === 0 || authoritativeWinner === 1 ? authoritativeWinner : Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
      'authoritative Turf winner HUD reveal');
    code = replaceOnce(code, 'const lock = !!(lr && lr.lockT > 0), roll = !!(lr && lr.dodge);',
      'const lock = !!(lr && lr.s3Turret), roll = !!(lr && lr.dodge);', 'Dualies HUD authoritative turret lifetime');
    code = replaceOnce(code,
      `    } else if (kind === 'slosher') {
      // the lob: an arch over the aim point and a landing "bucket" bracket under it
      r.innerHTML = \`<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="iw-ret__ring iw-ret__arch" d="M-24 6 Q0 -26 24 6"/><path class="iw-ret__ring thin" d="M-10 13 L-6 18 L6 18 L10 13"/>
        <path class="iw-ret__ring thin" d="M-24 6 L-27 1 M24 6 L27 1"/></svg>\`;
    } else if (kind === 'splatling') {`,
      `    } else if (kind === 'splatling') {`, 'slosher trajectory reticle (#652)');
    code = replaceOnce(code,
      `    if (L.kind === 'slosher') {
      const k = this._kick;
      if (L.bk == null || Math.abs(k - L.bk) > 0.02) { L.bk = k; this.ret.style.setProperty('--kk', k.toFixed(2)); }
    }
    // spawn shield + bomb aim`,
      `    // spawn shield + bomb aim`, 'slosher arch kick writer (#652)');
    code = replaceOnce(code,
      '    const ch = f.crosshair || {};',
      '    const ch = f.crosshair || {};\n    applyShotGuide(this, ch.guide, innerWidth, innerHeight);\n' +
      '    const muzzleBlock = L.kind === \'shooter\' && Number.isFinite(ch.muzzleBlock?.x) && Number.isFinite(ch.muzzleBlock?.y) ? ch.muzzleBlock : null;\n' +
      '    const muzzleBlockKey = muzzleBlock ? `${muzzleBlock.x.toFixed(1)}|${muzzleBlock.y.toFixed(1)}` : \'\';\n' +
      '    if (muzzleBlockKey !== L.muzzleBlock) {\n' +
      '      L.muzzleBlock = muzzleBlockKey;\n' +
      '      if (muzzleBlock) {\n' +
      '        this.xh.style.setProperty(\'--muzzle-hit-x\', `${muzzleBlock.x.toFixed(1)}px`);\n' +
      '        this.xh.style.setProperty(\'--muzzle-hit-y\', `${muzzleBlock.y.toFixed(1)}px`);\n' +
      '      }\n' +
      '    }\n' +
      '    this.xh.classList.toggle(\'is-muzzle-blocked\', !!muzzleBlock);',
      'S3 ShotGuideFrame reticle placement');
    code = replaceOnce(code,
      '    } else if (kind === \'roller\') {\n' +
      '      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg wide" viewBox="-80 -40 160 80" aria-hidden="true">\n' +
      '        <path class="iw-ret__ring" d="M-46 -15 L-56 -15 Q-60 -15 -60 -11 L-60 11 Q-60 15 -56 15 L-46 15"/>\n' +
      '        <path class="iw-ret__ring" d="M46 -15 L56 -15 Q60 -15 60 -11 L60 11 Q60 15 56 15 L46 15"/>\n' +
      '        <path class="iw-ret__ring thin" d="M-30 22 Q0 30 30 22"/></svg>`;',
      '    } else if (kind === \'roller\') {\n' +
      '      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">\n' +
      '        <circle r="7.5" class="iw-ret__ring thin"/>\n' +
      '        <path class="iw-ret__ring thin" d="M-25.04 -15.15 L-27.11 -11.04"/>\n' +
      '        <path class="iw-ret__ring thin" d="M27.27 -10.92 L25.23 -15.04"/>\n' +
      '        <path class="iw-ret__ring thin" d="M-27.05 11.04 L-24.98 15.15"/>\n' +
      '        <path class="iw-ret__ring thin" d="M25.04 15.15 L27.11 11.04"/></svg>`;',
      'compact Roller reticle');
    code = replaceOnce(code,
      '    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)',
      `    // S3 weapon ShotGuide projection: only aiming feedback moves; tank/sub/status remain centred.
    let guideX = 0, guideY = 0;
    const guideMe = this._local(), guideCam = G.rig?.gameCam || G.camera;
    if (L.kind === 'slosher' || L.kind === 'blaster') {
      const point = guideMe && guideCam && G.projectiles?.s3WeaponGuide?.(guideMe, guideMe.weapon, guideCam, innerWidth, innerHeight);
      const projected = point ? this._project(guideCam, point.x, point.y, point.z) : null;
      if (projected && projected.z < 1) {
        guideX = projected.x * innerWidth * 0.5;
        guideY = -projected.y * innerHeight * 0.5;
      }
    }
    const guideKey = \`\${guideX.toFixed(1)}|\${guideY.toFixed(1)}\`;
    if (guideKey !== L.guide) {
      L.guide = guideKey;
      this.xh.style.setProperty('--gx', \`\${guideX.toFixed(1)}px\`);
      this.xh.style.setProperty('--gy', \`\${guideY.toFixed(1)}px\`);
    }
    if (L.kind === 'dualies') {
      const pair = guideMe && guideCam && G.projectiles?.s3DualiesGuides?.(guideMe, guideMe.weapon);
      const projected = pair?.map(point => this._project(guideCam, point.x, point.y, point.z)) || [];
      const offsets = projected.map(point => point && point.z < 1
        ? [point.x * innerWidth * .5, -point.y * innerHeight * .5] : [0, 0]);
      const key = offsets.map(v => v.map(n => n.toFixed(1)).join(',')).join('|');
      if (key !== L.dualGuide && this._twin && offsets.length === 2) {
        L.dualGuide = key;
        const turret = !!guideMe?.weaponRunner?.s3Turret;
        for (let i = 0; i < 2; i++) {
          const baseX = i === 0 ? 10.5 : -10.5;
          const lockX = turret ? (i === 0 ? 4 : -4) : 0;
          this._twin[i]?.setAttribute('transform',
            \`translate(\${(offsets[i][0] - baseX + lockX).toFixed(2)} \${offsets[i][1].toFixed(2)})\`);
        }
      }
    } else if (L.dualGuide != null) {
      L.dualGuide = null;
      for (const twin of this._twin || []) twin?.removeAttribute('transform');
    }
    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)`,
      'S3 weapon ShotGuide HUD projection');
    code = replaceOnce(code,
      '    const pad = G.level && G.level.spawnPads && G.level.spawnPads[me.team];',
      '    const pad = G.level && (G.level.homeSuperJumpPoints?.[me.team] || G.level.spawnPads?.[me.team]);',
      'home Super Jump HUD target');
    code = replaceOnce(code,
      "    const el = h('div', { class: 'iw-lineup' },\n" +
      "      side(this._myTeam()),\n" +
      "      h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),\n" +
      "      side(1 - this._myTeam()));",
      "    // Issue #673: Splashtag intro identity.\n" +
      "    // Presentation metadata rides the native style payload (a.style.splashtag) that\n" +
      "    // src/net/session.js already packs as {name, weapon, style}; there is no a.profile\n" +
      "    // or a.tag producer, so nothing else is consulted. Exactly three safe shapes reach\n" +
      "    // the DOM: a numeric banner seed, a trusted in-repo asset key, and plain text.\n" +
      "    // Raw markup is never accepted, so no remote field can smuggle active content\n" +
      "    // into innerHTML through a value that only looks safe.\n" +
      "    const stagOf = (a) => (a && a.style && typeof a.style === 'object' && a.style.splashtag && typeof a.style.splashtag === 'object' && !Array.isArray(a.style.splashtag)) ? a.style.splashtag : null;\n" +
      "    const stagText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');\n" +
      "    const stagSeed = (v) => {\n" +
      "      if (typeof v === 'number') return Number.isFinite(v) ? v : null;\n" +
      "      if (typeof v === 'string' && /^[0-9]+$/.test(v.trim())) return Number(v.trim());\n" +
      "      return null;\n" +
      "    };\n" +
      "    const renderBadge = (b) => {\n" +
      "      const rec = (b && typeof b === 'object') ? b : null;\n" +
      "      const key = stagText(rec ? (rec.key ?? rec.id) : b, 32);\n" +
      "      if (key) {\n" +
      "        if (typeof GLYPHS !== 'undefined' && GLYPHS[key]) return h('span', { class: 'iw-stag__badge iw-stag__badge--glyph', title: key, html: GLYPHS[key] });\n" +
      "        if (typeof AWARDS !== 'undefined' && AWARDS[key]) {\n" +
      "          const aw = AWARDS[key];\n" +
      "          return h('span', { class: 'iw-stag__badge iw-stag__badge--award is-' + (aw.metal || 'gold'), title: stagText(aw.label, 48), html: awardIcon(aw.icon) });\n" +
      "        }\n" +
      "        if (typeof AWARD_ICONS !== 'undefined' && AWARD_ICONS[key]) return h('span', { class: 'iw-stag__badge iw-stag__badge--award', title: key, html: awardIcon(key) });\n" +
      "      }\n" +
      "      const label = stagText(rec ? (rec.label ?? rec.text) : b, 8);\n" +
      "      if (label && /^[A-Za-z0-9_ -]+$/.test(label)) return h('span', { class: 'iw-stag__badge iw-stag__badge--text', title: label }, label.slice(0, 4));\n" +
      "      return null;\n" +
      "    };\n" +
      "    const makeStag = (a, i) => {\n" +
      "      const nm = stagText(a.name, 32) || 'Player';\n" +
      "      const stag = stagOf(a);\n" +
      "      const titleVal = stagText(stag && stag.title, 48) || tagTitle(nm);\n" +
      "      const rawNum = stagText(stag && (stag.num ?? stag.number), 16).replace(/^#/, '');\n" +
      "      const numVal = rawNum ? '#' + rawNum : tagNum(nm);\n" +
      "      const seed = stagSeed(stag && (stag.banner ?? stag.bannerSeed));\n" +
      "      const artHtml = tagArt(seed === null ? fnv(String(nm).toLowerCase()) : seed);\n" +
      "      const rawBadges = stag && stag.badges;\n" +
      "      const badgeEls = Array.isArray(rawBadges) ? rawBadges.slice(0, 3).map(renderBadge).filter(Boolean) : [];\n" +
      "      const card = h('div', { class: 'iw-stag iw-stag--intro' + (a.isLocal ? ' is-self' : ''), style: { '--i': i } },\n" +
      "        h('span', { class: 'iw-stag__art', html: artHtml }),\n" +
      "        h('span', { class: 'iw-stag__w', html: weaponIcon(kindOf(a.weaponId)) }),\n" +
      "        h('span', { class: 'iw-stag__txt' },\n" +
      "          h('span', { class: 'iw-stag__title' }, titleVal),\n" +
      "          h('b', { class: 'iw-stag__name' }, nm)),\n" +
      "        h('span', { class: 'iw-stag__num' }, numVal),\n" +
      "        h('span', { class: 'iw-stag__badges' }, ...badgeEls));\n" +
      "      colorVars(card, 'tc', col(a.team));\n" +
      "      return card;\n" +
      "    };\n" +
      "    const teamSide = (t) => {\n" +
      "      const list = actors.filter((a) => a.team === t);\n" +
      "      return h('div', { class: 'iw-lineup__col iw-lineup__col--' + (t ? 'b' : 'a') },\n" +
      "        list.map((a, i) => makeStag(a, i)));\n" +
      "    };\n" +
      "    const el = h('div', { class: 'iw-lineup iw-lineup--stags' },\n" +
      "      teamSide(0),\n" +
      "      teamSide(1));",
      'intro Splashtags presentation');
    code = replaceOnce(code,
      '  _bindBus() {',
      `  _showSuperJumpTarget(actor) {
    if (!this.el || !actor) return;
    if (!this._sjTargetCue) {
      const cue = document.createElement('div');
      cue.className = 'iw-superjump-target-cue';
      cue.setAttribute('role', 'status');
      cue.setAttribute('aria-live', 'polite');
      Object.assign(cue.style, {
        position: 'absolute', left: '50%', top: '19%', zIndex: '20',
        transform: 'translateX(-50%)', minWidth: '9rem', maxWidth: 'min(80vw, 24rem)',
        padding: '0.65rem 2rem 0.65rem 0.9rem', boxSizing: 'border-box',
        clipPath: 'polygon(0 0, calc(100% - 1.2rem) 0, 100% 50%, calc(100% - 1.2rem) 100%, 0 100%)',
        background: 'linear-gradient(100deg, #26354a 0%, #42647b 100%)',
        color: '#fff', font: '700 1rem/1.2 system-ui, sans-serif', textAlign: 'center',
        textShadow: '0 1px 2px #000', pointerEvents: 'none', opacity: '0',
      });
      const name = document.createElement('span');
      cue.appendChild(name);
      this.el.appendChild(cue);
      this._sjTargetCue = cue;
      this._sjTargetCueName = name;
    }
    this._sjTargetCueName.textContent = String(actor.name || actor.character?.name || 'Teammate');
    this._sjTargetCueAnimation?.cancel?.();
    const cue = this._sjTargetCue;
    cue.style.opacity = '1';
    this._sjTargetCueAnimation = typeof cue.animate === 'function' ? cue.animate(
      [{ opacity: 1, transform: 'translateX(-50%) scale(0.94)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }, { opacity: 0, transform: 'translateX(-50%) scale(1)' }],
      { duration: 1200, easing: 'ease-out', fill: 'forwards' }) : null;
    if (!this._sjTargetCueAnimation) cue.style.opacity = '1';
  }
  _bindBus() {`,
      'Super Jump target notification HUD cue');
    code = replaceOnce(code,
      "    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor);",
      "    const ticket = tg.home ? null : me.selectSuperJumpTarget(tg.actor);\n    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor, ticket);",
      'MapRoster Super Jump target selection cue');
    code = replaceOnce(code,
      "    on('superjump', ({ actor, phase, to }) => { if (actor === this._local() && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 }); void to; }),",
      `    on('superjump', ({ actor, phase, to, target }) => {
      const local = this._local();
      if (actor === local && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 });
      if (phase === 'target' && target === local && actor !== local && Number.isFinite(local?.team) && actor?.team === local.team && this._live()) this._showSuperJumpTarget(actor);
      void to;
    }),`,
      'exact recipient Super Jump target event');
    code = adaptJuddResult(rel, code, replaceOnce);
    return "import { t as tr } from '../i18n.js';\nimport { applyShotGuide } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\nimport { tagArt, AWARDS, AWARD_ICONS, awardIcon } from './menu-art.js';\nimport { fnv, tagTitle, tagNum } from './menus.js';\n" + code;
  }
  if (rel === 'src/ui/ui-icons.js') {
    return replaceOnce(code,
      'return `<div class="iw-logo iw-logo--${size}">',
      'return `<div class="iw-logo iw-logo--${size} notranslate" translate="no">',
      'logo translation lock');
  }
  if (rel === 'index.html') {
    code = replaceOnce(code, '<script type="module" src="./src/main.js"></script>',
      '<script type="module" src="./patches/splatoon3/bootstrap.mjs"></script>', 'entry');
    code = replaceOnce(code, '</head>',
      '<meta name="mobile-web-app-capable" content="yes">\n' +
      '<meta name="apple-mobile-web-app-title" content="INKWAVE">\n' +
      '<link rel="manifest" href="./patches/splatoon3/pwa/manifest.webmanifest">\n' +
      '<link rel="icon" type="image/svg+xml" href="./patches/splatoon3/pwa/icon.svg">\n' +
      '<link rel="apple-touch-icon" sizes="192x192" href="./patches/splatoon3/pwa/icon-192.png">\n' +
      '<link rel="stylesheet" href="./patches/splatoon3/ui.css">\n</head>', 'patch styles and pwa');
    return replaceOnce(code, '</body>',
      '<script>if ("serviceWorker" in navigator && location.protocol === "https:") { addEventListener("load", () => { const root = new URL("./", location.href); navigator.serviceWorker.register(new URL("sw.js", root).href, { scope: root.pathname }).catch(() => {}); }); }</script>\n</body>',
      'pwa service worker');
  }
  if (rel === 'src/world/level.js') {
    code = replaceOnce(code,
      '    this.spawnPads = layout.spawnPads.map((p) => new THREE.Vector3(...p));',
      '    this.spawnPads = layout.spawnPads.map((p) => new THREE.Vector3(...p));\n    this.homeSuperJumpPoints = (layout.homeSuperJumpPoints || layout.spawnPads).map((p) => new THREE.Vector3(...p));',
      'home Super Jump points');
    return code;
  }
  if (rel === 'src/world/maps.js') {
    code = replaceOnce(code, '  spawnPads: [[0, 2.2, -39.2], [0, 2.2, 39.2]],',
      '  spawnPads: [[0, 2.2, -39.2], [0, 2.2, 39.2]],\n  homeSuperJumpPoints: [[0, 0, -33.5], [0, 0, 33.5]],', 'Tidewater home Super Jump');
    code = replaceOnce(code, '  spawnPads: [[0, 3.2, -44], [0, 3.2, 44]],',
      '  spawnPads: [[0, 3.2, -44], [0, 3.2, 44]],\n  homeSuperJumpPoints: [[0, 0, -38.5], [0, 0, 38.5]],', 'Kelpline home Super Jump');
    code = replaceOnce(code, '  spawnPads: [[0, 2.4, -42], [0, 2.4, 42]],',
      '  spawnPads: [[0, 2.4, -42], [0, 2.4, 42]],\n  homeSuperJumpPoints: [[0, 0, -31.5], [0, 0, 31.5]],', 'Halyard home Super Jump');
    return code;
  }
  if (rel === 'src/world/stages/cargo/layout.js') {
    code = replaceOnce(code, 'const pad = W(0, 2.6, -43.6);',
      'const pad = W(0, 2.6, -43.6);\nconst home = W(0, 0, -36.5);', 'Cargo home Super Jump datum');
    code = replaceOnce(code, '  spawnPads: [pad, [-pad[0], pad[1], -pad[2]]],',
      '  spawnPads: [pad, [-pad[0], pad[1], -pad[2]]],\n  homeSuperJumpPoints: [home, [-home[0], home[1], -home[2]]],', 'Cargo home Super Jump');
    return code;
  }
  if (rel === 'src/game/nav.js') {
    code = replaceOnce(code,
      '          for (let t = 0; t < 2; t++) {\n            const pad = L.spawnPads[t];\n            if (Math.hypot(x - pad.x, z - pad.z) < L.spawnBarrier + 0.6 && y > pad.y - 1) node.zone = t;\n          }',
      '          // No global spawn-radius navigation exclusion in the S3 composition.',
      'navigation spawn-radius exclusion');
    code = replaceOnce(code, '    const heap = new Heap();',
      '    const heap = this._heap || (this._heap = new Heap()); heap.clear();', 'reusable A* heap');
    code = replaceOnce(code, '  constructor() { this.ids = []; this.pr = []; }',
      '  constructor() { this.ids = []; this.pr = []; this.n = 0; }\n  clear() { this.n = 0; }', 'heap logical length');
    code = replaceOnce(code, '  get size() { return this.ids.length; }',
      '  get size() { return this.n; }', 'heap logical size');
    code = replaceOnce(code, '    let i = ids.length; ids.push(id); pr.push(p);',
      '    let i = this.n++; ids[i] = id; pr[i] = p;', 'heap push reuse');
    code = replaceOnce(code,
      '    const top = ids[0];\n    const lid = ids.pop(), lp = pr.pop();\n    if (ids.length) {\n      let i = 0; const n = ids.length;',
      '    const top = ids[0];\n    const n = --this.n, lid = ids[n], lp = pr[n];\n    if (n) {\n      let i = 0;',
      'heap pop reuse');
    return code;
  }
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '    const ax = pad.axes;', `    const touchContact = this.lastDevice === 'touch' && this.mobile?.active && !this.mobile._destroyed &&
      ((this.mobile._ptr?.size || 0) > 0 || (this.mobile._stick?.id ?? -1) >= 0);
    const ax = pad.axes;`, 'live touch gesture owns axis arbitration');
    return replaceOnce(code,
      "if (Math.abs(ax[0]) > 0.3 || Math.abs(ax[1]) > 0.3 || Math.abs(ax[2]) > 0.3 || Math.abs(ax[3]) > 0.3) this.lastDevice = 'pad';",
      "if (!touchContact && (Math.abs(ax[0]) > 0.3 || Math.abs(ax[1]) > 0.3 || Math.abs(ax[2]) > 0.3 || Math.abs(ax[3]) > 0.3)) this.lastDevice = 'pad';",
      'held axis cannot cancel live touch');
  }
  if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '  update(dt) {', `  _s3ClearDisabledLook() {
    if (this.padLook) this.padLook.x = this.padLook.y = 0;
    this.edgeT = 0;
    if (this.assist) this.assist.has = false;
  }
  get enabled() { return this._s3Enabled; }
  set enabled(value) {
    if (!value && this._s3Enabled) this._s3ClearDisabledLook();
    this._s3Enabled = value;
  }
  update(dt) {`, 'controller disable neutralizes transient pad look');
    const start = code.indexOf('    if (this.onTarget && this.onTarget !== G.boss) {');
    const end = code.indexOf('    // is the crosshair point inside', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: camera aim connection');
    code = code.slice(0, start) + code.slice(end);
    code = replaceOnce(code, '    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n  }',
      '    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n    updateShotGuide(this);\n  }', 'S3 ShotGuideFrame guide point');
    code = replaceOnce(code, "it.jump = inp.down('Space')", "it.jump = inp.wasPressed('Space') || inp.padPressed.has(0) || inp.down('Space')", 'latched jump input');
    code = replaceOnce(code, "it.squid = inp.down('ShiftLeft')", "it.squid = inp.wasPressed('ShiftLeft') || inp.wasPressed('ShiftRight') || inp.down('ShiftLeft')", 'latched squid input');
    code = replaceOnce(code, 'it.fire = inp.mouse.left ||', 'it.fire = inp.mouse.leftPressed || inp.mouse.left ||', 'latched fire input');
    code = replaceOnce(code, "it.sub = inp.mouse.right || inp.down('KeyE')", "it.sub = inp.mouse.rightPressed || inp.wasPressed('KeyE') || inp.mouse.right || inp.down('KeyE')", 'latched sub input');
    code = replaceOnce(code, "it.special = inp.down('KeyF')", "it.special = inp.wasPressed('KeyF') || inp.wasPressed('KeyQ') || inp.down('KeyF')", 'latched special input');
    code = replaceOnce(code, "    const range = w.kind === 'charger' ? w.rangeMax : w.kind === 'roller' ? 6 : (w.range || 12);",
      "    const chargeNow = clamp(w.kind === 'splatling' ? (a.weaponRunner?.streaming ? (a.weaponRunner?.fidelitySplatlingCharge ?? a.weaponRunner?.charge ?? 0) : (a.weaponRunner?.charge ?? 0)) : (a.weaponRunner?.s3Stored?.charge ?? a.weaponRunner?.charge ?? 0), 0, 1);\n" +
      "    const range = w.kind === 'charger' ? (G.projectiles?.chargerReach ? G.projectiles.chargerReach(chargeNow) : w.rangeMin + (w.rangeMax - w.rangeMin) * chargeNow) : w.kind === 'splatling' ? (G.projectiles?.splatlingReach ? G.projectiles.splatlingReach(w, chargeNow) : (w.range || 12)) : w.kind === 'roller' ? 6 : (w.range || 12);",
      'Charger and Splatling HUD reach follow charge');
    code = replaceOnce(code,
      '    const pick = (i) => { const o = allies[i]; if (o && o.alive && !o.superJumpState) a.superJump(o); };',
      `    const pick = (i) => {
      const o = allies[i];
      if (o && o.alive && !o.superJumpState) {
        const ticket = a.selectSuperJumpTarget?.(o);
        a.superJump(o, ticket);
      }
    };`,
      'player map Super Jump target selection cue');
    return "import { updateShotGuide } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n" + code;
  }
  if (rel === 'src/game/weapons.js') {
    code = replaceOnce(code, 'r = Math.sqrt(Math.random()) * sp.radius;', 'r = Math.sqrt(Math.random()) * (sp.radius * s);', 'storm rain paint active radius');
    code = replaceOnce(code, 'if (a.ink < w.rollInk) { this._empty(); return false; }', 'if (a.ink + 1e-10 < w.rollInk) { this._empty(); return false; }', 'dualies equipped-cost float boundary');
    code = replaceOnce(code, 'a.ink -= w.rollInk; a.lastFire = 0;', 'a.ink = Math.max(0, a.ink - w.rollInk); a.lastFire = 0;', 'dualies exact payment nonnegative');
    code = replaceOnce(code, 'Math.max(this.cooldown, 0.22)', 'Math.max(this.cooldown, w.postStreamDelay)', 'splatling sourced post-stream delay');
    code = replaceOnce(code, 'if (this.slosh >= 0) return w.moveSpeedFiring * 0.7;              // slosher heave plants you a little',
      'if (this.slosh >= 0) return w.moveSpeedFiring; // shared sourced firing cap', 'slosher windup sourced move cap');
    code = replaceOnce(code,
      '    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));',
      "    if (this.flick >= 0 && w.kind === 'roller') return w.moveSpeedFiring; // S3 swing target is independent of windup progress\n    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));",
      'roller swing movement target');
    code = replaceOnce(code, 'lerp(w.damageMin, w.damageMax * 0.62, charge)',
      'chargerDamage(a, w, charge)', 'charger partial damage curve');
    code = replaceOnce(code, 'a.ink < w.inkFull * 0.2', 'a.ink < w.inkMin', 'charger minimum ink');
    code = replaceOnce(code, 'a.ink - w.inkFull * c', 'a.ink - Math.max(w.inkMin, w.inkFull * c)', 'charger ink floor');
    code = replaceOnce(code, 'const c = Math.max(0.12, this.charge);', 'const c = this.charge;', 'charger partial charge floor');
    code = replaceOnce(code, "          if (dmg > 0) this.applyHit(p.owner, e, dmg, p.wid || p.type);",
      '          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);', 'projectile damage model');
    code = replaceOnce(code, '      this.charge = Math.min(1, this.chargeT / w.chargeTime);',
      '      this.charge = Math.min(1, this.chargeT / w.chargeTime, splatlingChargeCap(a.ink, w));', 'splatling ink charge cap');
    code = replaceOnce(code, "      this.applyHit(b.owner, e, lerp(s.damageMin, s.damageMax, k * k), 'bomb');",
      "      this.applyHit(b.owner, e, distanceDamage(s.damageBands, d, false), d > s.damageBands[0][0] ? 'splat-bomb-far' : 'bomb');", 'bomb damage bands');
    code = replaceOnce(code, "      this.applyHit(p.owner, e, lerp(w.splashDamageMax, w.splashDamageMin, d / w.splashRadius), 'blaster');",
      "      this.applyHit(p.owner, e, distanceDamage(w.damageBands, d), 'blaster');", 'blaster damage bands');
    code = replaceOnce(code, '      b.vel.y -= 24 * dt;', '      b.vel.y -= (b.kind === \'bomb\' ? SUB.bomb.gravity : 24) * dt;', 'bomb gravity');
    code = replaceOnce(code, 'const pos = _v.copy(a.pos); pos.y += 1.35;', 'const pos = _v.copy(a.pos); pos.y += 1.35; bombReleasePosition(a, pos);', 'bomb release origin');
    code = replaceOnce(code, 'const p = _v.copy(a.pos); p.y += 1.35;', 'const p = _v.copy(a.pos); p.y += 1.35; bombPreviewPosition(a, p);', 'bomb preview origin');
    code = replaceOnce(code, '        vel.y -= 24 * dt;', '        vel.y -= SUB.bomb.gravity * dt;', 'bomb preview gravity');
    code = replaceOnce(code, 'if (b.fuse <= 0) {', 'if (b.fuse <= 1e-10) {', 'bomb fuse frame boundary');
    code = replaceOnce(code, 'if (c.t < c.dur - 0.3) {', 'if (c.t <= c.dur + 1e-10) {', 'storm rain through final reference tick');
    // #246: the Ink Storm cloud belongs to the device's first real terrain/object
    // contact. The old `age > 1.1` branch deployed a cloud from elapsed air time
    // alone, so a device that had not hit anything rained mid-air. Keep only a
    // non-gameplay memory guard for a device that never contacts anything; it
    // releases the device without a cloud and is not an S3 timing value.
    code = replaceOnce(code,
      "if (b.kind === 'storm' && b.age > 1.1) { this._spawnCloud(b); if (b.ghost) this.clouds[this.clouds.length - 1].ghost = true; this._releaseBomb(b); this.bombs.splice(i, 1); continue; }",
      "if (b.kind === 'storm' && b.age > 30) { this._releaseBomb(b); this.bombs.splice(i, 1); continue; }",
      'storm airborne deploy');
    code = replaceOnce(code, '  clear() {',
      '  // Pooled records wait inside the persistent G.projectiles pool across matches;\n' +
      '  // sever the Actor reference before the record is pooled (#622).\n' +
      '  _recycle(p) {\n' +
      '    p.owner = null;\n' +
      '    this.pool.push(p);\n' +
      '  }\n\n' +
      '  clear() {', 'projectile owner-severing recycle helper');
    code = replaceOnce(code, '  clear() {\n    for (const p of this.list) this.pool.push(p);',
      '  clear() {\n    for (const p of this.list) this._recycle(p);',
      'clear recycles without owners');
    code = replaceOnce(code, '{ list[i] = list[list.length - 1]; list.pop(); this.pool.push(p); } }',
      '{ list[i] = list[list.length - 1]; list.pop(); this._recycle(p); } }',
      'normal completion recycles without owners');
    code = adaptWeaponEdgecases(rel, code, replaceOnce);
    code = adaptChargerSightCache(rel, code, replaceOnce);
    code = adaptWeaponPaintInertia(rel, code, replaceOnce);
    code = adaptWeaponsFidelity(code, replaceOnce);
    code = adaptKitRescue(rel, code, replaceOnce);
    code = adaptAgent3WeaponPhysics(rel, code, replaceOnce);
    return `import { applyProjectileHit, chargerDamage, distanceDamage, splatlingChargeCap } from '../../patches/splatoon3/runtime/weapons.mjs';\nimport { bombReleasePosition, bombPreviewPosition } from '../../patches/splatoon3/runtime/bomb-motion.mjs';\n` + code;
  }
  if (rel === 'src/fx/swimWake.js') {
    code = replaceOnce(code, "        if (f !== 'swim' && f !== 'climb') continue;",
      "        if ((f !== 'swim' && f !== 'climb') || !swimTrailVisible(a)) continue;", 'sneaking surface trail');
    return `import { swimTrailVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\n` + code;
  }
  if (rel === 'src/fx/fxHooks.js') {
    code = replaceOnce(code, "      if (form === 'swim' && hs > 4.5) {",
      "      if (form === 'swim' && hs > 4.5 && swimSplashVisible(a)) {", 'sneaking turn splash');
    code = adaptChargerSightCache(rel, code, replaceOnce);
    return `import { swimSplashVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\n` + code;
  }
  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(code,
      'const F = {',
      'const F = {\n  flickVertical: 16777216,',
      'network vertical Roller flag');
    code = replaceOnce(code,
      '  if (wr.flick >= 0) f |= F.flick;',
      '  if (wr.flick >= 0) f |= F.flick;\n  if (wr.s3RollerAttack?.vertical) f |= F.flickVertical;',
      'network vertical Roller owner state');
    code = replaceOnce(code,
      '    wr.flick = f & F.flick ? Math.max(0, wr.flick) : -1;\n    wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;',
      `    wr.flick = f & F.flick ? Math.max(0, wr.flick) : -1;
    if (a.weapon.kind === 'roller' && (f & F.flickVertical)) {
      const w = a.weapon;
      if (!wr.s3RollerAttack?.networkRemote) wr.s3RollerAttack = {
        networkRemote: true, vertical: true, windup: w.verticalWindup,
        interval: w.verticalInterval ?? w.flickInterval, elapsed: 0, released: false, rolling: false,
      };
      const attack = wr.s3RollerAttack;
      attack.elapsed = Math.min(attack.interval, attack.elapsed + Math.max(0, dt));
      attack.released = !(f & F.flick); attack.rolling = wr.rolling;
      wr.s3FlickVertical = true;
      a.character.s3RollerFlick = attack;
    } else if (wr.s3RollerAttack?.networkRemote) {
      wr.s3RollerAttack = null; wr.s3FlickVertical = false;
      a.character.s3RollerFlick = null;
    }
    wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;`,
      'network vertical Roller remote state');

    code = replaceOnce(code, '  invuln: 262144, enemy: 524288,',
      '  invuln: 262144, enemy: 524288, quietTrail: 1048576, quietSplash: 2097152, swimVisibility: 4194304,', 'swim visibility wire flags');
    code = replaceOnce(code, '  if (a.onEnemy) f |= F.enemy;',
      '  if (a.onEnemy) f |= F.enemy;\n  f |= F.swimVisibility;\n  if (!swimTrailVisible(a)) f |= F.quietTrail;\n  if (!swimSplashVisible(a)) f |= F.quietSplash;', 'owner swim visibility');
    code = replaceOnce(code, '    a.onEnemy = !!(f & F.enemy);',
      '    a.onEnemy = !!(f & F.enemy);\n    a.s3 ||= {};\n    a.s3.netSwimVisibility = f & F.swimVisibility ? { trail: !(f & F.quietTrail), splash: !(f & F.quietSplash) } : null;', 'proxy swim visibility');
    code = replaceOnce(code, "d: r2(dmg), w: wid", "d: dmg, w: wid, g: victim.s3PendingHitGroup || undefined", 'unrounded hit transport with optional group');
    code = replaceOnce(code, 'G.projectiles?.applyHit(atk, v, d.d, d.w);', 'G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);', 'receive final damage group');
    code = replaceOnce(code, '    victim.alive = false; victim.hp = 0;', '    victim.alive = false; victim.hp = 0; victim.superJumpGround = null;', 'remote jump target death');
    code = replaceOnce(code, '    a.alive = true; a.hp = PLAYER.hp;', '    a.superJumpGround = null;\n    a.alive = true; a.hp = PLAYER.hp;', 'remote jump target respawn');
    return `import { swimTrailVisible, swimSplashVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\n` + code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, 'this.fireBuffer = firePressed ? P.fireBuffer : Math.max(0, this.fireBuffer - dt);',
      'this.fireBuffer = firePressed ? rollerFireBuffer(this, P.fireBuffer, dt) : Math.max(0, this.fireBuffer - dt);', 'roller buffered squid-start press');
    code = replaceOnce(code, 'this.kidT >= P.emergeDelay',
      'this.kidT + 1e-10 >= rollerEmergeDelay(this, P.emergeDelay)', 'roller squid-start admission');

    code = replaceOnce(code, "    if (a.form === 'swim' && hs > 2 && G.fx) {",
      "    if (a.form === 'swim' && hs > 2 && G.fx && swimSplashVisible(this)) {", 'sneaking wake particles');
    code = replaceOnce(code, '    this.hp -= amount;', "    amount = finalWeaponDamage(this, amount, attacker, source);\n    if (amount <= 0) return false;\n    this.hp -= amount;\n    if (Math.abs(this.hp) < 1e-9) this.hp = 0;", 'final weapon HP quantization');
    code = replaceOnce(code, '    this.superJumpState = null;\n    this.yawVel', '    this.superJumpState = null; this.superJumpGround = null;\n    clearPendingLethal(this);\n    this.yawVel', 'reset super jump ground');
    code = replaceOnce(code, '    this.alive = false;\n    this.hp = 0;', '    this.alive = false;\n    clearPendingLethal(this);\n    this.superJumpState = null; this.superJumpGround = null;\n    this.hp = 0;', 'clear dead super jump');
    code = replaceOnce(code, '    if (this.invuln > 0) return false;', "    if (this.invuln > 0 || this.superJumpState?.phase === 'flight') return false;", 'super jump flight damage admission');
    code = replaceOnce(code, '    if (!this.alive || amount <= 0) return false;',
      '    if (!this.alive || amount <= 0) return false;\n    if (hasPendingLethal(this)) return false;', 'pending lethal damage admission');
    code = replaceOnce(code, '    if (this.hp <= 0) { this.splat(attacker, source); return true; }',
      '    if (this.hp <= 0) { scheduleLethal(this, attacker, source); return true; }', 'one-frame lethal decision delay');
    const actorUpdateHead = code.includes('  update(dt) {\n    advanceStormLock(this, dt);\n    this.anim.time = G.time;')
      ? '  update(dt) {\n    advanceStormLock(this, dt);\n    this.anim.time = G.time;'
      : '  update(dt) {\n    this.anim.time = G.time;';
    code = replaceOnce(code, actorUpdateHead,
      actorUpdateHead.replace('    this.anim.time = G.time;', '    flushPendingLethal(this);\n    this.anim.time = G.time;'),
      'flush lethal on next fixed tick');
    code = replaceOnce(code, '  _finishFrame(dt) {', '  _finishFrame(dt) {\n    rememberSuperJumpGround(this);', 'record grounded jump destination');
    code = replaceOnce(code, '    this.grounded = grounded;\n    this.airTime', '    this.grounded = grounded;\n    rememberSuperJumpGround(this);\n    this.airTime', 'record resolved jump destination');
    code = replaceOnce(code, 'this.groundN.copy(gh.normal); }\n  }', 'this.groundN.copy(gh.normal); }\n    rememberSuperJumpGround(this);\n  }', 'record spawn jump destination');
    code = replaceOnce(code, "    if (this.superJumpState) { this._updateSuperJump(dt); this._finishFrame(dt); return; }", "    if (this.superJumpState) { clearFullCancelCandidate(this); this._updateSuperJump(dt); updateSuperJumpMain(this, dt, firePressed); if (this.alive) this._finishFrame(dt); return; }", 'super jump main input');
    // Issue #744: the Super Jump branch returns before the shared post-movement
    // resource phase. Charge stays damageable (#255 protects flight only), so a
    // tick that starts in charge runs the same phase once. Flight runs HP only.
    code = replaceOnce(code, '    if (this.superJumpState) { clearFullCancelCandidate(this); this._updateSuperJump(dt); updateSuperJumpMain(',
      "    if (this.superJumpState) { clearFullCancelCandidate(this); const superJumpCharge = this.superJumpState.phase === 'charge'; this._updateSuperJump(dt); if (this.alive) { if (superJumpCharge) updateResources(this, dt); else if (!this.remote) updateHealthRecovery(this, dt); } updateSuperJumpMain(",
      'super jump charge resource phase');
    const specialActiveHead = code.includes("    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { this._updateSpecial(dt); this._finishFrame(dt); return; }")
      ? "    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { this._updateSpecial(dt); this._finishFrame(dt); return; }"
      : "    if (this.specialActive) { this._updateSpecial(dt); this._finishFrame(dt); return; }";
    const specialActiveTarget = specialActiveHead.includes('stormHolding')
      ? "    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { clearFullCancelCandidate(this); const stormResources = this.specialActive.id === 'storm'; this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); if (this.alive) this._finishFrame(dt); return; }"
      : "    if (this.specialActive) { clearFullCancelCandidate(this); const stormResources = this.specialActive.id === 'storm'; this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); if (this.alive) this._finishFrame(dt); return; }";
    code = replaceOnce(code, specialActiveHead, specialActiveTarget, 'special active resources');
    // Issue #624 residual: activation also returns before ordinary resources.
    // Admit only a live Storm user; other specials retain their resource gates.
    code = replaceOnce(code, "    if (specialPressed && this.specialReady()) { this._startSpecial(); this._finishFrame(dt); return; }",
      "    if (specialPressed && this.specialReady()) { clearFullCancelCandidate(this); this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); this._finishFrame(dt); return; }",
      'storm activation resources');
    code = replaceOnce(code, "    this.superJumpState = { phase: 'charge',", "    if (target?.pos?.isVector3 && (target === this || target.team !== this.team || target.superJumpState)) return false;\n    const destination = new THREE.Vector3();\n    if (!superJumpTarget(target, destination)) return false;\n    target = destination.clone();\n    rememberSuperJumpGround(this);\n    this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge', startForm: this.form,", 'super jump wall support and destination admission');
    code = replaceOnce(code, 'target, from: new THREE.Vector3(), to: new THREE.Vector3(), marker: 0', 'target, from: new THREE.Vector3(), to: destination, marker: 0', 'super jump committed destination');
    code = replaceOnce(code, "      this.vel.set(0, 0, 0);\n      this.form = 'squid';\n      this._probeGround();", '      const supported = prepareSuperJump(this, dt);\n      if (!this.alive) return;', 'super jump preparation physics');
    const targetStart = code.indexOf('        const tgt = s.target;'), targetEnd = code.indexOf("        s.phase = 'flight';", targetStart);
    if (targetStart < 0 || targetEnd < targetStart) throw new Error('INKWAVE patch conflict: super jump destination');
    code = replaceOnce(code, code.slice(targetStart, targetEnd), '        // Destination was committed at admission; target motion/death cannot retarget it.\n        s.from.copy(this.pos);\n', 'super jump last grounded destination');
    code = replaceOnce(code, "this.form = k > 0.82 ? 'kid' : 'squid';", "this.form = k > SUPERJUMP_MAIN_PROGRESS ? 'kid' : 'squid';", 'super jump human main boundary');
    const fallStart = code.indexOf('    // ---- fall into the sea\n'), fallEnd = code.indexOf('    this._finishFrame(dt);', fallStart);
    if (fallStart < 0 || fallEnd < fallStart) throw new Error('INKWAVE patch conflict: super jump environmental death');
    const fallBody = code.slice(fallStart, fallEnd).replace('      return;', '      return true;');
    code = code.slice(0, fallStart) + '    if (this._checkFallDeath()) return;\n\n' + code.slice(fallEnd);
    code = replaceOnce(code, '  _nearCamera() {', '  _checkFallDeath() {\n    const P = PLAYER;\n' + fallBody + '    return false;\n  }\n\n  _nearCamera() {', 'shared environmental death');
    code = replaceOnce(code, '    this._updateClimb(dt, isSquid);',
      '    this._updateClimb(dt, isSquid, jumpPressed);\n    const actionHandled = beforeActions(this, dt, jumpPressed, { wasSquid, wasSubmerged, wasClimbing, firePressed, fireWins });', 'movement actions');
    code = replaceOnce(code, '  _updateClimb(dt, isSquid) {',
      '  _updateClimb(dt, isSquid, jumpPressed = false) {', 'wall roll input edge');
    code = replaceOnce(code, '    if (into < P.climbDetachDot) {',
      '    if (into < P.climbDetachDot && !wallRollRequested(this, jumpPressed, h.normal)) {', 'wall roll before ordinary detach');
    code = replaceOnce(code, '    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing) {',
      '    if (!actionHandled && this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing && (isSquid || this.weapon.kind !== \'dualies\' || !this.weaponRunner.dodge && !(this.weaponRunner.lockT > 0))) {', 'jump action consumption');
    code = replaceOnce(code, '      let jv = this.submerged ? P.swimJumpVel : P.jumpVel;',
      '      let jv = takeFullCancelJumpVelocity(this) ?? (this.submerged ? P.swimJumpVel : P.jumpVel);', 'full-cancel jump launch velocity');
    code = replaceOnce(code, '      if (onEnemy) jv *= 0.72;', '      if (onEnemy) jv = this.s3?.modifiers?.enemyJumpVelocity ?? P.enemyInkJumpVel;', 'enemy ink jump');
    code = replaceOnce(code, '      this.vel.y = jv;', '      this.vel.y = normalJumpVelocity(this, jv);', 'charger full-charge jump');
    code = replaceOnce(code, '    if (!inked) {                                                        // ink ran out under us: let go',
      '    if (!inked && crossSurgeInkGap(this, h, into)) return;\n    if (!inked) {                                                        // ink ran out under us: let go', 'surge unpainted gap');
    code = replaceOnce(code, '      if (s.t > 0.75) {', '      if (supported && s.t + 1e-10 >= this.s3.jumpChargeTime + superJumpStartupTime(this)) {', 'super jump charge');
    code = replaceOnce(code, '        s.dur = 1.15 + Math.min(0.6, s.from.distanceTo(s.to) / 80);', '        s.dur = this.s3.jumpFlightTime + stealthJumpExtraTime(this, s.from, s.to);', 'super jump flight');
    code = replaceOnce(code, '        this.invuln = Math.max(this.invuln, s.dur + 0.2);',
      '        // Super Jump does not grant an extra landing shield.', 'super jump invulnerability');
    code = replaceOnce(code, '      const k = Math.min(1, s.t / s.dur);',
      '      const k = s.t + 1e-10 >= s.dur ? 1 : Math.min(1, s.t / s.dur);', 'super jump frame boundary');
    code = replaceOnce(code, "      if (k >= 1) {\n        this.superJumpState = null;",
      "      if (k >= 1) {\n        this.invuln = 0; // Spawn protection always ends before landing.\n        this.superJumpState = null;", 'super jump landing vulnerability');
    code = replaceOnce(code,
      '        this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random() }));\n',
      '        // Splatoon 3: Ordinary Super Jump does not leave ink, grant turf points, or charge special at landing.\n',
      'super jump landing paint');
    const swimFormHead = code.includes('    const wantSquid = intent.squid && !intent.sub && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);')
      ? '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !intent.sub && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);\n'
      : '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy();\n';
    const swimFormTarget = swimFormHead.includes('chargerSwimLocked')
      ? '    const wasSquid = this.form === \'squid\';\n' +
        '    const wasSubmerged = this.submerged;\n' +
        '    const wasClimbing = this.climbing;\n' +
        '    // Sample the last native ground hit before choosing the next movement/collision form.\n' +
        '    this._surface();\n' +
        '    const enemyGrounded = this.grounded && this.groundTeam === 2 && !this.climbing;\n' +
        '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !intent.sub && !fireWins && !hasFullCancelGroundAttack(this) && !this.weaponRunner.busy() && !chargerSwimLocked(this) && !enemyGrounded;\n'
      : '    const wasSquid = this.form === \'squid\';\n' +
        '    const wasSubmerged = this.submerged;\n' +
        '    const wasClimbing = this.climbing;\n' +
        '    // Sample the last native ground hit before choosing the next movement/collision form.\n' +
        '    this._surface();\n' +
        '    const enemyGrounded = this.grounded && this.groundTeam === 2 && !this.climbing;\n' +
        '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !fireWins && !hasFullCancelGroundAttack(this) && !this.weaponRunner.busy() && !enemyGrounded;\n';
    code = replaceOnce(code, swimFormHead, swimFormTarget, 'enemy ink swim-form eligibility');
    code = replaceOnce(code,
      "    // ---- surface under feet (from last frame's ground probe; position hasn't moved since)\n    this._surface();\n",
      '', 'move surface sample before form selection');
    const start = code.indexOf('    // ---- ink / hp\n');
    const end = code.indexOf('    // ---- weapons (', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: actor resource connection');
    code = replaceOnce(code, code.slice(start, end), '    updateResources(this, dt);\n\n', 'post-movement resources');
    code = replaceOnce(code, '    this._spawnBarrier();',
      '    // S3 Spawners use stage geometry and spawn protection, not a universal radial body clamp.',
      'S3 universal spawn barrier removal');
    return `import { rollerEmergeDelay, rollerFireBuffer } from '../../patches/splatoon3/runtime/roller.mjs';\nimport { finalWeaponDamage } from '../../patches/splatoon3/runtime/final-damage.mjs';\nimport { swimSplashVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\nimport { prepareSuperJump, rememberSuperJumpGround, superJumpTarget, superJumpStartupTime, stealthJumpExtraTime, updateSuperJumpMain, SUPERJUMP_MAIN_PROGRESS } from '../../patches/splatoon3/runtime/superjump.mjs';\nimport { beforeActions, wallRollRequested, crossSurgeInkGap, normalJumpVelocity, clearFullCancelCandidate, hasFullCancelGroundAttack, takeFullCancelJumpVelocity } from '../../patches/splatoon3/runtime/movement.mjs';\nimport { updateResources, updateHealthRecovery } from '../../patches/splatoon3/runtime/resources.mjs';\nimport { scheduleLethal, flushPendingLethal, clearPendingLethal, hasPendingLethal } from '../../patches/splatoon3/runtime/damage-timing.mjs';\n` + code;
  }
  if (rel === 'src/game/character-weapons.js') {
    code = replaceOnce(code, '    if (ft >= 0.15 && ft - dt < 0.15) w.drumW += 34;', '    const release = st.flickReleaseTime ?? 0.15;\n    if (ft >= release && ft - dt < release) w.drumW += 34;', 'roller drum release impulse');
    code = replaceOnce(code, 'const BUILDERS = { shooter: buildShooter, roller: buildRoller,', 'const BUILDERS = { shooter: buildShooter, roller: () => rollerModel(buildRoller()),', 'roller drum proportions');
    return "import { rollerModel } from '../../patches/splatoon3/runtime/roller-model.mjs';\n" + code;
  }
  if (rel === 'src/audio/music.js') {
    // Match-start Opening cue (issue #605): an original short sting for the pre-GO intro.
    // Distinct id/name/tempo from battle and battle_final (both 150 bpm): at 140 bpm the GO
    // hand-off to the battle track takes the engine's immediate cross-fade path instead of
    // delaying the battle downbeat to the next bar line.
    const OPENING = `  // Splatoon-style match-start Opening cue (issue #605): plays through the pre-GO intro.
  // Original INKWAVE composition; distinct from battle / battle_final (see the GO hand-off).
  opening: {
    name: 'Opening Sting', bpm: 140, swing: 0, key: 'A minor', pump: 0.3,
    inst: { bass: 'punk', chords: 'guitar', arp: 'pluck' },
    mix: { hats: 0.15, arp: 0.12 },
    sections: {
      A: {
        bars: 4, crash: true, chords: ['A5', 'A5', 'C5 D5', 'G5 A5'], riser: 1,
        drums: {
          k: 'X...X...X...X...',
          s: '....X.......X...',
          h: 'x.x.x.x.x.x.x.x.',
        },
        fills: { s: 'x.x.x.x.xxxxXXXX' },
        bass: 'R.R.R.R.R.R.R.R.',
        stabs: 'X-------X-------',
        arp: { rate: 2, pattern: 'up', oct: 1, lo: 64 },
      },
    },
    order: ['A'], loopFrom: 0,
  },

`;
    // Re-applying the adapter to already-patched music must fail closed instead of duplicating the cue.
    if (code.includes("  opening: {\n    name: 'Opening Sting',")) {
      throw new Error('INKWAVE patch conflict (match-start Opening cue): expected exactly one connection. Review upstream changes; site was not built.');
    }
    code = replaceOnce(code, "  results_win: {\n    name: 'Fresh Victory',", OPENING + "  results_win: {\n    name: 'Fresh Victory',", 'match-start Opening cue');
    code = replaceOnce(code,
      '  constructor() {\n    this.ctx = null; this.players = []; this.current = null; this.intensity = 1; this._want = undefined;\n  }',
      '  constructor() {\n    this.ctx = null; this.players = []; this.current = null; this.intensity = 1; this._want = undefined; this._timerPaused = false;\n  }',
      'music visibility state');
    code = replaceOnce(code, '  _startTimer() {\n    const tick = () => this._tick();',
      '  _startTimer() {\n    if (this.offline || this._timerPaused || this.worker || this.timer) return;\n    const tick = () => this._tick();',
      'music timer idempotence');
    code = replaceOnce(code,
      '      this.worker.onerror = () => { this.worker = null; if (!this.timer) this.timer = setInterval(tick, TICK_MS); };',
      '      this.worker.onerror = () => { this.worker = null; if (!this._timerPaused && !this.timer) this.timer = setInterval(tick, TICK_MS); };',
      'music worker hidden fallback');
    code = replaceOnce(code, '      this.timer = setInterval(tick, TICK_MS);',
      '      if (!this._timerPaused) this.timer = setInterval(tick, TICK_MS);', 'music timer hidden fallback');
    code = replaceOnce(code, '  _tick() {',
      '  _pauseTimer() {\n    if (this.offline) return;\n    this._timerPaused = true;\n    if (this.worker) this.worker.postMessage(0);\n    if (this.timer) { clearInterval(this.timer); this.timer = null; }\n  }\n\n  _resumeTimer() {\n    if (this.offline || !this.ctx) return;\n    const paused = this._timerPaused; this._timerPaused = false;\n    if (this.worker) this.worker.postMessage(TICK_MS); else if (!this.timer) this._startTimer();\n    if (paused) this._tick();\n  }\n\n  _tick() {',
      'music visibility timer controls');
    code = replaceOnce(code, '  dispose() {\n    for (const p of this.players) p.dispose();',
      '  dispose() {\n    this._timerPaused = true;\n    for (const p of this.players) p.dispose();', 'music dispose visibility state');
    return code;
  }
  if (rel === 'src/audio/audio.js') {
    code = replaceOnce(code,
      "  resume() {\n    const c = this.ctx;\n    if (c && !this.offline && c.state !== 'running' && c.state !== 'closed' && c.resume) c.resume().catch(() => {});\n  }",
      "  resume() {\n    const c = this.ctx;\n    if (!c || this.offline || c.state === 'closed') return;\n    if (c.state === 'running') { this.music?._resumeTimer?.(); return; }\n    if (c.resume) c.resume().then(() => this.music?._resumeTimer?.()).catch(() => {});\n  }",
      'audio lifecycle resume');
    code = replaceOnce(code,
      "    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) h(); });",
      "    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {\n      if (document.hidden) {\n        this.music?._pauseTimer?.();\n        const c = this.ctx;\n        if (c && !this.offline && c.state !== 'closed' && c.suspend) c.suspend().catch(() => {});\n      } else h();\n    });",
      'audio visibility suspend');
    return code;
  }
  if (rel === 'src/main.js') {
    // #614: Splatoon 3's normal battle HUD has no global text feed naming remote
    // attacker/victim pairs. Drop the two remote-splat feed broadcasts; the local
    // splat confirmation (kind 'kill'), own-death showSplatted, the top roster and
    // WIPEOUT! keep their existing paths. The ally-down audio cue stays because it
    // carries no identity.
    code = replaceOnce(code,
      "        G.audio?.play('ally_splatted', { volume: 0.5 });\n" +
      "        this.hud?.feed({ text: attacker ? t('{victim} was splatted by {attacker}', { victim: victim.name, attacker: attacker.name }) : t('{victim} was splatted', { victim: victim.name }), color: G.teamHex[victim.enemyTeam], kind: 'death' });\n" +
      "      } else if (attacker && attacker.team === local?.team) {\n" +
      "        this.hud?.feed({ text: t('{attacker} splatted {victim}', { attacker: attacker.name, victim: victim.name }), color: G.teamHex[attacker.team], kind: 'ally' });\n" +
      "      }",
      "        // #614: no global text feed naming remote attacker/victim pairs — the top\n" +
      "        // roster (alive/splatted) and WIPEOUT! already carry remote splat state;\n" +
      "        // keep only the non-identifying ally-down audio cue.\n" +
      "        G.audio?.play('ally_splatted', { volume: 0.5 });\n" +
      "      }\n" +
      "      // Remote ally-on-enemy splats (#614) likewise add no text entry: the local\n" +
      "      // confirmation above is the only feed that names a remote player.",
      'splat feed remote-identity gate (#614)');
    const start = code.indexOf('    G.time += dt;\n', code.indexOf('  _frame(dt) {'));
    const end = code.indexOf('    // A full-frame lobby/showcase completely covers', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: fixed simulation connection');
    code = code.slice(0, start)
      + '    const m = this.match;\n'
      + '    const setUp = !!this.showcase?.fullFrame;\n'
      + '    runSimulation(this, dt);\n'
      // #53: RESULT keeps only the stage/GUI animation it actually needs; the
      // paint atlas and gameplay FX stop behind the results screen (offline and
      // online alike). The results stage, GUI, backdrop draw and renderer keep
      // their cadence so the reveal stays visible and rematch/resize resume.
      + "    const resultsQuiet = this.match?.state === 'results';\n"
      + code.slice(end);
    code = replaceOnce(code,
      '      if (!m || !m.paused) G.fx.update(dt, G.camera);\n      if (!m || !m.paused) this.fxHooks?.update?.(dt);',
      '      if (!m || (!m.paused && !resultsQuiet)) G.fx.update(dt, G.camera);\n      if (!m || (!m.paused && !resultsQuiet)) this.fxHooks?.update?.(dt);',
      '#53 gameplay FX behind results');
    code = replaceOnce(code, '      G.paint.flush(dt);', '      if (!resultsQuiet) G.paint.flush(dt);', '#53 paint atlas behind results');
    code = replaceOnce(code,
      '      if (this.swimWake && (!m || !m.paused)) this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);',
      '      if (this.swimWake && (!m || (!m.paused && !resultsQuiet))) this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);',
      '#53 swim wakes behind results');
    code = replaceOnce(code, '    dt = Math.min(dt, 1 / 24);\n', '', 'elapsed time');
    code = replaceOnce(code, '    this.input.endFrame();\n', '', 'input consumption');
    code = replaceOnce(code,
      '    const judgeP = this.hud?.judge({ colors: [G.teamHex[0], G.teamHex[1]], percents: [cov[0] * 100, cov[1] * 100], names: this.palette.names || TEAM_NAMES });',
      '    const judgeP = this.hud?.judge({ colors: [G.teamHex[0], G.teamHex[1]], percents: [cov[0] * 100, cov[1] * 100], names: this.palette.names || TEAM_NAMES, winner: m.result.winner });',
      'authoritative Turf winner Game to HUD');
    code = replaceOnce(code, 'const game = new Game();', 'installGame(Game);\nconst game = new Game();', 'game installation');
    // Issue #605: the turf intro starts the dedicated Opening cue instead of silence.
    // The boss intro keeps its own _playMusic(null); mode is guarded for a boss match
    // without a resolved entity. Practice Range / attract never reach _intro().
    code = replaceOnce(code,
      "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);\n    this._playMusic(null);",
      "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);\n    this._playMusic(this.match?.mode === 'boss' ? null : 'opening');   // #605 match-start Opening cue",
      'match-start Opening cue');

    code = replaceOnce(code,
      '    const frame = {\n      time: m.time,',
      `    const muzzleContact = w.kind === 'shooter' ? G.projectiles?.muzzleBlockFeedback?.(a) : null;
    let muzzleBlock = null;
    if (muzzleContact) {
      const projectedContact = this._muzzleBlockScreen || (this._muzzleBlockScreen = new THREE.Vector3());
      projectedContact.copy(muzzleContact.point).project(cam);
      if (projectedContact.z >= -1 && projectedContact.z <= 1
        && Math.abs(projectedContact.x) <= 1 && Math.abs(projectedContact.y) <= 1) {
        muzzleBlock = { x: projectedContact.x * W / 2, y: -projectedContact.y * H / 2 };
      }
    }
    const frame = {
      time: m.time,`,
      'projected Shooter muzzle contact');
    code = replaceOnce(code,
      "      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },",
      "      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true, guide: projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H), muzzleBlock },",
      'S3 ShotGuideFrame and muzzle-contact HUD projection');
    {
      const rawEnemyReveal = "          // enemies only show on the map when visible to your team (not submerged far away)\n          if (o.anim.form === 'swim') continue;";
      const scoreHudEnemyReveal = "          if (!mapActorVisible(o, a, PLAYER.hp, G.time)) continue;";
      const directEnemyReveal = "          // S3 Turf Map: opponents appear only once damaged (>=18) or explicitly marked.\n          if (!enemyRevealedOnMap(o, PLAYER.hp)) continue;";
      const combinedEnemyReveal = "          // S3 Turf Map: preserve timed/team reveal and explicit recon marking; damage >=18 satisfies both.\n          if (!mapActorVisible(o, a, PLAYER.hp, G.time) && !enemyRevealedOnMap(o, PLAYER.hp)) continue;";
      if (code.includes(scoreHudEnemyReveal)) {
        code = replaceOnce(code, scoreHudEnemyReveal, combinedEnemyReveal, 'enemy map reveal after score HUD');
      } else if (code.includes(rawEnemyReveal)) {
        code = replaceOnce(code, rawEnemyReveal, directEnemyReveal, 'enemy map reveal');
      } else {
        const accepted = [directEnemyReveal, combinedEnemyReveal].reduce((n, value) => n + (code.split(value).length - 1), 0);
        if (accepted !== 1) throw new Error('INKWAVE patch conflict (enemy map reveal): expected raw, score-HUD, or composed connection');
      }
    }
    return `import { runSimulation, installGame } from '../patches/splatoon3/runtime/clock.mjs';\nimport { projectShotGuide } from '../patches/splatoon3/runtime/weapons-fidelity.mjs';\nimport { enemyRevealedOnMap } from '../patches/splatoon3/runtime/map-reveal.mjs';\n` + code;
  }

  if (rel === 'src/core/shadowcache.js') {
    // #658: a stage switch must release the previously collected static-caster
    // generation immediately. While Shadows are OFF no shadow-map render runs,
    // so the dirty flag alone never rebuilds `this.static` and the stale array
    // would keep the disposed previous stage (meshes, PropKit atlas) alive.
    code = replaceOnce(code,
      '  setStaticRoots(roots) {\n    this.roots = roots.filter(Boolean);\n    this.dynamic = new WeakSet();\n    this.dirty = true;\n  }',
      '  setStaticRoots(roots) {\n    this.roots = roots.filter(Boolean);\n    this.static.length = 0; // #658: release the previous collected caster generation at the root handoff\n    this.dynamic = new WeakSet();\n    this.dirty = true;\n  }',
      'stage-root static release');
  }

  if (rel === 'src/world/paint.js') {
    return "import { installIssue570PaintPresentation } from '../../patches/splatoon3/runtime/render.mjs';\n" +
      code + '\ninstallIssue570PaintPresentation(PaintSystem);\n';
  }
  return code;
}

export function writeBuildIdentity(src, out, patchRoot = PATCH_ROOT, build = {}) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  const files = {};
  for (const root of [src, patchRoot]) for (const file of walk(root).sort()) {
    if (file.includes('/tests/') || file.endsWith('.md')) continue;
    files[(root === src ? 'upstream/' : 'patch/') + path.relative(root, file)] = sha256(fs.readFileSync(file));
  }
  const inputHash = sha256(JSON.stringify(files));
  const artifacts = {};
  for (const file of walk(out).sort()) {
    const rel = path.relative(out, file);
    if (rel !== 'inkwave-build.json') artifacts[rel] = sha256(fs.readFileSync(file));
  }
  const contentHash = sha256(JSON.stringify(artifacts));
  const identity = { schema: 1, patch: 'splatoon3', contentHash, inputHash, build, files, artifacts };
  fs.writeFileSync(path.join(out, 'inkwave-build.json'), JSON.stringify(identity, null, 2) + '\n');
  return identity;
}
