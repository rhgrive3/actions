/** Issue #978: source-driven Bucket Slosher NearestParam foot paint.
 *
 * The pinned S3 source defines a paint-only release stamp with
 * PaintWidthHalf/PaintDepthScale and zero player collision radii.  SpawnOffset
 * exists too, but its actor-local axis mapping is not verified by the supplied
 * references, so this module intentionally leaves the center unshifted rather
 * than guessing an orientation.
 */
const EPS = 1e-10;

export function slosherNearestPaintSpec(source, scale = 1) {
  const nearest = source?.NearestParam;
  const paint = nearest?.DrawSizeCollisionPaintParam;
  const collision = paint?.CollisionParam;
  if (!nearest || !paint || !collision || !Number.isFinite(scale) || !(scale > 0) ||
      !Number.isFinite(paint.PaintWidthHalf) || !(paint.PaintWidthHalf > 0) ||
      !Number.isFinite(paint.PaintDepthScale) || !(paint.PaintDepthScale > 0) ||
      collision.InitRadiusForPlayer !== 0 || collision.EndRadiusForPlayer !== 0)
    throw new RangeError('Unsupported Slosher NearestParam source');
  return Object.freeze({
    width: paint.PaintWidthHalf * scale,
    depthScale: paint.PaintDepthScale,
    spawnOffset: nearest.SpawnOffset ? Object.freeze({ ...nearest.SpawnOffset }) : null,
  });
}

function seedFor(actor, sequence) {
  let x = ((Number.isInteger(actor?.nid) ? actor.nid : 0) ^ Math.imul(sequence | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

export function paintSlosherNearest(game, actor, source, scale = 1, sequence = 1, scratch = null) {
  if (!actor || actor.remote || actor.alive === false || actor.grounded === false ||
      !game?.paint || !game?.physics) return 0;
  const spec = slosherNearestPaintSpec(source, scale);
  if (typeof actor.pos?.clone !== 'function') return 0;

  const from = scratch?.from ?? actor.pos.clone();
  const down = scratch?.down ?? actor.pos.clone();
  const point = scratch?.point ?? actor.pos.clone();
  const dir = scratch?.dir ?? actor.pos.clone();
  const hit = scratch?.hit ?? { hit: false, point: actor.pos.clone(), normal: actor.pos.clone() };

  from.set(actor.pos.x, actor.pos.y + .2, actor.pos.z);
  down.set(0, -1, 0);
  const result = game.physics.raycast(from, down, 3.5, hit, true);
  if (!result?.hit) return 0;
  point.copy(result.point).addScaledVector(result.normal, .1);

  // DepthScale is a forward stretch multiplier. Keep the center unshifted:
  // SpawnOffset's local-axis orientation is not verified by the source docs.
  const aim = actor.aimDir;
  dir.set(aim?.x ?? Math.sin(actor.yaw || 0), 0, aim?.z ?? Math.cos(actor.yaw || 0));
  const len = Math.hypot(dir.x, dir.z);
  if (len > EPS) dir.multiplyScalar(1 / len); else dir.set(0, 0, 1);

  const area = game.paint.splat(point, spec.width, actor.team, {
    kind: 'drop',
    seed: seedFor(actor, sequence),
    stretch: dir,
    stretchAmt: Math.max(0, spec.depthScale - 1),
  });
  if (Number.isFinite(area) && area) actor.addTurf?.(area);
  return Number.isFinite(area) ? area : 0;
}
