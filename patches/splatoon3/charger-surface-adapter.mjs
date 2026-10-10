export function adaptChargerSurface(rel, code, replace) {
  const patch = (before, after, label) => { code = replace(code, before, after, 'charger surface: ' + label); };
  if (rel === 'src/game/actor.js') {
    patch('const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy();',
      'const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);',
      'independent post-shot swim gate');
    return "import { chargerSwimLocked } from '../../patches/splatoon3/runtime/charger-surface.mjs';\n" + code;
  }
  if (rel === 'src/game/weapons.js') {
    patch("const on = a.alive && a.weaponRunner.charging && a.weapon.kind === 'charger';",
      'const on = chargerSightVisible(a);', 'independent kept-charge laser clock');
    return "import { chargerSightVisible } from '../../patches/splatoon3/runtime/charger-surface.mjs';\n" + code;
  }
  if (rel === 'src/net/netmatch.js') {
    // Reuse the existing presentation flag; never set the local runner charging
    // just to show the 25F warning, and do not change the wire packet shape.
    patch('if (wr.charging) f |= F.charging;',
      'if (wr.charging || chargerSightVisible(a)) f |= F.charging;', 'remote kept-charge warning');
    return "import { chargerSightVisible } from '../../patches/splatoon3/runtime/charger-surface.mjs';\n" + code;
  }
  if (rel === 'src/game/cameraRig.js') {
    patch('const charging = a.weaponRunner?.charging ? a.weaponRunner.charge : 0;',
      "const charging = a.weaponRunner?.charging && (a.weapon?.kind !== 'charger' || a.weapon.scopedCharge === true) ? a.weaponRunner.charge : 0;",
      'explicit scope capability');
  }
  return code;
}
