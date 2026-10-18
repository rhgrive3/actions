// Pure admission guards for persisted game state and online START packets.
// Keep gameplay hot paths free of parsing and restore existing defaults for bad saves.
const OWN = Object.prototype.hasOwnProperty;
export const MAX_PROFILE_LEVEL = 100000;
export const MAX_PROFILE_XP = 1e12;
const RANGES = Object.freeze({
  sensitivity: [0.2, 3], fov: [65, 100],
  gyroSens: [-5, 5], touchSens: [-5, 5], touchScale: [0.7, 1.4],
  touchOpacity: [0.25, 1], cameraShake: [0, 1], aimAssist: [0, 1],
  rumble: [0, 1], master: [0, 1], music: [0, 1], sfx: [0, 1],
});
export function validWeaponId(weapons, id) {
  return typeof id === 'string' && OWN.call(weapons, id) && !!weapons[id];
}
const record = value => value && typeof value === 'object' && !Array.isArray(value);
function finiteSetting(value, fallback, range) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : Number.isFinite(fallback) ? fallback : 0;
  return Math.max(range[0], Math.min(range[1], n));
}
function settingsPatch(raw, fallback, quality, modernPad) {
  const value = { ...raw };
  if (OWN.call(value, 'quality') && (typeof value.quality !== 'string' || !OWN.call(quality, value.quality)))
    value.quality = typeof fallback.quality === 'string' && OWN.call(quality, fallback.quality) ? fallback.quality : 'high';
  for (const [key, range] of Object.entries(RANGES)) if (OWN.call(value, key))
    value[key] = finiteSetting(value[key], fallback[key], range);
  // Saved pre-S3 multipliers are migrated by the existing aim owner. Live
  // sliders and already-migrated saves use the independent -5..+5 S3 scale.
  const padRange = modernPad ? [-5, 5] : [.2, 3];
  const padFallback = modernPad && fallback.padSensitivityScale !== 's3' ? 0 : fallback.padSensitivity;
  if (OWN.call(value, 'padSensitivity')) value.padSensitivity = finiteSetting(value.padSensitivity, padFallback, padRange);
  if (record(value.aimProfiles)) {
    value.aimProfiles = { ...value.aimProfiles };
    for (const mode of ['tv', 'handheld']) if (record(value.aimProfiles[mode])) {
      const p = value.aimProfiles[mode] = { ...value.aimProfiles[mode] };
      const prev = fallback.aimProfiles?.[mode];
      if (OWN.call(p, 'gyroSens')) p.gyroSens = finiteSetting(p.gyroSens, prev?.gyroSens ?? fallback.gyroSens, [-5, 5]);
      if (OWN.call(p, 'padSensitivity')) p.padSensitivity = finiteSetting(p.padSensitivity, prev?.padSensitivity ?? padFallback, padRange);
    }
  }
  return value;
}
export function sanitizeSettings(raw, defaults, quality) {
  const src = record(raw) ? raw : {};
  return settingsPatch({ ...defaults, ...src }, defaults, quality, src.padSensitivityScale === 's3');
}
export function sanitizeSettingsChange(raw, current, quality) {
  // Preserve the partial's key set: merging old flat aim values here would
  // overwrite the destination profile when only aimProfile was switched.
  return settingsPatch(record(raw) ? raw : {}, current, quality, true);
}
export function sanitizeProfile(raw, defaults, weapons) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const value = { ...defaults, ...src };
  if (!validWeaponId(weapons, value.weapon)) value.weapon = defaults.weapon;
  if (!Number.isSafeInteger(value.level) || value.level < 1 || value.level > MAX_PROFILE_LEVEL) value.level = 1;
  if (!Number.isSafeInteger(value.xp) || value.xp < 0 || value.xp > MAX_PROFILE_XP) value.xp = 0;
  return value;
}
// Sum of n level thresholds 800 + 350*(level+i):
//   n * (800 + 350*level) + 175*n*(n-1).
// Inverse is O(1) and avoids hanging the JS thread even for large saved XP.
export function awardProfileXP(profile, gained, xpForLevel) {
  if (!Number.isSafeInteger(profile.level) || profile.level < 1 || profile.level > MAX_PROFILE_LEVEL) profile.level = 1;
  if (!Number.isSafeInteger(profile.xp) || profile.xp < 0 || profile.xp > MAX_PROFILE_XP) profile.xp = 0;
  const gain = Number.isSafeInteger(gained) && gained > 0 ? Math.min(gained, MAX_PROFILE_XP) : 0;
  const xp = Math.min(MAX_PROFILE_XP, profile.xp + gain);
  const level = profile.level, a = xpForLevel(level);
  const b = a - 175, room = MAX_PROFILE_LEVEL - level;
  const cost = n => n * a + 175 * n * (n - 1);
  let n = Math.min(room, Math.max(0, Math.floor((Math.sqrt(b * b + 700 * xp) - b) / 350)));
  // Correct potential floating-point rounding at exact threshold boundaries.
  while (n > 0 && cost(n) > xp) n--;
  while (n < room && cost(n + 1) <= xp) n++;
  profile.level = level + n;
  profile.xp = Math.max(0, Math.min(Math.floor(xp - cost(n)), xpForLevel(profile.level) - 1));
  return profile;
}
// Same roster on all clients, but every recipient must have exactly one
// playable human actor. Reject malformed owners, slots and duplicate nids.
export function validStartRoster(roster, myId, mode = 'turf') {
  if (typeof myId !== 'string' || !myId || !Array.isArray(roster) || roster.length < 1 || roster.length > 8) return false;
  const nids = new Set(), slots = new Set(), humans = new Set();
  let own = 0;
  for (const r of roster) {
    if (!r || typeof r !== 'object' || typeof r.owner !== 'string' || !r.owner ||
      typeof r.bot !== 'boolean' || !Number.isInteger(r.nid) || r.nid < 0 || r.nid >= 8 ||
      !Number.isInteger(r.team) || r.team < 0 || r.team > (mode === 'boss' ? 0 : 1) ||
      !Number.isInteger(r.slot) || r.slot < 0 || r.slot >= (mode === 'boss' ? 8 : 4) ||
      nids.has(r.nid) || slots.has(r.team + ':' + r.slot)) return false;
    nids.add(r.nid); slots.add(r.team + ':' + r.slot);
    if (!r.bot) {
      if (humans.has(r.owner)) return false;
      humans.add(r.owner);
      if (r.owner === myId) own++;
    }
  }
  return own === 1;
}
