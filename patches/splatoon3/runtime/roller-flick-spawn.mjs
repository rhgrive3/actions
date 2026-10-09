// S3 11.3.0 Roller launch groups. Reference spatial records are kept in
// profile.json. The explicit worldScale is an INKWAVE calibration setting,
// NOT a claim that Nintendo's raw position units equal INKWAVE world units.
function finitePositive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
export function flickSpawnDisplacement(w, vertical, index, total, random = Math.random) {
  if (!Number.isSafeInteger(index) || index < 0 || total < 1 || index >= total) throw RangeError('roller flick index');
  if (!vertical) {
    const cfg = w.horizontalSpawn;
    if (!cfg) return { lateral: 0, height: 0, forward: 0 };
    const scale = finitePositive(cfg.worldScale, 1);
    const width = Number.isFinite(cfg.width) ? cfg.width : 0;
    const jitter = Number.isFinite(cfg.randomCube) && cfg.randomCube >= 0 ? cfg.randomCube : 0;
    const t = total > 1 ? (2 * index / (total - 1) - 1) : 0;
    return {
      lateral: (t * width + (random() - 0.5) * jitter) * scale,
      height: (random() - 0.5) * jitter * scale,
      forward: (random() - 0.5) * jitter * scale,
    };
  }
  const cfg = w.verticalSpawn, groups = cfg?.groups;
  if (!Array.isArray(groups) || !groups.length) return { lateral: 0, height: 0, forward: 0 };
  let ordinal = index, group = groups.at(-1);
  for (const g of groups) {
    if (ordinal < g.count) { group = g; break; }
    ordinal -= g.count;
  }
  const scale = finitePositive(cfg.worldScale, 1);
  // Sourced Height and OffsetHeight remain distinct: Height controls the
  // per-unit vertical band; OffsetHeight positions the group's center.
  const span = group.count > 1 ? (2 * ordinal / (group.count - 1) - 1) : 0;
  return {
    lateral: 0,
    height: ((group.offsetHeight || 0) + span * (group.height || 0) * 0.5) * scale,
    forward: 0,
  };
}

export function adjustFlickSpawnPosition(p, actor, w, ordinal) {
  const vertical = !!actor?.weaponRunner?.s3FlickVertical;
  const v = flickSpawnDisplacement(w, vertical, ordinal, w.flickDrops);
  const yaw = actor.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  p.pos.x += rx * v.lateral + fx * v.forward;
  p.pos.y += v.height;
  p.pos.z += rz * v.lateral + fz * v.forward;
  p.prev.copy(p.pos);
  p.start.copy(p.pos);
}
