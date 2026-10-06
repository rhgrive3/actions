import { adaptWeaponEdgecases } from './weapon-edgecases-adapter.mjs';
import { adaptWeaponsFidelity } from './weapons-adapter.mjs';
// Apply only to a disposable BUILD tree. Upstream sources are never modified.
// Every connection has a unique exact anchor; missing/duplicated hooks are errors.
import { adaptMovementPhysics } from './movement-physics-adapter.mjs';
import { adaptSubSpecialFidelity } from './sub-special-adapter.mjs';
import { adaptAssistPresentation } from './assist-presentation-adapter.mjs';
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
  if (rel === 'src/game/match.js') {
    code = replaceOnce(code,
      'const win = cov[0] === cov[1] ? (Math.random() < 0.5 ? 0 : 1) : cov[0] > cov[1] ? 0 : 1;',
      'const win = cov[0] >= cov[1] ? 0 : 1; // Exact tie belongs to the assigned Alpha side.',
      'deterministic Alpha turf tie');
  }
  if (rel === 'patches/splatoon3/runtime/resources.mjs') return adaptIssue415(rel, code);
  code = adaptMovementPhysics(rel, code, replaceOnce);
  code = adaptSubSpecialFidelity(rel, code, replaceOnce);
  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(code,
      '  invuln: 262144, enemy: 524288,',
      '  invuln: 262144, enemy: 524288, flickVertical: 16777216,',
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
    // Keep the existing remote death/respawn lifecycle anchors in this shared
    // NetMatch pass so another composed NetMatch adapter cannot return first.
    code = replaceOnce(code, '    victim.alive = false; victim.hp = 0;', '    victim.alive = false; victim.hp = 0; victim.superJumpGround = null;', 'remote jump target death');
    code = replaceOnce(code, '    a.alive = true; a.hp = PLAYER.hp;', '    a.superJumpGround = null;\n    a.alive = true; a.hp = PLAYER.hp;', 'remote jump target respawn');
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
    return code;
  }

  code = adaptAssistPresentation(rel, code, replaceOnce);
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
      "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {",
      "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES, winner: authoritativeWinner = null } = {}) {",
      'authoritative Turf winner HUD input');
    code = replaceOnce(code,
      '      const winner = Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
      '      const winner = authoritativeWinner === 0 || authoritativeWinner === 1 ? authoritativeWinner : Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
      'authoritative Turf winner HUD reveal');
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
    return "import { t as tr } from '../i18n.js';\nimport { tagArt, AWARDS, AWARD_ICONS, awardIcon } from './menu-art.js';\nimport { fnv, tagTitle, tagNum } from './menus.js';\n" + code;
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
  if (rel === 'src/game/player.js') {
    const start = code.indexOf('    if (this.onTarget && this.onTarget !== G.boss) {');
    const end = code.indexOf('    // is the crosshair point inside', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: camera aim connection');
    code = code.slice(0, start) + code.slice(end);
    code = replaceOnce(code, "it.jump = inp.down('Space')", "it.jump = inp.wasPressed('Space') || inp.padPressed.has(0) || inp.down('Space')", 'latched jump input');
    code = replaceOnce(code, "it.squid = inp.down('ShiftLeft')", "it.squid = inp.wasPressed('ShiftLeft') || inp.wasPressed('ShiftRight') || inp.down('ShiftLeft')", 'latched squid input');
    code = replaceOnce(code, 'it.fire = inp.mouse.left ||', 'it.fire = inp.mouse.leftPressed || inp.mouse.left ||', 'latched fire input');
    code = replaceOnce(code, "it.sub = inp.mouse.right || inp.down('KeyE')", "it.sub = inp.mouse.rightPressed || inp.wasPressed('KeyE') || inp.mouse.right || inp.down('KeyE')", 'latched sub input');
    code = replaceOnce(code, "it.special = inp.down('KeyF')", "it.special = inp.wasPressed('KeyF') || inp.wasPressed('KeyQ') || inp.down('KeyF')", 'latched special input');
    return code;
  }
  if (rel === 'src/game/weapons.js') {
    code = replaceOnce(code,
      '    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));',
      "    if (this.flick >= 0 && w.kind === 'roller') return w.moveSpeedFiring; // S3 swing target is independent of windup progress\n    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));",
      'roller swing movement target');
    code = replaceOnce(code, 'lerp(w.damageMin, w.damageMax * 0.62, charge)',
      'lerp(w.damageMin, w.damagePartialMax, charge)', 'charger partial damage');
    code = replaceOnce(code, 'a.ink < w.inkFull * 0.2', 'a.ink < w.inkMin', 'charger minimum ink');
    code = replaceOnce(code, 'a.ink - w.inkFull * c', 'a.ink - Math.max(w.inkMin, w.inkFull * c)', 'charger ink floor');
    code = replaceOnce(code, 'const c = Math.max(0.12, this.charge);', 'const c = this.charge;', 'charger partial charge floor');
    code = replaceOnce(code, "          if (dmg > 0) this.applyHit(p.owner, e, dmg, p.wid || p.type);",
      '          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);', 'projectile damage model');
    code = replaceOnce(code, '      this.charge = Math.min(1, this.chargeT / w.chargeTime);',
      '      this.charge = Math.min(1, this.chargeT / w.chargeTime, splatlingChargeCap(a.ink, w));', 'splatling ink charge cap');
    code = replaceOnce(code, "      this.applyHit(b.owner, e, lerp(s.damageMin, s.damageMax, k * k), 'bomb');",
      "      this.applyHit(b.owner, e, distanceDamage(s.damageBands, d, false), 'bomb');", 'bomb damage bands');
    code = replaceOnce(code, "      this.applyHit(p.owner, e, lerp(w.splashDamageMax, w.splashDamageMin, d / w.splashRadius), 'blaster');",
      "      this.applyHit(p.owner, e, distanceDamage(w.damageBands, d), 'blaster');", 'blaster damage bands');
    code = replaceOnce(code, '      b.vel.y -= 24 * dt;', '      b.vel.y -= (b.kind === \'bomb\' ? SUB.bomb.gravity : 24) * dt;', 'bomb gravity');
    code = replaceOnce(code, 'const pos = _v.copy(a.pos); pos.y += 1.35;', 'const pos = _v.copy(a.pos); pos.y += 1.35; bombReleasePosition(a, pos);', 'bomb release origin');
    code = replaceOnce(code, 'const p = _v.copy(a.pos); p.y += 1.35;', 'const p = _v.copy(a.pos); p.y += 1.35; bombPreviewPosition(a, p);', 'bomb preview origin');
    code = replaceOnce(code, '        vel.y -= 24 * dt;', '        vel.y -= SUB.bomb.gravity * dt;', 'bomb preview gravity');
    code = replaceOnce(code, 'if (b.fuse <= 0) {', 'if (b.fuse <= 1e-10) {', 'bomb fuse frame boundary');
    code = adaptWeaponEdgecases(rel, code, replaceOnce);
    code = adaptWeaponsFidelity(code, replaceOnce);
    return `import { applyProjectileHit, distanceDamage, splatlingChargeCap } from '../../patches/splatoon3/runtime/weapons.mjs';\nimport { bombReleasePosition, bombPreviewPosition } from '../../patches/splatoon3/runtime/bomb-motion.mjs';\n` + code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, '    this.superJumpState = null;\n    this.yawVel', '    this.superJumpState = null; this.superJumpGround = null;\n    this.yawVel', 'reset super jump ground');
    code = replaceOnce(code, '    this.alive = false;\n    this.hp = 0;', '    this.alive = false;\n    this.superJumpState = null; this.superJumpGround = null;\n    this.hp = 0;', 'clear dead super jump');
    code = replaceOnce(code, '    if (this.invuln > 0) return false;', "    if (this.invuln > 0 || this.superJumpState?.phase === 'flight') return false;", 'super jump flight damage admission');
    code = replaceOnce(code, '  _finishFrame(dt) {', '  _finishFrame(dt) {\n    rememberSuperJumpGround(this);', 'record grounded jump destination');
    code = replaceOnce(code, '    this.grounded = grounded;\n    this.airTime', '    this.grounded = grounded;\n    rememberSuperJumpGround(this);\n    this.airTime', 'record resolved jump destination');
    code = replaceOnce(code, 'this.groundN.copy(gh.normal); }\n  }', 'this.groundN.copy(gh.normal); }\n    rememberSuperJumpGround(this);\n  }', 'record spawn jump destination');
    code = replaceOnce(code, "    if (this.superJumpState) { this._updateSuperJump(dt); this._finishFrame(dt); return; }", "    if (this.superJumpState) { this._updateSuperJump(dt); updateSuperJumpMain(this, dt, firePressed); if (this.alive) this._finishFrame(dt); return; }", 'super jump main input');
    code = replaceOnce(code, "    this.superJumpState = { phase: 'charge',", "    if (target?.pos?.isVector3 && (target === this || target.team !== this.team || target.superJumpState)) return false;\n    const destination = new THREE.Vector3();\n    if (!superJumpTarget(target, destination)) return false;\n    target = destination.clone();\n    rememberSuperJumpGround(this);\n    this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge',", 'super jump wall support and destination admission');
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
      '    this._updateClimb(dt, isSquid);\n    const actionHandled = beforeActions(this, dt, jumpPressed);', 'movement actions');
    code = replaceOnce(code, '    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing) {',
      '    if (!actionHandled && this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing) {', 'jump action consumption');
    code = replaceOnce(code, '      if (onEnemy) jv *= 0.72;', '      if (onEnemy) jv = this.s3?.modifiers?.enemyJumpVelocity ?? P.enemyInkJumpVel;', 'enemy ink jump');
    code = replaceOnce(code, '      if (s.t > 0.75) {', '      if (supported && s.t + 1e-10 >= this.s3.jumpChargeTime) {', 'super jump charge');
    code = replaceOnce(code, '        s.dur = 1.15 + Math.min(0.6, s.from.distanceTo(s.to) / 80);', '        s.dur = this.s3.jumpFlightTime;', 'super jump flight');
    code = replaceOnce(code, '        this.invuln = Math.max(this.invuln, s.dur + 0.2);',
      '        // Super Jump does not grant an extra landing shield.', 'super jump invulnerability');
    code = replaceOnce(code, '      const k = Math.min(1, s.t / s.dur);',
      '      const k = s.t + 1e-10 >= s.dur ? 1 : Math.min(1, s.t / s.dur);', 'super jump frame boundary');
    code = replaceOnce(code, "      if (k >= 1) {\n        this.superJumpState = null;",
      "      if (k >= 1) {\n        this.invuln = 0; // Spawn protection always ends before landing.\n        this.superJumpState = null;", 'super jump landing vulnerability');
    const start = code.indexOf('    // ---- ink / hp\n');
    const end = code.indexOf('    // ---- weapons (', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: actor resource connection');
    code = replaceOnce(code, code.slice(start, end), '    updateResources(this, dt);\n\n', 'post-movement resources');
    return `import { prepareSuperJump, rememberSuperJumpGround, superJumpTarget, updateSuperJumpMain, SUPERJUMP_MAIN_PROGRESS } from '../../patches/splatoon3/runtime/superjump.mjs';\nimport { beforeActions } from '../../patches/splatoon3/runtime/movement.mjs';\nimport { updateResources } from '../../patches/splatoon3/runtime/resources.mjs';\n` + code;
  }
  if (rel === 'src/game/character-weapons.js') {
    code = replaceOnce(code, '    if (ft >= 0.15 && ft - dt < 0.15) w.drumW += 34;', '    const release = st.flickReleaseTime ?? 0.15;\n    if (ft >= release && ft - dt < release) w.drumW += 34;', 'roller drum release impulse');
    code = replaceOnce(code, 'const BUILDERS = { shooter: buildShooter, roller: buildRoller,', 'const BUILDERS = { shooter: buildShooter, roller: () => rollerModel(buildRoller()),', 'roller drum proportions');
    return "import { rollerModel } from '../../patches/splatoon3/runtime/roller-model.mjs';\n" + code;
  }
  if (rel === 'src/main.js') {
    const start = code.indexOf('    G.time += dt;\n', code.indexOf('  _frame(dt) {'));
    const end = code.indexOf('    // A full-frame lobby/showcase completely covers', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: fixed simulation connection');
    code = code.slice(0, start) + '    const m = this.match;\n    const setUp = !!this.showcase?.fullFrame;\n    runSimulation(this, dt);\n' + code.slice(end);
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
    return `import { runSimulation, installGame } from '../patches/splatoon3/runtime/clock.mjs';\n` + code;
  }
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
    return code;
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
