// Connections are restricted to native launch/contact points. Missing anchors fail closed.
export function adaptWeaponEdgecases(rel, code, replace) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replace(code,
    '  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);\n    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));',
    '  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {\n    const dir = this._aimFrom(a, m, _dir);\n    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);\n    spreadWeaponRound(this, dir, a, w, spreadDeg);', 'splatling independent ground pitch');
  code = replace(code,
    '    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));',
    '    spreadWeaponRound(this, dir, a, w, spreadDeg);', 'shooter scalar spread cone');
  code = replace(code,
    '    this._spread(dir, spreadDeg ?? 1.2);',
    '    spreadWeaponRound(this, dir, a, w, spreadDeg);', 'blaster scalar spread cone');
  code = replace(code,
    '        const hit = G.physics.raycast(m, dir, range, _hit);',
    '        const hit = G.physics.raycast(m, dir, range, _hit, true);', 'charger sight shares ink grate mask');
  code = replace(code,
    "    if (a.isLocal) emit('recoil', { amount: 0.007 });",
    "    appendRollerNearUnit(this, a, w);\n    if (a.isLocal) emit('recoil', { amount: 0.007 });", 'roller secondary horizontal unit');
  code = replace(code,
    "this.applyHit(p.owner, e, distanceDamage(w.damageBands, d), 'blaster');",
    "this.applyHit(p.owner, e, blasterBurstDamage(p, w, d, distanceDamage), 'blaster');", 'blaster terrain player damage');
  return "import { spreadWeaponRound, appendRollerNearUnit, blasterBurstDamage } from '../../patches/splatoon3/runtime/weapon-edgecases.mjs';\n" + code;
}
