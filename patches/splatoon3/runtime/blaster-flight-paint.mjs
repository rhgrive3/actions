/** #965: pinned Blaster flight-splash schedule, separate from burst/wall paint.
 * Retains the existing 4-world-unit downward terrain projection. This module
 * does not implement an independent falling-droplet simulation or HP damage.
 */
const EPS = 1e-9;
export function blasterFlightPaintSpec(source, scale = 1) {
  const spawn = source?.SplashSpawnParam, paint = source?.SplashPaintParam;
  if (!spawn || !paint || ![scale, spawn.SpawnBetweenLength, paint.WidthHalf, paint.WidthHalfNearest]
      .every(n => Number.isFinite(n) && n > 0) ||
      !Number.isFinite(spawn.SpawnNearestLength) || spawn.SpawnNearestLength < 0 ||
      !Number.isInteger(spawn.SpawnNum) || spawn.SpawnNum < 0 || spawn.SpawnNum > 256 ||
      spawn.SplitNum !== 1 || (spawn.ForceSpawnNearestAddNumArray?.length ?? 0) !== 0)
    throw new RangeError('Unsupported Blaster flight-splash source');
  return Object.freeze({ first: spawn.SpawnNearestLength * scale,
    spacing: spawn.SpawnBetweenLength * scale, count: spawn.SpawnNum,
    width: paint.WidthHalf * scale, nearestWidth: paint.WidthHalfNearest * scale });
}
export function configureBlasterFlightPaint(projectile, source, scale) {
  const spec = blasterFlightPaintSpec(source, scale);
  projectile.s3BlasterFlightPaint = { spec, distance: 0, index: 0,
    last: projectile.pos.clone(), sample: projectile.pos.clone(), down: projectile.pos.clone().set(0, -1, 0),
    end: projectile.pos.clone(), hit: { point: projectile.pos.clone(), normal: projectile.pos.clone(), hit: false } };
  projectile.trailEvery = 0; // never double-paint through the legacy random trail
}
function seedFor(seed, index) {
  let value = Number.isFinite(seed) ? Math.floor(Math.abs(seed) * 4294967296) >>> 0 : 0;
  value = Math.imul(value ^ (index + 1), 2654435761);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}
export function paintBlasterFlight(game, projectile, end = projectile?.pos) {
  if (projectile?.type !== 'blast') return 0;
  return paintDistanceFlight(game,projectile,projectile.s3BlasterFlightPaint,end);
}
// Shared distance scheduler, not a second projectile integrator. The collision
// owner supplies a clipped endpoint; splash state cannot alter motion/damage.
export function paintDistanceFlight(game, projectile, state, end = projectile?.pos) {
  if (!state || projectile.s3SpecialWeapon || projectile.ghost ||
      projectile.owner?.remote || !game?.paint || !game?.physics ||
      !end || ![end.x, end.y, end.z].every(Number.isFinite)) return 0;
  const distance = state.last.distanceTo(end), limit = state.distance + distance, spec = state.spec;
  if (!(distance > EPS)) return 0;
  let area = 0;
  while (state.index < spec.count) {
    const at = spec.first + state.index * spec.spacing;
    if (at > limit + EPS) break;
    const index = state.index++;
    state.sample.copy(state.last).lerp(end, Math.max(0, Math.min(1, (at - state.distance) / distance)));
    const hit = game.physics.raycast(state.sample, state.down, 4, state.hit, true);
    if (!hit?.hit) continue;
    state.sample.copy(hit.point).addScaledVector(hit.normal, .1);
    const opts = { seed: seedFor(projectile.seed, index), kind: 'drop' };
    if (Number.isFinite(spec.depth)) {
      state.direction.set(end.x-state.last.x,0,end.z-state.last.z).normalize();
      opts.stretch=state.direction;opts.stretchAmt=spec.depth-1;
    }
    const painted = game.paint.splat(state.sample, index === 0 ? spec.nearestWidth : spec.width,
      projectile.team, opts);
    if (Number.isFinite(painted)) area += painted;
  }
  state.distance = limit; state.last.copy(end);
  if (area) projectile.owner.addTurf(area);
  return area;
}
