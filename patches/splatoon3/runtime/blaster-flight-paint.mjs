/** #965 / PR1188: Splatoon 3 BulletSplashShooter flight splashes.
 *
 * The flight scheduler places SplashSpawnParam splashes at
 * SpawnNearestLength + n * SpawnBetweenLength along the collision-admitted
 * flight path (pinned 11.3.0 fields). Each scheduled splash is no longer
 * stamped by a fixed 4-world-unit downward probe. It becomes a falling splash
 * drop that is advanced at the fixed 60 Hz reference step until it reaches
 * terrain (floor, slope, ledge or wall) or leaves the world, and only then
 * paints. The drop height selects the paint depth (length along the shot):
 * DepthScaleMax at or below DepthMaxDropHeight, DepthScaleMin at or above
 * DepthMinDropHeight.
 *
 * Provenance (see reports/weapon-audit-20261009/BLASTER_FLOOR_PAINT_COMPARISON.md):
 *  - pinned 11.3.0 fields: SpawnNearestLength, SpawnBetweenLength, SpawnNum,
 *    SplitNum, WidthHalf, WidthHalfNearest, DepthMaxDropHeight,
 *    DepthMinDropHeight, explicit DepthScale* / RandomSpawnVel* when present,
 *    MoveParam.FreeGravity.
 *  - type defaults NOT present in the sparse table: DepthScaleMax 1.2 /
 *    DepthScaleMin 1.0 (public analysis value, also upstream INK_PROFILES), and
 *    RandomSpawnVel X 0.055 / Y 0.015 / Z 0.01..0.02 plus FreeAirResist 0.02
 *    (the shared BulletSplashShooterSpawnParam defaults that the upstream
 *    InkFlight shooter-family drops already document in inkFlight.js INK_MODEL;
 *    11.3.0 tables write exactly these values for the three weapons that list
 *    them explicitly).
 *  - model choices (not extracted): the splash starts with that seeded random
 *    velocity in the shot's horizontal frame and falls under the weapon's own
 *    FreeGravity with the default air resistance, exactly like InkFlight drops;
 *    linear depth interpolation between the two drop heights; the elliptical
 *    WidthHalf x (WidthHalf * depth) footprint is mapped onto PaintSystem's
 *    forward smear with equal total length and equal area (see splashStretch).
 */
import { SOURCE_SPLASH_PAINT_KIND } from './source-shot-footprint.mjs';
import { mainInkFootprint } from './main-ink-footprints.mjs';
import { sweptWorldHit } from './weapons-collision.mjs';
const EPS = 1e-9;
const STEP_FRAMES_PER_SECOND = 60;
// A splash that has not reached terrain after 4 s of free fall (> 450 world
// units at Blaster FreeGravity) has left every authored stage. Bound the queue.
const MAX_DROP_FRAMES = 240;
const MAX_POOLED_DROP_RECORDS = 256;
// Authoritative paint is bounded by accepted weapon cadence and the 240-frame
// lifetime, not a visual capacity. Evicting the oldest drop at 512 silently
// erased future floor ownership in crowded fights. Drawing has its own cap.
export const SPLASH_SHOOTER_PAINT_DEFAULTS = Object.freeze({
  DepthMaxDropHeight: 3, DepthMinDropHeight: 10, DepthScaleMax: 1.2, DepthScaleMin: 1.0,
});
export const SPLASH_SHOOTER_SPAWN_DEFAULTS = Object.freeze({
  RandomSpawnVelXMax: 0.055, RandomSpawnVelYMax: 0.015, RandomSpawnVelZMax: 0.02, RandomSpawnVelZMin: 0.01,
});
// Per-frame air resistance of a free splash drop (FreeAirResist default 0.02).
export const SPLASH_DROP_AIR_RESIST = 0.02;
const MAX_LANDING_RECORDS = 64;
const finitePositive = n => Number.isFinite(n) && n > 0;
const finiteNonNegative = n => Number.isFinite(n) && n >= 0;
// Only our plain, synchronous distance states may share segment scratch.
// Externally supplied states and wall callbacks retain the original path.
const ownedDistanceStates = new WeakSet();
export function ownDistanceFlightState(state) {
  ownedDistanceStates.add(state);
  return state;
}

