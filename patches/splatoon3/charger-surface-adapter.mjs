export function adaptChargerSurface(rel, code, replace) {
  const patch = (before,after,label) => { code = replace(code,before,after,'charger surface: '+label); };
  if (rel === 'src/game/actor.js') {
    patch('const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy();','const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);','independent post-shot swim gate');
    return "import { chargerSwimLocked } from '../../patches/splatoon3/runtime/charger-surface.mjs';\n" + code;
  }
  if (rel === 'src/game/cameraRig.js') {
    patch('const charging = a.weaponRunner?.charging ? a.weaponRunner.charge : 0;', "const charging = a.weaponRunner?.charging && (a.weapon?.kind !== 'charger' || a.weapon.scopedCharge === true) ? a.weaponRunner.charge : 0;", 'explicit scope capability');
  }
  if (rel === 'src/game/weapons.js') {
    patch('hitBase(e), PLAYER.radius + 0.12,', 'hitBase(e), PLAYER.radius,','partial-shot capsule axis');
    patch('if (_res.dist < PLAYER.radius + 0.14)', 'if (_res.dist < PLAYER.radius + w.playerHitRadius)','partial-shot radius');
    patch('if (_res.dist < PLAYER.radius * 0.95 + p.size)', 'if (_res.dist < PLAYER.radius + mainPlayerRadius(p, PLAYER))','shooter radius anchor');
    patch('w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2 }', 'chargerLinePaint(w, charge).radius, a.team, { seed: Math.random(), stretch: dir, stretchAmt: chargerLinePaint(w, charge).stretchAmt }','charge-dependent line shape');
    return "import { mainPlayerRadius, chargerLinePaint } from '../../patches/splatoon3/runtime/charger-surface.mjs';\n" + code;
  }
  return code;
}
