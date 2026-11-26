// Weak-weapon Bot combat AI adapter (2026-11-25).
// Applied after adaptBotTurfPaint on src/game/bots.js; leaves strong families
// (shooter, dualies, slosher) completely untouched.
const IMPORT = "import { botWeakWeaponCombat } from '../../patches/splatoon3/runtime/bot-weak-weapon-combat.mjs';\n";

export function adaptBotWeakWeaponCombat(rel, code, replaceOnce) {
  if (rel !== 'src/game/bots.js') return code;
  if (code.includes(IMPORT)) throw new Error('INKWAVE bot weak-weapon combat: repeated bots.js transform');

  // Allow Brush bots to retreat at low HP like other frontline weapons (only true Rollers stay aggressive)
  code = replaceOnce(
    code,
    "hpFrac < 0.34 && family !== 'roller' && a.lastDamage < 0.8",
    "hpFrac < 0.34 && (family !== 'roller' || brush) && a.lastDamage < 0.8",
    'bot brush allow retreat'
  );

  // Wire weak-weapon combat hook right after the fight-mode fire & cover-bomb block
  code = replaceOnce(
    code,
    "        if (!it.fire && !a.weaponRunner.charging) wantPitch += botCoverBomb(this, a, dist, a.ink, selectedSubCost(a, SUB), dt);\n",
    "        if (!it.fire && !a.weaponRunner.charging) wantPitch += botCoverBomb(this, a, dist, a.ink, selectedSubCost(a, SUB), dt);\n" +
    "        const _weakAim = botWeakWeaponCombat(this, G, a, dt, move, { family, dist, range, dx, dz, enemyVisible, aimed, off, inkFrac, idealYaw, idealPitch, wantYaw, wantPitch });\n" +
    "        if (_weakAim) { wantYaw = _weakAim.wantYaw; wantPitch = _weakAim.wantPitch; }\n",
    'bot weak-weapon combat hook'
  );

  // Speed up splatling sweep while streaming so full-charge bursts cover wide turf instead of overpainting
  code = replaceOnce(
    code,
    "      this.sweep += dt * (family === 'charger' ? 0.8 : 2.1);\n",
    "      this.sweep += dt * (family === 'charger' ? 1.8 : family === 'splatling' && a.weaponRunner.streaming ? 3.2 : 2.1);\n",
    'bot charger/splatling paint sweep cadence'
  );

  return IMPORT + code;
}
