// Connections are restricted to native launch/contact points. Missing anchors fail closed.
export function adaptWeaponEdgecases(rel, code, replace) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replace(code,
    "import { Physics, Hit } from './physics.js';",
    "import { Physics, Hit, WALKABLE } from './physics.js';", 'roller release foot paint native walkable threshold');
  if (code.includes('    const inkProfile = profileFor(w);')) {
    code = replace(code,
      '  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    const inkProfile = profileFor(w);\n    const inkSpeed = inkProfile ? launchSpeed(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0)) : w.projSpeed;\n    if (inkProfile) correctInkAim(inkProfile, m, dir, a.aimPoint, inkSpeed, Math.min(w.range, referenceReach(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0))));\n    else this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);\n    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));',
      '  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    const inkProfile = profileFor(w);\n    const inkSpeed = inkProfile ? launchSpeed(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0)) : w.projSpeed;\n    if (inkProfile) correctInkAim(inkProfile, m, dir, a.aimPoint, inkSpeed, Math.min(w.range, referenceReach(inkProfile, (a.weaponRunner?.charge || 0) * (w.chargeTime || 0))));\n    else this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);\n    spreadWeaponRound(this, dir, a, w, spreadDeg);',
      'splatling independent ground pitch');
  } else {
    code = replace(code,
      '  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);\n    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));',
      '  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);\n    spreadWeaponRound(this, dir, a, w, spreadDeg);',
      'splatling independent ground pitch');
  }
  code = replace(code,
    '    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));',
    '    spreadWeaponRound(this, dir, a, w, spreadDeg);', 'shooter scalar spread cone');
  code = replace(code,
    '    this._spread(dir, spreadDeg ?? 1.2);',
    '    spreadWeaponRound(this, dir, a, w, spreadDeg);', 'blaster scalar spread cone');
  // The laser telegraphs the weapon's maximum reach at every charge level; only obstruction shortens it.
  // The installed finite flight owns the calibrated full-charge reach; native fallback is the profile rangeMax.
  code = replace(code,
    '        const range = lerp(w.rangeMin, w.rangeMax, ch);',
    '        const range = this.chargerReach ? this.chargerReach(1) : w.rangeMax;', 'charger sight shows maximum range');
  code = replace(code,
    '        const hit = G.physics.raycast(m, dir, range, _hit);',
    '        const hit = G.physics.raycast(m, dir, range, _hit, true);', 'charger sight shares ink grate mask');
  code = replace(code,
    "    if (a.isLocal) emit('recoil', { amount: 0.007 });",
    "    paintRollerReleaseFootprint(this, a, w, { G, PLAYER, Hit, WALKABLE });\n    appendRollerNearUnit(this, a, w);\n    if (a.isLocal) emit('recoil', { amount: 0.007 });", 'roller release foot paint and secondary horizontal unit');
  code = replace(code,
    "this.applyHit(p.owner, e, distanceDamage(w.damageBands, d), 'blaster');",
    "this.applyHit(p.owner, e, blasterBurstDamage(p, w, d, distanceDamage), 'blaster');", 'blaster terrain player damage');
  // #911: actor-direct and terrain contact explosions share the small
  // impact burst admission radius; natural timed airbursts keep full reach.
  // The damage envelope is already reduced by blasterBurstDamage.
  if (!code.includes('      if (d > w.splashRadius * blasterPlayerRadiusRate(p, w)) continue;') &&
      !code.includes('      if (d > w.splashRadius * (p.s3TerrainBurst ? (w.terrainSplashRadiusRate ?? 1) : 1)) continue;')) {
    code = replace(code,
      '      if (d > w.splashRadius) continue;',
      '      if (d > w.splashRadius * (p.s3TerrainBurst ? (w.terrainSplashRadiusRate ?? 1) : 1)) continue;',
      'Blaster direct and terrain impact splash radius');
  }
  return "import { spreadWeaponRound, appendRollerNearUnit, paintRollerReleaseFootprint, blasterBurstDamage } from '../../patches/splatoon3/runtime/weapon-edgecases.mjs';\n" + code;
}
