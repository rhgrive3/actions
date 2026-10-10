import { specialMotionAllowsAction } from './action-admission.mjs';
import { ROLLER_DRUM } from './roller-model.mjs';
import { hasFullCancelGroundAttack, takeFullCancelGroundAttack } from './movement.mjs';
import { rollerBubblerCandidate, applyRollerBubblerHit } from './kit-big-bubbler.mjs';
// Roller-specific refinements. Timing comes from the existing gameplay profile;
// joint curves are visual calibration against Nintendo's public roller videos.
const EPS = 1e-10;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const READY_ANCHOR = [-.08, .80, .28];
const READY_ROTATION = [-2.5, .04, 1.0];
const ROLL_ANCHOR = [-.07, .75, .34];
const ROLL_ROTATION = [.36, .06, 0];
const ROLL_LEAN = [.14, .06, .12, .05];
const DRUM_LIFT = .1015 * (ROLLER_DRUM.radius - 1);
// Vertical swing handle pitch: coil overhead, release level, follow-through.
// local-quality's release-velocity repair reads the same angles.
export const VERTICAL_SWING = Object.freeze({ coil: -2.45, release: -.04, follow: .6 });
// Read-only view for regressions; the arrays stay owned by this module.
export const ROLLER_POSE = Object.freeze({ READY_ANCHOR, READY_ROTATION, ROLL_ANCHOR, ROLL_ROTATION, ROLL_LEAN });

// Issue #635: gates after flick release, independent of roll-stop locks.
const POST_SUB = { horizontal: 14 / 60, vertical: 18 / 60 };
const POST_SQUID = { horizontal: 15 / 60, vertical: 19 / 60 };

// Issue #541: an established roll must persist as a S3 dry roll when the
// tank depletes while ZR stays held. Separate Roller-down state from the
// ink-gated paint/contact path. No new dry movement/audio numerics are
// invented: reuse existing rolling speed/pose and keep dry audio muted.
const DRY_INK = 0.5;

function observedLife(actor) {
  if (Number.isSafeInteger(actor?.netLife)) return actor.netLife;
  if (Number.isSafeInteger(actor?.net?.lastLife)) return actor.net.lastLife;
  return null;
}

function resolveRollHitEpochs(runner) {
  const epochs = runner.s3RollHitEpochs;
  if (!epochs?.size) return;
  for (const [victim, epoch] of epochs) {
    const life = observedLife(victim);
    if (!victim.alive || !victim.remote || victim.owner !== epoch.owner || life !== epoch.life) {
      if (runner.s3PendingRollHits.has(victim)) runner.s3RollHitConfirmDisabled.add(victim);
      runner.s3PendingRollHits.delete(victim);
      epochs.delete(victim);
      runner.rollHits.delete(victim);
    }
  }
}

// Recovered #527 admission contract: retain native buffering and current profile timing.
export function rollerEmergeDelay(actor, fallback) {
  return actor.weapon.kind === 'roller' ? actor.weapon.squidFlickDelay ?? fallback : fallback;
}
export function rollerFireBuffer(actor, fallback, dt) {
  if (actor.weapon.kind !== 'roller') return fallback;
  const delay = rollerEmergeDelay(actor, fallback);
  const remaining = actor.form === 'squid' ? delay : Math.max(0, delay - actor.kidT);
  return Math.max(fallback, remaining + dt);
}

export function rollerMode(w, vertical) {
  return vertical ? { ...w, flickWindup: w.verticalWindup, flickInterval: w.verticalInterval ?? w.flickInterval, flickInk: w.verticalInk } : w;
}

// 847: the Splat Roller body dimensions in the pinned 11.3.0 parameter table
// (Radius 0.4, WidthHalf 1.4). Retain the runner's existing 0.75 forward
// offset; do not substitute paint width, damage reach, or the tuned render mesh.
const DRUM_FORWARD = 0.75, ROLLER_BODY_RADIUS = 0.4, ROLLER_BODY_HALF_WIDTH = 1.4;
const STICK_EPS = 0.01; // same deadzone as Actor._horizontal steering (mh > 0.01)
const CONTACT_EPS = 1e-6;
const WALL_BAND = 0.6; // same surface classification used by Physics.collideBody

export function rollerStickActive(a) {
  // Remote proxies carry no authoritative stick state; the owner admits the hit
  // and replicates it, so remotes never suppress here (no new wire fields).
  if (a.remote) return true;
  const mv = a.intent?.move;
  return !!mv && Math.hypot(mv.x, mv.z) > STICK_EPS;
}

// #1122: authoritative lowered-drum contact. The 0.75 forward offset and
// 0.4/1.4 drum dimensions are existing/pinned values above; vertical aim rotates
// that offset in 3D instead of inventing an angle→height tuning coefficient.
function segmentDistanceSq(p1, q1, p2, q2) {
  const ux=q1.x-p1.x, uy=q1.y-p1.y, uz=q1.z-p1.z;
  const vx=q2.x-p2.x, vy=q2.y-p2.y, vz=q2.z-p2.z;
  const wx=p1.x-p2.x, wy=p1.y-p2.y, wz=p1.z-p2.z;
  const a=ux*ux+uy*uy+uz*uz, b=ux*vx+uy*vy+uz*vz, cc=vx*vx+vy*vy+vz*vz;
  const d=ux*wx+uy*wy+uz*wz, e=vx*wx+vy*wy+vz*wz, D=a*cc-b*b;
  let sN, sD=D, tN, tD=D;
  if (D < 1e-12) { sN=0; sD=1; tN=e; tD=cc; }
  else {
    sN=b*e-cc*d; tN=a*e-b*d;
    if (sN<0) { sN=0; tN=e; tD=cc; }
    else if (sN>sD) { sN=sD; tN=e+b; tD=cc; }
  }
  if (tN<0) {
    tN=0;
    if (-d<0) sN=0; else if (-d>a) sN=sD; else { sN=-d; sD=a; }
  } else if (tN>tD) {
    tN=tD;
    if (-d+b<0) sN=0; else if (-d+b>a) sN=sD; else { sN=-d+b; sD=a; }
  }
  const sc=Math.abs(sN)<1e-12?0:sN/sD, tc=Math.abs(tN)<1e-12?0:tN/tD;
  const dx=wx+sc*ux-tc*vx, dy=wy+sc*uy-tc*vy, dz=wz+sc*uz-tc*vz;
  return dx*dx+dy*dy+dz*dz;
}

