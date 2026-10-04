// Apply only to a disposable BUILD tree. Upstream sources are never modified.
// Every connection has a unique exact anchor; missing/duplicated hooks are errors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
    code = replaceOnce(code, '    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)\n    const a = this._local();',
      "    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)\n    const a = this._local();\n    if (a) {\n      const sub = selectedSub(a, SUB), cost = Math.round(selectedSubCost(a, SUB));\n      if (L.kitSub !== sub.id || L.kitSubCost !== cost) {\n        L.kitSub = sub.id; L.kitSubCost = cost;\n        this.subChip.querySelector('i').innerHTML = SUB_ICONS[sub.id] || SUB_ICONS.bomb;\n        this.subChip.querySelector('b').textContent = cost + '%';\n        this.subChip.title = sub.name;\n      }\n    }", 'HUD selected sub identity and cost');
    return "import { t as tr } from '../i18n.js';\nimport { selectedSub, selectedSubCost } from '../../patches/splatoon3/runtime/kit-composition.mjs';\n" + code;
  }
  if (rel === 'src/game/bots.js') {
    code = replaceOnce(code, 'a.ink > SUB.bomb.inkCost + 8', 'a.ink > selectedSubCost(a, SUB) + 8', 'bot turf selected sub cost');
    code = replaceOnce(code, 'a.ink > SUB.bomb.inkCost + 10', 'a.ink > selectedSubCost(a, SUB) + 10', 'bot boss selected sub cost');
    for (const [anchor, label] of [["          if (w.special === 'storm' && dist < 16) it.special = true;", 'turf'], ["        if (w.special === 'storm' && dist < 13 && T.los) it.special = true;", 'boss']])
      code = replaceOnce(code, anchor, anchor + "\n        if (w.special === 'trizooka' && dist < 24 || w.special === 'inkVac' && dist < 15 || w.special === 'bubbler' && dist < 12) it.special = true;", 'bot ' + label + ' installed kit activation');
    return "import { selectedSubCost } from '../../patches/splatoon3/runtime/kit-composition.mjs';\n" + code;
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
    code = replaceOnce(code, 'lerp(w.damageMin, w.damageMax * 0.62, charge)',
      'lerp(w.damageMin, w.damagePartialMax, charge)', 'charger partial damage');
    code = replaceOnce(code, 'a.ink < w.inkFull * 0.2', 'a.ink < w.inkMin', 'charger minimum ink');
    code = replaceOnce(code, 'a.ink - w.inkFull * c', 'a.ink - Math.max(w.inkMin, w.inkFull * c)', 'charger ink floor');
    code = replaceOnce(code, 'const c = Math.max(0.12, this.charge);', 'const c = this.charge;', 'charger partial charge floor');
    code = replaceOnce(code, "          if (dmg > 0) this.applyHit(p.owner, e, dmg, p.wid || p.type);",
      '          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);', 'projectile damage model');
    code = replaceOnce(code, [
      '      // actors',
      '      for (const e of G.actors) {',
      '        if (e.team === p.team || !e.alive) continue;',
      "        const h = e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height;",
      '        if (Math.abs(e.pos.x - p.pos.x) > 3 || Math.abs(e.pos.z - p.pos.z) > 3) continue;',
      '        Physics.segmentCapsuleDist(p.prev, p.pos, hitBase(e), PLAYER.radius, h, _res);',
      "        // generous hitbox: the whole visible body plus the blob's own radius",
      '        if (_res.dist < PLAYER.radius * 0.95 + p.size) {',
      '          _v.copy(p.prev).lerp(p.pos, _res.t);',
      '          let dmg = p.damage;',
      "          if (p.type === 'drop') dmg = lerp(p.damage, p.dmgFar, clamp(p.start.distanceTo(_v) / 7, 0, 1));",
      '          if (p.vol) { if (p.vol.hits.includes(e)) dmg = 0; else p.vol.hits.push(e); }',
      '          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);',
      "          G.fx?.burst(_v, _v2.copy(p.vel).normalize().negate(), p.owner.color, { count: 6, speed: 3, size: 0.07 });",
      "          if (p.type !== 'blast') emit('weapon:impact', { pos: _v.clone(), normal: _v2.clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: e });",
      "          if (p.type === 'blast') this._blastBurst(p, _v, e);",
      "          if (p.type === 'slosh' && p.head) this._sloshSplash(p, _v, e);",
      '          dead = true; break;',
      '        }',
      '      }',
      '      // world',
      "      // boss mode: HULLBREAKER's hit spheres and its crablets",
      '      if (!dead && G.boss) {',
      '        const bh = G.boss.segHit(p.prev, p.pos, p.size * 0.6);',
      '        if (bh) { this._bossImpact(p, bh); dead = true; }',
      '      }',
      '      if (!dead) {',
      '        const hit = G.physics.segment(p.prev, p.pos, _hit, true);',
      '        if (hit.hit) {',
      '          this._impact(p, hit);',
      '          dead = true;',
      '        }',
      '      }',
    ].join('\n'), [
      '      // actors and world terrain resolve together by nearest travel distance:',
      '      // a projectile must never pass through a nearer actor or a nearer surface.',
      '      let victim = null, victimT = Infinity;',
      '      for (const e of G.actors) {',
      '        if (e.team === p.team || !e.alive) continue;',
      "        const h = e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height;",
      '        const entry = segmentCapsuleEntry(p.prev, p.pos, hitBase(e), PLAYER.radius, h, PLAYER.radius * 0.95 + p.size);',
      '        if (entry < victimT) { victimT = entry; victim = e; }',
      '      }',
      '      const stepLength = _v2.copy(p.pos).sub(p.prev).length();',
      '      const bossHit = G.boss ? G.boss.segHit(p.prev, p.pos, p.size * 0.6) : null;',
      '      const wallHit = G.physics.segment(p.prev, p.pos, _hit, true);',
      '      const actorDistance = victim ? victimT * stepLength : Infinity;',
      '      const wallDistance = wallHit.hit ? wallHit.dist : Infinity;',
      '      const bossDistance = bossHit ? bossHit.dist : Infinity;',
      '      const defense = this.kitDefenseCandidate?.(p);',
      '      const defenseDistance = defense ? defense.distance : Infinity;',
      '      const nearest = Math.min(actorDistance, wallDistance, bossDistance, defenseDistance);',
      '      dead = nearest < Infinity;',
      '      if (dead) {',
      '        if (nearest === wallDistance) {',
      '          this._impact(p, wallHit);',
      '        } else if (nearest === defenseDistance) {',
      '          defense.onHit();',
      '        } else if (nearest === actorDistance) {',
      '          _v.copy(p.prev).lerp(p.pos, victimT);',
      '          let dmg = p.damage;',
      "          if (p.type === 'drop') dmg = lerp(p.damage, p.dmgFar, clamp(p.start.distanceTo(_v) / 7, 0, 1));",
      '          if (p.vol) { if (p.vol.hits.includes(victim)) dmg = 0; else p.vol.hits.push(victim); }',
      '          if (dmg > 0) applyProjectileHit(this, p, victim, dmg, _v);',
      "          G.fx?.burst(_v, _v2.copy(p.vel).normalize().negate(), p.owner.color, { count: 6, speed: 3, size: 0.07 });",
      "          if (p.type !== 'blast') emit('weapon:impact', { pos: _v.clone(), normal: _v2.clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim });",
      "          if (p.type === 'blast') this._blastBurst(p, _v, victim);",
      "          if (p.type === 'slosh' && p.head) this._sloshSplash(p, _v, victim);",
      '        } else if (nearest === bossDistance) {',
      '          this._bossImpact(p, bossHit);',
      '        } else {',
      '          this._impact(p, wallHit);',
      '        }',
      '      }',
    ].join('\n'), 'projectile nearest-collision chronology');
    code = replaceOnce(code,
      "      Physics.segmentCapsuleDist(m, _v2, hitBase(e), PLAYER.radius + 0.12, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, _res);\n      if (_res.dist < PLAYER.radius + 0.14) {\n        const d = _res.t * len;",
      "      const entry = segmentCapsuleEntry(m, _v2, hitBase(e), PLAYER.radius + 0.12, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, PLAYER.radius + 0.14);\n      if (entry < Infinity) {\n        const d = entry * len;", 'charger first-contact ordering');
    code = replaceOnce(code, '    let len = hit.hit ? hit.dist : range;',
      '    let len = hit.hit ? hit.dist : range;\n    const defense = this.kitBeamDefense?.(a, m, dir, len, dmg);\n    const defenseStops = defense && (!hit.hit || defense.distance < hit.dist);\n    if (defenseStops) len = Math.min(len, defense.distance);', 'charger special defense reach');
    code = replaceOnce(code, "    if (victim) { len = victim.d; this.applyHit(a, victim.e, dmg, 'charger'); }",
      "    if (victim) { len = victim.d; this.applyHit(a, victim.e, dmg, 'charger'); }\n    else if (!bossHit && defenseStops) defense.onHit();", 'charger special defense contact');
    code = replaceOnce(code, '    if (hit.hit && !victim && !bossHit) {',
      '    if (hit.hit && !victim && !bossHit && !defenseStops) {', 'charger intercepted impact');
    code = replaceOnce(code, '      this.charge = Math.min(1, this.chargeT / w.chargeTime);',
      '      this.charge = Math.min(1, this.chargeT / w.chargeTime, splatlingChargeCap(a.ink, w));', 'splatling ink charge cap');
    code = replaceOnce(code, "      this.applyHit(b.owner, e, lerp(s.damageMin, s.damageMax, k * k), 'bomb');",
      "      this.applyHit(b.owner, e, distanceDamage(s.damageBands, d, false), 'bomb');", 'bomb damage bands');
    code = replaceOnce(code, '    // paint under the burst',
      '    if (p.ghost) return; // remote bursts present; owner packets carry paint and hits\n    // paint under the burst', 'ghost blast authority');
    code = replaceOnce(code, '    const w = WEAPONS.blaster;',
      '    const w = p.s3SpecialWeapon || WEAPONS.blaster;', 'per-projectile blast descriptor');
    code = replaceOnce(code, "      this.applyHit(p.owner, e, lerp(w.splashDamageMax, w.splashDamageMin, d / w.splashRadius), 'blaster');",
      "      this.applyHit(p.owner, e, distanceDamage(w.splashBands || w.damageBands, d), p.wid || 'blaster');", 'blaster damage bands');
    code = replaceOnce(code, "G.boss?.splash(p.owner, c, w.splashRadius, w.splashDamageMax, w.splashDamageMin, 'blaster');",
      "G.boss?.splash(p.owner, c, w.splashRadius, w.splashDamageMax, w.splashDamageMin, p.wid || 'blaster');", 'projectile blast cause');
    code = replaceOnce(code, '      b.vel.y -= 24 * dt;', '      b.vel.y -= kitBombGravity(SUB, b) * dt;', 'bomb gravity');
    code = replaceOnce(code, 'const pos = _v.copy(a.pos); pos.y += 1.35;', 'const pos = _v.copy(a.pos); pos.y += 1.35; bombReleasePosition(a, pos);', 'bomb release origin');
    code = replaceOnce(code, 'const p = _v.copy(a.pos); p.y += 1.35;', 'const p = _v.copy(a.pos); p.y += 1.35; bombPreviewPosition(a, p);', 'bomb preview origin');
    code = replaceOnce(code, '        vel.y -= 24 * dt;', '        vel.y -= SUB.bomb.gravity * dt;', 'bomb preview gravity');
    code = replaceOnce(code, 'if (b.fuse <= 0) {', 'if (b.fuse <= 1e-10) {', 'bomb fuse frame boundary');

    // ---- sub weapon hooks (lane freebuff-2, issue 177) ----------------------
    // Narrow and confined to the sub release and the bomb loop/blast. The actor
    // collision block and every unrelated connection above are left untouched.
    // The native loop keeps one pass, one integration and one fuse decrement;
    // these hooks only supply the bomb being processed.
    code = replaceOnce(code, '    // ---- sub weapon (splat bomb)\n    const bomb = SUB.bomb;',
      '    // ---- sub weapon (splat bomb)\n    const bomb = kitSubRelease(SUB, this, dt, inp);', 'sub release selected spec and held charge');
    // per-bomb contact subtype inside the existing native contact block
    // Attach the per-bomb kit spec AFTER the native push and BEFORE recBomb, so the
    // network never snapshots a record that lacks its kit identity.
    code = replaceOnce(code, "    if (G.netm && !a.remote) G.netm.recBomb(this.bombs[this.bombs.length - 1]);\n    if (a.isLocal || a._nearCamera())",
      "    kitBombAttach(SUB, this, a, a.weaponRunner?.s3Release);\n    if (G.netm && !a.remote) G.netm.recBomb(this.bombs[this.bombs.length - 1]);\n    if (a.isLocal || a._nearCamera())", 'sub bomb attach before recbomb');
    code = replaceOnce(code, '      if (hit.hit) {\n        if (b.kind === \'storm\') {',
      '      if (hit.hit) {\n        const s3Took = kitBombContact(SUB, b, hit, dt);\n        if (b.kind === \'storm\') {', 'sub per-bomb contact');
    // The whole native reflection + arming region is skipped only for the bomb
    // subtype that took the contact; everything else falls through unchanged.
    code = replaceOnce(code, "        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);\n        const vn = b.vel.dot(hit.normal);\n        b.vel.addScaledVector(hit.normal, -vn * 1.35);\n        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);\n        if (hit.normal.y > 0.6 && b.fuse < 0) {\n          b.fuse = SUB.bomb.fuse;\n          G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 });\n          emit('bomb:arm', { actor: b.owner, pos: b.pos.clone(), team: b.team, radius: SUB.bomb.radius });\n        }",
      "        if (!s3Took) {\n        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);\n        const vn = b.vel.dot(hit.normal);\n        b.vel.addScaledVector(hit.normal, -vn * 1.35);\n        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);\n        if (hit.normal.y > 0.6 && b.fuse < 0) {\n          b.fuse = SUB.bomb.fuse;\n          G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 });\n          emit('bomb:arm', { actor: b.owner, pos: b.pos.clone(), team: b.team, radius: SUB.bomb.radius });\n        }\n        }", 'sub native bounce guard');
    code = replaceOnce(code, "      if (b.kind === 'storm' && b.age > 1.1)",
      "      kitBombTrail(SUB, b, G.paint, this);\n      if (b.kind === 'storm' && b.age > 1.1)", 'sub per-tick rolling trail');
    // native blast consumes this bomb's own distance bands and radii
    code = replaceOnce(code, 'distanceDamage(s.damageBands, d, false)', 'distanceDamage(kitBombDamageBands(SUB, b, s.damageBands), d, false)', 'sub blast damage bands');
    code = replaceOnce(code, 'let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });',
      'let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), kitBombPaintRadius(SUB, b, s.paintRadius), b.team, { seed: Math.random() });', 'sub blast paint radius');
    code = replaceOnce(code, '      const a = Math.random() * Math.PI * 2, r = s.paintRadius * (0.6 + Math.random() * 0.4);',
      '      const a = Math.random() * Math.PI * 2, r = kitBombPaintRadius(SUB, b, s.paintRadius) * (0.6 + Math.random() * 0.4);', 'sub blast satellite radius');
    code = replaceOnce(code, 'G.fx?.explosion(c, G.teamColors[b.team], s.radius);', 'G.fx?.explosion(c, G.teamColors[b.team], kitBombRadius(SUB, b, s.radius));', 'sub blast fx radius');
    code = replaceOnce(code, 'emit(\'bomb:explode\', { actor: b.owner, pos: c.clone(), team: b.team, radius: s.radius });',
      'emit(\'bomb:explode\', { actor: b.owner, pos: c.clone(), team: b.team, radius: kitBombRadius(SUB, b, s.radius) });', 'sub blast event radius');
    code = replaceOnce(code, '      if (d > s.radius) continue;', '      if (d > kitBombRadius(SUB, b, s.radius)) continue;', 'sub blast damage radius');
    code = replaceOnce(code, '        const k = 1 - b.fuse / SUB.bomb.fuse;', '        const k = 1 - b.fuse / kitBombFuseTotal(SUB, b);', 'sub fuse total');
    code = replaceOnce(code, '    G.boss?.splash(b.owner, c, s.radius, s.damageMax, s.damageMin, \'bomb\');',
      '    G.boss?.splash(b.owner, c, kitBombRadius(SUB, b, s.radius), kitBombDamageMax(SUB, b, s.damageMax), kitBombDamageMin(SUB, b, s.damageMin), \'bomb\');', 'sub boss splash');
    // ---- trizooka native projectile connections (lane freebuff-2, issue 177) --
    // Narrow and confined to the projectile step, the pooled-reuse path and the
    // ghost replay path. The native loop keeps its single pass, its single
    // integration and its single contact resolution; these hooks only supply
    // the per-stage constants, the orbit offset difference and the growing hit
    // radii for the Trizooka wid. Every other projectile falls straight through.
    code = replaceOnce(code,
      '      if (p.age > p.straight) p.vel.y -= p.grav * dt;\n      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));',
      '      if (!kitTrizookaFlight(this, p, dt)) {\n      if (p.age > p.straight) p.vel.y -= p.grav * dt;\n      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));\n      }',
      'trizooka per-stage gravity and drag');
    // the orbit is an offset DIFFERENCE around the native centreline, applied
    // after the integration so the swept p.prev -> p.pos segment stays valid
    code = replaceOnce(code,
      '      p.pos.addScaledVector(p.vel, dt);',
      '      p.pos.addScaledVector(p.vel, dt);\n      kitTrizookaOrbitDelta(this, p, dt);',
      'trizooka orbit offset difference');
    // a growing per-projectile actor sphere, on top of the native body capsule
    code = replaceOnce(code,
      '        const entry = segmentCapsuleEntry(p.prev, p.pos, hitBase(e), PLAYER.radius, h, PLAYER.radius * 0.95 + p.size);',
      '        const entry = segmentCapsuleEntry(p.prev, p.pos, hitBase(e), PLAYER.radius, h, kitTrizookaActorRadius(this, p) ?? (PLAYER.radius * 0.95 + p.size));',
      'trizooka growing actor hit sphere');
    // a growing sphere sweep against the world blocks
    code = replaceOnce(code,
      'const wallHit = G.physics.segment(p.prev, p.pos, _hit, true);',
      'const wallHit = kitTrizookaWorldSweep(this, p, _hit, G.physics);',
      'trizooka growing world hit sphere');
    // pooled reuse must not leak the previous round's kit state
    code = replaceOnce(code,
      "    p.delay = 0; p.head = false; p.wid = null; p.dmgFar = undefined; p.vol = null; p.ghost = false;",
      "    p.delay = 0; p.head = false; p.wid = null; p.dmgFar = undefined; p.vol = null; p.ghost = false;\n    kitTrizookaClearPooled(p);",
      'trizooka pooled-reuse field clearing');
    // the Trizooka damage bands are discrete table points (53 @2.5, 35 @4.0),
    // so the blast must step between them rather than lerp continuously
    code = replaceOnce(code,
      'distanceDamage(w.splashBands || w.damageBands, d)',
      'distanceDamage(w.splashBands || w.damageBands, d, !kitTrizookaSteppedBands(p))',
      'trizooka discrete blast damage bands');
    // paint/turf credit. The gauge policy after a special ends is UNKNOWN, so the
    // ordinary native addTurf semantics are preserved; what is refused is
    // authority. _impact lays paint BEFORE the credit line, so the ghost guard
    // goes in ahead of any splat. The storm cloud paint at its own anchor is
    // deliberately left alone.
    code = replaceOnce(code, '  _impact(p, hit) {\n    _v.copy(hit.point)',
      '  _impact(p, hit) {\n    if (!kitPaintAuthority(p)) { if (p.type === \'blast\') this._blastBurst(p, hit.point, null); return; }\n    _v.copy(hit.point)',
      'kit projectile ghost impact paint authority');
    code = replaceOnce(code,
      '          if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));',
      '          if (g.hit) p.owner.addTurf(kitPaintCredit(p, G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() })));',
      'kit projectile trail paint credit');
    code = replaceOnce(code, '    p.owner.addTurf(area);\n    if (p.type !== \'blast\') emit(\'weapon:impact\'',
      '    p.owner.addTurf(kitPaintCredit(p, area));\n    if (p.type !== \'blast\') emit(\'weapon:impact\'',
      'kit projectile impact paint credit');
    code = replaceOnce(code,
      '    if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));',
      '    if (g.hit) p.owner.addTurf(kitPaintCredit(p, G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() })));',
      'kit projectile blast paint credit');
    // a ghost rebuilds its descriptor and is forced to carry no authority
    code = replaceOnce(code,
      "    this.list.push(p);\n  }",
      "    kitTrizookaGhost(p, a, SPECIALS);\n    this.list.push(p);\n  }",
      'trizooka ghost descriptor reconstruction');

    return `import { segmentCapsuleEntry } from '../../patches/splatoon3/runtime/projectile-collision.mjs';\nimport { applyProjectileHit, distanceDamage, splatlingChargeCap } from '../../patches/splatoon3/runtime/weapons.mjs';\nimport { bombReleasePosition, bombPreviewPosition } from '../../patches/splatoon3/runtime/bomb-motion.mjs';\nimport { kitSubRelease, kitSubHoldSeconds, kitBombAttach, kitBombGravity, kitBombContact, kitBombTrail, kitBombFuseTotal, kitBombPaintRadius, kitBombRadius, kitBombDamageBands, kitBombDamageMax, kitBombDamageMin } from '../../patches/splatoon3/runtime/kit-subs.mjs';\nimport { kitTrizookaFlight, kitTrizookaOrbitDelta, kitTrizookaActorRadius, kitTrizookaWorldSweep, kitTrizookaClearPooled, kitTrizookaGhost, kitTrizookaSteppedBands, kitPaintCredit, kitPaintAuthority } from '../../patches/splatoon3/runtime/trizooka-collision.mjs';\n` + code;
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
    code = replaceOnce(code, '    this.respawnTimer = PLAYER.respawnTime;',
      '    setRespawnTimer(this, cause);', 'death-cause respawn timing');
    const start = code.indexOf('    // ---- ink / hp\n');
    const end = code.indexOf('    // ---- weapons (', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: actor resource connection');
    code = replaceOnce(code, code.slice(start, end), '    updateResources(this, dt);\n\n', 'post-movement resources');
    return `import { beforeActions } from '../../patches/splatoon3/runtime/movement.mjs';\nimport { updateResources, setRespawnTimer } from '../../patches/splatoon3/runtime/resources.mjs';\n` + code;
  }
  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(code, "'splatted', 'respawn'];", "'splatted', 'respawn', ...KIT_FORWARD];", 'kit network forward registration');
    code = replaceOnce(code, "case 'ev': this._playEvent(e[2], e[3]); break;", "case 'ev': this._playEvent(e[2], e[3], from); break;", 'kit event transport sender');
    code = replaceOnce(code, '  _playEvent(name, d) {', '  _playEvent(name, d, from) {', 'kit event receiver signature');
    code = replaceOnce(code, '    if (!e) return;\n    const a = e.actor || e.victim;',
      '    if (!e) return;\n    if (this.replayKitEvent?.(name, e, from)) return;\n    const a = e.actor || e.victim;', 'kit typed replay dispatch');
    code = replaceOnce(code, '    victim.respawnTimer = PLAYER.respawnTime;',
      '    setRespawnTimer(victim, cause);', 'remote death-cause respawn timing');
    // The gear death consequence reads the actor's death counter, so it must run
    // AFTER the native increment - exactly where Actor.splat's own gear wrapper
    // runs (that wrapper wraps the whole splat body, deaths++ included).
    code = replaceOnce(code, '    victim.stats.deaths++;',
      '    victim.stats.deaths++;\n    applyDeathGear(victim);', 'remote gear death consequence');
    return `import { KIT_FORWARD } from '../../patches/splatoon3/runtime/kit-network.mjs';\nimport { setRespawnTimer } from '../../patches/splatoon3/runtime/resources.mjs';\nimport { applyDeathGear } from '../../patches/splatoon3/runtime/gear.mjs';\n` + code;
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
    code = replaceOnce(code, 'subCost: SUB.bomb.inkCost / PLAYER.inkMax,', 'subCost: selectedSubCost(a, SUB) / PLAYER.inkMax,', 'frame selected sub gear cost');
    return `import { runSimulation, installGame } from '../patches/splatoon3/runtime/clock.mjs';\nimport { selectedSubCost } from '../patches/splatoon3/runtime/kit-composition.mjs';\n` + code;
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
