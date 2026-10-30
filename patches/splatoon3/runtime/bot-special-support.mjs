import * as THREE from 'three';
import { SUB, SPECIALS } from '../../../src/config.js';
import { specialDeviceFlight } from './special-device-flight.mjs';
import { fidelityThrowVelocity } from './sub-special-fidelity.mjs';
import { NATIVE_STORM_GRAVITY } from './kit-subs.mjs';
import { TACTICOOLER_SOURCE } from './support-cooler.mjs';
import { bigBubblerDomes, bigBubblerRemoteDomes } from './kit-big-bubbler.mjs';

// INKWAVE decisions, not Nintendo AI or source-measured engagement distances.
// Each action still goes through Actor's ordinary special and throw inputs.
const IDS = new Set(['bubbler', 'storm', 'tripleInkstrike', 'tacticooler',
  'superChump', 'splattercolorScreen', 'waveBreaker']);
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);
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
  if (d < .01) return new THREE.Vector3(from.x + Math.sin(ctx.actor.aimYaw || 0) * distance,
    from.y, from.z + Math.cos(ctx.actor.aimYaw || 0) * distance);
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
    if (!active && (seen ? distance < 5 || distance > 25 || ctx.height > 3 || ctx.height < -5 :
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
    const reach = special === 'superChump' ? clamp(d, 18, 30) :
      special === 'splattercolorScreen' ? clamp(d * .45, 5, 12) : clamp(d, 8, 34);
    point = toward(ctx, target, reach);
    if (special === 'tripleInkstrike') {
      const shot = actor._s3AllSpecialState?.shots || 0;
      const dx = target.x - actor.pos.x, dz = target.z - actor.pos.z, len = Math.hypot(dx, dz) || 1;
      const side = shot === 1 ? 4 : shot === 2 ? -4 : 0;
      point.x += dz / len * side; point.z -= dx / len * side;
    }
  }
  return groundPoint(ctx, point, special === 'waveBreaker' || special === 'tacticooler' ? 2 : 8);
}
function launch(ctx, pitch, yaw) {
  const { actor, special } = ctx;
  const proxy = { aimPitch: pitch, aimYaw: yaw, vel: actor.vel };
  if (special === 'tacticooler') return {
    vel: new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      .multiplyScalar(TACTICOOLER_SOURCE.spawnSpeedZ * 60)
      .add(new THREE.Vector3(0, TACTICOOLER_SOURCE.spawnSpeedY * 60, 0)),
    gravity: TACTICOOLER_SOURCE.flyGravity * 3600,
  };
  if (special === 'storm') return {
    vel: fidelityThrowVelocity(proxy, 'storm', new THREE.Vector3(), SPECIALS.storm.throwSpeed *
      (actor.s3?.stormPowerSnapshot?.throwScale ?? actor.s3?.modifiers?.stormThrowScale ?? 1)),
    gravity: NATIVE_STORM_GRAVITY,
  };
  return specialDeviceFlight({ THREE, SUB }, proxy, special, actor.s3?.abilityPoints?.specialPower || 0);
}
function aimPlan(ctx, point) {
  ctx.aimAt(point);
  if (ctx.special === 'bubbler') {
    if (ctx.safePath && !ctx.safePath(point, 6)) return false;
    const from = ctx.actor.pos.clone(); from.y += 1.1;
    const to = point.clone(); to.y += .2;
    return !ctx.world?.physics?.los || ctx.world.physics.los(from, to);
  }
  if (ctx.special === 'superChump') return true;
  const from = ctx.actor.pos.clone(); from.y += ctx.special === 'storm' ? 1.45 : 1.1;
  const distance = flatDistance(from, point), yaw = ctx.wantYaw;
  // Low-arc targeting predicts from the existing launch helper. The actual
  // projectile retains its own fixed-step gravity, drag and collision owner.
  let lo = -1.05, hi = .55;
  for (let i = 0; i < 15; i++) {
    const pitch = (lo + hi) / 2, { vel, gravity } = launch(ctx, pitch, yaw);
    const t = distance / Math.max(.001, Math.hypot(vel.x, vel.z));
    const y = from.y + vel.y * t - gravity * t * t / 2;
    if (y > point.y) hi = pitch; else lo = pitch;
  }
  ctx.wantPitch = (lo + hi) / 2;
  const { vel, gravity } = launch(ctx, ctx.wantPitch, yaw);
  const time = distance / Math.max(.001, Math.hypot(vel.x, vel.z));
  const endY = from.y + vel.y * time - gravity * time * time / 2;
  if (!Number.isFinite(time) || time > 2 || Math.abs(endY - point.y) > .8) return false;
  let previous = from;
  for (let i = 1; i <= 6; i++) {
    const t = time * i / 6, next = from.clone().addScaledVector(vel, t);
    next.y -= gravity * t * t / 2;
    // Lift the endpoint above the selected floor; a floor contact is expected.
    next.y += .18;
    if (ctx.world?.physics?.los && !ctx.world.physics.los(previous, next)) return false;
    previous = next;
  }
  return true;
}

export function driveSupportSpecial(ctx) {
  if (!IDS.has(ctx.special)) return false;
  const { actor, intent, state, memory } = ctx;
  if (!actor.grounded) { if (memory.holding) intent.sub = true; return true; }
  memory.supportClock = (memory.supportClock || 0) + ctx.dt;
  const native = actor._s3AllSpecialState;
  const shot = ctx.special === 'tripleInkstrike' ? native?.shots || 0 : 0;
  const pending = state && (state.phase === 'throw' || native?.throwAt !== undefined ||
    memory.releasedShot === shot);
  if (!pending && (!memory.point || memory.shot !== shot || memory.supportClock >= (memory.replanAt || 0))) {
    memory.point = choosePoint(ctx, !!state);
    memory.shot = shot; memory.replanAt = memory.supportClock + .25;
  }
  const point = memory.point;
  if (!point || !aimPlan(ctx, point)) { if (memory.holding) intent.sub = true; return true; }
  if (!state) {
    if (!actor.specialReady?.() || covered(ctx, point)) return true;
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
  memory.holdTime += ctx.dt;
  intent.sub = true;
  if (memory.holdTime < .12 || !ctx.isAimed(.1) ||
    ctx.special === 'tripleInkstrike' && (native?.t || 0) < (native?.nextMarkerStart || 0)) return true;
  // Do not recompute the target during the Actor's release windup.
  intent.sub = false; memory.holding = false; memory.releasedShot = shot;
  return true;
}
