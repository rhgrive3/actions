export function adaptChargerSurface(rel, code, replace) {
  const patch = (before, after, label) => { code = replace(code, before, after, 'charger surface: ' + label); };
  if (rel === 'src/game/actor.js') {
    patch('const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy();',
      'const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);',
      'independent post-shot swim gate');
    return "import { chargerSwimLocked } from '../../patches/splatoon3/runtime/charger-surface.mjs';\n" + code;
  }
  if (rel === 'src/game/cameraRig.js') {
    patch('const charging = a.weaponRunner?.charging ? a.weaponRunner.charge : 0;',
      "const charging = a.weaponRunner?.charging && (a.weapon?.kind !== 'charger' || a.weapon.scopedCharge === true) ? a.weaponRunner.charge : 0;",
      'explicit scope capability');
  }
  return code;
}
