import { Character, CHARACTER_CHANNELS, CHARACTER_TIMERS } from '../../src/game/character.js';
import { G } from '../../src/core/ctx.js';
import { Projectiles } from '../../src/game/weapons.js';
import { BotBrain } from '../../src/game/bots.js';
import { Menus } from '../../src/ui/menus.js';
import { rollerDetailMotionSnapshot } from '../splatoon3/runtime/roller-detail-motion.mjs';
import { installRollerMotionQuality } from './roller-motion.mjs';
import { installRollerVisualQuality } from './roller-visual.mjs';
import { installMenuQuality } from './menu.mjs';
import { installOffscreenVisualBudget } from './offscreen-visual-budget.mjs';
import { installOfflineOffscreenBudget, installAttractBotBudget } from './offline-offscreen-budget.mjs';
import { installIntermediateTickBudget } from './intermediate-tick-budget.mjs';
import { installKidShadowProxy } from './kid-shadow-proxy.mjs';
import { touchPrimary } from '../../src/core/device.js';
import * as THREE from 'three';
export function installQuality(profile){
  const api={Character,CHARACTER_CHANNELS,CHARACTER_TIMERS,Projectiles};
  installRollerMotionQuality(api,rollerDetailMotionSnapshot);
  installRollerVisualQuality(api);
  installMenuQuality(Menus);
  // Main #1175 path: presentation-only remote replicas can defer full visual pose.
  installOffscreenVisualBudget(api,G);
  // #845 residual: offline bots author shots from rig-bone muzzles, so retain pose
  // and muzzle transforms; substitute exact level ground queries and defer only
  // stable offscreen leg IK, pose tail, hair and material presentation work.
  installOfflineOffscreenBudget(api,G);
  installAttractBotBudget({ BotBrain }, G);
  // Outermost Character.update wrapper: bots/replicas skip visual work on fixed ticks that are never drawn.
  installIntermediateTickBudget(api,G);
  // Touch devices (sun map capped at 2048²): kids cast their shadow from the far-tier body.
  installKidShadowProxy(api,G,THREE,()=>touchPrimary);
}
