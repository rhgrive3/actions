import * as THREE from 'three';
import { SUB, SPECIALS } from '../../../src/config.js';
import { specialDeviceFlight } from './special-device-flight.mjs';
import { fidelityThrowVelocity } from './sub-special-fidelity.mjs';
import { STORM_FLY_GRAVITY, STORM_FLY_AIR_RESIST } from './kit-subs.mjs';
import { TACTICOOLER_SOURCE } from './support-cooler.mjs';
import { bigBubblerDomes, bigBubblerRemoteDomes } from './kit-big-bubbler.mjs';

// INKWAVE decisions, not Nintendo AI or source-measured engagement distances.
// Each action still goes through Actor's ordinary special and throw inputs.
const IDS = new Set(['bubbler', 'storm', 'tripleInkstrike', 'tacticooler',
  'superChump', 'splattercolorScreen', 'waveBreaker']);
const _launchVel = new THREE.Vector3();
const _launchProxy = { aimPitch: 0, aimYaw: 0, vel: null };
const _launchFlight = { vel: _launchVel, gravity: 0, airResist: 0 };
const _aimFrom = new THREE.Vector3();
const _aimTo = new THREE.Vector3();
const _aimPrev = new THREE.Vector3();
const _aimNext = new THREE.Vector3();
const _flightHit = { point: new THREE.Vector3(), normal: new THREE.Vector3() };

