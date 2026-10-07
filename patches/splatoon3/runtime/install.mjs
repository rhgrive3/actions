import { installTurfCombatGate } from './turf-combat.mjs';
import { installSplatGhostReturn } from '../issue-284-adapter.mjs';
import { installIssue196SpecialChargeCancel } from '../issue-196-adapter.mjs';
import * as THREE from 'three';
import { G, on, emit } from '../../../src/core/ctx.js';
import { PLAYER, WEAPONS, SUB, SPECIALS, DEFAULT_SETTINGS } from '../../../src/config.js';
import { Actor } from '../../../src/game/actor.js';
import { Character, CHARACTER_CHANNELS, CHARACTER_TIMERS, CHARACTER_FOOT_MODES, CHARACTER_FOOT_METRICS, CHARACTER_BOMB_POSE } from '../../../src/game/character.js';
import { WeaponRunner, Projectiles } from '../../../src/game/weapons.js';
import { NetMatch } from '../../../src/net/netmatch.js';
import { PaintSystem } from '../../../src/world/paint.js';
import { Minimap } from '../../../src/game/minimap.js';
import { PlayerController } from '../../../src/game/player.js';
import { Physics, Hit } from '../../../src/game/physics.js';
import { Menus } from '../../../src/ui/menus.js';
import { HUD } from '../../../src/ui/hud.js';
import { SUB_ICONS, SPECIAL_ICONS } from '../../../src/ui/ui-icons.js';
import { ShadowCache } from '../../../src/core/shadowcache.js';
import { installMovement } from './movement.mjs';
import { installMovementMotion } from './movement-motion.mjs';
import { installMinimapDirty } from './minimap-dirty.mjs';
import { installWeapons, installArcPreviewPerformance } from './weapons.mjs';
import { installWeaponsFidelity } from './weapons-fidelity.mjs';
import { installMuzzleFeedback } from './muzzle-feedback.mjs';
import { installShotGuide } from './weapons-fidelity.mjs';
import { installChargerSurface } from './charger-surface.mjs';
import { installSubSpecialFidelity } from './sub-special-fidelity.mjs';
import { installKitDefense } from './kit-defense.mjs';
import { installKitSubs } from './kit-subs.mjs';
import { installKitBigBubbler } from './kit-big-bubbler.mjs';
import { installKitInkVac } from './kit-ink-vac.mjs';
import { installKitNetwork } from './kit-network.mjs';
import { installKitTrizooka } from './kit-trizooka.mjs';
import { composeKits, registerKitMetadata } from './kit-composition.mjs';
import { installGear } from './gear.mjs';
import { installFlow } from './flow.mjs';
import { installResources } from './resources.mjs';
import { installClock } from './clock.mjs';
import { installScoring } from './scoring.mjs';
import { installUi } from './ui.mjs';
import { installRendering, installDeathCamera } from './render.mjs';
import { installRollerMotion } from './roller.mjs';
import { installWalkMotion } from './walk.mjs';
import { installWeaponMotion } from './weapon-motion.mjs';
import { installFlowMotion } from './flow-motion.mjs';
import { installBombMotion } from './bomb-motion.mjs';
import { installWeaponDetailMotion } from './weapon-detail-motion.mjs';
import { installJumpMotion } from './jump-motion.mjs';
import { installLandingMotion } from './landing-motion.mjs';
import { installSwimMotion } from './swim-motion.mjs';
import { installWallMotion } from './wall-motion.mjs';
import { installFormMotion } from './form-motion.mjs';
import { installDualiesMotion } from './dualies-motion.mjs';
import { installRollerDetailMotion } from './roller-detail-motion.mjs';
import { installRollerFold } from './roller-fold.mjs';
import { installSuperjumpMotion } from './superjump-motion.mjs';
import { installSuperJumpTargetNotification } from './superjump-target-notification.mjs';
import { installSquidrollMotion } from './squidroll-motion.mjs';
import { installHitSpawnMotion } from './hit-spawn-motion.mjs';
import { installIdleMotion } from './idle-motion.mjs';
import { installEmotesMotion } from './emotes-motion.mjs';
import { installSpecialMotion } from './special-motion.mjs';
import { installFaceMotion } from './face-motion.mjs';
import { installRespawnLifecycle } from './respawn-lifecycle.mjs';
import { installCarryMotion } from './carry-motion.mjs';

