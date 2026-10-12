// Paint dimensions are explicit: world-unit² is NOT a battle-point unit.
// Retail S3 impact lateral taper is described by community analysis, but its
// exponent is not extracted from the Nintendo emitter. This is a calibrated,
// deterministic INKWAVE approximation and must not be labeled exact Nintendo.
//
// After forward/back scales (1 + amount) and (1 + amount/4), the mean
// longitudinal factor is 1 + 5*amount/8. Narrow by its inverse square root
// while keeping both forward and backward endpoints fixed via centreShift.
// The original area increases with elongation; cross width no longer remains
// artificially constant. CPU and WebGL receive the same transformed inputs.
export const INK_S3_AREA_LATERAL_EXPONENT = 0.5;
export function directFloorFootprint(radius, amount, out = {}) {
  if (!(Number.isFinite(radius) && radius > 0 && Number.isFinite(amount) && amount > 0)) {
    out.radius=radius;out.stretchAmt=amount;out.centreShift=0;out.lateral=1;return out;
  }
  const lateral = Math.pow(1 + 0.625 * amount, -INK_S3_AREA_LATERAL_EXPONENT);
  const stretched = ((2 + 1.25 * amount) / lateral - 2) / 1.25;
  const shift = radius * (1 + amount - lateral * (1 + stretched));
  out.radius = radius * lateral;
  out.stretchAmt = stretched;
  out.centreShift = shift;
  out.lateral = lateral;
  return out;
}

// This is the Splatoon 2 community's 1 turf point per one tsubo (~3.3058 m²).
// S3 uses the same score scale as an INKWAVE starting calibration, NOT an
// independently measured S3 conversion. INKWAVE's nominal 1 world unit ~1 m
// is also inferred from the profile / player height, not independently audited.
export const INKWAVE_WORLD_SQUARES_PER_TURF_POINT = 3.305785;
export function inkPaintPoints(areaWU2) {
  return Number.isFinite(areaWU2) && areaWU2 > 0 ? areaWU2 / INKWAVE_WORLD_SQUARES_PER_TURF_POINT : 0;
}
