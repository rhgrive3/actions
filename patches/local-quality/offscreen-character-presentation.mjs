import { G } from '../../src/core/ctx.js';

const INSTALL_KEY = Symbol.for('inkwave.offscreen-character-presentation.v1');
const disposed = new WeakSet();
const scratchByThree = new WeakMap();
const cameraState = { camera: null, renderer: null, scene: null, frame: -1, at: 0, valid: false };
const CULL_DISTANCE_SQ = 30 * 30;
const BODY_RADIUS = 1.7;
const POSE_RECENT_SHOT = 0.35;
const POSE_CATCHUP_SECONDS = 0.1;

function scratchFor(THREE) {
  let scratch = scratchByThree.get(THREE);
  if (!scratch) {
    scratch = {
      viewProjection: new THREE.Matrix4(),
      frustum: new THREE.Frustum(),
      sphere: new THREE.Sphere(new THREE.Vector3(), BODY_RADIUS),
    };
    scratchByThree.set(THREE, scratch);
  }
  return scratch;
}

function now() {
  return globalThis.performance?.now?.() ?? 0;
}

export function capturePresentationCamera(THREE, renderer, scene, camera) {
  if (scene !== G.scene) return;
  const frame = renderer?.info?.render?.frame;
  if (!camera?.isPerspectiveCamera || camera.isArrayCamera || renderer?.xr?.isPresenting
    || !Number.isFinite(frame) || !camera.projectionMatrix || !camera.matrixWorldInverse) {
    cameraState.valid = false;
    cameraState.scene = scene;
    return;
  }
  scratchFor(THREE);
  cameraState.camera = camera;
  cameraState.renderer = renderer;
  cameraState.scene = scene;
  cameraState.frame = frame;
  cameraState.at = now();
  cameraState.valid = true;
}

function cameraCanCull(character) {
  if (!cameraState.valid || cameraState.scene !== G.scene || !G.scene || !G.physics) return false;
  if (cameraState.renderer?.xr?.isPresenting || now() - cameraState.at > 250) return false;
  if (character.root.parent !== G.scene || G.scene.visible === false) return false;
  const camera = cameraState.camera;
  return !!(camera?.isPerspectiveCamera && !camera.isArrayCamera
    && camera.projectionMatrix && camera.matrixWorldInverse);
}

function hasPoseConsumer(character, state, actor) {
  const runner = actor.weaponRunner;
  return !!(state?.firing || (state?.charge || 0) > 0.001 || state?.rolling || state?.subAim
    || runner?.firingPose?.() || (runner?.charge || 0) > 0.001 || runner?.rolling || runner?.aimingSub
    || runner?.busy?.() || actor.specialActive || actor.superJumpState || actor.climbing || actor.submerged
    || character.lastShot < POSE_RECENT_SHOT || character.lastRelease < POSE_RECENT_SHOT);
}

function safelyOffscreen(character, state, actor, THREE) {
  if (!actor?.remote || actor.isLocal || actor.isBot || actor.alive === false || disposed.has(character)) return false;
  // Keep moving gait/arm springs exact; the conservative safe case has no locomotion-driven muzzle pose.
  if (Math.hypot(actor.vel?.x || 0, actor.vel?.z || 0) > 0.2 || character.moving || character.gv > 0.35) return false;
  if (actor.pos && character.root.position.distanceToSquared(actor.pos) > 0.0025) return false;
  if (character.root.visible === false || character.root.parent?.visible === false) return false;
  if (!character.inWorld || character.kidScale <= 0.001 || (state?.form && state.form !== 'kid')) return false;
  const mode = actor.match?.mode || G.match?.mode;
  if (mode === 'range' || mode === 'practice' || mode === 'practice-range') return false;
  if (typeof actor._nearCamera !== 'function' || actor._nearCamera()) return false;
  if (hasPoseConsumer(character, state, actor) || !cameraCanCull(character)) return false;

  const camera = cameraState.camera;
  const e = camera.matrixWorld.elements;
  const root = character.root;
  const center = actor.pos || root.position;
  const dx = center.x - e[12], dy = center.y + 0.9 - e[13], dz = center.z - e[14];
  const distanceSq = dx * dx + dy * dy + dz * dz;
  if (!Number.isFinite(distanceSq) || distanceSq <= CULL_DISTANCE_SQ) return false;

  const scratch = scratchFor(THREE);
  scratch.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  scratch.frustum.setFromProjectionMatrix(scratch.viewProjection);
  const scale = root.scale;
  scratch.sphere.center.set(center.x, center.y + 0.9, center.z);
  scratch.sphere.radius = BODY_RADIUS * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 1);
  return !scratch.frustum.intersectsSphere(scratch.sphere);
}

function restorePose(character, updateFeet = true) {
  if (!character?._iwOffscreenPoseStale || disposed.has(character)) return;
  const state = character._iwOffscreenPoseState;
  const elapsed = Math.min(character._iwOffscreenPoseElapsed || 0, POSE_CATCHUP_SECONDS);
  character._iwOffscreenPoseStale = false;
  character._iwOffscreenSkipPose = false;
  character._iwOffscreenSkipGround = false;
  character._iwOffscreenPoseState = null;
  if (!state || character.kidScale <= 0.001 || character.root.visible === false
    || character.root.parent?.visible === false) {
    character.feetValid = false;
    character.headInit = false;
    character._headSet = false;
    return;
  }
  const dt = elapsed;
  const onEvent = character.onEvent;
  character.onEvent = null;
  try {
    if (updateFeet) {
      const phase = character.phase, moving = character.moving;
      character._updateFeet(0, state);
      character.phase = phase;
      character.moving = moving;
      character._iwOffscreenGaitMoving = moving;
    }
    character._buildPose(dt, state);
    character._applyPose(dt, state);
  } finally {
    character.onEvent = onEvent;
    character._iwOffscreenPoseElapsed = 0;
  }
}

