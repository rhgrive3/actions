// Runtime guards for reports in /INKWAVE Issue Queue.
// The shipped source is composed by the network adapter; do not mutate the
// immutable upstream gameplay files. These functions have no browser globals.
export const PROFILE_LEVEL_LIMIT = 1_000_000;
export const PROFILE_XP_LIMIT = 1_000_000_000_000;

export function validWeaponId(id, weapons) {
  return typeof id === 'string' && !!weapons && Object.hasOwn(weapons, id)
    && !!weapons[id] && typeof weapons[id] === 'object';
}
export function safeWeaponId(id, weapons) {
  if (validWeaponId(id, weapons)) return id;
  if (validWeaponId('shooter', weapons)) return 'shooter';
  return Object.keys(weapons || {}).find(key => validWeaponId(key, weapons)) || 'shooter';
}
export function normalizeQueueProfile(profile, weapons) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { level: 1, xp: 0, weapon: safeWeaponId(null, weapons) };
  if (weapons) profile.weapon = safeWeaponId(profile.weapon, weapons);
  if (!Number.isSafeInteger(profile.level) || profile.level < 1 || profile.level > PROFILE_LEVEL_LIMIT) profile.level = 1;
  if (!Number.isSafeInteger(profile.xp) || profile.xp < 0 || profile.xp > PROFILE_XP_LIMIT) profile.xp = 0;
  return profile;
}

// O(1) inverse of the production xpForLevel(lvl) = 800 + 350 * lvl.
// The handful of bounded rounding corrections handle exact level boundaries;
// no client-controlled XP value can introduce an unbounded synchronous loop.
export function settleProgression(profile, progression) {
  normalizeQueueProfile(profile);
  const level = profile.level, xp = profile.xp;
  const threshold = progression.xpForLevel(level);
  const slope = progression.xpForLevel(level + 1) - threshold;
  if (!Number.isFinite(threshold) || !Number.isFinite(slope) || threshold <= 0 || slope <= 0) {
    profile.xp = 0;
    return profile;
  }
  if (xp < threshold) return profile;
  const b = threshold - slope / 2;
  const spent = n => n * threshold + slope * n * (n - 1) / 2;
  const max = PROFILE_LEVEL_LIMIT - level;
  let n = Math.max(0, Math.min(max, Math.floor(2 * xp / (Math.sqrt(b * b + 2 * slope * xp) + b))));
  for (let i = 0; i < 4 && n > 0 && spent(n) > xp; i++) n--;
  for (let i = 0; i < 4 && n < max && spent(n + 1) <= xp; i++) n++;
  profile.level = level + n;
  profile.xp = Math.max(0, xp - spent(n));
  if (profile.level === PROFILE_LEVEL_LIMIT) profile.xp = Math.min(profile.xp, Math.max(0, progression.xpForLevel(profile.level) - 1));
  return profile;
}

export function reserveLiveStart(game) {
  const epoch = (game._queueAttractEpoch || 0) + 1;
  game._queueAttractEpoch = epoch;
  game._queueStartPending = true;
  return epoch;
}
export function releaseLiveStart(game, epoch) {
  if (game._queueAttractEpoch === epoch) game._queueStartPending = false;
}
export function canApplyAttractReset(game, original, epoch, mode) {
  return !game._queueStartPending && game._queueAttractEpoch === epoch
    && game.match === original && !!original?.attract && mode === 'menu';
}

// A START packet cannot create a local-less HUD, forge a second local actor or
// allocate an Actor with a missing weapon. The native host builds at most 8
// roster records, one unique team/slot and one unique nid per player/bot.
export function validStartRoster(roster, myId, weapons, mode = 'turf', hostId = null) {
  const knownModes = ['turf', 'boss', 'zones', 'tower', 'rainmaker', 'clams'];
  if (typeof myId !== 'string' || !myId || !Array.isArray(roster)
    || roster.length < 1 || roster.length > 8 || !knownModes.includes(mode)) return false;
  const nids = new Set(), slots = new Set(), humanOwners = new Set();
  let local = 0;
  for (const r of roster) {
    if (!r || typeof r !== 'object' || Array.isArray(r)
      || !Number.isSafeInteger(r.nid) || r.nid < 0 || r.nid > 65535
      || !Number.isSafeInteger(r.team) || (r.team !== 0 && r.team !== 1)
      || (mode === 'boss' && r.team !== 0)
      || !Number.isSafeInteger(r.slot) || r.slot < 0 || r.slot >= (mode === 'boss' ? 8 : 4)
      || typeof r.owner !== 'string' || !r.owner || r.owner.length > 128
      || typeof r.bot !== 'boolean' || !validWeaponId(r.weapon, weapons)) return false;
    const slotKey = r.team + ':' + r.slot;
    if (nids.has(r.nid) || slots.has(slotKey)) return false;
    nids.add(r.nid); slots.add(slotKey);
    if (!r.bot) {
      if (humanOwners.has(r.owner)) return false;
      humanOwners.add(r.owner);
      if (r.owner === myId) local++;
    } else if (hostId && r.owner !== hostId) return false;
  }
  return local === 1;
}
