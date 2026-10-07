import { chargerPostShotBlocksSub } from './weapon-gates.mjs';
// #750: the nearest glob uses the pinned swing DrawSizeParam; gameplay is unchanged.
import { rollerFlickDrawRadius } from './weapons-fidelity.mjs';

import { splatlingJumpRecoveryAt } from './splatling-jump-spread.mjs';
const EPS = 1e-10, DEG = Math.PI / 180;

// #729 — S3 Ver.11.3.0 resolves an impact-triggered blast one fixed frame after the
// contact (tick N impact -> tick N+1 burst), so a target can move between the two
// frames. Queued bursts are resolved from inside `Projectiles.update`; this flag keeps
// a resolved burst from being captured and queued again.
let flushing = 0;

// This retains the existing two-draw radial sampler, not a claimed S3 PDF.
// The 0.55 air-pitch factor is the existing INKWAVE sampler. The jump blend to
// the existing ground pitch endpoint is internal and unverified against S3.
export function spreadWeaponRound(system, dir, a, w, spread) {
  const horizontal = spread ?? (a.grounded ? w.spreadGround : w.spreadAir);
  // #883: Dualies expose one scalar spread envelope, so do not inherit the
  // generic path's unsourced vertical compression.
  if (w.kind === 'dualies') {
    if (horizontal <= 0) return dir;
    const radius = horizontal * DEG * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    const aim = dir.clone().normalize();
    const right = aim.clone().set(-aim.z, 0, aim.x);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0).addScaledVector(aim, -aim.x);
    right.normalize();
    const up = aim.clone().cross(right);
    return dir.copy(aim).addScaledVector(right, Math.cos(angle) * Math.tan(radius))
      .addScaledVector(up, Math.sin(angle) * Math.tan(radius)).normalize();
  }
  if (w.kind === 'shooter' || w.kind === 'blaster') {
    if (horizontal <= 0) return dir;
    // Keep the existing two-draw radial law; correct only the scalar cone
    // geometry. This is not a new claim about Nintendo's bias/PDF.
    const radius = horizontal * DEG * Math.sqrt(Math.random()), angle = Math.random() * Math.PI * 2;
    const right = dir.clone().set(-dir.z, 0, dir.x);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0).addScaledVector(dir, -dir.x);
    right.normalize();
    const up = dir.clone().cross(right).normalize();
    return dir.addScaledVector(right, Math.cos(angle) * Math.tan(radius))
      .addScaledVector(up, Math.sin(angle) * Math.tan(radius)).normalize();
  }
  const recovery = w.kind === 'splatling' ? splatlingJumpRecoveryAt(a.s3SplatlingJumpAgeFrames) : null;
  if (w.kind !== 'splatling' || !Number.isFinite(w.spreadPitchGround) || (!a.grounded && recovery === null)) {
    return system._spread(dir, horizontal);
  }
  // Keep both Splatling spread draws when the horizontal cone is zero. The
  // projectile seed and later paint effects share this gameplay RNG stream.
  const radius = Math.sqrt(Math.random()), angle = Math.random() * Math.PI * 2;
  const horizontalAngle = Math.max(0, horizontal) * DEG * radius;
  const groundPitchAngle = w.spreadPitchGround * DEG * radius;
  const airPitchAngle = Math.atan(0.55 * Math.tan(horizontalAngle));
  const pitchAngle = recovery === null ? groundPitchAngle : airPitchAngle + (groundPitchAngle - airPitchAngle) * recovery;
  const right = dir.clone().set(-dir.z, 0, dir.x);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
  right.normalize();
  const up = dir.clone().cross(right);
  return dir.addScaledVector(right, Math.cos(angle) * Math.tan(horizontalAngle))
    .addScaledVector(up, Math.sin(angle) * Math.tan(pitchAngle)).normalize();
}

export function blasterBurstDamage(p, w, distance, distanceDamage) {
  if (!p.s3TerrainBurst) return distanceDamage(w.damageBands, distance);
  // Compose with #340's player-only admission radius. Normalize the same bands
  // to the admitted radius, then halve HP, then quantize once. The continuous
  // interpolation/absolute distance curve remains an INKWAVE approximation.
  const radiusRate = w.terrainSplashRadiusRate ?? 1;
  const amount = distanceDamage(w.damageBands, distance / radiusRate) * w.terrainSplashDamageRate;
  return Math.floor((amount + EPS) * 10) / 10;
}