export function rollerContactCandidate(actor, target, weapon, player) {
  if (!actor?.pos || !target?.pos || !player) return false;
  const yaw=Number.isFinite(actor.yaw)?actor.yaw:0;
  const pitch=Number.isFinite(actor.aimPitch)?actor.aimPitch:0;
  const fx=Math.sin(yaw), fz=Math.cos(yaw), rx=fz, rz=-fx;
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  const cx=actor.pos.x+fx*DRUM_FORWARD*cp;
  const cy=actor.pos.y+ROLLER_BODY_RADIUS+sp*DRUM_FORWARD;
  const cz=actor.pos.z+fz*DRUM_FORWARD*cp;
  // WidthHalf is the sourced physical drum half-width; weapon.rollWidth is
  // paint/gameplay reach and must not reshape the body-contact volume.
  const half=ROLLER_BODY_HALF_WIDTH;
  const d0={x:cx-rx*half,y:cy,z:cz-rz*half}, d1={x:cx+rx*half,y:cy,z:cz+rz*half};
  const tr=Number.isFinite(player.radius)?player.radius:0.35;
  const h=target.form==='squid' ? player.squidHeight : player.height;
  const low=target.pos.y+Math.min(tr,h/2), high=target.pos.y+Math.max(Math.min(tr,h/2),h-tr);
  const t0={x:target.pos.x,y:low,z:target.pos.z}, t1={x:target.pos.x,y:high,z:target.pos.z};
  const rr=ROLLER_BODY_RADIUS+tr;
  return segmentDistanceSq(d0,d1,t0,t1) <= rr*rr+CONTACT_EPS;
}

function rollerCapsuleTouchesBlock(start, delta, block, scratch) {
  const axes = block.axes, center = block.center, half = block.half;
  const p0x = (start.x - center.x) * axes[0].x + (start.y - center.y) * axes[0].y + (start.z - center.z) * axes[0].z;
  const p0y = (start.x - center.x) * axes[1].x + (start.y - center.y) * axes[1].y + (start.z - center.z) * axes[1].z;
  const p0z = (start.x - center.x) * axes[2].x + (start.y - center.y) * axes[2].y + (start.z - center.z) * axes[2].z;
  const dx = delta.x * axes[0].x + delta.y * axes[0].y + delta.z * axes[0].z;
  const dy = delta.x * axes[1].x + delta.y * axes[1].y + delta.z * axes[1].z;
  const dz = delta.x * axes[2].x + delta.y * axes[2].y + delta.z * axes[2].z;
  const hx = half.x, hy = half.y, hz = half.z;
  const derivative = t => {
    const x = p0x + dx * t, y = p0y + dy * t, z = p0z + dz * t;
    let d = 0;
    if (x < -hx) d += (x + hx) * dx; else if (x > hx) d += (x - hx) * dx;
    if (y < -hy) d += (y + hy) * dy; else if (y > hy) d += (y - hy) * dy;
    if (z < -hz) d += (z + hz) * dz; else if (z > hz) d += (z - hz) * dz;
    return d;
  };
  const d0 = derivative(0), d1 = derivative(1);
  let t = d0 >= 0 ? 0 : d1 <= 0 ? 1 : 0.5;
  if (d0 < 0 && d1 > 0) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) * 0.5;
      if (derivative(t) < 0) lo = t; else hi = t;
    }
    t = (lo + hi) * 0.5;
  }
  const x = p0x + dx * t, y = p0y + dy * t, z = p0z + dz * t;
  let nx = x - Math.max(-hx, Math.min(hx, x));
  let ny = y - Math.max(-hy, Math.min(hy, y));
  let nz = z - Math.max(-hz, Math.min(hz, z));
  const d2 = nx * nx + ny * ny + nz * nz;
  if (d2 > ROLLER_BODY_RADIUS * ROLLER_BODY_RADIUS + CONTACT_EPS) return false;
  if (d2 > CONTACT_EPS) {
    const inv = 1 / Math.sqrt(d2); nx *= inv; ny *= inv; nz *= inv;
  } else {
    const px = hx - Math.abs(x), py = hy - Math.abs(y), pz = hz - Math.abs(z);
    if (px <= py && px <= pz) { nx = x < 0 ? -1 : 1; ny = nz = 0; }
    else if (py <= pz) { ny = y < 0 ? -1 : 1; nx = nz = 0; }
    else { nz = z < 0 ? -1 : 1; nx = ny = 0; }
  }
  scratch.normalY = nx * axes[0].y + ny * axes[1].y + nz * axes[2].y;
  // Closest actual contact point on this oriented solid, not the player's feet.
  const qx = Math.max(-hx, Math.min(hx, x)), qy = Math.max(-hy, Math.min(hy, y)), qz = Math.max(-hz, Math.min(hz, z));
  scratch.contactPoint.x = center.x + qx * axes[0].x + qy * axes[1].x + qz * axes[2].x;
  scratch.contactPoint.y = center.y + qx * axes[0].y + qy * axes[1].y + qz * axes[2].y;
  scratch.contactPoint.z = center.z + qx * axes[0].z + qy * axes[1].z + qz * axes[2].z;
  return true;
}

