// Rainmaker presentation at the existing final weapon-pose owner. Rule clocks,
// projectiles, recoil velocity and hit timing remain owned by ranked/rainmaker
// and combat. Joint offsets are calibration for this rig, not Nintendo assets.
// Reference: Nintendo OnlinePlayNewsVideo_05_EN, 60 fps delivery, 6.0-8.1 s.
// The shot transition is visible at 7.583-7.617 s; strong flash obscures exact
// release/peak poses. The existing 20F recovery supplies our presentation clock.
import { RAINMAKER_SHOT_RECOVERY_SECONDS } from './rainmaker.mjs';

const unit = n => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const smooth = n => { n = unit(n); return n * n * (3 - 2 * n); };

// Normal network IDs compare directly. Numeric IDs are canonicalised only on
// acquisition / identity change; noncarriers need no cached state. Preserve the
// older team:slot fallback when a native Actor has not received a network ID.
function owns(ch, owner, carrier) {
  const id = owner.nid;
  if (id === carrier && id != null) return true;
  if (typeof id === 'string') return typeof carrier === 'number' && id === String(carrier);
  if (typeof id === 'number' && typeof carrier === 'string') {
    if (Number(carrier) !== id) return false;
    if (ch._rainmakerNid !== id) {
      const key = String(id); if (key !== carrier) return false;
      ch._rainmakerNid = id; ch._rainmakerId = key;
    }
    return ch._rainmakerId === carrier;
  }
  return String(id ?? `${owner.team}:${owner.slot}`) === String(carrier);
}

// No extra clock, frame arrays/math objects, bones or pose evaluation. Both
// arms still use Character's native solver, once per hand.
export function applyRainmakerPose(ch, input, C, match, dt = 0) {
  const wasActive = ch._rainmakerPose;
  const state = match?.ranked?.rule?.state, owner = ch.actor || ch._owner?.();
  if (!state || state.carrier == null || !owner || !owner.alive ||
      !owns(ch, owner, state.carrier) ||
      !ch.kidForm || ch.dance || owner.specialActive || owner.superJumpState ||
      state.goalHold || !ch.weapon || ch.s3RainmakerMotionEnabled === false) {
    if (wasActive) ch._rainmakerPose = false;
    return false;
  }
  const c = state.charge;
  const value = unit(c?.pending?.charge ?? c?.value);
  const recovery = unit((c?.recovery || 0) / RAINMAKER_SHOT_RECOVERY_SECONDS);
  const kick = smooth(recovery);
  // Lift from carry during the opening fifth of the authoritative charge.
  // Pending release keeps the raised hold until the actual shot, not mouse-up.
  const target = Math.max(smooth(value * 5), c?.pending ? 1 : 0, recovery > 0 ? 1 : 0);
  // One damped blend value softens charge cancellation and the last recovery
  // frame. It never admits/releases a shot and has no independent phase clock.
  const ready = wasActive ? ch._rainmakerReady + (target - ch._rainmakerReady) *
    -Math.expm1(-18 * Math.max(0, Math.min(.1, dt || 0))) : target;
  const pitch = .22 * (1 - ready) - .08 * kick;
  // Match the player camera range so the wrist and objective share one aim.
  const aim = Math.max(-1.05, Math.min(1.15, Number.isFinite(input?.aimPitch) ? input.aimPitch : 0));
  const angle = pitch - aim;
  const P = ch.P;
  // At steep upward aim the fish tail sweeps behind the grip. Reach forward
  // as a single arm/weapon anchor so it clears the head without rotating aim.
  const steepAim = smooth((aim - .4) / .75), forwardReach = .154 * steepAim;
  const x = -.09 + .128 * steepAim, y = .83 + .06 * ready + .01 * kick, z = .22 - .015 * kick + forwardReach;
  P[C.ANC] = x; P[C.ANC + 1] = y; P[C.ANC + 2] = z;
  P[C.ANCR] = angle; P[C.ANCR + 1] = 0; P[C.ANCR + 2] = 0;
  P[C.AFOLT] = 1; P[C.AFOLR] = 0;
  // Protract the primary shoulder slightly at steep aim, retaining reach even
  // when an inherited dualies idle pose has its right shoulder drawn back.
  P[C.CLAVR + 1] += .10 * steepAim;
  P[C.IKR] = 1;
  // The objective support replaces (rather than repeats) the ordinary left IK
  // in the existing final handoff owner, after the live right grip is known.
  P[C.IKL] = 0; P[C.LTW] = 0;
  P[C.HANDPL] = 0; P[C.HANDPR] = 0;
  P[C.POLER] = -.8; P[C.POLER + 1] = -.55; P[C.POLER + 2] = -.25;
  P[C.POLEL] = .8; P[C.POLEL + 1] = -.55; P[C.POLEL + 2] = -.25;
  P[C.SPINE] -= .035 * ready + .025 * kick;
  P[C.CHEST] -= .025 * ready + .04 * kick;
  // Main-weapon source arms cannot overwrite the objective anchor after this
  // final pose layer. Its established native-upper/source-legs lane keeps the
  // same sampled locomotion and accessories. Source.update resets the choice
  // next frame, so dropping the objective restores the ordinary weapon path.
  if (ch.sourceMotion?.active) {
    ch.sourceMotion.sourceUpper = false;
    ch.sourceMotion.keepSourceArms = false;
    ch.sourceMotion.constrainLeft = true;
  }
  ch._rainmakerPose = true;
  ch._rainmakerReady = ready;
  ch._rainmakerPitch = pitch;
  ch._rainmakerKick = kick;
  return true;
}

// Upright heading frame shared by the held model and support hand. The shortest
// +Z-to-aim arc flips local up when facing backward; yaw then pitch does not.
// All scratch objects belong to the existing caller and are reused.
export function rainmakerAimQuaternion(out, dir, pitch, yawFallback, axis, scratch) {
  const horizontal = Math.hypot(dir.x, dir.z);
  const yaw = horizontal > 1e-8 ? Math.atan2(dir.x, dir.z) : yawFallback || 0;
  out.setFromAxisAngle(axis.set(0, 1, 0), yaw);
  scratch.setFromAxisAngle(axis.set(1, 0, 0), -Math.atan2(dir.y, horizontal) + pitch);
  return out.multiply(scratch);
}