function installShadowHooks(character) {
  if (character._iwOffscreenShadowHooks || disposed.has(character) || !character.root) return;
  character._iwOffscreenShadowHooks = true;
  character.root.traverse((object) => {
    const before = object.onBeforeShadow;
    if (typeof before !== 'function') return;
    object.onBeforeShadow = function offscreenPoseBeforeShadow(renderer, scene, camera, shadowCamera, geometry, material, group) {
      restorePose(character);
      return before.call(this, renderer, scene, camera, shadowCamera, geometry, material, group);
    };
  });
}

export function restoreOffscreenCharacterPose(character) {
  restorePose(character);
}

export function installOffscreenCharacterPresentation(Character, THREE) {
  const proto = Character?.prototype;
  if (!proto || proto[INSTALL_KEY]) return;
  Object.defineProperty(proto, INSTALL_KEY, { value: true });
  scratchFor(THREE);

  const ground = proto._ground, feet = proto._updateFeet, build = proto._buildPose, apply = proto._applyPose;
  proto._ground = function skipOffscreenGroundQuery(x, z, normal) {
    if (!this._iwOffscreenSkipGround) return ground.call(this, x, z, normal);
    if (normal) normal.set(0, 1, 0);
    return this.root.position.y;
  };
  proto._updateFeet = function gatedFeet(dt, state) {
    if (this._iwOffscreenUpdating && !this._iwOffscreenSafe && this._iwOffscreenPoseStale) {
      this.feetValid = false;
      this.replant = true;
      this.headInit = false;
      this._headSet = false;
    }
    return feet.call(this, dt, state);
  };
  proto._buildPose = function gatedPoseBuild(dt, state) {
    if (this._iwOffscreenSkipPose) return;
    if (this._iwOffscreenUpdating && this._iwOffscreenPoseStale && !this._iwOffscreenSafe) {
      this._iwOffscreenPoseStale = false;
      this._iwOffscreenPoseElapsed = 0;
      this._iwOffscreenPoseState = null;
    }
    return build.call(this, this._iwOffscreenPoseDtCurrent ?? dt, state);
  };
  proto._applyPose = function gatedPoseApply(dt, state) {
    if (this._iwOffscreenSkipPose) return;
    return apply.call(this, this._iwOffscreenPoseDtCurrent ?? dt, state);
  };

  const update = proto.update;
  proto.update = function updateWithOffscreenPresentation(dt, state, actor) {
    installShadowHooks(this);
    const skip = safelyOffscreen(this, state, actor, THREE);
    const step = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.1));
    const elapsed = Math.min(POSE_CATCHUP_SECONDS, (this._iwOffscreenPoseElapsed || 0) + step);
    const stale = this._iwOffscreenPoseStale;
    const refreshPose = skip && elapsed >= POSE_CATCHUP_SECONDS;
    this._iwOffscreenSafe = skip;
    this._iwOffscreenSkipGround = skip;
    this._iwOffscreenSkipPose = skip && !refreshPose;
    this._iwOffscreenPoseDtCurrent = skip ? elapsed : Math.min(0.1, elapsed);
    if (!skip && !stale) this._iwOffscreenPoseDtCurrent = step;
    this._iwOffscreenUpdating = true;
    try {
      return update.call(this, dt, state);
    } finally {
      this._iwOffscreenUpdating = false;
      this._iwOffscreenSafe = false;
      this._iwOffscreenSkipGround = false;
      this._iwOffscreenSkipPose = false;
      this._iwOffscreenPoseDtCurrent = null;
      if (skip) {
        if (refreshPose) {
          this._iwOffscreenPoseState = null;
          this._iwOffscreenPoseElapsed = 0;
          this._iwOffscreenPoseStale = false;
        } else {
          this._iwOffscreenPoseState = state;
          this._iwOffscreenPoseElapsed = elapsed;
          this._iwOffscreenPoseStale = true;
        }
      } else {
        this._iwOffscreenPoseState = null;
        this._iwOffscreenPoseElapsed = 0;
        this._iwOffscreenPoseStale = false;
      }
    }
  };

  for (const [name, arity] of [['getMuzzle', 1], ['getMuzzleHand', 2], ['getAimMuzzle', 2], ['getHeadPosition', 1]]) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    if (arity === 1) {
      proto[name] = function poseQueryOne(out) { restorePose(this, false); return original.call(this, out); };
    } else {
      proto[name] = function poseQueryTwo(out, value) { restorePose(this, false); return original.call(this, out, value); };
    }
  }

  const setWeapon = proto.setWeapon;
  if (typeof setWeapon === 'function') {
    proto.setWeapon = function refreshOffscreenShadowHooks(...args) {
      const result = setWeapon.apply(this, args);
      this._iwOffscreenShadowHooks = false;
      installShadowHooks(this);
      return result;
    };
  }
  const dispose = proto.dispose;
  if (typeof dispose === 'function') {
    proto.dispose = function disposeOffscreenCharacter(...args) {
      disposed.add(this);
      this._iwOffscreenPoseStale = false;
      this._iwOffscreenPoseState = null;
      return dispose.apply(this, args);
    };
  }
}
