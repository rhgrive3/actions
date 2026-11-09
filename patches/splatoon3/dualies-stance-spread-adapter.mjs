// Dualies: the two landing guides (and shots) sat almost on top of each other
// (owner report 2026-11-09: "the Dualies reticles cling together; retail looks
// further apart"). Applied at the end of the composition, on the final text.
//
// Root cause, measured in the practice range (Chromium, 1280x720, stock camera):
//  1. Firing stance: HOLD.dualies.aim put the right fist 0.055 m right of the
//     kid's midline (the left one is its mirror), so the muzzles were only
//     ~0.155 m apart. The shots fly parallel (fidelityDualiesAimTargets keeps
//     each hand's lateral offset), so at ShotGuideFrame 7 the two guides were
//     ~7.6 px apart and the two moving marks overlapped into one.
//  2. Before the arms reach the aim pose (aimReady < 0.98), the right hand used
//     the aim-pose muzzle while the left used the lowered rig pistol: ~0.5 m
//     lower, so the two guides stacked vertically instead of side by side.
//
// Fix: the aim anchor moves out to 0.345 m (muzzles about +-0.36 m), so the
// guides land ~35 px apart at 720p, the +-17.5 px side-by-side spacing of the
// owner's Splatoon 3 capture (S3_RETICLE.dualRingCx). The left muzzle mirrors
// the right one until the arms are up. Shots and guides keep sharing one
// origin, so the marks still show where the shots go. The spacing is fitted to
// one capture at INKWAVE's camera; Nintendo's muzzle offsets are not published
// and are not claimed. The post-roll turret stance (HOLD.dualies.lock) and the
// merged turret guide are unchanged.
export const DUALIES_AIM_ANCHOR_X = -0.345;

export function adaptDualiesStanceSpread(rel, code, replaceOnce) {
  if (rel === 'src/game/character.js') {
    return replaceOnce(code,
      '  aim: { p: [-0.055, -0.07, 0.27], r: [0, 0.03, 0] }, twoAim: 0,',
      `  aim: { p: [${DUALIES_AIM_ANCHOR_X}, -0.07, 0.27], r: [0, 0.03, 0] }, twoAim: 0,   // owner 2026-11-09: S3-like spread (dualies-stance-spread-adapter.mjs)`,
      'Dualies aim stance spread');
  }
  if (rel === 'src/game/weapons.js') {
    return replaceOnce(code,
      '    if (hand && ch.getMuzzleHand) {',
      '    if (hand && ch.getMuzzleHand && (!ch.aimReady || ch.aimReady() >= 0.98)) {   // arms not up yet: mirror the right muzzle',
      'Dualies left muzzle mirrors the right until aimed');
  }
  return code;
}
