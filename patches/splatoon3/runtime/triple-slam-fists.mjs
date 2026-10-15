// Splatoon 3 Ver. 11.3.0 Triple Splashdown (ground activation): the two ink fists
// travel 6.54 source units, 30 degrees either side of the activation yaw, and
// explode 15F after the player's own landing impact.
//
// Sources: pinned Leanny/splat3@7280ff9c WeaponSpPogo BlastParamNormal
// (6.4/9.6 damage endpoints, 10/11/12 paint radius and 1/1.05/1.1 damage-
// radius AP scale) and BulletParam (6.54 travel, 15F MoveFrame); Splatoon Wiki
// and Nintendo's 11.3.0 notes provide additional contextual references.
//
// Unverified and therefore not claimed: the falloff shape between 220 and 60
// (linear here), fist mesh/texture, the fists rising over slopes and short walls
// (LOS-blocking is an approximation), fist SFX/VFX, and remote presentation.
// Super Jump Slam never reaches _startSpecial, so it stays a single explosion.

import { gearCurve } from './gear.mjs';

const INSTALL = Symbol.for('inkwave.s3.triple-slam-fists');
const DEG = Math.PI / 180;
export const FIST_TRAVEL = 15 / 60;
export const FIST_SOURCE_DISTANCE = 6.54;
export const FIST_SOURCE_ANGLE = 30 * DEG;
export const FIST_NEAR_RADIUS = 6.4;
export const FIST_FAR_RADIUS = 9.6;
export const FIST_PAINT_RADIUS = 10;
export const FIST_DAMAGE_RADIUS_AP = Object.freeze([1, 1.05, 1.1]);
export const FIST_PAINT_RADIUS_AP = Object.freeze([10, 11, 12]);
// The pinned Pogo source applies Special Power Up to radius, not damage.
// Capture these curves at activation; changing gear later cannot retune a live fist.
export function tripleSlamFistPower(ap = 0) {
  const points = finite(ap) ? ap : 0;
  return {
    damageRadiusRate: gearCurve(points, ...FIST_DAMAGE_RADIUS_AP),
    paintRadius: gearCurve(points, ...FIST_PAINT_RADIUS_AP),
  };
}
// Remote paint admission accepts radius <= 3.744 (network-replication PAINT_RADIUS_MAX, #522), so a
// 10-radius fist splat cannot be replicated as one row. It is emitted as a hex cluster of stamps at
// this radius instead. Each stamp is an ordinary paint row that every peer admits, so sender and
// receiver replay the same stamps. The cluster approximates the single 10-radius footprint; it is
// not the same shape (tests/issue-912-fist-paint-replication.test.mjs measures the area and coverage).
export const FIST_STAMP_RADIUS = 3.74;
// Hex spacing and stamp-centre inset were tuned on the logic footprint (not the game): 19 stamps per
// fist give ~1.12x the single 10-radius claimed area with ~95% of its cells covered.
const FIST_STAMP_SPACING = 1.0 * FIST_STAMP_RADIUS;
const FIST_STAMP_INSET = 1.5;
// Wire rows keep centre/radius to 2 dp and seed to 3 dp (netmatch recSplat). Quantising here means
// the sender's CPU turf uses the same values the receiver reconstructs.
const q2 = x => Math.round(x * 100) / 100;
const q3 = x => Math.round(x * 1000) / 1000;

const finite = x => typeof x === 'number' && Number.isFinite(x);

export function tripleSlamFistStamps(radius) {
  if (!finite(radius) || radius <= 0) return [];
  const s = FIST_STAMP_SPACING, dz = s * Math.sqrt(3) / 2;
  const rows = Math.ceil(radius / dz), cols = Math.ceil(radius / s);
  const stamps = [];
  for (let j = -rows; j <= rows; j++) {
    const z = j * dz, shift = (j & 1) ? s / 2 : 0;
    for (let i = -cols; i <= cols; i++) {
      const x = i * s + shift;
      if (Math.hypot(x, z) <= radius - FIST_STAMP_INSET) stamps.push({ dx: x, dz: z });
    }
  }
  return stamps;
}

export function tripleSlamFistCenters(origin, yaw, scale = 1) {
  if (!origin || ![origin.x, origin.y, origin.z, yaw, scale].every(finite) || scale <= 0)
    return [];
  const distance = FIST_SOURCE_DISTANCE * scale;
  return [-FIST_SOURCE_ANGLE, FIST_SOURCE_ANGLE].map(offset => {
    const angle = yaw + offset;
    return { x: origin.x + Math.sin(angle) * distance,
      y: origin.y, z: origin.z + Math.cos(angle) * distance };
  });
}

export function tripleSlamFistDamage(distance, scale = 1) {
  if (!finite(distance) || distance < 0 || !finite(scale) || scale <= 0) return 0;
  const near = FIST_NEAR_RADIUS * scale, far = FIST_FAR_RADIUS * scale;
  if (distance > far) return 0;
  if (distance <= near) return 220;
  return 220 + (60 - 220) * ((distance - near) / (far - near));
}