export function appendRollerNearUnit(system, a, w) {
  const u = w.nearFlickUnit;
  if (!u || a.weaponRunner.s3FlickVertical || a.remote) return;
  const angle = a.yaw + (Math.random() * 2 - 1) * u.halfAngleDegrees * DEG;
  const speed = w.flickSpeed * (u.speedBase + (Math.random() * 2 - 1) * u.speedRandom) / u.mainSpeedBase;
  // Width is a full-width local span in this provisional mapping. A future
  // main-unit width calibration can supply flickSpawnWidth without changing
  // the sourced 0.4 / 0.8 ratio. No exact S3 position/PDF claim is made.
  const lateral = (Math.random() - .5) * (w.flickSpawnWidth ?? u.mainWidthReference) * u.widthRatio;
  const pitch = Math.max(-.2, Math.min(.5, a.aimPitch)) + (w.ballistics ? w.ballistics.horizontalPitchDegrees * DEG : .32);
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), cp = Math.cos(pitch);
  const p = system._new();
  Object.assign(p, { type: 'drop', owner: a, team: a.team, age: 0, life: 1.4, straight: w.ballistics?.horizontalStraightTime ?? 0,
    radius: 1, damage: w.flickDamageNear, dmgFar: w.flickDamageFar, size: .15, trail: 0, trailEvery: 1.8, trailRadius: .45,
    grav: w.flickGravity ?? 26, drag: w.flickDrag ?? .4, seed: Math.random(), vis: rollerFlickDrawRadius(w, false, Math.max(0, (w.flickDrops ?? 2) - 1), 0, .185), tail0: .4, tailK: 1, wob: .1, wobF: 19, nose: 0, sats: 2,
    s3FlickUnit: 1, fidelityMode: 'horizontal', fidelityYaw: angle - a.yaw, fidelitySectorYaw: a.yaw });
  p.pos.set(a.pos.x + fx * .6 + fz * lateral, a.pos.y + 1.3, a.pos.z + fz * .6 - fx * lateral);
  p.prev.copy(p.pos); p.start.copy(p.pos);
  p.vel.set(Math.sin(angle) * cp * speed, Math.sin(pitch) * speed, Math.cos(angle) * cp * speed);
  // The existing enclosing fireFlick wrapper assigns one shared damage group
  // to all 13 bullets. _push publishes this actual velocity once to NetMatch.
  system._push(p);
}

export function paintRollerReleaseFootprint(system, a, w, { G, PLAYER, Hit, WALKABLE }) {
  const mode = a?.weaponRunner?.s3FlickVertical ? 'vertical' : 'horizontal';
  const shape = w?.releaseFootPaint?.[mode];
  if (!shape || a.remote || a.alive === false || w.kind !== 'roller' || !G.paint?.splat || !G.physics?.groundProbe) return 0;
  const forwardX = Math.sin(a.yaw), forwardZ = Math.cos(a.yaw);
  const rightX = Math.cos(a.yaw), rightZ = -Math.sin(a.yaw);
  const x = a.pos.x + rightX * shape.offset.x + forwardX * shape.offset.z;
  const z = a.pos.z + rightZ * shape.offset.x + forwardZ * shape.offset.z;
  const ground = new Hit();
  // SplashNearest's downward offset and MaxHeight bound the real ground query;
  // this lets an airborne vertical swing paint only when walkable ground is in range.
  G.physics.groundProbe(x, a.pos.y, z, shape.maxHeight, Math.abs(shape.offset.y), PLAYER.footRadius, ground, false);
  if (!ground.hit || ground.normal.y < WALKABLE || !Number.isFinite(ground.y)) return 0;
  const p = system.list[system.list.length - 1];
  if (!p || p.owner !== a || !Number.isFinite(p.seed)) return 0;
  const center = a.pos.clone().set(x, ground.y, z).addScaledVector(ground.normal, 0.1);
  const area = G.paint.splat(center, shape.paintWidthHalf, a.team, { seed: p.seed });
  if (area > 0) a.addTurf?.(area);
  return area;
}

