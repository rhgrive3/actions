// Build-only #462 residual correction: validate the client-supplied combat claim
// (damage magnitude + known cause) before it reaches applyHit / HP state.
//
// The relay-authenticated sender -> attacker.owner check and the life/hit-sequence
// admission are ALREADY implemented by PR #452 in patches/reliability/combat-life-adapter.mjs.
// This adapter deliberately does NOT duplicate that sender check; it adds only the
// remaining payload-shape validation that the owner thread listed as still open.
//
// The cause allowlist and the damage ceiling are DERIVED from the active runtime
// config (inkwave-public/src/config.js) rather than invented:
//   · causes = every authored weapon id, sub id and special id, plus the projectile
//     "type" fallbacks that weapons.js passes when a round has no wid
//     (`p.wid || p.type`, see weapons.js _step/_sloshSplash).
//   · MAX_HIT_DAMAGE = the largest authored single-event damage field in WEAPONS /
//     SUB / SPECIALS. In the current active config that is 180 (SUB.bomb.damageMax
//     and SPECIALS.slam.damageMax), so every genuine hit — including the charger
//     160, roller 150 and blaster 125 — stays accepted and unbounded lies are not.
// No player-side damage buff exists in the active config: the only damage multiplier
// is boss `dmgMul`, which scales boss hazards applied via actor.damage / boss._damage
// and never routes through NetMatch.sendHit, so there is no aggregate to include.
//
// Upstream src/net/netmatch.js stays untouched. Both anchors must be present exactly
// once; source drift fails closed.
import { WEAPONS, SUB, SPECIALS } from '../../inkwave-public/src/config.js';

const GUARD = '    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;';
const TOP = 'const TICK = 1 / 20;';
const MARKER = '// #462 residual: reject malformed combat claims';

const DAMAGE_FIELD = /damage/i;
function derivedMaxDamage() {
  let max = 0;
  for (const def of [...Object.values(WEAPONS), ...Object.values(SUB), ...Object.values(SPECIALS)]) {
    for (const [key, value] of Object.entries(def || {})) {
      if (DAMAGE_FIELD.test(key) && typeof value === 'number' && Number.isFinite(value)) max = Math.max(max, value);
    }
  }
  return max;
}

// Largest authored single-event damage in the active config (currently 180).
export const MAX_HIT_DAMAGE = derivedMaxDamage();
// Every cause string a legitimate hit packet can carry.
export const KNOWN_HIT_CAUSES = Object.freeze([
  ...Object.keys(WEAPONS), ...Object.keys(SUB), ...Object.keys(SPECIALS),
  'shot', 'slosh', 'blast', 'drop', // projectile-type fallbacks where p.wid is unset
]);
const CAUSE_SET = new Set(KNOWN_HIT_CAUSES);

export function isHitPayloadValid(d) {
  if (!Number.isFinite(d?.d) || d.d <= 0 || d.d > MAX_HIT_DAMAGE) return false;
  if (typeof d?.w !== 'string' || !CAUSE_SET.has(d.w)) return false;
  return true;
}

export function adaptNetHitPayload(rel, code) {
  if (rel !== 'src/net/netmatch.js') return code;
  if (code.includes(MARKER)) throw new Error('Hit payload anchor mismatch: already applied');

  const topAt = code.indexOf(TOP);
  if (topAt < 0 || code.indexOf(TOP, topAt + TOP.length) >= 0) {
    throw new Error('Hit payload anchor mismatch: module constants');
  }
  const constants = TOP + '\n' +
    '// #462 payload bounds derived from the active config by the reliability adapter.\n' +
    `const IW_HIT_MAX_DAMAGE = ${MAX_HIT_DAMAGE};\n` +
    `const IW_HIT_CAUSES = new Set(${JSON.stringify(KNOWN_HIT_CAUSES)});`;
  code = code.slice(0, topAt) + constants + code.slice(topAt + TOP.length);

  const at = code.indexOf(GUARD);
  if (at < 0 || code.indexOf(GUARD, at + GUARD.length) >= 0) {
    throw new Error('Hit payload anchor mismatch: hit guard');
  }
  const block = GUARD + '\n' +
    '    ' + MARKER + ': reject malformed combat claims before they touch HP/state.\n' +
    // #574: a zero-damage packet is admissible only when it carries the
    // Blaster knockback geometry field; the network guard validates that field.
    '    if (!Number.isFinite(d.d) || d.d < 0 || d.d > IW_HIT_MAX_DAMAGE || (d.d === 0 && d.kb === undefined)) return;\n' +
    '    if (typeof d.w !== \'string\' || !IW_HIT_CAUSES.has(d.w)) return;';
  return code.slice(0, at) + block + code.slice(at + GUARD.length);
}
