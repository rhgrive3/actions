import { biasQuantile } from './weapon-accuracy.mjs';
import { chargerPostShotBlocksSub } from './weapon-gates.mjs';
// #750: the nearest glob uses the pinned swing DrawSizeParam; gameplay is unchanged.
import { rollerFlickDrawRadius } from './weapons-fidelity.mjs';

const EPS = 1e-10, DEG = Math.PI / 180;
const EMPTY_SUB_GATE_INPUT = Object.freeze({});
function subGateLocked(runner, kind, dt) {
  const postShot = kind === 'slosher'
    ? Math.max(0, (runner.s3SloshPostShot || 0) - (runner.s3GateInActor ? 0 : dt))
    : runner.s3DualiesPostShot;
  // Community v10.0.1: Slosher sub admission is 15F, squid admission 16F.
  const subThreshold = kind === 'slosher' ? 1 / 60 : 0;
  return postShot > subThreshold + EPS || (kind === 'dualies' && (runner.s3DualiesInterruptSub || 0) > EPS);
}
function makeSubGateInput(runner) {
  const state = { runner, source: EMPTY_SUB_GATE_INPUT, kind: '', dt: 0,
    sub: false, subReleased: false, cancelMain: false };
  const read = prop => {
    if (prop === 'sub' || prop === 'subReleased')
      return subGateLocked(runner, state.kind, state.dt) ? false : state[prop];
    if (state.cancelMain && (prop === 'fire' || prop === 'firePressed')) return false;
    return state.source[prop];
  };
  const view = new Proxy({}, {
    get: (_, prop) => read(prop),
    has: (_, prop) => prop === 'sub' || prop === 'subReleased' || Reflect.has(state.source, prop),
    ownKeys: () => {
      const keys = Reflect.ownKeys(state.source);
      for (const prop of ['sub', 'subReleased'])
        if (!keys.includes(prop)) keys.push(prop);
      return keys;
    },
    getOwnPropertyDescriptor: (_, prop) => {
      const descriptor = Object.getOwnPropertyDescriptor(state.source, prop);
      if (!descriptor && prop !== 'sub' && prop !== 'subReleased') return undefined;
      return { configurable: true, enumerable: descriptor?.enumerable ?? true,
        writable: true, value: read(prop) };
    },
  });
  return { state, view };
}

// Reuse one late-bound input view per runner instead of creating a Proxy
// on every 60 Hz update. The visible keys and descriptors still come from
// the *current* spread snapshot, including when native code enumerates it.
// The owner pointer is temporarily restored by the call site for reentry.
export function dualiesInputGate(runner) {
  const current = () => runner._s3DualiesPreparedInput || {};
  return new Proxy({}, {
    get(_target, prop) {
      if ((prop === 'sub' || prop === 'subReleased') && runner.s3DualiesPostShot > EPS) return false;
      return current()[prop];
    },
    has(_target, prop) { return prop in current(); },
    set(_target, prop, value) { current()[prop] = value; return true; },
    deleteProperty(_target, prop) { return delete current()[prop]; },
    ownKeys() { return Reflect.ownKeys(current()); },
    getOwnPropertyDescriptor(_target, prop) { return Object.getOwnPropertyDescriptor(current(), prop); },
    defineProperty(_target, prop, descriptor) { return Reflect.defineProperty(current(), prop, descriptor); },
  });
}


// #729 — S3 Ver.11.3.0 resolves an impact-triggered blast one fixed frame after the
// contact (tick N impact -> tick N+1 burst), so a target can move between the two
// frames. Queued bursts are resolved from inside `Projectiles.update`; this flag keeps
// a resolved burst from being captured and queued again.
let flushing = 0;

// The S3 community studies specify signed one-axis angular sampling and
// Splatling-specific pitch. Each axis uses the same bias quantile but a
// separate draw. The actual Nintendo game PRNG remains unverified.
export function signedBiasSample(u, bias = .5) {
  if (!Number.isFinite(u)) return 0;
  const signed = Math.max(-1, Math.min(1, 2 * u - 1));
  if (!signed) return 0;
  return Math.sign(signed) * biasQuantile(Math.abs(signed), bias);
}

