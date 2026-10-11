const RANKED_MODES = new Set(['zones', 'tower', 'rainmaker', 'clams']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const point = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite)
  ? { x: value[0], y: value[1], z: value[2] }
  : value && [value.x, value.y, value.z].every(Number.isFinite) ? { x: value.x, y: value.y, z: value.z } : null;
const actorId = actor => String(actor?.nid ?? `${actor?.team ?? 0}:${actor?.slot ?? 0}`);

function frameActor(actor, frame) {
  const id = actorId(actor);
  const found = (frame?.actors || []).find(row => row.id === id);
  const pos = actor?.pos;
  return found || {
    id, team: actor.team, slot: actor.slot,
    pos: pos ? [pos.x, pos.y, pos.z] : [0, 0, 0],
    alive: !!actor.alive, grounded: !!actor.grounded, remote: !!actor.remote,
    weight: actor.weapon?.weight || 'middle', swimming: actor.form === 'squid',
  };
}

function aimTarget(actor, goal) {
  const p = point(goal.aim) || point(goal.pos);
  if (!p) return null;
  // Rule goals use world points. Accept a normalized direction too, which is
  // useful for a future projectile objective that exposes only its shot ray.
  const mag = Math.hypot(p.x, p.y, p.z);
  if (goal.aim && mag > 0.75 && mag < 1.25 && Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 1) {
    return { x: actor.pos.x + p.x * 16, y: actor.pos.y + 1.1 + p.y * 16, z: actor.pos.z + p.z * 16 };
  }
  return p;
}

function clamThrowAim(actor, goal, engine) {
  const target = point(goal.pos);
  if (!target) return null;
  const dx = target.x - actor.pos.x, dz = target.z - actor.pos.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 0.05) return { point: target, reachable: true };
  const inventory = engine.rule?.state?.inventories?.[actorId(actor)];
  const speed = (inventory?.power ? 8.2 : 10.4) * 60 * 0.02;
  const targetY = target.y + (goal.pass ? 0.9 : 0.55);
  const height = targetY - (actor.pos.y + 1.15);
  let bestPitch = 0, bestError = Infinity;
  // The objective model applies a fixed loft to clam throws. Solve the
  // corresponding ballistic arc so the flight crosses the basket or pass
  // target instead of aiming along a level line.
  for (let step = 0; step <= 210; step++) {
    const pitch = -1.1 + step * 0.01;
    const cosine = Math.cos(pitch);
    if (cosine < 0.15) continue;
    const flight = horizontal / (speed * cosine);
    const y = speed * (Math.sin(pitch) + 0.42) * flight - 4.9 * flight * flight;
    const error = Math.abs(y - height);
    if (error < bestError) { bestPitch = pitch; bestError = error; }
  }
  const reach = inventory?.power ? 14 : 18;
  return {
    point: {
      x: actor.pos.x + dx,
      y: actor.pos.y + 1.1 + Math.tan(bestPitch) * horizontal,
      z: actor.pos.z + dz,
    },
    reachable: horizontal <= reach && bestError <= 1.55,
  };
}

