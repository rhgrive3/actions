// Browser-refresh-aware frame pacing and opt-in hitch diagnostics.
// No gameplay frame, device/network data or input is sent off-device.
// Detect only stable *actual rAF* periods; never infer display refresh from
// dropped callbacks or the (already capped) simulation delta.
export const REFRESH_HZ = Object.freeze([60, 75, 90, 100, 120, 144, 165]);

export function detectStableDisplayHz(periods) {
  if (!periods || periods.length < 32) return 0;
  let best = 0, count = 0, bestDistance = Infinity;
  for (const hz of REFRESH_HZ) {
    const expected = 1 / hz;
    let hits = 0, distance = 0;
    for (const dt of periods) {
      if (!Number.isFinite(dt)) continue;
      const error = Math.abs(dt - expected) / expected;
      if (error <= .13) { hits++; distance += error; }
    }
    // Adjacent high-refresh windows may overlap at a generous 13% jitter
    // threshold (144 vs 165 Hz). Break same-hit ties by actual period error.
    if (hits > count || (hits === count && hits > 0 && distance < bestDistance)) {
      count = hits; best = hz; bestDistance = distance;
    }
  }
  return count >= Math.ceil(periods.length * .78) ? best : 0;
}

// A browser cannot present 60 equally spaced frames on a fixed 90Hz panel.
// Touch Auto conserves battery by using an even divisor (45Hz on 90Hz,
// 48Hz on 144Hz). The explicit '60' and 'display' options are unchanged.
// No interpolation or artificial frames are introduced into the simulation.
export function evenTouchAutoHz(displayHz) {
  if (displayHz >= 86 && displayHz <= 104) return displayHz / 2;
  if (displayHz >= 138 && displayHz <= 150) return displayHz / 3;
  if (displayHz >= 160 && displayHz <= 168) return displayHz / 3;
  return 60;
}

export function createRefreshProbe() {
  const ring = new Float64Array(48);
  let count = 0, next = 0, candidate = 0, votes = 0, selected = 0;
  const reset = () => { count = 0; next = 0; candidate = 0; votes = 0; selected = 0; };
  return {
    sample(dt) {
      if (selected) return selected;
      if (!Number.isFinite(dt) || dt < 1 / 190 || dt > 1 / 43) return 0;
      ring[next] = dt;
      next = (next + 1) % ring.length;
      count++;
      if (count < ring.length || count % 24 !== 0) return 0;
      const proposed = detectStableDisplayHz(ring);
      if (!proposed) { candidate = 0; votes = 0; return 0; }
      if (proposed === candidate) votes++;
      else { candidate = proposed; votes = 1; }
      if (votes >= 2) selected = proposed;
      return selected;
    },
    reset,
    get rate() { return selected; },
  };
}

