export function adaptTidalSlamGauge(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  code = replaceOnce(code,
    '    this.special = 0;\n    this.stats.specials++;',
    "    if (id !== 'slam') this.special = 0;\n    this.stats.specials++;",
    'Tidal Slam retains its action-owned gauge');
  code = replaceOnce(code,
    '      this.vel.set(this.vel.x * 0.3, 11.5, this.vel.z * 0.3);',
    '      this.vel.set(this.vel.x * 0.3, 11.5, this.vel.z * 0.3);\n      beginTidalSlamGauge(this, this.specialActive);',
    'Tidal Slam gauge action state');
  code = replaceOnce(code,
    '    this.anim.time = G.time;',
    '    this.anim.time = G.time;\n    finishTidalSlamGauge(this);',
    'Tidal Slam final segment action boundary');
  code = replaceOnce(code,
    '    this.specialActive = null;   // { id, t, phase }',
    '    this.specialActive = null;   // { id, t, phase }\n    clearTidalSlamGaugeFinish(this);',
    'Tidal Slam reset clears pending finish');
  code = replaceOnce(code,
    '    this.specialActive = null;\n    this.climbing = false;',
    '    this.specialActive = null;\n    clearTidalSlamGaugeFinish(this);\n    this.climbing = false;',
    'Tidal Slam interruption clears pending finish');
  code = replaceOnce(code,
    "    this._resolve(false, py, false);\n    if (s.phase === 'fall' && (this.grounded || s.t > 1.2)) {\n      this._slamImpact(sp);\n      this.specialActive = null;",
    "    this._resolve(false, py, false);\n    updateTidalSlamGauge(this, s, sp, dt, G, PLAYER);\n    if (s.phase === 'fall' && (this.grounded || s.t > 1.2)) {\n      completeTidalSlamGauge(this, s);\n      this._slamImpact(sp);\n      this.specialActive = null;\n      queueTidalSlamGaugeFinish(this, s);",
    'Tidal Slam gauge follows actual landing and finishes at the action boundary');
  return code;
}
