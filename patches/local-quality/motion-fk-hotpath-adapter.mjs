// Build-only exact motion hot paths. Keep coefficient sampling, local blends
// and world-space consumers unchanged; unused FK results have no readers.
export function adaptMotionFkHotpath(rel, code, replaceOnce) {
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code,
      '   this.pose.fk();\n   if(stepAmplitude<1){',
      '   // World transforms are evaluated after the remaining local blends.\n   if(stepAmplitude<1){',
      'motion FK before local gait blend');
    code = replaceOnce(code,
      '    this.pose.mix(this.restGait,1-stepAmplitude).fk();',
      '    this.pose.mix(this.restGait,1-stepAmplitude);',
      'motion FK after local gait blend');
    code = replaceOnce(code,
      '  this.pose.fk();\n  if(transition<1)this.gaitTargets.mix(this.previousTargets,1-transition);',
      '  // The pre-balance FK is still current unless transition changed local TRS.\n  if(transition<1)this.pose.fk();\n  if(transition<1)this.gaitTargets.mix(this.previousTargets,1-transition);',
      'motion FK after unchanged transition');
  }
  if (rel === 'src/game/motion/source-bank.js') {
    code = replaceOnce(code,
      '        for (const k of [0, 4, 8]) e[k] *= x;\n        for (const k of [1, 5, 9]) e[k] *= y;\n        for (const k of [2, 6, 10]) e[k] *= z;',
      '        e[0] *= x; e[4] *= x; e[8] *= x;\n        e[1] *= y; e[5] *= y; e[9] *= y;\n        e[2] *= z; e[6] *= z; e[10] *= z;',
      'motion segment-scale compensation scratch arrays');
  }
  // A settled contact's four Hermite coefficients are exactly +0. Retain the
  // clamp, active polynomial order and final zero additions for signed-zero
  // and nonfinite parity; bind existing fields without allocating new state.
  if (rel === 'src/game/motion/contact-transition.js') {
    code = replaceOnce(code,
      '  const u=clamp(this.age/this.duration,0,1),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;\n' +
      '  const a=1-10*u3+15*u4-6*u5,b=this.duration*(u-6*u3+8*u4-3*u5);\n' +
      '  const da=(-30*u2+60*u3-30*u4)/this.duration,db=1-18*u2+32*u3-15*u4;\n' +
      '  this.position.copy(goal).addScaledVector(this.offset,a).addScaledVector(this.offsetVelocity,b);\n' +
      '  this.velocity.copy(velocity).addScaledVector(this.offset,da).addScaledVector(this.offsetVelocity,db);',
      '  const {duration,offset,offsetVelocity}=this,u=clamp(this.age/duration,0,1);let a=0,b=0,da=0,db=0;\n' +
      '  if(u!==1){\n' +
      '   const u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;\n' +
      '   a=1-10*u3+15*u4-6*u5;b=duration*(u-6*u3+8*u4-3*u5);\n' +
      '   da=(-30*u2+60*u3-30*u4)/duration;db=1-18*u2+32*u3-15*u4;\n  }\n' +
      '  this.position.copy(goal).addScaledVector(offset,a).addScaledVector(offsetVelocity,b);\n' +
      '  this.velocity.copy(velocity).addScaledVector(offset,da).addScaledVector(offsetVelocity,db);',
      'source settled contact transition');
  }
  return code;
}
