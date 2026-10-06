export function adaptTidalSlamGauge(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  code = replaceOnce(code,
    '    this.special = 0;\n    this.stats.specials++;',
    "    if (id !== 'slam') this.special = 0;\n    this.stats.specials++;",
    'Tidal Slam retains its action-owned gauge');
  code = replaceOnce(code,
    "      this.specialActive = { id, t: 0, phase: 'rise', armor: true, startY: this.pos.y };",
    "      this.specialActive = { id, t: 0, phase: 'rise', armor: true, startY: this.pos.y };\n      beginTidalSlamGauge(this, this.specialActive);",
    'Tidal Slam gauge action state');
  code = replaceOnce(code,
    '    const sp = SPECIALS[s.id];',
    '    const sp = SPECIALS[s.id];\n    updateTidalSlamGauge(this, s, sp, dt);',
    'Tidal Slam gauge follows the action clock');
  code = replaceOnce(code,
    "    if (s.phase === 'fall' && (this.grounded || s.t > 1.2)) {\n      this._slamImpact(sp);\n      this.specialActive = null;",
    "    if (s.phase === 'fall' && (this.grounded || s.t > 1.2)) {\n      completeTidalSlamGauge(this, s);\n      this._slamImpact(sp);\n      consumeTidalSlamGauge(this, s);\n      this.specialActive = null;",
    'Tidal Slam consumes its last gauge segment at native impact');
  return code;
}
