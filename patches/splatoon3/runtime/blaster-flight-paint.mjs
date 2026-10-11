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
const EPS = 1e-9;
const STEP_FRAMES_PER_SECOND = 60;
// A splash that has not reached terrain after 4 s of free fall (> 450 world
// units at Blaster FreeGravity) has left every authored stage. Bound the queue.
const MAX_DROP_FRAMES = 240;
const MAX_QUEUED_DROPS = 512;
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
export function configureBlasterFlightPaint(projectile, source, scale) {
  const spec = blasterFlightPaintSpec(source, scale);
  projectile.s3BlasterFlightPaint = { spec, distance: 0, index: 0,
    last: projectile.pos.clone(), sample: projectile.pos.clone(), down: projectile.pos.clone().set(0, -1, 0),
    direction: projectile.pos.clone(), end: projectile.pos.clone(),
    hit: { point: projectile.pos.clone(), normal: projectile.pos.clone(), hit: false }, wallSplash: null };
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
  depth = true, kind = 'drop', initialDownSpeed = 0 }) {
  const queue = dropQueue(game);
  if (!queue || !owner || owner.remote || !(radius > 0) || !spec || !from) return null;
  const V = from.constructor;
  const dirX = direction ? direction.x : 0, dirZ = direction ? direction.z : 0, len = Math.hypot(dirX, dirZ);
  const fx = len > EPS ? dirX / len : 0, fz = len > EPS ? dirZ / len : 0;
  const random = spec.randomVelocity, unit = k => seededSplashUnit(seed, (salt * 8 + k) >>> 0);
  // Sourced per-axis random spawn velocity (zero for every 11.3.0 Blaster but
  // Precision): X/Y symmetric, Z in [ZMin, ZMax] along the shot direction.
  const vx = random ? (unit(1) * 2 - 1) * random.x : 0, vy = random ? (unit(2) * 2 - 1) * random.y : 0;
  const vz = random ? random.zMin + unit(3) * (random.zMax - random.zMin) : 0;
  const drop = {
    owner, team, seed: unit(0), radius, spec, depth, kind,
    dirX: fx, dirZ: fz, spawnY: from.y, releaseX: from.x, releaseZ: from.z, frames: 0, carry: 0,
    pos: new V(from.x, from.y, from.z),
    vel: new V(fx * vz - fz * vx, vy - Math.max(0, initialDownSpeed), fz * vz + fx * vx),
    next: new V(), hit: null,
  };
  if (queue.length >= MAX_QUEUED_DROPS) queue.shift();
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
  const opts = { seed: drop.seed, kind: drop.kind, claimOwner: drop.owner };
  if (surfaceOnly) opts.face = hit.face;
  const floor = hit.normal.y > .45;
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
  if (Number.isFinite(area) && area) drop.owner.addTurf?.(area);
  const log = game?.projectiles && (game.projectiles._s3SplashLandings || (game.projectiles._s3SplashLandings = []));
  if (log) { log.push(drop.landing); if (log.length > MAX_LANDING_RECORDS) log.shift(); }
  return Number.isFinite(area) ? area : 0;
}

// Same fields as physics.js Hit, built from the drop's own vector type.
function hitRecord(v) {
  return { hit: false, dist: 0, point: v.clone(), normal: v.clone(), block: -1, face: -1, u: 0, v: 0 };
}

// Fixed-step integrator shared by every queued splash. Rendering cadence only
// changes how many whole reference frames are consumed per call.
export function advanceSplashDrops(system, dt, game, waterY = -Infinity) {
  const queue = system?._s3SplashDrops;
  if (!queue?.length || !(dt > 0)) return 0;
  const physics = game?.physics;
  let landed = 0;
  for (let i = 0; i < queue.length; i++) {
    const d = queue[i];
    let done = !physics?.segment || !d.owner || d.owner.remote;
    d.carry += dt * STEP_FRAMES_PER_SECOND;
    while (!done && d.carry >= 1 - 1e-7) {
      d.carry -= 1;
      const step = 1 / STEP_FRAMES_PER_SECOND;
      if (d.spec.drag > 0) d.vel.multiplyScalar(1 - d.spec.drag);
      d.vel.y -= d.spec.gravity * step;
      d.next.copy(d.pos).addScaledVector(d.vel, step);
      const hit = d.hit = physics.segment(d.pos, d.next, d.hit || hitRecord(d.pos), true);
      d.frames++;
      if (hit?.hit) { landSplashDrop(game, d, hit); landed++; done = true; break; }
      d.pos.copy(d.next);
      if (d.frames >= MAX_DROP_FRAMES || d.pos.y < waterY - 2) done = true;
    }
    if (done) { queue.splice(i, 1); i--; }
  }
  return landed;
}

// Shared distance scheduler, not a second projectile integrator. The collision
// owner supplies a clipped endpoint; splash state cannot alter motion/damage.
// Returns the number of splashes released this call.
export function paintDistanceFlight(game, projectile, state, end = projectile?.pos) {
  if (!state || projectile.s3SpecialWeapon || projectile.ghost ||
      projectile.owner?.remote || !game?.paint || !game?.physics ||
      !end || ![end.x, end.y, end.z].every(Number.isFinite)) return 0;
  const distance = state.last.distanceTo(end), limit = state.distance + distance, spec = state.spec;
  if (!(distance > EPS)) return 0;
  let released = 0;
  while (state.index < spec.count) {
    const at = spec.first + state.index * spec.spacing;
    if (at > limit + EPS) break;
    const index = state.index++;
    state.sample.copy(state.last).lerp(end, Math.max(0, Math.min(1, (at - state.distance) / distance)));
    state.direction.set(end.x - state.last.x, 0, end.z - state.last.z);
    const radius = index === 0 ? spec.nearestWidth : spec.width, kind = index === 0 && spec.nearestIsFeet ? 'trail' : 'drop';
    released++;
    // SplashWallHitParam: a splash released with a paintable wall inside its
    // sourced reach sticks to that wall instead of falling to the floor.
    if (typeof state.wallSplash === 'function' && state.wallSplash(state.sample, index)) continue;
    const drop = spawnSplashDrop(game, { owner: projectile.owner, team: projectile.team, seed: projectile.seed,
      salt: index, from: state.sample, direction: state.direction, radius, spec, depth: true, kind });
    if (!drop) paintImmediate(game, projectile, state, index, radius);
  }
  state.distance = limit; state.last.copy(end);
  return released;
}
// Fallback for hosts without a projectile system queue (isolated diagnostics):
// resolve the same falling drop synchronously; landing paint is identical.
function paintImmediate(game, projectile, state, index, radius) {
  const drop = { owner: projectile.owner, team: projectile.team, seed: seededSplashUnit(projectile.seed, index * 8),
    radius, spec: state.spec, depth: true, kind: 'drop', dirX: 0, dirZ: 0, spawnY: state.sample.y, frames: 0,
    pos: state.sample.clone(), next: state.sample.clone(), hit: null };
  const len = Math.hypot(state.direction.x, state.direction.z);
  if (len > EPS) { drop.dirX = state.direction.x / len; drop.dirZ = state.direction.z / len; }
  drop.next.y -= 1000;
  const hit = game.physics.segment(drop.pos, drop.next, hitRecord(drop.pos), true);
  drop.frames = hit?.hit ? Math.ceil(Math.sqrt(2 * Math.max(0, drop.spawnY - hit.point.y) / state.spec.gravity) * STEP_FRAMES_PER_SECOND) : 0;
  if (hit?.hit) landSplashDrop(game, drop, hit);
}
