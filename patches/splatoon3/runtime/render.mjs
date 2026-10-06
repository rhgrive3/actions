import { CameraRig } from '../../../src/game/cameraRig.js';

const DEATH_CAMERA_INSTALL = Symbol.for('inkwave.s3.death-camera.install.v1');
const environmentalCause = cause => cause === 'water' || cause === 'fall' || cause === 'environment' || cause === 'out-of-bounds';
const clamp01 = x => Math.max(0, Math.min(1, x));

export function installDeathCamera({ Actor, G }) {
  if (!Actor || !CameraRig || Actor.prototype[DEATH_CAMERA_INSTALL]) return;
  Object.defineProperty(Actor.prototype, DEATH_CAMERA_INSTALL, { value: true });

  const reset = Actor.prototype.reset, splat = Actor.prototype.splat;
  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3 ||= {};
    this.s3.deathPresentation = null;
    return result;
  };
  Actor.prototype.splat = function (attacker, cause = 'weapon') {
    this.s3 ||= {};
    this.s3.deathPresentation = environmentalCause(cause) ? 'blackout' : null;
    return splat.call(this, attacker, cause);
  };

  const update = CameraRig.prototype.update;
  CameraRig.prototype.update = function (dt) {
    // Respawn from an environmental blackout is a direct return to the freshly
    // snapped player camera; do not blend from the hidden stale spectate pose.
    if (this._s3EnvironmentalBlackout && this.mode === 'follow') {
      this._prevMode = 'follow';
      if (this.blend) this.blend.active = false;
    }
    const result = update.call(this, dt);
    const local = G.match?.local;
    const environmental = this.mode === 'spectate' && !local?.alive && local?.s3?.deathPresentation === 'blackout';
    this._s3EnvironmentalBlackout = environmental;
    const canvas = G.renderer?.domElement;
    if (canvas) {
      if (environmental && !this.mapOpen) {
        // Keep the brief disappearance read, then black only the 3D world.
        // HUD/signals remain DOM-visible; opening the map restores the renderer
        // so the existing diorama/map interaction is still available while dead.
        const fade = clamp01((this.spectateT - 0.12) / 0.18);
        canvas.style.opacity = String(1 - fade);
      } else {
        canvas.style.opacity = '1';
      }
    }
    return result;
  };
}

// The public cache hook bypasses Three's disabled-shadow early return, then
// reads shadow.map.width before a map exists. Preserve Three's own behavior.
export function installRendering({ ShadowCache }) {
  const render = ShadowCache.prototype._render;
  ShadowCache.prototype._render = function (shadowMap, lights, scene, camera) {
    if (!shadowMap.enabled) return this._orig.call(shadowMap, lights, scene, camera);
    return render.call(this, shadowMap, lights, scene, camera);
  };
}
