export function adaptTidalSlamGauge(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  // The impact clears specialActive before the existing landing recovery ends.
  // Its pending final segment still owns the gauge during that interval.
  code = replaceOnce(code,
    '    if (!this.specialActive && !(this.stormGaugeLock > 0)) {\n      const was = this.specialReady();',
    '    if (!this.specialActive && !(this.stormGaugeLock > 0) && !this.s3TidalSlamGaugeFinish) {\n      const was = this.specialReady();',
    'Tidal Slam pending landing blocks recharge');
  code = replaceOnce(code,
    'specialReady() { return this.special >= this.specialCost() && !this.specialActive && !(this.stormGaugeLock > 0); }',
    'specialReady() { return this.special >= this.specialCost() && !this.specialActive && !(this.stormGaugeLock > 0) && !this.s3TidalSlamGaugeFinish; }',
    'Tidal Slam pending landing blocks reactivation');
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
    '    this.special *= 0.5;\n    this.specialActive = null;\n    this.climbing = false;',
    '    clearTidalSlamGaugeFinish(this);\n    this.special *= 0.5;\n    this.specialActive = null;\n    this.climbing = false;',
    'Tidal Slam interruption clears pending finish');
  code = replaceOnce(code,
    "    this._resolve(false, py, false);\n    if (s.phase === 'fall' && (this.grounded || s.t > 1.2)) {\n      this._slamImpact(sp);\n      this.specialActive = null;",
    "    this._resolve(false, py, false);\n    updateTidalSlamGauge(this, s, sp, dt, G, PLAYER);\n    if (s.phase === 'fall' && (this.grounded || s.t > 1.2)) {\n      completeTidalSlamGauge(this, s);\n      this._slamImpact(sp);\n      this.specialActive = null;\n      queueTidalSlamGaugeFinish(this, s);",
    'Tidal Slam gauge follows actual landing and finishes at the action boundary');
  return code;
}
