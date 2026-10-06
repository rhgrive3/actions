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
export function chargerDamage(actor, weapon, charge) {
  const legacy = weapon.damageMin + (weapon.damagePartialMax - weapon.damageMin) * charge;
  const minimum = weapon.damageMinChargeTime, rate = weapon.partialDamagePerSecond;
  if (!Number.isFinite(minimum) || !Number.isFinite(rate) || rate <= 0) return legacy;
  const progress = Number.isFinite(actor.weaponRunner?.chargeT) ? actor.weaponRunner.chargeT : charge;
  const elapsed = progress * weapon.chargeTime;
  // The minimum-charge fire gate is tracked separately. Preserve its existing
  // sub-8F output until that independent action-admission fix is composed.
  if (elapsed + 1e-10 < minimum) return legacy;
  return Math.min(weapon.damagePartialMax, weapon.damageMin + (elapsed - minimum) * rate);
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
function acceptedHit(result, victim, hpBefore, aliveBefore) {
  if (result === 'rejected' || result === 'rejected-invulnerable' || result === 'pending') return false;
  if (result === 'accepted' || result === 'killed') return true;
  return Number.isFinite(hpBefore) && (victim.hp < hpBefore || aliveBefore && !victim.alive);
}
export function applySlosherVolleyHit(system, owner, victim, group, groupId, amount, weaponId = 'slosher') {
  if (!(amount > 0)) return;
  const route = api?.G?.netm?.shouldApplyHit?.(owner, victim);
  if (route === 'drop') return;
  // The victim owner commits this budget online; do not spend it while a hit is pending.
  if (route === 'send' && groupId != null) return system.applyHit(owner, victim, amount, weaponId, groupId);
  const previous = group?.get(victim) || 0, next = Math.max(previous, amount), delta = next - previous;
  if (!(delta > 0)) return;
  if (!group) return system.applyHit(owner, victim, delta, weaponId);
  const hpBefore = victim.hp, aliveBefore = victim.alive;
  const result = system.applyHit(owner, victim, delta, weaponId);
  if (acceptedHit(result, victim, hpBefore, aliveBefore)) group.set(victim, next);
  return result;
}
function volleyOwnerKey(owner, groupId) {
  return JSON.stringify([owner.owner ?? null, owner.nid ?? owner.name ?? 'actor', String(groupId)]);
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
  if (weapon.kind === 'slosher' && projectile.s3DamageGroup) {
    return applySlosherVolleyHit(system, projectile.owner, victim, projectile.s3DamageGroup,
      projectile.s3DamageGroupId, amount, projectile.wid || projectile.type || 'slosher');
  }
  amount = groupDamage(projectile.s3DamageGroup, victim, amount);
  if (amount > 0) system.applyHit(projectile.owner, victim, amount, projectile.wid || projectile.type);
}
export function installWeapons(context, profile) {
  api = context;
  const { WeaponRunner, Projectiles, G, THREE, Physics, Hit, PLAYER } = api;
  const newProjectile = Projectiles.prototype._new, pushProjectile = Projectiles.prototype._push;
  Projectiles.prototype._new = function (...args) {
    const p = newProjectile.apply(this, args); p.s3DamageGroup = null; p.s3DamageGroupId = null; p.s3Weapon = null; p.s3Vertical = false; return p;
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
    this.s3SloshRecovery = false;
    this.s3SplatlingStartup = 0; this.s3SplatlingEmerging = false; this.s3SplatlingEmergeT = 0;
    this.s3SplatlingHeld = false;
    // #726 fresh-start state: pending humanoid startup seconds, the
    // held-through-forwarding-gate (squid-origin) marker, and the repeat-cycle
    // marker that suppresses the pre-gap after a shot.
    this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false; this.s3ChargerRepeat = false;
    this.s3ChargerSpent = 0; this.s3ChargerProgressiveSpend = false;
    this.s3ChargerPostShot = 0; this.s3DualiesPostShot = 0; this.s3DodgeShotPending = 0;
    this.s3WasSquid = false;
    return result;
  };
  WeaponRunner.prototype.busy = function () {
    const kind = this.a.weapon.kind;
    if (kind === 'charger' && this.s3ChargerPostShot > 1e-10) return true;
    if (kind === 'dualies' && this.s3DualiesPostShot > 1e-10) return true;
    if (['charger','splatling'].includes(kind) && this.a.intent.squid && this.a._squidPressT > this.a._firePressT) return false;
    return this.s3BlasterWindup > 0 || busy.call(this);
  };
  const charger = WeaponRunner.prototype._charger;
  const chargerInkAt = (w, progress) => {
    const p = Math.max(0, Math.min(1, progress)), minT = w.minimumChargeTime ?? (8 / 60);
    if (p <= minT) return w.inkMin * p / Math.max(1e-10, minT);
    return w.inkMin + (w.inkFull - w.inkMin) * (p - minT) / Math.max(1e-10, 1 - minT);
  };
  const chargerProgressForInk = (w, ink) => {
    const value = Math.max(0, ink), minT = w.minimumChargeTime ?? (8 / 60);
    if (value <= w.inkMin) return minT * value / Math.max(1e-10, w.inkMin);
    return Math.min(1, minT + (1 - minT) * (value - w.inkMin) / Math.max(1e-10, w.inkFull - w.inkMin));
  };
  // Stored-charge lifetime/startup ownership from C22 is composed with #775's
  // progressive ink commitment. Paid ink is never refunded by cancel/keep.
  const cancelStored = r => {
    r.s3Stored = null; r.charging = false; r.charge = 0; r.chargeT = 0; r.chargeDinged = false;
    r.s3ChargerSpent = 0;
    r.chargeLoop?.stop(.05); r.chargeLoop = null;
  };
  WeaponRunner.prototype._charger = function (dt, inp, w) {
    const a = this.a, held = !!a.intent.fire, epsilon = 1e-10;
    if (this.s3Stored && !held) {
      cancelStored(this); this.s3WasSquid = a.form === 'squid';
      this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false;
      return;
    }

    // #726 fresh-start bookkeeping. A held trigger masked by squid/emerge keeps
    // its origin marker; a physical release abandons pending startup.
    if (!inp.fire) { this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false; }
    if (held && !inp.fire) this.s3ChargerHeldGate = true;

    if (a.form === 'squid') {
      this.s3WasSquid = true;
      if (this.charging) {
        if (this.charge >= .999 && held) this.s3Stored = {
          charge: 1, remaining: w.keepChargeTime, paid: Math.max(this.s3ChargerSpent || 0, w.inkFull)
        };
        this.charging = false; this.charge = 0; this.chargeT = 0;
        if (!this.s3Stored) this.s3ChargerSpent = 0;
        this.chargeLoop?.stop(.05); this.chargeLoop = null;
      }
      if (this.s3Stored) {
        this.s3Stored.remaining -= dt;
        if (this.s3Stored.remaining <= epsilon) { this.s3Stored = null; this.s3ChargerSpent = 0; }
      }
      return;
    }

    // #810: a held squid→humanoid edge refreshes only an existing keep record.
    if (this.s3Stored && this.s3WasSquid) this.s3Stored.remaining = w.keepChargeTime;
    this.s3WasSquid = false;
    if (this.s3Stored) {
      if (!inp.fire) { this.charge = 1; return; }
      this.charge = this.s3Stored.charge; this.chargeT = 1; this.charging = true;
      this.s3ChargerSpent = this.s3Stored.paid ?? w.inkFull;
      this.s3Stored = null;
    }

    // A release from a live charge enters the repeat cycle. Release handling
    // below neutralizes only the legacy debit, not the shot/recovery clocks.
    if (this.charging && !inp.fire) this.s3ChargerRepeat = true;

    // #726: stable humanoid fresh start consumes exactly 1F before charge.
    // Low/empty ink is allowed to enter the charge state; #775 then advances it
    // at the sourced 1/3 rate while recovery funds the minimum.
    if (!this.charging && inp.fire && this.cooldown <= 0) {
      if (this.s3ChargerStartupT > epsilon) {
        this.s3ChargerStartupT = Math.max(0, this.s3ChargerStartupT - dt);
        if (this.s3ChargerStartupT > epsilon) return;
      } else if (!this.s3ChargerRepeat && !this.s3ChargerHeldGate) {
        this.s3ChargerStartupT = 1 / 60;
        return;
      }
    }

    if (inp.fire && this.cooldown <= 0) {
      if (!this.charging) this.s3ChargerSpent = 0;
      const beforeT = this.chargeT || 0, realInk = a.ink;
      const fundedInk = (this.s3ChargerSpent || 0) + realInk;
      const low = fundedInk + epsilon < w.inkMin;
      const rate = !a.grounded ? (w.airChargeRate ?? 1 / 3) : low ? (w.emptyChargeRate ?? 1 / 3) : 1;
      let targetT = Math.min(1, beforeT + dt / Math.max(epsilon, w.chargeTime) * rate);
      targetT = Math.min(targetT, chargerProgressForInk(w, fundedInk));
      const scaledDt = Math.max(0, targetT - beforeT) * w.chargeTime;

      // Advance the native charge owner with a temporary admissible tank, then
      // debit the real tank from the sourced min/full endpoints.
      a.ink = Math.max(realInk, w.inkFull);
      const result = charger.call(this, scaledDt, inp, w);
      a.ink = realInk;

      const targetPaid = chargerInkAt(w, this.chargeT || 0);
      const delta = Math.max(0, targetPaid - (this.s3ChargerSpent || 0));
      const spent = Math.min(a.ink, delta);
      if (spent > epsilon) {
        a.ink -= spent;
        this.s3ChargerSpent = (this.s3ChargerSpent || 0) + spent;
        this.s3ChargerProgressiveSpend = true;
      }
      return result;
    }

    if (!inp.fire && this.charging) {
      // Native release still owns projectile/recovery state, but its old
      // release-only ink debit is neutralized because charge progress paid it.
      const realInk = a.ink, c = Math.max(0, this.charge || 0);
      const legacyDebit = Math.max(w.inkMin, w.inkFull * c);
      a.ink = realInk + legacyDebit;
      const result = charger.call(this, dt, inp, w);
      a.ink = realInk;
      this.s3ChargerSpent = 0;
      return result;
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
  const fireDualies = Projectiles.prototype.fireDualies;
  Projectiles.prototype.fireDualies = function (a, w, spreadDeg, hand) {
    const result = fireDualies.call(this, a, w, spreadDeg, hand);
    if (a.weaponRunner) a.weaponRunner.s3DualiesPostShot = 4 / 60;
    return result;
  };
  const dualies = WeaponRunner.prototype._dualies, spread = WeaponRunner.prototype._spreadDeg;
  WeaponRunner.prototype._dualies = function (dt, inp, w) {
    const dodging = !!this.dodge;
    if (this.s3DodgeShotPending > 1e-10 && (!inp.fire || inp.sub || this.a.form === 'squid')) this.s3DodgeShotPending = 0;
    if (this.s3Turret && (!inp.fire || Math.hypot(this.a.intent.move.x, this.a.intent.move.z) > .01 && this.lockT <= 0 || this.a.form === 'squid' || inp.sub)) this.s3Turret = false;
    if (this.s3DodgeShotPending > 1e-10) {
      this.s3DodgeShotPending = Math.max(0, this.s3DodgeShotPending - dt);
      if (this.s3DodgeShotPending > 1e-10) return dualies.call(this, dt, { ...inp, fire: false, firePressed: false }, this.s3Turret ? { ...w, fireInterval: w.lockInterval } : w);
    }
    const result = dualies.call(this, dt, inp, this.s3Turret ? { ...w, fireInterval: w.lockInterval } : w);
    if (dodging && !this.dodge) {
      this.s3Turret = true;
      this.s3DodgeShotPending = 4 / 60;
    }
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
    if (a.weaponRunner) a.weaponRunner.s3ChargerPostShot = 16 / 60;
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
    if (this.a.form === 'squid') {
      this.charging = this.streaming = false; this.charge = this.chargeT = this.burstT = 0;
      this.spinLoop?.stop(.12); this.spinLoop = null;
      this.s3SplatlingStartup = 0;
      this.s3SplatlingEmerging = true;
      this.s3SplatlingEmergeT = 6 / 60;
      this.s3SplatlingHeld = false;
      return;
    }
    if (this.s3SplatlingEmerging) {
      if (this.s3SplatlingEmergeT > 1e-5) {
        this.s3SplatlingEmergeT = Math.max(0, this.s3SplatlingEmergeT - dt);
        if (input.fire) this.s3SplatlingHeld = true;
        return;
      }
      this.s3SplatlingEmerging = false;
    }
    if (this.streaming) {
      this.s3SplatlingStartup = 0;
      this.s3SplatlingEmerging = false;
      return splatling.call(this, dt, input, { ...w, inkPerShot: 0 });
    }
    if (!input.fire) {
      this.s3SplatlingHeld = false;
      this.s3SplatlingStartup = 0;
    } else if (this.cooldown <= 0 && !this.charging && this.a.ink >= w.inkPerShot * 5) {
      if (!this.s3SplatlingHeld) {
        this.s3SplatlingHeld = true;
        this.s3SplatlingStartup = 1 / 60;
      }
      if (this.s3SplatlingStartup > 1e-5) {
        this.s3SplatlingStartup = Math.max(0, this.s3SplatlingStartup - dt);
        return;
      }
    }
    const charging = this.charging, charge = this.charge;
    const result = splatling.call(this, dt, input, w);
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
  installWeaponEdgecases(api);
  const applyHit = Projectiles.prototype.applyHit;
  Projectiles.prototype.applyHit = function (attacker, victim, damage, weaponId, groupId) {
    if (groupId == null) return applyHit.call(this, attacker, victim, damage, weaponId);
    const route = G.netm?.shouldApplyHit?.(attacker, victim);
    if (route === 'send' || route === 'drop') return applyHit.call(this, attacker, victim, damage, weaponId, groupId);
    const groups = this._s3SlosherOwnerGroups || (this._s3SlosherOwnerGroups = new Map());
    const key = volleyOwnerKey(attacker, groupId);
    let group = groups.get(key);
    if (!group) { group = new WeakMap(); groups.set(key, group); }
    const previous = group.get(victim) || 0, next = Math.max(previous, damage), delta = next - previous;
    if (!(delta > 0)) return 'accepted';
    const hpBefore = victim.hp, aliveBefore = victim.alive;
    const result = applyHit.call(this, attacker, victim, delta, weaponId);
    if (acceptedHit(result, victim, hpBefore, aliveBefore)) group.set(victim, next);
    return result;
  };
  const clearProjectiles = Projectiles.prototype.clear;
  Projectiles.prototype.clear = function (...args) {
    this._s3SlosherOwnerGroups?.clear();
    return clearProjectiles.apply(this, args);
  };
}

// Trajectory-preview presentation budget for Issue #798.
//
// The native bomb/special arc preview (`Projectiles.updateArc` in
// `inkwave-public/src/game/weapons.js`) recomputes its full ballistic +
// collision path whenever the actor's exact position or throw velocity
// changes. While aiming/moving, that is every render frame: up to
// (arcN - 1) * 2 = 126 `Physics.segment()` queries per frame (about 7.5k/s
// at 60 FPS). The guide is pure presentation: the actual bomb uses
// `throwBomb()` + `_updateBombs()` and never reads the preview buffers.
//
// This wrapper keeps every native trajectory semantic (same integrator,
// same collision call, same drawn buffers, same landing marker) and only
// decouples the collision-query cadence from the render cadence:
//   - throttle native recomputation to ARC_PREVIEW_MIN_INTERVAL_S (30 Hz);
//   - within an interval, reuse the cached line and still refresh the
//     per-frame presentation state (colors, visibility, ring pulse);
//   - let continuous position/aim changes share that bounded refresh cadence;
//   - always recompute on hide/show, actor change, physics change, cache loss,
//     a per-frame teleport/aim snap, or a throw-speed change above epsilon;
//   - never skip when the cached native result is stale or absent.
//
// Actual bomb gameplay physics, damage, paint, networking and lifecycle
// are untouched. The wrapper delegates to the original `updateArc` for
// every recomputation and every guard evaluation.
export const ARC_PREVIEW_MIN_INTERVAL_S = 1 / 30;
// These are local discontinuity detectors for presentation scheduling, not
// Splatoon 3 movement or aim values. Smooth changes are refreshed on cadence.
export const ARC_PREVIEW_POSITION_JUMP_M = 0.5;
// 30 Hz normal 1.2 rad/s aim can move throw velocity by more than 2 m/s.
// Keep that continuous input on cadence; larger steps still refresh at once.
export const ARC_PREVIEW_VELOCITY_JUMP_MPS = 4;
export const ARC_PREVIEW_SPEED_EPSILON = 0.05;

const ARC_PREVIEW_INSTALL = Symbol.for('inkwave.s3.arc-preview-performance.install.v1');
const ARC_PREVIEW_STATE = Symbol('inkwave.s3.arc-preview-performance.state');

function previewInputs(system, api, actor) {
  const speed = api.SUB?.bomb?.throwSpeed;
  if (typeof system.throwVelocity !== 'function' || !Number.isFinite(speed)) return null;
  const scratch = system._arcPreviewPerfScratch
    || (system._arcPreviewPerfScratch = new api.THREE.Vector3());
  try {
    system.throwVelocity.call(system, actor, speed, scratch);
  } catch {
    return null;
  }
  return {
    px: actor.pos.x, py: actor.pos.y + 1.35, pz: actor.pos.z,
    vx: scratch.x, vy: scratch.y, vz: scratch.z,
    speed,
  };
}

function hasLargeInputStep(previous, current) {
  if (!previous || !current) return false;
  const dx = current.px - previous.px, dy = current.py - previous.py, dz = current.pz - previous.pz;
  const dvx = current.vx - previous.vx, dvy = current.vy - previous.vy, dvz = current.vz - previous.vz;
  return Math.hypot(dx, dy, dz) > ARC_PREVIEW_POSITION_JUMP_M
    || Math.hypot(dvx, dvy, dvz) > ARC_PREVIEW_VELOCITY_JUMP_MPS;
}

function throwSpeedChanged(previous, current) {
  return !!(previous && current
    && Math.abs((previous.speed ?? 0) - (current.speed ?? 0)) > ARC_PREVIEW_SPEED_EPSILON);
}

function nativeCacheReady(system, physics) {
  const cache = system._arcCache;
  return !!(cache && Number.isFinite(cache.px) && Number.isFinite(cache.vx)
    && Number.isFinite(cache.py) && Number.isFinite(cache.pz)
    && Number.isFinite(cache.vy) && Number.isFinite(cache.vz)
    && cache.physics === physics);
}

function refreshPresentationOnly(system, api, actor) {
  const cache = system._arcCache;
  const inkCost = api.SUB?.bomb?.inkCost;
  const hasInk = !(Number.isFinite(inkCost) && actor.ink < inkCost);
  const color = hasInk ? actor.color : system._arcPreviewPerfGrey
    || (system._arcPreviewPerfGrey = new api.THREE.Color(0.6, 0.6, 0.6));
  system.arcLine.material.color.copy(color).multiplyScalar(1.4);
  system.arcRing.material.color.copy(color).multiplyScalar(1.4);
  system.arcLine.visible = true;
  system.arcRing.visible = !!cache.landed;
  const now = api.G?.time;
  system.arcRing.scale.setScalar(1 + Math.sin((Number.isFinite(now) ? now : 0) * 8) * 0.06);
}

export function installArcPreviewPerformance(api) {
  const { G, Projectiles } = api;
  if (!Projectiles?.prototype?.updateArc || Projectiles.prototype[ARC_PREVIEW_INSTALL]) return;
  const nativeUpdateArc = Projectiles.prototype.updateArc;
  Projectiles.prototype.updateArc = function (actor, show) {
    if (!show || !actor || !actor.alive) {
      delete this[ARC_PREVIEW_STATE];
      return nativeUpdateArc.call(this, actor, show);
    }
    const now = Number.isFinite(G?.time) ? G.time : 0;
    const inputs = previewInputs(this, api, actor);
    const state = this[ARC_PREVIEW_STATE];
    const actorChanged = !state || state.actor !== actor;
    const physicsChanged = !state || state.physics !== G.physics;
    const inputsUnknown = !inputs;
    const largeInputStep = !inputsUnknown && hasLargeInputStep(state?.lastInputs, inputs);
    const speedChanged = !inputsUnknown && throwSpeedChanged(state?.inputs, inputs);
    const cacheStale = !nativeCacheReady(this, G.physics);
    const intervalElapsed = !state || !Number.isFinite(state.time)
      || (now - state.time) >= ARC_PREVIEW_MIN_INTERVAL_S - 1e-9
      || now < state.time;
    // Keep at least one cached draw between ordinary refreshes, including at
    // 30 Hz. A long scheduling gap or reversed clock still refreshes at once.
    const cadenceReady = intervalElapsed && (!state || state.hits > 0
      || now < state.time || now - state.time > 2 * ARC_PREVIEW_MIN_INTERVAL_S + 1e-9);
    const mustRecompute = actorChanged || physicsChanged || inputsUnknown
      || !state?.inputs || cacheStale || cadenceReady || largeInputStep || speedChanged;
    if (!mustRecompute && state && state.inputs) {
      refreshPresentationOnly(this, api, actor);
      // Compare discontinuities to the immediately previous render sample.
      // Incremental walking/aiming therefore cannot evade the time budget by
      // accumulating just beyond an epsilon from the last native refresh.
      state.lastInputs = inputs;
      state.hits = (state.hits || 0) + 1;
      return;
    }
    const result = nativeUpdateArc.call(this, actor, show);
    this[ARC_PREVIEW_STATE] = {
      actor, physics: G.physics, time: now,
      inputs: inputsUnknown ? null : { ...inputs },
      lastInputs: inputsUnknown ? null : inputs,
      hits: 0,
    };
    return result;
  };
  Object.defineProperty(Projectiles.prototype, ARC_PREVIEW_INSTALL, { value: true, configurable: false });
  Object.defineProperty(Projectiles.prototype, Symbol.for('inkwave.s3.arc-preview-performance.originals.v1'), {
    value: Object.freeze({ updateArc: nativeUpdateArc }), configurable: false,
  });
}
