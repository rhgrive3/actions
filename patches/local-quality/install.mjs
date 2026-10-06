import { Character, CHARACTER_CHANNELS, CHARACTER_TIMERS } from '../../src/game/character.js';
import { G } from '../../src/core/ctx.js';
import { Projectiles } from '../../src/game/weapons.js';
import { Menus } from '../../src/ui/menus.js';
import { rollerDetailMotionSnapshot } from '../splatoon3/runtime/roller-detail-motion.mjs';
import { installRollerMotionQuality } from './roller-motion.mjs';
import { installRollerVisualQuality } from './roller-visual.mjs';
import { installMenuQuality } from './menu.mjs';
import { installOffscreenVisualBudget } from './offscreen-visual-budget.mjs';
export function installQuality(profile){
  const api={Character,CHARACTER_CHANNELS,CHARACTER_TIMERS,Projectiles};
  installRollerMotionQuality(api,rollerDetailMotionSnapshot);
  installRollerVisualQuality(api);
  installMenuQuality(Menus);
  // #845: rendering-only. Frustum-culled actors keep authoritative simulation and
  // stop paying for pose/hair/foot-IK work nobody draws.
  installOffscreenVisualBudget(api,G);
}
