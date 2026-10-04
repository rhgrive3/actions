// Build-only #462 residual correction: validate the client-supplied combat claim
// (damage magnitude + cause) before it reaches applyHit / HP state.
//
// The relay-authenticated sender -> attacker.owner check and the life/hit-sequence
// admission are ALREADY implemented by PR #452 in patches/reliability/combat-life-adapter.mjs.
// This adapter deliberately does NOT duplicate that sender check; it adds only the
// remaining payload-shape validation that the owner thread listed as still open.
//
// Upstream src/net/netmatch.js stays untouched. Requires its anchor exactly once;
// source drift fails closed.
const GUARD = '    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;';
const MARKER = '// #462 residual: reject malformed combat claims';

// Protocol integrity bounds, not gameplay tuning. MAX_HIT_DAMAGE is deliberately
// generous above any legitimate single weapon event, so it only rejects implausible
// client-supplied damage. MAX_CAUSE_LEN bounds the opaque cause/weapon-id string.
export const MAX_HIT_DAMAGE = 1000;
export const MAX_CAUSE_LEN = 32;

export function isHitPayloadValid(d) {
  if (!Number.isFinite(d?.d) || d.d <= 0 || d.d > MAX_HIT_DAMAGE) return false;
  if (typeof d?.w !== 'string' || d.w.length < 1 || d.w.length > MAX_CAUSE_LEN) return false;
  return true;
}

export function adaptNetHitPayload(rel, code) {
  if (rel !== 'src/net/netmatch.js') return code;
  if (code.includes(MARKER)) throw new Error('Hit payload anchor mismatch: already applied');
  const at = code.indexOf(GUARD);
  if (at < 0 || code.indexOf(GUARD, at + GUARD.length) >= 0) {
    throw new Error('Hit payload anchor mismatch: hit guard');
  }
  const block = GUARD + '\n' +
    '    ' + MARKER + ': reject malformed combat claims before they touch HP/state.\n' +
    `    if (!Number.isFinite(d.d) || d.d <= 0 || d.d > ${MAX_HIT_DAMAGE}) return;\n` +
    `    if (typeof d.w !== 'string' || d.w.length < 1 || d.w.length > ${MAX_CAUSE_LEN}) return;`;
  return code.slice(0, at) + block + code.slice(at + GUARD.length);
}
