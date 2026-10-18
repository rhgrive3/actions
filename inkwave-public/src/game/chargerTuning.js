// Charger geometry and scoped-view response. Units are INKWAVE units, not Nintendo metres.
// The scoped lens starts narrowing once charging reaches 50%; the baseline game FOV
// is preserved for unscoped chargers, non-chargers and released trigger states.
const clamp01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
export function chargerScopeFactor(weapon, charge, charging = true) {
  if (!charging || weapon?.kind !== 'charger' || !weapon.scoped) return 0;
  const k = clamp01((charge - 0.5) * 2);
  return k * k * (3 - 2 * k);
}

// The previous line used ~0.55-0.66 radius stamps WITH 1.2x directional
// stretching and splatter lobes. These clean stamps share the same CPU/GPU
// footprint; the impact may be broader than the narrow flight stripe.
// Native S3 SplashPaintParam: width/depth half (raw x 0.2) and overlap ratio.
// Half charge reaches Max values; the distinct Full values apply at 100%.
// These are source-based proportions in the project's unit scale, not a
// claim that the whole scene has been independently metrically calibrated.
function threeStage(weapon, charge, stem, values) {
  const c = clamp01(charge);
  const min = weapon?.[stem + 'Min'] ?? values[0];
  const mid = weapon?.[stem + 'Mid'] ?? values[1];
  const full = weapon?.[stem] ?? values[2];
  return c <= 0.5 ? min + (mid - min) * c * 2 : mid + (full - mid) * (c - 0.5) * 2;
}
export function chargerLineRadius(weapon, charge) {
  return threeStage(weapon, charge, 'lineRadius', [0.156, 0.312, 0.312]);
}
export function chargerLineDepth(weapon, charge) {
  return threeStage(weapon, charge, 'lineDepth', [0.546, 0.312, 0.312]);
}
export function chargerLineStretch(weapon, charge) {
  return Math.max(0, chargerLineDepth(weapon, charge) / chargerLineRadius(weapon, charge) - 1);
}
export function chargerLineSpacing(weapon, charge) {
  const overlap = threeStage(weapon, charge, 'lineOverlap', [0.125, 0.25, 0.34]);
  return 2 * chargerLineDepth(weapon, charge) * (1 - overlap);
}
export function chargerEndRadius(weapon, charge) {
  return threeStage(weapon, charge, 'impactRadius', [0.1812, 0.5438, 0.6526]);
}

// Ink suspended above distant geometry falls to the first paintable surface,
// rather than disappearing when the old 3.5-unit ground probe missed it.
export const CHARGER_FALL_GRAVITY = 20;
export function chargerFallTime(height) {
  return Math.sqrt(2 * Math.max(0, height) / CHARGER_FALL_GRAVITY);
}
