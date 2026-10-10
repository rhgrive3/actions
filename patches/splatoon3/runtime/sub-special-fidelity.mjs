import { slamProtected } from './tidal-slam-gauge.mjs';
// Authoritative Sub/Special gameplay fidelity overlay for the pinned Splatoon 3 11.3.0 profile.
// Numeric constants here are only fields that map directly to extracted parameters or strongly established behavior.

export const SUB_SPECIAL_FIDELITY = Object.freeze({
  schema: 1,
  referenceVersion: '11.3.0',
  bomb: Object.freeze({
    spawnSpeedZ: 1.12 * 60,
    spawnSpeedY: 0.24 * 60,
    spawnSpeedYWorldMin: -0.4 * 60,
    inheritX: 1.6,
    inheritYPlus: 4.0,
    inheritYMax: 0.32 * 60,
    // WeaponBombSplat.MoveParam: contact drag is expressed as a fraction of
    // velocity removed per 60 Hz ground step. The source provides horizontal
    // and 50-degree endpoints for translation and rotation separately.
    groundPositionHorizonAirResist: 0.19,
    groundPositionDeg50AirResist: 0.28,
    groundRotateHorizonAirResist: 0.35,
    groundRotateDeg50AirResist: 0.50,
    groundReferenceDeg: 50,
    hitVerticalWallReboundMaxRate: 0.70,
    knockback: Object.freeze({ accel: 700, bias: 0.8, distance: 12 }),
    splashAroundCount: 15,
    splashAroundPaintRadius: 1.064,
    splashAroundOffsetY: 0.3,
    paintOffsetY: 0.1,
  }),
  storm: Object.freeze({
    spawnSpeedZ: 1.12 * 60,
    spawnSpeedY: 0.24 * 60,
    spawnSpeedYWorldMin: -0.4 * 60,
    inheritX: 1.6,
    inheritYPlus: 4.0,
    inheritYMax: 0.16 * 60,
    dps: 24,
    duration: 8,
    radius: 10,
    rainNumReference: 72,
  }),
});

const INSTALL = Symbol.for('inkwave.s3.sub-special-fidelity.install.v1');
const THROW_KIND = Symbol('inkwave.s3.sub-special-fidelity.throw-kind');
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function assertNear(actual, expected, label, eps = 1e-9) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > eps) {
    throw new Error(`INKWAVE sub/special compatibility conflict: ${label}=${actual}, expected ${expected}`);
  }
}

function localRng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, value) {
  const n = Number.isFinite(value) ? Math.round(value * 4096) : 0;
  seed ^= n + 0x9e3779b9 + ((seed << 6) >>> 0) + (seed >>> 2);
  return Math.imul(seed ^ (seed >>> 16), 0x85ebca6b) >>> 0;
}

function bombSeed(b) {
  let seed = 0x5b1a7b0d;
  for (const v of [b.pos?.x, b.pos?.y, b.pos?.z, b.spin?.x, b.spin?.y, b.owner?.team, b.age]) seed = mixSeed(seed, v);
  return seed >>> 0;
}

// Splat Bomb contact response. Ground translation/rotation resistance uses
// the extracted 0-degree and 50-degree MoveParam endpoints. Splatoon parameter
// documentation describes these AirResist fields as a velocity-proportional
// deceleration term, so a 60 Hz contact step retains (1 - resist). The two
// endpoint records imply a slope interpolation; clamp above the 50-degree
// reference instead of the old binary normal.y > 0.6 threshold.
export function splatBombGroundResistance(normalY, rotate = false, spec = SUB_SPECIAL_FIDELITY.bomb) {
  const y = clamp(Number.isFinite(normalY) ? normalY : 1, 0, 1);
  const deg = Math.acos(y) * 180 / Math.PI;
  const t = clamp(deg / spec.groundReferenceDeg, 0, 1);
  const a = rotate ? spec.groundRotateHorizonAirResist : spec.groundPositionHorizonAirResist;
  const b = rotate ? spec.groundRotateDeg50AirResist : spec.groundPositionDeg50AirResist;
  return a + (b - a) * t;
}