export function blasterFlightPaintSpec(source, scale = 1) {
  const spawn = source?.SplashSpawnParam, paintSource = source?.SplashPaintParam;
  const paint = paintSource && { ...SPLASH_SHOOTER_PAINT_DEFAULTS, ...paintSource };
  const random = spawn && { ...SPLASH_SHOOTER_SPAWN_DEFAULTS, ...spawn };
  const gravity = source?.MoveParam?.FreeGravity;
  if (!spawn || !paint || ![scale, spawn.SpawnBetweenLength, paint.WidthHalf, paint.WidthHalfNearest,
    paint.DepthScaleMax, paint.DepthScaleMin, gravity].every(finitePositive) ||
      !finiteNonNegative(spawn.SpawnNearestLength) ||
      !finiteNonNegative(paint.DepthMaxDropHeight) || !(paint.DepthMinDropHeight >= paint.DepthMaxDropHeight) ||
      ![random.RandomSpawnVelXMax, random.RandomSpawnVelYMax, random.RandomSpawnVelZMax, random.RandomSpawnVelZMin]
        .every(finiteNonNegative) || random.RandomSpawnVelZMin > random.RandomSpawnVelZMax ||
      !Number.isInteger(spawn.SpawnNum) || spawn.SpawnNum < 0 || spawn.SpawnNum > 256 ||
      spawn.SplitNum !== 1 || (spawn.ForceSpawnNearestAddNumArray?.length ?? 0) !== 0)
    throw new RangeError('Unsupported Blaster flight-splash source');
  return Object.freeze({ first: spawn.SpawnNearestLength * scale,
    spacing: spawn.SpawnBetweenLength * scale, count: spawn.SpawnNum,
    width: paint.WidthHalf * scale, nearestWidth: paint.WidthHalfNearest * scale,
    depthScaleMax: paint.DepthScaleMax, depthScaleMin: paint.DepthScaleMin,
    dropHeightMax: paint.DepthMaxDropHeight * scale, dropHeightMin: paint.DepthMinDropHeight * scale,
    // Source frames -> world units per second squared / per second.
    gravity: gravity * scale * STEP_FRAMES_PER_SECOND * STEP_FRAMES_PER_SECOND, drag: SPLASH_DROP_AIR_RESIST,
    surfaceOnly: true, nearestIsFeet: true,
    randomVelocity: Object.freeze({
      x: random.RandomSpawnVelXMax * scale * STEP_FRAMES_PER_SECOND,
      y: random.RandomSpawnVelYMax * scale * STEP_FRAMES_PER_SECOND,
      zMin: random.RandomSpawnVelZMin * scale * STEP_FRAMES_PER_SECOND,
      zMax: random.RandomSpawnVelZMax * scale * STEP_FRAMES_PER_SECOND,
    }),
  });
}

// Paint depth for a splash that fell `height` world units. Endpoints are the
// sourced drop heights; the interior is a linear model (not extracted).
export function splashDepthScale(spec, height) {
  const hi = spec?.depthScaleMax ?? 1, lo = spec?.depthScaleMin ?? hi;
  const h0 = spec?.dropHeightMax, h1 = spec?.dropHeightMin;
  if (!Number.isFinite(height) || !Number.isFinite(h0) || !Number.isFinite(h1)) return hi;
  if (height <= h0 + EPS) return hi;
  if (height >= h1 - EPS || h1 <= h0) return lo;
  return hi + (lo - hi) * ((height - h0) / (h1 - h0));
}

// PaintSystem.splat smears the blob forward by (1 + sa) and backward by
// (1 + sa / 4). An ellipse of half-width r and half-depth r * depth has total
// length 2 r depth and area PI r^2 depth. sa = 1.6 (depth - 1) reproduces both
// exactly; the centre then moves back by 0.375 r sa so the ellipse stays
// centred on the landing point. Returned values are pure (no allocation).
export function splashStretch(depth, radius) {
  const amount = Number.isFinite(depth) && depth > 1 ? 1.6 * (depth - 1) : 0;
  return { amount, centreBack: 0.375 * radius * amount };
}

