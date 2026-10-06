// Qualitative live Turf status. Never expose exact live coverage or alter scoring.
export function adaptTurfLead(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'live turf lead: ' + label); };
  if (rel === 'src/game/match.js') {
    patch('  teamSummary() {\n    return [0, 1].map((t) => ({\n      color: G.teamHex[t],', `  teamSummary() {
    const coverage = this.mode === 'turf' && this.state === 'playing' && !this.attract ? G.paint?.coverage?.() : null;
    const valid = Array.isArray(coverage) && coverage.length === 2 && coverage.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && coverage[0] + coverage[1] <= 1 + Number.EPSILON * 4;
    const delta = valid ? coverage[0] - coverage[1] : 0;
    // 10 percentage points; the epsilon only absorbs subtraction roundoff.
    const leader = Math.abs(delta) + Number.EPSILON >= 0.1 ? (delta > 0 ? 0 : 1) : -1;
    return [0, 1].map((t) => ({
      color: G.teamHex[t], leading: leader === t, danger: leader >= 0 && leader !== t,`, 'derive team-bound flags from authoritative coverage');
  } else if (rel === 'src/ui/hud.js') {
    patch('  _updSquads(teams) {', `  _setTurfLead(side, state) {
    const squad = this.squads[side], key = 'turfLead' + side;
    if (this._L[key] === state) return;
    this._L[key] = state;
    squad.classList.toggle('is-turf-leading', state === 1);
    squad.classList.toggle('is-turf-danger', state === -1);
    squad.dataset.turfAlert = state === -1 ? tr('Danger!') : '';
  }

  _updSquads(teams) {`, 'independent team presentation state');
    patch('      const ps = (teams[t] && teams[t].players) || [];',
      "      const team = teams[t];\n      this._setTurfLead(t, team?.danger ? -1 : team?.leading ? 1 : 0);\n      const ps = (team && team.players) || [];", 'apply flags after viewer ordering and before player dirty checks');
    patch('  _startMatchHud(match) {',
      '  _startMatchHud(match) {\n    this._setTurfLead(0, 0); this._setTurfLead(1, 0);', 'clear previous match lead at intro');
    patch("if (state === 'finish' || state === 'judge') { this.el.classList.remove('is-live'); this._clearDamageDirs(); }",
      "if (state === 'finish' || state === 'judge') { this._setTurfLead(0, 0); this._setTurfLead(1, 0); this.el.classList.remove('is-live'); this._clearDamageDirs(); }", 'clear completed live status without a later frame');
  } else if (rel === 'styles/hud.css') {
    patch('.iw-squad { display: flex; gap: calc(var(--u) * .45); }', `.iw-squad { position: relative; display: flex; gap: calc(var(--u) * .45); }
/* 1.08 is a local layout emphasis, not a measured Nintendo pixel ratio. */
.iw-squad.is-turf-leading { transform: scale(1.08); }
.iw-squad::after { content: attr(data-turf-alert); display: none; position: absolute; top: calc(100% + var(--u) * 1.5); left: 50%; transform: translateX(-50%); white-space: nowrap; font: 900 var(--fs-s) / 1 'Rubik', 'IW JP Body', sans-serif; color: var(--tc); background: var(--k); padding: .12em .35em; border-radius: .3em; pointer-events: none; }
.iw-squad.is-turf-danger::after { display: block; }`, 'qualitative roster sizing and label');
  } else if (rel === 'src/i18n.js') {
    patch("  'ON': 'ON',", "  'Danger!': 'ピンチ!', 'ON': 'ON',", 'Japanese Danger label');
  }
  return code;
}
