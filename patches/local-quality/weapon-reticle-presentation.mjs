// Presentation-only family/state seam. No reticle geometry is asserted here.
// Gameplay keeps weapon.kind/behaviorKind and the runner's fixed-tick state.
// Catalog read paths are pinned in baseline/provenance.json to main 7f863ea2.
const FAMILIES = new Set([
  'shooter', 'blaster', 'roller', 'dualies', 'slosher', 'splatling',
  'charger', 'stringer', 'splatana', 'brush', 'brella',
]);

const LEGACY_KINDS = Object.freeze({
  stringer: 'charger', splatana: 'charger', brush: 'roller', brella: 'shooter',
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = value => Math.max(0, Math.min(1, finite(value)));

/** Resolve visual identity without rewriting the weapon or its gameplay family. */
export function weaponReticleFamily(weapon) {
  const family = weapon?.behaviorKind || weapon?.catalogRecord?.family ||
    (weapon?.kind === 'catalog' ? weapon?.modelKind : weapon?.kind) || weapon?.modelKind;
  return FAMILIES.has(family) ? family : null;
}

/** Existing fallback shape, kept separate from the new presentation identity. */
export function legacyReticleKind(family) {
  if (!FAMILIES.has(family)) return 'shooter';
  return LEGACY_KINDS[family] || family;
}

/**
 * Copy only already-authoritative primitive state. No RNG, clocks, physics,
 * source parameter interpolation, DOM allocation or mutation of input objects.
 * A HUD may reuse its own `out` record across frames and weapon switches.
 */
export function readWeaponReticlePresentation(weapon, runner, out = {}) {
  const state = runner?.catalogState;
  if (out === weapon || out === weapon?.catalogRecord || out === runner ||
      out === state || out === state?.canopy || out === state?.saberSwing)
    throw new TypeError('Reticle output must not alias authoritative weapon/runner state');
  const family = weaponReticleFamily(weapon);
  const candidateId = weapon?.catalogRecord?.id ?? weapon?.id;
  const id = typeof candidateId === 'string' ? candidateId : null;
  const matchingState = id != null && state?.id === id ? state : null;
  out.weaponId = id;
  out.family = family;
  out.legacyKind = legacyReticleKind(family);
  out.charge = unit(runner?.charge);
  out.charging = runner?.charging === true;
  out.streaming = runner?.streaming === true;
  out.bowTiltDegrees = family === 'stringer' ? finite(matchingState?.bowTilt) : 0;
  out.canopyOpen = family === 'brella' && matchingState?.canopy?.open === true;
  out.canopyPreparing = family === 'brella' && matchingState?.canopy?.preparing === true;
  const swing = family === 'splatana' ? matchingState?.saberSwing?.key : null;
  out.saberSwingKey = swing === 'saber-horizontal' || swing === 'saber-vertical' ? swing : null;
  return out;
}
