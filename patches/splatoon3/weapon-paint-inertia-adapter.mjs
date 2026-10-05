export function adaptWeaponPaintInertia(rel, code, replace) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replace(code, 'const step = w.lineSplatEvery;', 'const step = chargerLineSpacing(w, charge);', 'charger charge-dependent line spacing');
  // Gameplay ground impact and its presentation event must share the same radius.
  code = replace(code, 'G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge)', 'G.paint.splat(_v2, chargerImpactRadius(w, charge)', 'charger impact paint');
  code = replace(code, "kind: 'charger', radius: w.impactRadius * (0.6 + 0.4 * charge)", "kind: 'charger', radius: chargerImpactRadius(w, charge)", 'charger impact event');
  code = replace(code, '  _push(p) {\n    this.list.push(p);', '  _push(p) {\n    addPlayerForwardVelocity(p);\n    this.list.push(p);', 'final launch before network recording');
  code = replace(code, '    p.delay = 0; p.head = false;', '    p.s3ForwardVelocityApplied = false;\n    p.delay = 0; p.head = false;', 'pooled launch inheritance reset');
  return "import { chargerImpactRadius, chargerLineSpacing, addPlayerForwardVelocity } from '../../patches/splatoon3/runtime/weapon-paint-inertia.mjs';\n" + code;
}
