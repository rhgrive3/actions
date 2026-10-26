// LOCAL f6 next-candidate proposal, hooked only by this candidate compiler.
// Not published; radius13 is source-reviewed approximation, not browser parity.
// Native Hot Blaster ground samples support approximate +/-28.3 corner
// centers at720p. Keep INKWAVE #709's exact existing scale response rather
// than invent a new native cone-angle-to-screen-pixel calibration.
export const BLASTER_DIAGONAL_PROPOSAL = Object.freeze({
  id: 'hot-blaster-diagonal-local-approximation',
  weaponIds: Object.freeze(['blaster']), nativeKind: 'blaster',
  accuracy: 'reference-guided-approximation',
  // Saved clean ground/air ring midlines normalize to12.50..12.67px at720p,
  // uncertainty approximately+/-0.83px.13 is approximate, not exact parity.
  innerRadius: '13',
  // BOTH-axis scale is deliberately inherited policy, not proven retail
  // parity: measured native jump frames expand predominantly horizontally.
  response: 'scale(calc(1 + var(--sp, 0) * .012))',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" class="iw-reticle-blaster-diagonal-proposal" viewBox="-40 -40 80 80" width="80" height="80" aria-hidden="true" focusable="false" style="position:absolute;left:-40px;top:-40px;width:80px;height:80px;overflow:visible;transform:scale(calc(1 + var(--sp, 0) * .012));transform-origin:50% 50%;transition:transform .1s linear;rotate:none;scale:none;translate:none;pointer-events:none;color:inherit"><path d="M-32.5 -24.1l8.4 -8.4 M24.1 -32.5l8.4 8.4 M-32.5 24.1l8.4 8.4 M24.1 32.5l8.4 -8.4" style="fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:butt;stroke-linejoin:round;stroke-dasharray:none"/></svg>',
});
export function blasterDiagonalProposal(weapon, nativeKind) {
  return nativeKind === 'blaster' && weapon?.id === 'blaster' && weapon.kind === 'blaster'
    ? BLASTER_DIAGONAL_PROPOSAL : null;
}