export function rollerDrumSupport(a, G, scratch) {
  const level = G?.physics?.level;
  if (!level?.blocks || typeof level.queryBlocks !== 'function')
    return { floor: a.grounded, wall: false, supported: a.grounded };
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), rx = fz, rz = -fx;
  const cx = a.pos.x + fx * DRUM_FORWARD, cy = a.pos.y + ROLLER_BODY_RADIUS, cz = a.pos.z + fz * DRUM_FORWARD;
  const half = ROLLER_BODY_HALF_WIDTH;
  const start = scratch.start, delta = scratch.delta;
  start.x = cx - rx * half; start.y = cy; start.z = cz - rz * half;
  delta.x = rx * half * 2; delta.y = 0; delta.z = rz * half * 2;
  const endX = start.x + delta.x, endZ = start.z + delta.z, radius = ROLLER_BODY_RADIUS;
  const ids = level.queryBlocks(Math.min(start.x, endX) - radius, Math.min(start.z, endZ) - radius,
    Math.max(start.x, endX) + radius, Math.max(start.z, endZ) + radius, scratch.ids);
  let floor = false, wall = false;
  for (let i = 0; i < ids.length; i++) {
    const block = level.blocks[ids[i]];
    if (!block.solid || cy + radius < block.aabbMin.y || cy - radius > block.aabbMax.y) continue;
    if (!rollerCapsuleTouchesBlock(start, delta, block, scratch)) continue;
    const ny = scratch.normalY;
    if (ny >= WALL_BAND) floor = true;
    else if (Math.abs(ny) < WALL_BAND) {
      wall = true;
      scratch.wallPoint.x = scratch.contactPoint.x;
      scratch.wallPoint.y = scratch.contactPoint.y;
      scratch.wallPoint.z = scratch.contactPoint.z;
    }
    if (floor && wall) break;
  }
  return { floor, wall, supported: floor || wall };
}

// Action-interruption windows that start when an authoritative roll ENDS.
export const ROLL_STOP_LOCKS = Object.freeze({ main: 16 / 60, sub: 5 / 60, squid: 6 / 60 });
export function rollStopBlocks(now, locks) {
  if (!locks) return { main: false, sub: false, squid: false };
  return { main: now < locks.main - EPS, sub: now < locks.sub - EPS, squid: now < locks.squid - EPS };
}
export function rollStopLocks(now) {
  return { main: now + ROLL_STOP_LOCKS.main, sub: now + ROLL_STOP_LOCKS.sub, squid: now + ROLL_STOP_LOCKS.squid };
}

