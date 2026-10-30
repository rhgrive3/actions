// Sourced form clips own grounded, stationary transformations. Moving and
// airborne returns keep locomotion/jump poses. The short presentation exchange
// is calibrated for the reported rapid input; exact retail timing is unmeasured.
import { FORM_EXCHANGE } from './form-timing.mjs';
export const SOURCE_FORM_TRANSITION = Object.freeze({
  // Displacement speed (m/s) above which the returning kid uses locomotion instead of ToHuman.
  // INKWAVE choice: well under the 5.76 m/s run and a 25% stick walk, above standing jitter.
  moveSpeed: 0.6,
  status: 'INKWAVE presentation rule from a playtest comparison; no extracted transition frame data',
});

export function sourceFormDuration(controller, clipSeconds) {
  return Math.min(clipSeconds, controller.formKid ? FORM_EXCHANGE.emerge : FORM_EXCHANGE.dive);
}
export function sourceFormFrame(controller, frames) {
  return frames * Math.min(1, controller.formTime / Math.max(1e-6, controller.formDuration));
}
// Compressed transformation poses can exceed a short host leg's reach. A
// contact rejected there must not stay blocked throughout the following idle.
export function restoreFormSupport(controller, blendSeconds) {
  if (!controller.formEvent || !controller.formKid || controller.s3FormSupportRestored ||
      !controller.grounded || controller.state !== 'idle' ||
      controller.formTime < controller.formDuration + blendSeconds) return;
  controller.s3FormSupportRestored = true;
  controller.retarget.reset();
  if (controller.retarget.s3Posture) controller.retarget.s3Posture.idleFeet = null;
}

export function sourceFormClipAdmitted(controller) {
  if (controller.s3FormClipDeclined) return false;
  const moving = controller.formKid === true && controller.speed > SOURCE_FORM_TRANSITION.moveSpeed;
  if (controller.grounded === false || moving) {
    controller.s3FormClipDeclined = true;
    return false;
  }
  return true;
}

/** Start of the controller's air-entry crossfade. It normally blends from the last RENDERED humanoid pose,
 * but after an airborne squid -> kid change that pose is the hidden kid's stale ToSquid dive (chest pitched
 * ~87 deg forward), which kept the returning kid bowed for ~6 frames (0.1 s) mid-jump. Skip that crossfade
 * only for an airborne form change; every ordinary ground -> air entry keeps its blend. */
export function sourceAirBlendStart(controller, fullBlendSeconds) {
  return controller.formKid === true && controller.s3FormClipDeclined && controller.grounded === false &&
    controller.formTime < fullBlendSeconds ? fullBlendSeconds : 0;
}
