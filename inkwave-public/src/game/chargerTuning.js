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
export function chargerLineRadius(weapon, charge) {
  return (weapon?.lineRadius ?? 0.3) * (0.65 + 0.35 * clamp01(charge));
}
export function chargerLineSpacing(charge) {
  return 0.47 + 0.13 * clamp01(charge);
}
export function chargerEndRadius(weapon, charge) {
  return (weapon?.impactRadius ?? 0.67) * (0.55 + 0.45 * clamp01(charge));
}

// Ink suspended above distant geometry falls to the first paintable surface,
// rather than disappearing when the old 3.5-unit ground probe missed it.
export const CHARGER_FALL_GRAVITY = 20;
export function chargerFallTime(height) {
  return Math.sqrt(2 * Math.max(0, height) / CHARGER_FALL_GRAVITY);
}