let installed = false;
export function install(profile) {
  if (installed) throw new Error('INKWAVE patches already installed');
  if (profile.schema !== 1 || profile.referenceVersion !== '11.3.0') throw new Error('Unsupported gameplay profile');
  const api = { THREE, G, on, emit, PLAYER, WEAPONS, SUB, SPECIALS, SUB_ICONS, SPECIAL_ICONS, Actor, NetMatch, Character, CHARACTER_CHANNELS, CHARACTER_TIMERS, CHARACTER_FOOT_MODES, CHARACTER_FOOT_METRICS, CHARACTER_BOMB_POSE, WeaponRunner, Projectiles, PaintSystem, Minimap, PlayerController, Menus, HUD, ShadowCache, Physics, Hit };
  Object.assign(PLAYER, profile.player);
  for (const [kind, data] of Object.entries(profile.weapons)) {
    if (!WEAPONS[kind]) throw new Error(`Missing upstream weapon ${kind}`);
    Object.assign(WEAPONS[kind], data);
  }
  Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.specials || {})) Object.assign(SPECIALS[id], data);
  installWeapons(api, profile);
  installSubSpecialFidelity(api, profile);
  installKitDefense(api);
  installKitSubs(api, profile);
  installKitBigBubbler(api, profile);
  installKitInkVac(api, profile);
  installKitTrizooka(api, profile);
  registerKitMetadata(api);
  composeKits(api);
  installKitNetwork(api);
  installRollerMotion(api, profile);
  installMovement(api, profile);
  installMovementMotion(api, profile);
  installGear(api, profile);
  installFlow(api, profile);
  installResources(api, profile);
  installScoring(api);
  installClock(api);
  installUi(api);
  installRendering(api);
  installWeaponMotion(api, profile);
  installBombMotion(api);
  installDualiesMotion(api, profile);
  installCarryMotion(api);
  installWalkMotion(api, profile);
  installJumpMotion(api, profile);
  installLandingMotion(api, profile);
  installSwimMotion(api, profile);
  installWallMotion(api, profile);
  installFormMotion(api, profile);
  installRollerDetailMotion(api, profile);
  // Presentation only: the Roller's articulated middle hinge reads the attack state
  // installRollerMotion/roller logic already own and never writes gameplay back.
  installRollerFold(api, profile);
  installSuperjumpMotion(api, profile);
  installSquidrollMotion(api, profile);
  installHitSpawnMotion(api, profile);
  installDeathCamera(api);
  installIdleMotion(api, profile);
  installEmotesMotion(api, profile);
  installSpecialMotion(api, profile);
  installFlowMotion(api);
  installFaceMotion(api, profile);
  installRespawnLifecycle(api, profile);
  // Issue #798: the arc guide is presentation-only. Throttle its native
  // collision-query cadence without touching actual bomb physics.
  installArcPreviewPerformance(api);
  // Main-weapon fidelity must be installed on the same canonical context before
  // gameplay can create projectiles; bootstrap's compatibility call is then a no-op.
  installWeaponsFidelity(api, profile);
  installSuperJumpTargetNotification(api);
  installMuzzleFeedback(api);
  installMinimapDirty(api);
  installWeaponDetailMotion(api, profile);
  installChargerSurface(api);
  // The S3 ShotGuideFrame guide reads the installed projectile motion records, so
  // it installs after main-weapon fidelity and before any aim/HUD consumer runs.
  installShotGuide(api, profile);
  installChargerSurface(api);
  // Aim remains tied to the actual camera ray. No target-dependent auto-turn.
  DEFAULT_SETTINGS.aimAssist = 0; DEFAULT_SETTINGS.aimAssistMouse = false;
  PlayerController.prototype._assistTarget = () => null;
  G.s3 = { patchVersion: 1, referenceVersion: profile.referenceVersion, calibration: profile.calibration, installed: true };
  installed = true;
  installIssue196SpecialChargeCancel(api);
  installSplatGhostReturn(api);
  installTurfCombatGate(api);
  return api;
}
