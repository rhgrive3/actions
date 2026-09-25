import * as THREE from "three";
import { Player, GameEvents } from "../entities/Player";
import { World, RayHit } from "../physics/World";
import { InkSystem } from "../ink/InkSystem";
import { WeaponDefinition } from "../data/weapons";
import { MOVEMENT } from "../data/tuning";

export interface Projectile {
  active: boolean;
  pos: THREE.Vector3; prev: THREE.Vector3; vel: THREE.Vector3;
  owner: Player; team: number; def: WeaponDefinition;
  age: number; dripTimer: number; radius: number;
  damageMax: number; damageMin: number; falloffStart: number; falloffEnd: number;
  paintRadius: number; shape: number; drag: number; lifetime: number; gravity: number; straightTime: number;
}

export interface WeaponEvents {
  onFire(p: Player, kind: "shooter" | "roller_h" | "roller_v" | "charger", strength: number): void;
  onImpact(pos: THREE.Vector3, normal: THREE.Vector3, team: number, size: number): void;
  onChargerBeam(a: THREE.Vector3, b: THREE.Vector3, team: number, full: boolean): void;
  onPlayerHit(victim: Player, from: Player, amount: number, pos: THREE.Vector3): void;
}

const MAX_PROJ = 512;
const _hit: RayHit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), box: null!, face: 0 };
const _dir = new THREE.Vector3(), _muzzle = new THREE.Vector3(), _target = new THREE.Vector3(), _seg = new THREE.Vector3(), _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
const _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _fwd = new THREE.Vector3();

export class WeaponSystem {
  projectiles: Projectile[] = [];
  activeCount = 0;
  private rng = 12345;
  private contactCooldown = new Map<string, number>();

