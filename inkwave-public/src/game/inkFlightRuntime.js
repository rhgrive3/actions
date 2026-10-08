import * as THREE from 'three';
import { G, emit } from '../core/ctx.js';
import { PLAYER } from '../config.js';
import { Hit } from './physics.js';
import { capsuleEntry, sweepLevelSphere } from './inkCollision.js';
import { INK_DT, INK_HZ, INK_LENGTH_SCALE, INK_PROFILES, INK_MODEL, INK_PROTOCOL,
  advanceInkFrame, damageAt, paintShape, splashShape, splashPlan, seededUnit } from './inkFlight.js';
const EPS = 1e-9;
const Z = new THREE.Vector3(0, 0, 1);

// Head rounds remain in Projectiles.list. Droplets live independently so a head
// dying does NOT erase already detached ink, and drops can never hit actors.
export class InkFlightRuntime {
  constructor(system) {
    this.system = system; this.drops = []; this.pool = []; this.time = 0;
    this.worldHit = new Hit(); this.dropHit = new Hit();
    this.base = new THREE.Vector3(); this.point = new THREE.Vector3(); this.normal = new THREE.Vector3();
    this.heading = new THREE.Vector3(); this.matrix = new THREE.Matrix4(); this.rotation = new THREE.Quaternion(); this.scale = new THREE.Vector3();
    this.stats = { spawned: 0, landed: 0, headImpacts: 0, peakDrops: 0 };
    this.trace = null;
  }
  clear() {
    this.pool.push(...this.drops); this.drops.length = 0; this.time = 0;
    Object.assign(this.stats, { spawned: 0, landed: 0, headImpacts: 0, peakDrops: 0 });
  }
  configure(p, key, sequence, seed, locked = false) {
    const profile = INK_PROFILES[key];
    if (!profile || !Number.isSafeInteger(sequence) || sequence < 0 || !Number.isFinite(seed) || seed < 0 || seed >= 1) return false;
    p.inkProfile = profile; p.inkKey = key; p.inkSequence = sequence;
    p.inkPlan = splashPlan(profile, sequence); p.seed = seed;
    p.inkFrame = 0; p.inkPhase = 0; p.inkCarry = 0; p.inkTravel = 0; p.inkSpawned = 0;
    p.inkBirth = this.time; p.inkPeak = p.pos.y;
    p.inkPlayerRadius = (locked && profile.collision.playerLocked || profile.collision.player) * INK_LENGTH_SCALE;
    p.inkMeta = [INK_PROTOCOL, key, sequence, seed, !!locked];
    p.sats = 0; p.trailEvery = 0; p.age = 0; p.life = INK_MODEL.headLife;
    p.straight = profile.motion.straightFrames * INK_DT;
    p.size = p.inkPlayerRadius;
    p.damage = p.ghost ? 0 : profile.damage.max;
    p.radius = profile.paint.widthNear * INK_LENGTH_SCALE;
    return true;
  }
  restore(p, meta) {
    if (!Array.isArray(meta) || meta.length !== 5 || meta[0] !== INK_PROTOCOL || typeof meta[4] !== 'boolean') return false;
    return this.configure(p, meta[1], meta[2], meta[3], meta[4]);
  }
  beginFrame(dt) { this.time += dt; }
  world(from, to, radius, hit) {
    // Test adapters may expose only segment(); live runtime uses exact OBB sweep.
    return G.physics.level ? sweepLevelSphere(G.physics.level, from, to, radius, hit, true) : G.physics.segment(from, to, hit, true);
  }
  stepHead(p, dt) {
    p.inkCarry += dt;
    while (p.inkCarry + EPS >= INK_DT) {
      p.inkCarry = Math.max(0, p.inkCarry - INK_DT);
      if (p.age + EPS >= p.life) return true;
      p.prev.copy(p.pos);
      const previousAge = p.age;
      advanceInkFrame(p, p.inkProfile);
      p.inkPeak = Math.max(p.inkPeak, p.pos.y);
      const length = p.prev.distanceTo(p.pos);
      const world = this.world(p.prev, p.pos, p.inkProfile.collision.field * INK_LENGTH_SCALE, this.worldHit);
      let first = world.hit ? world.dist / Math.max(EPS, length) : Infinity, target = null, boss = null;
      for (const actor of G.actors) {
        if (!actor.alive || actor.team === p.team) continue;
        this.base.set(actor.pos.x, actor.pos.y + (actor.smoothY || 0), actor.pos.z);
        const t = capsuleEntry(p.prev, p.pos, this.base, PLAYER.radius,
          actor.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, p.inkPlayerRadius);
        // World wins ties: no wall-through damage, independent of actors order.
        if (t < first - EPS) { first = t; target = actor; }
      }
      if (G.boss) {
        const hit = G.boss.segHit(p.prev, p.pos, p.inkPlayerRadius * 0.6);
        const t = hit ? p.prev.distanceTo(hit.point) / Math.max(EPS, length) : Infinity;
        if (t < first - EPS) { first = t; boss = hit; target = null; }
      }
      const stop = Math.min(1, first);
      this.emitAlong(p, length, stop, previousAge, first <= 1);
      p.inkTravel += length * stop;
      if (first <= 1) {
        p.pos.lerpVectors(p.prev, p.pos, first);
        // Paint-only ghosts NEVER create damage, paint, turf, impact sound or FX.
        // Their detached drops are visual only; authoritative splat packets paint.
        if (!p.ghost) {
          this.stats.headImpacts++;
          const damage = damageAt(p.inkProfile, previousAge + INK_DT * first);
          if (target) {
            this.system.applyHit(p.owner, target, damage, p.wid || p.inkKey);
            this.normal.copy(p.vel).normalize().negate();
            G.fx?.burst(p.pos, this.normal, p.owner.color, { count: 6, speed: 3, size: 0.07 });
            emit('weapon:impact', { pos: p.pos.clone(), normal: this.normal.clone(), team: p.team, kind: 'shot', radius: 0.3, victim: target });
          } else if (boss) {
            p.damage = damage; this.system._bossImpact(p, boss);
          } else this.impact(p, world);
        }
        return true;
      }
      if (p.pos.y < PLAYER.waterY - 1.8 || p.age + EPS >= p.life) return true;
    }
    return false;
  }
  emitAlong(p, length, stop, previousAge, collision) {
    const plan = p.inkPlan, end = p.inkTravel + length * stop;
    while (p.inkSpawned < plan.count) {
      const at = plan.first + p.inkSpawned * plan.spacing;
      if (at > end + EPS || collision && at >= end - EPS) break;
      const fraction = length > EPS ? Math.max(0, (at - p.inkTravel) / length) : 0;
      this.point.copy(p.prev).lerp(p.pos, fraction);
      this.spawnDrop(p, this.point, p.inkSpawned, p.inkBirth + previousAge + fraction * INK_DT);
      p.inkSpawned++;
    }
  }
  spawnDrop(head, at, index, birth) {
    const p = this.pool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), heading: new THREE.Vector3() };
    const profile = head.inkProfile, feet = index === 0 && head.inkPlan.feet;
    const seed = seededUnit(head.seed, 37 + index), h = Math.hypot(head.vel.x, head.vel.z);
    const fx = h > EPS ? head.vel.x / h : 0, fz = h > EPS ? head.vel.z / h : 1;
    const lateral = (seededUnit(seed, 1) * 2 - 1) * INK_MODEL.dropRandomX * INK_HZ * INK_LENGTH_SCALE;
    const forward = (INK_MODEL.dropRandomZMin + seededUnit(seed, 2) * (INK_MODEL.dropRandomZMax - INK_MODEL.dropRandomZMin)) * INK_HZ * INK_LENGTH_SCALE;
    p.vel.set(fx * forward + fz * lateral,
      (seededUnit(seed, 3) * 2 - 1) * INK_MODEL.dropRandomY * INK_HZ * INK_LENGTH_SCALE,
      fz * forward - fx * lateral);
    p.pos.copy(at); p.prev.copy(at); p.heading.set(fx, 0, fz);
    p.owner = head.owner; p.team = head.team; p.ghost = head.ghost; p.profile = profile;
    p.feet = feet; p.seed = seed; p.birth = birth; p.age = 0; p.frame = 0; p.startY = at.y;
    this.drops.push(p); this.stats.spawned++; this.stats.peakDrops = Math.max(this.stats.peakDrops, this.drops.length);
    this.trace?.({ event: 'drop-born', weapon: head.inkKey, sequence: head.inkSequence, index, feet, time: birth, pos: at.toArray(), ghost: !!p.ghost });
  }
  updateDrops() {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const p = this.drops[i], targetAge = this.time - p.birth;
      let dead = false;
      while ((p.frame + 1) * INK_DT <= targetAge + EPS) {
        p.prev.copy(p.pos); p.frame++; p.age = p.frame * INK_DT;
        p.vel.multiplyScalar(1 - INK_MODEL.dropDrag);
        p.vel.y -= INK_MODEL.dropGravity * INK_HZ * INK_LENGTH_SCALE;
        p.pos.addScaledVector(p.vel, INK_DT);
        const hit = this.world(p.prev, p.pos, INK_MODEL.dropFieldRadius, this.dropHit);
        if (hit.hit) {
          if (!p.ghost) {
            const shape = splashShape(p.profile, p.feet, Math.max(0, p.startY - hit.point.y));
            this.paint(p, hit, shape, p.heading, p.feet ? 'trail' : 'drop');
            this.stats.landed++;
            emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: 'drop', radius: shape.radius });
            this.trace?.({ event: 'drop-landed', time: p.birth + p.age, feet: p.feet, pos: hit.point.toArray(), face: hit.face });
          }
          dead = true; break;
        }
        if (p.age + EPS >= INK_MODEL.dropLife || p.pos.y < PLAYER.waterY - 1.8) { dead = true; break; }
      }
      if (dead) { this.drops[i] = this.drops[this.drops.length - 1]; this.drops.pop(); this.pool.push(p); }
    }
  }
  paint(p, hit, shape, heading, kind) {
    if (p.ghost || !Number.isInteger(hit.face) || hit.face < 0) return;
    // The struck face owns paint. This avoids splatting through a thin ceiling
    // onto another floor simply because that floor is inside a paint sphere.
    this.point.copy(hit.point).addScaledVector(hit.normal, 0.005);
    this.heading.copy(heading).addScaledVector(hit.normal, -heading.dot(hit.normal));
    const projected = this.heading.length();
    if (projected > EPS) this.heading.multiplyScalar(1 / projected);
    const options = { seed: p.seed, kind, face: hit.face,
      stretch: projected > EPS ? this.heading : undefined, stretchAmt: projected > EPS ? shape.stretch : 0 };
    p.owner.addTurf(G.paint.splat(this.point, shape.radius, p.team, options));
  }
  impact(p, hit) {
    const speed = p.vel.length(), angle = Math.asin(Math.min(1, Math.abs(p.vel.dot(hit.normal)) / Math.max(EPS, speed))) * 180 / Math.PI;
    const shape = Math.abs(hit.normal.y) < 0.5 ? { radius: p.inkProfile.paint.wallRadius * INK_LENGTH_SCALE, stretch: 0 } :
      paintShape(p.inkProfile, p.start.distanceTo(hit.point), angle, p.inkPhase, Math.max(0, p.inkPeak - hit.point.y));
    this.paint(p, hit, shape, p.vel, 'shot');
    G.fx?.burst(hit.point, hit.normal, p.owner.color, { count: 5, speed: 3, size: 0.07, paint: false });
    emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: 'shot', radius: shape.radius });
  }
  draw(blobs, shapes, index, capacity) {
    for (const p of this.drops) {
      if (index >= capacity) break; // visual cap never limits gameplay or paint
      const speed = p.vel.length(); this.normal.copy(p.vel).multiplyScalar(1 / Math.max(EPS, speed));
      if (speed < EPS) this.normal.copy(Z);
      this.rotation.setFromUnitVectors(Z, this.normal);
      const growth = Math.min(1, 0.7 + p.age * 20);
      this.scale.setScalar(INK_MODEL.dropDrawRadius * (p.feet ? 1.15 : 1) * growth);
      this.matrix.compose(p.pos, this.rotation, this.scale);
      blobs.setMatrixAt(index, this.matrix); blobs.setColorAt(index, p.owner.color);
      const offset = index * 4; shapes[offset] = 1 + Math.min(0.8, speed * 0.025);
      shapes[offset + 1] = 0.035; shapes[offset + 2] = p.seed * 40 + p.age * 22; shapes[offset + 3] = 0.2;
      index++;
    }
    return index;
  }
}