const finitePoint = p => {
  if(!p)return p;
  // Preserve eager x/y/z reads, including accessor order, without a triplet.
  const x=p.x,y=p.y,z=p.z;
  return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z);
};
const flatDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function goalPoint(ctx) {
  // A combat path may have been made from a now-hidden enemy. Never read that
  // path as a new target; only the existing paint/objective navigation goal.
  if (ctx.brain?.target && !ctx.visible) return null;
  const point = ctx.world?.nav?.nodes?.[ctx.brain?.goal];
  return finitePoint(point) ? point : null;
}
function localAllies(ctx) {
  return (ctx.world?.actors || []).filter(a => a !== ctx.actor && a.alive &&
    a.team === ctx.actor.team && finitePoint(a.pos) && flatDistance(a.pos, ctx.actor.pos) < 18);
}
function groundPoint(ctx, point, maxDrop = 6) {
  if (!finitePoint(point)) return null;
  const y = ctx.world?.level?.groundHeight?.(point.x, point.z, point.y + 1.5);
  if (!Number.isFinite(y) || y < ctx.actor.pos.y - maxDrop || y > point.y + 1.5) return null;
  return new THREE.Vector3(point.x, y, point.z);
}
function toward(ctx, point, distance) {
  const from = ctx.actor.pos, d = flatDistance(from, point);
  if (d < .01) {
    const yaw = Number.isFinite(ctx.actor.aimYaw) ? ctx.actor.aimYaw : 0;
    return new THREE.Vector3(from.x + Math.sin(yaw) * distance,
      from.y, from.z + Math.cos(yaw) * distance);
  }
  return new THREE.Vector3(from.x + (point.x - from.x) / d * distance,
    point.y, from.z + (point.z - from.z) / d * distance);
}
function covered(ctx, point) {
  const { world, special, actor } = ctx;
  const near = (p, radius) => finitePoint(p) && flatDistance(p, point) < radius && Math.abs(p.y - point.y) < 4;
  if (special === 'bubbler') return [bigBubblerDomes(), bigBubblerRemoteDomes()].some(list =>
    list.some(o => !o.dead && o.team === actor.team && near(o.pos, 9)));
  if (special === 'tacticooler') return (world.projectiles?._s3SupportCoolers || []).some(o =>
    o.team === actor.team && o.expires > world.time + 3 && near(o.pos, 10));
  if (special === 'storm') return (world.projectiles?.clouds || []).some(o =>
    o.team === actor.team && o.t < o.dur - 2 && near(o.group?.position, 10));
  return (world.projectiles?._s3AllSpecialObjects || []).some(o => !o.dead && o.team === actor.team &&
    o.id === special && ['wave', 'screen'].includes(o.kind) && near(o.pos, special === 'waveBreaker' ? 12 : 10));
}
function choosePoint(ctx, active) {
  const { actor, special, enemy, distance, visible, brain } = ctx;
  const goal = goalPoint(ctx), allies = localAllies(ctx);
  const seen = visible && finitePoint(enemy?.pos) ? enemy.pos : null;
  const goalDistance = goal ? flatDistance(actor.pos, goal) : Infinity;
  const spawn = ctx.world?.level?.spawnPads?.[actor.team];
  const atSpawn = finitePoint(spawn) && flatDistance(actor.pos, spawn) < 9;
  let point;
  if (special === 'tacticooler') {
    const mate = allies.find(a => !(a.s3?.drink && a.s3.drinkUntil > ctx.world.time + 4));
    const ownDrink = actor.s3?.drink && actor.s3.drinkUntil > ctx.world.time + 4;
    const soloPush = !ownDrink && (seen ? distance >= 8 && distance <= 32 :
      !atSpawn && goalDistance >= 8 && goalDistance <= 32);
    if (!active && ((!mate && !soloPush) || seen && distance < 6)) return null;
    point = toward(ctx, mate?.pos || goal || seen || actor.pos, 3);
  } else if (special === 'bubbler') {
    if (!active && (seen ? distance < 5 || distance > 26 :
      atSpawn || !allies.length || goalDistance > 12 || brain?.mode === 'refill')) return null;
    if (!seen && !goal) return null;
    point = toward(ctx, seen || goal, 3);
  } else if (special === 'waveBreaker') {
    // Keep the breakable generator on our side of the fight, on a useful level.
    if (!active && (seen ? distance < 5 || distance > 23 || ctx.height > 2.7 || ctx.height < -5 :
      atSpawn || !allies.length || goalDistance > 16)) return null;
    point = toward(ctx, seen || goal || actor.pos, 4);
    point.y = actor.pos.y;
  } else {
    const limits = special === 'superChump' ? [16, 40] : [7, 42];
    if (!active && (seen ? distance < limits[0] || distance > limits[1] :
      atSpawn || !goal || goalDistance < 8 || goalDistance > 36)) return null;
    if (!active && !seen) {
      if (special === 'splattercolorScreen' && !allies.length) return null;
      const stats = ctx.world?.paint?.regionStats?.(goal.x, goal.y, goal.z, 4, actor.team, {});
      if (special !== 'splattercolorScreen' && (!stats || stats.own >= .75)) return null;
    }
    const target = seen || goal || toward(ctx, actor.pos, 12);
    const d = flatDistance(actor.pos, target);
    // Decoys surround the selected center. Put the observed opponent near
    // an edge of that footprint, not in its empty center.
    const chumpAhead = clamp(d + 8, 18, 26), chumpBehind = clamp(d - 8, 18, 26);
    const chumpCenter = Math.abs(d - chumpAhead) >= Math.abs(d - chumpBehind) ? chumpAhead : chumpBehind;
    const reach = special === 'superChump' ? chumpCenter :
      special === 'splattercolorScreen' ? clamp(d * .45, 5, 12) :
      // Ink Storm's damped bomb-family flight has a finite reach; aim inside it.
      special === 'storm' ? Math.min(clamp(d, 8, 15), stormReach(ctx) * .9) : clamp(d, 8, 34);
    point = toward(ctx, target, reach);
    if (special === 'tripleInkstrike') {
      const native = actor._s3AllSpecialState?.id === 'tripleInkstrike' ? actor._s3AllSpecialState : null;
      const shot = native?.shots || 0;
      const dx = target.x - actor.pos.x, dz = target.z - actor.pos.z, len = Math.hypot(dx, dz) || 1;
      const side = shot === 1 ? 4 : shot === 2 ? -4 : 0;
      point.x += dz / len * side; point.z -= dx / len * side;
    }
  }
  return groundPoint(ctx, point, special === 'waveBreaker' || special === 'tacticooler' ? 2 : 8);
}
function launch(ctx, pitch, yaw) {
  const { actor, special } = ctx;
  const safePitch = Number.isFinite(pitch) ? clamp(pitch, -1.05, 1.15) : 0;
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  _launchProxy.aimPitch = safePitch;
  _launchProxy.aimYaw = safeYaw;
  _launchProxy.vel = actor.vel;
  if (special === 'tacticooler') {
    const cp = Math.cos(safePitch), speedZ = TACTICOOLER_SOURCE.spawnSpeedZ * 60;
    _launchVel.set(
      Math.sin(safeYaw) * cp * speedZ,
      Math.sin(safePitch) * speedZ + TACTICOOLER_SOURCE.spawnSpeedY * 60,
      Math.cos(safeYaw) * cp * speedZ,
    );
    _launchFlight.vel = _launchVel;
    _launchFlight.gravity = TACTICOOLER_SOURCE.flyGravity * 3600;
    _launchFlight.airResist = 0;
    return _launchFlight;
  }
  if (special === 'storm') {
    _launchFlight.vel = fidelityThrowVelocity(_launchProxy, 'storm', _launchVel, SPECIALS.storm.throwSpeed *
      (actor.s3?.stormPowerSnapshot?.throwScale ?? actor.s3?.modifiers?.stormThrowScale ?? 1));
    _launchFlight.gravity = STORM_FLY_GRAVITY;
    _launchFlight.airResist = STORM_FLY_AIR_RESIST;
    return _launchFlight;
  }
  return specialDeviceFlight({ THREE, SUB }, _launchProxy, special, actor.s3?.abilityPoints?.specialPower || 0);
}
// Horizontal per-60Hz-frame drag (Ink Storm's bomb-family flight) in closed
// form: distance(t) = h * (1 - keep^(60t)) / (-60 ln keep). Drag-free flights
// keep distance = h * t. Unreachable distances answer Infinity.
// Farthest flat-ground landing of the current Ink Storm launch over the bot's
// admitted pitch range (closed-form drag, same launch helper as aimPlan).
function stormReach(ctx) {
  let best = 0;
  const yaw = Number.isFinite(ctx.wantYaw) ? ctx.wantYaw
    : (Number.isFinite(ctx.actor.aimYaw) ? ctx.actor.aimYaw : 0);
  for (let pitch = -.2; pitch <= .55 + 1e-9; pitch += .05) {
    const flight = launch(ctx, pitch, yaw), g = flight.gravity, vy = flight.vel.y, drop = 1.45;
    if (!(g > 0) || !Number.isFinite(vy)) continue;
    const t = (vy + Math.sqrt(vy * vy + 2 * g * drop)) / g;
    const reach = Math.hypot(flight.vel.x, flight.vel.z) * flightHorizontalScale(flight, t);
    if (Number.isFinite(reach) && reach > best) best = reach;
  }
  return best;
}
function flightHorizontalScale({ airResist = 0 }, t) {
  if (!(airResist > 0 && airResist < 1)) return t;
  const rate = -60 * Math.log(1 - airResist);
  return (1 - Math.exp(-rate * t)) / rate;
}
function flightTimeToDistance({ vel, airResist = 0 }, distance) {
  if (!Number.isFinite(distance) || distance < 0) return Infinity;
  const speed = Math.hypot(vel.x, vel.z);
  if (!Number.isFinite(speed)) return Infinity;
  const h = Math.max(.001, speed);
  if (!(airResist > 0 && airResist < 1)) return distance / h;
  const rate = -60 * Math.log(1 - airResist), left = 1 - distance * rate / h;
  return left > 0 ? -Math.log(left) / rate : Infinity;
}
function aimPlan(ctx, point) {
  ctx.aimAt(point);
  if (!Number.isFinite(ctx.wantYaw) || !Number.isFinite(ctx.wantPitch)) return false;
  if (ctx.special === 'bubbler') {
    if (ctx.safePath && !ctx.safePath(point, 6)) return false;
    _aimFrom.copy(ctx.actor.pos); _aimFrom.y += 1.1;
    _aimTo.copy(point); _aimTo.y += .2;
    return !ctx.world?.physics?.los || ctx.world.physics.los(_aimFrom, _aimTo);
  }
  if (ctx.special === 'superChump') return true;
  const from = _aimFrom.copy(ctx.actor.pos); from.y += ctx.special === 'storm' ? 1.45 : 1.1;
  const distance = flatDistance(from, point), yaw = ctx.wantYaw;
  // Low-arc targeting predicts from the existing launch helper. The actual
  // projectile retains its own fixed-step gravity, drag and collision owner.
  let lo = -1.05, hi = .55;
  for (let i = 0; i < 15; i++) {
    const pitch = (lo + hi) / 2, flight = launch(ctx, pitch, yaw);
    const t = flightTimeToDistance(flight, distance);
    const y = Number.isFinite(t) ? from.y + flight.vel.y * t - flight.gravity * t * t / 2 : -Infinity;
    if (y > point.y) hi = pitch; else lo = pitch;
  }
  ctx.wantPitch = (lo + hi) / 2;
  const flight = launch(ctx, ctx.wantPitch, yaw), { vel, gravity } = flight;
  const time = flightTimeToDistance(flight, distance);
  const endY = from.y + vel.y * time - gravity * time * time / 2;
  if (!Number.isFinite(ctx.wantPitch) || !Number.isFinite(time) || time < 0 || time > 2 ||
    !Number.isFinite(endY) || Math.abs(endY - point.y) > .8) return false;
  const previous = _aimPrev.copy(from);
  for (let i = 1; i <= 6; i++) {
    const t = time * i / 6;
    _aimNext.copy(from).addScaledVector(vel, flightHorizontalScale(flight, t));
    _aimNext.y = from.y + vel.y * t - gravity * t * t / 2;
    // LOS intentionally omits its last .05 WU and ignores grates. A thrown
    // guide has neither exception: trace the full low arc at its real height.
    if (ctx.world?.physics?.segment) {
      const contact = ctx.world.physics.segment(previous, _aimNext, _flightHit, false);
      if (contact?.hit && !(i === 6 && contact.normal?.y > .4 && contact.point?.distanceTo?.(point) < .3)) return false;
    } else if (ctx.world?.physics?.los && !ctx.world.physics.los(previous, _aimNext)) return false;
    previous.copy(_aimNext);
  }
  return true;
}

