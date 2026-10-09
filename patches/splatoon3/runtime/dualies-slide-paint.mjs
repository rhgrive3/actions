/** #979: source-width, distance-sampled Dualies slide paint.
 * Source: bundled profile -> SideStepParam.SplashSlideParam.PaintWidthHalf.
 * PaintSystem's existing roll stamp has a lateral half-width of
 * nominalRadius * (.62 + .10 - .03); reuse its CPU/GPU/network path.
 */
const EPS = 1e-9;
const ROLL_LATERAL_HALF = .62 + .10 - .03;
const SURFACE_OFFSET = .03;

export function configureDualiesSlidePaint(weapons, profile) {
  const source = profile?.weaponsFidelityCompletion;
  const half = source?.weapons?.dualies?.SideStepParam?.SplashSlideParam?.PaintWidthHalf;
  const scale = source?.worldUnitsPerSourceUnit;
  if (!(Number.isFinite(half) && half > 0 && Number.isFinite(scale) && scale > 0))
    throw new RangeError('Missing Dualies slide-paint width/scale');
  weapons.dualies.rollPaintWidthHalf = half * scale;
  weapons.dualies.rollPaintWorldScale = scale;
}

export function slideStampRadius(halfWidth) {
  if (!(Number.isFinite(halfWidth) && halfWidth > 0)) throw new RangeError('Invalid slide half-width');
  return Math.hypot(halfWidth / ROLL_LATERAL_HALF, SURFACE_OFFSET);
}

function stampSeed(id, token, index) {
  let seed = 2166136261;
  for (const c of String(id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  seed = Math.imul(seed ^ token, 16777619);
  seed = Math.imul(seed ^ index, 16777619);
  return (seed >>> 0) / 4294967296;
}

export function paintDualiesSlide(game, runner, weapon, ending = false) {
  const actor = runner?.a, dodge = runner?.dodge;
  const half = weapon?.rollPaintWidthHalf;
  if (!actor || !dodge || dodge.startup > EPS || weapon.kind !== 'dualies' || actor.remote || actor.alive === false ||
      !(Number.isFinite(half) && half > 0) || !game?.paint || !game?.physics ||
      ![actor.pos.x, actor.pos.y, actor.pos.z].every(Number.isFinite)) return 0;
  let state = runner.s3SlidePaint;
  if (!state || state.dodge !== dodge) {
    state = runner.s3SlidePaint = { dodge, token: (runner.s3SlidePaintSequence = (runner.s3SlidePaintSequence || 0) + 1), last: actor.pos.clone(),
      initial: dodge.paintStart?.clone() ?? null,
      sample: actor.pos.clone(), from: actor.pos.clone(), down: actor.pos.clone().set(0, -1, 0),
      hit: { point: actor.pos.clone(), normal: actor.pos.clone(), hit: false },
      direction: actor.pos.clone(), connected: false, carry: 0, index: 0, lastStamp: null };
  }
  const direction = runner._dodgeDir;
  if (!direction || !(Math.hypot(direction.x, direction.z) > EPS)) return 0;
  state.direction.copy(direction).setY(0).normalize();
  let area = 0;
  const stamp = point => {
    state.from.copy(point).setY(point.y + .35);
    const hit = game.physics.raycast(state.from, state.down, 1.2 * (weapon.rollPaintWorldScale || 1), state.hit, true);
    if (!hit?.hit || hit.normal.y <= .55) return;
    state.sample.copy(hit.point).addScaledVector(hit.normal, SURFACE_OFFSET);
    const painted = game.paint.splat(state.sample, slideStampRadius(half), actor.team, {
      kind: 'roll', stretch: state.direction, stretchAmt: 0,
      seed: stampSeed(actor.nid ?? 'local', state.token ?? 0, state.index++)
    });
    if (Number.isFinite(painted)) area += painted;
    state.lastStamp = point.clone();
  };
  if (!actor.grounded) {
    state.connected = false; state.initial = null; state.carry = 0; state.last.copy(actor.pos);
    return 0;
  }
  if (!state.connected) {
    state.connected = true; state.carry = 0; state.last.copy(state.initial ?? actor.pos);
    state.initial = null; stamp(state.last);
  }
  {
    const distance = state.last.distanceTo(actor.pos), spacing = half * .5;
    // A discontinuous teleport must not paint a bridge across the map.
    if (distance > Math.max(20 * (weapon.rollPaintWorldScale || 1), half * 12)) {
      state.carry = 0; stamp(actor.pos);
    } else if (distance > EPS) {
      let along = spacing - state.carry;
      for (; along <= distance + EPS; along += spacing) {
        const point = state.last.clone().lerp(actor.pos, Math.min(1, along / distance));
        stamp(point);
      }
      state.carry = (state.carry + distance) % spacing;
      if (state.carry < EPS || spacing - state.carry < EPS) state.carry = 0;
    }
    state.last.copy(actor.pos);
  }
  if (ending && (!state.lastStamp || state.lastStamp.distanceToSquared(actor.pos) > EPS * EPS)) stamp(actor.pos);
  if (area) actor.addTurf(area);
  return area;
}

export function installDualiesSlidePaint({ WeaponRunner, WEAPONS, G }, profile) {
  configureDualiesSlidePaint(WEAPONS, profile);
  const run = WeaponRunner.prototype._dualies, reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype._dualies = function (dt, input, weapon) {
    if (!this.dodge) return run.call(this, dt, input, weapon);
    paintDualiesSlide(G, this, weapon, this.dodge.t + dt + EPS >= this.dodge.dur);
    // Suppress only the legacy roll blobs; keep all movement and shot gates native.
    const previous = this.rollPaint;
    this.rollPaint = Infinity;
    try { return run.call(this, dt, input, weapon); }
    finally { this.rollPaint = previous; }
  };
  WeaponRunner.prototype.reset = function (...args) {
    this.s3SlidePaint = null;
    return reset.apply(this, args);
  };
}
