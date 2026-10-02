import * as THREE from 'three';
import { G, on, emit } from '../../../src/core/ctx.js';
import { PLAYER, WEAPONS, SUB, SPECIALS, DEFAULT_SETTINGS } from '../../../src/config.js';
import { Actor } from '../../../src/game/actor.js';
import { WeaponRunner, Projectiles } from '../../../src/game/weapons.js';
import { PaintSystem } from '../../../src/world/paint.js';
import { PlayerController } from '../../../src/game/player.js';
import { Physics, Hit } from '../../../src/game/physics.js';
import { Menus } from '../../../src/ui/menus.js';
import { ShadowCache } from '../../../src/core/shadowcache.js';
import { installMovement } from './movement.mjs';
import { installWeapons } from './weapons.mjs';
import { installGear } from './gear.mjs';
import { installFlow } from './flow.mjs';
import { installResources } from './resources.mjs';
import { installClock } from './clock.mjs';
import { installScoring } from './scoring.mjs';
import { installUi } from './ui.mjs';
import { installRendering } from './render.mjs';

let installed = false;
export function install(profile) {
  if (installed) throw new Error('INKWAVE patches already installed');
  if (profile.schema !== 1 || profile.referenceVersion !== '11.3.0') throw new Error('Unsupported gameplay profile');
  const api = { THREE, G, on, emit, PLAYER, WEAPONS, SUB, SPECIALS, Actor, WeaponRunner, Projectiles, PaintSystem, PlayerController, Menus, ShadowCache, Physics, Hit };
  Object.assign(PLAYER, profile.player);
  for (const [kind, data] of Object.entries(profile.weapons)) {
    if (!WEAPONS[kind]) throw new Error(`Missing upstream weapon ${kind}`);
    Object.assign(WEAPONS[kind], data);
  }
  Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.specials || {})) Object.assign(SPECIALS[id], data);
  installWeapons(api, profile);
  installMovement(api, profile);
  installGear(api, profile);
  installFlow(api, profile);
  installResources(api, profile);
  installScoring(api);
  installClock(api);
  installUi(api);
  installRendering(api);
  // Aim remains tied to the actual camera ray. No target-dependent auto-turn.
  DEFAULT_SETTINGS.aimAssist = 0; DEFAULT_SETTINGS.aimAssistMouse = false;
  PlayerController.prototype._assistTarget = () => null;
  G.s3 = { patchVersion: 1, referenceVersion: profile.referenceVersion, calibration: profile.calibration, installed: true };
  installed = true;
  return api;
}
