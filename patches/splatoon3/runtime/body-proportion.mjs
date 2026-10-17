// Splatoon 3 body proportions for the native INKWAVE kid rig.
//
// Reference: Nintendo's official shooter footage (media y7Zl26Zl12n, SHA-256
// 6fd20313...ee76b7), frame n=390, a near-side view of a standing shooter.
// Measured in pixels from hair top to sole (about 570 px): head (hair top to
// chin) 160, chin to collar 10, collar to crotch 190, crotch to sole 210, i.e.
// 0.28 / 0.02 / 0.33 / 0.37 of the height. The native INKWAVE kid measures
// 0.24 / 0.05 / 0.31 / 0.40 (hair top 1.408, chin 1.067, collar 1.001,
// crotch 0.560 m). The differences are a smaller head on a longer neck and
// slightly longer legs. These are visual calibrations from one video frame;
// Splatoon 3 skeleton values are not public. (The Wii U Player00 skeleton puts
// the hip joints much lower, but its torso and head differ, so it is not used
// to set the leg length.) See reference/body-proportion-2026-10-16.md.
//
// Legs: the garments, shoes and limbs are authored around the native heights,
// so the built geometry is not re-authored. Every kid vertex and rest bone is
// moved by ONE smooth vertical map g(y): the legs between ankle and hip joint
// are shortened, the torso between hip joint and shoulder takes up the same
// length, and everything at or above the shoulders (arms, neck, head, hair,
// face, weapon grip anchors) and at or below the ankles (shoes) keeps its
// authored position. A vertex follows g by the summed skin weight of the leg
// and torso bones, so the bind pose and the skinned mesh stay consistent.
//
// Head: the head bone is scaled about its own origin and lowered on the neck
// after every pose update, so the face, eyes, hair and headgear (all children
// of the head bone) keep their authored shapes and shader-space coordinates.
//
// Torso (2026-10-17 owner review: "the torso is long, the whole character is
// too tall; the legs are fine"): the same map also shortens the torso between
// the hip joint and the shoulders by `torsoShorten`, and the shoulders, arms,
// neck and head are lowered by that length after every pose update, the same
// way as the head. The upper body keeps its authored geometry and bind pose,
// so every pose system still solves the arms against the native shoulders and
// the whole upper body (with the weapon in the hands) moves down rigidly. The
// legs and the crotch height do not change.
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const S3_BODY_PROPORTION = Object.freeze({
  // Legs : torso (collar to crotch) = 210 : 190 in the footage. With the
  // collar (1.001) fixed, the crotch moves from 0.560 to 1.001 * 210 / 400.
  hipDrop: 0.560 - 1.001 * 210 / 400,
  // Native INKWAVE landmarks (character-geo.js BODY_BONES).
  ankleY: 0.085, hipY: 0.622, chestY: 0.86, shoulderY: 0.946,
  // Head : torso = 160 : 190 and chin-to-collar 10 px in the footage. The
  // native head is 0.341 m (hair top to chin) on a 0.441 m torso, whose
  // proportioned length is 0.441 + hipDrop.
  head: Object.freeze({ scale: (160 / 190) * (0.441 + (0.560 - 1.001 * 210 / 400)) / 0.341, drop: 0.04 }),
  // Hip joint to shoulder, metres removed (the body is that much shorter).
  // Owner review against the official movies, not a measured retail length:
  // with the native INKWAVE head the official frames read 0.28-0.295 of the
  // height for the head, INKWAVE 0.27 before this change and 0.28 after it.
  torsoShorten: 0.05,
  // Half width of the smooth transitions at the ankle, hip and shoulder (m).
  blend: 0.03,
  // Bones whose skinned vertices follow the map. Feet, arms, clavicles, neck,
  // head, face, hair and the tank keep their authored kid-space positions.
  bones: Object.freeze(['hips', 'spine', 'chest', 'thighL', 'shinL', 'thighR', 'shinR', 'hemF', 'hemB']),
  status: 'proportion from the Nintendo Wii U Player00 rest skeleton; Splatoon 3 skeleton values are not public',
});

const P = S3_BODY_PROPORTION;
export const S3_HIP_Y = P.hipY - P.hipDrop;

