function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw new Error(`INKWAVE Storm conflict: ${label}`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptStormEffects(rel, code) {
  if (rel === 'src/game/actor.js') {
    code = once(code, '  update(dt) {\n    this.anim.time = G.time;', '  update(dt) {\n    advanceStormLock(this, dt);\n    this.anim.time = G.time;', 'actor-owned lock clock');
    code = once(code, '    const intent = this.intent;', '    const stormHolding = isStormHolding(this);\n    const intent = stormHolding ? { ...this.intent, fire: false, sub: false, special: false } : this.intent;', 'held-device main/sub admission');
    code = once(code, '    if (this.specialActive) { this._updateSpecial(dt); this._finishFrame(dt); return; }', '    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { this._updateSpecial(dt); this._finishFrame(dt); return; }', 'held-device movement ownership');
    code = once(code, "      this.specialActive = { id, t: 0, phase: 'throw', armor: false };\n      this.character.trigger('throw');\n      G.projectiles.throwStorm(this);", '      startStormHold(this);', 'explicit Storm throw');
    code = once(code, '    if (!this.specialActive) {\n      const was = this.specialReady();', '    if (!this.specialActive && !(this.stormGaugeLock > 0)) {\n      const was = this.specialReady();', 'special gauge refill lock');
    code = once(code, 'specialReady() { return this.special >= this.specialCost() && !this.specialActive; }', 'specialReady() { return this.special >= this.specialCost() && !this.specialActive && !(this.stormGaugeLock > 0); }', 'locked special admission');
    code = once(code, '    this.weaponRunner.update(dt, { fire, firePressed: pressed, sub: intent.sub && !isSquid, subReleased: subReleased && !isSquid });', '    if (!isStormHolding(this)) this.weaponRunner.update(dt, { fire, firePressed: pressed, sub: intent.sub && !isSquid, subReleased: subReleased && !isSquid });', 'held-device runner ownership');
    code = once(code, 'a.subAim = !!this.weaponRunner.aimingSub;', 'a.subAim = !!this.weaponRunner.aimingSub || isStormHolding(this);', 'held-device pose');
    return "import { isStormHolding, startStormHold, updateStormHold, advanceStormLock } from '../../patches/splatoon3/runtime/storm-effects.mjs';\n" + code;
  }
  if (rel === 'src/game/bots.js') {
    code = once(code, '    // ---------------- aim: critically-damped spring', "    if (a.specialActive?.id === 'storm' && a.specialActive.phase === 'hold') {\n      it.sub = !a.specialActive.botSubPressed; a.specialActive.botSubPressed = true;\n      it.fire = it.special = false;\n    }\n\n    // ---------------- aim: critically-damped spring", 'bot explicit throw input');
    return code;
  }
  if (rel === 'src/net/netmatch.js') {
    code = once(code, '  if (wr.aimingSub) f |= F.subAim;', "  if (wr.aimingSub || a.specialActive?.id === 'storm' && a.specialActive.phase === 'hold') f |= F.subAim;", 'remote held-device pose');
    return once(code, "    a.specialActive = f & F.special ? (a.specialActive || { id: a.weapon.special, net: true }) : null;", "    a.specialActive = f & F.special ? (a.specialActive || { id: a.weapon.special, net: true }) : null;\n    if (a.specialActive?.id === 'storm') a.specialActive.phase = f & F.subAim ? 'hold' : 'throw';", 'remote held-device phase');
  }
  if (rel === 'src/game/weapons.js') {
    code = once(code, '  _updateClouds(dt) {\n    const sp = SPECIALS.storm;', '  _updateClouds(dt) {\n    const rainHits = new Map();\n    const sp = SPECIALS.storm;', 'rain damage arbitration');
    code = once(code, "          const killed = e.damage(sp.dps * dt, c.owner, 'storm');\n          if (killed) emit('hit', { attacker: c.owner, victim: e, damage: 0, killed: true, weaponId: 'storm' });", '          collectStormHit(rainHits, e, c, sp.dps * dt);', 'non-stacking rain damage');
    code = once(code, "      if (c.t >= c.dur) { emit('storm:end', { pos: c.group.position.clone(), team: c.team, actor: c.owner }); this._releaseCloud(c, 0.3); this.clouds.splice(i, 1); }\n    }\n  }", "      if (c.t >= c.dur) { emit('storm:end', { pos: c.group.position.clone(), team: c.team, actor: c.owner }); this._releaseCloud(c, 0.3); this.clouds.splice(i, 1); }\n    }\n    applyStormHits(rainHits, emit);\n  }", 'one rain hit per actor tick');
    return "import { collectStormHit, applyStormHits } from '../../patches/splatoon3/runtime/storm-effects.mjs';\n" + code;
  }
  return code;
}
