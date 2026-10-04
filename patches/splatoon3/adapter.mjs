import { adaptWeaponEdgecases } from './weapon-edgecases-adapter.mjs';
// Apply only to a disposable BUILD tree. Upstream sources are never modified.
// Every connection has a unique exact anchor; missing/duplicated hooks are errors.
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
  if (rel === 'patches/splatoon3/runtime/resources.mjs') return adaptIssue415(rel, code);
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
  if (rel === 'src/ui/hud.js') return "import { t as tr } from '../i18n.js';\n" + code;
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
    code = replaceOnce(code, 'PLAYER.radius * 0.95 + p.size', 'PLAYER.radius * 0.95 + playerCollisionRadius(p)', 'splatling independent player radius');
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
    return `import { playerCollisionRadius } from '../../patches/splatoon3/runtime/splatling-radius-charge.mjs';\nimport { applyProjectileHit, distanceDamage, splatlingChargeCap } from '../../patches/splatoon3/runtime/weapons.mjs';\nimport { bombReleasePosition, bombPreviewPosition } from '../../patches/splatoon3/runtime/bomb-motion.mjs';\n` + code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, '    this._updateClimb(dt, isSquid);',
      '    this._updateClimb(dt, isSquid);\n    const actionHandled = beforeActions(this, dt, jumpPressed);', 'movement actions');
    code = replaceOnce(code, '    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing) {',
      '    if (!actionHandled && this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing) {', 'jump action consumption');
    code = replaceOnce(code, '      if (onEnemy) jv *= 0.72;', '      if (onEnemy) jv = this.s3?.modifiers?.enemyJumpVelocity ?? P.enemyInkJumpVel;', 'enemy ink jump');
    code = replaceOnce(code, '      if (s.t > 0.75) {', '      if (s.t + 1e-10 >= this.s3.jumpChargeTime) {', 'super jump charge');
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
    return `import { beforeActions } from '../../patches/splatoon3/runtime/movement.mjs';\nimport { updateResources } from '../../patches/splatoon3/runtime/resources.mjs';\n` + code;
  }
  if (rel === 'src/game/character-weapons.js') {
    return replaceOnce(code, '    if (ft >= 0.15 && ft - dt < 0.15) w.drumW += 34;', '    const release = st.flickReleaseTime ?? 0.15;\n    if (ft >= release && ft - dt < release) w.drumW += 34;', 'roller drum release impulse');
  }
  if (rel === 'src/main.js') {
    const start = code.indexOf('    G.time += dt;\n', code.indexOf('  _frame(dt) {'));
    const end = code.indexOf('    // A full-frame lobby/showcase completely covers', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: fixed simulation connection');
    code = code.slice(0, start) + '    const m = this.match;\n    const setUp = !!this.showcase?.fullFrame;\n    runSimulation(this, dt);\n' + code.slice(end);
    code = replaceOnce(code, '    dt = Math.min(dt, 1 / 24);\n', '', 'elapsed time');
    code = replaceOnce(code, '    this.input.endFrame();\n', '', 'input consumption');
    code = replaceOnce(code, 'const game = new Game();', 'installGame(Game);\nconst game = new Game();', 'game installation');
    return `import { runSimulation, installGame } from '../patches/splatoon3/runtime/clock.mjs';\n` + code;
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
