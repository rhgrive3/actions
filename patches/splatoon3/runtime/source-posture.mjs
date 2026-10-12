// Splatoon 3 posture over the Wii U (Splatoon 1) source locomotion bank.
//
// The optional source controller retargets Player00 clips onto the INKWAVE rig
// by copying each source bone's WORLD direction. The Splatoon 1 "Hold" clips
// pitch the torso 16–31° and the neck up to 25° forward, and the Splattershot
// carry yaws the barrel about 65–72° across the belly. Nintendo's Splatoon 3
// shooter footage (media y7Zl26Zl12n, 9LnjRgbl2Ng) shows an upright torso and
// head in the ready stance, while walking and while running, a shooter held by
// the right hip (barrel level and forward while walking, muzzle down when
// standing after a burst) and a trailing shin that stays well short of
// horizontal. See reference/stance-carry-comparison-2026-10-12.md.
//
// This module only changes presentation in the source controller's ground
// idle/move states: torso/neck lean, the non-firing shooter carry and the swing
// ankle height. It does not touch Actor movement, the native firing pose
// (nativeWeaponPoseRequired hands every attack to the native upper body), foot
// contacts, jumps, landings, form changes, dances or manual clip playback.
// The values below are INKWAVE calibrations read from video, never extracted
// Nintendo joint angles.
import * as THREE from 'three';

export const SOURCE_POSTURE = Object.freeze({
  // Fraction of the source clip's sagittal lean that is kept (0 = vertical):
  // standing (S3 ready stance is upright) and moving (a slight forward lean).
  torsoStandKeep: 0.2,
  torsoMoveKeep: 0.4,
  neckKeep: 0.25,
  // Blend-in/out rate (1/s) between corrected ground states and other states,
  // and between the standing and moving carry (start/stop, hand on/off the foregrip).
  response: 8,
  standResponse: 6,
  // Shooter carry: muzzle pitch (rad, negative = down) and inward yaw toward the
  // midline (rad, + = kid left) standing / moving, and how much of the source
  // barrel direction is replaced by that target.
  carry: Object.freeze({ standPitch: -0.95, movePitch: -0.15, standYaw: 0.1, moveYaw: 0, follow: 0.85 }),
  // Standing shooter: move the grip hand forward/down (kid space, metres) so the
  // elbow hangs by the hip and the forearm holds the gun in front of the body.
  standGrip: Object.freeze({ forward: 0.12, down: 0.03 }),
  // Standing support hand: hangs beside the left thigh (shoulder-relative; drop is a
  // fraction of the arm length, out/forward in metres) instead of crossing to the foregrip.
  supportHang: Object.freeze({ out: 0.04, drop: 0.9, forward: 0.05 }),
  // Fraction of the source swing-ankle height above its rest (stance) level kept
  // while walking / running. The Wii U walk lifts the ankle 0.60 leg lengths
  // with 109° knee flexion (run: 0.70, 136°); the S3 shooter walk keeps the
  // trailing shin well short of horizontal.
  footLift: Object.freeze({ walkKeep: 0.5, runKeep: 0.7 }),
});
const CORRECTED_STATES = new Set(['idle', 'move']);
let enabled = true;
/** Counterfactual switch for regression tests (production keeps the default). */
export function setSourcePostureEnabled(value) { enabled = !!value; }
const TORSO = new Set(['spine', 'chest']);
const XAX = new THREE.Vector3(1, 0, 0);
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3(), _gp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _hq = new THREE.Quaternion(), _q = new THREE.Quaternion(), _id = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 0 standing … 1 at the source walk speed (smoothstep). */
function moveFactor(c) {
  const walk = Math.max(1e-3, c?.walkSpeed || 1);
  const m = clamp((c?.gaitSpeed ?? c?.speed ?? 0) / walk, 0, 1);
  return m * m * (3 - 2 * m);
}
function postureState(retarget) {
  return retarget.s3Posture || (retarget.s3Posture = { weight: 0, move: 0, time: null, neck: 0 });
}
/** Smoothed 0 standing … 1 moving, so a stop or start never snaps the carry or the support hand. */
function smoothMove(retarget) { return postureState(retarget).move; }
function controllerOf(retarget) {
  const c = retarget.character?.sourceMotion;
  return c && c.retarget === retarget ? c : null;
}
/** 0..1 weight of the posture correction for this controller frame (smoothed, frame-rate independent). */
export function sourcePostureWeight(retarget) {
  return postureState(retarget).weight;
}
function advanceWeight(retarget) {
  const st = postureState(retarget), c = controllerOf(retarget);
  const wanted = enabled && c && !c.manual && c.formKid !== false && CORRECTED_STATES.has(c.state) ? 1 : 0;
  const now = c ? c.time : null;
  // The first frame (or a controller clock that went backwards) snaps to the wanted state; a
  // paused (dt = 0) frame holds the weight; otherwise blend at a frame-rate independent rate.
  const move = moveFactor(c);
  if (!enabled) st.weight = 0;
  if (!enabled || st.time === null || now === null || now < st.time) { st.weight = enabled ? wanted : 0; st.move = move; }
  else {
    const dt = clamp(now - st.time, 0, 0.1);
    st.weight += (wanted - st.weight) * (1 - Math.exp(-SOURCE_POSTURE.response * dt));
    st.move += (move - st.move) * (1 - Math.exp(-SOURCE_POSTURE.standResponse * dt));
  }
  st.time = now;
  st.neck = 0;
  return st.weight;
}