// InkFlight splashShape() -> PaintSystem footprint with the same mapping.
export function splashPaintFootprint(shape) {
  const depth = 1 + (Number.isFinite(shape?.stretch) ? shape.stretch : 0);
  const { amount, centreBack } = splashStretch(depth, shape?.radius ?? 0);
  return { radius: shape?.radius ?? 0, stretch: amount, centreBack };
}
// Keep only the latest scale/configuration per source. Live source edits must
// invalidate before the next birth; the public spec factory remains fresh.
const configuredSpecs = new WeakMap();
const SPEC_INPUTS = Object.freeze([
  ['SplashSpawnParam','SpawnBetweenLength'],['SplashSpawnParam','SpawnNearestLength'],
  ['SplashSpawnParam','SpawnNum'],['SplashSpawnParam','SplitNum'],
  ['SplashPaintParam','WidthHalf'],['SplashPaintParam','WidthHalfNearest'],
  ['SplashPaintParam','DepthScaleMax'],['SplashPaintParam','DepthScaleMin'],
  ['SplashPaintParam','DepthMaxDropHeight'],['SplashPaintParam','DepthMinDropHeight'],
  ['SplashSpawnParam','RandomSpawnVelXMax'],['SplashSpawnParam','RandomSpawnVelYMax'],
  ['SplashSpawnParam','RandomSpawnVelZMax'],['SplashSpawnParam','RandomSpawnVelZMin'],
  ['MoveParam','FreeGravity'],
]);
function configuredBlasterSpec(source, scale) {
  const cached=source && configuredSpecs.get(source);
  if(cached && Object.is(cached.scale,scale) && cached.spawn===source.SplashSpawnParam &&
      cached.paint===source.SplashPaintParam && cached.move===source.MoveParam &&
      cached.forceLength===source.SplashSpawnParam?.ForceSpawnNearestAddNumArray?.length){
    let same=true;
    for(let i=0;i<SPEC_INPUTS.length;i++){
      const [group,key]=SPEC_INPUTS[i];
      if(!Object.is(cached.values[i],source[group]?.[key])){same=false;break;}
    }
    if(same)return cached.spec;
  }
  const spec=blasterFlightPaintSpec(source,scale);
  configuredSpecs.set(source,{scale,spec,spawn:source.SplashSpawnParam,paint:source.SplashPaintParam,move:source.MoveParam,
    forceLength:source.SplashSpawnParam?.ForceSpawnNearestAddNumArray?.length,
    values:SPEC_INPUTS.map(([group,key])=>source[group]?.[key])});
  return spec;
}
const recycledFlightVectors = new WeakMap();
export function configureBlasterFlightPaint(projectile, source, scale) {
  const spec = configuredBlasterSpec(source, scale), pos = projectile.pos;
  // _new explicitly nulls the flight field at the projectile's recycle boundary.
  // Reconfiguring a live flight keeps its previous returned record independent.
  let v = projectile.s3BlasterFlightPaint === null ? recycledFlightVectors.get(projectile) : null;
  if (!v || v.type !== pos.constructor) {
    v = { type: pos.constructor, last: pos.clone(), sample: pos.clone(), down: pos.clone(),
      direction: pos.clone(), end: pos.clone(), point: pos.clone(), normal: pos.clone() };
    recycledFlightVectors.set(projectile, v);
  } else { v.last.copy(pos); v.sample.copy(pos); v.direction.copy(pos); v.end.copy(pos); v.point.copy(pos); v.normal.copy(pos); }
  v.down.set(0, -1, 0);
  projectile.s3BlasterFlightPaint = ownDistanceFlightState({ spec, distance: 0, index: 0,
    last: v.last, sample: v.sample, down: v.down, direction: v.direction, end: v.end,
    hit: { point: v.point, normal: v.normal, hit: false }, wallSplash: null });
  projectile.trailEvery = 0; // the scheduler owns Blaster flight paint; never the legacy random trail
  return projectile.s3BlasterFlightPaint;
}
export function seededSplashUnit(seed, index) {
  let value = Number.isFinite(seed) ? Math.floor(Math.abs(seed) * 4294967296) >>> 0 : 0;
  value = Math.imul(value ^ (index + 1), 2654435761);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}
export function paintBlasterFlight(game, projectile, end = projectile?.pos) {
  if (projectile?.type !== 'blast') return 0;
  return paintDistanceFlight(game, projectile, projectile.s3BlasterFlightPaint, end);
}

function dropQueue(game) {
  const system = game?.projectiles;
  if (!system) return null;
  return system._s3SplashDrops || (system._s3SplashDrops = []);
}

