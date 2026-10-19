import { specialMotionAllowsAction } from './action-admission.mjs';
import { ROLLER_DRUM } from './roller-model.mjs';
import { HEAVY_ROLLER_SWING, STANDARD_ROLLER_SWING, heavyRollerSwingEnd } from './roller-heavy-swing.mjs';
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

export function rollerSwingMoveSpeed(runner) {
  const a = runner?.a, attack = runner?.s3RollerAttack;
  if (!a || a.weapon?.kind !== 'roller' || !attack || runner.rolling || runner.lockT > 0 ||
      runner.aimingSub || a.form === 'squid' || a.specialActive || a.superJumpState ||
      !(attack.interval > 0) || attack.elapsed >= attack.interval - EPS) return null;
  const speed = a.weapon.moveSpeedFiring; // 11.3.0 SwingMoveSpeed: 0.048 source units/frame * 60.
  return Number.isFinite(speed) && speed >= 0 ? speed : null;
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
  // On low stage slabs, the actor's admitted ground pose may sit 0.05m
  // above the rendered top. The drum has a 0.4m radius, so an exact
  // capsule-AABB intersection misses such a floor by that same pose offset.
  // Resolve the *actual world floor under the drum* within its short pose
  // clearance instead of treating the established grounded roll as airborne.
  // This does not project beyond an edge or admit wall-only/dry damage.
  if (!floor && a.grounded && typeof level.groundHeight === 'function') {
    const height=level.groundHeight(cx,cz,a.pos.y+0.09);
    if (Number.isFinite(height) && Math.abs(a.pos.y-height)<=0.075) floor=true;
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

  const nativeMoveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function (...args) {
    // Own the entire admitted windup + recovery, not only native flickRecover's
    // short visual timer. Roll contact/dash, sub, transform and interruption
    // retain their existing movement owners.
    const speed = rollerSwingMoveSpeed(this);
    return speed === null ? nativeMoveSpeed.apply(this, args) : speed;
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
    // Issue #541: a refill inside a held dry roll leaves `rolling` true, so the
    // native edge (canRoll !== rolling) never fires and the roll loop, stripe
    // anchor and rollDist reset of a normal roll start would be skipped. Drop the
    // flag for this call only, so native re-enters the roll through its own
    // transition (one loop, anchored at the refill position). When native's
    // canRoll is false it ends the state exactly as it would have done anyway.
    if (this.s3RollerWasDry === true && this.rolling === true && this.flick < 0 && a.ink > DRY_INK) {
      this.rolling = false;
    }
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
    // Owner report 2026-10-18: S3 keeps the drum down while ZR is held and the
    // Left Stick is released. Keep the native roll state on a supported drum,
    // but (#847) residual displacement must not admit contact damage, roll ink
    // or the native stripe: speed is hidden during the call and the paint/ink
    // anchors follow the actor, exactly as for a still drum.
    const stillHold = !!(inp.fire && !onFlickPath && sup?.supported && !stick && !a.remote);
    const fireIn = (onFlickPath || sup?.supported || stillWall) ? inp : { ...inp, fire: false, firePressed: false };
    const restoreAirborne = !!(sup?.wall && !sup.floor && !a.grounded);
    // Native contact damage reads horizontal speed; prevent no-stick damage
    // without mutating authoritative actor movement outside the native call.
    const savedVelX = a.vel.x, savedVelZ = a.vel.z;
    if (stillWall || stillHold) {
      a.vel.x = 0; a.vel.z = 0;
      if (this.rolling === true && a.pos) {
        if (this.lastRollPos?.copy) this.lastRollPos.copy(a.pos);
        if (this.lastRollInkPos?.copy) this.lastRollInkPos.copy(a.pos);
      }
    }
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
    // Presentation only: a held ZR keeps the released drum down until the roll.
    if (state) state.holdRoll = inp.fire === true && !!a.grounded;
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
      if (stillWall || stillHold) { a.vel.x = savedVelX; a.vel.z = savedVelZ; }
      if (restoreAirborne && a.grounded) a.grounded = false;
    }
  };
}

