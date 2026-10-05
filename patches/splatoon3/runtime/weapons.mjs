import { installContactRecovery } from './contact-recovery.mjs';
import { installWeaponEdgecases } from './weapon-edgecases.mjs';
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
export function applyProjectileHit(system, projectile, victim, amount, point) {
  if (!api) throw new Error('INKWAVE weapon patch not installed');
  const weapon = projectile.s3Weapon || projectile.owner.weapon;
  if (['shooter', 'dualies', 'splatling'].includes(weapon.kind)) amount = ageDamage(weapon, projectile.age, amount);
  if (weapon.kind === 'roller' && point) amount = distanceDamage(projectile.s3Vertical ? weapon.verticalDamageBands : weapon.flickDamageBands, projectile.start.distanceTo(point));
  amount = groupDamage(projectile.s3DamageGroup, victim, amount);
  if (amount > 0) system.applyHit(projectile.owner, victim, amount, projectile.wid || projectile.type);
}
export function installWeapons(context, profile) {
  api = context;
  const { WeaponRunner, Projectiles, G, THREE, Physics, Hit, PLAYER } = api;
  const newProjectile = Projectiles.prototype._new, pushProjectile = Projectiles.prototype._push;
  Projectiles.prototype._new = function (...args) {
    const p = newProjectile.apply(this, args); p.s3DamageGroup = null; p.s3Weapon = null; p.s3Vertical = false; return p;
  };
  Projectiles.prototype._push = function (p) {
    p.s3Weapon = p.owner ? { ...p.owner.weapon } : null;
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
    this.s3SloshRecovery = false; return result;
  };
  WeaponRunner.prototype.busy = function () {
    if (['charger','splatling'].includes(this.a.weapon.kind) && this.a.intent.squid && this.a._squidPressT > this.a._firePressT) return false;
    return this.s3BlasterWindup > 0 || busy.call(this);
  };
  const charger = WeaponRunner.prototype._charger;
  // S3 keeps a full charge only while ZR stays down; letting go of ZR before
  // leaving the keep cancels the charge. `inp.fire` cannot express that, because
  // the actor masks it to false while squid and through emergeDelay, which makes
  // "still holding ZR underwater" and "released ZR underwater" the same value.
  // `a.intent.fire` is the canonical actor-side hold state and keeps them apart.
  const cancelStored = r => {
    r.s3Stored = null; r.charging = false; r.charge = 0; r.chargeT = 0; r.chargeDinged = false;
    r.chargeLoop?.stop(.05); r.chargeLoop = null;
  };
  WeaponRunner.prototype._charger = function (dt, inp, w) {
    const a = this.a, held = !!a.intent.fire;
    if (this.s3Stored && !held) cancelStored(this);
    if (a.form === 'squid') {
      if (this.charging) {
        // Submerging with ZR already released never opens a keep window.
        if (this.charge >= .999 && held) this.s3Stored = { charge: 1, remaining: w.keepChargeTime };
        this.charging = false; this.charge = 0; this.chargeT = 0;
        this.chargeLoop?.stop(.05); this.chargeLoop = null;
      }
      if (this.s3Stored) {
        this.s3Stored.remaining -= dt;
        if (this.s3Stored.remaining <= 1e-10) this.s3Stored = null;
      }
      return;
    }
    if (this.s3Stored) {
      // Held through the keep, so the store survives emergeDelay with inp.fire
      // masked, and is restored once the actor forwards the trigger again.
      if (!inp.fire) { this.charge = 1; return; }
      this.charge = this.s3Stored.charge; this.chargeT = 1; this.charging = true; this.s3Stored = null;
    }
    return charger.call(this, dt, inp, w);
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
      for (const p of this.list) if (!before.has(p)) {
        p.s3DamageGroup = group;
        p.s3Vertical = !!a.weaponRunner.s3FlickVertical;
        if (method === 'fireFlick') { p.grav = w.flickGravity ?? p.grav; p.drag = w.flickDrag ?? p.drag; }
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
    return w.kind === 'dualies' && this.s3Turret ? w.spreadLock : spread.call(this, w);
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
    if (w.kind !== 'blaster') return auto.call(this, dt, input, w);
    if (this.s3BlasterWindup > 0) {
      this.s3BlasterWindup -= dt; this.firingT = .35;
      if (this.s3BlasterWindup > 1e-10) return;
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
  // Movement Physics owns roller rolling speed/recovery. Add only the latest
  // Charger charging-speed rule here, then delegate every other movement state.
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    const w = this.a.weapon;
    if (this.lockT > 0) return moveSpeed.call(this);
    if (this.charging && w.kind === 'charger' && Number.isFinite(w.moveSpeedFiring)) return w.moveSpeedFiring;
    return moveSpeed.call(this);
  };
  installContactRecovery(api);
  installWeaponEdgecases(api);
}