export function installWeaponEdgecases({ Actor, WeaponRunner, Projectiles, PLAYER, G, THREE, Hit }) {
  const tag = Symbol.for('inkwave.s3.weapon-edgecases.v1');
  if (WeaponRunner.prototype[tag]) return;
  Object.defineProperty(WeaponRunner.prototype, tag, { value: true });
  // Each Dualies hand owns its birth origin. LOS intentionally omits an end
  // margin, so validate the full segment before allowing an origin in cover.
  const nativeMuzzleHand = Projectiles.prototype._muzzleHand;
  const muzzleFrom = new THREE.Vector3(), muzzleDelta = new THREE.Vector3(), muzzleHit = new Hit();
  const obstructed = end => {
    muzzleDelta.copy(end).sub(muzzleFrom);
    const distance = muzzleDelta.length();
    return distance > EPS && G.physics.raycast(muzzleFrom, muzzleDelta.multiplyScalar(1 / distance), distance, muzzleHit, true).hit;
  };
  Projectiles.prototype._muzzleHand = function (actor, hand, out) {
    nativeMuzzleHand.call(this, actor, hand, out);
    if (actor.weapon?.kind !== 'dualies') return out;
    muzzleFrom.copy(actor.pos); muzzleFrom.y += actor.form === 'squid' ? .4 : 1.05;
    if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z) || obstructed(out)) {
      out.copy(muzzleFrom).addScaledVector(actor.aimDir, .3);
      if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z) || obstructed(out)) out.copy(muzzleFrom);
    }
    return out;
  };
  const clear = r => { r.s3DualiesStart = 0; r.s3DualiesHeld = false; };
  const clearDualiesLocks = r => {
    r.s3DualiesPostShot = 0; r.s3SloshPostShot = 0; r.s3DodgeShotPending = 0;
    r.s3DualiesSubBuffered = false; r.s3DualiesSubReleaseBuffered = false;
  };
  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const out = reset.apply(this, args);
    clear(this); clearDualiesLocks(this); this.s3DualiesEmerging = false; this.s3ChargerPostShot = 0; this.s3DualiesSwimStart = null;
    return out;
  };
  // #874: dodge admission uses current fire intent, not the recent-fire presentation timer.
  const tryDodge = WeaponRunner.prototype.tryDodge;
  WeaponRunner.prototype.tryDodge = function (...args) {
    if (this.a?.weapon?.kind === 'dualies' && !this.a.intent?.fire) return false;
    return tryDodge.apply(this, args);
  };
  const update = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const r = this.weaponRunner;
    if (r) {
      if (r.s3ChargerPostShot > 0) r.s3ChargerPostShot = Math.max(0, r.s3ChargerPostShot - dt);
      if (r.s3DualiesPostShot > 0) r.s3DualiesPostShot = Math.max(0, r.s3DualiesPostShot - dt);
      if (r.s3DualiesInterruptSub > 0) r.s3DualiesInterruptSub = Math.max(0, r.s3DualiesInterruptSub - dt);
      if (r.s3DualiesInterruptSquid > 0) r.s3DualiesInterruptSquid = Math.max(0, r.s3DualiesInterruptSquid - dt);
      if (r.s3DualiesInterruptSub <= EPS && r.s3DualiesInterruptSquid <= EPS) r.s3DualiesInterruptCancelMain = false;
      const cancelAction = !this.alive || this.specialActive || this.superJumpState || this.intent.special && this.specialReady();
      if (cancelAction) {
        r.s3ChargerPostShot = 0;
        clearDualiesLocks(r);
      }
    }
    if (r && this.weapon.kind === 'dualies') {
      // #1047: a real cancellation of an active held-fire sequence owns its own
      // action recovery, independent of the previous shot's 4F post-shot clock.
      const postRoll = !!r.dodge || r.lockT > 0 || r.s3Turret || r.s3DodgeShotPending;
      const cancelEdge = r.s3DualiesHeld && this._prevIntent.fire && !postRoll &&
        (!this.intent.fire || this.intent.sub || (this.intent.squid && !this._prevIntent.squid));
      if (cancelEdge) {
        r.s3DualiesInterruptSub = Math.max(r.s3DualiesInterruptSub || 0, 5 / 60);
        r.s3DualiesInterruptSquid = Math.max(r.s3DualiesInterruptSquid || 0, 6 / 60);
        r.s3DualiesInterruptCancelMain = true;
      }
      if (this.form === 'squid') { clear(r); clearDualiesLocks(r); r.s3DualiesEmerging = true; }
      else if (this.kidT > PLAYER.emergeDelay && !this.intent.fire) r.s3DualiesEmerging = false;
      const canceled = !this.alive || !this.intent.fire || this.intent.sub || this.specialActive || this.superJumpState ||
        this.intent.special && this.specialReady() || postRoll ||
        r.s3DualiesSwimStart != null && this._prevIntent.fire && (this.form === 'squid' || this.intent.squid && !this._prevIntent.squid);
      if (canceled) {
        if (r.s3DualiesSwimStart != null) { this.fireBuffer = 0; r.s3DualiesEmerging = false; }
        r.s3DualiesSwimStart = null;
      } else if (this.form === 'squid' && !this._prevIntent.fire) {
        r.s3DualiesSwimStart = this.weapon.swimFirstShotDelay;
      } else if (r.s3DualiesSwimStart != null) {
        r.s3DualiesSwimStart = Math.max(0, r.s3DualiesSwimStart - dt);
      }
      if (!this.alive || this.specialActive || this.superJumpState || this.intent.special && this.specialReady()) clear(r);
      if (r.s3DualiesInterruptSquid > EPS && this.intent.squid) {
        const heldSquid = this.intent.squid;
        this.intent.squid = false;
        try { return update.call(this, dt); }
        finally { this.intent.squid = heldSquid; }
      }
    }
    return update.call(this, dt);
  };
  const interruptBusy = WeaponRunner.prototype.busy;
  WeaponRunner.prototype.busy = function (...args) {
    if (this.a?.weapon?.kind === 'dualies' && this.s3DualiesInterruptSquid > EPS) return true;
    return interruptBusy.apply(this, args);
  };
  const weaponUpdate = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    if (this.a.weapon.kind === 'charger' && (input?.sub || input?.subReleased)) {
      const source = input, runner = this;
      return weaponUpdate.call(this, dt, { ...source,
        get sub() { return chargerPostShotBlocksSub(runner) ? false : source.sub; },
        get subReleased() { return chargerPostShotBlocksSub(runner) ? false : source.subReleased; },
      });
    }
    const kind = this.a.weapon.kind, postShot = () => kind === 'slosher'
      ? Math.max(0, (this.s3SloshPostShot || 0) - (this.s3GateInActor ? 0 : dt))
      : this.s3DualiesPostShot;
    if (kind !== 'dualies' && kind !== 'slosher') return weaponUpdate.call(this, dt, input);
    const source = input || {}, locked = postShot() > EPS;
    if (locked) {
      if (source.sub) this.s3DualiesSubBuffered = true;
      if (source.subReleased) this.s3DualiesSubReleaseBuffered = true;
    }
    let prepared = locked ? { ...source, sub: false, subReleased: false } : { ...source };
    if (!locked && this.s3DualiesSubReleaseBuffered) {
      prepared.sub = true; prepared.subReleased = true;
      this.s3DualiesSubBuffered = false; this.s3DualiesSubReleaseBuffered = false;
    }
    const runner = this;
    const gated = new Proxy(prepared, { get(target, prop) {
      if ((prop === 'sub' || prop === 'subReleased') && postShot() > EPS) return false;
      return target[prop];
    }});
    const out = weaponUpdate.call(this, dt, gated);
    if (postShot() > EPS) {
      if (prepared.sub) this.s3DualiesSubBuffered = true;
      if (prepared.subReleased) this.s3DualiesSubReleaseBuffered = true;
    }
    return out;
  };
  const dualies = WeaponRunner.prototype._dualies;
  WeaponRunner.prototype._dualies = function (dt, inp, w) {
    const blocked = !inp.fire || inp.sub || this.a.form === 'squid';
    const postRoll = !!this.dodge || this.lockT > 0 || this.s3Turret || this.s3DodgeShotPending;
    if (blocked || postRoll) clear(this);
    if (inp.sub) return dualies.call(this, dt, { ...inp, fire: false }, w);
    if (!blocked && !postRoll) {
      if (this.s3DualiesSwimStart != null) {
        if (this.s3DualiesSwimStart > EPS) { this.cooldown = Math.max(0, this.cooldown); this.firingT = .35; return; }
        this.s3DualiesSwimStart = null;
        this.s3DualiesEmerging = true;
      }
      if (!this.s3DualiesHeld) {
        this.s3DualiesHeld = true;
        this.cooldown = Math.max(0, this.cooldown);
        if (!this.s3DualiesEmerging) this.s3DualiesStart = w.humanoidFirstShotDelay;
        this.s3DualiesEmerging = false;
        if (this.s3DualiesStart > EPS) { this.cooldown = Math.max(0, this.cooldown); this.firingT = .35; return; }
      } else if (this.s3DualiesStart > EPS) {
        this.s3DualiesStart = Math.max(0, this.s3DualiesStart - dt);
        this.cooldown = Math.max(0, this.cooldown);
        if (this.s3DualiesStart > EPS) { this.firingT = .35; return; }
      }
    }
    if (Math.abs(this.cooldown) < EPS) this.cooldown = 0;
    return dualies.call(this, dt, inp, w);
  };
  const impact = Projectiles.prototype._impact;
  Projectiles.prototype._impact = function (p, ...args) {
    const before = p.s3TerrainBurst;
    p.s3TerrainBurst = p.type === 'blast';
    try { return impact.call(this, p, ...args); }
    finally { p.s3TerrainBurst = before; }
  };
  const fresh = Projectiles.prototype._new;
  Projectiles.prototype._new = function (...args) { const p = fresh.apply(this, args); p.s3FlickUnit = 0; p.s3TerrainBurst = false; return p; };
  // #729 — an impact-triggered Blaster burst must resolve on the next fixed tick, not in
  // the contact tick. `_impact` above and the sourced wall-drop transition are the only
  // callers that raise a burst while `s3TerrainBurst` is set, so that marker alone
  // separates the terrain burst from direct victim hits, boss hits and the natural timed
  // mid-air explosion (all of which keep their current tick). The snapshot clones the
  // contact point (the shared physics scratch hit) and copies the fields the burst chain
  // reads, because the projectile returns to the pool as soon as `_impact` returns.
  const terrainBurst = Projectiles.prototype._blastBurst;
  const projectilesUpdate = Projectiles.prototype.update;
  const projectilesClear = Projectiles.prototype.clear;
  Projectiles.prototype.clear = function (...args) {
    try {
      return projectilesClear.apply(this, args);
    } finally {
      if (this.s3BlastQueue) {
        this.s3BlastQueue.length = 0;
        this.s3BlastQueue = null;
      }
    }
  };
  Projectiles.prototype.flushBlastImpacts = function () {
    const queue = this.s3BlastQueue;
    if (!queue || !queue.length) return 0;
    this.s3BlastQueue = null;
    flushing++;
    try {
      const nm = G.netm;
      for (const e of queue) {
        if (e.p.ghost && nm) nm.mute++;
        try { this._blastBurst(e.p, e.point, e.victim); }
        finally { if (e.p.ghost && nm) nm.mute--; }
      }
    }
    finally { flushing--; }
    return queue.length;
  };
  Projectiles.prototype._blastBurst = function (p, point, victim) {
    // #911: a player-direct Blaster contact uses the reduced impact burst just like terrain.
    // Keep the latest fixed-tick queue owner: mark the queued snapshot, not the live pooled round.
    const reducedDirect = !!victim && victim !== 'boss';
    if (!flushing && p.s3TerrainBurst) {
      (this.s3BlastQueue ??= []).push({
        point: point.clone(), victim,
        p: { owner: p.owner, team: p.team, ghost: !!p.ghost, wid: p.wid,
          s3Weapon: p.s3Weapon ?? null, s3TerrainBurst: true },
      });
      return;
    }
    const before = p.s3TerrainBurst;
    if (reducedDirect) p.s3TerrainBurst = true;
    try { return terrainBurst.call(this, p, point, victim); }
    finally { p.s3TerrainBurst = before; }
  };
  // Fixed-tick entry: the queued terrain burst of tick N resolves before anything moves
  // in tick N+1, so render cadence cannot change the ordering.
  Projectiles.prototype.update = function (dt) {
    this.flushBlastImpacts();
    return projectilesUpdate.call(this, dt);
  };
}
