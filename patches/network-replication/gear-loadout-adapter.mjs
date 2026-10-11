export function adaptGearLoadout(code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'gear loadout: ' + label); };
  code = "import { packOwnerGear, readAcceptedGear, applyAcceptedGear, restoreAdoptedGearGauge } from '../../patches/splatoon3/runtime/gear-loadout-network.mjs';\n" + code;
  patch("const msg = { k: 't', ts: r3(now()), a,", "const msg = { k: 't', ts: r3(now()), a, gg: packOwnerGear(this),", 'owner equipment sidecar');
  patch('        snap.adoption = adoption; a.net._adoptionSeq = adoption.sequence;',
    '        adoption.gear = readAcceptedGear(d.gg?.[a.nid], this, a, adoption);\n        snap.adoption = adoption; a.net._adoptionSeq = adoption.sequence;', 'bind gear after owner/life/sequence admission');
  patch('    applyAdoptionSample(this, a, S);', '    applyAcceptedGear(a, S.adoption);\n    applyAdoptionSample(this, a, S);', 'apply sampled equipment without simulating remote movement');
  patch('    victim.alive = false; victim.hp = 0;', '    applyAcceptedGear(victim, latestAdoptionTransfer(victim)?.latest);\n    victim.alive = false; victim.hp = 0;', 'preserve admitted gear before death playback clears snapshots');
  patch('    const adoptionTransfer = latestAdoptionTransfer(a);', '    const adoptionTransfer = latestAdoptionTransfer(a);\n    applyAcceptedGear(a, adoptionTransfer?.latest);', 'restore newest admitted equipment before bot takeover');
  patch('    restoreAdoptionState(this, a, adoptionTransfer);', '    restoreAdoptionState(this, a, adoptionTransfer);\n    restoreAdoptedGearGauge(a, adoptionTransfer, F.specialReady, F.special);', 'retain admitted gauge readiness across integer quantization');
  return code;
}
