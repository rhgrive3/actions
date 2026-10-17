// Build-only explicit palette forwarding. Effective channel guards are owned by
// Character so preview selection and setWeapon cannot silently disagree.
function replace(code, before, after, count, label) {
  if (code.split(before).length - 1 !== count) throw new Error('Opponent preview anchor: ' + label);
  return code.split(before).join(after);
}
export function adaptWeaponOpponentPreview(rel, code) {
  const patch = (before, after, label, count = 1) => { code = replace(code, before, after, count, label); };
  if (rel === 'src/main.js') {
    patch('self.showcase.showLoadout(weapon, G.teamColors[0], self.profile.style)', 'self.showcase.showLoadout(weapon, G.teamColors[0], self.profile.style, G.teamColors[1])', 'equipment live preview');
    patch("this.showcase.showLoadout(this.profile.weapon || 'shooter', G.teamColors[0], this.profile.style)", "this.showcase.showLoadout(this.profile.weapon || 'shooter', G.teamColors[0], this.profile.style, G.teamColors[1])", 'loadout entry');
  }
  if (rel === 'src/ui/menus.js') {
    patch('sc.portrait({ style: look, color: a, kind, size, weapon:', 'sc.portrait({ style: look, color: a, weaponOpponentColor: G.teamColors?.[1], kind, size, weapon:', 'menu portrait palette');
    patch('sc.portrait({ style: tileStyle(t), color: col, kind:', 'sc.portrait({ style: tileStyle(t), color: col, weaponOpponentColor: G.teamColors?.[1], kind:', 'locker portrait palette');
    patch('sc.showLocker(style, teamColor(), this._loadout().weapon)', 'sc.showLocker(style, teamColor(), this._loadout().weapon, G.teamColors?.[1])', 'locker entry');
    patch('sc.showHub(this._style(), (G.teamColors && G.teamColors[0]) || this._accent()[0], this._loadout().weapon)', 'sc.showHub(this._style(), (G.teamColors && G.teamColors[0]) || this._accent()[0], this._loadout().weapon, G.teamColors?.[1])', 'hub entry');
  }
  if (rel !== 'src/game/showcase.js') return code;
  patch("showLoadout(weapon, color, style) { this._showPedestal('loadout', weapon, color, style); }", "showLoadout(weapon, color, style, weaponOpponentColor) { this._showPedestal('loadout', weapon, color, style, weaponOpponentColor); }", 'loadout API');
  patch("showLocker(style, color, weapon) { this._showPedestal('locker', weapon || this.weapon || G.game?.profile?.weapon || 'shooter', color, style); }", "showLocker(style, color, weapon, weaponOpponentColor) { this._showPedestal('locker', weapon || this.weapon || G.game?.profile?.weapon || 'shooter', color, style, weaponOpponentColor); }", 'locker API');
  patch("showHub(style, color, weapon) { this._showPedestal('hub', weapon || this.weapon || G.game?.profile?.weapon || 'shooter', color, style); }", "showHub(style, color, weapon, weaponOpponentColor) { this._showPedestal('hub', weapon || this.weapon || G.game?.profile?.weapon || 'shooter', color, style, weaponOpponentColor); }", 'legacy shadowed hub API');
  patch('  _showPedestal(mode, weapon, color, style) {', `  _showPedestal(mode, weapon, color, style, weaponOpponentColor) {
    this.CharacterClass.requireWeaponOpponentPalette(weapon, weaponOpponentColor, true);
    this.weaponOpponentColor = weaponOpponentColor ?? null;`, 'pedestal guard before clear or resume');
  patch('new this.CharacterClass({ color: color.clone(), weapon, style:', 'new this.CharacterClass({ color: color.clone(), weaponOpponentColor, weapon, style:', 'pedestal constructor');
  patch('    c.setColor(color);', '    if (weaponOpponentColor?.isColor) c.setWeaponOpponentColor(weaponOpponentColor);\n    c.setColor(color);', 'pedestal recolor');
  patch("  _swapChar(style, dance = 'lobby_pose') {", "  _swapChar(style, dance = 'lobby_pose') {\n    this.CharacterClass.requireWeaponOpponentPalette(this.weapon || 'shooter', this.weaponOpponentColor, true);", 'replacement preview guard');
  patch("new this.CharacterClass({ color: this.color.clone(), weapon: this.weapon || 'shooter',", "new this.CharacterClass({ color: this.color.clone(), weaponOpponentColor: this.weaponOpponentColor, weapon: this.weapon || 'shooter',", 'replacement preview palette');
  patch('  showResults(team, won, color, styles) {', `  showResults(team, won, color, styles) {
    const weaponOpponentColor = team === 0 || team === 1 ? G.teamColors?.[1 - team] : null;
    for (const style of styles) this.CharacterClass.requireWeaponOpponentPalette(style.weapon, weaponOpponentColor);`, 'results explicit team guard before clear');
  patch('new this.CharacterClass({ color: color.clone(), weapon: st.weapon,', 'new this.CharacterClass({ color: color.clone(), weaponOpponentColor, weapon: st.weapon,', 'results constructor');
  patch('  showHub(style, color, weapon) {\n    const L = this._lobEnsure();', `  showHub(style, color, weapon, weaponOpponentColor) {
    const opponent = this.lob?.room ? this._lobRowColor(1) : weaponOpponentColor ?? G.teamColors?.[1];
    this.CharacterClass.requireWeaponOpponentPalette(weapon || G.game?.profile?.weapon || 'shooter', opponent);
    const L = this._lobEnsure();`, 'active hub guard before ensure');
  patch('      const rv = G.teamColors && G.teamColors[1];', '      const rv = opponent;', 'hub explicit opponent copy');
  patch('  showLobby(players, colors, opts = {}) {', `  _requireLobbyOpponentPalette(players, colors) {
    for (const player of Array.isArray(players) ? players : []) if (player && player.id != null) {
      const team = player.team === 1 ? 1 : 0;
      const supplied = colors?.[1 - team] ?? this.lob?.colors?.[1 - team];
      const color = supplied == null || supplied.isColor ? supplied : new THREE.Color(supplied);
      this.CharacterClass.requireWeaponOpponentPalette(weaponKind(player.weapon), color);
    }
  }

  showLobby(players, colors, opts = {}) {
    this._requireLobbyOpponentPalette(players, colors);`, 'lobby guard before ensure');
  patch('    if (!L || !L.room) return;\n    let palette = false;', '    if (!L || !L.room) return;\n    this._requireLobbyOpponentPalette(players, colors);\n    let palette = false;', 'lobby update guard before palette or member changes');
  patch("  _lobChange(M, weapon, style, ready, skey = styleKey(style)) {", "  _lobChange(M, weapon, style, ready, skey = styleKey(style)) {\n    this.CharacterClass.requireWeaponOpponentPalette(weaponKind(weapon || M.weapon), this._lobRowColor(1 - M.team));", 'member change guard');
  patch('if (kids) for (const M of L.members.values()) if (M.c && !M.dead) M.c.setColor(this._lobRowColor(M.team));', 'if (kids) for (const M of L.members.values()) if (M.c && !M.dead) { M.c.setWeaponOpponentColor(this._lobRowColor(1 - M.team)); M.c.setColor(this._lobRowColor(M.team)); }', 'lobby palette recolor');
  patch('    M.c.setColor(this._lobRowColor(M.team));', '    M.c.setWeaponOpponentColor(this._lobRowColor(1 - M.team));\n    M.c.setColor(this._lobRowColor(M.team));', 'lobby side swap');
  patch('    c.setColor(this._lobRowColor(M.team));', '    c.setWeaponOpponentColor(this._lobRowColor(1 - M.team));\n    c.setColor(this._lobRowColor(M.team));', 'lobby arrival palette');
  patch('new this.CharacterClass({ color: this._lobRowColor(M.team).clone(), weapon:', 'new this.CharacterClass({ color: this._lobRowColor(M.team).clone(), weaponOpponentColor: this._lobRowColor(1 - M.team), weapon:', 'lobby constructors', 2);
  patch('  portrait(req, cb) {\n    const key =', `  portrait(req, cb) {
    const opponentChannel = this.CharacterClass.requireWeaponOpponentPalette(req.weapon || 'shooter', req.weaponOpponentColor);
    if (opponentChannel) req = { ...req, color: new THREE.Color(req.color || this.color), weaponOpponentColor: req.weaponOpponentColor.clone() };
    let key =`, 'target-only queue palette snapshots');
  patch('    const hit = this._pcache.get(key);', "    if (opponentChannel) key += '|opponent:' + req.weaponOpponentColor.getHexString();\n    const hit = this._pcache.get(key);", 'target-only opponent cache key');
  patch('  _renderPortrait(req) {', "  _renderPortrait(req) {\n    this.CharacterClass.requireWeaponOpponentPalette(req.weapon || 'shooter', req.weaponOpponentColor);", 'portrait guard before render-target setup');
  patch('  _renderPortraitRun(req, S, kind, r) {', "  _renderPortraitRun(req, S, kind, r) {\n    this.CharacterClass.requireWeaponOpponentPalette(req.weapon || 'shooter', req.weaponOpponentColor);", 'portrait guard before scene visibility changes');
  patch("new this.CharacterClass({ color: col.clone(), weapon: req.weapon || 'shooter',", "new this.CharacterClass({ color: col.clone(), weaponOpponentColor: req.weaponOpponentColor, weapon: req.weapon || 'shooter',", 'portrait constructor');
  return code;
}
