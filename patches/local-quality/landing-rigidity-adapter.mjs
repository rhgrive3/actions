// Landings already have pelvis, limb, head and equipment-anchor springs.
// Keep those responses without stretching the rigid weapon's parent hierarchy.
// Other actions retain their native squash spring and form scale.
export function adaptLandingRigidity(rel, code) {
  if (rel !== 'src/game/character.js') return code;
  const before = 'sp[S_PELY + 1] -= 3.0 * a; sp[S_SQ + 1] -= 3.6 * a; sp[S_LEANP + 1] += 2.2 * a; sp[S_HEADP + 1] += 3.5 * a;';
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0)
    throw new Error('INKWAVE quality patch conflict (landing rigidity): expected exactly one connection');
  return code.slice(0, at) + before.replace('sp[S_SQ + 1] -= 3.6 * a; ', '') + code.slice(at + before.length);
}
