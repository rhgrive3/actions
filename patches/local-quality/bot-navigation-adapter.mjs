// Build-only policy changes. Leave the fetched public source and native traversal owners intact.
export function adaptBotNavigation(rel, code, once) {
  if (rel !== 'src/game/bots.js') return code;
  code = "import { botTravelForm, botGoalAllowed, rememberBotGoalFailure } from '../../patches/local-quality/bot-navigation.mjs';\n" + code;
  const patch = (before, after, label) => { code = once(code, before, after, 'bot navigation: ' + label); };
  patch('    this.path = null; this.pi = 0; this.goal = -1;',
    '    this._failedGoals = null; this._combatDirectTarget = null; this._travelProbe = null;\n    this.path = null; this.pi = 0; this.goal = -1;', 'reset policy state');
  patch('      this._wasDead = false;',
    '      this._wasDead = false;\n      this.goalTimer = 0; this.repath = 0; this._failedGoals = null; this._combatDirectTarget = null;', 'resume navigation once after respawn');
  // Actor water death already permits supported dry docks below sea level.
  patch('return gy === -Infinity || gy < PLAYER.fallDeathY;', 'return gy === -Infinity;', 'supported dry dock is walkable');
  patch("    if (this.mode === 'refill' && inkFrac >= this.refillUntil) this.mode = 'paint';",
    "    if (this.mode === 'refill' && inkFrac >= this.refillUntil) { this.mode = 'paint'; this.goalTimer = 0; this.repath = 0; }", 'resume promptly after refill');
  patch("    } else if (this.mode === 'refill') {\n      if (this.repath <= 0 || !this.path) this._pickRefill();",
    "    } else if (this.mode === 'refill') {\n      if (this.repath <= 0) this._pickRefill();", 'refill retry budget');
  patch("    } else if (this.mode === 'retreat') {\n      if (this.repath <= 0 || !this.path) this._pickRetreat();",
    "    } else if (this.mode === 'retreat') {\n      if (this.repath <= 0) this._pickRetreat();", 'retreat retry budget');
  patch('    } else if (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length) {\n      this._pickPaintGoal();',
    '    } else if (this.goalTimer <= 0 || (this.path && this.pi >= this.path.length)) {\n      this._pickPaintGoal();', 'failed paint goal retry budget');
  patch('        const pref = family === \'charger\' ? range * 0.8 : family === \'roller\' ? 0.5 : range * 0.7;\n        if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.5 + Math.random() * 0.5; }\n        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-5 * dt));\n        const nx = dx / Math.max(dist, 0.01), nz = dz / Math.max(dist, 0.01);',
    '        const nx = dx / Math.max(dist, 0.01), nz = dz / Math.max(dist, 0.01);\n        const directCombat = this._combatDirectTarget === this.target && Math.abs(t.pos.y - a.pos.y) < 0.9;\n        if (directCombat) {\n        const pref = family === \'charger\' ? range * 0.8 : family === \'roller\' ? 0.5 : range * 0.7;\n        if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.5 + Math.random() * 0.5; }\n        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-5 * dt));', 'combat follows route to other floors');
  patch('        // fire only when the *actual* aim is on the body',
    '        }\n        // fire only when the *actual* aim is on the body', 'retain ordinary firing decisions');
  patch('    if (best) {\n      if (best !== this.target)',
    `    this._combatDirectTarget = best && Math.abs(best.pos.y - a.pos.y) < 0.9 &&
      best.pos.distanceTo(a.pos) <= Math.max(3, this._range()) &&
      this._fatLos(a.pos.x, a.pos.y, a.pos.z, best.pos.x, best.pos.y, best.pos.z) &&
      this._dryLine(a.pos.x, a.pos.y, a.pos.z, best.pos.x, best.pos.z) ? best : null;
    if (best) {
      if (best !== this.target)`, 'screen direct movement at perception cadence');
  patch('  _pickPaintGoal() {\n    const a = this.a, nav = G.nav;\n    let best = -1, bs = -Infinity;',
    '  _pickPaintGoal() {\n    const a = this.a, nav = G.nav;\n    const choices = [];', 'bounded goal shortlist');
  patch('      if (d > 34) continue;',
    '      if (d > 34 || d < 2.5 || !botGoalAllowed(this, nav, n)) continue;', 'skip reached and recently failed goals');
  patch('      const n = nav.nodes[id];\n      if (n.zone >= 0) continue;',
    '      const n = nav.nodes[id];\n      if (!n) break;\n      if (n.zone >= 0) continue;', 'empty navigation graph');
  patch('      if (score > bs) { bs = score; best = id; }',
    '      choices.push({ id, score });', 'rank candidates');
  patch('      for (const m of mates) if (m.bot.goal >= 0) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 7) score -= 4; }',
    "      for (const m of mates) if (m.alive && m.bot.mode === 'paint' && m.bot.path && m.bot.goal >= 0) { const g = nav.nodes[m.bot.goal]; if (g && Math.abs(g.y - n.y) < 1.2 && Math.hypot(g.x - n.x, g.z - n.z) < 7) score -= 4; }", 'spread around live same-floor goals');
  patch('    if (best < 0) return;\n    const n = nav.nodes[best];\n    this._pathTo(_v3.set(n.x, n.y, n.z), 0.3);',
    `    choices.sort((a, b) => b.score - a.score);
    // Try at most three distinct goals. A one-way drop or isolated height must
    // not trigger sixteen new paint scans on every simulation tick.
    const tried = new Set();
    for (const choice of choices) {
      if (tried.has(choice.id)) continue;
      if (tried.size >= 3) break;
      tried.add(choice.id);
      const n = nav.nodes[choice.id];
      if (this._pathTo(_v3.set(n.x, n.y, n.z), 0.3)) return;
      rememberBotGoalFailure(this, nav, choice.id);
    }
    this.path = null; this.goal = -1;
    this.goalTimer = 0.6 + Math.random() * 0.4;`, 'reachable fallback and bounded retry');
  patch('    if (this.noProg > 2.4) { this.noProg = 0;',
    '    if (this.noProg > 2.4) { rememberBotGoalFailure(this, G.nav, this.goal); this.noProg = 0;', 'avoid repeated stalled destinations');
  patch('&& !this._skipped) { this.pi++;',
    '&& !this._skipped && this._skipWaypointSafe()) { this.pi++;', 'never skip through a wall or across floors');
  patch('  _pickPaintGoal() {',
    `  _skipWaypointSafe() {
    const a = this.a, n = G.nav.nodes[this.path?.[this.pi + 1]];
    return !!n && Math.abs(n.y - a.pos.y) <= 0.4 &&
      this._fatLos(a.pos.x, a.pos.y, a.pos.z, n.x, n.y, n.z) &&
      this._dryLine(a.pos.x, a.pos.y, a.pos.z, n.x, n.z);
  }

  _pickPaintGoal() {`, 'qualify skipped waypoint');
  patch('      if (o === a || !o.alive) continue;\n      const dx = a.pos.x - o.pos.x',
    '      if (o === a || !o.alive || Math.abs(o.pos.y - a.pos.y) > 1.2) continue;\n      const dx = a.pos.x - o.pos.x', 'separate only nearby floors');
  // Run after the jump owner and edge guard, so dry wall admission can use
  // ordinary human jumps and never manufactures painted ownership.
  patch('    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }',
    '    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }\n    botTravelForm(this);', 'surface-aware travel input');
  return code;
}
