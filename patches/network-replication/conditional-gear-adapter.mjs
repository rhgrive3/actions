export function adaptConditionalGear(code,once){
 const patch=(a,b,label)=>{code=once(code,a,b,'conditional gear: '+label);};
 code="import { packConditionalGear, readConditionalGear, applyConditionalGear, advanceConditionalClock, applyReceivedDeathCondition } from '../../patches/splatoon3/runtime/conditional-gear-network.mjs';\n"+code;
 patch('    if (!this.match) return;\n    // timeline samples', '    if (!this.match) return;\n    advanceConditionalClock(this.match, dt);\n    // timeline samples','active simulation age');
 patch('    victim.net.deathTp = victim.net.tp;', '    victim.net.deathTp = victim.net.tp;\n    applyReceivedDeathCondition(victim, this.match);','retain admitted death eligibility after timeline playback');
 patch('gg: packOwnerGear(this),','gg: packOwnerGear(this), gc: packConditionalGear(this),','owner clock sidecar');
 patch('        adoption.gear = readAcceptedGear(d.gg?.[a.nid], this, a, adoption);','        adoption.gear = readAcceptedGear(d.gg?.[a.nid], this, a, adoption);\n        adoption.condition = readConditionalGear(d.gc?.[a.nid], this, a, adoption, s[10]);','admitted clock identity');
 patch('    applyAcceptedGear(a, S.adoption);','    applyAcceptedGear(a, S.adoption);\n    applyConditionalGear(a, S.adoption, this.match);','sampled bounded condition');
 patch('    applyAcceptedGear(a, adoptionTransfer?.latest);','    applyAcceptedGear(a, adoptionTransfer?.latest);\n    applyConditionalGear(a, adoptionTransfer?.latest, this.match);','restore condition before native respawn');
 return code;
}
