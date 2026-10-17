// Pinned 11.3.0 WeaponSpChariot fields; raw bytes and omissions are retained in
// reports/inkwave-crab-source-audit-2026-10-17/. Length scale 1 follows the existing engine.
import { paintDistanceFlight, advanceSplashDrops, SPLASH_SHOOTER_SPAWN_DEFAULTS } from './blaster-flight-paint.mjs';
import { startCatalogWallDrop } from './weapons-fidelity.mjs';
import { shooterImpactRadius } from './shooter-impact-paint.mjs';
import { SOURCE_SHOT_PAINT_KIND } from './source-shot-footprint.mjs';

export const CRAB_SHOOTER_PAINT = Object.freeze({ impactPaint: Object.freeze({
  distanceMiddle: 1.1, widthNear: 1.6, widthMiddle: 1.6, widthFar: 1.5,
}) });
export function crabShooterSplashPlan(sequence) {
  if(!Number.isSafeInteger(sequence)||sequence<0)throw new RangeError('Invalid Crab Tank shot sequence');
  const ordinal=sequence%8+1;
  return {count:Math.floor((sequence+1)*2.5)-Math.floor(sequence*2.5),
    first:1+10*(8-ordinal)/8,spacing:10,feet:ordinal===8};
}
// Shared splash defaults are independently documented by the existing main
// weapon implementation. Pattern ordering, free-fall law and depth interpolation
// remain INKWAVE models, not recovered Nintendo executable code.
const DEFAULT_RANDOM = Object.freeze({
  x: SPLASH_SHOOTER_SPAWN_DEFAULTS.RandomSpawnVelXMax * 60,
  y: SPLASH_SHOOTER_SPAWN_DEFAULTS.RandomSpawnVelYMax * 60,
  zMin: SPLASH_SHOOTER_SPAWN_DEFAULTS.RandomSpawnVelZMin * 60,
  zMax: SPLASH_SHOOTER_SPAWN_DEFAULTS.RandomSpawnVelZMax * 60,
});
function collision(initRadius, endRadius, frames) {
  return { initRadius, endRadius, changeTime: frames / 60 };
}
export function configureCrabProjectile(p, sequence = 0) {
  const shooter = p.type === 'shot';
  p.fidelityFieldCollision = shooter ? collision(.2, .2, 0) : collision(.1, .25, 4);
  p.fidelityPlayerCollision = shooter ? collision(.2, .2, 0) : collision(.04, .4, 5);
  p.fidelityFriendThrough = shooter ? 0 : 1000;
  const plan = shooter ? crabShooterSplashPlan(sequence) : { first: 3.1, spacing: 3.1, count: 10, feet: false };
  const spec = {
    first: plan.first, spacing: plan.spacing, count: plan.count,
    width: shooter ? 1 : 1.12, nearestWidth: shooter && plan.feet ? 2.016 : shooter ? 1 : 1.12,
    depthScaleMax: shooter ? 1.2 : 2, depthScaleMin: shooter ? 1 : 2,
    dropHeightMax: 3, dropHeightMin: 10,
    gravity: .016 * 3600, drag: .02, surfaceOnly: true, nearestIsFeet: plan.feet, noSpecial: true,
    crabMode:shooter?'shooter':'cannon',fieldRadius:shooter?0:.15,
    randomVelocity: DEFAULT_RANDOM,
  };
  p.s3CrabFlightPaint = { spec, distance: 0, index: 0,
    last: p.pos.clone(), sample: p.pos.clone(), direction: p.pos.clone(), end: p.pos.clone() };
  p.trailEvery = 0;
}
const WALL_DROP = Object.freeze({
  move: Object.freeze({FallPeriodFirstFrameMin:20,FallPeriodFirstFrameMax:40,FallPeriodFirstTargetSpeed:.06,
    FallPeriodSecondFrame:10,FallPeriodSecondTargetSpeed:.06,FallPeriodLastFrameMin:15,FallPeriodLastFrameMax:35,
    FreeGravityType:'value_0_008'}),
  paint: Object.freeze({PaintRadiusShock:1.3,PaintRadiusFall:.65,PaintRadiusGround:.6}),
});
export function startCrabWallDrop(system,p,hit) {
  return p?.type==='shot'&&!p.owner?.remote&&startCatalogWallDrop(system,p,hit,WALL_DROP);
}
// The caller supplies the collision-clipped endpoint. Detached drops survive
// their head round; the shared queue is retired by Projectiles.clear().
export function paintCrabFlight(game, p, end, remainder = 0, waterY = -Infinity) {
  const queue=game?.projectiles?._s3SplashDrops,before=queue?.length||0;
  const released=paintDistanceFlight(game, p, p.s3CrabFlightPaint, end);
  // The shared queue was advanced before head rounds. A coarse host update
  // may emit in an earlier source subframe; age only those newborn drops to
  // its endpoint so 30Hz cannot add a render frame of falling-ink latency.
  const current=game?.projectiles?._s3SplashDrops;
  if(remainder>0&&current?.length>before){
    const newborn=current.splice(before),subset={_s3SplashDrops:newborn};
    advanceSplashDrops(subset,remainder,game,waterY);current.push(...newborn);
  }
  return released;
}
export function crabShooterDamage(age) {
  return 32 - 16 * Math.max(0, Math.min(1, (age * 60 - 9) / 16));
}
export function withCrabImpactPaint(game, p, hit, callback) {
  const paint = game?.paint;
  if (!paint?.splat || p.ghost || p.owner?.remote) return callback();
  const native = paint.splat;
  let first = true;
  paint.splat = function(point, radius, team, opts = {}) {
    if (!first) return native.call(this, point, radius, team, opts);
    first = false;
    // Cannon paints once through its blast disk. The generic impact's random
    // extra disk otherwise broadens the 4.5 radius and double-counts turf.
    if (p.type === 'blast') return 0;
    const sourced = shooterImpactRadius(CRAB_SHOOTER_PAINT, p, hit.point);
    const options = { ...opts, kind: SOURCE_SHOT_PAINT_KIND,
      claimOwner: p.owner, claimMode: 'no-special' };
    if (Number.isInteger(hit.face) && hit.face >= 0) options.face = hit.face;
    // The sparse Chariot table does not expose depth coefficients. Retain
    // the native depth until class defaults can be independently established.
    return native.call(this, point, sourced ?? radius, team, options);
  };
  try { return callback(); } finally { paint.splat = native; }
}
