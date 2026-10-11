// Page-lifetime UI must not own Actors after their Match is disposed.
// No input, jump admission, match timing, or projectile gameplay is changed.
export function adaptUiActorLifetime(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'UI actor lifetime: ' + label); };
  if (rel === 'src/game/match.js') {
    patch('  dispose() {\n', `  dispose() {
    G.hud?.releaseMatchActors?.(this.actors, this);
    G.game?.diorama?.releaseMatchActors?.(this.actors, this);
`, 'release only the retiring roster before teardown');
  }
  if (rel === 'src/ui/hud.js') {
    patch('  _startMatchHud(match) {', `  releaseMatchActors(actors, match) {
    if (match && this._actorRefsMatch && this._actorRefsMatch !== match) return;
    const all = !!match && this._actorRefsMatch === match;
    if (all) this._actorRefsMatch = null;
    if (!all && !actors?.length) return;
    actors = actors || [];
    if (all || actors.includes(this._byNameA) || (this._byName && [...this._byName.values()].some(a => actors.includes(a)))) {
      this._byName?.clear(); this._byName = null; this._byNameA = null; this._byNameN = 0;
    }
    const kills = this._kills;
    if (kills) {
      for (const map of [kills.dealt, kills.perActor]) if (map) { if (all) map.clear(); else for (const actor of map.keys()) if (actors.includes(actor)) map.delete(actor); }
      if (all || actors.includes(kills.lastKiller)) kills.lastKiller = null;
    }
  }

  _startMatchHud(match) {
    this._actorRefsMatch = match;`, 'release marker and combat references without touching another Match');
    patch('    const actors = this._actors();\n    if (!byName', '    const actors = this._actors();\n    if (!this.lab) this._actorRefsMatch = G.match;\n    if (!byName', 'bind actor cache to its live Match');
  }
  if (rel === 'src/ui/diorama.js') {
    patch('  update(dt, k) {', `  releaseMatchActors(actors = null, match) {
    // Pending contacts are UI owners too. Retire the matching input lifetime
    // even when newer pins have already taken over the displayed Match.
    if (this._pinTaps) for (const [id, tap] of this._pinTaps) {
      if (match ? tap.match === match : !actors || actors.includes(tap.actor) || actors.includes(tap.target))
        this._pinTaps.delete(id);
    }
    if (match && this._targetMatch && this._targetMatch !== match) return;
    if (match && this._targetMatch === match) actors = null;
    if (!actors) this._targetMatch = null;
    let cleared = false;
    for (const pin of this.pins) if (!actors || (pin.target && actors.includes(pin.target))) {
      pin.target = null; pin.ok = false; pin.vis = false; pin.key = '';
      pin.el.style.display = 'none'; cleared = true;
    }
    if (cleared) { this.hover = -1; this.hasCursor = false; this._last.arc = false; this.arc.classList.remove('is-on'); }
  }

  update(dt, k) {`, 'pin lifetime owner');
    patch('    if (!this.on) return;', '    if (!this.on) { this.releaseMatchActors(); return; }', 'closed map drops targets even without further live HUD ticks');
    patch('    if (!me || !cam) return;', '    if (!me || !cam) { this.releaseMatchActors(); return; }', 'missing live owner drops targets');
    patch('    const allies = (G.actors || []).filter', '    this._targetMatch = G.match;\n    const allies = (G.actors || []).filter', 'bind pins to the Match whose roster was displayed');
    patch('  _jump(i, me) {\n    const p = this.pins[i];', `  _jump(i, me) {
    const p = this.pins[i];
    if (!me || !this.on || this.k < 0.7 || !p || me !== G.match?.local || G.match?.attract ||
        (i < 3 && (!p.target || !G.actors?.includes(p.target) || p.target === me || p.target.team !== me.team))) return;`, 'reject a retired pin before calling the native jump owner');
  }
  if (rel === 'src/game/minimap.js') {
    patch('const fxList = [];', `const fxList = [];
// Scalar identity preserves landing correlation without retaining the Actor.
const jumpActorIds = new WeakMap(); let nextJumpActorId = 0;
function jumpActorId(actor) {
  let id = jumpActorIds.get(actor);
  if (!id) { id = ++nextJumpActorId; jumpActorIds.set(actor, id); }
  return id;
}`, 'weak Actor identity for transient jump markers');
    patch("pushFx({ kind: 'jump', x: to.x, z: to.z, team: actor.team, actor, t: 0, life: 3 })", "pushFx({ kind: 'jump', x: to.x, z: to.z, team: actor.team, actorId: jumpActorId(actor), t: 0, life: 3 })", 'jump effect stores scalar token only');
    patch("f.kind === 'jump' && f.actor === actor", "f.kind === 'jump' && f.actorId === jumpActorIds.get(actor)", 'landing shortens only the matching Actor effects');
  }
  return code;
}
