// Build-only: final installation of the hit/bhit evidence gate (#1665, #1666).
// It runs after every ranked/network/reliability overlay so no later prototype
// patch can wrap NetMatch._hit/_acceptBossHit/_tick around the gate.
//
// The table of equipped-kit identifiers is derived from the same definitions
// the #462 payload policy uses (sub / special catalogue names, kit specials) and
// inlined, so the runtime module never imports build-time data.
import { SUB, SPECIALS } from '../../inkwave-public/src/config.js';
import { SUB_NAMES, SPECIAL_NAMES } from '../splatoon3/runtime/catalogue.mjs';
import { TRIZOOKA_ID } from '../splatoon3/runtime/kit-trizooka.mjs';
import { VAC_ID } from '../splatoon3/runtime/kit-ink-vac.mjs';
import { MAX_HIT_DAMAGE } from '../reliability/net-hit-payload-adapter.mjs';

const MARKER = 'installCombatClaims(NetMatch,';
export function combatClaimTables() {
  return {
    subs: [...new Set([...Object.keys(SUB), ...Object.keys(SUB_NAMES)])].sort(),
    specials: [...new Set([...Object.keys(SPECIALS), ...Object.keys(SPECIAL_NAMES), TRIZOOKA_ID, VAC_ID])].sort(),
    maxDamage: MAX_HIT_DAMAGE,
  };
}
export function adaptCombatClaims(rel, code) {
  if (rel !== 'src/net/netmatch.js') return code;
  if (code.includes(MARKER)) throw Error('Combat claims anchor mismatch: already applied');
  if (!/^export class NetMatch\b/m.test(code) || !/^const now = \(\) =>/m.test(code)) throw Error('Combat claims anchor mismatch: NetMatch/now');
  const t = combatClaimTables();
  return "import { installCombatClaims } from '../../patches/network-replication/combat-claims.mjs';\n" + code +
    `\n${MARKER} { G, now, WEAPONS, maxDamage: ${t.maxDamage}, subs: ${JSON.stringify(t.subs)}, specials: ${JSON.stringify(t.specials)} });\n`;
}
