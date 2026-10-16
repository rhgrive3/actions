// The native Three.js ZYX formula, with exact sin(±0)/cos(±0) reused.
// No interpolation, precision change, cross-frame state or added pose storage.
export function adaptPoseRotation(rel, code, replaceOnce) {
  if (rel !== 'src/game/motion/source-bank.js') return code;
  return replaceOnce(code,
    "      if (mode === 'eulerXYZ') this.q[i].setFromEuler(this.euler.set(r[j + 6], r[j + 7], r[j + 8], 'ZYX'));",
    `      if (mode === 'eulerXYZ') {
        const e=this.euler.set(r[j+6],r[j+7],r[j+8],'ZYX'),x=e._x/2,y=e._y/2,z=e._z/2;
        const c1=x===0?1:Math.cos(x),c2=y===0?1:Math.cos(y),c3=z===0?1:Math.cos(z);
        const s1=x===0?x:Math.sin(x),s2=y===0?y:Math.sin(y),s3=z===0?z:Math.sin(z);
        this.q[i].set(s1*c2*c3-c1*s2*s3,c1*s2*c3+s1*c2*s3,c1*c2*s3-s1*s2*c3,c1*c2*c3+s1*s2*s3);
      }`, 'pose rotation native ZYX zero coefficients');
}
