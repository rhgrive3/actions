// Issue #483 — ref-counted hair-geometry ownership (build-only runtime helper).
// Native `src/game/character-geo.js` keeps every generated hair mesh in the strong module-level
// `_hair` map (appearance x LOD x quality) and its inverse cache `_inv` grows the same way; the
// legacy `getHairStyle` contract must stay intact for non-owned callers, so this helper never calls
// it. Instead the build-only source transform `adaptIssue483CharacterGeo` exposes the narrow native
// owned builder `buildOwnedHairStyle` (real hairKey + buildHair pipeline, zero cache side effects)
// and Character passes it in through HAIR_NATIVE_483. Consequences:
//  - the native `_hair` / `_inv` maps never see an owned build, so no CPU-side geometry is retained
//    by them across looks, quality rebounds or rematches;
//  - acquire pins a helper slot; release at zero users disposes every BufferGeometry exactly once
//    AND drops the helper's only strong reference (the owned entry set becomes empty),
//  - the far tier ignores quality in its key because the far detail ladder is quality-independent
//    (character-hair.js hairDetail('far') never scales with quality),
//  - anatomy reads use the game-tier owned entry (never a hero build, never the native cache),
//  - there is deliberately no nominal budget constant: the real bound is zero unreferenced entries
//    plus the small owned set held by live Characters — match teardown returns to a zero baseline.
const slots = new Map();   // full cache key -> { entry } (the owned set: exists only while referenced)
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
/** Catalog sizes must come from the real native exports (HAIR_STYLES / HAT_KINDS / BROW_KINDS). */
export function countsFrom(native) {
  const c = native || {};
  if (!(c.hairStyleCount > 0) || !(c.hatKindCount > 0) || !(c.browKindCount > 0)) {
    throw new Error('issue-483: native catalog counts required (HAIR_STYLES / HAT_KINDS / BROW_KINDS)');
  }
  return { hair: c.hairStyleCount, hats: c.hatKindCount, brows: c.browKindCount };
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
/**
 * Pin one reference on an owned entry. Builds through the NARROW native owned builder
 * (`buildOwnedHairStyle` from adaptIssue483CharacterGeo) so the native `_hair` / `_inv` caches are
 * never touched — the legacy caching `getHairStyle` is deliberately rejected here, otherwise every
 * owned build would stay strongly referenced in the native module map forever (the reported root).
 */
export function acquireHair(native, style, lod = 'game', quality = 'high') {
  if (!native || typeof native.buildOwnedHairStyle !== 'function') {
    throw new Error('issue-483: native owned builder (buildOwnedHairStyle) required — the caching getHairStyle retains CPU geometry forever');
  }
  const tier = normLod(lod);
  const key = hairKeyFor(native, style, tier, quality);
  let slot = slots.get(key);
  if (!slot) { slot = { entry: native.buildOwnedHairStyle(style, tier) }; slots.set(key, slot); stats.builds += 1; stats.tiers[tier] += 1; }
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
/**
 * Real bound = zero unreferenced entries + the small owned set held by live Characters
 * (`entries` is that owned set; there is no nominal budget to quote).
 */
export function hairStats() {
  let live = 0; for (const n of users.values()) live += n;
  return { entries: slots.size, liveUsers: live, ...stats, tiers: { ...stats.tiers } };
}
export function resetHairForTests() {
  slots.clear(); users.clear();
  stats = { builds: 0, reuses: 0, releases: 0, disposes: 0, tiers: { hero: 0, game: 0, far: 0 } };
}
