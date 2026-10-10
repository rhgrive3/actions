// #387: Splat Roller body-contact knockback from the pinned Ver. 11.3.0 record.
//
// Source (Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json,
// GameParameters.BodyParam.CollisionParam, sha256 prefix 5b423eb35d4cac26):
//   KnockBackOpponent              {AccelMin 420, AccelMax 800, MyVelocityRate 30,   OpponentVelocityRate 4800}
//   KnockBackRollerPlayerDamageOn  {AccelMin 410, AccelMax 550, MyVelocityRate 4800, OpponentVelocityRate 30}
//   KnockBackRollerPlayerDamageOff {AccelMin 280, AccelMax 280, MyVelocityRate 4800, OpponentVelocityRate 30}
//
// UNCONFIRMED (未確認): the published record gives no integrator. The unit of
// AccelMin/AccelMax, the unit of the velocity rates, and the combination rule are
// not verified against a primary source or a measurement. This module uses a
// documented model, not a confirmed match:
//   accel = clamp(AccelMin + MyVelocityRate * myClosing + OpponentVelocityRate * opponentClosing,
//                 AccelMin, AccelMax)
//   closing speeds: horizontal speed along the roller -> body axis, in source units per 60 Hz frame
//                   (world units per second / 60 / worldUnitsPerSourceUnit);
//   accel -> velocity step: the repository's #535 KnockBackParam law (splatBombKnockbackDelta),
//                   applied once per contact.
// Results must not be presented as measured Splat 3 knockback. Real-hardware
// comparison of the push and recoil distances remains 未確認.
//
// Authority: each body is only changed on the client that simulates it. A remote
// victim is pushed by its own client when that client applies the replicated roll
// hit; a remote roller's recoil is applied by its own client.
import { splatBombKnockbackDelta } from './sub-special-fidelity.mjs';
import { agent3RollerBodyContact } from './agent3-weapon-physics.mjs';

const INSTALLED = Symbol.for('inkwave.issue387.roller-body-knockback');
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Accel (source units per second^2, per the #535 law) -> one 60 Hz velocity step.
export function knockbackDeltaForAccel(accel) {
  return splatBombKnockbackDelta(0, { accel, bias: 0, distance: 1 });
}

export function rollerContactAccel(record, myClosing, opponentClosing) {
  if (!record) return 0;
  const min = Number(record.AccelMin), max = Number(record.AccelMax);
  if (![min, max].every(Number.isFinite) || max < min) return 0;
  const accel = min + (Number(record.MyVelocityRate) || 0) * Math.max(0, myClosing)
    + (Number(record.OpponentVelocityRate) || 0) * Math.max(0, opponentClosing);
  return clamp(accel, min, max);
}

// A local roller reads its own WeaponRunner. A remote roller has no simulated
// runner here; its rolling flag arrives in the replicated presentation pose
// (network-replication/roller-presentation.mjs writes actor.character.s3RollerFlick).
export function isRollingContact(attacker) {
  if (attacker?.remote) return attacker.character?.s3RollerFlick?.rolling === true;
  return attacker?.weaponRunner?.rolling === true;
}

export function applyRollerContactKnockback(attacker, victim, damageOn, collision, scale = 1) {
  if (!collision || !attacker?.pos || !victim?.pos) return null;
  let nx = victim.pos.x - attacker.pos.x, nz = victim.pos.z - attacker.pos.z;
  const len = Math.hypot(nx, nz);
  if (len > 1e-9) { nx /= len; nz /= len; } else { nx = Math.sin(attacker.yaw || 0); nz = Math.cos(attacker.yaw || 0); }
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

// Runs after the damage route. A roller contact that kills the victim gets no
// knockback, because the issue scope is survivable contact.
export function installRollerBodyKnockback(context, profile) {
  const { Projectiles } = context;
  if (!Projectiles?.prototype || Projectiles.prototype[INSTALLED]) return;
  Object.defineProperty(Projectiles.prototype, INSTALLED, { value: true });
  const completion = profile?.weaponsFidelityCompletion;
  const collision = completion?.weapons?.roller?.BodyParam?.CollisionParam;
  const scale = completion?.worldUnitsPerSourceUnit ?? 1;
  const applyHit = Projectiles.prototype.applyHit;
  Projectiles.prototype.applyHit = function (attacker, victim, amount, weaponId, ...rest) {
    const alive = !!victim?.alive, hp = victim?.hp;
    const result = applyHit.call(this, attacker, victim, amount, weaponId, ...rest);
    // hp <= 0 after the damage route means the contact is lethal (Actor.damage lowers hp; the death itself is handled later).
    if (weaponId !== 'roller' || !collision || attacker?.weapon?.kind !== 'roller' || !isRollingContact(attacker) ||
        !alive || !victim?.alive || !(victim.hp > 0) || attacker.team === victim.team) return result;
    const speed = Math.hypot(attacker.vel?.x || 0, attacker.vel?.z || 0);
    if (!agent3RollerBodyContact(attacker, victim, speed, true)) return result;
    const rejected = result === 'rejected' || result === 'rejected-invulnerable' || (victim.invuln > 0 && hp === victim.hp);
    applyRollerContactKnockback(attacker, victim, !rejected && amount > 0, collision, scale);
    return result;
  };
}
