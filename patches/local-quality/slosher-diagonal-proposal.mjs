// LOCAL next-candidate proposal, imported by this overlay's Slosher installer.
// Not published; browser/computed-CSS/retail validation is still pending.
// Native base Slosher/Slosher Deco only, not every Slosher-family weapon.
const ROOT = 'position:absolute;left:-40px;top:-40px;width:80px;height:80px;overflow:visible;transform:none;rotate:none;scale:none;translate:none;pointer-events:none;color:inherit';
// Source768x432 idle frame: diagonal centers x376.4/400.6,y189.9/214.3.
// Centered and normalized to1280x720: approximately +/-20.2,+/-20.3.
// Low-resolution JPEG and dim upper-right stroke make these approximate.
const D = 'M-24.3 -16.3l8 -8 M16.3 -24.3l8 8 M-24.3 16.3l8 8 M16.3 24.3l8 -8';
export const SLOSHER_DIAGONAL_PROPOSAL = Object.freeze({
  id: 'slosher-base-diagonal-evidence-only',
  accuracy: 'reference-guided-approximation',
  weaponIds: Object.freeze(['slosher', 'slosher-01']),
  nativeKind: 'slosher',
  replaceDirectChildClasses: Object.freeze(['iw-ret__tick']),
  // Only four legacy tick CHILDREN are to be hidden/restored by a future
  // reviewed installer. The original center ring/dot remain unchanged.
  svg: `<svg xmlns="http://www.w3.org/2000/svg" class="iw-reticle-slosher-diagonal-proposal" viewBox="-40 -40 80 80" width="80" height="80" aria-hidden="true" focusable="false" style="${ROOT}"><path d="${D}" style="fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:butt;stroke-linejoin:round;stroke-dasharray:none"/></svg>`,
});

// Caller must resolve this actual weapon from its own-property live registry,
// not a frame hint or display name. Explicit IDs reject unsupported variants.
export function slosherDiagonalProposal(weapon, nativeKind) {
  if (nativeKind !== 'slosher' || weapon?.kind !== 'slosher') return null;
  if (weapon.id === 'slosher') return SLOSHER_DIAGONAL_PROPOSAL;
  if (weapon.id === 'slosher-01' && weapon.variantOf === 'slosher') return SLOSHER_DIAGONAL_PROPOSAL;
  return null;
}