// g(y) = y + a*I1(y) + b*I2(y), with I the integral of a smooth box over the
// leg [ankle, hip] and torso [hip, shoulder] spans. a, b are solved so that
// g(hip) = S3_HIP_Y and g(y) = y - torsoShorten above the shoulder blend.
const N = 4096, Y0 = 0, Y1 = 1.4, DY = (Y1 - Y0) / N;
const box = (y, lo, hi) => sstep(lo - P.blend, lo + P.blend, y) * (1 - sstep(hi - P.blend, hi + P.blend, y));
const I1 = new Float64Array(N + 1), I2 = new Float64Array(N + 1);
for (let i = 1; i <= N; i++) {
  const y = Y0 + (i - 0.5) * DY;
  I1[i] = I1[i - 1] + box(y, P.ankleY, P.hipY) * DY;
  I2[i] = I2[i - 1] + box(y, P.hipY, P.shoulderY) * DY;
}
const at = (T, y) => {
  const u = Math.min(N, Math.max(0, (y - Y0) / DY)), i = Math.min(N - 1, Math.floor(u)), f = u - i;
  return T[i] + (T[i + 1] - T[i]) * f;
};
const hipI1 = at(I1, P.hipY), hipI2 = at(I2, P.hipY), topI1 = I1[N], topI2 = I2[N];
// a*hipI1 + b*hipI2 = S3_HIP_Y - hipY ; a*topI1 + b*topI2 = -shorten
const det = hipI1 * topI2 - hipI2 * topI1;
const solve = (shorten) => {
  const dh = S3_HIP_Y - P.hipY;
  return [(dh * topI2 + shorten * hipI2) / det, (-shorten * hipI1 - dh * topI1) / det];
};
const [A, B] = solve(P.torsoShorten);
const [A0, B0] = solve(0);

/** The vertical proportion map (kid space, metres). */
export function s3ProportionY(y) {
  if (y <= P.ankleY - P.blend) return y;
  if (y >= P.shoulderY + P.blend) return y - P.torsoShorten;
  return y + A * at(I1, y) + B * at(I2, y);
}
// The #1562 map without the torso shortening (tank placement relative to the chest).
const legOnlyY = (y) => (y <= P.ankleY - P.blend || y >= P.shoulderY + P.blend ? y : y + A0 * at(I1, y) + B0 * at(I2, y));
/** dg/dy: the local vertical stretch of the map. */
export function s3ProportionSlope(y) {
  return 1 + A * box(y, P.ankleY, P.hipY) + B * box(y, P.hipY, P.shoulderY);
}

const MAPPED = new Set(P.bones);
// The tank rides the chest: it moves rigidly by the chest's added drop.
const TANK_DROP = () => s3ProportionY(P.chestY) - legOnlyY(P.chestY);
let enabled = true;
/** Counterfactual switch for regression tests (production keeps the default). */
export function setBodyProportionEnabled(value) { enabled = !!value; }
export function bodyProportionEnabled() { return enabled; }

const MAPPED_REST = Symbol.for('inkwave.s3.body-proportion.rest');
/** Rest positions of a style (a fresh object of fresh vectors), mapped in place once. */
export function s3ProportionRest(rest) {
  if (!enabled || !rest || rest[MAPPED_REST]) return rest;
  Object.defineProperty(rest, MAPPED_REST, { value: true });
  for (const name of MAPPED) if (rest[name]) rest[name].y = s3ProportionY(rest[name].y);
  if (rest.tank) rest.tank.y += TANK_DROP();
  return rest;
}

const mappedGeometry = new WeakSet();
/** Moves the built skinned kid geometry by the summed weight of the mapped bones. */
export function s3ProportionGeometry(geo, boneNames) {
  if (!enabled || !geo?.attributes?.position || mappedGeometry.has(geo)) return geo;
  mappedGeometry.add(geo);
  const pos = geo.attributes.position, nrm = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (!si || !sw) return geo;
  const mapped = boneNames.map((n) => MAPPED.has(n)), tank = boneNames.indexOf('tank'), tankDrop = TANK_DROP();
  for (let i = 0; i < pos.count; i++) {
    let w = 0, wt = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k);
      if (mapped[b]) w += sw.getComponent(i, k); else if (b === tank) wt += sw.getComponent(i, k);
    }
    if (w <= 1e-6 && wt <= 1e-6) continue;
    const y = pos.getY(i);
    pos.setY(i, y + w * (s3ProportionY(y) - y) + wt * tankDrop);
    if (nrm) {
      const k = 1 + w * (s3ProportionSlope(y) - 1);
      const nx = nrm.getX(i), ny = nrm.getY(i) / k, nz = nrm.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(i, nx / l, ny / l, nz / l);
    }
  }
  pos.needsUpdate = true; if (nrm) nrm.needsUpdate = true;
  geo.boundingBox = null;
  return geo;
}

