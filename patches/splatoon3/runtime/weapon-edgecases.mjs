const EPS = 1e-10, DEG = Math.PI / 180;

// This retains the existing two-draw radial sampler, not a claimed S3 PDF.
// Ground pitch has its own angular envelope; neither bloom nor the horizontal
// scalar is evidence for scaling PitchDegSwerve. Air/IA remain uncalibrated.
export function spreadWeaponRound(system, dir, a, w, spread) {
  const horizontal = spread ?? (a.grounded ? w.spreadGround : w.spreadAir);
  if (w.kind !== 'splatling' || !a.grounded || !Number.isFinite(w.spreadPitchGround)) return system._spread(dir, horizontal);
  const radius = Math.sqrt(Math.random()), angle = Math.random() * Math.PI * 2;
  const right = dir.clone().set(-dir.z, 0, dir.x);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
  right.normalize();
  const up = dir.clone().cross(right);
  return dir.addScaledVector(right, Math.cos(angle) * Math.tan(Math.max(0, horizontal) * DEG * radius))
    .addScaledVector(up, Math.sin(angle) * Math.tan(w.spreadPitchGround * DEG * radius)).normalize();
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
  if (!u || a.weaponRunner.s3FlickVertical || a.weaponRunner.s3RollerAttack?.depleted || a.remote) return;
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
    grav: w.flickGravity ?? 26, drag: w.flickDrag ?? .4, seed: Math.random(), vis: .185, tail0: .4, tailK: 1, wob: .1, wobF: 19, nose: 0, sats: 2,
    s3FlickUnit: 1, fidelityMode: 'horizontal', fidelityYaw: angle - a.yaw });
  p.pos.set(a.pos.x + fx * .6 + fz * lateral, a.pos.y + 1.3, a.pos.z + fz * .6 - fx * lateral);
  p.prev.copy(p.pos); p.start.copy(p.pos);
  p.vel.set(Math.sin(angle) * cp * speed, Math.sin(pitch) * speed, Math.cos(angle) * cp * speed);
  // The existing enclosing fireFlick wrapper assigns one shared damage group
  // to all 13 bullets. _push publishes this actual velocity once to NetMatch.
  system._push(p);
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
  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) { const out = reset.apply(this, args); clear(this); this.s3DualiesEmerging = false; return out; };
  const update = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const r = this.weaponRunner;
    if (r && this.weapon.kind === 'dualies') {
      if (this.form === 'squid') { clear(r); r.s3DualiesEmerging = true; }
      else if (this.kidT > PLAYER.emergeDelay && !this.intent.fire) r.s3DualiesEmerging = false;
      if (!this.alive || this.specialActive || this.superJumpState || this.intent.special && this.specialReady()) clear(r);
    }
    return update.call(this, dt);
  };
  const dualies = WeaponRunner.prototype._dualies;
  WeaponRunner.prototype._dualies = function (dt, inp, w) {
    const blocked = !inp.fire || inp.sub || this.a.form === 'squid';
    const postRoll = !!this.dodge || this.lockT > 0 || this.s3Turret || this.s3DodgeShotPending;
    if (blocked || postRoll) clear(this);
    if (inp.sub) return dualies.call(this, dt, { ...inp, fire: false }, w);
    if (!blocked && !postRoll) {
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
}