export function applySplatBombSurfaceResponse(b, normal, spec = SUB_SPECIAL_FIDELITY.bomb) {
  if (!b?.vel || !normal) return b;
  const vn = b.vel.x * normal.x + b.vel.y * normal.y + b.vel.z * normal.z;
  // Ground/slope contact owns the sourced positional + rotational drag. Keep
  // the legacy normal rebound amount for now; #557 separately owns vertical-
  // wall rebound and must not be smuggled into this change.
  if (normal.y > 1e-6) {
    const tx = b.vel.x - vn * normal.x;
    const ty = b.vel.y - vn * normal.y;
    const tz = b.vel.z - vn * normal.z;
    const retain = 1 - splatBombGroundResistance(normal.y, false, spec);
    const rebound = vn < 0 ? -vn * 0.35 * 0.45 : vn;
    b.vel.x = tx * retain + normal.x * rebound;
    b.vel.y = ty * retain + normal.y * rebound;
    b.vel.z = tz * retain + normal.z * rebound;
    if (b.spin?.multiplyScalar) b.spin.multiplyScalar(1 - splatBombGroundResistance(normal.y, true, spec));
    return b;
  }
  // Vertical walls own a dedicated S3 rebound *maximum*. Treat the field as
  // a cap on the outgoing normal component relative to incoming total speed,
  // rather than a universal 0.7 multiplier: perpendicular contact reaches the
  // cap, while oblique contact preserves only its smaller incoming normal
  // component. Tangential retention stays on the pre-existing 0.6 wall path.
  if (Math.abs(normal.y) <= 1e-6 && vn < 0) {
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    const rebound = Math.min(-vn, speed * spec.hitVerticalWallReboundMaxRate);
    const tx = b.vel.x - vn * normal.x;
    const ty = b.vel.y - vn * normal.y;
    const tz = b.vel.z - vn * normal.z;
    b.vel.x = tx * 0.6 + normal.x * rebound;
    b.vel.y = ty * 0.6 + normal.y * rebound;
    b.vel.z = tz * 0.6 + normal.z * rebound;
    return b;
  }
  // Ceilings/non-vertical non-ground contacts retain the previous generic law.
  b.vel.x -= normal.x * vn * 1.35;
  b.vel.y -= normal.y * vn * 1.35;
  b.vel.z -= normal.z * vn * 1.35;
  b.vel.multiplyScalar?.(0.6);
  return b;
}

// Issue #535 — Splat Bomb blast knockback. S3's public parameter mirrors
// expose Accel=700, Bias=.8, Distance=12 but do not publish the engine's
// private integrator. Keep the mapping explicit and testable instead of hiding
// a magic velocity: S3 distance fields are metres (50 DU = 5 m), so one legacy
// DU is .1 world metre; an instantaneous blast contributes one 60-Hz reference
// acceleration step. Bias shapes the normalized remaining-range response as an
// exponent (bias=0 => constant in-range strength, matching direct-contact style
// records that carry Bias=0). This is the repository's documented calibration
// model, not a claim that Nintendo exposes this exact internal formula.
export const SPLAT_BOMB_KNOCKBACK_MODEL = Object.freeze({
  referenceHz: 60,
  duPerWorldUnit: 10,
});

export function splatBombKnockbackDelta(distance, spec = SUB_SPECIAL_FIDELITY.bomb.knockback) {
  if (!spec || !Number.isFinite(distance) || !Number.isFinite(spec.distance) || !(spec.distance > 0)
    || distance >= spec.distance || !Number.isFinite(spec.accel) || !(spec.accel > 0)) return 0;
  const remaining = clamp(1 - distance / spec.distance, 0, 1);
  const bias = Number.isFinite(spec.bias) ? Math.max(0, spec.bias) : 1;
  const attenuation = bias === 0 ? (remaining > 0 ? 1 : 0) : Math.pow(remaining, bias);
  const accelWorldPerSecond2 = spec.accel / SPLAT_BOMB_KNOCKBACK_MODEL.duPerWorldUnit;
  return accelWorldPerSecond2 / SPLAT_BOMB_KNOCKBACK_MODEL.referenceHz * attenuation;
}

export function applySplatBombKnockback(bomb, victim, center, targetPoint, distance,
  spec = SUB_SPECIAL_FIDELITY.bomb.knockback) {
  if (!victim?.alive || victim.remote || !victim.vel || !center || !targetPoint) return false;
  // Network bomb damage is recipient-authoritative. Reject an old ghost against
  // a newer life here too, including the damage-free 7..12 m knockback annulus.
  if (bomb?.ghost) {
    const detonation = Number.isFinite(bomb._netBornLocal) && Number.isFinite(bomb.age)
      ? bomb._netBornLocal + bomb.age : NaN;
    if (!Number.isFinite(detonation) || !Number.isFinite(victim._netLifeStartedAt)
      || victim._netLifeStartedAt > detonation) return false;
  }
  const dv = splatBombKnockbackDelta(distance, spec);
  if (!(dv > 0) || !(distance > 1e-9)) return false; // source default DirectionZeroAccelRate = 0
  const dx = targetPoint.x - center.x, dy = targetPoint.y - center.y, dz = targetPoint.z - center.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-9)) return false;
  victim.vel.x += dx / len * dv;
  victim.vel.y += dy / len * dv;
  victim.vel.z += dz / len * dv;
  return true;
}

