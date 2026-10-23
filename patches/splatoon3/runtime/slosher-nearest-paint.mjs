/** Issue #978: source-driven Bucket Slosher NearestParam foot paint.
 *
 * The pinned S3 source defines a paint-only release stamp with
 * PaintWidthHalf/PaintDepthScale and zero player collision radii.  SpawnOffset
 * exists too, but its actor-local axis mapping is not verified by the supplied
 * references, so this module intentionally leaves the center unshifted rather
 * than guessing an orientation.
 */
import { SOURCE_SPLASH_PAINT_KIND } from './source-shot-footprint.mjs';
import { mainInkFootprint } from './main-ink-footprints.mjs';
const EPS = 1e-10;
const nearestScratch=new WeakMap();

export function slosherNearestPaintSpec(source, scale = 1) {
  const nearest = source?.NearestParam;
  const paint = nearest?.DrawSizeCollisionPaintParam;
  const collision = paint?.CollisionParam;
  // Source rows are sparse. Sloshing Machine omits the NearestParam player
  // collision subrecord entirely; the paint-only stamp does not create an
  // actor collider. Explicit nonzero collision radii are still rejected.
  if (!nearest || !paint || !Number.isFinite(scale) || !(scale > 0) ||
      !Number.isFinite(paint.PaintWidthHalf) || !(paint.PaintWidthHalf > 0) ||
      !Number.isFinite(paint.PaintDepthScale) || !(paint.PaintDepthScale > 0) ||
      (collision && (collision.InitRadiusForPlayer !== 0 || collision.EndRadiusForPlayer !== 0)))
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
  if (typeof actor.pos?.clone !== 'function') return 0;
  let pool=null,lease=null;
  if(!scratch){
    pool=nearestScratch.get(actor);if(!pool){pool=[];nearestScratch.set(actor,pool);}
    lease=pool.pop()||{};
    const n=source?.NearestParam,p=n?.DrawSizeCollisionPaintParam,c=p?.CollisionParam;
    if(lease.source!==source||lease.scale!==scale||lease.width!==p?.PaintWidthHalf||lease.depth!==p?.PaintDepthScale||
       lease.player0!==c?.InitRadiusForPlayer||lease.player1!==c?.EndRadiusForPlayer){
      lease.spec=slosherNearestPaintSpec(source,scale);lease.source=source;lease.scale=scale;
      lease.width=p.PaintWidthHalf;lease.depth=p.PaintDepthScale;lease.player0=c?.InitRadiusForPlayer;lease.player1=c?.EndRadiusForPlayer;
    }
    lease.from||=actor.pos.clone();lease.down||=actor.pos.clone();lease.point||=actor.pos.clone();lease.dir||=actor.pos.clone();
    lease.hit||={hit:false,point:actor.pos.clone(),normal:actor.pos.clone()};scratch=lease;
  }
  const spec=lease?.spec||slosherNearestPaintSpec(source,scale);
  try{

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
    kind: SOURCE_SPLASH_PAINT_KIND, footprint: mainInkFootprint(actor.weapon), claimOwner: actor,
    seed: seedFor(actor, sequence),
    stretch: dir,
    stretchAmt: Math.max(0, spec.depthScale - 1),
  });
  if (Number.isFinite(area) && area) actor.addTurf?.(area);
  return Number.isFinite(area) ? area : 0;
  }finally{if(lease&&pool.length<4)pool.push(lease);}
}
