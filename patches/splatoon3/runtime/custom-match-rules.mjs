// Custom offline match rules (pure; no game-module imports so logic tests
// can load it). custom-match.mjs installs it into the game and draws the UI.
let weaponTable = {};
/** The live weapon table (config WEAPONS); installCustomMatch sets it. */
export function setCustomMatchWeapons(table) { weaponTable = table || {}; }
export const CUSTOM_MATCH_KEY = 'inkwave.customMatch.v1';
export const MAX_ALLY_SLOTS = 7;   // Boss Battle: up to 7 Bots next to the player
export const ENEMY_SLOTS = 4;
export const MAX_PRESETS = 4;
export const MUTATOR_STEPS = Object.freeze({
  ink: Object.freeze([.5, .75, 1, 1.5, 2]),
  damage: Object.freeze([.5, .75, 1, 1.25, 1.5, 2]),
  speed: Object.freeze([.8, .9, 1, 1.1, 1.25]),
  special: Object.freeze([.5, .75, 1, 1.5, 2, 3]),
});
export const NEUTRAL_MUTATORS = Object.freeze({ ink: 1, damage: 1, speed: 1, special: 1 });
// Weapon fields the gear owner scales with Ink Saver (Main); same list.
const INK_FIELDS = Object.freeze(['inkPerShot', 'inkFull', 'inkMin', 'flickInk', 'verticalInk', 'rollInk', 'rollInkPerMeter', 'rollInkMinPerFrame', 'rollInkMaxPerFrame']);

const validWeapon = id => typeof id === 'string' && Object.hasOwn(weaponTable, id) && !!weaponTable[id];
const step = (list, v) => list.includes(v) ? v : 1;
const slots = (raw, n) => Array.from({ length: n }, (_, i) => validWeapon(raw?.[i]) ? raw[i] : null);

export function normalizeCustomMatch(raw = {}) {
  const m = raw?.mutators || {};
  const presets = Array.isArray(raw?.presets) ? raw.presets.slice(0, MAX_PRESETS).map((p, i) => ({
    name: typeof p?.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 24) : `Preset ${i + 1}`,
    allies: slots(p?.allies, MAX_ALLY_SLOTS), enemies: slots(p?.enemies, ENEMY_SLOTS),
  })) : [];
  const squad = Math.round(Number(raw?.bossSquad));
  return {
    allies: slots(raw?.allies, MAX_ALLY_SLOTS), enemies: slots(raw?.enemies, ENEMY_SLOTS),
    mutators: { ink: step(MUTATOR_STEPS.ink, m.ink), damage: step(MUTATOR_STEPS.damage, m.damage),
      speed: step(MUTATOR_STEPS.speed, m.speed), special: step(MUTATOR_STEPS.special, m.special) },
    bossSquad: Number.isFinite(squad) ? Math.max(1, Math.min(8, squad)) : 8,
    presets,
  };
}
export function readCustomMatch(storage = globalThis.localStorage) {
  try { return normalizeCustomMatch(JSON.parse(storage?.getItem(CUSTOM_MATCH_KEY) || '{}')); }
  catch { return normalizeCustomMatch({}); }
}
export function writeCustomMatch(cfg, storage = globalThis.localStorage) {
  const value = normalizeCustomMatch(cfg);
  try { storage?.setItem(CUSTOM_MATCH_KEY, JSON.stringify(value)); } catch { /* private mode: keep in memory only */ }
  return value;
}
export function savePreset(cfg, name) {
  const next = normalizeCustomMatch(cfg);
  next.presets = [...next.presets.filter(p => p.name !== name), { name, allies: [...next.allies], enemies: [...next.enemies] }].slice(-MAX_PRESETS);
  return normalizeCustomMatch(next);
}
export function loadPreset(cfg, name) {
  const next = normalizeCustomMatch(cfg), p = next.presets.find(x => x.name === name);
  if (p) { next.allies = [...p.allies]; next.enemies = [...p.enemies]; }
  return next;
}
export function mutatorsActive(m) { return !!m && (m.ink !== 1 || m.damage !== 1 || m.speed !== 1 || m.special !== 1); }

/** Offline, player-run match: the only kind custom settings apply to. */
export function customMatchApplies(match, world) {
  const o = match?.opts || {};
  return !!match && !match.attract && !match.follower && !o.roster && !o.range && !o.rangeHeadless && !world?.netm && !o.replay;
}

// Bots in slot order for one team (the local player is never re-armed).
export function rosterTargets(actors, team) {
  return (actors || []).filter(a => a && a.team === team && !a.isLocal && a.isBot !== false).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0));
}
/** Re-arm Bots whose slot names a weapon; null slots keep the native random pick. */
export function applyRoster(match, cfg) {
  const changed = [];
  const plan = [[0, cfg.allies], [1, cfg.enemies]];
  for (const [team, list] of plan) {
    rosterTargets(match.actors, team).forEach((a, i) => {
      const id = list[i];
      if (!validWeapon(id) || a.weaponId === id) return;
      a.setWeapon(id);
      changed.push([a.name, id]);
    });
  }
  return changed;
}

// ---- Mutators: idempotent per field, so flow refreshes / respawns re-apply
// exactly once on top of whatever the gear owner computed last.
let active = NEUTRAL_MUTATORS;
export function activeMutators() { return active; }
export function setActiveMutators(m) { active = m && mutatorsActive(m) ? Object.freeze({ ...m }) : NEUTRAL_MUTATORS; return active; }
function scaleOnce(record, holder, field, k) {
  if (!holder || !Number.isFinite(holder[field])) return false;
  const key = field, seen = record[key];
  if (seen && Object.is(holder[field], seen.applied)) return false;   // already ours
  const applied = holder[field] * k;
  record[key] = { base: holder[field], applied };
  holder[field] = applied;
  return true;
}
export function applyMutatorsToActor(a, { transient = false, rescaled = false } = {}, k = active) {
  const m = a?.s3?.modifiers;
  if (!m) return;
  const rec = a.s3.mutatorRecord && a.s3.mutatorRecord.weapon === a.weapon ? a.s3.mutatorRecord : (a.s3.mutatorRecord = { weapon: a.weapon, m: {}, w: {} });
  if (k.ink !== 1) {
    scaleOnce(rec.m, m, 'inkSaverMain', k.ink); scaleOnce(rec.m, m, 'inkSaverSub', k.ink);
    for (const f of INK_FIELDS) scaleOnce(rec.w, a.weapon, f, k.ink);
  }
  if (k.speed !== 1) for (const f of ['runSpeed', 'swimSpeed', 'runSpeedFiring']) scaleOnce(rec.m, m, f, k.speed);
  if (k.special !== 1) {
    scaleOnce(rec.m, m, 'specialCharge', k.special);
    if (scaleOnce(rec.w, a.weapon, 'specialCost', 1 / k.special) && rescaled && Number.isFinite(a.special)) a.special /= k.special;
  }
}

