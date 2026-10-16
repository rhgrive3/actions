// Splatoon 3 posture over the Wii U (Splatoon 1) source locomotion bank.
//
// The optional source controller retargets Player00 clips onto the INKWAVE rig
// by copying each source bone's WORLD direction. The Splatoon 1 "Hold" clips
// pitch the torso 16–31° and the neck up to 25° forward, and the Splattershot
// carry yaws the barrel about 65–72° across the belly. Nintendo's Splatoon 3
// shooter footage (media y7Zl26Zl12n, 9LnjRgbl2Ng) shows an upright torso and
// head in the ready stance, while walking and while running, a walking shooter
// held level and forward at the right hip, and a trailing shin that stays well
// short of horizontal. See reference/stance-carry-comparison-2026-10-12.md.
//
// This module changes presentation in the source controller's ground idle/move
// states and, only as the returning kid becomes visible, the source ToHuman
// torso/neck forward bend. The standing two-hand weapon hold stays authored.
// It does not touch Actor form clocks, movement, source clip sampling, native
// firing poses, planted feet, jumps, dances or manual clip playback.
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
  // and between the standing and moving shooter carry (starts and stops never snap).
  response: 8,
  standResponse: 6,
  // Moving shooter carry: muzzle pitch (rad, negative = down), inward yaw toward
  // the midline (rad, + = kid left) and how much of the source barrel direction
  // is replaced by that target. Faded out when standing: the standing two-hand
  // hold stays the source clip's own.
  carry: Object.freeze({ pitch: -0.15, yaw: 0, follow: 0.85 }),
  // Fraction of the source swing-ankle height above its rest (stance) level kept
  // while walking / running. The Wii U walk lifts the ankle 0.60 leg lengths
  // with 109° knee flexion (run: 0.70, 136°); the S3 shooter walk keeps the
  // trailing shin well short of horizontal.
  footLift: Object.freeze({ walkKeep: 0.5, runKeep: 0.7 }),
  // Fraction of the source clip's lateral (side-to-side) lean kept while side-stepping. The Wii U
  // WalkLeft/Right(Shoot) clips bank the pelvis 12-14 deg and the chest/neck 17-20 deg into the step
  // (measured on this bank: lateral component of the bone up axis 0.20-0.34 at steady 4.32 m/s strafe while
  // firing, versus |0.05| walking forward/back). The S3 footage compared above shows an upright torso while
  // walking and running; strafe-shooting angles were not measured. Playtesters compared the banked
  // silhouette with S3 as the body tipping over on every left-right ("rerere") reversal. Scaled by the
  // controller's own smoothed |sideways travel| so forward/back gaits keep their natural per-step sway.
  lateralKeep: 0.2,
  // Standing ready stance. Splatoon 3 footage (media y7Zl26Zl12n, n=366-402
  // and n=596-668, a shooter standing between and after shots): the front leg
  // stands almost straight with its shin perpendicular to the ground, its foot
  // under the pelvis; the rear leg runs diagonally back to a foot on its toes;
  // the torso bobs about every 30 frames by about 4 % of the height (torso
  // template track; the head adds a nod) while the soles stay still. The Wii U
  // WaitHold clips instead bend the front knee far forward over a zig-zag leg.
  // "Nearly straight" is 26 degrees at the top of the bob: the retarget keeps
  // every leg within 0.97 of its length (HOST_RETARGET.reachFraction, 28 deg).
  // The Player00 WaitHold clips put the LEFT foot forward. INKWAVE calibrations
  // in metres / degrees / seconds, not extracted joint values.
  idle: Object.freeze({ front: 'L', frontKneeDeg: 24, rearKneeDeg: 30, rearHeel: 0.06, bob: 0.045, period: 0.5 }),
});
const CORRECTED_STATES = new Set(['idle', 'move']);
let enabled = true;
/** Counterfactual switch for regression tests (production keeps the default). */
export function setSourcePostureEnabled(value) { enabled = !!value; }
const TORSO = new Set(['spine', 'chest']);
const XAX = new THREE.Vector3(1, 0, 0);
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _id = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 0 standing … 1 at the source walk speed (smoothstep). */
function moveFactor(c) {
  const walk = Math.max(1e-3, c?.walkSpeed || 1);
  const m = clamp((c?.gaitSpeed ?? c?.speed ?? 0) / walk, 0, 1);
  return m * m * (3 - 2 * m);
}
function postureState(retarget) {
  return retarget.s3Posture || (retarget.s3Posture = { weight: 0, move: 0, time: null, neck: 0, carryEligible: false, carryMix: 0, carryReentryAge: 0 });
}
/** Smoothed 0 standing … 1 moving, so a stop or start never snaps the carry or the support hand. */
function smoothMove(retarget) { return postureState(retarget).move; }
function controllerOf(retarget) {
  const c = retarget.character?.sourceMotion;
  return c && c.retarget === retarget ? c : null;
}
/** The source controller's clip duration and formWeight already determine
 * whether the humanoid is visible. Correct the actual ToHuman bone directions
 * whenever they are displayed: no guessed 20% / 85% timing thresholds.
 * The squid rig, airborne forms, and manual samples keep their own motion. */
