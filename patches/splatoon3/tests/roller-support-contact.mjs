// The roller's calibrated left palm holds the *grip-hole on the shaft*,
// not the old wrist origin. Never relax reach limits or assume a displaced
// wrist is detached: test the same authored socket that the native IK solves.
export function nativeRollerGripGap(ch, THREE, side, C) {
  const d = ch.weapon.def;
  const bone = ch.bones[side];
  const blend = ch._s3RollerGripBlend || 0;
  const z = d.gripL?.handZ;
  const supported = side === 'handL' && ch.weaponKind === 'roller' &&
    ch.kidForm && !ch.dance && !ch.actor?.specialActive &&
    ch.P[C.IKL] > .999 && ch.P[C.LTW] < .001 && !ch.P[C.SPIN] &&
    blend > .001 && d.fold?.pivot && z &&
    Math.abs(z.x) + Math.abs(z.y) < 1e-8 && z.z > .999;
  if (supported) {
    // The palm's contact point in its own bone coordinates is authored by the
    // two weapon-local sockets and the old hand orientation (never guessed).
    const palmHole = d.gripL.pos.clone().sub(d.handL.pos)
      .applyQuaternion(d.handL.quat.clone().invert());
    const shaftSocket = d.gripL.pos.clone();
    // This is the actual, physically reachable, native shaft socket selected
    // for the rendered pose, not the obsolete cached wrist origin.
    shaftSocket.z += Number.isFinite(ch._s3RollerSupportAdvance)
      ? ch._s3RollerSupportAdvance
      : Math.max(0,(d.gripR.pos.z + d.fold.pivot.z) * .5 - d.gripL.pos.z) * .15 * blend;
    return ch.weapon.off.localToWorld(shaftSocket)
      .distanceTo(bone.localToWorld(palmHole));
  }
  const wrist = d[side].pos.clone();
  if (side === 'handR' && d.modelId === 'roller' && Number.isFinite(ch._s3RollerRightAdvance))
    wrist.z += ch._s3RollerRightAdvance;
  return ch.weapon.off.localToWorld(wrist)
    .distanceTo(bone.getWorldPosition(new THREE.Vector3()));
}
