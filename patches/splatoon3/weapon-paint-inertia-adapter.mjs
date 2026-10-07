export function adaptWeaponPaintInertia(rel, code, replace) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replace(code, '  _push(p) {\n    this.list.push(p);', '  _push(p) {\n    addPlayerForwardVelocity(p);\n    this.list.push(p);', 'final launch before network recording');
  code = replace(code, '    p.delay = 0; p.head = false;', '    p.s3ForwardVelocityApplied = false;\n    p.delay = 0; p.head = false;', 'pooled launch inheritance reset');
  return "import { addPlayerForwardVelocity } from '../../patches/splatoon3/runtime/weapon-paint-inertia.mjs';\n" + code;
}
