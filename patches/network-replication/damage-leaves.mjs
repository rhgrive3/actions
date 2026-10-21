// #1665/#1666: the largest per-hit player damage a definition can author.
// Pure and allocation-free per call so both the build-time ceiling table and
// the receiver's runtime main-weapon check use exactly the same rule.
//
// Every numeric leaf whose dotted path names "damage" counts (frames,
// distances and rates under a damage path are far smaller than any damage
// value, so they never raise a ceiling above the real one). Canopy-vs-canopy
// and shield values are object damage, never player HP, and are skipped.
// Catalogue parameter tables are source units: pass scale 10, as the
// catalogue builder converts them (damage: source / 10).
const DAMAGE_PATH = /damage/i;
const OBJECT_DAMAGE_KEY = /CanopyHit|Shield/;
export function damageLeafMax(value, scale = 1, skip = null, path = '', depth = 0) {
  if (depth > 12 || !value || typeof value !== 'object') return 0;
  let max = 0;
  for (const key of Object.keys(value)) {
    if (skip && depth === 0 && skip.has(key)) continue;
    const child = value[key], at = path ? path + '.' + key : key;
    if (typeof child === 'number') {
      if (Number.isFinite(child) && DAMAGE_PATH.test(at) && !OBJECT_DAMAGE_KEY.test(key)) max = Math.max(max, child / scale);
    } else if (child && typeof child === 'object') max = Math.max(max, damageLeafMax(child, scale, null, at, depth + 1));
  }
  return max;
}
