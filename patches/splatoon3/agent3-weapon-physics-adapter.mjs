export function adaptAgent3WeaponPhysics(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replaceOnce(
    code,
    '      advanceFidelityProjectile(p, dt);',
    '      const agent3WallDropDone = stepAgent3SlosherWallDrop(this, p, dt);\n      if (agent3WallDropDone !== null) return agent3WallDropDone;\n      advanceFidelityProjectile(p, dt);',
    'agent3 weapon physics: Slosher retained wall-drop step',
  );
  code = replaceOnce(
    code,
    '          this._impact(p, hit);',
    '          if (beginAgent3SlosherWallDrop(this, p, hit)) return false;\n          this._impact(p, hit);',
    'agent3 weapon physics: Slosher wall-hit admission',
  );
  code = replaceOnce(
    code,
    '      if (fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2 && hs > 1.0) {',
    '      if (agent3RollerBodyContact(a, e, hs)) {',
    'agent3 weapon physics: Roller body collision',
  );
  return "import { beginAgent3SlosherWallDrop, stepAgent3SlosherWallDrop, agent3RollerBodyContact } from '../../patches/splatoon3/runtime/agent3-weapon-physics.mjs';\n" + code;
}
