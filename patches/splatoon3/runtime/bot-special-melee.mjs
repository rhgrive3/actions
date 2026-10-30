import { KRAKEN_MOVEMENT, reefsliderRawSpeed } from './all-specials.mjs';

// INKWAVE AI heuristics in world units. These decision ranges are not retail
// weapon statistics; the admitted Actor inputs retain all attack/physics owners.
const IDS = new Set(['krakenRoyale', 'ultraStamp', 'reefslider', 'tripleSplashdown', 'slam']);
const EPS = 1e-8;
const stop = ctx => ctx.move.set(0, 0, 0);
const seen = ctx => !!(ctx.enemy?.alive && ctx.enemy.team !== ctx.actor.team && ctx.visible);
const remaining = (ctx, st) => Number.isFinite(st?.duration) ? st.duration - st.t : Infinity;
function quiet(ctx) {
  const it = ctx.intent;
  it.fire = it.sub = it.jump = it.squid = it.special = false;
}
function aimEnemy(ctx, tolerance = .16) {
  ctx.aimAt(ctx.enemy.pos, { height: .7 });
  return ctx.isAimed(tolerance);
}
function rushPoint(ctx, direction, length) {
  return ctx.actor.pos.clone().addScaledVector(direction, length);
}
function safeRush(ctx, direction, length) {
  if (!direction || !Number.isFinite(length) || length <= 0) return false;
  const magnitude = Math.hypot(direction.x, direction.z);
  if (magnitude < .5 || !ctx.actor.grounded || ctx.actor.climbing) return false;
  // A rush cannot brake/steer around a missing deck. Probe the complete body
  // route, including its shoulders, before committing a charge or slide.
  const end = rushPoint(ctx, direction, length / magnitude);
  return ctx.safePath(end, Infinity, .65);
}
function facing(ctx) {
  return ctx.actor.pos.clone().set(Math.sin(ctx.actor.aimYaw || 0), 0, Math.cos(ctx.actor.aimYaw || 0));
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
  if (!st || st.phase === 'startup' || st.phase === 'finish' || st.t < 1 - EPS) return;
  if (st.phase === 'dash') return; // The native released dash owns its heading.
  const near = target && ctx.distance <= 2.5 && Math.abs(ctx.height) <= 2;
  const chargeTarget = target && ctx.distance >= 3 && ctx.distance <= 13 && Math.abs(ctx.height) <= .8;
  const enoughTime = remaining(ctx, st) > KRAKEN_MOVEMENT.chargeTime + KRAKEN_MOVEMENT.dashTime + .15;
  if (target) aimEnemy(ctx, .12);
  if (st.phase === 'charge') {
    const ready = st.chargeT + EPS >= KRAKEN_MOVEMENT.chargeTime;
    // Recheck the complete committed corridor at release, not every charge
    // frame. During charging the body moves only slowly; probe that local path.
    const clear = chargeTarget && ctx.isAimed(.12) && safeRush(ctx, facing(ctx), ready ? 12 : 1.5);
    // An early release cancels charging. A FULL charge releases a real dash:
    // hold it if the target died/disappeared or the route became unsafe.
    intent.fire = ready ? !(clear && remaining(ctx, st) > KRAKEN_MOVEMENT.dashTime + .15) : clear && enoughTime;
    return;
  }
  if (near && remaining(ctx, st) > .2) {
    hop(ctx, .28);
    if (ctx.distance > 1.8) ctx.moveToward(ctx.enemy.pos, .45);
  } else if (chargeTarget && enoughTime && ctx.isAimed(.12) && safeRush(ctx, facing(ctx), 12)) {
    intent.fire = true;
  } else if (target && Math.abs(ctx.height) <= 2 && ctx.distance > 2.5 && remaining(ctx, st) > 1.3) {
    ctx.moveToward(ctx.enemy.pos);
  }
  memory.meleeMode = near ? 'jump' : intent.fire ? 'charge' : 'approach';
}
// Match the existing UltraStamp source flight (51WU/s, +10.2Y, gravity
// 46.8WU/s², .97 horizontal retention per source frame). The low arc aims
// at the body after the native throw windup; it grants no projectile effects.
function aimStampThrow(ctx, state) {
  const { actor, enemy, memory } = ctx;
  const delay = state.throwAt === undefined ? .7 : Math.max(0, state.throwAt - state.t);
  let lead = delay + ctx.distance / 40, pitch = 0, valid = false;
  const point = memory.stampThrowPoint ||= actor.pos.clone();
  for (let pass = 0; pass < 2; pass++) {
    point.copy(enemy.pos);
    point.x += (enemy.vel?.x || 0) * lead; point.z += (enemy.vel?.z || 0) * lead;
    const distance = Math.hypot(point.x - actor.pos.x, point.z - actor.pos.z);
    let best = Infinity, flight = 0;
    for (let angle = -.8; angle <= .80001; angle += .015) {
      const factor = 1 - distance * .03 / (.85 * Math.cos(angle) * .97);
      if (!(factor > 0 && factor < 1)) continue;
      const frames = Math.log(factor) / Math.log(.97);
      if (frames > 108) continue;
      const y = actor.pos.y + 1.1 + (51 * Math.sin(angle) + 10.2) * frames / 60 - .013 * frames * (frames + 1) / 2;
      const error = Math.abs(y - (enemy.pos.y + .7));
      if (error < best) { best = error; pitch = angle; flight = frames / 60; }
    }
    valid = best < .7; lead = delay + flight;
    point.y = actor.pos.y + Math.tan(pitch) * distance;
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
    if (target && ctx.distance <= 14 && actor.grounded && aimEnemy(ctx, .2) && actor.specialReady?.()) activate(ctx);
    return;
  }
  stop(ctx);
  if (!st || st.t + EPS < 17 / 60) return;
  if (st.throwAt !== undefined) { if (target) aimStampThrow(ctx, st); return; }
  // Once the sub release has queued a throw the action owner keeps its 42F
  // startup. A second timer-driven pulse would only corrupt its held input.
  if (st.phase === 'throw') return;
  if (!target) {
    // Releasing a previously held throw would launch blindly. Keep holding
    // until a visible target returns or the normal special duration expires.
    if (memory.stampAimThrow) intent.sub = true;
    return;
  }
  const throwRange = ctx.distance >= 6 && ctx.distance <= 24 && Math.abs(ctx.height) <= 3;
  const shouldThrow = throwRange && (ctx.distance > 8 || remaining(ctx, st) < 1.35);
  const aimed = shouldThrow || memory.stampAimThrow || memory.stampReleased ? aimStampThrow(ctx, st) : aimEnemy(ctx, .2);
  if (memory.stampAimThrow) {
    if (aimed && throwRange) {
      // This off edge is the normal sub-release path, not a projectile call.
      intent.sub = false; memory.stampAimThrow = false; memory.stampReleased = true;
    } else intent.sub = true;
    return;
  }
  if (memory.stampReleased) return;
  if (shouldThrow && aimed) {
    intent.sub = true; memory.stampAimThrow = true; return;
  }
  if (!aimed) return;
  // The native jump swing's direct contact is only about 2.5WU ahead.
  // Close the remaining gap instead of hopping in place for 40-damage spray.
  if (ctx.distance <= 2.4 && Math.abs(ctx.height) <= 2.5) {
    intent.fire = true; hop(ctx, .6);
  } else if (ctx.distance <= 8 && Math.abs(ctx.height) <= 1 && safeRush(ctx, facing(ctx), 2.2)) {
    intent.fire = true;
    ctx.moveToward(ctx.enemy.pos);
  } else if (ctx.distance <= 14) ctx.moveToward(ctx.enemy.pos);
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
    ctx.aimAt(rushPoint(ctx, st.direction, 10), { height: 1.1 });
    return;
  }
  if (st.phase !== 'dash' || st.dashT + ctx.dt + EPS < 15 / 60) return;
  const brake = reefBrakeDistance(st.reefSpeedRaw || 0);
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
  ctx.memory.meleeHop = Math.max(0, (ctx.memory.meleeHop || 0) - ctx.dt);
  if (ctx.state) quiet(ctx);
  if (ctx.special === 'krakenRoyale') kraken(ctx);
  else if (ctx.special === 'ultraStamp') stamp(ctx);
  else if (ctx.special === 'reefslider') reef(ctx);
  else splashdown(ctx);
  return true;
}
