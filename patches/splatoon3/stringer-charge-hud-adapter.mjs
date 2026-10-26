// Presentation-only hook, kept separate from shared shot-guide projection.
export function adaptStringerChargeHud(rel, code) {
  if (rel !== 'src/ui/hud.js') return code;
  if (!code.includes('export class HUD ') || !code.includes('  _updCrosshair(f, dt) {'))
    throw new Error('INKWAVE Stringer charge HUD owner changed');
  return "import { installStringerChargeHud } from '../../patches/splatoon3/runtime/stringer-charge-hud.mjs';\n" +
    code + '\ninstallStringerChargeHud(HUD, WEAPONS);\n';
}
