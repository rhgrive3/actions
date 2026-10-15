// When the sourced humanoid's ToHuman / ToSquid clip may own the whole body.
//
// SourceMotionController plays the Wii U ToHuman clip (31 F, ~0.52 s) for its full length after every
// squid -> kid change, ahead of the air and locomotion states, and disables foot planting while it runs.
// Measured in the built game (shooter, 60 Hz): surfacing from a swim with the stick held kept the body in
// ToHuman for 31 frames while the Actor already moved at 5.76 m/s (~3 m), so both feet slid together;
// releasing the stick after a full swim slid 1.75 m in the same frozen pose. Changing form in the air
// played the crouched ground clip mid-jump with no torso correction (source-posture only corrects the
// grounded ToHuman), which reads as a bow.
//
// Playtest comparison against Splatoon 3 reported both as wrong (feet together while sliding; a bow
// mid-jump); no official frame data exists and no footage frame count was taken for this rule. The clip
// therefore keeps owning the body only for a grounded, (nearly) stationary change. Once declined for a change, it is not re-entered mid-clip when the speed later drops.
// The form scale curve (formWeight / formDuration), the squid-side clip and all gameplay are unchanged.
export const SOURCE_FORM_TRANSITION = Object.freeze({
  // Displacement speed (m/s) above which the returning kid uses locomotion instead of ToHuman.
  // INKWAVE choice: well under the 5.76 m/s run and a 25% stick walk, above standing jitter.
  moveSpeed: 0.6,
  status: 'INKWAVE presentation rule from a playtest comparison; no extracted transition frame data',
});

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