export function sourceEmergePostureWeight(c) {
  return c && !c.manual && c.formKid === true && c.state === 'ToHuman' &&
    c.grounded && c.formWeight > 0 ? 1 : 0;
}
/** 0..1 weight of the posture correction for this controller frame (smoothed, frame-rate independent). */
export function sourcePostureWeight(retarget) {
  return postureState(retarget).weight;
}
/** Genuine grounded idle/move acquires the moving shooter's carry.
 * Only that prior acquisition survives into air/land; a new visible humanoid
 * emerging into air must not borrow the old squid's weapon pose. */
export function sourceCarryWeight(retarget) {
  const st = postureState(retarget);
  return st.carryEligible ? st.carryMix : 0;
}
function formClipOwnsCarry(c) {
  return !c || !!c.manual || c.formKid === false ||
    c.state === 'ToHuman' || c.state === 'ToSquid';
}
function advanceWeight(retarget) {
  const st = postureState(retarget), c = controllerOf(retarget);
  const emerging = enabled ? sourceEmergePostureWeight(c) : 0;
  const wanted = enabled && c && !c.manual && c.formKid !== false && CORRECTED_STATES.has(c.state) ? 1 : emerging;
  const now = c ? c.time : null;
  // The first frame (or a controller clock that went backwards) snaps to the wanted state; a
  // paused (dt = 0) frame holds the weight; otherwise blend at a frame-rate independent rate.
  const move = moveFactor(c);
  // Preserve ordinary moving->air->land carry continuity. Only grounded
  // idle/move can acquire it; ToHuman/manual/squid reset that origin state.
  const fresh = st.time === null || now === null || now < st.time;
  if (!enabled || !c || c.manual || c.formKid === false || fresh) {
    st.carryEligible = false;
    st.carryMix = 0;
    st.carryReentryAge = 0;
  }
  if (enabled && c && !c.manual && c.formKid !== false) {
    if (CORRECTED_STATES.has(c.state)) {
      if (!st.carryEligible) {
        st.carryEligible = true;
        // A brand-new retarget controller starts in its ordinary authored
        // ground stance; only re-entry from an actual form/action fades in.
        if (fresh) {
          st.carryMix = 1;
          st.carryReentryAge = Infinity; // Initial normal locomotion keeps its original carry.
        } else {
          st.carryReentryAge = 0; // Re-entering from a source action cannot snap the real held gun.
        }
      }
    } else if (c.state !== 'air' && c.state !== 'land') {
      st.carryEligible = false;
      st.carryMix = 0;
      st.carryReentryAge = 0;
    }
  }
  if (!enabled) st.weight = 0;
  if (!enabled || st.time === null || now === null || now < st.time) { st.weight = enabled ? wanted : 0; st.move = move; }
  else {
    // The humanoid retarget (and this clock) is not evaluated while the kid is
    // hidden as a squid. A kid that surfaces straight into locomotion must not
    // apply the whole hidden gap (clamped to 0.1 s) as one blend step: that
    // snapped the shooter carry 0 -> 0.55 in one frame. Resume at one frame.
    const gap = now - st.time, dt = gap > 0.05 ? 1 / 60 : clamp(gap, 0, 0.1);
    st.weight += (wanted - st.weight) * (1 - Math.exp(-SOURCE_POSTURE.response * dt));
    st.move += (move - st.move) * (1 - Math.exp(-SOURCE_POSTURE.standResponse * dt));
    // Do not snap the weapon from ToHuman's authored hold to a fully yaw-
    // corrected shooter on the first new grounded frame. Ordinary air/land
    // preserves the previous mix and uses the existing posture fade.
    if (st.carryEligible && CORRECTED_STATES.has(c?.state)) {
      if (Number.isFinite(st.carryReentryAge)) st.carryReentryAge += dt;
      st.carryMix += (1 - st.carryMix) * (1 - Math.exp(-SOURCE_POSTURE.response * dt));
    }
  }
  // The source transition's visible silhouette must not remain hunched merely
  // because the preceding squid state had a zero posture correction weight.
  // Carry the completed weight into the following idle clip without a pop.
  if (emerging > st.weight) st.weight = emerging;
  st.time = now;
  st.neck = 0;
  return st.weight;
}