export function spreadWeaponRound(system, dir, a, w, spread) {
  const horizontal = spread ?? (a.grounded ? w.spreadGround : w.spreadAir);
  const bias = a.weaponRunner?.s3ShotBias;
  const radiusSample = u => Number.isFinite(bias?.horizontal)
    ? biasQuantile(u, bias.horizontal) : Math.sqrt(u);
  // S3 source-backed: Shooter, Blaster and Dualies have horizontal (yaw)
  // deviation only. Splatlings uniquely carry independent PitchDegSwerve.
  // Sources: https://note.com/kanamoji_1027/n/n20cb3c3fb251 and
  // https://wikiwiki.jp/splatoon3mix/ブキ/スピナー属
  // Keep the existing two random draws (magnitude then signed side), since
  // the shot seed, network replay and later paint use this gameplay RNG stream.
  if (w.kind === 'dualies' || w.kind === 'shooter' || w.kind === 'blaster') {
    if (horizontal <= 0) return dir;
    const magnitude = horizontal * DEG * radiusSample(Math.random());
    const side = Math.random() < .5 ? -1 : 1;
    const yaw = magnitude * side, c = Math.cos(yaw), s = Math.sin(yaw);
    // Rotate around world up: preserve the vertical aim component exactly.
    const x = dir.x, z = dir.z;
    return dir.set(x * c + z * s, dir.y, z * c - x * s).normalize();
  }
  if (w.kind !== 'splatling' || !Number.isFinite(w.spreadPitchGround)) {
    return system._spread(dir, horizontal);
  }
  // S3 Splatling samples horizontal and pitch deviation as independent
  // SIGNED angular offsets, each with its own bias/maximum-angle field.
  // See Kanamoji 2024 Splatling theory (note.com/kanamoji_1027/n/n4de8b03535de).
  // Both legacy random draws remain: replacing the shared circle radius/azimuth
  // removes their artificial correlation without changing projectile seed order.
  const yawOffset = Math.max(0, horizontal) * DEG * signedBiasSample(Math.random(), bias?.horizontal);
  const pitchOffset = Math.max(0, w.spreadPitchGround) * DEG * signedBiasSample(Math.random(), bias?.pitch);
  const yaw = Math.atan2(dir.x, dir.z) + yawOffset;
  const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + pitchOffset;
  // Horizontal aim is rotated around world Y; independent pitch is then added
  // to the original aim elevation. This retains speed and unit direction.
  return dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
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
  // #305: the near unit keeps its own sourced DepletionSpeedRate in a depleted swing.
  const depleted = !!w.s3Depletion, speedRate = depleted ? (u.depletionSpeedRate ?? 1) : 1;
  const speed = w.flickSpeed * (u.speedBase + (Math.random() * 2 - 1) * u.speedRandom) / u.mainSpeedBase * speedRate;
  // Width is a full-width local span in this provisional mapping. A future
  // main-unit width calibration can supply flickSpawnWidth without changing
  // the sourced 0.4 / 0.8 ratio. No exact S3 position/PDF claim is made.
  const lateral = (Math.random() - .5) * (w.flickSpawnWidth ?? u.mainWidthReference) * u.widthRatio;
  const pitch = Math.max(-.2, Math.min(.5, a.aimPitch)) + (w.ballistics ? w.ballistics.horizontalPitchDegrees * DEG : .32);
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), cp = Math.cos(pitch);
  const p = system._new();
  Object.assign(p, { type: 'drop', owner: a, team: a.team, age: 0, life: 1.4, straight: w.ballistics?.horizontalStraightTime ?? 0,
    radius: 1, damage: w.flickDamageNear, dmgFar: w.flickDamageFar, size: .15, trail: 0, trailEvery: 1.8, trailRadius: .45,
    grav: w.flickGravity ?? 26, drag: w.flickDrag ?? .4, seed: Math.random(), vis: rollerFlickDrawRadius(w, false, Math.max(0, (w.flickDrops ?? 2) - 1), 0, .185, depleted), tail0: .4, tailK: 1, wob: .1, wobF: 19, nose: 0, sats: 2,
    s3FlickUnit: 1, s3DepletionRound: depleted, fidelityMode: 'horizontal', fidelityYaw: angle - a.yaw, fidelitySectorYaw: a.yaw });
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
  const area = G.paint.splat(center, shape.paintWidthHalf, a.team, { seed: p.seed, claimOwner: a });
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
    r.s3DualiesInterruptSub = 0; r.s3DualiesInterruptSquid = 0; r.s3DualiesInterruptCancelMain = false;
    r.s3DualiesSubBuffered = false; r.s3DualiesSubReleaseBuffered = false;
  };
  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const out = reset.apply(this, args);
    clear(this); clearDualiesLocks(this); this.s3DualiesEmerging = false; this.s3ChargerPostShot = 0; this.s3DualiesSwimStart = null;
    // Keep the reusable gate, but do not retain the previous life/input source.
    if (this.s3SubGateInput) {
      const gate = this.s3SubGateInput.state;
      gate.source = EMPTY_SUB_GATE_INPUT; gate.sub = false; gate.subReleased = false;
      gate.cancelMain = false; gate.kind = ''; gate.dt = 0;
    }
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
    const kind = this.a.weapon.kind;
    if (kind !== 'dualies' && kind !== 'slosher') return weaponUpdate.call(this, dt, input);
    const source = input || EMPTY_SUB_GATE_INPUT;
    const lockedAtStart = subGateLocked(this, kind, dt);
    if (lockedAtStart) {
      if (source.sub) this.s3DualiesSubBuffered = true;
      if (source.subReleased) this.s3DualiesSubReleaseBuffered = true;
    }
    // #819: no input gating or buffered edges on steady-state Dualies ticks.
    // Keep the original input identity and skip the wrapper's dispatch.
    if (kind === 'dualies' && input && !lockedAtStart &&
        !this.s3DualiesSubBuffered && !this.s3DualiesSubReleaseBuffered &&
        !source.sub && !source.subReleased) {
      return weaponUpdate.call(this, dt, input);
    }
    let sub = lockedAtStart ? false : source.sub;
    let subReleased = lockedAtStart ? false : source.subReleased;
    if (!lockedAtStart && (this.s3DualiesSubReleaseBuffered ||
        (kind === 'dualies' && this.s3DualiesSubBuffered && source.subReleased))) {
      sub = true; subReleased = true;
      this.s3DualiesSubBuffered = false; this.s3DualiesSubReleaseBuffered = false;
    }
    // The native runner checks sub both before and after weapon processing;
    // post-shot lock may become active between those reads. Retain the dynamic
    // gate but allocate its Proxy only once per runner, not on every fixed tick.
    let gate = this.s3SubGateInput;
    if (!gate) gate = this.s3SubGateInput = makeSubGateInput(this);
    const state = gate.state;
    state.source = source; state.kind = kind; state.dt = dt;
    state.sub = sub; state.subReleased = subReleased;
    state.cancelMain = kind === 'dualies' && !!this.s3DualiesInterruptCancelMain;
    const out = weaponUpdate.call(this, dt, gate.view);
    if (subGateLocked(this, kind, dt)) {
      if (sub) this.s3DualiesSubBuffered = true;
      if (subReleased) this.s3DualiesSubReleaseBuffered = true;
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
        p: { owner: p.owner, team: p.team, ghost: !!p.ghost, wid: p.wid, seed: p.seed,
          s3Weapon: p.s3Weapon ?? null, s3TerrainBurst: true,
          // PR1188: keep the struck surface orientation for the falling burst drop.
          s3BurstCollisionHit: p.s3BurstCollisionHit?.normal ? { normal: p.s3BurstCollisionHit.normal.clone() } : null },
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