const mappedShared = new WeakSet();
/** Applies the proportion map once to a shared kid part set from getKidShared. */
export function s3ProportionKid(sh, boneNames, restBody) {
  if (!enabled || !sh || mappedShared.has(sh)) return sh;
  mappedShared.add(sh);
  s3ProportionGeometry(sh.skin, boneNames);
  s3ProportionGeometry(sh.cloth, boneNames);
  // The tank keeps its authored offset from the leg-only mapped chest; its
  // glass group is placed relative to the chest bone and rides the chest drop.
  if (sh.tank?.center && restBody?.chest) {
    const chest = new THREE.Vector3().copy(restBody.chest); chest.y = legOnlyY(chest.y);
    sh.tank.offset = sh.tank.center.clone().sub(chest);
  }
  return sh;
}

const HEAD_REST = Symbol.for('inkwave.s3.body-proportion.head');
const UPPER_REST = Symbol.for('inkwave.s3.body-proportion.upper');
const UPPER = ['neck', 'clavL', 'clavR'];
/** Head scale and neck length on the posed rig. Every pose owner resets the
 * head bone's local scale/position from the rest (source retarget) or leaves
 * the previous value (native pose), so this is applied after each update. */
export function s3ProportionHead(ch) {
  const head = ch?.bones?.head, rest = ch?.rest;
  if (!head || !rest?.head || !rest.neck) return;
  let local = ch[HEAD_REST];
  if (!local) { local = new THREE.Vector3().subVectors(rest.head, rest.neck); Object.defineProperty(ch, HEAD_REST, { value: local }); }
  const k = enabled ? P.head.scale : 1, drop = enabled ? P.head.drop : 0;
  head.position.set(local.x, local.y - drop, local.z);
  head.scale.setScalar(k);
}
/** The torso shortening on the posed rig (character.js _applyPose, body-proportion-adapter.mjs).
 *  The neck and clavicles keep their native bind pose; `on` places them torsoShorten below
 *  their rest offset from the chest, so the arms, hands, weapon, head and hair move down with
 *  them. The pose is solved with the native shoulders (off at the start of _applyPose) and
 *  lowered after the arm and weapon IK, before the face, so every reader of the posed rig
 *  (gameplay muzzle, face gaze, hit presentation) sees one consistent pose. */
export function s3ProportionShoulders(ch, on) {
  const lower = on && enabled ? P.torsoShorten : 0, rest = ch?.rest;
  if (!rest?.chest || !ch.bones) return;
  // The drop this pose receives after its IK; ground tests solved during the IK read it
  // (roller.mjs drum floor search).
  ch.s3ShoulderDrop = s3ShoulderDrop(ch);
  let upper = ch[UPPER_REST];
  if (!upper) {
    upper = UPPER.filter((n) => ch.bones[n] && rest[n]).map((n) => [ch.bones[n], new THREE.Vector3().subVectors(rest[n], rest.chest)]);
    Object.defineProperty(ch, UPPER_REST, { value: upper });
  }
  for (const [bone, l] of upper) bone.position.set(l.x, l.y - lower, l.z);
}
/** How far the shoulders (and the hands, weapon and head on them) drop after the arm IK. */
export function s3ShoulderDrop(ch) { return enabled && ch?.rest?.chest ? P.torsoShorten : 0; }
/** Height added to the weapon anchor before the arm IK so the part of it held in kid space
 *  rather than riding the chest (1 - AFOLT: the Brella guard on its world shield, the roller
 *  push) stays where it was after the rigid shoulder drop. A carry or aim that rides the chest
 *  drops with the body. Ground contacts that are solved during the IK (roller.mjs) subtract
 *  the drop from their own floor test. */
export function s3ProportionAnchorLift(ch, follow) {
  return s3ShoulderDrop(ch) * (1 - Math.min(1, Math.max(0, follow)));
}
/** Installs the per-update head proportion on the production Character. */
export function installBodyProportion(api) {
  const C = api.Character?.prototype;
  if (!C?.update) throw Error('Body proportion requires the production Character');
  const key = Symbol.for('inkwave.s3.body-proportion.install.v1');
  if (Object.prototype.hasOwnProperty.call(C, key)) return;
  Object.defineProperty(C, key, { value: true });
  const update = C.update;
  C.update = function (...args) {
    const result = update.apply(this, args);
    s3ProportionHead(this);
    return result;
  };
}
