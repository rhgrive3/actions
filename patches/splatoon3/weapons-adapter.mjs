// Pure build-time adapter. Caller supplies the repository's fail-closed anchor
// verifier. No code outside the main-projectile paths is replaced.
export function adaptWeaponsFidelity(code,replaceOnce) {
  const patch=(before,after,label)=>{code=replaceOnce(code,before,after,'weapons fidelity: '+label);};
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
    `    fidelityAimConvergence(m, dir, a.aimPoint, w, w.projSpeed);
    spreadWeaponRound(this, dir, a, w, spreadDeg);
    const p = this._new();
    Object.assign(p, { type: 'shot', wid: w.id`, 'dualies/splatling centerline convergence');
  patch('    if (!victim.alive || victim.team === attacker.team) return;',
    "    if (!victim.alive || victim.team === attacker.team || !(dmg > 0)) return 'rejected';", 'hit pre-admission');
  patch('    if (route === \'drop\') return;', "    if (route === 'drop') return 'rejected';", 'dropped hit result');
  patch("    if (route === 'send') nm.sendHit(attacker, victim, dmg, weaponId);   // the kill confirm arrives with their splat\n    else killed = victim.damage(dmg, attacker, weaponId);",
    "    if (route === 'send') {\n      if (victim.invuln > 0) return 'rejected-invulnerable';\n      if (!nm.sendHit(attacker, victim, dmg, weaponId)) return 'rejected';\n      return 'pending';\n    }\n    const hpBefore = victim.hp;\n    killed = victim.damage(dmg, attacker, weaponId);\n    if (!(victim.hp < hpBefore)) return victim.invuln > 0 ? 'rejected-invulnerable' : 'rejected';", 'accepted damage admission');
  patch('    if (attacker.isLocal) rumble(attacker, killed ? 0.35 : 0.06, killed ? 0.4 : 0.16, killed ? 150 : 45);',
    "    if (attacker.isLocal) rumble(attacker, killed ? 0.35 : 0.06, killed ? 0.4 : 0.16, killed ? 150 : 45);\n    return killed ? 'killed' : 'accepted';", 'accepted feedback result');
  return "import { EPSILON as WEAPONS_FIDELITY_EPSILON, advanceFidelityProjectile, advanceFidelityWallDrop, beginFidelityWallDrop, configureFidelityFlick, fidelityProjectileTargets, fidelityPlayerCollisionRadius, fidelityVolleyDamage, fidelityBossHit, fidelityWorldHit, applyFidelityProjectileHit, applyFidelitySlosherSplash, fidelityAimConvergence } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n"+code;
}