  constructor(private world: World, private ink: InkSystem, private players: Player[], private ev: WeaponEvents, private gev: GameEvents) {
    for (let i = 0; i < MAX_PROJ; i++) this.projectiles.push({
      active: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), owner: null!, team: 0, def: null!,
      age: 0, dripTimer: 0, radius: 0.2, damageMax: 0, damageMin: 0, falloffStart: 0, falloffEnd: 0, paintRadius: 0.5, shape: 0, drag: 0, lifetime: 1, gravity: 0, straightTime: 0,
    });
  }

  rand() { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng / 4294967296; }

  /** Aim ray: from eye/camera origin along aim direction; result target point (world) */
  aimPoint(p: Player, out: THREE.Vector3, maxDist: number): THREE.Vector3 {
    const origin = p.isHuman && p.aimOrigin ? p.aimOrigin : p.eyePos;
    aimDir(p.aimYaw, p.aimPitch, _dir);
    if (this.world.raycast(origin, _dir, maxDist + 4, _hit)) out.copy(_hit.point);
    else out.copy(origin).addScaledVector(_dir, maxDist + 4);
    return out;
  }

  muzzle(p: Player, out: THREE.Vector3) {
    _fwd.set(-Math.sin(p.aimYaw), 0, -Math.cos(p.aimYaw));
    _right.set(Math.cos(p.aimYaw), 0, -Math.sin(p.aimYaw));
    return out.copy(p.pos).addScaledVector(_right, 0.32).addScaledVector(_fwd, 0.45).add(_tmp.set(0, p.squid ? 0.4 : 1.05, 0));
  }

  update(dt: number) {
    for (const p of this.players) {
      if (!p.alive) continue;
      p.wr.cooldown -= dt;
      p.wr.firingAnim = Math.max(0, p.wr.firingAnim - dt * 6);
      if (p.weapon.kind === "shooter") this.updateShooter(p, dt);
      else if (p.weapon.kind === "roller") this.updateRoller(p, dt);
      else this.updateCharger(p, dt);
    }
    this.updateProjectiles(dt);
    for (const [k, v] of this.contactCooldown) { if (v - dt <= 0) this.contactCooldown.delete(k); else this.contactCooldown.set(k, v - dt); }
  }

  // ---------------- Shooter
  private updateShooter(p: Player, dt: number) {
    const d = p.weapon; const wr = p.wr;
    wr.spread = Math.max(0, wr.spread - d.spread.recoverPerSec * dt);
    const firing = p.input.fire && !p.squid && p.ink >= d.fire.inkPerShot;
    p.speedFactor = p.time - wr.lastFireTime < 0.25 ? d.movement.moveMulWhileFiring : 1;
    if (!firing) { if (!p.input.fire) wr.shotCount = 0; return; }
    if (wr.cooldown > 0) return;
    // first-shot delay when starting a new burst (weapon raise)
    if (wr.shotCount === 0 && p.time - wr.lastFireTime > 0.3) { wr.cooldown = d.fire.firstShotDelay; wr.shotCount = 1; return; }
    wr.shotCount++;
    wr.cooldown = d.fire.interval;
    wr.lastFireTime = p.time; wr.firingAnim = 1;
    p.ink -= d.fire.inkPerShot; wr.refillDelay = d.fire.refillDelay;
    // direction: camera aim point, from muzzle
    this.aimPoint(p, _target, d.range);
    this.muzzle(p, _muzzle);
    _dir.subVectors(_target, _muzzle).normalize();
    // muzzle obstruction: if the wall is closer than the muzzle offset, fire straight along aim instead
    const baseSpread = p.grounded ? d.spread.ground : d.spread.air;
    const spread = (baseSpread + wr.spread) * (Math.PI / 180);
    wr.spread = Math.min(3, wr.spread + d.spread.degradePerShot);
    // Splatoon shooter spread: alternates within the cone with random angle; every ~3rd shot flies perfectly straight
    const straight = this.rand() < 0.33;
    if (!straight) coneDeviate(_dir, spread * this.rand(), this.rand() * Math.PI * 2);
    const pr = this.spawn(p, d, _muzzle, _dir, d.projectile.speed);
    if (pr) { pr.damageMax = d.damage.base; pr.damageMin = d.damage.min; pr.falloffStart = d.damage.falloffStart; pr.falloffEnd = d.damage.falloffEnd; }
    this.ev.onFire(p, "shooter", 1);
  }

  // ---------------- Roller
  private updateRoller(p: Player, dt: number) {
    const d = p.weapon; const r = d.roller!; const wr = p.wr;
    wr.rollerTimer -= dt;
    p.lockMovement = false;
    switch (wr.rollerPhase) {
      case "idle": {
        p.speedFactor = 1; wr.rollDashTime = 0;
        const fireHeld = p.input.fire && !p.squid;
        if (fireHeld && p.ink > 0.5) {
          // press-time discrimination (Splatoon: tap ZR = flick, hold ZR = roll). Airborne or alt = vertical flick.
          if (p.input.altFire || !p.grounded) { if (wr.shotCount === 0) this.startFlick(p, true); wr.shotCount = 2; break; }
          if (wr.shotCount === 0) { wr.shotCount = 1; wr.rollerTimer = 0.16; }
          else if (wr.shotCount === 1 && wr.rollerTimer <= 0) { wr.rollerPhase = "roll"; wr.shotCount = 0; wr.rollDistanceAcc = 0; }
        } else {
          if (wr.shotCount === 1 && !p.squid) this.startFlick(p, false);
          wr.shotCount = 0;
        }
        break;
      }
      case "roll": {
        if (!p.input.fire || p.squid || p.ink <= 0) { wr.rollerPhase = "idle"; break; }
        wr.rollDashTime += dt;
        p.speedFactor = r.rollSpeed / MOVEMENT.runSpeed;
        const moving = p.moveSpeedNow > 0.6 && p.input.moveY > -0.2;
        if (moving && p.grounded) {
          p.ink -= r.rollInkPerSec * dt; wr.refillDelay = d.fire.refillDelay;
          // paint strip: stamp perpendicular to movement, in front of the roller drum
          const vx = p.vel.x / p.moveSpeedNow, vz = p.vel.z / p.moveSpeedNow;
          const fx = p.pos.x + vx * 0.9, fz = p.pos.z + vz * 0.9;
          wr.rollDistanceAcc += p.moveSpeedNow * dt;
          if (wr.rollDistanceAcc > 0.22) {
            wr.rollDistanceAcc = 0;
            const rot = Math.atan2(vz, vx) + Math.PI / 2; // stretch across motion
            this.ink.stampFloor(fx, fz, 0.32, p.team, 1, rot, r.rollPaintWidth / (2 * 0.32), this.rand());
            p.paintedPoints += 0.5;
          }
          // contact damage
          for (const o of this.players) {
            if (o.team === p.team || !o.alive) continue;
            const dx = o.pos.x - fx, dz = o.pos.z - fz;
            if (dx * dx + dz * dz < 1.1 * 1.1 && Math.abs(o.pos.y - p.pos.y) < 1.5) {
              const key = p.id + ":" + o.id;
              if (!this.contactCooldown.has(key)) {
                this.contactCooldown.set(key, 0.5);
                const dmg = wr.rollDashTime > r.dashTime ? r.contactDamageDash : r.contactDamageWalk;
                o.takeDamage(dmg, p, this.gev); this.ev.onPlayerHit(o, p, dmg, o.pos);
              }
            }
          }
        }
        break;
      }
      case "hflick_startup": case "vflick_startup": {
        p.lockMovement = true; p.speedFactor = 0;
        if (wr.rollerTimer <= 0) {
          const vertical = wr.rollerPhase === "vflick_startup";
          this.releaseFlick(p, vertical);
          wr.rollerPhase = vertical ? "vflick_recover" : "hflick_recover";
          wr.rollerTimer = vertical ? r.vFlickRecovery : r.hFlickRecovery;
        }
        break;
      }
      case "hflick_recover": case "vflick_recover": {
        p.speedFactor = 0.55;
        if (wr.rollerTimer <= 0) wr.rollerPhase = "idle";
        break;
      }
    }
  }

  private startFlick(p: Player, vertical: boolean) {
    const r = p.weapon.roller!; const wr = p.wr;
    const inkNeeded = vertical ? r.vFlickInk : r.hFlickInk;
    if (p.ink < inkNeeded) return;
    wr.rollerPhase = vertical ? "vflick_startup" : "hflick_startup";
    wr.rollerTimer = vertical ? r.vFlickStartup : r.hFlickStartup;
    wr.firingAnim = 1; wr.lastFireTime = p.time;
    this.ev.onFire(p, vertical ? "roller_v" : "roller_h", 0);
  }

  private releaseFlick(p: Player, vertical: boolean) {
    const d = p.weapon; const r = d.roller!;
    p.ink -= vertical ? r.vFlickInk : r.hFlickInk; p.wr.refillDelay = d.fire.refillDelay;
    this.muzzle(p, _muzzle); _muzzle.y = p.pos.y + 1.1;
    this.aimPoint(p, _target, vertical ? r.vFlickRange : r.hFlickRange);
    _fwd.subVectors(_target, _muzzle).normalize();
    const n = vertical ? r.vFlickGlobs : r.hFlickGlobs;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      _dir.copy(_fwd);
      if (vertical) {
        // vertical flick: globs land in a line ahead at increasing distance
        const range = r.vFlickRange * (0.25 + 0.75 * f);
        _dir.y += 0.28 * f + 0.08; _dir.normalize();
        coneDeviate(_dir, 0.03 * this.rand(), this.rand() * 6.28);
        const pr = this.spawn(p, d, _muzzle, _dir, r.globSpeed * (0.55 + 0.6 * f));
        if (pr) { pr.damageMax = r.vFlickDamageMax; pr.damageMin = r.vFlickDamageMin; pr.falloffStart = 0.16; pr.falloffEnd = 0.5; pr.paintRadius = 0.85 + 0.25 * f; pr.lifetime = 0.9; pr.gravity = 14; pr.straightTime = 0.08 + 0.02 * range; }
      } else {
        // horizontal flick: fan of globs, center ones fly furthest; damage falls off with distance/time
        const ang = (f - 0.5) * 2 * r.hFlickSpread * (Math.PI / 180);
        _dir.applyAxisAngle(_up, -ang);
        const centerness = 1 - Math.abs(f - 0.5) * 2;
        _dir.y += 0.14 + 0.06 * centerness; _dir.normalize();
        const pr = this.spawn(p, d, _muzzle, _dir, r.globSpeed * (0.72 + 0.28 * centerness + 0.1 * this.rand()));
        if (pr) { pr.damageMax = r.hFlickDamageMax; pr.damageMin = r.hFlickDamageMin; pr.falloffStart = d.damage.falloffStart; pr.falloffEnd = d.damage.falloffEnd; pr.paintRadius = 0.7 + 0.35 * this.rand(); pr.lifetime = 0.6; pr.gravity = 24; pr.straightTime = 0.1; }
      }
    }
    this.ev.onFire(p, vertical ? "roller_v" : "roller_h", 1);
    // splash under the roller on flick
    this.ink.stampFloor(p.pos.x - Math.sin(p.aimYaw) * 0.8, p.pos.z - Math.cos(p.aimYaw) * 0.8, 0.9, p.team, 1, 0, 1.3, this.rand());
  }

  // ---------------- Charger
  private updateCharger(p: Player, dt: number) {
    const d = p.weapon; const c = d.charger!; const wr = p.wr;
    if (wr.storedTimer > 0) { wr.storedTimer -= dt; if (wr.storedTimer <= 0) wr.storedCharge = 0; }
    if (p.squid) {
      if (wr.charging) { // store charge when submerging (Splat Charger supports charge storing)
        if (wr.charge > 0.02) { wr.storedCharge = wr.charge; wr.storedTimer = c.storeChargeTime; }
        wr.charging = false; wr.charge = 0;
      }
      p.speedFactor = 1; return;
    }
    if (p.input.fire && wr.cooldown <= 0 && p.ink > c.minInk) {
      if (!wr.charging) { wr.charging = true; wr.charge = wr.storedCharge; wr.storedCharge = 0; wr.storedTimer = 0; if (wr.charge < 0.02) this.ev.onFire(p, "charger", 0); }
      const rate = p.grounded ? 1 : 0.6; // charging in the air is slower
      const prev = wr.charge;
      wr.charge = Math.min(1, wr.charge + (dt / c.fullChargeTime) * rate);
      if (prev < 1 && wr.charge >= 1) this.ev.onFire(p, "charger", 0.5);
      p.speedFactor = d.movement.moveMulWhileCharging ?? 0.2;
      // ink drains gradually during charge up to full ink
      const inkUse = (c.fullInk - c.minInk) * (wr.charge - prev);
      p.ink = Math.max(0, p.ink - inkUse); wr.refillDelay = d.fire.refillDelay;
      return;
    }
    p.speedFactor = 1;
    if (wr.charging && !p.input.fire) {
      wr.charging = false;
      this.fireCharger(p, wr.charge);
      wr.charge = 0;
    }
  }

  private fireCharger(p: Player, charge: number) {
    const d = p.weapon; const c = d.charger!;
    const t = Math.max(0, Math.min(1, charge));
    const full = t >= 0.999;
    const range = c.minRange + (c.fullRange - c.minRange) * t;
    const damage = c.minDamage + (c.fullDamage - c.minDamage) * t * t; // damage curve is convex (footage: partial charges weak)
    p.ink -= c.minInk; p.wr.refillDelay = d.fire.refillDelay; p.wr.cooldown = c.recovery; p.wr.firingAnim = 1; p.wr.lastFireTime = p.time;
    this.aimPoint(p, _target, range);
    this.muzzle(p, _muzzle);
    _dir.subVectors(_target, _muzzle).normalize();
    let dist = range;
    const hitWorld = this.world.raycast(_muzzle, _dir, range, _hit);
    if (hitWorld) dist = _hit.t;
    // player hits along the line
    let pierced = 0;
    for (const o of this.players) {
      if (o.team === p.team || !o.alive) continue;
      _tmp.set(o.pos.x, o.centerY, o.pos.z);
      const tt = segmentPointT(_muzzle, _dir, dist, _tmp);
      if (tt < 0) continue;
      _tmp2.copy(_muzzle).addScaledVector(_dir, tt);
      const rad = o.radius + c.lineRadius + (o.squid ? 0.05 : 0.15);
      if (_tmp2.distanceToSquared(_tmp) < rad * rad) {
        o.takeDamage(damage, p, this.gev); this.ev.onPlayerHit(o, p, damage, _tmp);
        pierced++;
        if (!(full && c.pierceOnFull)) { dist = tt; break; }
      }
    }
    void pierced;
    // paint line along the ground below the beam + impact
    const step = 0.55;
    for (let s = 0.6; s < dist; s += step) {
      _tmp.copy(_muzzle).addScaledVector(_dir, s);
      if (this.dropToFloor(_tmp, 5.5)) {
        const r = c.lineRadius * (0.8 + 0.4 * this.rand()) * (0.7 + 0.6 * t);
        this.ink.stampFloor(_tmp.x, _tmp.z, r, p.team, 2, Math.atan2(_dir.x, _dir.z), 1.4, this.rand());
      }
    }
    _tmp.copy(_muzzle).addScaledVector(_dir, dist);
    if (hitWorld) this.paintAtHit(_hit, d.paint.impactRadius * (0.6 + 0.6 * t), p.team, 2);
    p.paintedPoints += dist * 0.4;
    this.ev.onChargerBeam(_muzzle.clone(), _tmp.clone(), p.team, full);
    this.ev.onFire(p, "charger", 1);
  }

  private dropToFloor(pt: THREE.Vector3, maxDrop: number): boolean {
    _tmp2.set(0, -1, 0);
    if (this.world.raycast(pt, _tmp2, maxDrop, _hit) && _hit.face === 2) { pt.copy(_hit.point); return true; }
    return false;
  }

  // ---------------- Projectiles
  private spawn(owner: Player, def: WeaponDefinition, pos: THREE.Vector3, dir: THREE.Vector3, speed: number): Projectile | null {
    let pr: Projectile | null = null;
    for (const q of this.projectiles) if (!q.active) { pr = q; break; }
    if (!pr) return null;
    pr.active = true; pr.owner = owner; pr.team = owner.team; pr.def = def;
    pr.pos.copy(pos); pr.prev.copy(pos); pr.vel.copy(dir).multiplyScalar(speed);
    pr.age = 0; pr.dripTimer = def.projectile.dripEvery; pr.radius = def.projectile.hitRadius; pr.paintRadius = def.paint.impactRadius; pr.shape = def.paint.shape;
    pr.drag = 0; pr.lifetime = def.projectile.maxLifetime; pr.gravity = def.projectile.gravity; pr.straightTime = def.projectile.straightTime;
    pr.damageMax = def.damage.base; pr.damageMin = def.damage.min; pr.falloffStart = def.damage.falloffStart; pr.falloffEnd = def.damage.falloffEnd;
    this.activeCount++;
    return pr;
  }

  private kill(pr: Projectile) { pr.active = false; this.activeCount--; }

  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      if (!pr.active) continue;
      pr.age += dt;
      pr.prev.copy(pr.pos);
      if (pr.age > pr.straightTime) {
        pr.vel.y -= pr.gravity * dt;
        // horizontal deceleration after the straight segment (shooter shots slow down noticeably)
        const k = 1 - Math.min(1, 3.2 * dt);
        pr.vel.x *= k; pr.vel.z *= k;
      }
      pr.pos.addScaledVector(pr.vel, dt);
      // world hit
      _seg.subVectors(pr.pos, pr.prev);
      const len = _seg.length();
      if (len > 1e-5) {
        _seg.multiplyScalar(1 / len);
        if (this.world.raycast(pr.prev, _seg, len + pr.radius, _hit)) {
          this.paintAtHit(_hit, pr.paintRadius, pr.team, pr.shape);
          pr.owner.paintedPoints += pr.paintRadius;
          this.ev.onImpact(_hit.point, _hit.normal, pr.team, pr.paintRadius);
          this.kill(pr); continue;
        }
      }
      // player hit
      let hitPlayer = false;
      for (const o of this.players) {
        if (o.team === pr.team || !o.alive || o.invulnerable > 0) continue;
        _tmp.set(o.pos.x, o.centerY, o.pos.z);
        const tt = len > 1e-5 ? segmentPointT(pr.prev, _seg, len, _tmp) : 0;
        if (tt < 0) continue;
        _tmp2.copy(pr.prev).addScaledVector(_seg, tt);
        const rad = pr.radius + (o.squid ? o.radius * 0.9 : o.radius) ;
        const dy = Math.abs(_tmp2.y - _tmp.y);
        const dxz = Math.hypot(_tmp2.x - _tmp.x, _tmp2.z - _tmp.z);
        if (dxz < rad && dy < o.height * 0.5 + pr.radius) {
          const f = pr.age <= pr.falloffStart ? 0 : Math.min(1, (pr.age - pr.falloffStart) / Math.max(1e-3, pr.falloffEnd - pr.falloffStart));
          const dmg = pr.damageMax + (pr.damageMin - pr.damageMax) * f;
          o.takeDamage(dmg, pr.owner, this.gev);
          this.ev.onPlayerHit(o, pr.owner, dmg, _tmp2);
          this.ink.stampFloor(o.pos.x, o.pos.z, pr.paintRadius * 0.6, pr.team, pr.shape, 0, 1, this.rand());
          this.ev.onImpact(_tmp2, _up, pr.team, pr.paintRadius * 0.6);
          hitPlayer = true; break;
        }
      }
      if (hitPlayer) { this.kill(pr); continue; }
      // drips
      if (pr.def.projectile.dripEvery > 0) {
        pr.dripTimer -= dt;
        if (pr.dripTimer <= 0) {
          pr.dripTimer = pr.def.projectile.dripEvery;
          _tmp.copy(pr.pos);
          if (this.rand() < 0.6 && this.dropToFloor(_tmp, 4.5)) { this.ink.stampFloor(_tmp.x, _tmp.z, pr.def.paint.dripRadius * (0.6 + 0.6 * this.rand()), pr.team, 0, 0, 1, this.rand()); pr.owner.paintedPoints += 0.2; }
        }
      }
      if (pr.age > pr.lifetime || pr.pos.y < -5) {
        _tmp.copy(pr.pos);
        if (this.dropToFloor(_tmp, 8)) { this.ink.stampFloor(_tmp.x, _tmp.z, pr.paintRadius * 0.8, pr.team, pr.shape, 0, 1, this.rand()); this.ev.onImpact(_tmp, _up, pr.team, pr.paintRadius * 0.7); }
        this.kill(pr);
      }
    }
  }

  private paintAtHit(hit: RayHit, radius: number, team: number, shape: number) {
    if (hit.face === 2) {
      if (hit.box.paintFloor) this.ink.stampFloor(hit.point.x, hit.point.z, radius, team, shape, this.rand() * 6.28, 1 + this.rand() * 0.4, this.rand());
    } else if (hit.face !== 3) {
      const side = hit.face === 0 ? 0 : hit.face === 1 ? 1 : hit.face === 4 ? 2 : 3;
      const tile = hit.box.wallTiles[side];
      if (tile >= 0) this.ink.stampWall(tile, hit.point, radius * 0.9, team, shape, this.rand());
      // splash also lands on the floor at the base of the wall when close
      if (hit.point.y - hit.box.min.y < 1.2) {
        _tmp.copy(hit.point).addScaledVector(hit.normal, 0.3);
        if (this.dropToFloor(_tmp, 2)) this.ink.stampFloor(_tmp.x, _tmp.z, radius * 0.7, team, shape, 0, 1.6, this.rand());
      }
    }
  }
}

export function aimDir(yaw: number, pitch: number, out: THREE.Vector3) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

function coneDeviate(dir: THREE.Vector3, angle: number, roll: number) {
  if (angle <= 0) return;
  _tmp2.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.99) _tmp2.set(1, 0, 0);
  _right.crossVectors(dir, _tmp2).normalize();
  _tmp2.crossVectors(_right, dir).normalize();
  const s = Math.sin(angle), c = Math.cos(angle);
  dir.multiplyScalar(c).addScaledVector(_right, s * Math.cos(roll)).addScaledVector(_tmp2, s * Math.sin(roll)).normalize();
}

/** Parameter t along segment (origin, dir, len) closest to point; -1 if before start. */
function segmentPointT(o: THREE.Vector3, dir: THREE.Vector3, len: number, p: THREE.Vector3): number {
  const t = (p.x - o.x) * dir.x + (p.y - o.y) * dir.y + (p.z - o.z) * dir.z;
  if (t < -0.3) return -1;
  return Math.max(0, Math.min(len, t));
}