function steerRanked(brain, dt, goal, engine, frame) {
  const a = brain.a, it = a.intent;
  const target = point(goal.pos);
  if (!target) return false;
  const action = typeof goal.action === 'string' ? goal.action : 'paint';
  const dx = target.x - a.pos.x, dy = target.y - a.pos.y, dz = target.z - a.pos.z;
  const horizontal = Math.hypot(dx, dz);
  const key = `${action}:${target.x.toFixed(1)}:${target.y.toFixed(1)}:${target.z.toFixed(1)}`;
  brain._rankedPathRetry = Math.max(0, finite(brain._rankedPathRetry) - dt);
  const movedTarget = !brain._rankedGoalKey || horizontalDistance(brain._rankedGoalPos, target) > 1.1;
  const pathChanged = brain.path !== brain._rankedPathRef;
  const needPath = movedTarget || pathChanged || brain.repath <= 0 || (!brain.path && brain._rankedPathRetry <= 0) || brain.pi >= brain.path?.length;
  if (needPath && typeof brain._pathTo === 'function') {
    const maxUp = action === 'ride' ? 4.2 : 2.5;
    if (brain._pathTo(target, maxUp)) {
      brain._rankedPathRef = brain.path;
      brain._rankedGoalKey = key;
      brain._rankedGoalPos = { ...target };
      brain.repath = action === 'ride' ? 0.45 : 0.7;
      brain._rankedPathRetry = 0;
    } else {
      brain._rankedPathRef = brain.path;
      brain._rankedGoalKey = key;
      brain._rankedGoalPos = { ...target };
      brain.repath = 0.35;
      brain._rankedPathRetry = 0.35;
    }
  }

  let move = typeof brain._steer === 'function' ? brain._steer(dt) : null;
  if (!move || typeof move.set !== 'function') return false;
  // A moving tower deck (and a few dropped objective objects) may not be a
  // node in the static navigation mesh. If replanning fails, walk the final
  // short approach directly when the world adapter confirms a clear segment.
  if (!brain.path && horizontal > 0.8 && horizontal < 12) {
    let clear = true;
    if (typeof frame?.blocked === 'function') {
      try { clear = frame.blocked([a.pos.x, a.pos.y, a.pos.z], [target.x, target.y, target.z]) !== true; }
      catch { clear = false; }
    }
    if (clear) move.set(dx / horizontal, 0, dz / horizontal);
  }
  const alreadyRiding = (action === 'ride' || action === 'defend')
    && horizontal < finite(engine.stage?.tower?.halfSize, 1.4) + 0.45
    && dy >= -3.5 && dy <= 0.25;
  if (alreadyRiding) move.set(0, 0, 0);

  const originalSpecial = !!it.special;
  const originalJump = !!it.jump;
  it.fire = ['paint', 'defend', 'barrier', 'carry'].includes(action) && finite(a.ink, 0) > 2;
  it.sub = false;
  it.special = originalSpecial;
  it.squid = a.groundTeam === 1 && horizontal > 3 && (!it.fire || action === 'carry');
  it.jump = originalJump;
  it.throw = false;

  let aim = aimTarget(a, goal);
  const clamThrow = action === 'throw' ? clamThrowAim(a, goal, engine) : null;
  if (clamThrow) aim = clamThrow.point;
  let wantYaw = horizontal > 0.25 ? Math.atan2(dx, dz) : a.yaw;
  let wantPitch = -0.18;
  let aimDist = 6;
  if (aim) {
    const ax = aim.x - a.pos.x, ay = aim.y - a.pos.y - 1.1, az = aim.z - a.pos.z;
    const flat = Math.hypot(ax, az);
    aimDist = Math.max(1, Math.hypot(flat, ay));
    wantYaw = Math.atan2(ax, az);
    wantPitch = Math.atan2(ay, flat);
  }

  // Hop onto the moving tower deck when the route reaches its side. The
  // normal path graph remains authoritative for safe approach and edge checks.
  if (action === 'ride' && !alreadyRiding && a.grounded && dy > 0.4 && horizontal < 2.8 && brain.jumpCd <= 0) {
    it.jump = true; brain.jumpCd = 0.65;
  }

  if (action === 'throw') {
    brain._rankedThrowCd = Math.max(0, finite(brain._rankedThrowCd) - dt);
    if (clamThrow?.reachable && brain._rankedThrowCd <= 0) {
      it.throw = true;
      brain._rankedThrowCd = 0.9;
    }
  } else brain._rankedThrowCd = 0;

  // Rainmaker fire charges while held and fires only on release. Cycle the
  // dedicated shot at full charge; a permanently held input never launches.
  const state = engine.rule?.state;
  const rainmakerCarrier = engine.mode === 'rainmaker' && state?.carrier === actorId(a);
  if (rainmakerCarrier) {
    it.fire = finite(state.charge?.seconds) < 1 && finite(a.ink, 0) > 2;
    if (brain.target?.alive && brain.target.team !== a.team && brain.seeTimer > 0) {
      const enemy = brain.target;
      const lead = 0.08;
      const y = enemy.pos.y + (enemy.smoothY || 0) + (enemy.form === 'squid' ? 0.3 : 0.85);
      const ex = enemy.pos.x + (enemy.vel?.x || 0) * lead;
      const ez = enemy.pos.z + (enemy.vel?.z || 0) * lead;
      aim = { x: ex, y, z: ez };
    }
    if (aim) {
      const ax = aim.x - a.pos.x, ay = aim.y - a.pos.y - 1.1, az = aim.z - a.pos.z;
      const flat = Math.hypot(ax, az);
      aimDist = Math.max(1, Math.hypot(flat, ay));
      wantYaw = Math.atan2(ax, az);
      wantPitch = Math.atan2(ay, flat);
    }
  }

  brain.mode = 'ranked';
  brain._bombAim = false;
  brain._releaseBomb = false;
  brain._tail(dt, move, wantYaw, wantPitch, aimDist, move.lengthSq() > 0.01);
  return true;
}

function horizontalDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function installRankedBots(api = {}) {
  const { G, BotBrain } = api;
  const proto = BotBrain?.prototype;
  if (!proto || proto._rankedBotWrapped) return () => {};
  Object.defineProperty(proto, '_rankedBotWrapped', { value: true });
  const update = proto.update;
  proto.update = function (dt) {
    const match = G?.match, engine = match?.ranked, actor = this.a;
    if (!engine || !RANKED_MODES.has(engine.mode) || !actor?.alive || actor.superJumpState
      || (typeof match.playing === 'function' && !match.playing())) return update.call(this, dt);

    let nativeTail = null;
    const hadOwnTail = Object.prototype.hasOwnProperty.call(this, '_tail');
    const oldTail = this._tail;
    this._tail = (...args) => { nativeTail = args; };
    let result;
    try { result = update.call(this, dt); }
    finally { if (hadOwnTail) this._tail = oldTail; else delete this._tail; }

    const frame = engine.frame || { actors: [], inputs: {} };
    const goal = engine.rule?.botGoal?.(frameActor(actor, frame), frame);
    if (!goal) {
      if (nativeTail && typeof oldTail === 'function') oldTail.apply(this, nativeTail);
      return result;
    }
    // Native perception and reaction timing still run; the final steering and
    // objective action then take ownership for this frame.
    if (!steerRanked(this, dt, goal, engine, frame) && nativeTail && typeof oldTail === 'function') oldTail.apply(this, nativeTail);
    return result;
  };
  return () => { proto.update = update; delete proto._rankedBotWrapped; };
}
