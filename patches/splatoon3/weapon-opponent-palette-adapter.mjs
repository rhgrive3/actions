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
    code = "import { weaponOpponentMaterial, bindWeaponOpponentPalette } from '../../../patches/splatoon3/runtime/weapon-opponent-palette.mjs';\n" + code;
    code = replaceOnce(code, 'this.name = opts.name', 'this.weaponOpponentColor = opts.weaponOpponentColor ?? null;\n    this.name = opts.name', 'separate palette field');
    code = replaceOnce(code, "pd.mat === 'ink' ? getInkMaterial(this.color)", "pd.mat === 'opponentInk' ? weaponOpponentMaterial(this, getInkMaterial, G.teamColors) : pd.mat === 'ink' ? getInkMaterial(this.color)", 'optional part material');
    code = replaceOnce(code, 'const parts = {}, partList = [], lamps = [];', 'const opponentParts = d.hasOpponentInk ? [] : null;\n    const parts = {}, partList = [], lamps = [];', 'optional part list');
    code = replaceOnce(code, 'parts[k] = g; partList.push(g);', "parts[k] = g; partList.push(g);\n      if (pd.mat === 'opponentInk') { g.userData.followPart = pd.followPart; opponentParts.push(g); }", 'optional animated channel');
    code = replaceOnce(code, 'return { def: d, pivot, off, body, ink, bodyFar, inkFar,', 'return { def: d, pivot, off, body, ink, bodyFar, inkFar, opponentParts,', 'instance fields');
    code = replaceOnce(code, '    animateWeapon(w, st);', '    if (w.opponentParts) bindWeaponOpponentPalette(this, w, getInkMaterial, G.teamColors);\n    animateWeapon(w, st);', 'live explicit palette');
    return code;
  }
  if (rel === 'src/game/character-weapons.js') {
    code = "import { syncWeaponOpponentParts } from '../../../patches/splatoon3/runtime/weapon-opponent-palette.mjs';\n" + code;
    code = replaceOnce(code, "(p.mat === 'ink' ? ink : body).push(p.src);", "if (p.mat === 'opponentInk') { if (d.modelVariantId !== 'Shelter_Compact_02' || d.kind !== 'brella') throw new Error('Opponent palette is scoped to Patternz'); d.hasOpponentInk = true; }\n    else (p.mat === 'ink' ? ink : body).push(p.src);", 'scoped disjoint geometry partition');
    code = replaceOnce(code, 'if (w.def.animate && pose.near !== false) w.def.animate(w, pose);', 'if (w.def.animate && pose.near !== false) w.def.animate(w, pose);\n  if (w.opponentParts) syncWeaponOpponentParts(w, pose);', 'native canopy pose followed exactly');
    return code;
  }
  return code;
}
