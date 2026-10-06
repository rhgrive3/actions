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

export function fidelityThrowVelocity(actor, kind, out) {
  const p = kind === 'storm' ? SUB_SPECIAL_FIDELITY.storm : SUB_SPECIAL_FIDELITY.bomb;
  const pitch = clamp(actor.aimPitch || 0, -1.05, 1.15);
  const yaw = actor.aimYaw || 0;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const horizontal = p.spawnSpeedZ * cp - p.spawnSpeedY * sp;
  let vy = p.spawnSpeedZ * sp + p.spawnSpeedY * cp;
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
  Projectiles.prototype.throwVelocity = function (actor, _speed, out) {
    const kind = this[THROW_KIND] === 'storm' ? 'storm' : 'bomb';
    return fidelityThrowVelocity(actor, kind, out);
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
    let area = nativeSplat.call(paint, c0.copy(b.pos).setY(b.pos.y + p.paintOffsetY), SUB.bomb.paintRadius, b.team, { seed: random() });
    for (let i = 0; i < p.splashAroundCount; i++) {
      const angle = random() * TAU;
      const reach = SUB.bomb.paintRadius * (0.6 + random() * 0.4);
      c1.set(b.pos.x + Math.cos(angle) * reach, b.pos.y + p.splashAroundOffsetY, b.pos.z + Math.sin(angle) * reach);
      area += nativeSplat.call(paint, c1, p.splashAroundPaintRadius, b.team, { seed: random() });
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