/** Called by HumanRetarget.apply for every mapped bone after its source world rotation is solved and
 *  before the aim pitch is applied. `upper` = the source owns the upper body this frame; the first
 *  entry (hips) advances the blend weight once per frame. Rotates spine/chest/neck/head about the
 *  kid X axis so the clip's forward lean is reduced; arms keep their solved world orientation. */
export function sourcePostureBone(retarget, target, q, dir, upper = true) {
  if (target === 'hips') { advanceWeight(retarget); return; }
  if (!upper) return;
  if (target !== 'spine' && target !== 'chest' && target !== 'neck' && target !== 'head') return;
  const st = postureState(retarget), w = st.weight;
  if (w <= 1e-4) return;
  let angle;
  if (target === 'head') angle = st.neck; // the head has no child direction; it rides the neck correction
  else {
    if (!dir) return;
    _d.copy(dir).applyQuaternion(q);
    const lean = Math.atan2(_d.z, _d.y);
    const P = SOURCE_POSTURE;
    const keep = TORSO.has(target) ? P.torsoStandKeep + (P.torsoMoveKeep - P.torsoStandKeep) * smoothMove(retarget) : P.neckKeep;
    angle = -lean * (1 - keep) * w;
    if (target === 'neck') st.neck = angle;
  }
  if (Math.abs(angle) > 1e-7) q.premultiply(_q.setFromAxisAngle(XAX, angle));
}

/** Called by SourceMotionController.alignWeapon with the weapon orientation (kid space, before aim pitch).
 *  Lowers a non-firing shooter to the S3 right-hip carry: muzzle forward-down while moving, down while standing. */
export function sourceCarryWeapon(controller, weaponQ) {
  const c = controller.character;
  if (!c || c.weaponKind !== 'shooter' || !controller.retarget) return;
  const w = sourcePostureWeight(controller.retarget) * clamp(1 - (controller.shootBlend || 0), 0, 1);
  if (w <= 1e-4) return;
  const k = SOURCE_POSTURE.carry;
  const m = smoothMove(controller.retarget), pitch = k.standPitch + (k.movePitch - k.standPitch) * m, yaw = k.standYaw + (k.moveYaw - k.standYaw) * m;
  _t.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  _d.set(0, 0, 1).applyQuaternion(weaponQ);
  _t.lerp(_d, 1 - k.follow).normalize();
  _q.setFromUnitVectors(_d, _t);
  weaponQ.premultiply(_id.identity().slerp(_q, w)).normalize();
}

