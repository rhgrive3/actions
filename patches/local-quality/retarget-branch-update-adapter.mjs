// Build-only, same-pose optimization. During foot IK, only the edited joint's
// descendants can change. The initial full-pose/pelvis updates stay intact;
// ancestors are still refreshed by updateWorldMatrix(true, ...). Avoid walking
// every torso/hair/weapon/LOD node again for each of the 16 CCD iterations.
export function adaptRetargetBranchUpdates(rel, code) {
  if (rel !== 'src/game/motion/retarget.js') return code;
  const once = (from, to) => {
    if (code.split(from).length !== 2) throw new Error('Retarget branch update anchor changed: ' + from);
    code = code.replace(from, to);
  };
  once('joint.quaternion.premultiply(this.ccdLocal).normalize();\n    c.kid.updateWorldMatrix(true,true);',
    'joint.quaternion.premultiply(this.ccdLocal).normalize();\n    joint.updateWorldMatrix(true,true);');
  once('f.limb.end.quaternion.copy(this.ccdParent.invert().multiply(f.endQ)).normalize();\n  c.kid.updateWorldMatrix(true,true);',
    'f.limb.end.quaternion.copy(this.ccdParent.invert().multiply(f.endQ)).normalize();\n  f.limb.end.updateWorldMatrix(true,true);');
  once('f.limb.end.position.add(this.ccdB.applyQuaternion(this.ccdParent.invert()));\n   c.kid.updateWorldMatrix(true,true);',
    'f.limb.end.position.add(this.ccdB.applyQuaternion(this.ccdParent.invert()));\n   f.limb.end.updateWorldMatrix(true,true);');
  once('c.kid.updateWorldMatrix(true,true);f.bone.getWorldPosition(f.actual);f.actual.add(f.offset);',
    'f.limb.up.updateWorldMatrix(true,true);f.bone.getWorldPosition(f.actual);f.actual.add(f.offset);');
  return code;
}
