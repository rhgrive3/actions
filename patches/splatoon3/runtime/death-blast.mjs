// Player death blast from the pinned Ver. 11.3.0 SplPlayer DieBlastParam.
//
// Source (Leanny/splat3 7280ff9c, data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json):
//   DieBlastParam {PaintRadius 5.0, CollisionRadiusForPaint 5.0, PaintOffsetY 0.1,
//                  KnockBackParam.Accel 0.0, SplashAroundParam {Num 10, PaintRadius 1.0,
//                  PitchMax 45.0, VelocityMin 0.54, VelocityMax 0.72}}
// The table is a sparse override table, so these fields are explicit values,
// not defaults. Raw distances are used as world units, the same convention as
// the Splat Bomb DistanceDamage bands (3.6 / 7.0) in profile.bomb.
//
// The upstream Actor.splat paints one radius-1.7 blob 0.35 above the feet.
// This replaces only that call with the source radius and the ten around
// droplets. Native paint ownership, combat credit (burstArea), network
// recording and the splatted event keep their original call order.
//
// Not modelled (recorded as unverified in the behavior report):
// - droplet flight. VelocityMin/Max and PitchMax are pinned, but the droplet
//   gravity/drag defaults are omitted from the table. Droplets use the same
//   landing-ring calibration as the Splat Bomb SplashAround (sub-special-fidelity).
// - SplashAroundParam.OffsetY is an omitted default; droplets use PaintOffsetY.
// - Death00 texture shape; PaintSystem keeps its own seeded blob shape.
// - whether Splatoon 3 credits this ink to the attacker's points. The existing
//   INKWAVE credit rule is unchanged; only the painted area follows the source.

const INSTALLED = Symbol.for('inkwave.s3.death-blast.v1');
const TAU = Math.PI * 2;
// Upstream inkwave-public/src/game/actor.js splat(): G.paint.splat(_v, 1.7, attacker.team, ...)
export const NATIVE_DEATH_BURST_RADIUS = 1.7;

function seededRandom(seed) {
  let s = Math.floor((Number.isFinite(seed) ? seed : 0) * 0x100000000) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateDeathBlast(spec) {
  for (const key of ['paintRadius', 'paintOffsetY', 'splashAroundPaintRadius']) {
    if (!Number.isFinite(spec?.[key]) || spec[key] < 0) throw new Error(`INKWAVE death blast: invalid ${key}`);
  }
  if (!Number.isSafeInteger(spec.splashAroundCount) || spec.splashAroundCount < 0) throw new Error('INKWAVE death blast: invalid splashAroundCount');
  return spec;
}

// Deterministic paint plan for one death. `seed` is the native call's own
// Math.random() seed, so no extra global random numbers are consumed.
export function deathBlastPlan(position, seed, spec) {
  const random = seededRandom(seed);
  const y = position.y + spec.paintOffsetY;
  const plan = [{ x: position.x, y, z: position.z, radius: spec.paintRadius, seed }];
  for (let i = 0; i < spec.splashAroundCount; i++) {
    const angle = random() * TAU;
    const reach = spec.paintRadius * (0.6 + random() * 0.4);
    plan.push({ x: position.x + Math.cos(angle) * reach, y, z: position.z + Math.sin(angle) * reach,
      radius: spec.splashAroundPaintRadius, seed: random() });
  }
  return plan;
}

export function installDeathBlast(api, profile) {
  const { Actor, G, THREE } = api;
  if (Actor.prototype[INSTALLED]) return;
  const spec = Object.freeze(validateDeathBlast({ ...profile.deathBlast }));
  const point = new THREE.Vector3();
  const splat = Actor.prototype.splat;

  function paintBlast(paint, nativeSplat, victim, attacker, team, opts) {
    const plan = deathBlastPlan(victim.pos, opts?.seed, spec);
    let area = 0;
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      // The first call keeps the native options so the ownership slot armed
      // for it (G.paint._paintNextOwner) is consumed exactly as before.
      const callOpts = i === 0 ? { ...opts, seed: p.seed } : { seed: p.seed, claimOwner: attacker };
      area += Number(nativeSplat.call(paint, point.set(p.x, p.y, p.z), p.radius, team, callOpts)) || 0;
    }
    return area;
  }

  Actor.prototype.splat = function (attacker, ...rest) {
    const paint = G.paint;
    if (!this.alive || !attacker || typeof paint?.splat !== 'function') return splat.call(this, attacker, ...rest);
    const own = Object.prototype.hasOwnProperty.call(paint, 'splat');
    const nativeSplat = paint.splat, victim = this;
    let replaced = false;
    paint.splat = function (center, radius, team, opts = {}) {
      if (!replaced && radius === NATIVE_DEATH_BURST_RADIUS && team === attacker.team) {
        replaced = true;
        return paintBlast(this, nativeSplat, victim, attacker, team, opts);
      }
      return nativeSplat.call(this, center, radius, team, opts);
    };
    try { return splat.call(this, attacker, ...rest); }
    finally {
      if (own) paint.splat = nativeSplat;
      else delete paint.splat;
    }
  };
  Object.defineProperty(Actor.prototype, INSTALLED, { value: Object.freeze({ splat, spec }) });
}