// Stationary drum-to-wall contact is paint-eligible without stick input. It
// must never open the native contact-damage gate, which still requires speed.
export function stationaryRollerWallPaintEligible({ firing, wall, stick, alive, ink, cooldown }) {
  return !!firing && !!wall && !stick && !!alive && ink > 0.5 && cooldown <= 0.25;
}
export function installRollerLogic({ WeaponRunner, Actor, G, on, THREE, Hit }, _profile) {
  const roller = WeaponRunner.prototype._roller, reset = WeaponRunner.prototype.reset, actorUpdate = Actor.prototype.update;
  const runnerUpdate = WeaponRunner.prototype.update;
  const scratch = { ids: [], start: { x: 0, y: 0, z: 0 }, delta: { x: 0, y: 0, z: 0 }, normalY: 0, contactPoint: { x: 0, y: 0, z: 0 }, wallPoint: { x: 0, y: 0, z: 0 } };
  const wallOrigin = new THREE.Vector3(), wallDirection = new THREE.Vector3(), wallContact = new THREE.Vector3(), wallHit = new Hit();
  const paintStillWall = (runner, a, w, dt) => {
    // #1108: direct drum-wall paint is contact-owned (held with or without stick),
    // not a movement/side splash. No-stick must not authorize native roll-contact
    // damage or floor paint.
    if (a.remote || !a.alive || !(a.ink > 0.5) || !(dt > 0) || !G.paint?.splat || !G.physics?.raycast) return;
    runner.s3WallPaintElapsed = Math.min(0.3, (runner.s3WallPaintElapsed || 0) + dt);
    if (runner.s3WallPaintElapsed + 1e-10 < 1 / 12) return;
    runner.s3WallPaintElapsed %= 1 / 12;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), rx = fz, rz = -fx;
    wallDirection.set(fx, 0, fz);
    let area = 0;
    for (let i = -1; i <= 1; i++) {
      const side = i * ROLLER_BODY_HALF_WIDTH * .7;
      wallOrigin.set(a.pos.x + rx * side, a.pos.y + ROLLER_BODY_RADIUS, a.pos.z + rz * side);
      const h = G.physics.raycast(wallOrigin, wallDirection, DRUM_FORWARD + ROLLER_BODY_RADIUS + .05, wallHit, true);
      if (!h?.hit || Math.abs(h.normal.y) >= WALL_BAND) continue;
      wallContact.copy(h.point).addScaledVector(h.normal, .025);
      const painted = G.paint.splat(wallContact, ROLLER_BODY_RADIUS, a.team,
        { kind: 'roll', seed: ((Math.imul((Math.round(G.time * 60) || 0) + i + 7, 2654435761) >>> 0) / 4294967296), claimOwner: a });
      if (Number.isFinite(painted)) area += painted;
    }
    if (area) a.addTurf(area);
  };
  // #305 depletion admission is enabled only when the pinned profile maps its
  // explicit payment share and reduced per-mode projectile counts.
  const depletionSource = _profile?.weapons?.roller ?? null;
  const DEPLETION_INK_RATE = Number(depletionSource?.depletionInkRate);
  const DEPLETION_ENABLED = Number.isFinite(DEPLETION_INK_RATE) && DEPLETION_INK_RATE > 0 && DEPLETION_INK_RATE <= 1;
  const depletionDrops = vertical => {
    const value = vertical ? depletionSource?.verticalDepletionDrops : depletionSource?.flickDepletionDrops;
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  Actor.prototype.update = function (dt) {
    const r = this.weaponRunner;
    if (r && this.weapon?.kind === 'roller') {
      const prev = this._prevIntent || {};
      if (this.intent?.fire && !prev.fire) r.s3RollerSquidPressT = this.form === 'squid' ? G.time : null;
      if (!this.alive || this.specialActive || this.superJumpState) r.s3RollerSquidPressT = null;
    }
    return actorUpdate.call(this, dt);
  };

  const armsInterruption = runner => {
    const a = runner.a;
    return a.grounded && a.ink > 0.5 && runner.flick < 0;
  };
  const rollWillStop = (runner, fire) => {
    const a = runner.a;
    return runner.rolling === true && !fire && armsInterruption(runner);
  };
  const armAheadOf = (runner, now, fire) => {
    const live = rollStopBlocks(now, runner.s3RollStop);
    if ((live.main || live.sub || live.squid) || !rollWillStop(runner, fire)) return false;
    runner.s3RollStop = rollStopLocks(now);
    return true;
  };
  const disarmIf = (runner, armed) => {
    if (armed && (runner.rolling === true || !armsInterruption(runner))) runner.s3RollStop = null;
  };
  WeaponRunner.prototype.update = function (dt, inp = {}) {
    const now = G.time;
    const armed = armAheadOf(this, now, !!inp.fire);
    const locks = this.s3RollStop;
    let input = inp;
    if (this.s3FlickPostSub > 0 && (input.sub || input.subReleased)) input = { ...input, sub: false, subReleased: false };
    if (locks && this.a.weapon?.kind === 'roller') {
      const blocked = rollStopBlocks(now, locks);
      if (blocked.main || blocked.sub) {
        input = { ...input };
        if (blocked.main && !armed) { input.fire = false; input.firePressed = false; }
        if (blocked.sub) { input.sub = false; input.subReleased = false; }
      }
    }
    const wasRolling = this.rolling === true;
    const result = runnerUpdate.call(this, dt, input);
    disarmIf(this, armed);
    if (wasRolling && this.rolling !== true && armsInterruption(this)) this.s3RollStop = rollStopLocks(now);
    return result;
  };

  const rollStopActorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...rest) {
    const runner = this.weaponRunner;
    if (!runner) return rollStopActorUpdate.call(this, dt, ...rest);
    const now = G.time;
    // Capture the native B edge before Actor.update overwrites _prevIntent and
    // consumes jumpBuffer. _roller runs later in this same authoritative tick.
    runner.s3RollerJumpPressed = this.weapon?.kind === 'roller' && !!this.intent?.jump && !this._prevIntent?.jump;
    const armed = armAheadOf(runner, now, !!(this.intent?.fire || this.fireBuffer > 0));
    const blockSquid = rollStopBlocks(now, runner.s3RollStop).squid;
    if (blockSquid && this.intent?.squid) {
      const held = this.intent.squid;
      this.intent.squid = false;
      try { return rollStopActorUpdate.call(this, dt, ...rest); }
      finally { this.intent.squid = held; runner.s3RollerJumpPressed = false; disarmIf(runner, armed); }
    }
    try { return rollStopActorUpdate.call(this, dt, ...rest); }
    finally { runner.s3RollerJumpPressed = false; disarmIf(runner, armed); }
  };

  const resolveRemoteContact = (event, accepted) => {
    const attacker = event?.attacker, victim = event?.victim;
    const runner = attacker?.weaponRunner;
    const pending = runner?.a === attacker && runner.s3PendingRollHits?.get(victim);
    if (!pending || runner.s3RollHitConfirmDisabled.has(victim) || !victim?.remote
      || pending.owner !== victim.owner || pending.life !== observedLife(victim)) return;
    const exactWeapon = event.weaponId === pending.weaponId;
    const exactContact = exactWeapon && event.damage === pending.damage;
    if (accepted ? (!exactWeapon || (!event.killed && !exactContact)) : !exactContact) return;
    runner.s3PendingRollHits.delete(victim);
    if (accepted) runner.rollHits.set(victim, G.time);
    else runner.rollHits.delete(victim);
  };
  // Existing events have no hit-request ID. One outstanding request can be
  // correlated; when native contact cadence sends another packet, retire ACK
  // matching for this victim so a late earlier event cannot settle the newer hit.
  on?.('hit', event => resolveRemoteContact(event, true));
  on?.('hit:rejected', event => resolveRemoteContact(event, false));
  const cancelInput = WeaponRunner.prototype.cancelPendingInput;
  WeaponRunner.prototype.cancelPendingInput = function (...args) {
    if (this.a?.weapon?.kind === 'roller' && this.flick >= 0) {
      this.flick = -1; this.s3RollerAttack = null; this.s3RollerSquidPressT = null;
      this.a.character?._s3CancelRollerFlick?.();
    }
    return cancelInput?.apply(this, args);
  };
  WeaponRunner.prototype.reset = function (...args) {
    const uncorrelated = this.s3RollHitConfirmDisabled || new WeakSet();
    for (const victim of this.s3PendingRollHits?.keys() || []) uncorrelated.add(victim);
    const result = reset.apply(this, args);
    this.s3RollerAttack = null;
    this.s3RollerSquidPressT = null;
    this.s3RollerJumpPressed = false;

    this.s3RollerDepletion = null;
    this.s3PendingRollHits = new Map();
    this.s3RollHitEpochs = new Map();
    this.s3RollHitConfirmDisabled = uncorrelated;
    this.s3RollStop = null;
    this.s3RollerWasDry = false; this.s3RollerPrevInk = null;
    this.s3FlickPostSub = 0; this.s3FlickPostSquid = 0;
    if (this.a.character) {
      this.a.character.s3RollerFlick = null;
      this.a.character._s3CancelRollerFlick?.();
    }
    return result;
  };
  WeaponRunner.prototype._roller = function (dt, inp, w) {
    const a = this.a;
    // Flick windup/release is an airborne-valid attack and never gated here.
    // 847 conditions only the rolling path below (feet-grounded admission and
    // the contact-speed check), scoped to the public call (try/finally
    // restore): movement already integrated, anim reads the restored state,
    // and roll speed/ink/damage/group/packet law is untouched.
    resolveRollHitEpochs(this);
    // Issue #541: snapshot the hold before native `_roller` can tear it down
    // on the depletion tick. Restoration runs after the native call below and
    // only continues an already-Roller-down roll (never a cold start).
    // `prevInk` is read before the native spend so a paid roll holds its own
    // tick even when the stripe lands exactly on the threshold.
    const prevInk = a.ink;
    const prevRollT = this.rollT;
    // `s3RollerPrevInk` carries the paid-roll history across ticks; `prevInk`
    // covers the natural depletion tick where the native spend crosses the
    // threshold inside this same call. Both reject a cold start at zero ink
    // (prev null on first tick, 0 after a zero-ink tick completes).
    const hadPaidInk = this.s3RollerWasDry === true || prevInk > DRY_INK ||
      (this.s3RollerPrevInk ?? -Infinity) > DRY_INK;
    const dryHold = inp.fire === true && this.rolling === true && this.flick < 0 &&
      this.cooldown <= 0.25 && a.grounded === true && a.ink <= DRY_INK && hadPaidInk;
    if (this.s3FlickPostSub > 0) {
      this.s3FlickPostSub -= dt;
      if (this.s3FlickPostSub < EPS) this.s3FlickPostSub = 0;
    }
    if (this.s3FlickPostSquid > 0) {
      this.s3FlickPostSquid -= dt;
      if (this.s3FlickPostSquid < EPS) this.s3FlickPostSquid = 0;
    }
    // #305: any positive tank below the full swing cost runs a depletion swing.
    // A truly empty tank still rejects, and the paid amount is the satisfied
    // depletion cost (swing InkConsume * DepletionRate) capped by the tank.
    const fullCancelGroundAttack = hasFullCancelGroundAttack(a);
    const flickCost = fullCancelGroundAttack ? w.flickInk : !a.grounded ? w.verticalInk : w.flickInk;
    const depleted = DEPLETION_ENABLED && this.flick < 0 && inp.firePressed && this.cooldown <= EPS &&
      a.ink > EPS && a.ink + EPS < flickCost;
    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS &&
      (a.ink + EPS >= flickCost || depleted);
    const winding = this.flick >= 0;
    const onFlickPath = starting || winding;
    const sup = onFlickPath ? null : rollerDrumSupport(a, G, scratch);
    const stick = onFlickPath || rollerStickActive(a);
    // #1108: the drum body touching a paintable wall paints that wall while ZR is
    // held, with or without Left Stick (S3 contact paint). Stick only decides the
    // native stripe and roll-contact damage admission, so `stillWall` stays no-stick.
    const drumWallTouch = !!(inp.fire && !onFlickPath && sup?.wall && !a.remote);
    const stillWall = drumWallTouch && !stick;
    const fireIn = (onFlickPath || (sup?.supported && stick) || stillWall) ? inp : { ...inp, fire: false, firePressed: false };
    const restoreAirborne = !!(sup?.wall && !sup.floor && !a.grounded);
    // Native contact damage reads horizontal speed; prevent no-stick damage
    // without mutating authoritative actor movement outside the native call.
    const savedVelX = a.vel.x, savedVelZ = a.vel.z;
    if (stillWall) { a.vel.x = 0; a.vel.z = 0; }
    if (restoreAirborne) a.grounded = true;
    try {

    if (starting) {
      this.cooldown = Math.min(0, this.cooldown);
      const groundedCancel = takeFullCancelGroundAttack(a);
      this.s3FlickVertical = !groundedCancel && !a.grounded;
      // The public admission gate reads this to pay the short swing once, with
      // the real ink rest subtracted from the actual tank (no injected ink).
      this.s3RollerDepletion = depleted ? { inkCost: Math.min(a.ink, flickCost * DEPLETION_INK_RATE) } : null;
      const mode = rollerMode(w, this.s3FlickVertical);
      let windup = mode.flickWindup;
      if (!this.s3FlickVertical && Number.isFinite(this.s3RollerSquidPressT)) {
        const elapsed = Math.max(0, G.time - this.s3RollerSquidPressT);
        windup = Math.max(EPS, 34 / 60 - elapsed);
      }
      this.s3RollerAttack = {
        vertical: this.s3FlickVertical, windup, interval: mode.flickInterval,
        elapsed: 0, released: false, rolling: false, depleted,
        groundedStart: !this.s3FlickVertical && !!a.grounded && !groundedCancel,
        jumpConverted: false,
      };

      this.s3RollerSquidPressT = null;
      a.character.s3RollerFlick = this.s3RollerAttack;
      // Starting a new flick lifts the drum. The public runner otherwise leaves
      // rolling=true through its early windup return, including in the air.
      this.rolling = false; this.rollT = 0;
      this.rollLoop?.stop(.12); this.rollLoop = null;
    }
    const state = this.s3RollerAttack;
    // #1041: grounded ZR remains provisional for the first 3 fixed frames.
    // A real B/jump edge at +1/+2/+3F converts it once to vertical and uses
    // the measured one-frame-faster converted startup. +4F is too late.
    if (state && !state.released && !state.vertical && state.groundedStart && !state.jumpConverted &&
        this.s3RollerJumpPressed && !a.grounded && state.elapsed < 3 / 60 - EPS) {
      const verticalMode = rollerMode(w, true);
      const extraInk = Math.max(0, (verticalMode.flickInk || 0) - (w.flickInk || 0));
      if (a.ink + EPS >= extraInk) {
        if (extraInk > 0) a.ink = Math.max(0, a.ink - extraInk);
        state.vertical = true; state.jumpConverted = true;
        state.windup = Math.max(EPS, verticalMode.flickWindup - 1 / 60);
        state.interval = verticalMode.flickInterval;
        this.s3FlickVertical = true;
        if (a.character) a.character.s3RollerFlick = state;
      }
    }
    if (state && !starting) state.elapsed += dt;
    // #1056: if ZR was first pressed in the air, touching down in the first
    // five 60Hz frames turns that pending vertical flick into the faster
    // horizontal flick. #1041 grounded-start jump conversions stay separate.
    if (state && state.vertical && !state.groundedStart && !state.jumpConverted &&
        !state.released && a.grounded && state.elapsed > EPS &&
        state.elapsed <= 5 / 60 + EPS) {
      const horizontal = rollerMode(w, false);
      state.vertical = false; this.s3FlickVertical = false;
      state.windup = Math.max(EPS, horizontal.flickWindup - 1 / 60);
      state.interval = horizontal.flickInterval;
    }
    const vertical = state ? state.vertical : this.s3FlickVertical;
    let mode = rollerMode(w, vertical);
    if (state) mode = { ...mode, flickWindup: state.windup, flickInterval: state.interval };
    // The depletion volley keeps the swing's sourced count/speed/damage owners:
    // the public emitter reads flickDrops, the vertical wrapper reads the
    // sibling drops field, and configureFidelityFlick reads the per-unit
    // DepletionBulletNum/DepletionSpeedRate straight from the pinned raw units.
    if (state?.depleted) {
      const drops = depletionDrops(vertical);
      if (drops !== null) mode = { ...mode, s3Depletion: true, s3DepletionDrops: drops, flickDrops: drops };
    }

    // Float accumulation must not add a 22nd/27th tick to a 21F/26F windup.
    if (winding && this.flick + dt + EPS >= mode.flickWindup) this.flick = mode.flickWindup;
    let rollInp = fireIn;
    if (state && state.released) {
      const rollDelay = state.vertical ? (22 / 60) : (7 / 60);
      const postRelease = state.elapsed - state.windup;
      if (postRelease + EPS < rollDelay) rollInp = fireIn.fire ? { ...fireIn, fire: false } : fireIn;
    }
    const projectiles = G.projectiles, applyHit = projectiles?.applyHit;
    let result;
    // #1105: an idle tick cannot emit native Roller contact, so do not create
    // an admission closure or swap the shared applyHit method on that path.
    // Held fire is conservatively included: native may enter rolling THIS tick.
    if (typeof applyHit === 'function' && (this.rolling || state?.rolling || !!fireIn.fire)) {
      const runner = this;
      const admittedHit = function (attacker, victim, ...args) {
        const admission = applyHit.call(this, attacker, victim, ...args);
        if (attacker === a && args[1] === 'roller') {
          if (admission === 'rejected') {
            if (runner.s3PendingRollHits.has(victim)) runner.s3RollHitConfirmDisabled.add(victim);
            runner.s3PendingRollHits.delete(victim);
            // This is a local admission refusal, not an owner verdict. Keep
            // the native contact timestamp; hit:rejected below owns that reset.
          } else if (admission === 'rejected-invulnerable') {
            if (runner.s3PendingRollHits.has(victim)) runner.s3RollHitConfirmDisabled.add(victim);
            runner.s3PendingRollHits.delete(victim);
            runner.rollHits.delete(victim);
          } else if (admission === 'pending') {
            runner.s3RollHitEpochs.set(victim, { owner: victim.owner, life: observedLife(victim) });
            if (runner.s3RollHitConfirmDisabled.has(victim) || runner.s3PendingRollHits.has(victim)) {
              runner.s3PendingRollHits.delete(victim);
              runner.s3RollHitConfirmDisabled.add(victim);
            } else {
              runner.s3PendingRollHits.set(victim, {
                owner: victim.owner, life: observedLife(victim), damage: args[0], weaponId: args[1],
              });
            }
          }
        }
        return admission;
      };
      projectiles.applyHit = admittedHit;
      try { result = roller.call(this, dt, rollInp, mode); }
      finally { if (projectiles.applyHit === admittedHit) projectiles.applyHit = applyHit; }
    } else result = roller.call(this, dt, rollInp, mode);
    // #1036: the Bubbler shell is permeable. Only base/emitter hardware enters
    // the same 24F source-backed Roller body-contact cadence (#839).
    const rollSpeed = Math.hypot(a.vel.x, a.vel.z);
    if (this.rolling && rollSpeed > 1.0) {
      const bubbler = rollerBubblerCandidate(a, Math.sin(a.yaw), Math.cos(a.yaw), w.rollWidth);
      if (bubbler && G.time - (this.rollHits.get(bubbler.dome) ?? -9) + 1e-10 >= (w.rollContactInterval ?? (24 / 60))) {
        this.rollHits.set(bubbler.dome, G.time);
        applyRollerBubblerHit(bubbler, a, w.rollDamage);
      }
    }

    // Issue #541: keep the established Roller-down state on the depletion
    // tick (and every dry hold tick after it) instead of tearing it down.
    // Paint, contact damage, and further ink spend are all native-gated on
    // the zeroed tank, so this restores state only — no dry turf, no dry
    // hits, no new movement/audio numerics. `rollT` keeps accumulating so
    // dash timing stays continuous; both movement and ink-charge positions
    // are re-anchored so refill cannot bill dry travel. The charged-distance
    // counter starts a fresh paint interval with `lastRollPos`.
    if (dryHold && this.rolling !== true && this.flick < 0) {
      this.rolling = true;
      // Continue from the entry value: native zeroes rollT on the dry tick,
      // so re-adding one dt alone would pin it. Dash timing stays continuous
      // with the paid roll; dry speed itself is unconfirmed (report).
      this.rollT = prevRollT + dt;
      if (this.lastRollPos && a.pos?.copy) this.lastRollPos.copy(a.pos);
      else if (a.pos?.clone) this.lastRollPos = a.pos.clone();
      if (this.lastRollInkPos && a.pos?.copy) this.lastRollInkPos.copy(a.pos);
      else if (a.pos?.clone) this.lastRollInkPos = a.pos.clone();
      this.rollInkChargedDistance = 0;
      // Dry audio stays as the native teardown leaves it (loop stopped).
      // S3's dry-roll clunk is unmodelled: no invented audio numeric.
      this.s3RollerWasDry = true;
    } else if (this.rolling === true && a.ink > DRY_INK) {
      this.s3RollerWasDry = false;
    }
    this.s3RollerPrevInk = Math.max(prevInk, a.ink);
    if (state) state.rolling = this.rolling;
    if (state && winding && this.flick < 0) {
      state.elapsed = mode.flickWindup;
      state.released = true;
      // InkRecoverStop belongs to this actual release, not the paid windup.
      if (!a.remote) {
        a.lastFire = 0;
        a.s3 ||= {};
        const delay = state.vertical ? w.verticalInkRecoverStop ?? w.inkRecoverStop : w.inkRecoverStop;
        a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining || 0, delay || 0);
      }
      const edge = this.s3FlickVertical ? 'vertical' : 'horizontal';
      this.s3FlickPostSub = Math.max(0, POST_SUB[edge] - dt);
      this.s3FlickPostSquid = Math.max(0, POST_SQUID[edge] - dt);
    }
    if (state && state.released) {
      const rollDelay = state.vertical ? (22 / 60) : (7 / 60);
      const postRelease = state.elapsed - state.windup;
      if (state.rolling) {
        if (a.character ? (a.character.wRoll >= 0.95 || postRelease >= rollDelay + 0.25) : postRelease >= rollDelay + 0.1) {
          this.s3RollerAttack = null;
          if (a.character) a.character.s3RollerFlick = null;
        }
      } else if (!inp.fire && state.elapsed + EPS >= state.interval) {
        this.s3RollerAttack = null;
        if (a.character) a.character.s3RollerFlick = null;
      } else if (state.elapsed + EPS >= Math.max(state.interval, state.windup + rollDelay) && !a.grounded) {
        this.s3RollerAttack = null;
        if (a.character) a.character.s3RollerFlick = null;
      }
    }
    if (drumWallTouch && this.rolling) paintStillWall(this, a, w, dt);
    else this.s3WallPaintElapsed = 0;
    return result;
    } finally {
      if (stillWall) { a.vel.x = savedVelX; a.vel.z = savedVelZ; }
      if (restoreAirborne && a.grounded) a.grounded = false;
    }
  };
}

