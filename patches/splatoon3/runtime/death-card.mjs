// Death-card text. S3 "Splatted by ...!" names the splat cause (weapon / sub / special); the opponent's identity is
// a separate fact. Native INKWAVE put the attacker's display name in the cause slot and demoted the weapon.
import { WEAPONS, SUB, SPECIALS } from '../../../src/config.js';

// The cause can arrive from a remote peer: only own table entries name a cause.
const entry = (table, id) => typeof id === 'string' && Object.hasOwn(table, id) ? table[id].name : undefined;

// `cause` is the 'splatted' event cause: a weapon id, a sub/special id, 'weapon', 'ink' or 'water'.
// Returns { cause, who }: `cause` is the SPLATTED BY value, `who` the separately shown opponent (or null).
export function splatCardText(cause, attacker, t = v => v) {
  const environment = cause === 'water' ? t('the sea') : cause === 'ink' ? t('enemy ink') : null;
  if (!attacker) return { cause: environment || t('enemy ink'), who: null };
  const named = environment || entry(SUB, cause) || entry(SPECIALS, cause) || entry(WEAPONS, cause) || entry(WEAPONS, attacker.weaponId);
  // An attacker with no resolvable cause (e.g. the Boss pseudo-attacker) stays the only fact available.
  return named ? { cause: named, who: attacker.name } : { cause: attacker.name, who: null };
}
