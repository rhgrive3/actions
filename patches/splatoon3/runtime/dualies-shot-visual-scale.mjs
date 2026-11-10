// Owner request 2026-11-10 (visual only): the Dualies' main-weapon ink — the
// flying shot body, its muzzle droplets/beads and the falling drops it sheds —
// is drawn at 60% of its former size. Paint radius, hit size, damage, travel,
// drop count and network payload are unchanged. INKWAVE presentation choice,
// not a Splatoon 3 measurement.
export const DUALIES_SHOT_VISUAL_SCALE = 0.6;
export function projectileFamily(p) {
  if (!p) return null;
  const w = p.s3Weapon || p.owner?.weapon;
  return p.catalog?.r?.family ?? (w?.kind === 'catalog' ? w.catalogRecord?.family : w?.behaviorKind || w?.kind) ?? p.wid ?? null;
}
// Main-weapon Dualies shots only: never sub/special rounds.
export function dualiesShotVisualScale(p) {
  return p && !p.s3SpecialWeapon && p.type === 'shot' && projectileFamily(p) === 'dualies' ? DUALIES_SHOT_VISUAL_SCALE : 1;
}
