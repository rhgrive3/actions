const DOT_START_BEFORE_ENDPOINT = 0.25;
const DOT_RAY_LENGTH = 0.6;
const DOT_REACH_BEYOND_ENDPOINT = DOT_RAY_LENGTH - DOT_START_BEFORE_ENDPOINT;
const CACHE_KEY = '__inkwaveS3ChargerSightDot';

export function chargerSightRayRange(range) {
  return range + DOT_REACH_BEYOND_ENDPOINT;
}

function cacheFor(sight) {
  const userData = sight.userData || (sight.userData = {});
  let cache = userData[CACHE_KEY];
  if (!cache) {
    cache = userData[CACHE_KEY] = {
      valid: false,
      hit: false,
      point: sight.position.clone(),
      normal: sight.position.clone(),
    };
  }
  return cache;
}

// The active S3 adapter gives the primary sight query the same skip-grates mask
// as the legacy dot query. Its extended range covers the complete dot segment.
export function cacheChargerSightDot(sight, lineHit) {
  const cache = cacheFor(sight);
  cache.valid = false;
  cache.hit = !!lineHit?.hit;
  if (cache.hit) {
    cache.point.copy(lineHit.point);
    cache.normal.copy(lineHit.normal);
  }
  cache.valid = true;
  return cache;
}

export function cachedChargerSightDot(sight) {
  const cache = sight?.userData?.[CACHE_KEY];
  return cache?.valid ? cache : null;
}

export function clearChargerSightDot(sight) {
  const cache = sight?.userData?.[CACHE_KEY];
  if (!cache) return;
  cache.valid = false;
  cache.hit = false;
}
