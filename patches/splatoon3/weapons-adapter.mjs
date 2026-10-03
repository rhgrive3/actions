// Pure build-time adapter. Caller supplies the repository's fail-closed anchor
// verifier. No code outside the main-projectile paths is replaced.
export function adaptWeaponsFidelity(code,replaceOnce) {
  const patch=(before,after,label)=>{code=replaceOnce(code,before,after,'weapons fidelity: '+label);};
  patch(`      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);`,
    '      advanceFidelityProjectile(p, dt);','staged projectile integration');
  patch('      // actors\n      for (const e of G.actors) {',
    '      // Earliest enemy before the first solid obstruction.\n      for (const e of fidelityProjectileTargets(this, p)) {','collision chronology');
  patch('        if (Math.abs(e.pos.x - p.pos.x) > 3 || Math.abs(e.pos.z - p.pos.z) > 3) continue;',
    '        // Swept broad phase was already checked by fidelityProjectileTargets.','swept broad phase');
  patch('          if (p.vol) { if (p.vol.hits.includes(e)) dmg = 0; else p.vol.hits.push(e); }',
    '          dmg = fidelityVolleyDamage(p, e, dmg);','volley maximum');
  patch("      this.applyHit(p.owner, e, w.splashDamage, p.wid || 'slosher');",
    '      applyFidelitySlosherSplash(this, p, e, w.splashDamage);','splash shares volley maximum');
  patch('          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);',
    '          if (dmg > 0) applyFidelityProjectileHit(this, p, e, dmg, _v);','roller damage envelope');
  patch('        const bh = G.boss.segHit(p.prev, p.pos, p.size * 0.6);',
    '        const bh = fidelityBossHit(this, p);','solid obstruction before boss');
  patch('        const hit = G.physics.segment(p.prev, p.pos, _hit, true);',
    '        const hit = fidelityWorldHit(this, p);','reuse terrain query');
  patch('      if (!dead && p.age > p.life) {','      if (!dead && p.age + WEAPONS_FIDELITY_EPSILON >= p.life) {','exact lifetime boundary');
  patch('      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);',
    '      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);\n      configureFidelityFlick(p, a, w, i, ang, sp);','flick layers; retain random draw ordering');
  return "import { EPSILON as WEAPONS_FIDELITY_EPSILON, advanceFidelityProjectile, configureFidelityFlick, fidelityProjectileTargets, fidelityVolleyDamage, fidelityBossHit, fidelityWorldHit, applyFidelityProjectileHit, applyFidelitySlosherSplash } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n"+code;
}