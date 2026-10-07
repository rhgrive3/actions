export function adaptAgent3WeaponPhysics(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replaceOnce(
    code,
    '      advanceFidelityProjectile(p, dt);',
    '      const agent3WallDropDone = stepAgent3SlosherWallDrop(this, p, dt);\n      if (agent3WallDropDone !== null) return agent3WallDropDone;\n      advanceFidelityProjectile(p, dt);',
    'agent3 weapon physics: Slosher retained wall-drop step',
  );
  const plainImpact = '          this._impact(p, hit);';
  const kitImpact = '          if (hit.kitDefense) hit.kitDefense.onHit(); else this._impact(p, hit);';
  if (code.includes(kitImpact)) code = replaceOnce(
    code,
    kitImpact,
    '          if (beginAgent3SlosherWallDrop(this, p, hit)) return false;\n' + kitImpact,
    'agent3 weapon physics: Slosher wall-hit admission with kit defense',
  );
  else code = replaceOnce(
    code,
    plainImpact,
    '          if (beginAgent3SlosherWallDrop(this, p, hit)) return false;\n          this._impact(p, hit);',
    'agent3 weapon physics: Slosher wall-hit admission',
  );
  const plainRollerBody = '      if (fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2 && hs > 1.0) {';
  const contactRollerBody = '      if (fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2 && hs > 1.0 && rollerContactClear(a, e, w, G.physics, PLAYER)) {';
  if (code.includes(contactRollerBody)) code = replaceOnce(
    code,
    contactRollerBody,
    '      if (agent3RollerBodyContact(a, e, hs) && rollerContactClear(a, e, w, G.physics, PLAYER)) {',
    'agent3 weapon physics: Roller body collision with contact visibility',
  );
  else code = replaceOnce(
    code,
    plainRollerBody,
    '      if (agent3RollerBodyContact(a, e, hs)) {',
    'agent3 weapon physics: Roller body collision',
  );
  return "import { beginAgent3SlosherWallDrop, stepAgent3SlosherWallDrop, agent3RollerBodyContact } from '../../patches/splatoon3/runtime/agent3-weapon-physics.mjs';\n" + code;
}
