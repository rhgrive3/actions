// Final build-only installation, after all ranked/network/reliability overlays.
// Derive the pre-queue predicate from the FINAL native payload guards, including
// Blaster's bounded knockback refinement. Never copy an intermediate policy or
// replace native guard anchors consumed by preceding composition adapters.
export function adaptCombatProvenance(rel,code){
  if(rel!=='src/net/netmatch.js')return code;
  if(code.includes('installCombatProvenance(NetMatch'))throw Error('combat provenance installed twice');
  const start="    const blastKnockback = d.w === 'blaster' && validBlasterKnockback(d.kb);";
  const end="    if (Object.hasOwn(IW_CATALOGUE_SUB_HIT_MAX,d.w) && d.d > IW_CATALOGUE_SUB_HIT_MAX[d.w]) return;";
  const a=code.indexOf(start),b=code.indexOf(end);
  if(a<0||b<a||code.indexOf(start,a+1)>=0||code.indexOf(end,b+1)>=0)throw Error('combat provenance native payload guard identity mismatch');
  const guard=code.slice(a,b+end.length);
  if((guard.match(/return;/g)||[]).length!==5||!guard.includes('IW_HIT_MAX_DAMAGE')||!guard.includes('IW_HIT_CAUSES')||!guard.includes('IW_ANGLE_SHOOTER_HIT_MAX'))throw Error('combat provenance native payload guard shape mismatch');
  const predicate='\nfunction iwRemoteHitPayloadAllowed(d) {\n  if (!d) return false;\n'+guard.replaceAll('return;','return false;')+'\n  return true;\n}\n';
  return "import { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';\n"
    +code+predicate+"\ninstallCombatProvenance(NetMatch,{G,THREE,hitPayloadAllowed:iwRemoteHitPayloadAllowed});\n";
}