// Owner-only falling splash. `spec` supplies gravity, depth law and random
// spawn velocity; `radius` is the sourced paint half-width for this splash.
export function spawnSplashDrop(game, { owner, team, seed, salt = 0, from, direction = null, radius, spec,
  depth = true, kind = 'drop', initialDownSpeed = 0, catchUpSeconds = 0, footprint = null }) {
  const queue = dropQueue(game);
  if (!queue || !owner || owner.remote || !(radius > 0) || !spec || !from) return null;
  const V = from.constructor;
  const dirX = direction ? direction.x : 0, dirZ = direction ? direction.z : 0, len = Math.hypot(dirX, dirZ);
  const fx = len > EPS ? dirX / len : 0, fz = len > EPS ? dirZ / len : 0;
  const random = spec.randomVelocity;
  // Sourced per-axis random spawn velocity (zero for every 11.3.0 Blaster but
  // Precision): X/Y symmetric, Z in [ZMin, ZMax] along the shot direction.
  const vx = random ? (seededSplashUnit(seed, (salt * 8 + 1) >>> 0) * 2 - 1) * random.x : 0, vy = random ? (seededSplashUnit(seed, (salt * 8 + 2) >>> 0) * 2 - 1) * random.y : 0;
  const vz = random ? random.zMin + seededSplashUnit(seed, (salt * 8 + 3) >>> 0) * (random.zMax - random.zMin) : 0;
  const pool=game.projectiles._s3SplashDropPool||=([]);
  let drop=pool.pop();
  if(!drop||drop.pos.constructor!==V)drop={pos:new V(),vel:new V(),next:new V(),hit:hitRecord(from)};
  const collision=drop.hit;
  collision.hit=false;collision.dist=0;collision.block=collision.face=-1;collision.u=collision.v=0;
  collision.point.set(0,0,0);collision.normal.set(0,0,0);
  drop.owner=owner;drop.team=team;drop.seed=seededSplashUnit(seed,(salt*8)>>>0);drop.radius=radius;
  drop.spec=spec;drop.depth=depth;drop.kind=kind;drop.footprint=footprint;
  drop.dirX=fx;drop.dirZ=fz;drop.spawnY=from.y;drop.releaseX=from.x;drop.releaseZ=from.z;drop.frames=0;
  drop.carry=Number.isFinite(catchUpSeconds)&&catchUpSeconds>0?catchUpSeconds*STEP_FRAMES_PER_SECOND:0;
  drop.landing=null;drop.landingDepth=undefined;drop.drawRadius=undefined;drop.sourceActor=undefined;drop._s3SplashDropPooled=false;
  drop.pos.set(from.x,from.y,from.z);
  drop.vel.set(fx*vz-fz*vx,vy-Math.max(0,initialDownSpeed),fz*vz+fx*vx);
  drop.next.set(0,0,0);
  queue.push(drop);
  return drop;
}

function landSplashDrop(game, drop, hit) {
  const paint = game?.paint;
  if (!paint?.splat || !drop.owner || drop.owner.remote) return 0;
  // Flight splashes paint only the struck face, like upstream InkFlight drops
  // (no paint through a thin ceiling onto another floor); burst drops keep the
  // #1107 sphere footprint around their landing point.
  const surfaceOnly = !!drop.spec.surfaceOnly && Number.isInteger(hit.face) && hit.face >= 0;
  const point = drop.pos.copy(hit.point).addScaledVector(hit.normal, surfaceOnly ? .005 : .1);
  // 11.3.0 SplashPaintParam owns this radius and the scheduled falling
  // drop. A source-backed impact stamps one physical mask only. The
  // independent ShotColHit burst-sphere is not a SplashPaintParam drop.
  const kind = drop.spec?.surfaceOnly && drop.depth
    ? SOURCE_SPLASH_PAINT_KIND : drop.kind;
  const opts = { seed: drop.seed, kind, claimOwner: drop.owner, footprint: drop.footprint };
  if(drop.spec.noSpecial)opts.claimMode='no-special';
  if (surfaceOnly) opts.face = hit.face;
  const floor = hit.normal.y > .45;
  // An asymmetric profile still needs its captured direction at depth=1.
  // Zero stretch rotates the body without changing the source envelope.
  if (floor && drop.footprint && (drop.dirX || drop.dirZ)) {
    drop.next.set(drop.dirX, 0, drop.dirZ);
    opts.stretch = drop.next; opts.stretchAmt = 0;
  }
  if (drop.depth && floor && (drop.dirX || drop.dirZ)) {
    const depth = splashDepthScale(drop.spec, drop.spawnY - hit.point.y);
    const { amount, centreBack } = splashStretch(depth, drop.radius);
    drop.landingDepth = depth;
    if (amount > 0) {
      drop.next.set(drop.dirX, 0, drop.dirZ);
      point.addScaledVector(drop.next, -centreBack);
      opts.stretch = drop.next; opts.stretchAmt = amount;
    }
  }
  drop.landing = { x: hit.point.x, y: hit.point.y, z: hit.point.z, normalY: hit.normal.y,
    height: drop.spawnY - hit.point.y, frames: drop.frames, radius: drop.radius, depth: drop.landingDepth ?? 1,
    releaseX: drop.releaseX, releaseY: drop.spawnY, releaseZ: drop.releaseZ, face: hit.face ?? -1 };
  const area = paint.splat(point, drop.radius, drop.team, opts);
  if (Number.isFinite(area) && area) {
    if(drop.spec.noSpecial)drop.owner.addTurfNoSpecial?.(area);
    else drop.owner.addTurf?.(area);
  }
  const log = game?.projectiles && (game.projectiles._s3SplashLandings || (game.projectiles._s3SplashLandings = []));
  if (log) { log.push(drop.landing); if (log.length > MAX_LANDING_RECORDS) log.shift(); }
  return Number.isFinite(area) ? area : 0;
}

