// Build-only #462 residual correction: validate the client-supplied combat claim
// (damage magnitude + known cause) before it reaches applyHit / HP state.
//
// The relay-authenticated sender -> attacker.owner check and the life/hit-sequence
// admission are ALREADY implemented by PR #452 in patches/reliability/combat-life-adapter.mjs.
// This adapter deliberately does NOT duplicate that sender check; it adds only the
// remaining payload-shape validation that the owner thread listed as still open.
//
// Admission follows the same profile and kit definitions that production installs,
// not just the frozen raw snapshot. In particular, raw Slam is 180 while the
// active S3 Slam, Trizooka direct hit and Ink Vac countershot can each be 220.
// These are payload ceilings, not new damage tuning or sender authority.
// Include the full selectable 14/19/65 catalogue IDs so source-installed hits
// are admitted by the same victim-owned policy; phase multipliers stay off-wire.
import fs from 'node:fs';
import { SUB_NAMES, SPECIAL_NAMES } from '../splatoon3/runtime/catalogue.mjs';
import { MAIN_WEAPON_CATALOG } from '../splatoon3/runtime/main-weapon-catalog-data.mjs';
import { WEAPONS, SUB, SPECIALS } from '../../inkwave-public/src/config.js';
import { ALL_SUB_SPECS } from '../splatoon3/runtime/all-subs.mjs';
import { registerKitSubs } from '../splatoon3/runtime/kit-subs.mjs';
import { trizookaSpecialWeapon, TRIZOOKA_ID } from '../splatoon3/runtime/kit-trizooka.mjs';
import { inkVacBlastDescriptor, VAC_ID } from '../splatoon3/runtime/kit-ink-vac.mjs';

const GUARD = '    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;';
const TOP = 'const TICK = 1 / 20;';
const MARKER = '// #462 residual: reject malformed combat claims';

const DAMAGE_FIELD = /damage/i;
const profile = JSON.parse(fs.readFileSync(new URL('../splatoon3/profile.json', import.meta.url), 'utf8'));
const copyDefinitions = source => Object.fromEntries(Object.entries(source).map(([id, spec]) => [id, { ...spec }]));

// Build-only: no shared raw config is mutated and no browser startup work is added.
export function hitPayloadPolicy(tuning = profile) {
  const weapons = copyDefinitions(WEAPONS), subs = copyDefinitions(SUB), specials = copyDefinitions(SPECIALS);
  for (const [id, spec] of Object.entries(tuning.weapons || {})) Object.assign(weapons[id] ||= {}, spec);
  Object.assign(subs.bomb, tuning.bomb);
  for (const [id, spec] of Object.entries(tuning.specials || {})) Object.assign(specials[id] ||= {}, spec);
  registerKitSubs(subs, tuning);
  const descriptors = [ALL_SUB_SPECS.angleShooter, trizookaSpecialWeapon(0), trizookaSpecialWeapon(57), inkVacBlastDescriptor(0), inkVacBlastDescriptor(1)];
  let maxDamage = 0;
  for (const def of [...Object.values(weapons), ...Object.values(subs), ...Object.values(specials), ...descriptors]) {
    for (const [key, value] of Object.entries(def || {})) {
      if (DAMAGE_FIELD.test(key) && Number.isFinite(value)) maxDamage = Math.max(maxDamage, value);
    }
  }
  const causes = [...new Set([
    ...Object.keys(weapons), ...Object.keys(subs), ...Object.keys(specials),
    ...MAIN_WEAPON_CATALOG.records.map(r=>r.id), ...Object.keys(SUB_NAMES), ...Object.keys(SPECIAL_NAMES).filter(id=>id!=='bubbler'), 'torpedo-splash',
    TRIZOOKA_ID, VAC_ID, // registered damaging specials; Big Bubbler authors no hit
    'shot', 'slosh', 'blast', 'drop', // authored projectile-type fallbacks
  ])];
  return { maxDamage, causes };
}
export const ANGLE_SHOOTER_HIT_MAX = ALL_SUB_SPECS.angleShooter.directDamage;
const policy = hitPayloadPolicy();
export const MAX_HIT_DAMAGE = policy.maxDamage;
export const KNOWN_HIT_CAUSES = Object.freeze(policy.causes);
const CAUSE_SET = new Set(KNOWN_HIT_CAUSES);

export function isHitPayloadValid(d) {
  if (!Number.isFinite(d?.d) || d.d <= 0 || d.d > MAX_HIT_DAMAGE) return false;
  if (typeof d?.w !== 'string' || !CAUSE_SET.has(d.w)) return false;
  if (d.w === 'angleShooter' && d.d > ANGLE_SHOOTER_HIT_MAX) return false;
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
    '// #462 payload bounds derived from the production profile and kit definitions.\n' +
    `const IW_HIT_MAX_DAMAGE = ${MAX_HIT_DAMAGE};\n` +
    `const IW_HIT_CAUSES = new Set(${JSON.stringify(KNOWN_HIT_CAUSES)});\n` +
    `const IW_ANGLE_SHOOTER_HIT_MAX = ${ANGLE_SHOOTER_HIT_MAX};`;
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
    '    if (typeof d.w !== \'string\' || !IW_HIT_CAUSES.has(d.w)) return;\n' +
    "    if (d.w === 'angleShooter' && d.d > IW_ANGLE_SHOOTER_HIT_MAX) return;";
  return code.slice(0, at) + block + code.slice(at + GUARD.length);
}
