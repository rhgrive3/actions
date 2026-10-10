import { spawnSplashDrop, SPLASH_DROP_AIR_RESIST } from './blaster-flight-paint.mjs';
const EPS = 1e-10;
// PR1188: the source splash falls like every other BulletSplash: the shared
// splash-drop defaults (FreeGravity 0.016 DU/F^2, FreeAirResist 0.02) are a
// model choice; no fixed downward probe length decides whether it paints.
const SPLASH_GRAVITY_PER_FRAME2 = 0.016;
const INSTALLED = Symbol.for('inkwave.s3.slosher-intermediate-paint.v1');

const clamp01 = value => value < 0 ? 0 : value > 1 ? 1 : value;

export function slosherIntermediateSpec(projectile, scale = 1) {
  const unit = projectile?.fidelitySloshUnit;
  const group = unit?.SplashAndSplashWallHitSpawnPrm;
  const index = projectile?.fidelitySloshIndex;
  if (!group || !Number.isInteger(index)) return null;
  const combination = group.Combination?.find?.(entry =>
    entry?.OrderNum === index && Number.isInteger(entry?.SplashArrayOrderNum) &&
    entry.SplashArrayOrderNum >= 0 && (entry.TotalNum ?? 0) > 0);
  if (!combination) return null;
  const splash = group.SplashParam?.[combination.SplashArrayOrderNum];
  const spawn = splash?.SpawnParam, draw = splash?.DrawSizeCollisionPaintParam;
  if (!spawn || !draw) return null;

  const min = spawn.FirstSplashRateForLengthMin;
  const max = spawn.FirstSplashRateForLengthMax;
  const between = spawn.SpawnBetweenLength;
  const spawnNum = Math.min(spawn.SpawnNum ?? 0, combination.TotalNum ?? Infinity);
  const width = draw.PaintWidthHalf, depth = draw.PaintDepthScale;
  const playerRadius = draw.CollisionParam?.EndRadiusForPlayer;
  if (![min, max, between, width, depth].every(Number.isFinite) ||
      min < 0 || max < min || between <= 0 || width <= 0 || depth <= 0 ||
      !(spawnNum > 0) || playerRadius !== 0) return null;

  // Projectile seed is already the authoritative per-glob random sample.
  // Use it inside the source-declared 0.7..0.9 rate interval; no extra RNG is
  // introduced, so network/fixture replays stay deterministic.
  const rate = min + (max - min) * clamp01(Number.isFinite(projectile.seed) ? projectile.seed : .5);
  return Object.freeze({
    targetLength: rate * between * scale,
    widthHalf: width * scale,
    depthScale: depth,
    spawnNum: Math.max(0, Math.floor(spawnNum)),
    drop: Object.freeze({ gravity: SPLASH_GRAVITY_PER_FRAME2 * 3600 * scale, drag: SPLASH_DROP_AIR_RESIST,
      depthScaleMax: depth, depthScaleMin: depth, dropHeightMax: 0, dropHeightMin: 0, surfaceOnly: true, randomVelocity: null }),
  });
}

export function installSlosherIntermediatePaint(api, profile) {
  const { Projectiles, G, THREE } = api || {};
  if (!Projectiles?.prototype || Projectiles.prototype[INSTALLED]) return;
  Object.defineProperty(Projectiles.prototype, INSTALLED, { value: true });
  const scale = profile?.weaponsFidelityCompletion?.worldUnitsPerSourceUnit ?? 1;
  const step = Projectiles.prototype._step;
  const point = new THREE.Vector3();
  const stretch = new THREE.Vector3();
  // Runtime source parameters are fixed for a spawned glob. The same projectile
  // can run dozens of fixed ticks; avoid Combination.find, Array construction
  // and Object.freeze on every tick, while respecting pooled projectile reuse.
  const specs = new WeakMap();
  const specFor = p => {
    const prev = specs.get(p);
    if (prev && prev.unit === p.fidelitySloshUnit &&
        prev.index === p.fidelitySloshIndex && Object.is(prev.seed, p.seed))
      return prev.spec;
    const spec = slosherIntermediateSpec(p, scale);
    specs.set(p, { unit: p.fidelitySloshUnit, index: p.fidelitySloshIndex,
      seed: p.seed, spec });
    return spec;
  };

  // A seed is a random value, not a projectile lifetime identifier. Reset on
  // allocation so a repeated sample cannot inherit a spent slot from the pool.
  const fresh = Projectiles.prototype._new;
  if (typeof fresh === 'function') Projectiles.prototype._new = function (...args) {
    const p = fresh.apply(this, args);
    p.s3SloshIntermediateSeed = undefined;
    p.s3SloshIntermediateTravel = 0;
    p.s3SloshIntermediateCount = 0;
    return p;
  };
  const eligible = p => p?.type === 'slosh' && !p.ghost && !p.owner?.remote;
  Projectiles.prototype.s3PaintSlosherSegment = function (p, from, end) {
    p.s3SloshIntermediateSegmentHandled = true;
    const spec = eligible(p) ? specFor(p) : null;
    if (!spec || !from || !end) return;
    if (p.s3SloshIntermediateSeed !== p.seed) {
      p.s3SloshIntermediateSeed = p.seed;
      p.s3SloshIntermediateTravel = 0;
      p.s3SloshIntermediateCount = 0;
    }
    if ((p.s3SloshIntermediateCount || 0) >= spec.spawnNum) return;
    const segment = Math.hypot(end.x - from.x, end.z - from.z);
    const before = p.s3SloshIntermediateTravel || 0;
    const after = before + segment;
    p.s3SloshIntermediateTravel = after;
    if (after + EPS < spec.targetLength) return;
    // This source slot belongs to the scheduled distance, including a miss.
    // Retrying from a later point moves ink to a different piece of terrain.
    p.s3SloshIntermediateCount = (p.s3SloshIntermediateCount || 0) + 1;
    const t = segment > EPS ? clamp01((spec.targetLength - before) / segment) : 1;
    point.set(from.x + (end.x - from.x) * t,
      from.y + (end.y - from.y) * t, from.z + (end.z - from.z) * t);
    const ground = G.physics?.raycast?.(point, down, 10 * scale, hit, true);
    if (!ground?.hit) return;
    point.copy(ground.point).addScaledVector(ground.normal, .1 * scale);
    stretch.set(p.vel.x, 0, p.vel.z);
    if (stretch.lengthSq() <= EPS) stretch.set(0, 0, 1);
    else stretch.normalize();
    const area = G.paint?.splat?.(point, spec.widthHalf, p.team, {
      seed: p.seed, claimOwner: p.owner, stretch,
      // PaintSystem takes an additive elongation, whereas the source stores
      // the total depth ratio. Keep the rasterizer's asymmetry as calibration.
      stretchAmt: Math.max(0, spec.depthScale - 1),
    }) || 0;
    p.owner?.addTurf?.(area);
  };
  const before = new THREE.Vector3();
  Projectiles.prototype._step = function (p, dt) {
    const spec = eligible(p) ? specFor(p) : null;
    if (!spec) return step.call(this, p, dt);
    p.trailEvery = 0;
    before.copy(p.pos);
    p.s3SloshIntermediateSegmentHandled = false;
    const dead = step.call(this, p, dt);
    // The fidelity collision solver owns the clipped segment, even on the
    // terminal tick. Source-only fixtures retain the nonterminal fallback.
    if (!p.s3SloshIntermediateSegmentHandled && !dead)
      this.s3PaintSlosherSegment(p, before, p.pos);
    return dead;
  };
}
