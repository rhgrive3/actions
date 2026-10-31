// MAP3 objectives often sit behind a different floor. A blocked straight ray
// must not discard a real walking route before BotBrain can request its path.
// This hook qualifies destinations only; pickup, throw and projectile contact
// continue to use the ranked world's real collision and support checks.
export function map3RankedGoalReachable(G, row, target, player) {
  const level = G.level, nav = G.nav, physics = G.physics;
  if (!level?.layout?.map3 || level.native || !nav || !physics || !row ||
    !Array.isArray(target) || target.length < 3 || !target.slice(0, 3).every(Number.isFinite)) return false;
  const actor = G.actors.find(a => String(a.nid ?? `${a.team ?? 0}:${a.slot ?? 0}`) === String(row.id));
  if (!actor?.alive || actor.team !== row.team || !actor.bot || actor.superJumpState || actor.s3?.squidSpawn) return false;
  const point = actor.bot._map3GoalPoint || (actor.bot._map3GoalPoint = actor.pos.clone());
  point.fromArray(target);
  const floor = level.groundHeight(point.x, point.z, point.y + .25);
  if (!Number.isFinite(floor) || Math.abs(floor - point.y) > .3) return false;
  point.y = floor;
  const radius = (player?.s3HumanoidTerrainRadiusRaw && player?.s3TerrainDistanceScale)
    ? player.s3HumanoidTerrainRadiusRaw * player.s3TerrainDistanceScale : player?.radius ?? .35;
  const lift = player?.stepUp ?? .35, height = player?.height ?? 1.45;
  if (!physics.bodyFits(point, radius, lift, height, false)) return false;
  const start = nav.nearest(actor.pos, 1.2), goal = nav.nearest(point, .6), node = nav.nodes[goal];
  if (start < 0 || !node || !nav.valid[goal] || node.zone === 1 - actor.team ||
    Math.abs(node.y - floor) > .35 || Math.hypot(node.x - point.x, node.z - point.z) > 1.2) return false;
  // The final short connection also needs real support and body clearance;
  // nearest-node distance alone can choose the other side of a narrow wall.
  const sample = actor.bot._map3GoalSample || (actor.bot._map3GoalSample = actor.pos.clone());
  const steps = Math.max(1, Math.ceil(Math.hypot(node.x - point.x, node.z - point.z) / .2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sample.set(node.x + (point.x - node.x) * t, node.y + (floor - node.y) * t, node.z + (point.z - node.z) * t);
    const support = level.groundHeight(sample.x, sample.z, sample.y + .25);
    if (!Number.isFinite(support) || Math.abs(support - sample.y) > .3) return false;
    sample.y = support;
    if (!physics.bodyFits(sample, radius, lift, height, false)) return false;
  }
  const previous = actor.bot._map3GoalRoutes;
  const cache = previous?.nav === nav && previous.start === start && previous.team === actor.team
    ? previous : { nav, start, team: actor.team, results: new Map() };
  actor.bot._map3GoalRoutes = cache;
  if (cache.results.has(goal)) return cache.results.get(goal);
  const path = nav.path(start, goal, actor.team);
  const reachable = !!path && path.every((id, i) => nav.valid[id] &&
    (i === 0 || nav.nodes[path[i - 1]].nb.some(edge => edge.to === id)));
  cache.results.set(goal, reachable);
  return reachable;
}
