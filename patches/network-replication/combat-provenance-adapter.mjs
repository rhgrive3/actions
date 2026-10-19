// Final build-only installation, after all ranked/network/reliability overlays.
// This prevents later prototype patches from bypassing the receipt gate.
export function adaptCombatProvenance(rel,code){
  if(rel!=='src/net/netmatch.js')return code;
  if(code.includes('installCombatProvenance(NetMatch'))throw Error('combat provenance installed twice');
  return "import { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';\n"
    +code+"\ninstallCombatProvenance(NetMatch,{G,THREE});\n";
}