function blast(actor, record, G, THREE) {
  if (!G?.projectiles?.applyHit || actor.remote || !record?.centers?.length) return;
  const v = new THREE.Vector3(), from = new THREE.Vector3(), stampAt = new THREE.Vector3();
  const damageRadiusScale = record.scale * (record.damageRadiusRate ?? 1);
  const paintRadius = record.scale * (record.paintRadius ?? FIST_PAINT_RADIUS);
  for (const center of record.centers) {
    const top = Number.isFinite(G.level?.groundHeight?.(center.x, center.z, center.y + 8))
      ? G.level.groundHeight(center.x, center.z, center.y + 8) : center.y;
    const pos = v.set(center.x, top + .12, center.z);
    const source = from.set(record.origin.x, record.origin.y + .6, record.origin.z);
    // A wall between the player and a fist blocks that fist entirely. The real
    // fist path over short walls and slopes is not modelled (unverified).
    if (G.physics?.los && !G.physics.los(source, pos)) continue;
    if (G.paint?.splat) {
      // Same ownership split as the player's impact: painted area is personal
      // turf and never refills the special gauge. Each stamp is an admissible
      // remote row (radius <= FIST_STAMP_RADIUS); the cluster replaces one 10-radius splat.
      let area = 0;
      for (const stamp of tripleSlamFistStamps(paintRadius)) {
        const sx = q2(center.x + stamp.dx), sz = q2(center.z + stamp.dz);
        // Splitting a single impact changes only horizontal stamp placement.
        // Re-projecting each offset onto groundHeight would lift ink onto an
        // unrelated upper shelf (or lower it off a cliff), bypassing the old
        // splat's surface-side/height rejection. Keep the admitted fist plane.
        const at = stampAt.set(sx, q2(pos.y), sz);
        // A split centre must not cross solid cover and paint its back face.
        // The original single centre stayed on the admitted side of that wall.
        if (G.physics?.los && !G.physics.los(pos, at)) continue;
        const got = G.paint.splat(at, FIST_STAMP_RADIUS, actor.team,
          { seed: q3(Math.random()), claimOwner: actor, claimMode: 'no-special' });
        if (Number.isFinite(got) && got > 0) area += got;
      }
      if (area > 0) actor.addTurfNoSpecial?.(area);
    }
    for (const victim of G.actors || []) {
      if (!victim.alive || victim.team === actor.team || victim === actor) continue;
      const dist = Math.hypot(victim.pos.x - pos.x, victim.pos.y + .8 - pos.y, victim.pos.z - pos.z);
      const damage = tripleSlamFistDamage(dist, damageRadiusScale);
      if (!(damage > 0)) continue;
      const target = new THREE.Vector3(victim.pos.x, victim.pos.y + .8, victim.pos.z);
      if (G.physics?.los && !G.physics.los(pos, target)) continue;
      // Separate calls on purpose: overlapping explosions stack, and the
      // player's own blast is not deduplicated against these.
      G.projectiles.applyHit(actor, victim, damage, 'slam');
    }
    // Local presentation only. The special:slam event is deliberately not
    // emitted: the boss listener would apply its own 180/55 splash per fist.
    G.fx?.explosion?.(pos, actor.color, FIST_FAR_RADIUS * damageRadiusScale);
  }
}

export function tickTripleSlamFists(actor, dt, G, THREE) {
  const state = actor?._s3TripleSlamFists;
  if (!state || actor.remote || !finite(dt) || !(dt > 0)) return false;
  // Fists are released only by the owner's landing. If the owner is splatted
  // first, they are cancelled; no source supports a fist-only blast.
  if (state.remaining == null) {
    if (!actor.alive) actor._s3TripleSlamFists = null;
    return false;
  }
  state.remaining = Math.max(0, state.remaining - dt);
  if (state.remaining > 1e-10) return false;
  actor._s3TripleSlamFists = null;
  blast(actor, state, G, THREE);
  return true;
}

export function installTripleSlamFists({ Actor, G, THREE }, profile) {
  if (!Actor || !G || !THREE || Actor.prototype[INSTALL]) return;
  Object.defineProperty(Actor.prototype, INSTALL, { value: true });
  const scale = profile?.weaponsFidelityCompletion?.worldUnitsPerSourceUnit;
  const worldScale = finite(scale) && scale > 0 ? scale : 1;
  const start = Actor.prototype._startSpecial, impact = Actor.prototype._slamImpact,
    update = Actor.prototype.update, reset = Actor.prototype.reset;

  Actor.prototype._startSpecial = function (...args) {
    const admitted = this.alive && !this.remote && !this.superJumpState && this.weapon?.special === 'slam';
    const origin = admitted ? { x: this.pos.x, y: this.pos.y, z: this.pos.z } : null;
    const yaw = this.yaw;
    const result = start.apply(this, args);
    if (admitted && this.specialActive?.id === 'slam') {
      const power = tripleSlamFistPower(this.s3?.modifiers?.specialPowerAP ?? this.s3?.abilityPoints?.specialPower ?? 0);
      this._s3TripleSlamFists = { origin, centers: tripleSlamFistCenters(origin, yaw, worldScale),
        remaining: null, scale: worldScale, ...power };
    }
    return result;
  };
  Actor.prototype._slamImpact = function (...args) {
    const state = this._s3TripleSlamFists;
    const result = impact.apply(this, args);
    if (state && !this.remote && this._s3TripleSlamFists === state && state.remaining == null)
      state.remaining = FIST_TRAVEL;
    return result;
  };
  // Ticked before the native update: a fist released by this frame's landing
  // is counted from the next fixed tick, so the delay is exactly 15F.
  Actor.prototype.update = function (dt, ...args) {
    tickTripleSlamFists(this, dt, G, THREE);
    return update.call(this, dt, ...args);
  };
  if (typeof reset === 'function') Actor.prototype.reset = function (...args) {
    this._s3TripleSlamFists = null;
    return reset.apply(this, args);
  };
}