/** Called by SourceMotionController.alignWeapon after the source grip position is read (kid space).
 *  For a standing, non-firing shooter, reaches the right hand forward with the native analytic IK so
 *  the lowered gun is held out in front by the forearm, and lets the support hand leave the foregrip
 *  and hang at the side (the S3 frames show a one-handed lowered hold). While moving, or when a
 *  native explicit left-hand target is active, the native two-hand constraint keeps ownership. */
export function sourceCarryHand(controller, handP, fitR, wristQ, leftWeight = 0, explicitLeft = 0) {
  const c = controller.character;
  if (!c || c.weaponKind !== 'shooter' || !controller.retarget) return;
  const w = sourcePostureWeight(controller.retarget) * clamp(1 - (controller.shootBlend || 0), 0, 1) * (1 - smoothMove(controller.retarget));
  if (w <= 1e-4) return;
  const g = SOURCE_POSTURE.standGrip, s = c.kid?.scale?.x || 1, armR = c.limbs.armR, armL = c.limbs.armL;
  _t.set(0, -g.down * w * s, g.forward * w * s).add(handP);
  c._kidXform(armR.lo, _d, _q); c._kidXform(armR.up, _e, _q); _d.sub(_e); // the current elbow direction is the pole
  if (_d.lengthSq() < 1e-10) _d.set(0, -1, 0);
  c._solveLimb(armR, _t, _d, wristQ, 1, 1);
  handP.copy(_t); fitR.copy(_t);
  if (!(leftWeight > 0.5) || explicitLeft >= 0.05 || !c.weapon) return;
  // The support hand: from the native foregrip target (same transform chain as Character._applyPose)
  // toward a relaxed hang beside the left thigh, blended by the standing weight.
  controller.constrainLeft = false;
  const wp = c.weapon, d = wp.def;
  c._kidXform(c.bones.handR, _e, _q); // the right IK above already set the hand to wristQ
  _gp.copy(wp.pivot.position).applyQuaternion(_q).add(_e); _gq.copy(_q).multiply(wp.pivot.quaternion);
  _e.copy(wp.off.position).applyQuaternion(_gq).add(_gp); _gq.multiply(wp.off.quaternion);
  _gp.copy(d.handL.pos); if (wp.pump) _gp.z -= 0.036 * wp.pump;
  _gp.applyQuaternion(_gq).add(_e); _gq.multiply(d.handL.quat);
  c._kidXform(armL.up, _e, _q);
  const reach = (armL.a + armL.b) * s, h = SOURCE_POSTURE.supportHang;
  _t.set(_e.x + h.out * s, _e.y - reach * h.drop, _e.z + h.forward * s);
  _gp.lerp(_t, w);
  _hq.copy(armL.end.quaternion);
  c._solveLimb(armL, _gp, _d.set(h.out, 0, -1), _gq, 1, 0);
  armL.end.quaternion.slerp(_hq, w);
}

/** Called by HumanRetarget.adaptLegFootpaths with a leg's kid-space ankle target before leg IK.
 *  Lowers the swing ankle's height above its rest level during ground locomotion only (faded out
 *  below the source walk speed, so a standing stance and its weapon pose are untouched); stance
 *  heights, contact phases, anchors and the floor clearance in ground() are unchanged. */
export function sourceFootLift(retarget, ankle, side) {
  if (!retarget.locomotion) return;
  const c = controllerOf(retarget), w = sourcePostureWeight(retarget) * moveFactor(c);
  if (!c || w <= 1e-4) return;
  const rest = retarget.character.rest['foot' + side];
  const dy = ankle.y - rest.y;
  if (!(dy > 0)) return;
  const k = SOURCE_POSTURE.footLift, run = clamp(c.runBlend || 0, 0, 1);
  const keep = k.walkKeep + (k.runKeep - k.walkKeep) * run;
  ankle.y = rest.y + dy * (1 - (1 - keep) * w);
}
