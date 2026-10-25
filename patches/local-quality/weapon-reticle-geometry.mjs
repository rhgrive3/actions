/**
 * Presentation-only, reference-guided approximate geometry at a 720p baseline.
 * These are deliberately not pixel-perfect retail assets. No game images,
 * physics, clocks, random values, source parameters or weapon mutations belong
 * here. Build strings once; selectors return the same frozen records per frame.
 */
const ROOT_STYLE = 'position:absolute;left:-80px;top:-64px;width:160px;height:128px;overflow:visible;transform:none;rotate:none;scale:none;translate:none;pointer-events:none;color:inherit';
const LINE_STYLE = 'fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:butt;stroke-linejoin:round;stroke-dasharray:none';
const RING_STYLE = 'fill:none;stroke:currentColor;stroke-width:1.5;stroke-dasharray:none;opacity:.7';
const ring = radius => `<circle class="iw-reticle-presentation-ring" cx="0" cy="0" r="${radius}" style="${RING_STYLE}"/>`;
const DOT = '<circle class="iw-reticle-presentation-dot" cx="0" cy="0" r="1.2" style="fill:currentColor;stroke:none;opacity:.7"/>';
const line = (name, d) => `<path class="iw-reticle-presentation-${name}" d="${d}" style="${LINE_STYLE}"/>`;
const svg = (profileId, body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iw-ret__svg iw-reticle-presentation-svg" data-iw-reticle-presentation-profile="${profileId}" viewBox="-80 -64 160 128" width="160" height="128" aria-hidden="true" focusable="false" style="${ROOT_STYLE}">${body}</svg>`;

const ROLLER_SVG = svg('roller-reference-720p', ring(13) + DOT +
  line('diagonals', 'M-49.2 -18.7l8 -8 M41.2 -26.7l8 8 M-49.2 18.7l8 8 M41.2 26.7l8 -8'));
const BRELLA_SVG = svg('brella-reference-720p', ring(13) + DOT);
// Decorate the four existing spread ticks instead of drawing another static
// frame. The composed Shooter CSS, also used by Brella, owns horizontal --sp
// placement and quadrant --iw-angle. Counterrotate only the child artwork to
// keep each chamfer axis-aligned without touching that authoritative mapping.
// Reference corners reach approximately y +/-54 at 720p. Existing parent
// centers are y +/-24, so move only the child artwork another 20px outward;
// its own 10px corner extent supplies the remaining reference silhouette.
const brellaSpreadTickSvg = (quadrant, path) => `<svg xmlns="http://www.w3.org/2000/svg" class="iw-reticle-presentation-spread-tick iw-reticle-presentation-spread-tick-${quadrant}" viewBox="-16 -40 32 80" width="32" height="80" aria-hidden="true" focusable="false" style="position:absolute;left:-16px;top:-40px;width:32px;height:80px;overflow:visible;transform:rotate(calc(0deg - var(--iw-angle, 0deg)));transform-origin:50% 50%;pointer-events:none">${line('spread-corner', path)}</svg>`;
const BRELLA_SPREAD_TICK_SVGS = Object.freeze([
  brellaSpreadTickSvg('tl', 'M-10 -10V-20L0 -30H10'),
  brellaSpreadTickSvg('tr', 'M10 -10V-20L0 -30H-10'),
  brellaSpreadTickSvg('bl', 'M-10 10V20L0 30H10'),
  brellaSpreadTickSvg('br', 'M10 10V20L0 30H-10'),
]);
const WIPER_IDLE_BODY = ring(8) +
  line('idle-ticks', 'M-26 -7V7 M-20 -7V7 M-14 -7V7 M14 -7V7 M20 -7V7 M26 -7V7');
const WIPER_CHARGE_BODY = ring(8) +
  line('charge-bars', 'M-13 -45H13 M-13 -35H13 M-13 -25H13 M-13 -15H13 M-13 15H13 M-13 25H13 M-13 35H13 M-13 45H13');
// Stamper has its own observed four-tick-per-side comb and larger charge
// column. These normalized 720p dimensions and taper remain approximate.
const STAMPER_IDLE_BODY = ring(8) +
  line('idle-ticks', 'M-45 -7V7 M-36 -7V7 M-27 -7V7 M-18 -7V7 M18 -7V7 M27 -7V7 M36 -7V7 M45 -7V7');
const STAMPER_CHARGE_BODY = ring(8) +
  line('charge-bars', 'M-9 -49H9 M-11 -38H11 M-13 -27H13 M-15 -16H15 M-15 16H15 M-13 27H13 M-11 38H11 M-9 49H9');

const state = (profileId, name, markup, spreadTickSvgs = null) => Object.freeze({
  id: `${profileId}:${name}`, profileId, state: name, svg: markup, spreadTickSvgs,
});
const stableStates = (profileId, markup, spreadTickSvgs = null) => Object.freeze({
  idle: state(profileId, 'idle', markup, spreadTickSvgs),
});
const saberStates = (profileId, idleBody, chargeBody) => {
  const idleSvg = svg(profileId, idleBody);
  const chargingSvg = svg(profileId, chargeBody);
  return Object.freeze({
    idle: state(profileId, 'idle', idleSvg),
    charging: state(profileId, 'charging', chargingSvg),
    // Comb silhouettes are observed; dynamic progress/fill and exact full-charge
    // colour are not established. Reuse static bars, not a fabricated gauge.
    full: state(profileId, 'full', chargingSvg),
  });
};
const profile = (id, family, weaponIds, states, spreadTickSvgs = null, activation = 'active') => Object.freeze({
  id, family, weaponIds: weaponIds == null ? null : Object.freeze(weaponIds),
  accuracy: 'reference-guided-approximation', referenceHeight: 720,
  states, spreadTickSvgs, activation,
});

export const WEAPON_RETICLE_GEOMETRY_PROFILES = Object.freeze({
  roller: profile('roller-reference-720p', 'roller', null,
    stableStates('roller-reference-720p', ROLLER_SVG)),
  brella: profile('brella-reference-720p', 'brella', null,
    stableStates('brella-reference-720p', BRELLA_SVG, BRELLA_SPREAD_TICK_SVGS), BRELLA_SPREAD_TICK_SVGS),
  wiper: profile('wiper-reference-720p', 'splatana', ['s3-saber-lite'],
    saberStates('wiper-reference-720p', WIPER_IDLE_BODY, WIPER_CHARGE_BODY)),
  stamper: profile('stamper-reference-720p', 'splatana', ['s3-saber-normal'],
    saberStates('stamper-reference-720p', STAMPER_IDLE_BODY, STAMPER_CHARGE_BODY)),
});

/** Input is the primitive-only record from readWeaponReticlePresentation. */
export function weaponReticleGeometryProfile(presentation) {
  switch (presentation?.family) {
    case 'roller': return WEAPON_RETICLE_GEOMETRY_PROFILES.roller;
    case 'brella': return WEAPON_RETICLE_GEOMETRY_PROFILES.brella;
    case 'splatana':
      // The seam prefers catalogRecord.id, so alternate kits resolve to their
      // verified base main-weapon identity. Decavitator is not a Wiper variant.
      if (presentation.weaponId === 's3-saber-lite') return WEAPON_RETICLE_GEOMETRY_PROFILES.wiper;
      if (presentation.weaponId === 's3-saber-normal') return WEAPON_RETICLE_GEOMETRY_PROFILES.stamper;
      return null;
    default: return null;
  }
}

/**
 * Allocation-free after module initialization. The installer owns DOM caching,
 * hidden legacy handles and the no-profile fallback. Canopy state never changes
 * the solid Brella corners: no unsupported dash/launch animation is invented.
 */
export function weaponReticleGeometryState(presentation) {
  const geometry = weaponReticleGeometryProfile(presentation);
  if (!geometry) return null;
  if (geometry.family !== 'splatana') return geometry.states.idle;
  if (presentation.charging !== true) return geometry.states.idle;
  return presentation.charge >= 1 ? geometry.states.full : geometry.states.charging;
}
