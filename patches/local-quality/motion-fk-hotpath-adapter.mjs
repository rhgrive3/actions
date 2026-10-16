// Build-only. Keep coefficient sampling, local blends and every world-space
// consumer unchanged. The discarded intermediate FK results have no readers.
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
  return code;
}