// #574: standard Blaster air-burst contact. The tuple is pinned S3 data;
// its conversion uses exactly the existing #535 INKWAVE calibration above.
// Nintendo's Accel/Bias integrator, terrain and direct-hit response remain
// unverified. Do not present this response as retail-physics equivalence.
export const BLASTER_KNOCKBACK = Object.freeze({ accel: 700, bias: 0.8, distance: 3.5 });
const blasterPending = new WeakMap(), blasterMovementStep = new WeakMap();

function installBlasterKnockbackMovement(Actor) {
  const update = Actor.prototype.update, horizontal = Actor.prototype._horizontal, reset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    blasterPending.delete(this); blasterMovementStep.delete(this);
    return reset.apply(this, args);
  };
  Actor.prototype.update = function (dt, ...args) {
    if (!(dt > 0)) return update.call(this, dt, ...args);
    const pending = blasterPending.get(this);
    blasterPending.delete(this);
    if (pending) blasterMovementStep.set(this, pending);
    try { return update.call(this, dt, ...args); }
    finally { blasterMovementStep.delete(this); }
  };
  Actor.prototype._horizontal = function (...args) {
    const pending = blasterMovementStep.get(this);
    if (!pending) return horizontal.apply(this, args);
    blasterMovementStep.delete(this);
    // Input acceleration must not erase a new external impulse before it ever
    // reaches the ordinary body/terrain integrator. Protect it for one update
    // only; subsequent steering/braking uses the existing movement model.
    this.vel.x -= pending.x; this.vel.z -= pending.z;
    try { return horizontal.apply(this, args); }
    finally { this.vel.x += pending.x; this.vel.z += pending.z; }
  };
}

// Carry source-to-target geometry, never a client-selected velocity/force.
// The recipient re-derives a bounded delta using the same local source tuple.
export function validBlasterKnockback(offset) {
  if (!Array.isArray(offset) || offset.length !== 3 || !offset.every(Number.isFinite)) return false;
  const distance = Math.hypot(...offset);
  return distance > 1e-9 && distance < BLASTER_KNOCKBACK.distance;
}

export function applyBlasterKnockback(victim, offset) {
  if (!validBlasterKnockback(offset) || !victim?.alive || victim.remote || !victim.vel
    || victim.invuln > 0 || slamProtected(victim)) return false;
  const distance = Math.hypot(...offset);
  const delta = splatBombKnockbackDelta(distance, BLASTER_KNOCKBACK);
  const dx = offset[0] / distance * delta, dz = offset[2] / distance * delta;
  victim.vel.x += dx;
  victim.vel.y += offset[1] / distance * delta;
  victim.vel.z += dz;
  const pending = blasterPending.get(victim) || { x: 0, z: 0 };
  pending.x += dx; pending.z += dz; blasterPending.set(victim, pending);
  return true;
}

export function applyBlasterBlastContact(system, projectile, victim, center, target, damage, netmatch) {
  if (projectile.ghost || !victim?.alive || victim.team === projectile.team) return 'rejected';
  // Terrain radius/damage already have a separate source-backed owner. Their
  // knockback scaling is not established, so retain that path unchanged.
  const offset = projectile.s3TerrainBurst ? null
    : [target.x - center.x, target.y - center.y, target.z - center.z];
  const knockback = validBlasterKnockback(offset) ? offset : null;
  if (!(damage > 0) && !knockback) return 'rejected';
  const route = netmatch?.shouldApplyHit?.(projectile.owner, victim, 'blaster') ?? (victim.remote ? 'drop' : 'local');
  if (route === 'drop') return 'rejected';
  if (victim.invuln > 0 || slamProtected(victim)) return 'rejected-invulnerable';
  if (!(damage > 0) && system.kitBarrierCandidate?.({ owner: projectile.owner, team: projectile.team,
    damage: 0, size: 0, ghost: false }, center, target)) return 'rejected';
  // The source contact owns the optional wire field only for this synchronous
  // call. Existing damage wrappers need no new argument, and finally prevents
  // an exception/reentrant hit from leaking metadata into the next attack.
  const previous = netmatch?._s3BlasterKnockback;
  if (netmatch) netmatch._s3BlasterKnockback = knockback
    ? { attacker: projectile.owner, victim, offset: knockback } : null;
  let admission;
  try {
    admission = damage > 0
      ? system.applyHit(projectile.owner, victim, damage, 'blaster')
      : route === 'send' ? (netmatch.sendHit(projectile.owner, victim, 0, 'blaster') ? 'pending' : 'rejected') : 'accepted';
  } finally { if (netmatch) netmatch._s3BlasterKnockback = previous; }
  if (route === 'local' && admission === 'accepted' && knockback) applyBlasterKnockback(victim, knockback);
  return admission;
}

