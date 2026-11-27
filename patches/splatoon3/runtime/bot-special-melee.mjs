import { captureNav, followNav, strafe, noteSighting, recentSighting } from './bot-special-movement.mjs';
import { KRAKEN_MOVEMENT, reefsliderRawSpeed } from './all-specials.mjs';

// INKWAVE AI heuristics in world units. These decision ranges are not retail
// weapon statistics; the admitted Actor inputs retain all attack/physics owners.
const IDS = new Set(['krakenRoyale', 'ultraStamp', 'reefslider', 'tripleSplashdown', 'slam']);
const EPS = 1e-8;
const LOG_097 = Math.log(.97);
const CACHE_TTL = 0.08;
const CACHE_POS_SQ = 0.35 * 0.35;
const _rushEnd = { x: 0, y: 0, z: 0 };
const _facing = { x: 0, y: 0, z: 0 };
const stop = ctx => ctx.move?.set?.(0, 0, 0);
const seen = ctx => !!(ctx.enemy?.alive && ctx.enemy.team !== ctx.actor.team && ctx.visible);
const finiteDir = d => !!d && Number.isFinite(d.x) && Number.isFinite(d.z);
const remaining = (ctx, st) => Number.isFinite(st?.duration) && Number.isFinite(st?.t) ? st.duration - st.t : Infinity;
function quiet(ctx) {
  const it = ctx.intent;
  it.fire = it.sub = it.jump = it.squid = it.special = false;
}
function aimEnemy(ctx, tolerance = .16) {
  if (!ctx.enemy?.pos) return false;
  ctx.aimAt(ctx.enemy.pos, { height: .7 });
  return ctx.isAimed(tolerance);
}
function rushPoint(ctx, direction, length) {
  const pos = ctx.actor.pos;
  const dy = Number.isFinite(direction.y) ? direction.y : 0;
  _rushEnd.x = pos.x + direction.x * length;
  _rushEnd.y = pos.y + dy * length;
  _rushEnd.z = pos.z + direction.z * length;
  return _rushEnd;
}
function safeRush(ctx, direction, length) {
  if (!finiteDir(direction) || !Number.isFinite(length) || length <= 0) return false;
  const magnitude = Math.hypot(direction.x, direction.z);
  if (!Number.isFinite(magnitude) || magnitude < .5 || !ctx.actor.grounded || ctx.actor.climbing) return false;
  // A rush cannot brake/steer around a missing deck. Probe the complete body
  // route, including its shoulders, before committing a charge or slide.
  const end = rushPoint(ctx, direction, length / magnitude);
  return ctx.safePath(end, Infinity, .65);
}
function facing(ctx) {
  const yaw = Number.isFinite(ctx.actor.aimYaw) ? ctx.actor.aimYaw : (Number.isFinite(ctx.actor.yaw) ? ctx.actor.yaw : 0);
  _facing.x = Math.sin(yaw);
  _facing.y = 0;
  _facing.z = Math.cos(yaw);
  return _facing;
}
// No visible target: chase the last-seen point briefly, then keep moving on
// the brain's own navigation (objective / ink) instead of idling in place.
function roam(ctx, scale = 1) {
  const point = recentSighting(ctx, 2.5);
  if (point && Math.hypot(point.x - ctx.actor.pos.x, point.z - ctx.actor.pos.z) > 1.5 &&
      Math.abs(point.y - ctx.actor.pos.y) <= 2 && ctx.moveToward(point, scale)) {
    ctx.aimAt(point, { height: .7 });
    return true;
  }
  return !!followNav(ctx, scale);
}
function activate(ctx) {
  quiet(ctx); stop(ctx); ctx.intent.special = true;
}
function hop(ctx, cooldown) {
  if (!ctx.actor.grounded || ctx.actor.climbing || ctx.memory.meleeHop > 0) return false;
  if (ctx.brain?._nearWater?.(ctx.actor, 1.2)) return false;
  ctx.intent.jump = true;
  ctx.memory.meleeHop = cooldown;
  return true;
}
function kraken(ctx) {
  const { actor, intent, memory } = ctx;
  const st = actor._s3AllSpecialState;
  const target = seen(ctx);
  if (!ctx.state) {
    if (!target || ctx.distance > 13 || Math.abs(ctx.height) > 2 || !actor.grounded) return;
    if (!aimEnemy(ctx) || !actor.specialReady?.()) return;
    if (ctx.distance > 2.5 && (Math.abs(ctx.height) > .8 || !safeRush(ctx, facing(ctx), 12))) return;
    if (ctx.distance <= 2.5 && ctx.brain?._nearWater?.(actor, 1.2)) return;
    activate(ctx); return;
  }
  stop(ctx);
  if (!st || st.phase === 'startup' || st.phase === 'finish' || !Number.isFinite(st.t) || st.t < 1 - EPS) return;
  if (st.phase === 'dash') { memory.krakenHoldLost = 0; return; } // The native released dash owns its heading.
  const near = target && ctx.distance <= 2.5 && Math.abs(ctx.height) <= 2;
  const chargeTarget = target && ctx.distance >= 3 && ctx.distance <= 13 && Math.abs(ctx.height) <= .8;
  const enoughTime = remaining(ctx, st) > KRAKEN_MOVEMENT.chargeTime + KRAKEN_MOVEMENT.dashTime + .15;
  if (target) aimEnemy(ctx, .12);
  if (st.phase === 'charge') {
    const ready = Number.isFinite(st.chargeT) && st.chargeT + EPS >= KRAKEN_MOVEMENT.chargeTime;
    // Recheck the complete committed corridor at release, not every charge
    // frame. During charging the body moves only slowly; probe that local path.
    const clear = chargeTarget && ctx.isAimed(.12) && safeRush(ctx, facing(ctx), ready ? 12 : 1.5);
    if (!ready) {
      memory.krakenHoldLost = 0;
      intent.fire = clear && enoughTime;
      return;
    }
    if (clear && remaining(ctx, st) > KRAKEN_MOVEMENT.dashTime + .15) {
      memory.krakenHoldLost = 0;
      intent.fire = false;
      return;
    }
    // Hold briefly (0.65s) so a momentary target loss does not trigger a blind
    // dash, then break out of the charge-hold freeze by dashing safely or roaming.
    memory.krakenHoldLost = (Number.isFinite(memory.krakenHoldLost) ? memory.krakenHoldLost : 0) + ctx.dt;
    const rushSafe = safeRush(ctx, facing(ctx), 12);
    if (memory.krakenHoldLost < .65 && !(near && !rushSafe)) {
      intent.fire = true;
      return;
    }
    if (rushSafe && remaining(ctx, st) > KRAKEN_MOVEMENT.dashTime + .15) {
      memory.krakenHoldLost = 0;
      intent.fire = false;
    } else {
      intent.fire = true;
      if (target) { if (!ctx.moveToward(ctx.enemy.pos, .7)) strafe(ctx, ctx.enemy.pos, .7); }
      else roam(ctx, .7);
    }
    return;
  }
  memory.krakenHoldLost = 0;
  if (near && remaining(ctx, st) > .2) {
    hop(ctx, .28);
    if (ctx.distance > 1.8) ctx.moveToward(ctx.enemy.pos, .45);
  } else if (chargeTarget && enoughTime && ctx.isAimed(.12) && safeRush(ctx, facing(ctx), 12)) {
    intent.fire = true;
  } else if (target && ctx.distance > 2.5) {
    if (!ctx.moveToward(ctx.enemy.pos) && !strafe(ctx, ctx.enemy.pos)) roam(ctx);
  } else if (!target) {
    // A Kraken that sits motionless for its whole duration is the most
    // unnatural possible use; keep swimming toward the fight.
    roam(ctx);
  }
  memory.meleeMode = near ? 'jump' : intent.fire ? 'charge' : target ? 'approach' : 'roam';
}
// Match the existing UltraStamp source flight (51WU/s, +10.2Y, gravity
// 46.8WU/s², .97 horizontal retention per source frame). The low arc aims
// at the body after the native throw windup; it grants no projectile effects.
function aimStampThrow(ctx, state) {
  const { actor, enemy, memory, world } = ctx;
  if (!enemy?.pos) return false;
  const hasThrowAt = Number.isFinite(state?.throwAt) && Number.isFinite(state?.t);
  const delay = hasThrowAt ? Math.max(0, state.throwAt - state.t) : .7;
  const vx = Number.isFinite(enemy.vel?.x) ? enemy.vel.x : 0;
  const vz = Number.isFinite(enemy.vel?.z) ? enemy.vel.z : 0;
  const point = memory.stampThrowPoint ||= { x: 0, y: 0, z: 0 };
  const now = Number.isFinite(ctx.time) ? ctx.time : (Number.isFinite(world?.match?.time) ? world.match.time : NaN);
  const level = world?.level || null;
  const physics = world?.physics || null;
  const ap = actor.pos, ep = enemy.pos;
  let cache = memory._stampThrowCache;
  if (
    cache &&
    Number.isFinite(now) &&
    now >= cache.t &&
    now - cache.t < CACHE_TTL &&
    cache.enemy === enemy &&
    cache.level === level &&
    cache.physics === physics &&
    cache.hasThrowAt === hasThrowAt &&
    Math.abs(delay - cache.delay) <= 0.04 &&
    Math.abs(vx - cache.vx) <= 0.35 &&
    Math.abs(vz - cache.vz) <= 0.35
  ) {
    const adx = ap.x - cache.ax, ady = ap.y - cache.ay, adz = ap.z - cache.az;
    const edx = ep.x - cache.ex, edy = ep.y - cache.ey, edz = ep.z - cache.ez;
    if (adx * adx + ady * ady + adz * adz <= CACHE_POS_SQ && edx * edx + edy * edy + edz * edz <= CACHE_POS_SQ) {
      point.x = cache.x;
      point.y = cache.y;
      point.z = cache.z;
      ctx.aimAt(point);
      return cache.valid && ctx.isAimed(.065);
    }
  }
  let lead = delay + (Number.isFinite(ctx.distance) ? ctx.distance : 0) / 40, pitch = 0, valid = false;
  for (let pass = 0; pass < 2; pass++) {
    point.x = ep.x + vx * lead;
    point.y = ep.y;
    point.z = ep.z + vz * lead;
    const distance = Math.hypot(point.x - ap.x, point.z - ap.z);
    let best = Infinity, flight = 0;
    for (let angle = -.8; angle <= .80001; angle += .015) {
      const factor = 1 - distance * .03 / (.85 * Math.cos(angle) * .97);
      if (!(factor > 0 && factor < 1)) continue;
      const frames = Math.log(factor) / LOG_097;
      if (frames > 108) continue;
      const y = ap.y + 1.1 + (51 * Math.sin(angle) + 10.2) * frames / 60 - .013 * frames * (frames + 1) / 2;
      const error = Math.abs(y - (ep.y + .7));
      if (error < best) { best = error; pitch = angle; flight = frames / 60; }
    }
    valid = best < .7; lead = delay + flight;
    point.y = ap.y + Math.tan(pitch) * distance;
  }
  if (Number.isFinite(now)) {
    if (!cache) cache = memory._stampThrowCache = {};
    cache.t = now; cache.level = level; cache.physics = physics; cache.enemy = enemy;
    cache.ax = ap.x; cache.ay = ap.y; cache.az = ap.z;
    cache.ex = ep.x; cache.ey = ep.y; cache.ez = ep.z;
    cache.vx = vx; cache.vz = vz; cache.hasThrowAt = hasThrowAt; cache.delay = delay;
    cache.valid = valid; cache.x = point.x; cache.y = point.y; cache.z = point.z;
  }
  // Native aimDirection subtracts the feet, while BotBrain constructs its
  // aimPoint from the eye. Request the actual emitter-basis point unchanged.
  ctx.aimAt(point);
  return valid && ctx.isAimed(.065);
}
function stamp(ctx) {
  const { actor, intent, memory } = ctx;
  const st = actor._s3AllSpecialState;
  const target = seen(ctx) && Math.abs(ctx.height) <= 3;
  if (!ctx.state) {
    // Ultra Stamp is a close-range push: activate when the hammer can reach
    // the target on foot, not at throwing range (the bot then only threw).
    if (target && ctx.distance <= 9 && Math.abs(ctx.height) <= 1.2 && actor.grounded &&
        safeRush(ctx, facing(ctx), Math.min(ctx.distance, 4)) && aimEnemy(ctx, .2) && actor.specialReady?.()) activate(ctx);
    return;
  }
  stop(ctx);
  if (!st || !Number.isFinite(st.t) || st.t + EPS < 17 / 60) return;
  if (st.throwAt !== undefined) { if (target) aimStampThrow(ctx, st); return; }
  // Once the sub release has queued a throw the action owner keeps its 42F
  // startup. A second timer-driven pulse would only corrupt its held input.
  if (st.phase === 'throw') return;
  if (memory.stampReleased && st.t > (memory.stampReleasedAt ?? -Infinity) + EPS) {
    memory.stampReleased = false;
  }
  if (!target) {
    // Releasing a previously held throw would launch blindly. Keep holding
    // while roaming until a visible target returns or the hold timeout expires.
    if (memory.stampAimThrow) {
      memory.stampAimHoldT = (Number.isFinite(memory.stampAimHoldT) ? memory.stampAimHoldT : 0) + ctx.dt;
      if (memory.stampAimHoldT >= 1.5) {
        intent.sub = false; memory.stampAimThrow = false; memory.stampAimHoldT = 0;
        memory.stampReleased = true; memory.stampReleasedAt = st.t;
        return;
      }
      intent.sub = true; roam(ctx, .6); return;
    }
    // Keep stamping forward on the way back to the fight instead of
    // standing still with the hammer raised.
    if (roam(ctx)) intent.fire = true;
    return;
  }
  const throwRange = ctx.distance >= 3 && ctx.distance <= 24 && Math.abs(ctx.height) <= 3;
  // Throwing ends the special. Prefer the hammer: throw only when time is
  // nearly up or the target cannot be reached on foot (height / blocked path).
  const reachable = Math.abs(ctx.height) <= 1 && safeRush(ctx, facing(ctx), Math.min(ctx.distance, 6));
  const shouldThrow = throwRange && (remaining(ctx, st) < 1.35 || (!reachable && ctx.distance > 4));
  const aimed = shouldThrow || memory.stampAimThrow || memory.stampReleased ? aimStampThrow(ctx, st) : aimEnemy(ctx, .2);
  if (memory.stampAimThrow) {
    memory.stampAimHoldT = (Number.isFinite(memory.stampAimHoldT) ? memory.stampAimHoldT : 0) + ctx.dt;
    if ((aimed && throwRange) || memory.stampAimHoldT >= 1.2) {
      // This off edge is the normal sub-release path, not a projectile call.
      intent.sub = false; memory.stampAimThrow = false; memory.stampAimHoldT = 0; memory.stampReleased = true;
      memory.stampReleasedAt = st.t;
    } else {
      intent.sub = true;
      if (ctx.distance > 24) ctx.moveToward(ctx.enemy.pos, .6);
      else if (ctx.distance < 3 && !ctx.moveToward(ctx.enemy.pos, -.6)) strafe(ctx, ctx.enemy.pos, .6);
      else if (!strafe(ctx, ctx.enemy.pos, .55)) roam(ctx, .5);
    }
    return;
  }
  memory.stampAimHoldT = 0;
  if (memory.stampReleased) return;
  if (shouldThrow && aimed) {
    intent.sub = true; memory.stampAimThrow = true; memory.stampAimHoldT = 0; return;
  }
  if (!aimed) return;
  // The native jump swing's direct contact is only about 2.5WU ahead.
  // Close the remaining gap instead of hopping in place for 40-damage spray.
  if (ctx.distance <= 2.4 && Math.abs(ctx.height) <= 2.5) {
    intent.fire = true; hop(ctx, .6);
  } else if (Math.abs(ctx.height) <= 1 && safeRush(ctx, facing(ctx), 2.2)) {
    // Stamp toward the target: the stamping itself carries the bot forward.
    intent.fire = true;
    ctx.moveToward(ctx.enemy.pos);
  } else if (!ctx.moveToward(ctx.enemy.pos)) {
    intent.fire = true; strafe(ctx, ctx.enemy.pos, .8);
  }
}
function reefBrakeDistance(raw) {
  let distance = 0;
  for (let i = 0; i < 16 && raw > 0; i++) { raw = reefsliderRawSpeed(raw, true); distance += raw; }
  return distance;
}
function reef(ctx) {
  const { actor, intent } = ctx;
  const st = actor._s3AllSpecialState;
  const target = seen(ctx) && Math.abs(ctx.height) <= 2;
  if (!ctx.state) {
    if (!target || ctx.distance < 6 || ctx.distance > 22 || !actor.grounded || !actor.specialReady?.()) return;
    if (!aimEnemy(ctx, .1)) return;
    // The first 15F cannot be cancelled, and braking continues to advance.
    // Reserve the minimum stopping route even against a very close target.
    if (safeRush(ctx, facing(ctx), Math.max(8, ctx.distance - 1))) activate(ctx);
    return;
  }
  stop(ctx);
  if (!st || st.phase === 'recovery' || st.phase === 'brake') return;
  if (st.phase === 'startup') {
    // Startup aim remains controllable; keep the committed safe rail rather
    // than inheriting the main weapon's paint sweep or last-seen enemy aim.
    if (finiteDir(st.direction)) ctx.aimAt(rushPoint(ctx, st.direction, 10), { height: 1.1 });
    return;
  }
  if (st.phase !== 'dash' || !Number.isFinite(st.dashT) || st.dashT + ctx.dt + EPS < 15 / 60) return;
  if (!finiteDir(st.direction)) { intent.fire = true; return; }
  const brake = reefBrakeDistance(Number.isFinite(st.reefSpeedRaw) ? st.reefSpeedRaw : 0);
  const dx = target ? ctx.enemy.pos.x - actor.pos.x : 0;
  const dz = target ? ctx.enemy.pos.z - actor.pos.z : 0;
  const ahead = dx * st.direction.x + dz * st.direction.z;
  const across = Math.abs(dx * st.direction.z - dz * st.direction.x);
  // Release was false throughout startup, so this is a real fire-down edge.
  // Stop early when the target is lost, passed, leaving the rail, or the
  // remaining braking route approaches an edge/wall. Native 15F gate applies.
  if (!target || across > 7 || ahead <= brake + 4 || !safeRush(ctx, st.direction, brake + 2)) intent.fire = true;
}
function splashdown(ctx) {
  if (ctx.state) { stop(ctx); return; }
  const legacy = ctx.special === 'slam';
  if (!seen(ctx) || ctx.distance > (legacy ? 4.5 : 8) || Math.abs(ctx.height) > (legacy ? 2 : 3)) return;
  if (!ctx.actor.grounded || !ctx.actor.specialReady?.()) return;
  // The two fists are placed in the activation camera's forward direction.
  if (aimEnemy(ctx, .16)) activate(ctx);
}
export function driveMeleeSpecial(ctx) {
  if (!IDS.has(ctx.special)) return false;
  ctx.memory.meleeHop = Math.max(0, (Number.isFinite(ctx.memory.meleeHop) ? ctx.memory.meleeHop : 0) - ctx.dt);
  captureNav(ctx);
  if (ctx.state) quiet(ctx);
  noteSighting(ctx);
  if (ctx.special === 'krakenRoyale') kraken(ctx);
  else if (ctx.special === 'ultraStamp') stamp(ctx);
  else if (ctx.special === 'reefslider') reef(ctx);
  else splashdown(ctx);
  return true;
}
