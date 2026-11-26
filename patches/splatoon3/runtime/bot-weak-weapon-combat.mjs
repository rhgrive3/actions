// Weak-weapon Bot combat AI improvements (2026-11-25).
// Strictly leaves strong families ('shooter', 'dualies', 'slosher') untouched.
// Delegates each of the 8 weak weapon families (39 individual weapons) to its
// dedicated O(1) zero-allocation module grounded in Splatoon 3 mechanics.
import { botRawWeaponFamily } from './bot-turf-paint.mjs';
import { applyChargerCombat } from './bot-ai-charger.mjs';
import { applyBlasterCombat } from './bot-ai-blaster.mjs';
import { applyRollerCombat } from './bot-ai-roller.mjs';
import { applyStringerCombat } from './bot-ai-stringer.mjs';
import { applySplatanaCombat } from './bot-ai-splatana.mjs';
import { applyBrushCombat } from './bot-ai-brush.mjs';
import { applySplatlingCombat } from './bot-ai-splatling.mjs';
import { applyBrellaCombat } from './bot-ai-brella.mjs';

const STRONG_FAMILIES = new Set(['shooter', 'dualies', 'slosher']);

export function botWeakWeaponCombat(brain, G, actor, dt, move, ctx) {
  const w = actor?.weapon;
  const rawFamily = botRawWeaponFamily(w, ctx.family);
  if (STRONG_FAMILIES.has(rawFamily)) return null;

  const it = actor.intent;
  const wr = actor.weaponRunner;
  if (!it || !wr) return null;

  switch (rawFamily) {
    case 'charger':   return applyChargerCombat(brain, G, actor, dt, move, ctx);
    case 'blaster':   return applyBlasterCombat(brain, G, actor, dt, move, ctx);
    case 'roller':    return applyRollerCombat(brain, G, actor, dt, move, ctx);
    case 'stringer':  return applyStringerCombat(brain, G, actor, dt, move, ctx);
    case 'splatana':  return applySplatanaCombat(brain, G, actor, dt, move, ctx);
    case 'brush':     return applyBrushCombat(brain, G, actor, dt, move, ctx);
    case 'splatling': return applySplatlingCombat(brain, G, actor, dt, move, ctx);
    case 'brella':    return applyBrellaCombat(brain, G, actor, dt, move, ctx);
    default:          return null;
  }
}
