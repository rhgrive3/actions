function replaceOnce(code, before, after, label) {
  if (code.split(before).length !== 2) throw new Error('Opponent weapon palette adapter anchor: ' + label);
  return code.replace(before, after);
}
export function adaptWeaponOpponentPalette(rel, code) {
  if (rel === 'src/game/actor.js') {
    return replaceOnce(code, 'new CharacterClass({ color: G.teamColors[team], weapon,',
      'new CharacterClass({ color: G.teamColors[team], weaponOpponentColor: G.teamColors[1 - team], weapon,', 'Actor explicit opposing team');
  }
  if (rel === 'src/game/character.js') {
    code = "import { weaponOpponentMaterial, bindWeaponOpponentPalette } from '../../patches/splatoon3/runtime/weapon-opponent-palette.mjs';\n" + code;
    code = replaceOnce(code, '  constructor(opts = {}) {', "  static requireWeaponOpponentPalette(id, color, preview = false, isLocal = false) {\n    let kind = WEAPONS[id]?.modelKind || WEAPONS[id]?.kind || weaponModelFamily(id);\n    if (!HOLD[kind]) kind = 'shooter';\n    const model = (WEAPONS[id] || HOLD[weaponModelFamily(id)]) ? weaponModelKey(id) : kind;\n    const selected = (isLocal || preview) ? selectedWeaponAppearance(id) : weaponDefaultAppearance(id);\n    const visual = weaponAppearanceKey(model, selected);\n    if (visual !== 'Shelter_Compact_02' || !getWeaponDef(visual).hasOpponentInk) return false;\n    if (!color?.isColor) throw new Error('Explicit opponent palette Color required');\n    return true;\n  }\n\n  constructor(opts = {}) {", 'atomic effective-selection guard');
    code = replaceOnce(code, '    const old = this.weapon;\n    if (old)', "    if (visual === 'Shelter_Compact_02' && getWeaponDef(visual).hasOpponentInk) weaponOpponentMaterial(this, getInkMaterial, G.teamColors);\n    const old = this.weapon;\n    if (old)", 'palette guard before weapon detach');
    code = replaceOnce(code, '  setColor(color) {', "  setWeaponOpponentColor(color) {\n    if (!color?.isColor) throw new Error('Explicit opponent palette Color required');\n    this.weaponOpponentColor = color;\n    for (const key in this.weapons) for (let w = this.weapons[key]; w; w = w.left) if (w.opponentParts) bindWeaponOpponentPalette(this, w, getInkMaterial, G.teamColors);\n  }\n\n  setColor(color) {", 'explicit preview palette setter');
    code = replaceOnce(code, 'this.name = opts.name', 'this.weaponOpponentColor = opts.weaponOpponentColor ?? null;\n    this.name = opts.name', 'separate palette field');
    code = replaceOnce(code, "pd.mat === 'ink' ? getInkMaterial(this.color)", "pd.mat === 'opponentInk' ? weaponOpponentMaterial(this, getInkMaterial, G.teamColors) : pd.mat === 'ink' ? getInkMaterial(this.color)", 'optional part material');
    code = replaceOnce(code, 'const parts = {}, partList = [], lamps = [];', 'const opponentParts = d.hasOpponentInk ? [] : null;\n    const parts = {}, partList = [], lamps = [];', 'optional part list');
    code = replaceOnce(code, 'parts[k] = g; partList.push(g);', "parts[k] = g; partList.push(g);\n      if (pd.mat === 'opponentInk') { g.userData.followPart = pd.followPart; opponentParts.push(g); }", 'optional animated channel');
    code = replaceOnce(code, 'return { def: d, pivot, off, body, ink, bodyFar, inkFar,', 'return { def: d, pivot, off, body, ink, bodyFar, inkFar, opponentParts,', 'instance fields');
    code = replaceOnce(code, '    animateWeapon(w, st);', '    if (w.opponentParts) bindWeaponOpponentPalette(this, w, getInkMaterial, G.teamColors);\n    animateWeapon(w, st);', 'live explicit palette');
    return code;
  }
  if (rel === 'src/game/character-weapons.js') {
    code = "import { syncWeaponOpponentParts } from '../../patches/splatoon3/runtime/weapon-opponent-palette.mjs';\n" + code;
    code = replaceOnce(code, "(p.mat === 'ink' ? ink : body).push(p.src);", "if (p.mat === 'opponentInk') { if (d.modelVariantId !== 'Shelter_Compact_02' || d.modelId !== 's3-shelter-compact') throw new Error('Opponent palette is scoped to Patternz'); if (p.followPart !== 'canopy' || !parts.canopy || !p.pivot.equals(parts.canopy.pivot)) throw new Error('Opponent canopy needs identical native pivot'); d.hasOpponentInk = true; }\n    else (p.mat === 'ink' ? ink : body).push(p.src);", 'scoped disjoint geometry partition');
    code = replaceOnce(code, 'if (w.def.animate && pose.near !== false) w.def.animate(w, pose);', 'if (w.def.animate && pose.near !== false) w.def.animate(w, pose);\n  if (w.opponentParts) syncWeaponOpponentParts(w, pose);', 'native canopy pose followed exactly');
    return code;
  }
  return code;
}
