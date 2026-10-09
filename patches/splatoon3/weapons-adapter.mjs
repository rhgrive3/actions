// Pure build-time adapter. Caller supplies the repository's fail-closed anchor
// verifier. No code outside the main-projectile paths is replaced.
export function adaptWeaponsFidelity(code,replaceOnce) {
  const patch=(before,after,label)=>{code=replaceOnce(code,before,after,'weapons fidelity: '+label);};
  patch('  constructor(scene) {\n    this.scene = scene;',
    '  constructor(scene) {\n    configureFidelityInkFlight(this, { profileFor, launchSpeed, correctInkAim, referenceReach });\n    this.scene = scene;',
    'Inject native InkFlight helpers once per Projectiles instance');
  patch('  _aimFrom(a, from, out) {\n    out.copy(a.aimPoint).sub(from);',
    '  _aimFrom(a, from, out, target = a.aimPoint) {\n    out.copy(target).sub(from);',
    'Dualies per-hand aim target');
  patch(`  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    const inkProfile = profileFor(w);\n    const inkSpeed = inkProfile ? launchSpeed(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0)) : w.projSpeed;\n    if (inkProfile) correctInkAim(inkProfile, m, dir, a.aimPoint, inkSpeed, Math.min(w.range, referenceReach(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0))));\n    else this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);`,
    `  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch, hand = null) {\n    const aimTarget = w.kind === 'dualies' && hand != null\n      ? fidelityDualiesAimTarget(this, a, m, hand)\n      : a.aimPoint;\n    const dir = this._aimFrom(a, m, _dir, aimTarget);\n    const dualiesLaunch = w.kind === 'dualies' && hand != null\n      ? fidelityDualiesLaunchPlan(this, a, w, m, aimTarget, dir)\n      : null;\n    const inkProfile = dualiesLaunch?.profile ?? profileFor(w);\n    const chargeSeconds = dualiesLaunch?.chargeSeconds ?? ((a.weaponRunner?.charge || 0) * (w.chargeTime || 0));\n    const inkSpeed = dualiesLaunch?.speed ?? (inkProfile ? launchSpeed(inkProfile, chargeSeconds) : w.projSpeed);\n    if (!dualiesLaunch && inkProfile) correctInkAim(inkProfile, m, dir, a.aimPoint, inkSpeed, Math.min(w.range, referenceReach(inkProfile, chargeSeconds)));\n    else if (!inkProfile) this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);`,
    'Dualies live fire and guide share the production launch plan');
  patch(`    const dir = this._fireRound(a, w, spreadDeg, m, hand ? LOOK_DUAL_L : LOOK_DUAL_R, 'shoot_dualies', 0.5, hand ? 1.05 : 0.97);`,
    `    const dir = this._fireRound(a, w, spreadDeg, m, hand ? LOOK_DUAL_L : LOOK_DUAL_R, 'shoot_dualies', 0.5, hand ? 1.05 : 0.97, hand);`,
    'native fireDualies hand index');
  patch(`      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);`,
    '      const fidelityWallDropDone = advanceFidelityWallDrop(this, p, dt);\n      if (fidelityWallDropDone === null) {\n      advanceFidelityProjectile(p, dt);\n      }','staged projectile integration');
  patch('      // actors\n      for (const e of G.actors) {',
    '      // Earliest enemy before the first solid obstruction.\n      for (const e of fidelityProjectileTargets(this, p)) {','collision chronology');
  patch('        if (e.team === p.team || !e.alive) continue;\n        const h = e.form === \'squid\' ? PLAYER.squidHeight : PLAYER.height;',
    '        // Membership, liveness and the per-family friendly pass-through window are solved in fidelityProjectileTargets.','team membership solved by fidelity solver');
  patch('        if (Math.abs(e.pos.x - p.pos.x) > 3 || Math.abs(e.pos.z - p.pos.z) > 3) continue;',
    '        // Swept broad phase was already checked by fidelityProjectileTargets.','swept broad phase');
  patch('          if (p.vol) { if (p.vol.hits.includes(e)) dmg = 0; else p.vol.hits.push(e); }',
    '          dmg = fidelityVolleyDamage(p, e, dmg);','volley maximum');
  patch("      this.applyHit(p.owner, e, w.splashDamage, p.wid || 'slosher');",
    '      applyFidelitySlosherSplash(this, p, e, w.splashDamage);','splash shares volley maximum');
  patch('          if (p.type === \'slosh\' && p.head) this._sloshSplash(p, _v, e);',
    '          if (p.type === \'slosh\' && p.head && e.team !== p.team) this._sloshSplash(p, _v, e);','ally-consumed slosh never splashes');
  patch('          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);',
    '          if (dmg > 0) applyFidelityProjectileHit(this, p, e, dmg, _v);','roller damage envelope');
  patch('        const bh = G.boss.segHit(p.prev, p.pos, p.size * 0.6);',
    '        const bh = fidelityBossHit(this, p);','solid obstruction before boss');
  patch('        const hit = G.physics.segment(p.prev, p.pos, _hit, true);',
    '        const hit = fidelityWorldHit(this, p);','reuse terrain query');
  patch('          this._impact(p, hit);\n          dead = true;',
    '          if (beginFidelityWallDrop(this, p, hit)) return false;\n          this._impact(p, hit);\n          dead = true;','wall impact enters sourced wall-drop state');
  patch('      let dead = false;',
    '      let dead = fidelityWallDropDone === true;\n      if (fidelityWallDropDone === false) return false;','retained wall-drop lifecycle');
  patch('      if (!dead && p.age > p.life) {','      if (!dead && p.age + WEAPONS_FIDELITY_EPSILON >= p.life) {','exact lifetime boundary');
  patch('      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);',
    '      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);\n      configureFidelityFlick(p, a, w, i, ang, sp);','flick layers; retain random draw ordering');
  patch('        Physics.segmentCapsuleDist(p.prev, p.pos, hitBase(e), PLAYER.radius, h, _res);',
    '        // Continuous capsule entry was already solved by fidelityProjectileTargets.', 'remove sampled closest-point retest');
  patch('        if (_res.dist < PLAYER.radius * 0.95 + p.size) {',
    '        if (p.fidelityImpactActor === e) {', 'continuous actor entry');
  patch('          _v.copy(p.prev).lerp(p.pos, _res.t);',
    '          _v.copy(p.prev).lerp(p.pos, p.fidelityImpactT);', 'true impact point');
  patch('      if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; }   // poured waves: later globs leave a beat later',
    '      const elapsed = Math.max(0, dt - Math.max(0, p.delay || 0));\n      p.delay = Math.max(0, (p.delay || 0) - dt);\n      if (elapsed <= 1e-10) continue;', 'delayed projectile active fraction');
  patch('try { if (this._step(p, dt))', 'try { if (this._step(p, elapsed))', 'delayed movement duration');
  patch('      if (!dead && p.trailEvery) {','      if (!dead && !p.ghost && p.trailEvery) {','ghost trails never score paint');
  patch('p.trailRadius * (0.8 + Math.random() * 0.4)', 'fidelityFlightPaintRadius(p)', 'source-bound Shooter intermediate paint width');
  patch(`          const g = G.physics.raycast(p.pos, DOWN, 4, _hit2, true);
          if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), fidelityFlightPaintRadius(p), p.team, { seed: Math.random() }));`,
    `          if (!applyFidelityBlasterFlightPaint(this, p)) {
            const g = G.physics.raycast(p.pos, DOWN, 4, _hit2, true);
            if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), fidelityFlightPaintRadius(p), p.team, { seed: Math.random() }));
          }`, 'Blaster source-backed flight splash paint');
  // #1034: current-S3 Blaster ordinary projectile PaintParam is zero.
  // Keep dedicated burst/wall/splash paint, but suppress the legacy generic impact splat.
  patch(`    let area;
    if (p.type === 'slosh') {
      // the wave lands as a thick stripe along its travel: stretched along the horizontal heading
      _dir.y = 0; if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1); _dir.normalize();
      area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25 });
      if (p.head) this._sloshSplash(p, hit.point, null);
    } else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });
    p.owner.addTurf(area);`,
    `    let area = null;
    if (p.type === 'slosh') {
      // Source first/after unit PaintParam owns each terrain-impact footprint.
      _dir.y = 0; if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1); _dir.normalize();
      const paint = fidelitySlosherImpactPaint(p, hit.point);
      area = G.paint.splat(_v, paint?.radius ?? rad * 1.12, p.team,
        { seed: p.seed, stretch: _dir, stretchAmt: paint?.stretchAmt ?? 1.25 });
      if (p.head) this._sloshSplash(p, hit.point, null);
    } else if (!(p.type === 'blast' && p.s3Weapon?.kind === 'blaster')) {
      area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });
    }
    if (area != null) p.owner.addTurf(area);`,
    'Blaster zero ordinary impact paint');

  // #740: use the selected vertical unit's source rates in the actual instanced
  // projectile renderer. The rates stay render-only and are read from the already
  // reconstructed unit on both owners and ghosts; no packet fields are added.
  patch('        attribute vec4 aShape;\n        vec3 iwP;',
    '        attribute vec4 aShape;\n        attribute vec2 aFourPetals;\n        vec3 iwP;', 'FourPetals shader attribute');
  patch('          iwP = vec3(p.xy * tau, p.z * fz);',
    `          iwP = vec3(p.xy * tau, p.z * fz);
          float iwFPTotal = aFourPetals.x + aFourPetals.y;
          if (iwFPTotal > 0.0) {
            float iwFPPetal = max(0.0, cos(4.0 * atan(p.y, p.x)));
            float iwFPRadius = (aFourPetals.x + aFourPetals.y * iwFPPetal) / iwFPTotal;
            iwP.xy *= iwFPRadius;
          }`, 'FourPetals shader profile');
  patch("    geo.setAttribute('aShape', this.blobShape);\n    this.blobs =",
    "    geo.setAttribute('aShape', this.blobShape);\n    this.blobFourPetals = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BLOBS * 2), 2);\n    this.blobFourPetals.setUsage(THREE.DynamicDrawUsage);\n    geo.setAttribute('aFourPetals', this.blobFourPetals);\n    this.blobs =",
    'FourPetals instanced geometry');
  patch("  mat.customProgramCacheKey = () => 'iw-blob-3';",
    "  mat.customProgramCacheKey = () => 'iw-blob-4-four-petals';", 'FourPetals shader cache identity');
  patch('    const B = this.blobs, shp = this.blobShape.array;',
    '    const B = this.blobs, shp = this.blobShape.array, fourPetals = this.blobFourPetals.array;',
    'FourPetals per-instance buffer');
  patch('      let o = n * 4; shp[o] = tail; shp[o + 1] = wob; shp[o + 2] = ph; shp[o + 3] = p.nose || 0;\n      n++;',
    `      let o = n * 4; shp[o] = tail; shp[o + 1] = wob; shp[o + 2] = ph; shp[o + 3] = p.nose || 0;
      const unit = p.fidelityMode === 'vertical' ? p.fidelityRollerUnit : null;
      const center = unit?.FourPetalsCenterRadiusRate, petal = unit?.FourPetalsPetalRadiusRate;
      const hasFourPetals = Number.isFinite(center) && Number.isFinite(petal) && center >= 0 && petal >= 0 && center + petal > 0;
      fourPetals[n * 2] = hasFourPetals ? center : 0;
      fourPetals[n * 2 + 1] = hasFourPetals ? petal : 0;
      n++;`, 'FourPetals rates reach rendered projectile');
  patch('        o = n * 4; shp[o] = 1.3 + 0.25 * spk; shp[o + 1] = 0.05; shp[o + 2] = sph * 3; shp[o + 3] = 0;\n        n++;',
    '        o = n * 4; shp[o] = 1.3 + 0.25 * spk; shp[o + 1] = 0.05; shp[o + 2] = sph * 3; shp[o + 3] = 0;\n        fourPetals[n * 2] = 0; fourPetals[n * 2 + 1] = 0;\n        n++;', 'FourPetals satellites clear shape');
  patch('    this.blobShape.needsUpdate = true;\n  }',
    `    this.blobShape.needsUpdate = true;
    const fr = this._blobFourPetalsRange || (this._blobFourPetalsRange = { start: 0, count: 0 });
    fr.count = n * this.blobFourPetals.itemSize;
    this.blobFourPetals.updateRanges.length = 0; this.blobFourPetals.updateRanges.push(fr);
    this.blobFourPetals.needsUpdate = true;
  }`, 'FourPetals instance upload');
  if (code.includes('    const inkProfile = profileFor(w);')) {
    patch("import { profileFor, launchSpeed, correctInkAim, referenceReach } from './inkFlight.js';",
      "import { profileFor, launchSpeed, correctInkAim, referenceReach, advanceInkFrame, INK_MODEL } from './inkFlight.js';",
      'share canonical InkFlight predictor with HUD');
    patch('  _configureInkRound(p, actor, weapon) {', `  _nominalInkGuide(p, actor, weapon, from, dir, target, speed) {
    const profile = profileFor(weapon);
    if (!profile) { p.inkProfile = null; return false; }
    const charge = actor.weaponRunner?.fidelitySplatlingCharge ?? actor.weaponRunner?.charge ?? 0;
    correctInkAim(profile, from, dir, target, speed,
      Math.min(weapon.range, referenceReach(profile, charge * (weapon.chargeTime || 0))));
    p.inkProfile=profile; p.inkFrame=0; p.inkPhase=0; p.age=0; p.life=INK_MODEL.headLife;
    p.pos.copy(from); p.prev.copy(from); (p.start ||= new THREE.Vector3()).copy(from); p.vel.copy(dir).multiplyScalar(speed);
    return true;
  }
  _advanceInkGuide(p) { p.prev.copy(p.pos); advanceInkFrame(p, p.inkProfile); }
  _nominalInkReach(weapon, charge) {
    const profile=profileFor(weapon); if(!profile)return null;
    const speed=launchSpeed(profile,(charge || 0)*(weapon.chargeTime || 0));
    const p=this._inkReachProbe || (this._inkReachProbe={pos:new THREE.Vector3(),vel:new THREE.Vector3()});
    if(p.profile===profile && p.speed===speed)return p.reach;
    p.pos.set(0,0,0);p.vel.set(0,0,speed);p.inkFrame=0;p.inkPhase=0;
    for(let frame=0;frame<Math.round(INK_MODEL.headLife*60);frame++)advanceInkFrame(p,profile);
    p.profile=profile;p.speed=speed;p.reach=p.pos.z;return p.reach;
  }

  _configureInkRound(p, actor, weapon) {`, 'read-only canonical InkFlight guide owner');

    patch('this.inkFlight.configure(p, key, sequence, p.seed, runner.lockT > 0);',
      'this.inkFlight.configure(p, key, sequence, p.seed, !!runner.s3Turret || runner.lockT > 0);',
      'source-guided turret collider persists after roll recovery');
    // #1082 source-guided ink flight owns Shooter-family launch speed and aim
    // correction. Preserve it; only compose the existing fallback and Dualies
    // per-hand target into that source path.
    const shooterStart = code.indexOf('  fireShooter(a, w, spreadDeg) {');
    const shooterEnd = code.indexOf('\n  // Left-hand muzzle', shooterStart);
    if (shooterStart < 0 || shooterEnd < shooterStart) throw new Error('INKWAVE patch conflict: source-guided Shooter flight');
    let shooter = code.slice(shooterStart, shooterEnd);
    shooter = replaceOnce(shooter,
      '    else this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);',
      '    else fidelityAimConvergence(m, dir, a.aimPoint, w, w.projSpeed);',
      'weapons fidelity: shooter centerline convergence');
    code = code.slice(0, shooterStart) + shooter + code.slice(shooterEnd);

    const roundStart = code.indexOf('  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch, hand = null) {');
    const roundEnd = code.indexOf('\n  fireDualies(', roundStart);
    if (roundStart < 0 || roundEnd < roundStart) throw new Error('INKWAVE patch conflict: source-guided Dualies/Splatling flight');
    let round = code.slice(roundStart, roundEnd);
    // The dedicated Splatling wrapper has already resolved charge and sampled
    // the source speed envelope. Native InkFlight must consume that result.
    round = replaceOnce(round,
      '    const inkSpeed = inkProfile ? launchSpeed(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0)) : w.projSpeed;',
      "    const inkSpeed = w.kind === 'splatling' ? w.projSpeed : inkProfile ? launchSpeed(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0)) : w.projSpeed;",
      'weapons fidelity: keep sampled Splatling source launch speed');

    round = replaceOnce(round,
      '    if (!dualiesLaunch && inkProfile) correctInkAim(inkProfile, m, dir, a.aimPoint, inkSpeed, Math.min(w.range, referenceReach(inkProfile, chargeSeconds)));',
      '    if (!dualiesLaunch && inkProfile) correctInkAim(inkProfile, m, dir, aimTarget, inkSpeed, Math.min(w.range, referenceReach(inkProfile, chargeSeconds)));',
      'weapons fidelity: non-Dualies source-guided aim target');
    round = replaceOnce(round,
      '    else if (!inkProfile) this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);',
      '    else if (!inkProfile) fidelityAimConvergence(m, dir, aimTarget, w, w.projSpeed);',
      'weapons fidelity: Dualies/Splatling centerline convergence');
    code = code.slice(0, roundStart) + round + code.slice(roundEnd);
  } else {
    patch(`    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);
    spreadWeaponRound(this, dir, a, w, spreadDeg);
    const p = this._new();
    // trail starts ~2.5 m out`,
      `    fidelityAimConvergence(m, dir, a.aimPoint, w, w.projSpeed);
    spreadWeaponRound(this, dir, a, w, spreadDeg);
    const p = this._new();
    // trail starts ~2.5 m out`, 'shooter centerline convergence');
    patch(`    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);
    spreadWeaponRound(this, dir, a, w, spreadDeg);
    const p = this._new();
    Object.assign(p, { type: 'shot', wid: w.id`,
      `    fidelityAimConvergence(m, dir, aimTarget, w, w.projSpeed);
    spreadWeaponRound(this, dir, a, w, spreadDeg);
    const p = this._new();
    Object.assign(p, { type: 'shot', wid: w.id`, 'dualies/splatling centerline convergence');
  }
  patch('    if (!victim.alive || victim.team === attacker.team) return;',
    "    if (!victim.alive || victim.team === attacker.team || !(dmg > 0)) return 'rejected';", 'hit pre-admission');
  patch('    if (route === \'drop\') return;', "    if (route === 'drop') return 'rejected';", 'dropped hit result');
  patch("    if (route === 'send') nm.sendHit(attacker, victim, dmg, weaponId);   // the kill confirm arrives with their splat\n    else killed = victim.damage(dmg, attacker, weaponId);",
    "    if (route === 'send') {\n      if (victim.invuln > 0) return 'rejected-invulnerable';\n      if (!nm.sendHit(attacker, victim, dmg, weaponId)) return 'rejected';\n      return 'pending';\n    }\n    const hpBefore = victim.hp;\n    killed = victim.damage(dmg, attacker, weaponId);\n    if (!(victim.hp < hpBefore)) return victim.invuln > 0 ? 'rejected-invulnerable' : 'rejected';", 'accepted damage admission');
  patch('    if (attacker.isLocal) rumble(attacker, killed ? 0.35 : 0.06, killed ? 0.4 : 0.16, killed ? 150 : 45);',
    "    if (attacker.isLocal) rumble(attacker, killed ? 0.35 : 0.06, killed ? 0.4 : 0.16, killed ? 150 : 45);\n    return killed ? 'killed' : 'accepted';", 'accepted feedback result');
  patch('const last = this.rollHits.get(e) || -9;',
    'const last = this.rollHits.get(e) ?? -Infinity;', 'Roller contact timestamp zero');
  patch('if (G.time - last > 0.5)',
    'if (G.time - last + 1e-10 >= w.rollContactInterval)', 'Roller same-target contact interval');
  patch('G.time - (this.rollHits.get(key) || -9) > 0.5',
    'G.time - (this.rollHits.get(key) ?? -Infinity) + 1e-10 >= w.rollContactInterval', 'Roller Boss contact interval');
  patch("    a.addTurf(area);\n    emit('weapon:impact', { pos: _v.set(a.pos.x + fx * 0.75", "    area += fidelityRollerMaximumPaint(this,w,fx,fz);\n    a.addTurf(area);\n    emit('weapon:impact', { pos: _v.set(a.pos.x + fx * 0.75", 'source maximum Roller floor width');
  return "import { EPSILON as WEAPONS_FIDELITY_EPSILON, advanceFidelityProjectile, advanceFidelityWallDrop, beginFidelityWallDrop, configureFidelityFlick, configureFidelityInkFlight, fidelityProjectileTargets, fidelityPlayerCollisionRadius, fidelityVolleyDamage, fidelityBossHit, fidelityWorldHit, applyFidelityProjectileHit, applyFidelitySlosherSplash, fidelityAimConvergence, fidelityDualiesAimTarget, fidelityDualiesLaunchPlan, fidelityFlightPaintRadius, fidelityRollerMaximumPaint, fidelitySlosherImpactPaint, applyFidelityBlasterFlightPaint, applyFidelityBlasterBurstPaint } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n"+code;
}