// Same fields as physics.js Hit, built from the drop's own vector type.
function hitRecord(v) {
  return { hit: false, dist: 0, point: v.clone(), normal: v.clone(), block: -1, face: -1, u: 0, v: 0 };
}

// Drop records are mutable live simulation leases, like the projectile head
// pool. Landing telemetry is a separate primitive snapshot and is never reused.
function recycleSplashDrop(system,drop,epoch) {
  if(drop._s3SplashDropPooled)return;
  drop.owner=null;drop.spec=null;drop.footprint=null;
  drop.sourceActor=undefined;drop.drawRadius=undefined;
  drop.hit.block=drop.hit.face=-1;
  if((system._s3SplashDropEpoch||0)!==epoch)return;
  const pool=system._s3SplashDropPool||=([]);
  if(pool.length<MAX_POOLED_DROP_RECORDS){drop._s3SplashDropPooled=true;pool.push(drop);}
}
export function clearSplashDrops(system) {
  system._s3SplashDropEpoch=(system._s3SplashDropEpoch||0)+1;
  for(const drop of system._s3SplashDrops||[]){drop.owner=null;drop.spec=null;drop.footprint=null;}
  system._s3SplashDrops?.splice(0);system._s3SplashDropPool?.splice(0);
}

// Fixed-step integrator shared by every queued splash. Rendering cadence only
// changes how many whole reference frames are consumed per call.
export function advanceSplashDrops(system, dt, game, waterY = -Infinity, startIndex = 0) {
  const queue = system?._s3SplashDrops;
  // A zero-time flush consumes only explicitly accrued birth-step debt. The
  // catalogue uses it after its fixed steps; existing drops accrue no time.
  if (!queue?.length || !Number.isFinite(dt) || dt < 0) return 0;
  const physics = game?.physics;
  const start = Math.max(0, Math.min(queue.length, Number.isFinite(startIndex) ? Math.trunc(startIndex) : 0));
  let landed = 0, write = start;
  let landings=null;
  let retired=null;const epoch=system._s3SplashDropEpoch||0;
  for (let i = start; i < queue.length; i++) {
    const d = queue[i];
    let done = !physics?.segment || !d.owner || d.owner.remote;
    let stepTime = (1 - d.carry) / STEP_FRAMES_PER_SECOND;
    d.carry += dt * STEP_FRAMES_PER_SECOND;
    while (!done && d.carry >= 1 - 1e-7) {
      d.carry -= 1;
      const step = 1 / STEP_FRAMES_PER_SECOND;
      if (d.spec.drag > 0) d.vel.multiplyScalar(1 - d.spec.drag);
      d.vel.y -= d.spec.gravity * step;
      d.next.copy(d.pos).addScaledVector(d.vel, step);
      const record=d.hit||hitRecord(d.pos),radius=d.spec.fieldRadius||0;
      const hit = d.hit = radius>0
        ?sweptWorldHit(physics,d.pos,d.next,radius,radius,record,true)
        :physics.segment(d.pos, d.next, record, true);
      d.frames++;
      if (hit?.hit) { (landings ||= []).push({drop:d,hit,time:stepTime});landed++;done=true;break; }
      d.pos.copy(d.next);
      stepTime += step;
      if (d.frames >= MAX_DROP_FRAMES || d.pos.y < waterY - 2) done = true;
    }
    if (!done) queue[write++] = d;else (retired ||= []).push(d);
  }
  // Stable linear compaction: landing a large volley no longer repeatedly
  // shifts all later drops. Survivors retain their deterministic order.
  queue.length = write;
  // Two opposite-team drops may land on different reference ticks inside one
  // 30Hz update. Apply them by collision time, not by queue iteration order;
  // otherwise the earlier landing can incorrectly overwrite the later one.
  if(landings?.length>1)landings.sort((a,b)=>a.time-b.time);
  try{if(landings)for(const landing of landings)landSplashDrop(game,landing.drop,landing.hit);}
  finally{if(retired)for(const drop of retired)recycleSplashDrop(system,drop,epoch);}
  return landed;
}

