// #919 uses the accepted local/remote special:use event. NetMatch already emits
// this event after its owner/replay checks; no second forwarding path is added.
// Reuse the native feed's icon, stacking and expiry owners. Its presentation
// duration is an INKWAVE convention, not a claimed Splatoon timing calibration.
export function adaptTeamSpecialSignal(rel, code, once) {
  if (rel === 'styles/mobile.css') return code + '\n/* #919: every concurrent team-special signal remains visible in the native feed. */\nhtml.iw-touch-ui .iw-hud .iw-feed .iw-feed__item[data-team-special] { display: flex; }\n';
  if (rel !== 'src/ui/hud.js') return code;
  const patch = (before, after, label) => { code = once(code, before, after, 'team special signal: ' + label); };
  patch("  feed({ text = '', color = '#ffffff', kind = 'info' } = {}) {",
    "  feed({ text = '', color = '#ffffff', kind = 'info', specialId = null } = {}) {", 'native feed icon input');
  patch("    const icon = kind === 'kill' ? SPLAT_ICON : kind === 'death' ? DEATH_ICON : kind === 'ally' ? SQUID : GLYPHS.drop;",
    "    const icon = specialId && Object.hasOwn(SPECIALS, specialId) ? specialIcon(specialId) : kind === 'kill' ? SPLAT_ICON : kind === 'death' ? DEATH_ICON : kind === 'ally' ? SQUID : GLYPHS.drop;", 'activated special icon');
  patch("    colorVars(el, 'c', toHex(color, '#ffffff'));\n    this.feedEl.prepend(el);",
    "    colorVars(el, 'c', toHex(color, '#ffffff'));\n    if (specialId && Object.hasOwn(SPECIALS, specialId)) el.dataset.teamSpecial = specialId;\n    this.feedEl.prepend(el);", 'scalar signal identity');
  patch('  _bindBus() {\n    this._unsubs = [', `  _teamSpecialUse(actor, id) {
    const match = G.match, local = match?.local;
    if (!this._visible || !this._live() || match?.state !== 'playing' || match.paused || !local ||
        !actor || actor === local || actor.isLocal || actor.team !== local.team ||
        !match.actors?.includes(actor) || typeof id !== 'string' || !Object.hasOwn(SPECIALS, id)) return;
    this.feed({ kind: 'ally', color: G.teamHex[actor.team],
      text: (actor.name || '') + ' · ' + tr(SPECIALS[id].name), specialId: id });
  }

  _clearTeamSpecialSignals() {
    for (const el of this.feedEl?.querySelectorAll('[data-team-special]') || []) {
      clearTimeout(el._t); el.remove();
    }
  }

  _bindBus() {
    this._unsubs = [
      on('special:use', ({ actor, id }) => this._teamSpecialUse(actor, id)),
      on('match:state', ({ match, state }) => { if (match === G.match && state !== 'playing') this._clearTeamSpecialSignals(); }),
      on('match:dispose', ({ match }) => { if (match === G.match) this._clearTeamSpecialSignals(); }),`, 'accepted event and current Match retirement');
  patch('  setVisible(v) {', '  setVisible(v) {\n    if (!v) this._clearTeamSpecialSignals();', 'hidden HUD retirement');
  patch('  dispose() {', '  dispose() {\n    this._clearTeamSpecialSignals();', 'disposed HUD retirement');
  return code;
}
