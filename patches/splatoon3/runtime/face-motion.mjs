// Aim fixation on the public rig. Nintendo's public weapon demonstrations
// motivate the direction of attention, not private eye curves or frame values.
// The socket frames, shader gain and limits below are INKWAVE source facts.
import { EYE_FRAMES, EYEB } from '../../../src/game/character-face.js';

const INSTALL = Symbol.for('inkwave.s3.face-motion.install.v1');
const RESET = Symbol.for('inkwave.s3.face-motion.reset.v1');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
export const FACE_MOTION_CALIBRATION = Object.freeze({
  throwRecovery: .4, hitRecovery: .7,
  status: 'INKWAVE visual calibration; original eye limits, blink and expression curves unmeasured',
});

function record(ch) { return ch && Object.getPrototypeOf(ch)?.[INSTALL]; }
function makeState(ch, installation) {
  let s = installation.states.get(ch);
  if (!s) {
    const { THREE } = installation;
    s = { input: {}, mode: null, source: null, suspendedUntil: -1,
      target: new THREE.Vector3(), local: new THREE.Vector3(), direction: new THREE.Vector3(),
      origin: new THREE.Vector3(), quaternion: new THREE.Quaternion(),
      wanted: [0, 0, 0, 0], applied: [0, 0, 0, 0], clamped: false };
    installation.states.set(ch, s);
  }
  return s;
}

function action(ch, s, owner, timers) {
  if (ch.s3FaceMotionEnabled === false || !ch.kidForm || ch.dance || owner?.alive === false
      || ch.t < s.suspendedUntil || ch.lifeLv === 0 || owner?.specialActive || owner?.superJumpState) return null;
  for (let node = ch.root; node; node = node.parent) if (!node.visible) return null;
  if (s.input.subAim) return 'sub-aim';
  if (Number.isInteger(timers?.T_THROW) && ch.tr[timers.T_THROW] < FACE_MOTION_CALIBRATION.throwRecovery) return 'throw';
  if (s.input.charge > .01) return 'charge';
  if (s.input.firing) return 'fire';
  return null;
}

function aimTarget(ch, s, owner) {
  ch.bones.head.updateWorldMatrix(true, false);
  s.origin.copy(EYE_FRAMES[0].C).add(EYE_FRAMES[1].C).multiplyScalar(.5).sub(ch.rest.head);
  ch.bones.head.localToWorld(s.origin);
  if (owner) {
    // Match the native projectile's rejected/too-near aim-point fallback. An
    // uninitialised (0,0,0) aimPoint must not pull the eyes into the floor.
    if (!finite(owner.aimDir) || owner.aimDir.lengthSq() < 1e-8) return false;
    s.direction.copy(owner.aimDir).normalize();
    if (finite(owner.aimPoint)) {
      s.local.copy(owner.aimPoint).sub(s.origin);
      if (s.local.length() >= 2 && s.local.dot(s.direction) > 0) {
        s.target.copy(owner.aimPoint); s.source = 'aim-point'; return true;
      }
    }
    s.target.copy(s.origin).addScaledVector(s.direction, 8); s.source = 'aim-direction'; return true;
  }
  // Character-only previews have no world aim point. Use their actual pitch
  // input and root facing; do not invent a target actor or gameplay state.
  if (!Number.isFinite(s.input.aimPitch)) return false;
  const pitch = s.input.aimPitch;
  s.direction.set(0, Math.sin(pitch), Math.cos(pitch)).applyQuaternion(ch.root.getWorldQuaternion(s.quaternion));
  s.target.copy(s.origin).addScaledVector(s.direction, 8); s.source = 'preview-pitch'; return true;
}