// The X axis across the drum turns upright around the handle (local +Z).
// This is a pose target for the existing two-arm IK, not a second bone rig.
export function verticalRollerPose(elapsed, windup, interval) {
  const coil = ease(elapsed / (windup * .68));
  const whip = ease((elapsed - windup * .76) / (windup * .24));
  const follow = ease((elapsed - windup) / .12);
  const recover = ease((elapsed - windup - .12) / Math.max(.01, interval - windup - .12));
  const weight = ease(elapsed / (2 / 60)) * (1 - recover);
  const anchor = [mix(READY_ANCHOR[0], .015, coil), mix(READY_ANCHOR[1], 1.11, coil), mix(READY_ANCHOR[2], .025, coil)];
  const rotation = [mix(READY_ROTATION[0], VERTICAL_SWING.coil, coil), mix(READY_ROTATION[1], .015, coil), mix(READY_ROTATION[2], Math.PI / 2, coil)];
  // Keep the upright drum clear of the floor through its follow-through. A
  // horizontal carry-height target clips the lower cap while the axis is tilted.
  const release = [-.025, 1.05, .23], end = [-.025, 1.12, .28];
  for (let i = 0; i < 3; i++) anchor[i] = mix(mix(anchor[i], release[i], whip), end[i], follow);
  rotation[0] = mix(mix(rotation[0], VERTICAL_SWING.release, whip), VERTICAL_SWING.follow, follow);
  rotation[1] = mix(rotation[1], 0, whip);
  // The drum lands across the front: an upright drum as wide as the Inkling is
  // tall would drive its lower end into the floor at the bottom of the slam.
  rotation[2] = mix(rotation[2], ROLL_ROTATION[2], follow);
  return { anchor, rotation, weight, coil: coil * (1 - whip), whip: whip * (1 - recover) };
}