const ZAX = new THREE.Vector3(0, 0, 1), YAX = new THREE.Vector3(0, 1, 0);
/** 0..1 share of the lateral lean removed this frame: posture weight (ground idle/move only) times the
 *  controller's smoothed sideways-travel balance. */
export function sourceLateralCorrection(retarget) {
  const c = controllerOf(retarget);
  if (!enabled || !c || c.manual) return 0;
  return postureState(retarget).weight * clamp(c.strafeBalance || 0, 0, 1) * (1 - SOURCE_POSTURE.lateralKeep);
}
/** Roll `q` about the kid Z axis so the bone's axis loses that share of its side lean. */
function correctLateral(retarget, q, axis) {
  const k = sourceLateralCorrection(retarget);
  if (k <= 1e-4) return 0;
  _d.copy(axis).applyQuaternion(q);
  const angle = Math.atan2(_d.x, _d.y) * k;
  if (Math.abs(angle) > 1e-7) q.premultiply(_q.setFromAxisAngle(ZAX, angle));
  return angle;
}

/** Called by HumanRetarget.apply for every mapped bone after its source world rotation is solved and
 *  before the aim pitch is applied. `upper` = the source owns the upper body this frame; the first
 *  entry (hips) advances the blend weight once per frame. Rotates spine/chest/neck/head about the
 *  kid X axis so the clip's forward lean is reduced; arms keep their solved world orientation. */
export function sourcePostureBone(retarget, target, q, dir, upper = true) {
  if (target === 'hips') { advanceWeight(retarget); correctLateral(retarget, q, YAX); return; }
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
    // ToHuman's forward tilt comes directly from the sampled source bone q.
    // Cancel that actual lean, not a video-estimated angle or frame fraction.
    const emergence = sourceEmergePostureWeight(controllerOf(retarget));
    const keep = emergence ? 0 : TORSO.has(target)
      ? P.torsoStandKeep + (P.torsoMoveKeep - P.torsoStandKeep) * smoothMove(retarget)
      : P.neckKeep;
    angle = -lean * (1 - keep) * w;
    if (target === 'neck') st.neck = angle;
  }
  if (Math.abs(angle) > 1e-7) q.premultiply(_q.setFromAxisAngle(XAX, angle));
  // Side lean after the sagittal correction, measured on each bone's own up axis (the displayed lean).
  correctLateral(retarget, q, YAX);
}

/** Called by SourceMotionController.alignWeapon with the weapon orientation (kid space, before aim pitch).
 *  Turns a moving, non-firing shooter's barrel from across the belly to level-forward at the right hip.
 *  Standing (smoothed stand/move weight) leaves the source two-hand hold unchanged. */