function applyAim(ch, s) {
  // The eye vertices are head-skinned bind-space points. Invert the actual
  // posed head, then return to bind space before the ellipsoidal eye map.
  s.local.copy(s.target); ch.bones.head.worldToLocal(s.local); s.local.add(ch.rest.head);
  const look = ch.u.uLook.value, gaze = ch.u.uGaze.value;
  for (let i = 0; i < 2; i++) {
    const frame = EYE_FRAMES[i], side = i === 0 ? 1 : -1;
    s.direction.copy(s.local).sub(frame.C).applyMatrix3(frame.Mi).normalize();
    const yaw = Math.atan2(s.direction.x, s.direction.z);
    const pitch = Math.atan2(s.direction.y, Math.hypot(s.direction.x, s.direction.z));
    const turn = side * (yaw - EYEB.rest), boundedYaw = clamp(turn, -.36, .36), boundedPitch = clamp(pitch, -.3, .3);
    s.wanted[2 * i] = turn; s.wanted[2 * i + 1] = pitch;
    s.applied[2 * i] = boundedYaw; s.applied[2 * i + 1] = boundedPitch;
    // Native eye shader: yaw=rest+side*clamp(.6*(uLook*1.25+uGaze)),
    // pitch=clamp(.6*(uLook*1.25+uGaze)). Compensate that gain once.
    if (i === 0) { gaze.x = boundedYaw / .6 - look.x * 1.25; gaze.y = boundedPitch / .6 - look.y * 1.25; }
    else { gaze.z = boundedYaw / .6 - look.x * 1.25; gaze.w = boundedPitch / .6 - look.y * 1.25; }
  }
  s.clamped = s.wanted.some((v, i) => Math.abs(v - s.applied[i]) > 1e-8);
  s.origin.copy(EYE_FRAMES[0].C).add(EYE_FRAMES[1].C).multiplyScalar(.5);
  s.direction.copy(s.local).sub(s.origin);
  ch.face.gazeX = Math.atan2(s.direction.x, s.direction.z);
  ch.face.gazeY = Math.atan2(s.direction.y, Math.hypot(s.direction.x, s.direction.z));
}

export function faceMotionSnapshot(ch) {
  const s = record(ch)?.states.get(ch);
  if (!s) return null;
  return { mode: s.mode, source: s.source, clamped: s.clamped,
    target: s.mode ? s.target.toArray() : null, wanted: s.wanted.slice(), applied: s.applied.slice(),
    gazeUniform: ch.u.uGaze.value.toArray(), blink: [ch.face.blinkL, ch.face.blinkR],
    mouth: ch.u.uMouth.value.toArray() };
}

export function installFaceMotion(api, _profile) {
  const { Character, THREE, G, Actor, WeaponRunner, CHARACTER_TIMERS } = api;
  if (!Character || !THREE) throw Error('Face motion requires the actual Character and THREE');
  const C = Character.prototype;
  if (C[INSTALL]) return;
  const installation = { states: new WeakMap(), disposed: new WeakSet(), THREE };
  Object.defineProperty(C, INSTALL, { value: installation });
  const update = C.update, apply = C._applyFace, trigger = C.trigger, setWeapon = C.setWeapon,
    formEnter = C._formEnter, setVisible = C.setVisible, dispose = C.dispose;
  const clear = ch => { if (ch) installation.states.delete(ch); };
  C.update = function (dt, input) {
    if (installation.disposed.has(this)) return;
    const s = makeState(this, installation), a = input || {};
    s.input.firing = !!a.firing; s.input.subAim = !!a.subAim;
    s.input.charge = a.charge || 0; s.input.aimPitch = a.aimPitch ?? 0;
    s.mode = s.source = null; s.clamped = false;
    return update.call(this, dt, input);
  };
  C._applyFace = function (P, dt) {
    // Always run native facial acting first, with its own original attention
    // point, RNG and clocks. Thus no head/body/IK or random stream changes.
    const result = apply.call(this, P, dt), s = makeState(this, installation);
    const owner = this.actor?.character === this ? this.actor
      : (this.inWorld ? G?.actors?.find(a => a.character === this) : null);
    s.mode = action(this, s, owner, CHARACTER_TIMERS); s.source = null; s.clamped = false;
    if (s.mode && this.u.uGaze && aimTarget(this, s, owner)) applyAim(this, s);
    else s.mode = null;
    return result;
  };
  C.trigger = function (name, arg) {
    const result = trigger.call(this, name, arg);
    if (name === 'spawn') clear(this);
    else if (name === 'hit') makeState(this, installation).suspendedUntil = this.t + FACE_MOTION_CALIBRATION.hitRecovery;
    return result;
  };
  C.setWeapon = function (...args) { if (args[0] !== this.weaponKind) clear(this); return setWeapon.apply(this, args); };
  C.setVisible = function (value) { if (!value) clear(this); return setVisible.call(this, value); };
  C._formEnter = function (...args) {
    const s = installation.states.get(this);
    if (s) { s.mode = s.source = null; s.suspendedUntil = -1; }
    return formEnter.apply(this, args);
  };
  C.dispose = function (...args) { installation.disposed.add(this); clear(this); return dispose.apply(this, args); };
  for (const [Type, methods, character] of [[Actor, ['reset', 'splat'], x => x.character],
    [WeaponRunner, ['reset'], x => x.a?.character]]) {
    const prototype = Type?.prototype;
    if (!prototype || prototype[RESET]) continue;
    Object.defineProperty(prototype, RESET, { value: true });
    for (const name of methods) {
      const native = prototype[name]; if (!native) continue;
      prototype[name] = function (...args) { clear(character(this)); return native.apply(this, args); };
    }
  }
}
