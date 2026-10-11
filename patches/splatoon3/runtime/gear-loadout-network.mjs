import { abilityAllowed, normalizeLoadout } from './gear.mjs';
import { SPLATFEST_TEE } from './clothing-gear.mjs';
const TAG = 'inkwave-gear-v1';
// Append-only v1 IDs keep persistent gear snapshots small without accepting AP.
export const GEAR_WIRE_IDS = Object.freeze(['none','haunt','thermalInk','respawnPunisher','abilityDoubler','objectShredder','ninjaSquid','tenacity','lastDitchEffort','comeback','openingGambit','subResistance','runSpeed','swimSpeed','inkSaverMain','inkSaverSub','inkRecovery','inkResistance','actionIntensify','specialCharge','specialPower','specialSaver','quickRespawn','quickSuperJump','stealthJump','dropRoller','subPower']);
const gearId = id => GEAR_WIRE_IDS.indexOf(id);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const matchId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
// Equipment identities only. AP, multipliers and weapon tuning never cross this wire.
export function packOwnerGear(match) {
  if (!matchId(match?.cfg?.id)) return undefined;
  const result = Object.create(null);
  for (const actor of match.byNid.values()) {
    if (actor.remote || !integer(actor.nid) || !integer(actor._adoptionSequence)) continue;
    const parts = normalizeLoadout(actor.s3?.loadout).map(p => [p.item === SPLATFEST_TEE ? 1 : 0, gearId(p.main), ...p.subs.map(gearId)]);
    result[actor.nid] = [TAG, match.cfg.id, actor.nid, integer(actor.netLife) ? actor.netLife : 0, actor._adoptionSequence, parts];
  }
  return result;
}
export function readAcceptedGear(row, match, actor, adoption) {
  if (!adoption || !Array.isArray(row) || row.length !== 6 || row[0] !== TAG ||
      !matchId(match?.cfg?.id) || row[1] !== match.cfg.id || row[2] !== actor.nid ||
      row[3] !== adoption.life || row[4] !== adoption.sequence ||
      !Array.isArray(row[5]) || row[5].length !== 3) return null;
  const loadout = [];
  for (let piece = 0; piece < 3; piece++) {
    const p = row[5][piece];
    if (!Array.isArray(p) || p.length !== 5 || ![0, 1].includes(p[0]) || p[0] === 1 && piece !== 1) return null;
    const item = p[0] === 1 ? SPLATFEST_TEE : undefined;
    for (let slot = 0; slot < 4; slot++)
      if (!integer(p[slot + 1]) || p[slot + 1] >= GEAR_WIRE_IDS.length || !abilityAllowed(GEAR_WIRE_IDS[p[slot + 1]], piece, slot, item)) return null;
    loadout.push(Object.freeze({ ...(item ? { item } : {}), main: GEAR_WIRE_IDS[p[1]], subs: Object.freeze(p.slice(2).map(id => GEAR_WIRE_IDS[id])) }));
  }
  return Object.freeze({ loadout: Object.freeze(loadout), key: JSON.stringify(row[5]) });
}
export function applyAcceptedGear(actor, state) {
  const gear = state?.gear;
  const life = Math.max(integer(actor.netLife) ? actor.netLife : 0, integer(actor.net?.lastLife) ? actor.net.lastLife : 0);
  if (state?.life !== life) return false;
  if (!gear || !actor.s3 || typeof actor.s3RefreshGear !== 'function' || actor.s3._wireGearKey === gear.key && actor.s3._wireGearApplied === actor.s3.loadout) return false;
  const points = actor.special;
  actor.s3.loadout = normalizeLoadout(gear.loadout);
  actor.s3RefreshGear();
  // Snapshot gauge points already include the owner's cost/SCU convention.
  // Refreshing equipment must not rescale that authoritative absolute value.
  actor.special = points;
  actor.s3._wireGearKey = gear.key;
  actor.s3._wireGearApplied = actor.s3.loadout;
  return true;
}

// Native gauge points are integer-quantized; an accepted ready bit retains the
// lost boundary information. Never derive a new gameplay cost from remote sc.
export function restoreAdoptedGearGauge(actor, transfer, readyFlag, activeFlag) {
  const state = transfer?.latest, sample = transfer?.snapshot;
  if (!state?.gear || !sample || !actor.alive || actor.remote || state.squidSpawn ||
      state.life !== actor.net?.lastLife || sample.life !== state.life) return false;
  const cost = actor.weapon?.specialCost, gauge = sample.sp;
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(sample.spCost) ||
      Math.abs(sample.spCost - cost) > 1e-8 || !Number.isFinite(gauge) || gauge < 0 || gauge > cost + .5) return false;
  if (actor.specialActive || sample.f & activeFlag) return false;
  actor.special = Math.min(cost, gauge);
  if (actor.stormGaugeLock > 0 || actor.s3TidalSlamGaugeFinish) return true;
  if (sample.f & readyFlag) {
    if (Math.round(cost) === gauge) actor.special = cost;
  } else if (actor.special >= cost) {
    actor.special = Math.max(0, cost - Math.max(1, cost) * Number.EPSILON);
  }
  return true;
}