// Native attack release owns the exact end of windup for both swings. The
// authored *pose* uses C1-continuous nonuniform Hermite segments. Shared
// velocities at coil / release / follow-through eliminate the stop-and-go
// motion produced by chaining several independent smoothsteps. These are
// INKWAVE grip coordinates, NOT recovered Nintendo bone tracks.
const HORIZONTAL_GRIPS = [
  // Enter directly from the settled shoulder carry. The old forward-facing
  // initial grip rotated 3.3 radians over the first few ticks and dropped the
  // real roller geometry between coil samples; the two-arm IK correction now
  // preserves both grip sockets without that discontinuity.
  { a: READY_ANCHOR, r: READY_ROTATION },
  { a: [-.13, 1.06, -.02], r: [-2.3, .3, 0] },
  { a: [-.07, .98 + DRUM_LIFT, .3], r: [-.1, .05, 0] },
  { a: [-.06, .74, .3], r: [.75, .05, 0] },
  { a: READY_ANCHOR, r: READY_ROTATION },
];
const VERTICAL_GRIPS = [
  { a: READY_ANCHOR, r: READY_ROTATION },
  { a: [.015, 1.11, .025], r: [VERTICAL_SWING.coil, .015, Math.PI / 2] },
  { a: [-.025, 1.05, .23], r: [VERTICAL_SWING.release, 0, Math.PI / 2] },
  { a: [-.025, 1.12, .28], r: [VERTICAL_SWING.follow, 0, Math.PI / 2] },
  { a: READY_ANCHOR, r: READY_ROTATION },
];
function slope(keys, times, i, joint, component) {
  if (i === 0 || i === keys.length - 1) return 0;
  const before = (keys[i][joint][component] - keys[i - 1][joint][component]) / (times[i] - times[i - 1]);
  const after = (keys[i + 1][joint][component] - keys[i][joint][component]) / (times[i + 1] - times[i]);
  if (before * after <= 0) return 0;
  // Weighted harmonic mean prevents overshoot while keeping the same tangent
  // on both sides of a keyframe (including the release frame).
  const a = times[i] - times[i - 1], b = times[i + 1] - times[i];
  const w1 = 2 * b + a, w2 = b + 2 * a;
  return (w1 + w2) / (w1 / before + w2 / after);
}
// Heavy-roller swing shape and its presentation length: see roller-heavy-swing.mjs.
export { HEAVY_ROLLER_SWING, STANDARD_ROLLER_SWING, heavyRollerSwingEnd };
function hermiteKeys(keys, times, t) {
  let segment = 0;
  while (segment < keys.length - 2 && t > times[segment + 1]) segment++;
  const h = times[segment + 1] - times[segment], u = Math.max(0, Math.min(1, (t - times[segment]) / h));
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const sample = (joint, component) =>
    h00 * keys[segment][joint][component] + h10 * h * slope(keys, times, segment, joint, component)
    + h01 * keys[segment + 1][joint][component] + h11 * h * slope(keys, times, segment + 1, joint, component);
  return { anchor: [sample('a', 0), sample('a', 1), sample('a', 2)], rotation: [sample('r', 0), sample('r', 1), sample('r', 2)] };
}
// One S3 swing order for every Roller (roller-heavy-swing.mjs): READY -> level
// overhead -> held -> slam, drum down at the release frame -> rest -> READY.
// The former stretched spline coiled for 65% of the windup and whipped for the
// remaining 35% (7F on the Splat Roller, 16F on the Dynamo), so ink left with
// the drum still at chest height.
// Held ZR after the swing (owner report 2026-10-18, Carbon Roller): the drum
// stays down and the roll takes over; it must not first lift back to the carry
// (READY) and drop again when the runner admits the roll. The drum then rests
// on the floor at full weight until the roll contact pose takes it over.
const ROLL_GRIP = Object.freeze({ a: ROLL_ANCHOR, r: ROLL_ROTATION });
function s3SwingPose(elapsed, windup, interval, keys, heavy, held = false) {
  const H = HEAVY_ROLLER_SWING, S = STANDARD_ROLLER_SWING, release = Math.max(1e-6, windup);
  const whip = Math.min(heavy ? H.whip : S.whip, release * .5), hold = release - whip;
  const coilAt = heavy ? Math.min(H.coilAt, hold * .9) : Math.min(S.coilMax, S.coilFraction * release, hold * .9);
  let restEnd, end;
  if (heavy) { restEnd = Math.max(release + H.rest, interval); end = restEnd + H.ret; }
  else { end = Math.max(release + 1 / 60, interval); restEnd = end - Math.min(S.ret, (end - release) * .5); }
  // Held vertical swing: the upright drum lies down into the roll grip on the
  // floor between the release and the runner's roll admission (interval),
  // instead of flipping from upright to level in the roll's first frame.
  const layDown = held && keys === VERTICAL_GRIPS;
  if (layDown) { end = Math.max(release + 2 / 60, interval); restEnd = release + (end - release) * .5; }
  // Release must sample the release grip (key 2), especially for the vertical
  // flick. Jumping to follow-through (key 3) rotates the roller sideways
  // exactly when ink leaves the drum. Preserve the established horizontal track.
  const releaseGrip = keys === VERTICAL_GRIPS ? keys[2] : keys[3];
  const k = [keys[0], keys[1], keys[1], releaseGrip, keys[3], layDown ? ROLL_GRIP : held ? keys[3] : keys[4]];
  const times = [0, coilAt, hold, release, restEnd, end];
  const t = Math.max(0, Math.min(end, elapsed));
  const { anchor, rotation } = hermiteKeys(k, times, t);
  return { anchor, rotation, weight: ease(t / (2 / 60)) * (held ? 1 : 1 - ease((t - restEnd) / (end - restEnd))),
    coil: ease(t / coilAt) * (1 - ease((t - hold) / whip)),
    whip: ease((t - hold) / whip) * (1 - ease((t - restEnd) / (end - restEnd))) };
}
export function horizontalRollerPose(elapsed, windup, interval, shape = null, held = false) {
  return s3SwingPose(elapsed, windup, interval, HORIZONTAL_GRIPS, shape === 'heavy', held);
}
// The X axis across the drum turns upright around the handle (local +Z).
// This is a pose target for the existing two-arm IK, not a second bone rig.
export function verticalRollerPose(elapsed, windup, interval, shape = null, held = false) {
  return s3SwingPose(elapsed, windup, interval, VERTICAL_GRIPS, shape === 'heavy', held);
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
  // Solve the displayed roller around the *actual right wrist*. The weapon
  // is attached to handR, not to the nominal IK target: translating that target
  // past the arm's finite reach never translates the drum, but it detaches the
  // support hand. Raised swings rotate around handR. Ground contact instead
  // fixes the drum axis and projects the paired wrist targets into both reach
  // spheres, retaining the authored sockets and gameplay hit volume.
  const solve = Character.prototype._solveLimb, bounds = new WeakMap();
  let rightOrigin, rightParentQ, leftOrigin, leftParentQ, delta, toLeft, axis, searchAxis, turn;
  let weaponQ, inverseHandQ, candidateQ, bestQ, baseQ, center, axisX, axisY, axisZ, trialQ, shoulderShift, chestQ, contactPoint, bestPoint;
  const SEARCH_AXES = [[1,0,0],[0,1,0],[0,0,1]];
  // Cost per radian of changing the floor correction between frames (same
  // units as the existing .06/rad small-angle preference). Visual calibration.
  const ROLLER_SEARCH_COHERENCE = .1;
  const rotCos = v => Math.max(-1, Math.min(1, v));
  Character.prototype._solveLimb = function (limb, target, pole, orientation, weight, index) {
    const isRightRoller = limb === this.limbs.armR && this.weaponKind === 'roller' &&
      // A held special replaces the roller with its own two-hand prop. Its
      // wrist targets must use the native solver, never roller drum alignment.
      this.kidForm && !this.dance && !this.actor?.specialActive && !!orientation && weight > .999 && !this.P[C.SPIN];
    if (!isRightRoller) return solve.call(this, limb, target, pole, orientation, weight, index);
    const d = this.weapon.def, arms = this.limbs;
    if (!rightOrigin) {
      rightOrigin = target.clone(); rightParentQ = orientation.clone();
      leftOrigin = target.clone(); leftParentQ = orientation.clone();
      delta = target.clone(); toLeft = target.clone(); axis = target.clone(); searchAxis = target.clone();
      turn = orientation.clone(); weaponQ = orientation.clone(); inverseHandQ = orientation.clone();
      candidateQ = orientation.clone(); bestQ = orientation.clone(); baseQ = orientation.clone(); trialQ = orientation.clone();
      center = target.clone(); axisX = target.clone(); axisY = target.clone(); axisZ = target.clone();
      shoulderShift = target.clone(); chestQ = orientation.clone(); contactPoint = target.clone(); bestPoint = target.clone();
    }
    // The native solver clamps exactly at 99.95% of the rest-chain length.
    // Keep the visual grip target just inside that physical limit.
    this._kidXform(arms.armR.up.parent, rightOrigin, rightParentQ);
    rightOrigin.add(delta.copy(arms.armR.up.position).applyQuaternion(rightParentQ));
    const reachR = (arms.armR.a + arms.armR.b) * .9995 - .001;
    delta.subVectors(target, rightOrigin);
    if (delta.length() > reachR) target.copy(rightOrigin).add(delta.setLength(reachR));
    this._kidXform(arms.armL.up.parent, leftOrigin, leftParentQ);
    leftOrigin.add(delta.copy(arms.armL.up.position).applyQuaternion(leftParentQ));
    const reachL = (arms.armL.a + arms.armL.b) * .9995 - .001;
    const armLeftHeld = this.P[C.IKL] > .99 && this.P[C.LTW] < .001;
    const alignLeft = q => {
      if (contacting) {
        // A grounded drum owns its cross-floor axis. Reach correction must move
        // the paired wrist targets, not yaw the roller away from the ink band.
        weaponQ.copy(q).multiply(inverseHandQ.copy(d.handR.quat).invert());
        axis.set(1,0,0).applyQuaternion(weaponQ).normalize();
        const n=this.actor?.groundN,yaw=this.actor?.yaw||0,cy=Math.cos(yaw),sy=Math.sin(yaw);
        toLeft.set(n?n.x*cy-n.z*sy:0,n?n.y:1,n?n.x*sy+n.z*cy:0).normalize();
        delta.set(Math.cos(ROLL_ROTATION[1]),0,-Math.sin(ROLL_ROTATION[1]));
        delta.addScaledVector(toLeft,-delta.dot(toLeft)).applyQuaternion(inverseHandQ.copy(this.kid.quaternion).invert());
        const scale=this.kid.scale;
        if(Math.abs(scale.x)>1e-4&&Math.abs(scale.y)>1e-4&&Math.abs(scale.z)>1e-4)delta.divide(scale);
        q.premultiply(turn.setFromUnitVectors(axis,delta.normalize()));
        if (armLeftHeld) {
          weaponQ.copy(q).multiply(inverseHandQ.copy(d.handR.quat).invert());
          delta.copy(d.handL.pos).sub(d.handR.pos).applyQuaternion(weaponQ);
          toLeft.copy(leftOrigin).sub(delta);
          // Intersection of the right reach sphere and the translated left
          // reach sphere. No stretching or independent hand/weapon offsets.
          for(let i=0;i<12;i++) {
            delta.subVectors(target,toLeft);
            if(delta.lengthSq()>reachL*reachL)target.copy(toLeft).add(delta.setLength(reachL));
            delta.subVectors(target,rightOrigin);
            if(delta.lengthSq()>reachR*reachR)target.copy(rightOrigin).add(delta.setLength(reachR));
          }
        }
        return;
      }
      if (!armLeftHeld) return;
      weaponQ.copy(q).multiply(inverseHandQ.copy(d.handR.quat).invert());
      delta.copy(d.handL.pos).sub(d.handR.pos).applyQuaternion(weaponQ);
      toLeft.subVectors(leftOrigin, target);
      const a = delta.length(), b = toLeft.length();
      if (a < 1e-7 || b < 1e-7) return;
      const now = Math.acos(rotCos(delta.dot(toLeft) / (a * b)));
      const allowable = Math.acos(rotCos((a*a + b*b - reachL*reachL)/(2*a*b)));
      if (now <= allowable) return;
      axis.crossVectors(delta, toLeft);
      if (axis.lengthSq() < 1e-12) return;
      // Minimum-angle quaternion sending the support grip into left IK reach;
      // margin keeps it in reach after native f32 bone transforms.
      q.premultiply(turn.setFromAxisAngle(axis.normalize(),now-allowable + .003));
    };
    const contacting = !!this._s3RollerContactPose;
    if (contacting) contactPoint.copy(target);
    // The later shortening moves each clavicle along the chest's local Y,
    // which is tilted while pushing/landing. Use that exact world displacement;
    // subtracting a vertical 5cm over-corrects the leaned drum into a hover.
    shoulderShift.set(0, 0, 0);
    if (this.s3ShoulderDrop) {
      this._kidXform(this.bones.chest, delta, chestQ);
      shoulderShift.set(0, -this.s3ShoulderDrop, 0).applyQuaternion(chestQ)
        .multiply(this.kid.scale).applyQuaternion(this.kid.quaternion);
    }
    // Landing recovery can outlive the runner's flick token. Keep the drum
    // above the floor through that grounded recovery as well as the swing.
    const neededGround = !!this.grounded && !!this.weapon.drum;
    let bound;
    const bottom = q => {
      if (!bound) {
        bound = bounds.get(d);
        if (!bound) {
          let minX = Infinity, maxX = -Infinity, radius = 0;
          for (const geo of [d.drum, d.drumCaps]) {
            const pos = geo?.attributes.position;
            for (let i = 0; pos && i < pos.count; i++) {
              minX = Math.min(minX,pos.getX(i)); maxX = Math.max(maxX,pos.getX(i));
              radius = Math.max(radius,Math.hypot(pos.getY(i),pos.getZ(i)));
            }
          }
          bound = {centerX:(minX+maxX)*.5, halfWidth:(maxX-minX)*.5, radius};
          bounds.set(d,bound);
        }
      }
      const kid = this.kid;
      weaponQ.copy(q).multiply(inverseHandQ.copy(d.handR.quat).invert());
      center.copy(d.drumAt);center.x += bound.centerX;
      // The live hinge moves the drum centre during folding. Its rotation
      // is about the cylinder axle, so the radial support bound is unchanged.
      // Testing the unfolded centre can miss penetration in a folded landing.
      const fold = this.weapon.fold;
      if (fold && this.weapon.drum?.parent === fold)
        center.sub(fold.position).applyQuaternion(fold.quaternion).add(fold.position);
      center.sub(d.handR.pos).applyQuaternion(weaponQ).add(target).multiply(kid.scale).applyQuaternion(kid.quaternion).add(kid.position);
      axisX.set(1,0,0).applyQuaternion(weaponQ).multiply(kid.scale).applyQuaternion(kid.quaternion);
      axisY.set(0,1,0).applyQuaternion(weaponQ).multiply(kid.scale).applyQuaternion(kid.quaternion);
      axisZ.set(0,0,1).applyQuaternion(weaponQ).multiply(kid.scale).applyQuaternion(kid.quaternion);
      return center.y + shoulderShift.y - bound.halfWidth*Math.abs(axisX.y) - bound.radius*Math.hypot(axisY.y,axisZ.y);
    };
    const evaluate = q => {
      if (contacting) target.copy(contactPoint);
      alignLeft(q);
      const floor = neededGround ? bottom(q) : .1;
      // Native rolling already provides an acceptable near-ground drum. Only
      // correct real penetration or a high floating contact, not every frame.
      const groundError = contacting ? Math.max(0,-.003-floor,floor-.025) : Math.max(0,-.002-floor);
      return groundError;
    };
    bestQ.copy(orientation);
    let bestGroundError = evaluate(bestQ);
    if (contacting) bestPoint.copy(target);
    // A roll surface must sit near the floor; a windup must never clip it.
    // Search purely in orientation, so the right hand remains the pivot and
    // the left hand remains reachable after every tested candidate.
    // Owner report 2026-10-18 (Dynamo vertical swing): solutions about
    // different axes with almost equal floor error alternated frame to frame
    // and the long upright drum jumped about. Keep the search coherent: a
    // correction far from last frame's pays for the angular distance.
    const memory = this._s3RollerFloorSearch || (this._s3RollerFloorSearch = { valid: false, axis: -1, sign: 0, a: 0 });
    const prevValid = memory.valid, prevAxis = memory.axis, prevSign = memory.sign, prevA = memory.a;
    const switchCost = (axisIndex, sign, a) => !prevValid ? 0
      : ROLLER_SEARCH_COHERENCE * (prevA > 0 && prevAxis === axisIndex && prevSign === sign ? Math.abs(a - prevA) : a + prevA);
    let chosenAxis = -1, chosenSign = 0, chosenA = 0;
    if (neededGround && bestGroundError > .003) {
      let bestCost = bestGroundError*30 + switchCost(-1, 0, 0);
      baseQ.copy(orientation);
      for(let axisIndex=0;axisIndex<SEARCH_AXES.length;axisIndex++)for(const sign of [-1,1]) {
        const [x,y,z] = SEARCH_AXES[axisIndex];
        searchAxis.set(x,y,z);
        for(let step=1;step<=30;step++){
          const a=step*.05;
          candidateQ.copy(trialQ.setFromAxisAngle(searchAxis,sign*a)).multiply(baseQ);
          const floorError=evaluate(candidateQ);
          const cost=floorError*30+a*.06+switchCost(axisIndex,sign,a);
          if(cost<bestCost){bestCost=cost;bestGroundError=floorError;bestQ.copy(candidateQ);if(contacting)bestPoint.copy(target);chosenAxis=axisIndex;chosenSign=sign;chosenA=a;}
          if(floorError<=.003)break;
        }
      }
    }
    memory.valid = neededGround; memory.axis = chosenAxis; memory.sign = chosenSign; memory.a = chosenA;
    if (contacting) target.copy(bestPoint);
    // An upright vertical release can place the actual drum below the floor
    // even after orientation search. Recover the remaining penetration from
    // the live drum geometry, not a weapon-wide guessed height offset. Lift
    // only the presentation wrist target, in character-local coordinates,
    // and retain the native finite arm reach and left-hand alignment.
    if (neededGround) {
      const penetration = -.002 - bottom(bestQ);
      const scale = this.kid.scale;
      // During a form transition the source skeleton can scale kid to zero.
      // A visible roller grip never divides by a collapsed or invalid axis.
      if (penetration > .00001 && [scale.x, scale.y, scale.z].every(v => Number.isFinite(v) && Math.abs(v) > 1e-4)) {
        delta.set(0, 1, 0).applyQuaternion(inverseHandQ.copy(this.kid.quaternion).invert());
        target.x += penetration * delta.x / scale.x;
        target.y += penetration * delta.y / scale.y;
        target.z += penetration * delta.z / scale.z;
        delta.subVectors(target, rightOrigin);
        if (delta.length() > reachR) target.copy(rightOrigin).add(delta.setLength(reachR));
        alignLeft(bestQ);
      }
    }
    orientation.copy(bestQ);
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
    // The floor contact anchor is independent of the strafe chest transform.
    // Both wrists are kept reachable by the contact solver below.
    if (contact) {
      P[C.AFOLT] = 0; P[C.AFOLR] = 0;
      // Keep the pushing torso in its forward reach envelope. Feet retain
      // native diagonal targets; the held drum does not follow a strafe bank.
      if (this.gaitW > .001) {
        const twist = this.hipTwist || 0;
        P[C.HIPS + 1] -= twist;
        P[C.SPINE + 1] += twist * .45;
        P[C.CHEST + 1] += twist * .55;
        const bank = Math.max(-1, Math.min(1, (this.kgx || 0) / 6)) * this.gaitW * (1 - .3 * (this.wGoo || 0));
        P[C.HIPS + 2] += bank * .03; P[C.SPINE + 2] += bank * .07; P[C.CHEST + 2] += bank * .04;
      }
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
      // Torso effort and arm IK remain native, but the actual two-hand grip
      // is sampled directly from the Runner's release time instead of
      // borrowing the incompatible fixed .23/.68-second preview timeline.
      const age = state.elapsed < state.windup
        ? state.elapsed / state.windup * .23
        : .23 + (state.elapsed - state.windup) / Math.max(1 / 60, state.interval - state.windup) * .45;
      const base = P.slice();
      flick.call(this, P, age);
      const curve = horizontalRollerPose(state.elapsed, state.windup, state.swingInterval ?? state.interval, state.swingShape, state.holdRoll === true);
      for (let i = 0; i < 3; i++) {
        P[C.ANC + i] = curve.anchor[i];
        P[C.ANCR + i] = curve.rotation[i];
      }
      const weight = ease(state.elapsed / (3 / 60)) * (state.released && state.rolling ? 1 - this.wRoll : 1);
      for (let i = 0; i < P.length; i++) P[i] = mix(base[i], P[i], weight);
      return;
    }
    const p = verticalRollerPose(state.elapsed, state.windup, state.swingInterval ?? state.interval, state.swingShape, state.holdRoll === true), w = p.weight * (state.released && state.rolling ? 1 - this.wRoll : 1);
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
