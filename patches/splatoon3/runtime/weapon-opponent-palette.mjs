// Optional weapon-only palette channel. Never reuse Character.enemyColor: that
// field belongs to damage presentation and is mutated by setHurt().
export function opponentPaletteForTeam(colors, team) {
  if (team !== 0 && team !== 1) throw new Error('Opponent weapon palette needs explicit team 0 or 1');
  const color = colors?.[1 - team];
  if (!color?.isColor) throw new Error('Opponent weapon palette is unavailable');
  return color;
}
function weaponOpponentColor(character, colors) {
  const owner = character._owner?.();
  const color = owner ? opponentPaletteForTeam(colors, owner.team) : character.weaponOpponentColor;
  if (!color?.isColor) throw new Error('Opponent weapon palette must be supplied explicitly');
  // getInkMaterial owns this shared cache. Only replace references; do not
  // mutate shared material colors or dispose these materials per character.
  return color;
}
export function weaponOpponentMaterial(character, getInkMaterial, colors) {
  return getInkMaterial(weaponOpponentColor(character, colors));
}
export function bindWeaponOpponentPalette(character, weapon, getInkMaterial, colors) {
  if (!weapon.opponentParts) return;
  const color = weaponOpponentColor(character, colors);
  const cached = weapon._opponentMaterial;
  if (cached && cached.color.r === color.r && cached.color.g === color.g && cached.color.b === color.b) return;
  const material = getInkMaterial(color);
  weapon._opponentMaterial = material;
  for (const part of weapon.opponentParts) part.userData.mesh.material = material;
}
export function syncWeaponOpponentParts(weapon, state) {
  if (!weapon.opponentParts) return;
  const near = state.near !== false;
  for (const part of weapon.opponentParts) {
    const source = weapon.parts[part.userData.followPart];
    if (!source) throw new Error('Opponent weapon part is missing its native animation source');
    part.position.copy(source.position);
    part.quaternion.copy(source.quaternion);
    part.scale.copy(source.scale);
    part.visible = near && source.visible;
  }
}
