// PR1188 (A07/A08): main-weapon knockback from pinned 11.3.0 records.
//
// Blaster: BlastParam.KnockBackParam {Accel, Bias, Distance} is the same
// spl__BulletBlastParam record type as the Splat Bomb's. It therefore uses the
// repository's existing, documented Issue #535 law (splatBombKnockbackDelta):
// Accel in legacy DU/s^2 (1 DU = 0.1 world unit) applied for one 60 Hz
// reference step, attenuated by (1 - d/Distance)^Bias, along centre -> body.
// A shot-collision burst (terrain contact or direct hit) uses the reduced blast
// volume (ShotCollisionHitRadiusRate) for Distance as well (model choice).
//
// Roller: BodyParam.CollisionParam.KnockBackOpponent and
// KnockBackRollerPlayerDamageOn/Off {AccelMin, AccelMax, MyVelocityRate,
// OpponentVelocityRate}. Model (no published integrator): accel =
// clamp(AccelMin + MyVelocityRate * myClosing + OpponentVelocityRate *
// opponentClosing, AccelMin, AccelMax), closing speeds in source units per
// frame along the horizontal roller -> opponent axis, converted with the same
// #535 law. Opponent is pushed away from the drum; the roller recoils.
//
// Authority: velocity is only ever changed on the client that simulates the
// body (victim.remote === false / attacker.remote === false). A remote victim
// receives its knockback when its own client applies the replicated roll hit
// (NetMatch._hit -> Projectiles.applyHit) against the replicated rolling flag
// and drum geometry, so no packet field is added.
import { splatBombKnockbackDelta } from './sub-special-fidelity.mjs';
import { agent3RollerBodyContact } from './agent3-weapon-physics.mjs';
import { blasterBlastExposed } from './blast-occlusion.mjs';

const INSTALLED = Symbol.for('inkwave.pr1188.main-knockback');
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
let api = null, completion = null;

export function knockbackDeltaForAccel(accel) {
  return splatBombKnockbackDelta(0, { accel, bias: 0, distance: 1 });
}

export function blasterKnockbackSpec(raw, scale = 1, reduced = false, reducedRate = 1) {
  const k = raw?.BlastParam?.KnockBackParam;
  if (!k || ![k.Accel, k.Distance].every(v => Number.isFinite(v) && v > 0)) return null;
  const rate = reduced && Number.isFinite(reducedRate) && reducedRate > 0 ? reducedRate : 1;
  return { accel: k.Accel, bias: Number.isFinite(k.Bias) ? k.Bias : 1, distance: k.Distance * scale * rate };
}

// Returns the number of locally simulated bodies that were pushed.
export function applyBlasterBurstKnockback(game, p, point, victim, { raw, scale = 1, PLAYER } = {}) {
  const w = p?.s3Weapon || p?.owner?.weapon;
  if (!game?.actors || !point || p?.s3SpecialWeapon || w?.kind !== 'blaster') return 0;
  const reduced = !!p.s3TerrainBurst || (!!victim && victim !== 'boss');
  const spec = blasterKnockbackSpec(raw, scale, reduced, w.terrainSplashRadiusRate);
  if (!spec) return 0;
  let pushed = 0;
  for (const e of game.actors) {
    if (!e || e.team === p.team || !e.alive || e.remote || !e.vel) continue;
    const tx = e.pos.x - point.x, ty = e.pos.y + .7 - point.y, tz = e.pos.z - point.z;
    const d = Math.hypot(tx, ty, tz);
    if (!(d > 1e-9) || d >= spec.distance) continue;
    if (PLAYER && game.physics && !blasterBlastExposed(game.physics, point, e, PLAYER)) continue;
    const dv = splatBombKnockbackDelta(d, spec);
    if (!(dv > 0)) continue;
    e.vel.x += tx / d * dv; e.vel.y += ty / d * dv; e.vel.z += tz / d * dv;
    e.s3LastKnockback = { source: 'blaster', dv, distance: d };
    pushed++;
  }
  return pushed;
}

export function rollerContactAccel(record, myClosing, opponentClosing) {
  if (!record) return 0;
  const min = Number(record.AccelMin), max = Number(record.AccelMax);
  if (![min, max].every(Number.isFinite) || max < min) return 0;
  const accel = min + (Number(record.MyVelocityRate) || 0) * Math.max(0, myClosing)
    + (Number(record.OpponentVelocityRate) || 0) * Math.max(0, opponentClosing);
  return clamp(accel, min, max);
}

export function applyRollerContactKnockback(attacker, victim, damageOn, collision, scale = 1) {
  if (!collision || !attacker?.pos || !victim?.pos) return null;
  let nx = victim.pos.x - attacker.pos.x, nz = victim.pos.z - attacker.pos.z;
  const len = Math.hypot(nx, nz);
  if (len > 1e-9) { nx /= len; nz /= len; } else { nx = Math.sin(attacker.yaw || 0); nz = Math.cos(attacker.yaw || 0); }
  // Closing speeds in source units per 60 Hz frame.
  const perFrame = 1 / (60 * (scale > 0 ? scale : 1));
  const my = ((attacker.vel?.x || 0) * nx + (attacker.vel?.z || 0) * nz) * perFrame;
  const opp = -((victim.vel?.x || 0) * nx + (victim.vel?.z || 0) * nz) * perFrame;
  const result = { opponent: 0, self: 0 };
  if (!victim.remote && victim.alive && victim.vel) {
    const dv = knockbackDeltaForAccel(rollerContactAccel(collision.KnockBackOpponent, my, opp));
    victim.vel.x += nx * dv; victim.vel.z += nz * dv; result.opponent = dv;
    victim.s3LastKnockback = { source: 'roller-opponent', dv };
  }
  if (!attacker.remote && attacker.vel) {
    const record = damageOn ? collision.KnockBackRollerPlayerDamageOn : collision.KnockBackRollerPlayerDamageOff;
    const dv = knockbackDeltaForAccel(rollerContactAccel(record, my, opp));
    attacker.vel.x -= nx * dv; attacker.vel.z -= nz * dv; result.self = dv;
    attacker.s3LastKnockback = { source: damageOn ? 'roller-self-damage-on' : 'roller-self-damage-off', dv };
  }
  return result;
}

export function installMainKnockback(context, profile) {
  const { Projectiles } = context;
  if (!Projectiles?.prototype || Projectiles.prototype[INSTALLED]) return;
  Object.defineProperty(Projectiles.prototype, INSTALLED, { value: true });
  api = context; completion = profile?.weaponsFidelityCompletion;
  const collision = completion?.weapons?.roller?.BodyParam?.CollisionParam;
  const scale = completion?.worldUnitsPerSourceUnit ?? 1;
  const applyHit = Projectiles.prototype.applyHit;
  Projectiles.prototype.applyHit = function (attacker, victim, amount, weaponId, ...rest) {
    const alive = !!victim?.alive, hp = victim?.hp;
    const result = applyHit.call(this, attacker, victim, amount, weaponId, ...rest);
    if (weaponId !== 'roller' || !collision || attacker?.weapon?.kind !== 'roller' || !attacker.weaponRunner?.rolling ||
        !alive || !victim?.alive || attacker.team === victim.team) return result;
    const speed = Math.hypot(attacker.vel?.x || 0, attacker.vel?.z || 0);
    if (!agent3RollerBodyContact(attacker, victim, speed, true)) return result;
    const rejected = result === 'rejected' || result === 'rejected-invulnerable' || (victim.invuln > 0 && hp === victim.hp);
    applyRollerContactKnockback(attacker, victim, !rejected && amount > 0, collision, scale);
    return result;
  };
}