// Shared distance scheduler, not a second projectile integrator. The collision
// owner supplies a clipped endpoint; splash state cannot alter motion/damage.
// Returns the number of splashes released this call.
export function paintDistanceFlight(game, projectile, state, end = projectile?.pos) {
  if (!state || (projectile.s3SpecialWeapon && !(projectile.s3AllSpecial === 'crabTank' && state === projectile.s3CrabFlightPaint)) || projectile.ghost ||
      projectile.owner?.remote || !game?.paint || !game?.physics ||
      !end) return 0;
  const endX=end.x,endY=end.y,endZ=end.z;
  if (!Number.isFinite(endX)||!Number.isFinite(endY)||!Number.isFinite(endZ)) return 0;
  const distance = state.last.distanceTo(end), limit = state.distance + distance, spec = state.spec;
  if (!(distance > EPS)) return 0;
  let released = 0, directionReady = false;
  let shareDirection = ownedDistanceStates.has(state) &&
    Object.getOwnPropertyDescriptor(state, 'wallSplash')?.value === null &&
    !!Object.getOwnPropertyDescriptor(game, 'projectiles')?.value;
  while (state.index < spec.count) {
    const at = spec.first + state.index * spec.spacing;
    if (at > limit + EPS) break;
    const index = state.index++;
    state.sample.copy(state.last).lerp(end, Math.max(0, Math.min(1, (at - state.distance) / distance)));
    if (!shareDirection || !directionReady) {
      state.direction.set(end.x - state.last.x, 0, end.z - state.last.z);
      directionReady = true;
    }
    const radius = index === 0 ? spec.nearestWidth : spec.width, kind = index === 0 && spec.nearestIsFeet ? 'trail' : 'drop';
    released++;
    // SplashWallHitParam: a splash released with a paintable wall inside its
    // sourced reach sticks to that wall instead of falling to the floor.
    if (typeof state.wallSplash === 'function' && state.wallSplash(state.sample, index)) continue;
    const drop = spawnSplashDrop(game, { owner: projectile.owner, team: projectile.team, seed: projectile.seed,
      salt: index, from: state.sample, direction: state.direction, radius, spec, depth: true, kind,
      footprint: mainInkFootprint(projectile.s3Weapon || projectile.catalog?.r) });
    if (!drop) {
      // Immediate diagnostics can call user physics/paint hooks. Do not carry
      // a segment invariant across that observable callback boundary.
      shareDirection = false;
      paintImmediate(game, projectile, state, index, radius);
    }
  }
  state.distance = limit; state.last.copy(end);
  return released;
}
// Fallback for hosts without a projectile system queue (isolated diagnostics):
// resolve the same falling drop synchronously; landing paint is identical.
function paintImmediate(game, projectile, state, index, radius) {
  const drop = { owner: projectile.owner, team: projectile.team, seed: seededSplashUnit(projectile.seed, index * 8),
    footprint: mainInkFootprint(projectile.s3Weapon || projectile.catalog?.r),
    radius, spec: state.spec, depth: true, kind: 'drop', dirX: 0, dirZ: 0, spawnY: state.sample.y, frames: 0,
    pos: state.sample.clone(), next: state.sample.clone(), hit: null };
  const len = Math.hypot(state.direction.x, state.direction.z);
  if (len > EPS) { drop.dirX = state.direction.x / len; drop.dirZ = state.direction.z / len; }
  drop.next.y -= 1000;
  const hit = game.physics.segment(drop.pos, drop.next, hitRecord(drop.pos), true);
  drop.frames = hit?.hit ? Math.ceil(Math.sqrt(2 * Math.max(0, drop.spawnY - hit.point.y) / state.spec.gravity) * STEP_FRAMES_PER_SECOND) : 0;
  if (hit?.hit) landSplashDrop(game, drop, hit);
}
