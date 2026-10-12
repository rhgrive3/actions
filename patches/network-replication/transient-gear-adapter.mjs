export function adaptTransientGear(code,once){
 const patch=(a,b,label)=>{code=once(code,a,b,'transient gear: '+label);};
 code="import { packTransientGear, readTransientGear, restoreAdoptedTransientGear } from '../../patches/splatoon3/runtime/transient-gear-network.mjs';\n"+code;
 patch('gc: packConditionalGear(this),','gc: packConditionalGear(this), gb: packTransientGear(this, G.time),','owner bounded effect sidecar');
 patch('        adoption.condition = readConditionalGear(d.gc?.[a.nid], this, a, adoption, s[10]);','        adoption.condition = readConditionalGear(d.gc?.[a.nid], this, a, adoption, s[10]);\n        adoption.transientGear = readTransientGear(d.gb?.[a.nid], this, a, adoption, s[10]);','admitted effect identity');
 patch('    restoreAdoptedGearGauge(a, adoptionTransfer, F.specialReady, F.special);','    restoreAdoptedGearGauge(a, adoptionTransfer, F.specialReady, F.special);\n    restoreAdoptedTransientGear(a, adoptionTransfer, this, G.time);','restore bounded effects only after owner takeover');
 return code;
}
