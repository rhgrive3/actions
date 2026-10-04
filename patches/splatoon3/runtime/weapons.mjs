import { installRollerLogic } from './roller.mjs';
let api;
export function splatlingBurst(w, charge) {
  const boundary = w.firstChargeTime / w.chargeTime, c = Math.max(0, Math.min(1, charge));
  return c <= boundary ? w.burstFirst * c / boundary : w.burstFirst + (w.burstMax - w.burstFirst) * (c - boundary) / (1 - boundary);
}
export function splatlingChargeCap(ink, w) {
  const fraction = Math.max(0, Math.min(1, ink / w.inkFull)), first = w.burstFirst / w.burstMax, boundary = w.firstChargeTime / w.chargeTime;
  return fraction <= first ? fraction / first * boundary : boundary + (fraction - first) / (1 - first) * (1 - boundary);
}
export function ageDamage(weapon, age, baseDamage) {
  if (!(weapon.damageReduceEnd > weapon.damageReduceStart) || weapon.damageReduceStart < 0) return baseDamage;
  const k = Math.max(0, Math.min(1, (age - weapon.damageReduceStart) / (weapon.damageReduceEnd - weapon.damageReduceStart)));
  return weapon.damage + (weapon.damageMin - weapon.damage) * k;
}
export function groupDamage(group, victim, amount) {
  if (!group) return amount;
  const previous = group.get(victim) || 0;
  group.set(victim, Math.max(previous, amount));
  return Math.max(0, amount - previous);
}
export function distanceDamage(bands, distance, linear = true) {
  if (!bands?.length) return 0;
  if (distance <= bands[0][0]) return bands[0][1];
  for (let i = 1; i < bands.length; i++) if (distance <= bands[i][0]) {
    if (!linear) return bands[i][1];
    const [previous, damage] = bands[i - 1], [end, next] = bands[i];
    if (end === previous) return next;
    return damage + (next - damage) * (distance - previous) / (end - previous);
  }
  return bands[bands.length - 1][1];
}

