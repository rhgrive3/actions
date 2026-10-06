// Mutable synchronous HUD transport, owned by one Match/Game. No actor references
// are retained in snapshot values; removed actors are weak keys only.
export function teamHudSnapshot(match, colors, viewerTeam = 0) {
  let cache = match._teamHudSnapshot;
  if (!cache) {
    const a = { color: '', players: [] }, b = { color: '', players: [] };
    cache = match._teamHudSnapshot = { teams: [a, b], forward: [a, b], reverse: [b, a], players: new WeakMap() };
  }
  const t0 = cache.teams[0], t1 = cache.teams[1];
  t0.color = colors[0]; t1.color = colors[1];
  let n0 = 0, n1 = 0;
  for (let i = 0; i < match.actors.length; i++) {
    const a = match.actors[i];
    if (a.team !== 0 && a.team !== 1) continue;
    let p = cache.players.get(a);
    if (!p) { p = {}; cache.players.set(a, p); }
    p.name = a.name; p.weapon = a.weaponId; p.alive = a.alive;
    p.respawn = a.alive ? 0 : Math.max(0, a.respawnTimer);
    p.specialReady = a.specialReady(); p.isSelf = a.isLocal;
    if (a.team === 0) t0.players[n0++] = p; else t1.players[n1++] = p;
  }
  t0.players.length = n0; t1.players.length = n1;
  return viewerTeam === 1 ? cache.reverse : cache.forward;
}
export function hudFrameSnapshot(game, m, a, w, spread, players, markers, prompt, showMinimap, PLAYER, SUB, subCost = SUB.bomb.inkCost, guide) {
  let cache = game._hudTransport;
  if (!cache) cache = game._hudTransport = { frame: {}, crosshair: {}, map: {}, mobile: {} };
  const frame = cache.frame, crosshair = cache.crosshair, map = cache.map;
  frame.time = m.time; frame.teams = m.teamSummary(a.team);
  frame.ink = a.ink / PLAYER.inkMax; frame.inkLow = a.ink < 18 || game._lowInkFlash > 0; frame.subCost = subCost / PLAYER.inkMax; frame.subReady = a.ink >= subCost;
  frame.special = a.specialFrac(); frame.specialReady = a.specialReady(); frame.specialActive = !!a.specialActive;
  frame.hp = a.hp / PLAYER.hp; frame.weapon = a.weaponId; frame.charge = a.weaponRunner.charge;
  crosshair.spread = spread; crosshair.onTarget = m.controller?.onTarget ? 'enemy' : null; crosshair.inRange = m.controller ? m.controller.inRange !== false : true;
  if (guide === undefined) delete crosshair.guide; else crosshair.guide = guide;
  frame.crosshair = crosshair;
  map.canvas = showMinimap ? game.minimap.canvas : null; map.expanded = false; map.players = players;
  frame.map = showMinimap ? map : null; frame.markers = markers; frame.prompt = prompt; frame.fps = game.settings.showFps ? game.fps : undefined;
  const mobile = cache.mobile;
  mobile.special = frame.special; mobile.ready = frame.specialReady; mobile.activeSp = frame.specialActive; mobile.weapon = w.kind || a.weaponId;
  mobile.specialId = w.special; mobile.ink = frame.ink; mobile.subCost = frame.subCost; mobile.subReady = frame.subReady;
  return frame;
}
