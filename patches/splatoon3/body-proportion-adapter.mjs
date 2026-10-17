// Splatoon body proportions (runtime/body-proportion.mjs) for the native kid rig.
// The native builders keep authoring with their own rest heights; only the two
// public getters that hand rest positions and shared kid geometry to the
// Character are wrapped. Bone inverses are derived from getRestPositions.
export const BODY_PROPORTION_REL = 'src/game/character-geo.js';

export const BODY_PROPORTION_RIG_REL = 'src/game/character.js';

export function adaptBodyProportion(rel, code, replaceOnce) {
  if (rel === BODY_PROPORTION_RIG_REL) {
    // Production composition replaces the rest getter in _buildRig (issue-483
    // owned hair anatomy). Map whichever rest object reaches the bones; the
    // map is idempotent for an object that already came from getRestPositions.
    code = replaceOnce(code, '    const bones = []; const byName = {};\n',
      '    s3ProportionRest(rest);\n    const bones = []; const byName = {};\n', 'proportioned rig rest');
    // Shorter torso: solve the pose on the native shoulders, keep the kid-space part of the
    // weapon anchor in place, then lower the shoulders before the face (runtime/body-proportion.mjs).
    code = replaceOnce(code, '  _applyPose(dt, s) {\n', '  _applyPose(dt, s) {\n    s3ProportionShoulders(this, false);\n', 'native shoulders for the pose solve');
    code = replaceOnce(code, '    // sway (lags body acceleration / turning)', '    _aP.y += s3ProportionAnchorLift(this, P[AFOLT]);\n    // sway (lags body acceleration / turning)', 'kid-space weapon anchor kept through the shoulder drop');
    code = replaceOnce(code, '    const lv = this.lifeLv;\n', '    s3ProportionShoulders(this, true);\n    const lv = this.lifeLv;\n', 'shoulder drop before the face');
    return "import { s3ProportionRest, s3ProportionShoulders, s3ProportionAnchorLift } from '../../patches/splatoon3/runtime/body-proportion.mjs';\n" + code;
  }
  if (rel !== BODY_PROPORTION_REL) return code;
  code = replaceOnce(code, "export function getKidShared(lod = 'hero') {", "function nativeKidShared(lod = 'hero') {", 'native kid shared getter');
  code = replaceOnce(code, 'export function getRestPositions(st) {', 'function nativeRestPositions(st) {', 'native rest positions getter');
  code = replaceOnce(code, 'export const REST = REST_BODY;\n',
    'export const REST = REST_BODY;\n' +
    '/** Shared kid parts with the Splatoon body proportions applied once (runtime/body-proportion.mjs). */\n' +
    "export function getKidShared(lod = 'hero') { return s3ProportionKid(nativeKidShared(lod), BONE_NAMES, REST_BODY); }\n" +
    '/** Rest positions of a style in the Splatoon body proportions. */\n' +
    'export function getRestPositions(st) { return s3ProportionRest(nativeRestPositions(st)); }\n',
    'proportioned kid getters');
  return "import { s3ProportionKid, s3ProportionRest } from '../../patches/splatoon3/runtime/body-proportion.mjs';\n" + code;
}
