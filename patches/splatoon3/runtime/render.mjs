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

const PAINT_PRESENTATION_INSTALLED = Symbol.for('inkwave.issue570.paint-body-presentation');
const GROWTH_CAPTURE = Symbol.for('inkwave.issue570.paint-growth-capture');

function captureGrowthPush(g) {
  const state = this[GROWTH_CAPTURE];
  if (state?.depth) state.frames[state.depth - 1].growth = g;
  return state.nativePush.call(this, g);
}

function growthCaptureFor(growing) {
  let state = growing[GROWTH_CAPTURE];
  if (!state) {
    state = { nativePush: growing.push, depth: 0, frames: [] };
    Object.defineProperty(growing, GROWTH_CAPTURE, { value: state });
    Object.defineProperty(growing, 'push', { value: captureGrowthPush, writable: true, configurable: true });
  }
  return state;
}

// Keep the gameplay grid authoritative while making its full native body visible on the landing call.
export function installIssue570PaintPresentation(PaintSystem) {
  const proto = PaintSystem?.prototype;
  if (!proto || typeof proto.splat !== 'function' || typeof proto._emitGrowth !== 'function' || typeof proto._pushQuad !== 'function') {
    throw new TypeError('Issue #570 paint presentation requires native splat, growth, and quad methods');
  }
  if (proto[PAINT_PRESENTATION_INSTALLED]) return false;

  const nativeSplat = proto.splat;
  const nativeEmitGrowth = proto._emitGrowth;

  proto._emitGrowth = function issue570EmitGrowth(g, tn, dT, dripOnly, bodyOnly = false) {
    if (!bodyOnly) return nativeEmitGrowth.call(this, g, tn, dT, dripOnly);

    const hadOwnPush = Object.prototype.hasOwnProperty.call(this, '_pushQuad');
    const previousPush = this._pushQuad;
    this._pushQuad = function issue570BodyQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode) {
      if (mode !== 0) throw new Error('Issue #570 body-only draw expected a native body quad');
      // Fixed native arguments avoid allocating a rest array for every face.
      return previousPush.call(this, f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, 2);
    };
    try {
      return nativeEmitGrowth.call(this, g, tn, dT, dripOnly);
    } finally {
      if (hadOwnPush) this._pushQuad = previousPush;
      else delete this._pushQuad;
    }
  };

  proto.splat = function issue570Splat(center, radius, team, opts = {}) {
    if (opts.cosmetic || opts.instant || !Array.isArray(this.growing)) {
      return nativeSplat.call(this, center, radius, team, opts);
    }

    // Capture the native append itself; this also works if a separate adapter reuses a growth record object.
    const state = growthCaptureFor(this.growing);
    const frame = state.frames[state.depth] || (state.frames[state.depth] = { growth: null });
    frame.growth = null;
    state.depth++;
    let claimed, g;
    try {
      claimed = nativeSplat.call(this, center, radius, team, opts);
      g = frame.growth;
    } finally {
      state.depth--;
      frame.growth = null;
    }
    if (g && g.team === team && g.kind !== 7) this._emitGrowth(g, 3, 0, false, true);
    return claimed;
  };

  Object.defineProperty(proto, PAINT_PRESENTATION_INSTALLED, { value: true });
  return true;
}