export function driveSupportSpecial(ctx) {
  if (!IDS.has(ctx.special)) return false;
  const { actor, intent, state, memory } = ctx;
  if (!actor?.alive || !finitePoint(actor.pos)) {
    if (memory) { memory.holding = false; memory.holdTime = 0; }
    return false;
  }
  if (memory.activeState !== state) {
    memory.activeState = state;
    memory.holding = false;
    memory.holdTime = 0;
    memory.initialized = false;
    memory.releasedShot = -1;
    memory.releasedAt = -Infinity;
    memory.point = null;
    memory.shot = -1;
    memory.replanAt = 0;
    if (memory.aimCache) memory.aimCache.point = null;
  }
  if (!actor.grounded) { if (state && memory.holding) intent.sub = true; return true; }
  const dt = Number.isFinite(ctx.dt) && ctx.dt > 0 ? ctx.dt : 0;
  memory.supportClock = (Number.isFinite(memory.supportClock) ? memory.supportClock : 0) + dt;
  const native = actor._s3AllSpecialState?.id === ctx.special ? actor._s3AllSpecialState : null;
  const shot = ctx.special === 'tripleInkstrike' ? native?.shots || 0 : 0;
  const activeThrow = !!(state && (state.phase === 'throw' || native?.throwAt !== undefined ||
    native?.markerQueued || (ctx.special === 'tripleInkstrike' && shot >= 3)));
  let releaseGrace = false;
  if (state && memory.releasedShot === shot) {
    if (activeThrow || (memory.supportClock - (memory.releasedAt ?? -Infinity)) < 0.15) {
      releaseGrace = true;
    } else {
      memory.releasedShot = -1;
      memory.releasedAt = -Infinity;
    }
  }
  const pending = activeThrow || releaseGrace;
  if (!pending && (!memory.point || memory.shot !== shot || memory.supportClock >= (memory.replanAt || 0))) {
    memory.point = choosePoint(ctx, !!state);
    memory.shot = shot; memory.replanAt = memory.supportClock + .25;
  }
  const point = memory.point;
  // Inapplicable or duplicate support must not steal the ordinary gun aim.
  if (!point) { if (state && memory.holding) intent.sub = true; return true; }
  if (!state && (!actor.specialReady?.() || covered(ctx, point))) return true;
  const prevYaw = ctx.wantYaw, prevPitch = ctx.wantPitch, prevDist = ctx.aimDistance, prevChanged = ctx.aimChanged;
  let ac = memory.aimCache;
  const ap = actor.pos;
  const av = actor.vel;
  const vx = av && Number.isFinite(av.x) ? av.x : 0;
  const vy = av && Number.isFinite(av.y) ? av.y : 0;
  const vz = av && Number.isFinite(av.z) ? av.z : 0;
  const needAimPlan = !ac || ac.point !== point || ac.special !== ctx.special ||
    ac.px !== point.x || ac.py !== point.y || ac.pz !== point.z ||
    (ap.x - ac.ax) * (ap.x - ac.ax) + (ap.y - ac.ay) * (ap.y - ac.ay) + (ap.z - ac.az) * (ap.z - ac.az) > 0.16 ||
    (vx - ac.vx) * (vx - ac.vx) + (vy - ac.vy) * (vy - ac.vy) + (vz - ac.vz) * (vz - ac.vz) > 0.25 ||
    !Number.isFinite(ac.at) || !Number.isFinite(ac.wantPitch) ||
    memory.supportClock - ac.at >= 0.12 || memory.supportClock < ac.at;
  let aimOk;
  if (needAimPlan) {
    aimOk = aimPlan(ctx, point);
    if (!ac) ac = memory.aimCache = { point: null, special: '', px: 0, py: 0, pz: 0, ax: 0, ay: 0, az: 0, vx: 0, vy: 0, vz: 0, at: 0, ok: false, wantPitch: 0 };
    ac.point = point; ac.special = ctx.special;
    ac.px = point.x; ac.py = point.y; ac.pz = point.z;
    ac.ax = ap.x; ac.ay = ap.y; ac.az = ap.z;
    ac.vx = vx; ac.vy = vy; ac.vz = vz;
    ac.at = memory.supportClock;
    ac.ok = aimOk;
    ac.wantPitch = Number.isFinite(ctx.wantPitch) ? ctx.wantPitch : 0;
  } else {
    aimOk = ac.ok;
    if (aimOk) {
      ctx.aimAt(point);
      if (ctx.special !== 'bubbler' && ctx.special !== 'superChump') ctx.wantPitch = ac.wantPitch;
    }
  }
  if (!aimOk) {
    ctx.wantYaw = prevYaw; ctx.wantPitch = prevPitch; ctx.aimDistance = prevDist; ctx.aimChanged = prevChanged;
    if (state && memory.holding) intent.sub = true;
    return true;
  }
  if (!state) {
    // A fresh activation never inherits an ordinary bomb release.
    intent.sub = false;
    if (actor._prevIntent?.sub || !ctx.isAimed(.12)) return true;
    intent.special = true; intent.fire = intent.jump = intent.squid = false;
    ctx.move.set(0, 0, 0);
    return true;
  }
  ctx.move.set(0, 0, 0);
  if (pending) { intent.sub = false; return true; }
  if (ctx.special === 'superChump') {
    intent.fire = ctx.isAimed(.12);
    return true;
  }
  if (ctx.special === 'bubbler') return true;
  if (!memory.initialized) { memory.initialized = true; intent.sub = false; return true; }
  if (!memory.holding) {
    memory.holding = true; memory.holdTime = 0; intent.sub = true; return true;
  }
  memory.holdTime = (Number.isFinite(memory.holdTime) ? memory.holdTime : 0) + dt;
  intent.sub = true;
  if (memory.holdTime < .12 || !ctx.isAimed(.1) ||
    ctx.special === 'tripleInkstrike' && (native?.t || 0) < (native?.nextMarkerStart || 0)) return true;
  // Do not recompute the target during the Actor's release windup.
  intent.sub = false; memory.holding = false; memory.releasedShot = shot; memory.releasedAt = memory.supportClock;
  return true;
}
