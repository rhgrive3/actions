// Issue #483 — ref-counted hair-geometry ownership (build-only runtime helper).
// Unpatched `src/game/character-geo.js` keeps every generated hair mesh forever in
// module `_hair` (hair x hat x brows x LOD x raw quality) and `Character._buildRig()`
// built a hero mesh just for meta/rest before the game tier was installed. This helper
// adds explicit ownership without touching inkwave-public/, profile numbers, shared
// dispatchers or timing:
//  - acquire pins a cache slot; release disposes at zero users (exactly one
//    BufferGeometry.dispose() per ownership epoch, never while a Character holds it),
//  - the far tier ignores quality in its key (fixed detail ladder), so LOD/quality
//    variants cannot multiply retained entries,
//  - anatomy reads reuse/build the game-tier entry (never a hero build),
//  - entries exist only while referenced: match teardown returns to a zero baseline.
export const HAIR_CACHE_BUDGET = 96;
const slots = new Map();   // full cache key -> { entry }
const users = new Map();   // full cache key -> live reference count
let stats = { builds: 0, reuses: 0, releases: 0, disposes: 0, tiers: { hero: 0, game: 0, far: 0 } };

const wrapN = (v, n) => ((Math.round(Number(v) || 0) % n + n) % n);
const appKey = (st, c) => (st && typeof st === 'object'
  ? `${wrapN(st.hair, c?.hair ?? 8)}.${wrapN(st.hat, c?.hats ?? 4)}.${wrapN(st.brows, c?.brows ?? 4)}`
  : `${wrapN(st, c?.hair ?? 8)}.0.0`);
export const normLod = (lod) => (lod === 'hero' || lod === 'far' ? lod : 'game');
export function normQuality(q, lod) {
  if (lod === 'far') return 'fixed';
  const s = String(q || 'high');
  return s === 'low' || s === 'medium' || s === 'high' || s === 'ultra' ? s : 'high';
}
export function countsFrom(native) {
  return { hair: native.hairStyleCount ?? 8, hats: native.hatKindCount ?? 4, brows: native.browKindCount ?? 4 };
}
export function hairCacheKey(style, lod = 'game', quality = 'high', counts) {
  const tier = normLod(lod);
  return `${appKey(style, counts)}.${tier}.${normQuality(quality, tier)}`;
}
/** The exact key acquireHair() will use for these arguments (single source of truth). */
export function hairKeyFor(native, style, lod = 'game', quality = 'high') {
  return hairCacheKey(style, lod, quality, countsFrom(native));
}
function geos(entry) {
  const out = []; const seen = new Set();
  const visit = (v) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v);
    if (v.isBufferGeometry && typeof v.dispose === 'function') { out.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    for (const k of Object.keys(v)) { if (k === 'meta' || k === 'rest') continue; visit(v[k]); }
  };
  visit(entry?.geo ?? entry); return out;
}
export function acquireHair(native, style, lod = 'game', quality = 'high') {
  if (!native || typeof native.getHairStyle !== 'function') throw new Error('issue-483: native geo API required');
  const tier = normLod(lod);
  const key = hairKeyFor(native, style, tier, quality);
  let slot = slots.get(key);
  if (!slot) { slot = { entry: native.getHairStyle(style, tier) }; slots.set(key, slot); stats.builds += 1; stats.tiers[tier] += 1; }
  else stats.reuses += 1;
  users.set(key, (users.get(key) || 0) + 1);
  return slot.entry;
}
/** Drop one reference; at zero users dispose every BufferGeometry of the entry exactly once. */
export function releaseHairKey(key) {
  const n = users.get(key);
  if (!n) return false;
  stats.releases += 1;
  if (n > 1) { users.set(key, n - 1); return false; }
  users.delete(key);
  const slot = slots.get(key);
  if (slot) {
    slots.delete(key);
    for (const g of geos(slot.entry)) { g.dispose(); stats.disposes += 1; }
  }
  return true;
}
export function releaseHair(style, lod = 'game', quality = 'high', counts) {
  return releaseHairKey(hairCacheKey(style, lod, quality, counts));
}
/**
 * Rig metadata handle: one game-tier reference (never a hero build). meta/rest data is
 * lod-independent ("Bone rest positions never depend on detail", character-hair.js), so the
 * game entry replaces the hero mesh the native rig used to generate. The handle must be
 * released exactly once via releaseAnatomy (dispose / quality rebuild).
 */
export function getAnatomy(native, style) {
  const q = native.hairQuality ? native.hairQuality() : 'high';
  const entry = acquireHair(native, style, 'game', q);
  return { key: hairKeyFor(native, style, 'game', q), entry, meta: entry.meta, rest: entry.rest };
}
export function releaseAnatomy(handle) {
  if (!handle || !handle.key) return false;
  return releaseHairKey(handle.key);
}
export function hairStats() {
  let live = 0; for (const n of users.values()) live += n;
  return { entries: slots.size, liveUsers: live, budget: HAIR_CACHE_BUDGET, ...stats, tiers: { ...stats.tiers } };
}
export function resetHairForTests() {
  slots.clear(); users.clear();
  stats = { builds: 0, reuses: 0, releases: 0, disposes: 0, tiers: { hero: 0, game: 0, far: 0 } };
}