const EPS = 1e-10;
export function projectileWorldHit(physics, from, to, radius, out, skipGrates = true) {
  if (!(radius > EPS) || !physics?.level?.queryBlocks || !physics.level?.blocks) return physics.segment(from, to, out, skipGrates);
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  out.hit = false; out.dist = len; out.block = -1; out.face = -1;
  if (len < 1e-6) return out;
  const inv = 1 / len, vx = dx * inv, vy = dy * inv, vz = dz * inv;
  const ids = physics.level.queryBlocks(
    Math.min(from.x, to.x) - radius, Math.min(from.z, to.z) - radius,
    Math.max(from.x, to.x) + radius, Math.max(from.z, to.z) + radius,
    physics._s3SweepIds || (physics._s3SweepIds = [])
  );
  const blocks = physics.level.blocks;
  let best = len, bestIndex = -1, bestAxis = -1, bestSign = 0;
  for (const index of ids) {
    const b = blocks[index];
    if (!b?.solid || (skipGrates && b.grate)) continue;
    const ox = from.x - b.center.x, oy = from.y - b.center.y, oz = from.z - b.center.z;
    let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0, miss = false;
    for (let k = 0; k < 3; k++) {
      const ax = b.axes[k], o = ox * ax.x + oy * ax.y + oz * ax.z, d = vx * ax.x + vy * ax.y + vz * ax.z;
      const half = (k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z) + radius;
      if (Math.abs(d) < 1e-9) { if (o < -half || o > half) { miss = true; break; } continue; }
      let a = (-half - o) / d, z = (half - o) / d, s = -1;
      if (a > z) { const q = a; a = z; z = q; s = 1; }
      if (a > tmin) { tmin = a; axis = k; sign = s; }
      if (z < tmax) tmax = z;
      if (tmin > tmax) { miss = true; break; }
    }
    if (miss || tmax < 0 || tmin < 0 || tmin > best + EPS) continue;
    best = tmin; bestIndex = index; bestAxis = axis; bestSign = sign;
  }
  if (bestIndex < 0) return out;
  const b = blocks[bestIndex], normal = b.axes[bestAxis];
  out.hit = true; out.dist = best; out.block = bestIndex;
  out.normal.set(normal.x * bestSign, normal.y * bestSign, normal.z * bestSign);
  out.point.set(from.x + vx * best, from.y + vy * best, from.z + vz * best).addScaledVector(out.normal, -radius);
  out.face = b.faces?.[bestAxis * 2 + (bestSign > 0 ? 0 : 1)] ?? -1;
  if (out.face >= 0 && physics.level.faces?.[out.face]) {
    const f = physics.level.faces[out.face], px = out.point.x - f.origin.x, py = out.point.y - f.origin.y, pz = out.point.z - f.origin.z;
    out.u = px * f.u.x + py * f.u.y + pz * f.u.z;
    out.v = px * f.v.x + py * f.v.y + pz * f.v.z;
  }
  return out;
}
export function applyProjectileHit(system, projectile, victim, amount, point) {
  if (!api) throw new Error('INKWAVE weapon patch not installed');
  const weapon = projectile.s3Weapon || projectile.owner.weapon;
  if (['shooter', 'dualies', 'splatling'].includes(weapon.kind)) amount = ageDamage(weapon, projectile.age, amount);
  if (weapon.kind === 'roller' && point) {
    const bands = projectile.s3Vertical ? weapon.verticalDamageBands : projectile.s3OuterRoller ? weapon.outerFlickDamageBands : weapon.flickDamageBands;
    amount = distanceDamage(bands, projectile.start.distanceTo(point));
  }
  amount = groupDamage(projectile.s3DamageGroup, victim, amount);
  if (amount > 0) system.applyHit(projectile.owner, victim, amount, projectile.wid || projectile.type);
}
export function installWeapons(context, profile) {
  api = context;
  const { WeaponRunner, Projectiles, G, THREE, Physics, Hit, PLAYER } = api;
  const newProjectile = Projectiles.prototype._new, pushProjectile = Projectiles.prototype._push;
  Projectiles.prototype._new = function (...args) {
    const p = newProjectile.apply(this, args);
    p.s3DamageGroup = null; p.s3Weapon = null; p.s3Vertical = false; p.s3OuterRoller = false; p.fieldRadius = 0;
    return p;
  };
  Projectiles.prototype._push = function (p) {
    p.s3Weapon = p.owner ? { ...p.owner.weapon } : null;
    p.fieldRadius = p.s3Weapon?.fieldCollisionRadius ?? p.size ?? 0;
    if (['shooter', 'dualies', 'splatling'].includes(p.s3Weapon?.kind) && Number.isFinite(p.s3Weapon.referenceGravity)) p.grav = p.s3Weapon.referenceGravity;
    return pushProjectile.call(this, p);
  };
  // The public shooter raises the launch ray to compensate for drop at the
  // camera target. Use the launch ray as aimed; gravity acts on the bullet.
  Projectiles.prototype._ballistic = function (_from, direction) { return direction; };
  const reset = WeaponRunner.prototype.reset, busy = WeaponRunner.prototype.busy;
  WeaponRunner.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3Stored = null; this.s3Turret = false; this.s3FlickVertical = false; this.s3BlasterWindup = 0;
    this.s3SloshRecovery = false; this.s3ChargerHeldTime = 0;
    this.s3ShooterHeld = false; this.s3ShooterPendingFirst = false; this.s3ShooterFirstRemaining = 0;
    this.s3SwimFireQueued = false; this.s3SwimFireRemaining = 0; this.s3PostFireLockActive = false;
    this.s3WasSquid = this.a?.form === 'squid';
    this.s3WasGrounded = !!this.a?.grounded; this.s3JumpSpreadAge = null;
    return result;
  };
  WeaponRunner.prototype.busy = function () {
    if (this.a.weapon.kind === 'shooter') {
      if (this.s3ShooterPendingFirst) return true;
      if (this.s3PostFireLockActive) {
        if (this.a.lastFire + EPS < (this.a.weapon.postFireSwimLock || 0)) return true;
        this.s3PostFireLockActive = false;
      }
    }
    if (['charger','splatling'].includes(this.a.weapon.kind) && this.a.intent.squid && this.a._squidPressT > this.a._firePressT) return false;
    return this.s3BlasterWindup > 0 || busy.call(this);
  };
  const runnerUpdate = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    const w = this.a.weapon;
    if (w.kind === 'shooter') {
      if (this.s3WasGrounded && !this.a.grounded) this.s3JumpSpreadAge = 0;
      if (this.s3JumpSpreadAge != null) this.s3JumpSpreadAge += dt;
      this.s3WasGrounded = !!this.a.grounded;
      let next = input;
      const isSquid = this.a.form === 'squid';
      if (this.s3WasSquid && !isSquid && this.a.intent?.fire) {
        this.s3SwimFireQueued = true;
        this.s3SwimFireRemaining = w.swimFirstShotDelay || 0;
      }
      this.s3WasSquid = isSquid;
      if (this.s3SwimFireQueued) {
        this.s3SwimFireRemaining = Math.max(0, this.s3SwimFireRemaining - dt);
        if (this.s3SwimFireRemaining > EPS) next = { ...next, fire: false, firePressed: false };
        else {
          // Feed the queued edge directly to the runner. This avoids stacking
          // the native visual emerge gate on top of the authoritative 12F gate.
          next = { ...next, fire: true, firePressed: true };
          this.s3SwimFireQueued = false; this.s3SwimFireRemaining = 0;
        }
      }
      const shotLocked = this.s3PostFireLockActive && this.a.lastFire + EPS < (w.postFireSwimLock || 0);
      if (!shotLocked && this.s3PostFireLockActive) this.s3PostFireLockActive = false;
      if (shotLocked || this.s3ShooterPendingFirst) next = { ...next, sub: false, subReleased: false };
      input = next;
    }
    return runnerUpdate.call(this, dt, input);
  };
  const charger = WeaponRunner.prototype._charger;
  WeaponRunner.prototype._charger = function (dt, inp, w) {
    const a = this.a;
    if (this.s3Stored) {
      const remaining = this.s3Stored.remaining - dt;
      const fireDelay = (this.s3Stored.fireDelay || 0) - dt;
      this.s3Stored.remaining = remaining <= EPS ? 0 : remaining;
      this.s3Stored.fireDelay = fireDelay <= EPS ? 0 : fireDelay;
      if (this.s3Stored.remaining === 0) { this.s3Stored = null; this.charge = 0; this.chargeT = 0; }
    }
    if (a.form === 'squid') {
      if (this.charging) {
        if (this.charge >= .999) this.s3Stored = {
          charge: 1,
          remaining: Math.max(0, w.keepChargeTime - dt),
          fireDelay: Math.max(0, (w.storedFireDelay || 0) - dt),
        };
        this.charging = false; this.charge = 0; this.chargeT = 0; this.s3ChargerHeldTime = 0;
        this.chargeLoop?.stop(.05); this.chargeLoop = null;
      }
      return;
    }
    let effectiveInp = inp;
    if (this.s3Stored) {
      this.charge = 1;
      const storedTrigger = !!(inp.fire || a.intent?.fire);
      if (this.s3Stored.fireDelay > EPS || !storedTrigger) return;
      this.chargeT = 1; this.charging = true; this.s3ChargerHeldTime = w.minReleaseTime || 0; this.s3Stored = null;
      if (!inp.fire) effectiveInp = { ...inp, fire: true };
    }
    if (this.charging && !inp.fire && this.s3ChargerHeldTime + EPS < (w.minReleaseTime || 0)) {
      this.charging = false; this.charge = 0; this.chargeT = 0; this.s3ChargerHeldTime = 0;
      this.chargeLoop?.stop(.05); this.chargeLoop = null;
      return;
    }
    let rate = 1;
    if (!a.grounded) rate = Math.min(rate, w.airChargeRate ?? 1);
    if (a.ink + EPS < (w.inkMin || 0)) rate = Math.min(rate, w.emptyChargeRate ?? 1);
    const actualInk = a.ink, spoofInk = !!(w.allowEmptyCharge && effectiveInp.fire && a.ink + EPS < (w.inkMin || 0));
    if (spoofInk) a.ink = w.inkFull;
    const wasCharging = this.charging;
    let result;
    try { result = charger.call(this, dt * rate, effectiveInp, w); }
    finally { if (spoofInk) a.ink = actualInk; }
    if (effectiveInp.fire && (wasCharging || this.charging)) this.s3ChargerHeldTime += dt;
    else if (!this.charging) this.s3ChargerHeldTime = 0;
    return result;
  };
  WeaponRunner.prototype._slosher = function (dt, inp, w) {
    const a = this.a, epsilon = 1e-10;
    const release = () => {
      // Preserve fractional seconds at both boundaries. Without the epsilon,
      // 12 * (1/60) misses .2 and the 17F recovery also gains an extra tick.
      const carry = Math.max(0, this.slosh - w.windup);
      this.slosh = -1; G.projectiles.fireSlosh(a, w);
      this.cooldown = w.fireInterval - w.windup - carry;
      this.s3SloshRecovery = !!inp.fire;
    };
    if (!inp.fire) this.s3SloshRecovery = false;
    if (this.slosh >= 0) {
      this.slosh += dt; a.fireFacing = .5; this.firingT = .35;
      if (this.slosh + epsilon >= w.windup) release();
      return;
    }
    if (!inp.fire || this.cooldown > epsilon) return;
    if (a.ink < w.inkPerShot) { this._empty(); this.cooldown = .2; this.s3SloshRecovery = false; return; }
    // update() already subtracted dt from cooldown. Carry only a continuously
    // held attack's late deadline, never an arbitrarily overdue idle clock.
    const carry = this.s3SloshRecovery ? Math.max(0, -this.cooldown) : 0;
    this.s3SloshRecovery = false;
    a.ink -= w.inkPerShot; a.lastFire = 0;
    this.slosh = carry <= epsilon ? 0 : carry; this.firingT = .35; a.fireFacing = .5;
    a.character.trigger('slosh');
    if (a.isLocal || a._nearCamera()) G.audio?.play('slosh_throw', {
      pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? .75 : .55,
    });
    if (this.slosh + epsilon >= w.windup) release();
  };
  installRollerLogic(api, profile);
  for (const method of ['fireFlick', 'fireSlosh']) {
    const original = Projectiles.prototype[method];
    Projectiles.prototype[method] = function (a, weapon) {
      let w = weapon;
      if (method === 'fireFlick' && a.weaponRunner.s3FlickVertical) w = { ...weapon,
        flickDrops: weapon.verticalDrops, flickSpreadDeg: weapon.verticalSpreadDeg, flickSpeed: weapon.verticalSpeed,
        flickDamageNear: weapon.verticalDamageNear, flickDamageFar: weapon.verticalDamageFar,
      };
      const before = new Set(this.list); const result = original.call(this, a, w); const group = new Map();
      const added = this.list.filter(p => !before.has(p));
      if (method === 'fireFlick' && !a.weaponRunner.s3FlickVertical && added.length > 1) {
        const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
        const angle = p => {
          const horizontal = Math.hypot(p.vel.x, p.vel.z);
          const cosine = horizontal > EPS ? Math.max(-1, Math.min(1, (p.vel.x * fx + p.vel.z * fz) / horizontal)) : 1;
          return Math.acos(cosine);
        };
        // Resolve the centre of one horizontal sheet first. That preserves
        // one-attack max-damage aggregation when outer globs were spawned first.
        added.sort((x, y) => angle(x) - angle(y));
        const kept = this.list.filter(p => before.has(p));
        this.list.length = 0; this.list.push(...kept, ...added);
      }
      for (const p of added) {
        p.s3DamageGroup = group;
        p.s3Vertical = !!a.weaponRunner.s3FlickVertical;
        if (method === 'fireFlick') {
          p.grav = w.flickGravity ?? p.grav; p.drag = w.flickDrag ?? p.drag;
          if (!p.s3Vertical && Number.isFinite(w.outerFlickAngleDeg)) {
            const horizontal = Math.hypot(p.vel.x, p.vel.z), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
            const cosine = horizontal > EPS ? Math.max(-1, Math.min(1, (p.vel.x * fx + p.vel.z * fz) / horizontal)) : 1;
            p.s3OuterRoller = Math.acos(cosine) * 180 / Math.PI > w.outerFlickAngleDeg + EPS;
          }
        }
      }
      return result;
    };
  }
  const dualies = WeaponRunner.prototype._dualies, spread = WeaponRunner.prototype._spreadDeg;
  WeaponRunner.prototype._dualies = function (dt, inp, w) {
    const dodging = !!this.dodge;
    if (this.s3Turret && (!inp.fire || Math.hypot(this.a.intent.move.x, this.a.intent.move.z) > .01 && this.lockT <= 0 || this.a.form === 'squid' || inp.sub)) this.s3Turret = false;
    const result = dualies.call(this, dt, inp, this.s3Turret ? { ...w, fireInterval: w.lockInterval } : w);
    if (dodging && !this.dodge) this.s3Turret = true;
    return result;
  };
  WeaponRunner.prototype._spreadDeg = function (w) {
    // The upstream blaster reads `spread`, while the pinned profile supplies
    // Stand_DegSwerve as spreadGround. Connect both ground and jump values.
    if (w.kind === 'blaster') return this.a.grounded ? w.spreadGround : w.spreadAir;
    if (w.kind === 'shooter' && this.s3JumpSpreadAge != null) {
      const age = this.s3JumpSpreadAge, hold = w.jumpSpreadHold ?? 0, end = Math.max(hold + EPS, w.jumpSpreadRecoverEnd ?? hold);
      let base;
      if (age <= hold + EPS) base = w.spreadAir;
      else if (age < end - EPS) base = w.spreadAir + (w.spreadGround - w.spreadAir) * ((age - hold) / (end - hold));
      else { base = w.spreadGround; this.s3JumpSpreadAge = null; }
      const first = w.spreadFirst ?? .45;
      return base * (first + (1 - first) * this.bloom);
    }
    return w.kind === 'dualies' && this.s3Turret ? w.spreadLock : spread.call(this, w);
  };
  const fireShooter = Projectiles.prototype.fireShooter;
  Projectiles.prototype.fireShooter = function (a, w, spreadDeg) {
    const result = fireShooter.call(this, a, w, spreadDeg);
    if (a.weaponRunner && w.kind === 'shooter') a.weaponRunner.s3PostFireLockActive = true;
    return result;
  };
  const stepProjectile = Projectiles.prototype._step;
  Projectiles.prototype._step = function (p, dt) {
    const physics = G.physics;
    if (!physics?.level?.queryBlocks || !(p.fieldRadius > EPS)) return stepProjectile.call(this, p, dt);
    const originalSegment = physics.segment;
    physics.segment = (a, b, out, skipGrates) => projectileWorldHit(physics, a, b, p.fieldRadius, out, skipGrates);
    try { return stepProjectile.call(this, p, dt); }
    finally { physics.segment = originalSegment; }
  };
  const fireCharger = Projectiles.prototype.fireCharger;
  Projectiles.prototype.fireCharger = function (a, w, charge) {
    if (charge < .999) return fireCharger.call(this, a, w, charge);
    const muzzle = this._muzzle(a, new THREE.Vector3()).clone(), dir = this._aimFrom(a, muzzle, new THREE.Vector3()).clone();
    const hit = G.physics.raycast(muzzle, dir, w.rangeMax, new Hit(), true);
    let length = hit.hit ? hit.dist : w.rangeMax;
    if (G.boss) { const bh = G.boss.segHit(muzzle, muzzle.clone().addScaledVector(dir, length), .1); if (bh) length = Math.min(length, bh.dist); }
    const end = muzzle.clone().addScaledVector(dir, length), result = { t: 0, dist: 0 }, victims = [];
    for (const e of G.actors) {
      if (!e.alive || e.team === a.team) continue;
      const base = e.pos.clone(); base.y += e.smoothY || 0;
      Physics.segmentCapsuleDist(muzzle, end, base, PLAYER.radius + .12, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, result);
      if (result.dist < PLAYER.radius + .14) victims.push({ actor: e, distance: result.t * length });
    }
    const actors = G.actors;
    try { G.actors = []; fireCharger.call(this, a, w, charge); }
    finally { G.actors = actors; }
    for (const { actor } of victims.sort((x, y) => x.distance - y.distance)) this.applyHit(a, actor, w.damageMax, 'charger');
  };
  const auto = WeaponRunner.prototype._auto;
  WeaponRunner.prototype._auto = function (dt, input, w) {
    if (w.kind === 'shooter') {
      // 0.1s is exactly 6 simulation frames by design. Normalize the tiny
      // positive IEEE-754 remainder after six 1/60 decrements so cadence does
      // not acquire an accidental seventh frame.
      if (this.cooldown <= EPS) this.cooldown = 0;
      const pressed = !!input.fire && !this.s3ShooterHeld;
      if (!input.fire) this.s3ShooterHeld = false;
      else if (pressed && !this.s3ShooterPendingFirst) {
        this.s3ShooterHeld = true;
        const emerged = this.a.kidT <= (w.swimFirstShotDelay || 0) + EPS;
        this.s3ShooterPendingFirst = true;
        this.s3ShooterFirstRemaining = emerged ? 0 : (w.firstShotDelay || 0);
      }
      if (this.s3ShooterPendingFirst) {
        this.s3ShooterFirstRemaining = Math.max(0, this.s3ShooterFirstRemaining - dt);
        this.firingT = .35; this.a.fireFacing = .5;
        // Native update() decrements cooldown before dispatching to _auto().
        // The authoritative first-shot gate must not bank that negative time,
        // or the first release shortens the following 6F Splattershot cadence.
        this.cooldown = Math.max(0, this.cooldown);
        if (this.s3ShooterFirstRemaining > EPS) return;
        this.s3ShooterFirstRemaining = 0;
        this.s3ShooterPendingFirst = false;
        const inkBefore = this.a.ink;
        const result = auto.call(this, dt, { ...input, fire: true }, w);
        if (this.a.ink < inkBefore - EPS) this.s3PostFireLockActive = true;
        return result;
      }
      if (!input.fire) {
        this.s3ShooterFirstRemaining = 0;
        return auto.call(this, dt, input, w);
      }
      const inkBefore = this.a.ink;
      const result = auto.call(this, dt, input, w);
      if (this.a.ink < inkBefore - EPS) this.s3PostFireLockActive = true;
      return result;
    }
    if (w.kind !== 'blaster') return auto.call(this, dt, input, w);
    if (this.s3BlasterWindup > 0) {
      this.s3BlasterWindup -= dt; this.firingT = .35;
      if (this.s3BlasterWindup > EPS) return;
      this.s3BlasterWindup = 0;
      return auto.call(this, dt, { ...input, fire: true }, { ...w, fireInterval: w.fireInterval - w.preDelay });
    }
    if (input.fire && this.cooldown <= 0 && this.a.ink >= w.inkPerShot) { this.s3BlasterWindup = w.preDelay; this.firingT = .35; return; }
    if (!input.fire) this.cooldown = Math.max(0, this.cooldown);
  };
  const splatling = WeaponRunner.prototype._splatling;
  WeaponRunner.prototype._splatling = function (dt, input, w) {
    if(this.a.form === 'squid') {
      this.charging = this.streaming = false; this.charge = this.chargeT = this.burstT = 0;
      this.spinLoop?.stop(.12); this.spinLoop = null; return;
    }
    const charging = this.charging, charge = this.charge;
    const result = splatling.call(this, dt, input, this.streaming ? { ...w, inkPerShot: 0 } : w);
    if (charging && !input.fire && this.streaming) {
      this.burstDur = this.burstT = splatlingBurst(w, charge);
      this.a.ink = Math.max(0, this.a.ink - w.inkFull * this.burstDur / w.burstMax); this.a.lastFire = 0;
    }
    return result;
  };
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    const w = this.a.weapon;
    if (this.rolling && w.rollBaseSpeed) return this.rollT >= w.rollDashTime ? w.rollSpeed : w.rollBaseSpeed;
    return moveSpeed.call(this);
  };
}