export function fidelityThrowVelocity(actor, kind, out, forwardSpeed, override) {
  const p = override || (kind === 'storm' ? SUB_SPECIAL_FIDELITY.storm : SUB_SPECIAL_FIDELITY.bomb);
  const speed = Number.isFinite(forwardSpeed) ? forwardSpeed : p.spawnSpeedZ;
  const pitch = clamp(actor.aimPitch || 0, -1.05, 1.15);
  const yaw = actor.aimYaw || 0;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const horizontal = speed * cp - p.spawnSpeedY * sp;
  let vy = speed * sp + p.spawnSpeedY * cp;
  const av = actor.vel || { x: 0, y: 0, z: 0 };
  vy += Math.min(Math.max(0, av.y || 0) * p.inheritYPlus, p.inheritYMax);
  vy = Math.max(p.spawnSpeedYWorldMin, vy);
  return out.set(
    Math.sin(yaw) * horizontal + (av.x || 0) * p.inheritX,
    vy,
    Math.cos(yaw) * horizontal + (av.z || 0) * p.inheritX,
  );
}

export function installSubSpecialFidelity(api, profile) {
  const { THREE, G, PLAYER, SUB, SPECIALS, Actor, Projectiles } = api;
  if (Projectiles.prototype[INSTALL]) return;
  if (profile?.referenceVersion !== SUB_SPECIAL_FIDELITY.referenceVersion) {
    throw new Error(`Unsupported sub/special reference ${profile?.referenceVersion}`);
  }

  assertNear(SUB.bomb.throwSpeed, SUB_SPECIAL_FIDELITY.bomb.spawnSpeedZ, 'bomb.throwSpeed');
  assertNear(SUB.bomb.gravity, 0.016 * 3600, 'bomb.gravity');
  assertNear(SUB.bomb.fuse, 1, 'bomb.fuse');
  assertNear(profile?.specials?.storm?.duration, SUB_SPECIAL_FIDELITY.storm.duration, 'profile.specials.storm.duration');
  assertNear(profile?.specials?.storm?.radius, SUB_SPECIAL_FIDELITY.storm.radius, 'profile.specials.storm.radius');
  const blasterKnockback = profile?.weaponsFidelityCompletion?.weapons?.blaster?.BlastParam?.KnockBackParam;
  assertNear(blasterKnockback?.Accel, BLASTER_KNOCKBACK.accel, 'blaster.knockback.accel');
  assertNear(blasterKnockback?.Bias, BLASTER_KNOCKBACK.bias, 'blaster.knockback.bias');
  assertNear(blasterKnockback?.Distance, BLASTER_KNOCKBACK.distance, 'blaster.knockback.distance');
  installBlasterKnockbackMovement(Actor);

  Object.assign(SUB.bomb, {
    splashAroundCount: SUB_SPECIAL_FIDELITY.bomb.splashAroundCount,
    splashAroundPaintRadius: SUB_SPECIAL_FIDELITY.bomb.splashAroundPaintRadius,
  });
  Object.assign(SPECIALS.storm, profile.specials.storm, {
    dps: SUB_SPECIAL_FIDELITY.storm.dps,
    throwSpeed: SUB_SPECIAL_FIDELITY.storm.spawnSpeedZ,
    rainNumReference: SUB_SPECIAL_FIDELITY.storm.rainNumReference,
  });

  const throwVelocity = Projectiles.prototype.throwVelocity;
  Projectiles.prototype.throwVelocity = function (actor, speed, out) {
    const kind = this[THROW_KIND] === 'storm' ? 'storm' : 'bomb';
    return fidelityThrowVelocity(actor, kind, out, speed);
  };

  const throwStorm = Projectiles.prototype.throwStorm;
  Projectiles.prototype.throwStorm = function (...args) {
    this[THROW_KIND] = 'storm';
    try { return throwStorm.apply(this, args); }
    finally { delete this[THROW_KIND]; }
  };

  // Preserve native damage/LOS/FX/audio/network semantics while replacing only gameplay paint distribution.
  // The six native calls still evaluate their original Math.random expressions; their paint writes are intercepted.
  // The replacement 1+15 calls use a local deterministic RNG, so unrelated global RNG ordering is unchanged.
  const explodeBomb = Projectiles.prototype._explodeBomb;
  const c0 = new THREE.Vector3(), c1 = new THREE.Vector3();
  Projectiles.prototype._explodeBomb = function (b) {
    // Kit paint has its own single native owner; never intercept its stamps.
    if (!b.ghost && ['suction', 'curling'].includes(b.s3Resolved?.spec?.id)) return explodeBomb.call(this, b);
    const paint = G.paint;
    if (!paint?.splat) return explodeBomb.call(this, b);
    const nativeSplat = paint.splat;
    let intercepted = 0;
    paint.splat = function (...args) {
      if (intercepted < 6) { intercepted++; return 0; }
      return nativeSplat.apply(this, args);
    };
    let result;
    try { result = explodeBomb.call(this, b); }
    finally { paint.splat = nativeSplat; }
    if (intercepted !== 6) throw new Error(`INKWAVE bomb paint compatibility conflict: intercepted ${intercepted}/6 native calls`);
    if (b.ghost) return result;

    const p = SUB_SPECIAL_FIDELITY.bomb, random = localRng(bombSeed(b));
    let area = nativeSplat.call(paint, c0.copy(b.pos).setY(b.pos.y + p.paintOffsetY), SUB.bomb.paintRadius, b.team, { seed: random(), claimOwner: b.owner });
    for (let i = 0; i < p.splashAroundCount; i++) {
      const angle = random() * TAU;
      const reach = SUB.bomb.paintRadius * (0.6 + random() * 0.4);
      c1.set(b.pos.x + Math.cos(angle) * reach, b.pos.y + p.splashAroundOffsetY, b.pos.z + Math.sin(angle) * reach);
      area += nativeSplat.call(paint, c1, p.splashAroundPaintRadius, b.team, { seed: random(), claimOwner: b.owner });
    }
    b.owner?.addTurf?.(area);
    return result;
  };

  const startSpecial = Actor.prototype._startSpecial;
  Actor.prototype._startSpecial = function (...args) {
    this.ink = PLAYER.inkMax;
    return startSpecial.apply(this, args);
  };

  // Triple Splashdown's Super-Jump variant is an admitted action, not the
  // ordinary rise/hang/fall state. Keep the active token only to lock/refill
  // semantics and replication while Super Jump remains authoritative.
  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const jump = this.superJumpState;
    const specialPressed = !!this.intent?.special && !this._prevIntent?.special;
    if (jump?.phase === 'flight' && specialPressed && !jump.s3SlamArmed
      && this.weapon?.special === 'slam' && this.specialReady()) {
      const token = { id: 'slam', t: 0, phase: 'superjump', armor: false, startY: this.pos.y, superJump: true };
      jump.s3SlamArmed = token;
      this.specialActive = token;
      this.special = 0;
      this.ink = PLAYER.inkMax;
      this.stats.specials++;
      api.emit('special:use', { actor: this, id: 'slam' });
      G.audio?.play('special_activate', { pos: this.isLocal ? undefined : this.pos, volume: this.isLocal ? 1 : 0.7 });
    }
    return actorUpdate.call(this, dt);
  };

  const updateSuperJump = Actor.prototype._updateSuperJump;
  Actor.prototype._updateSuperJump = function (...args) {
    const jump = this.superJumpState;
    const token = jump?.s3SlamArmed;
    const result = updateSuperJump.apply(this, args);
    if (token && this.superJumpState !== jump && this.alive && this.specialActive === token) {
      this.character.trigger('special_slam');
      try { this._slamImpact(SPECIALS.slam); }
      finally { if (this.specialActive === token) this.specialActive = null; }
      this.invuln = Math.max(this.invuln, 0.3);
    }
    return result;
  };

  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true, configurable: false });
  Object.defineProperty(Projectiles.prototype, Symbol.for('inkwave.s3.sub-special-fidelity.originals.v1'), {
    value: Object.freeze({ throwVelocity, explodeBomb }), configurable: false,
  });
}