export function installRollerMotion({ Character, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !T) throw new Error('Roller motion requires exact upstream Character channels and timers');
  const flick = Character.prototype._poseFlick, animate = Character.prototype._animWeapon, setWeapon = Character.prototype.setWeapon;
  const updateStates = Character.prototype._updateStates, weaponPose = Character.prototype._poseWeapon;
  // The native torso/foot solver moves the admitted contact anchor with its
  // gait spring. Ground-align the right-hand
  // target BEFORE the native arm IK; its left-hand solver then follows the same
  // unchanged grips. The support cylinder is derived from this rig's actual
  // geometry, not a new height constant or a gameplay collision volume.
  const solve = Character.prototype._solveLimb, bounds = new WeakMap();
  let center, axisX, axisY, axisZ, lift, weaponQ, inverseHandQ;
  Character.prototype._solveLimb = function (limb, target, pole, orientation, weight, index) {
    if (this._s3RollerContactPose && limb === this.limbs.armR && orientation && weight > .999 && !this.P[C.SPIN]) {
      const d = this.weapon.def;
      let bound = bounds.get(d);
      if (!bound) {
        let minX = Infinity, maxX = -Infinity, radius = 0;
        for (const geo of [d.drum, d.drumCaps]) {
          const p = geo?.attributes.position;
          for (let i = 0; p && i < p.count; i++) {
            minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
            radius = Math.max(radius, Math.hypot(p.getY(i), p.getZ(i)));
          }
        }
        bound = { centerX: (minX + maxX) / 2, halfWidth: (maxX - minX) / 2, radius };
        bounds.set(d, bound);
      }
      if (!center) {
        center = target.clone(); axisX = target.clone(); axisY = target.clone(); axisZ = target.clone(); lift = target.clone();
        weaponQ = orientation.clone(); inverseHandQ = orientation.clone();
      }
      const kid = this.kid;
      weaponQ.copy(orientation).multiply(inverseHandQ.copy(d.handR.quat).invert());
      center.copy(d.drumAt); center.x += bound.centerX;
      center.sub(d.handR.pos).applyQuaternion(weaponQ).add(target).multiply(kid.scale).applyQuaternion(kid.quaternion).add(kid.position);
      axisX.set(1, 0, 0).applyQuaternion(weaponQ).multiply(kid.scale).applyQuaternion(kid.quaternion);
      axisY.set(0, 1, 0).applyQuaternion(weaponQ).multiply(kid.scale).applyQuaternion(kid.quaternion);
      axisZ.set(0, 0, 1).applyQuaternion(weaponQ).multiply(kid.scale).applyQuaternion(kid.quaternion);
      const bottom = center.y - bound.halfWidth * Math.abs(axisX.y) - bound.radius * Math.hypot(axisY.y, axisZ.y);
      if (Number.isFinite(bottom) && bottom !== 0) {
        lift.set(0, -bottom, 0).applyQuaternion(inverseHandQ.copy(kid.quaternion).invert()).divide(kid.scale);
        target.add(lift);
      }
    }
    return solve.call(this, limb, target, pole, orientation, weight, index);
  };
  Character.prototype._s3CancelRollerFlick = function () {
    this.s3RollerFlick = null;
    this._s3RollerContactPose = false;
    // A cancelled runner must not fall back to the legacy 0.7s pose or its
    // 0.15s drum impulse on the next Character frame.
    if (this.tr) this.tr[T.T_FLICK] = 99;
    if (this._wst) this._wst.flickReleaseTime = undefined;
  };
  Character.prototype._updateStates = function (dt, s) {
    const previous = this.wRoll;
    const result = updateStates.call(this, dt, s);
    if (this.weaponKind === 'roller') {
      // The runner owns whether the drum is rolling. A fixed 0.6s flick timer
      // otherwise delays the arms after gameplay has already resumed painting.
      const rolling = this.kidForm && this.grounded && !this.dance && !!s.rolling;
      this.wRoll = mix(previous, rolling ? 1 : 0, 1 - Math.exp(-(rolling ? 14 : 6) * dt));
    }
    return result;
  };
  Character.prototype._poseWeapon = function (dt, s) {
    const available = this.weaponKind === 'roller' && this.kidForm && !this.dance && this.wSub <= .01 &&
      (!T || (specialMotionAllowsAction(this,this.tr[T.T_LEAP] >= 1.9 && this.tr[T.T_SLAM] >= 1.4) &&
        this.tr[T.T_DODGE] >= this.dodgeDur && this.tr[T.T_SPAWN] >= 1.4));
    // #263: once native contact/stripe authority is admitted, use the existing
    // settled ground-contact target, not another raised-carry blend. Keep wRoll
    // itself unchanged: gameplay cleanup and drum-spin blending read that clock.
    // The same target also owns an admitted vertical-flick-to-roll handoff.
    // Airborne/recovery poses remain active until native rolling is admitted.
    const contact = available && this.grounded && !!s.rolling, previous = this.wRoll;
    this._s3RollerContactPose = contact;
    let result;
    try { if (contact) this.wRoll = 1; result = weaponPose.call(this, dt, s); }
    finally { this.wRoll = previous; }
    if (!available) return result;
    // Official footage carries the raised drum behind the shoulder, then lowers
    // it only to roll. These targets are rig calibration, not Nintendo joints.
    const P = this.P, roll = contact ? 1 : this.wRoll;
    for (let i = 0; i < 3; i++) {
      P[C.ANC + i] = mix(READY_ANCHOR[i], ROLL_ANCHOR[i], roll);
      P[C.ANCR + i] = mix(READY_ROTATION[i], ROLL_ROTATION[i], roll);
    }
    // Pushing the wider drum the footage shows a low crouch, the back bent over
    // the handle and both arms reaching down to it (on top of the native lean).
    P[C.SPINE] += ROLL_LEAN[0] * roll; P[C.CHEST] += ROLL_LEAN[1] * roll; P[C.HIPS] += ROLL_LEAN[2] * roll;
    P[C.HIPS_P + 1] -= ROLL_LEAN[3] * roll;
    return result;
  };
  Character.prototype.setWeapon = function (...args) {
    this._s3CancelRollerFlick();
    return setWeapon.apply(this, args);
  };
  Character.prototype._poseFlick = function (P, ft) {
    const state = this.s3RollerFlick;
    if (!state) return flick.call(this, P, ft);
    // The released flick must not lift the same drum after its authoritative
    // roll begins. Input release/cancel before admission still uses recovery.
    if (state.released && state.rolling && this.kidForm && this.grounded && !this.dance) return;
    if (!state.vertical) {
      // Preserve the upstream horizontal joints, retiming coil/whip/recovery to
      // the actual attack, including the existing calibrated cooldown.
      const age = state.elapsed < state.windup ? state.elapsed / state.windup * .23 : .23 + (state.elapsed - state.windup) / (state.interval - state.windup) * .45;
      const base = P.slice();
      flick.call(this, P, age);
      const coil = ease(state.elapsed / (state.windup * .65)) * (1 - ease((state.elapsed - state.windup * .65) / (state.windup * .35)));
      const recover = ease((age - .42) / .26);
      P[C.ANC + 1] -= .16 * coil;
      // The sweep keeps the larger drum (roller-model.mjs) at the same floor clearance.
      P[C.ANC + 1] += (.2 + DRUM_LIFT) * ease((state.elapsed - state.windup) / .08) * (1 - recover);
      // Start from the raised carry instead of first dropping to the upstream
      // low carry and lifting again. Keep its arm/body curves for the swing.
      const lift = ease(state.elapsed / (state.windup * .64));
      for (let i = 0; i < 3; i++) {
        P[C.ANC + i] = mix(base[C.ANC + i], P[C.ANC + i], lift);
        P[C.ANCR + i] = mix(base[C.ANCR + i], P[C.ANCR + i], lift);
      }
      const weight = ease(state.elapsed / (3 / 60)) * (state.released && state.rolling ? 1 - this.wRoll : 1);
      for (let i = 0; i < P.length; i++) P[i] = mix(base[i], P[i], weight);
      return;
    }
    const p = verticalRollerPose(state.elapsed, state.windup, state.interval), w = p.weight * (state.released && state.rolling ? 1 - this.wRoll : 1);
    for (let i = 0; i < 3; i++) {
      P[C.ANC + i] = mix(P[C.ANC + i], p.anchor[i], w);
      P[C.ANCR + i] = mix(P[C.ANCR + i], p.rotation[i], w);
    }
    P[C.AFOLT] = mix(P[C.AFOLT], .6, w); P[C.AFOLR] = mix(P[C.AFOLR], .25, w);
    P[C.IKR] = mix(P[C.IKR], 1, w); P[C.IKL] = mix(P[C.IKL], 1, w);
    P[C.SPINE] += (-.18 * p.coil + .32 * p.whip) * w;
    P[C.CHEST] += (-.12 * p.coil + .18 * p.whip) * w;
    P[C.HIPS_P + 1] -= (.025 * p.coil + .045 * p.whip) * w;
    P[C.HLP] += (.055 * p.coil - .09 * p.whip) * w;
    this._effort = Math.max(this._effort || 0, (p.coil + p.whip * .7) * w);
  };
  Character.prototype._animWeapon = function (dt, s, w) {
    const state = this.s3RollerFlick;
    this._wst.flickReleaseTime = state?.windup;
    return animate.call(this, dt, s, w);
  };
}
