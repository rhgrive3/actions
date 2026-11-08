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
  if (!THREE.Scene.prototype._iwSceneMatrixDedupInstalled) {
    THREE.Scene.prototype._iwSceneMatrixDedupInstalled = true;
    const origUpdateMatrixWorld = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (force) {
      if (this._iwComposerPass && this._iwComposerWorldReady && !force && !this.matrixWorldNeedsUpdate) {
        return;
      }
      origUpdateMatrixWorld.call(this, force);
      if (this._iwComposerPass) this._iwComposerWorldReady = true;
    };
  }
  if (THREE.Skeleton?.prototype && !THREE.Skeleton.prototype._iwFastSkeletonUpdate) {
    THREE.Skeleton.prototype._iwFastSkeletonUpdate = true;
    const _ident = new THREE.Matrix4(), _offMat = new THREE.Matrix4();
    THREE.Skeleton.prototype.update = function () {
      const bones = this.bones, boneInverses = this.boneInverses, boneMatrices = this.boneMatrices, boneTexture = this.boneTexture;
      for (let i = 0, il = bones.length; i < il; i++) {
        const matrix = bones[i] ? bones[i].matrixWorld : _ident;
        const inv = boneInverses[i], be = inv.elements, ae = matrix.elements;
        const off = i * 16;
        if (be[0] === 1 && be[5] === 1 && be[10] === 1 && be[15] === 1 &&
          be[1] === 0 && be[2] === 0 && be[3] === 0 && be[4] === 0 &&
          be[6] === 0 && be[7] === 0 && be[8] === 0 && be[9] === 0 && be[11] === 0) {
          const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
          const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
          const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
          const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
          if (Number.isFinite(a11 + a12 + a13 + a14 + a21 + a22 + a23 + a24 + a31 + a32 + a33 + a34 + a41 + a42 + a43 + a44)) {
            const tx = be[12], ty = be[13], tz = be[14];
            boneMatrices[off] = a11 + 0; boneMatrices[off + 1] = a21 + 0; boneMatrices[off + 2] = a31 + 0; boneMatrices[off + 3] = a41 + 0;
            boneMatrices[off + 4] = a12 + 0; boneMatrices[off + 5] = a22 + 0; boneMatrices[off + 6] = a32 + 0; boneMatrices[off + 7] = a42 + 0;
            boneMatrices[off + 8] = a13 + 0; boneMatrices[off + 9] = a23 + 0; boneMatrices[off + 10] = a33 + 0; boneMatrices[off + 11] = a43 + 0;
            boneMatrices[off + 12] = a11 * tx + a12 * ty + a13 * tz + a14 * 1;
            boneMatrices[off + 13] = a21 * tx + a22 * ty + a23 * tz + a24 * 1;
            boneMatrices[off + 14] = a31 * tx + a32 * ty + a33 * tz + a34 * 1;
            boneMatrices[off + 15] = a41 * tx + a42 * ty + a43 * tz + a44 * 1;
            continue;
          }
        }
        _offMat.multiplyMatrices(matrix, inv);
        _offMat.toArray(boneMatrices, off);
      }
      if (boneTexture !== null) boneTexture.needsUpdate = true;
    };
  }
}