export function sourceCarryWeapon(controller, weaponQ) {
  const c = controller.character;
  if (!c || c.weaponKind !== 'shooter' || !controller.retarget ||
      formClipOwnsCarry(controller) || !sourceCarryWeight(controller.retarget)) return;
  let w = sourceCarryWeight(controller.retarget) * sourcePostureWeight(controller.retarget) *
    clamp(1 - (controller.shootBlend || 0), 0, 1) * smoothMove(controller.retarget);
  if (w <= 1e-4) return;
  const k = SOURCE_POSTURE.carry;
  _t.set(Math.sin(k.yaw) * Math.cos(k.pitch), Math.sin(k.pitch), Math.cos(k.yaw) * Math.cos(k.pitch));
  _d.set(0, 0, 1).applyQuaternion(weaponQ);
  _t.lerp(_d, 1 - k.follow).normalize();
  // Source clips can point the barrel far across the body at the instant
  // ToHuman hands control back to grounded movement. Bound the *actual*
  // source-to-target quaternion contribution, not a guessed retail joint angle.
  // At 60 Hz the first post-form correction is at most 0.03 rad; accumulate
  // the same angular budget by elapsed source time at other frame rates.
  // A fresh idle/move start and an ordinary move→air→land carry are unchanged.
  const reentryAge = postureState(controller.retarget).carryReentryAge;
  if (Number.isFinite(reentryAge)) {
    const sourceTurn = _d.angleTo(_t);
    if (sourceTurn > 1e-9) w = Math.min(w, Math.max(0, reentryAge) * (0.03 * 60) / sourceTurn);
  }
  _q.setFromUnitVectors(_d, _t);
  weaponQ.premultiply(_id.identity().slerp(_q, w)).normalize();
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

/** 0..1 weight of the standing ready-stance corrections (ground idle only). */
function idleWeight(retarget) {
  const c = controllerOf(retarget);
  if (!enabled || !c || c.manual || c.formKid === false) return 0;
  const st = postureState(retarget);
  // Firing stands still on the sourced shoot clip and the native upper body:
  // its shot origin and stance stay the existing ones.
  return st.weight * clamp(1 - st.move, 0, 1) * clamp(1 - (c.shootBlend || 0), 0, 1);
}
const _j = new THREE.Vector3(), _jq = new THREE.Quaternion();
const legReach = (leg, deg) => { const k = deg * Math.PI / 180; return Math.sqrt(leg.a * leg.a + leg.b * leg.b + 2 * leg.a * leg.b * Math.cos(k)); };
/** Called by HumanRetarget.adaptLegFootpaths with a leg's kid-space ankle target before leg IK.
 *  Front ankle: under its knee, the shin perpendicular to the ground. Rear ankle: heel raised,
 *  a nearly straight leg reaching diagonally back. Both are solved once per frame from the
 *  pelvis at the TOP of the bob (sourceIdleBob), so the soles do not slide as the pelvis dips. */
export function sourceIdleStance(retarget, ankle, side) {
  if (!retarget.locomotion) return;
  const w = idleWeight(retarget), feet = postureState(retarget).idleFeet;
  if (w <= 1e-4 || !feet) return;
  const f = side === SOURCE_POSTURE.idle.front ? feet.front : feet.rear;
  ankle.y += (f.y - ankle.y) * w; ankle.z += (f.z - ankle.z) * w;
}
const _flat = new THREE.Quaternion();
/** Called by HumanRetarget.adaptLegFootpaths with a leg's kid-space foot orientation before leg IK.
 *  The standing front sole is flat on the ground (the rear foot keeps the sourced raised heel). */
export function sourceIdleFoot(retarget, q, side) {
  if (!retarget.locomotion || side !== SOURCE_POSTURE.idle.front) return;
  const w = idleWeight(retarget);
  if (w <= 1e-4) return;
  // Keep the sourced toe-out yaw; remove pitch and roll.
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  _flat.setFromAxisAngle(YAX, e.y);
  q.slerp(_flat, w);
}
/** Called at the end of HumanRetarget.adaptPelvis with the kid-space pelvis position.
 *  Raises/lowers the standing pelvis so the front leg is nearly straight (frontKneeDeg) with a
 *  vertical shin at the top of the bob, records the matching ankle targets, then dips the
 *  pelvis by the footage's bob at the clip's 30-frame period. */
export function sourceIdleBob(retarget, hips) {
  const c = controllerOf(retarget), w = idleWeight(retarget), st = postureState(retarget);
  if (!c || w <= 1e-4) { st.idleFeet = null; return; }
  const ch = retarget.character, I = SOURCE_POSTURE.idle, rearSide = I.front === 'L' ? 'R' : 'L';
  const front = ch.limbs['leg' + I.front], rear = ch.limbs['leg' + rearSide];
  const k = I.frontKneeDeg * Math.PI / 180, ankleY = ch.rest['foot' + I.front].y;
  // Hip joint height for a vertical shin under a thigh bent by the knee angle.
  ch._kidXform(front.up, _j, _jq);
  hips.y += (ankleY + front.b + front.a * Math.cos(k) - _j.y) * w;
  // The soles are latched in kid space when the stance is entered: the sourced
  // pelvis sway and the bob move the body over still feet.
  if (!st.idleFeet) {
    ch._kidXform(front.up, _j, _jq);
    const feet = st.idleFeet = { front: { y: ankleY, z: _j.z + front.a * Math.sin(k) }, rear: { y: 0, z: 0 } };
    ch._kidXform(rear.up, _j, _jq);
    const rearY = ch.rest['foot' + rearSide].y + I.rearHeel, reach = legReach(rear, I.rearKneeDeg);
    feet.rear.y = rearY; feet.rear.z = _j.z - Math.sqrt(Math.max(0, reach * reach - (_j.y - rearY) ** 2));
  }
  hips.y -= w * I.bob * (0.5 - 0.5 * Math.cos(2 * Math.PI * c.time / I.period));
}
