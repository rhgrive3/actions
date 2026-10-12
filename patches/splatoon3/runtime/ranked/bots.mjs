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
    onTower: !!actor._rankedOnTower,
    weight: actor.weapon?.weight || 'middle', swimming: actor.form === 'squid',
  };
}

function aimTarget(actor, goal) {
  const p = point(goal.aim) || point(goal.pos);
  // Ranked rule goals provide world-space aim points. Magnitude alone cannot
  // distinguish a point near the origin from a normalized direction vector.
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

function towerApproachPath(brain, target, engine, G, frame, jumpHeight) {
  const nav = G?.nav, actor = brain.a;
  if (!nav?.nodes?.length || typeof nav.nearest !== 'function' || typeof nav.path !== 'function') return false;
  const start = nav.nearest(actor.pos, 1.2);
  if (start < 0) return false;
  const halfSize = Math.max(0.8, finite(engine.stage?.tower?.halfSize, 1.4));
  const dx = actor.pos.x - target.x, dz = actor.pos.z - target.z;
  const radialLength = Math.hypot(dx, dz);
  let ux = radialLength > 0.1 ? dx / radialLength : 1;
  let uz = radialLength > 0.1 ? dz / radialLength : 0;
  const approachX = target.x + ux * (halfSize + 0.45);
  const approachZ = target.z + uz * (halfSize + 0.45);
  const lowY = target.y - jumpHeight - 0.2;
  let best = null;
  for (const id of nav.validIds || []) {
    const node = nav.nodes[id];
    const toDeck = Math.hypot(node.x - target.x, node.z - target.z);
    const height = target.y - node.y;
    // A static floor node just outside the moving deck is the last safe A* goal.
    // Its height must leave the deck reachable by the actor's real jump arc.
    if (toDeck < halfSize - 0.2 || toDeck > halfSize + 1.5 || node.y < lowY || height < -0.25) continue;
    const sideX = (node.x - target.x) / Math.max(toDeck, 1e-6);
    const sideZ = (node.z - target.z) / Math.max(toDeck, 1e-6);
    const jumpStart = [target.x + sideX * (halfSize + 0.45), target.y, target.z + sideZ * (halfSize + 0.45)];
    if (typeof frame?.blocked === 'function') {
      try {
        if (frame.blocked([node.x, node.y + 0.45, node.z], [jumpStart[0], jumpStart[1] + 0.45, jumpStart[2]]) === true) continue;
      } catch { continue; }
    }
    const path = nav.path(start, id, actor.team);
    if (!path) continue;
    let routeCost = 0;
    for (let i = 1; i < path.length; i++) {
      const edge = nav.nodes[path[i - 1]].nb.find(item => item.to === path[i]);
      routeCost += edge?.cost ?? 1;
    }
    const approachError = Math.hypot(node.x - approachX, node.z - approachZ);
    const score = routeCost + approachError * 1.5 + Math.abs(height - 0.45) * 0.2;
    if (!best || score < best.score) best = { path, node, score };
  }
  if (!best) return false;
  brain.path = best.path;
  brain.pi = Math.min(1, best.path.length - 1);
  brain.goal = best.node.id;
  brain.bestD = Infinity;
  brain.noProg = 0;
  brain._rankedApproachGoal = { x: target.x, y: target.y, z: target.z };
  brain._rankedApproachNode = best.node.id;
  return true;
}

function rainmakerBarrierApproach(brain, objective, shieldAim, frame, G) {
  const nav = G?.nav, actor = brain.a;
  if (!nav?.nodes?.length || typeof nav.nearest !== 'function' || typeof nav.path !== 'function') return null;
  const center = point(shieldAim) || objective;
  const target = [center.x, center.y + 1, center.z];
  const range = Math.max(5, finite(actor.weapon?.range, 12));
  const start = nav.nearest(actor.pos, 1.2);
  if (start < 0) return null;

  const candidates = [];
  for (const id of nav.validIds || []) {
    const node = nav.nodes[id];
    const distance = Math.hypot(node.x - center.x, node.z - center.z);
    // Keep a little room for projectile spread while staying inside this
    // weapon's actual reach. A point on the live nav graph avoids steering
    // through the raised center slab to a geometrically convenient point.
    if (distance < 1.9 || distance > range * 0.82) continue;
    const pitch = Math.atan2(center.y + 1 - (node.y + 1.1), distance);
    // Source-guided shooter rounds are unreliable at steep downward angles;
    // prefer a reachable level firing lane when the stage offers one.
    if (Math.abs(pitch) > 0.55) continue;
    if (typeof frame?.blocked === 'function') {
      try {
        if (frame.blocked([node.x, node.y + 1.1, node.z], target) === true) continue;
      } catch { continue; }
    }
    const travel = Math.hypot(node.x - actor.pos.x, node.z - actor.pos.z);
    // Favor a close, exposed firing position inside native weapon reach. A
    // shorter real projectile path reduces spread and flight error; route cost
    // still breaks ties between equally close reachable positions.
    const score = travel * 0.35 + distance * 5 + Math.abs(node.y - actor.pos.y) * 5;
    candidates.push({ node, score });
  }
  candidates.sort((a, b) => a.score - b.score);
  for (const { node } of candidates) {
    if (!nav.path(start, node.id, actor.team)) continue;
    return { x: node.x, y: node.y, z: node.z, node: node.id };
  }
  return null;
}

function steerRanked(brain, dt, goal, engine, frame, G, PLAYER) {
  const a = brain.a, it = a.intent;
  const objective = point(goal.pos);
  if (!objective) return false;
  const action = typeof goal.action === 'string' ? goal.action : 'paint';
  let target = objective;
  let aimGoal = goal;
  if (engine.mode === 'rainmaker' && action === 'barrier') {
    // Choose a reachable static firing position with real world line of sight.
    // The shortest radial point can sit behind the raised center slab, where
    // native projectiles correctly collide with geometry before reaching the
    // shield.
    if (!brain._rankedBarrierCenter || horizontalDistance(brain._rankedBarrierCenter, objective) > 0.8) {
      brain._rankedBarrierCenter = { ...objective };
      const shieldAim = point(goal.aim) || objective;
      brain._rankedBarrierApproach = rainmakerBarrierApproach(brain, objective, shieldAim, frame, G);
      if (!brain._rankedBarrierApproach) {
        // If the nav graph has no valid firing node, only use a short radial
        // fallback when native collision confirms that its shot ray is clear.
        const dx = a.pos.x - objective.x, dz = a.pos.z - objective.z;
        const radius = Math.hypot(dx, dz);
        const ux = radius > 0.1 ? dx / radius : Math.sin(a.yaw);
        const uz = radius > 0.1 ? dz / radius : Math.cos(a.yaw);
        const radial = { x: objective.x + ux * 3.2, y: objective.y, z: objective.z + uz * 3.2 };
        const aim = [shieldAim.x, shieldAim.y + 1, shieldAim.z];
        let clear = true;
        if (typeof frame?.blocked === 'function') {
          try { clear = frame.blocked([radial.x, radial.y + 1.1, radial.z], aim) !== true; }
          catch { clear = false; }
        }
        if (clear) brain._rankedBarrierApproach = radial;
      }
    }
    target = brain._rankedBarrierApproach || objective;
    const shieldAim = point(goal.aim) || objective;
    aimGoal = { ...goal, aim: { x: shieldAim.x, y: shieldAim.y + 1, z: shieldAim.z } };
  } else {
    brain._rankedBarrierCenter = null;
    brain._rankedBarrierApproach = null;
  }
  const dx = target.x - a.pos.x, dy = target.y - a.pos.y, dz = target.z - a.pos.z;
  const horizontal = Math.hypot(dx, dz);
  const key = `${action}:${target.x.toFixed(1)}:${target.y.toFixed(1)}:${target.z.toFixed(1)}`;
  brain._rankedPathRetry = Math.max(0, finite(brain._rankedPathRetry) - dt);
  const movedTarget = !brain._rankedGoalKey || horizontalDistance(brain._rankedGoalPos, target) > 1.1;
  const pathChanged = brain.path !== brain._rankedPathRef;
  const needPath = movedTarget || pathChanged || brain.repath <= 0 || (!brain.path && brain._rankedPathRetry <= 0) || brain.pi >= brain.path?.length;
  if (needPath && typeof brain._pathTo === 'function') {
    const jumpVelocity = finite(PLAYER?.jumpVel, 8.4);
    const gravity = Math.max(1, finite(PLAYER?.gravity, 25));
    const maxJumpHeight = jumpVelocity * jumpVelocity / (2 * gravity) + 0.22;
    const foundTowerApproach = engine.mode === 'tower' && action === 'ride'
      && towerApproachPath(brain, target, engine, G, frame, maxJumpHeight);
    // Only use the edge-target steering below after A* has selected a real
    // static nav node. If the nav mesh has no reachable node, keep the clear
    // short direct approach so a jump still carries the actor onto the deck.
    if (!foundTowerApproach) brain._rankedApproachNode = null;
    const maxUp = action === 'ride' ? 4.2 : 2.5;
    if (foundTowerApproach || brain._pathTo(target, maxUp)) {
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
  const pathFinished = !brain.path || brain.pi >= brain.path.length;
  let approachDx = dx, approachDz = dz, approachHorizontal = horizontal;
  if (engine.mode === 'tower' && action === 'ride' && pathFinished
    && Number.isInteger(brain._rankedApproachNode) && horizontal > 0.1) {
    const halfSize = Math.max(0.8, finite(engine.stage?.tower?.halfSize, 1.4));
    const ux = dx / horizontal, uz = dz / horizontal;
    const edgeX = target.x - ux * (halfSize + 0.45);
    const edgeZ = target.z - uz * (halfSize + 0.45);
    approachDx = edgeX - a.pos.x; approachDz = edgeZ - a.pos.z;
    approachHorizontal = Math.hypot(approachDx, approachDz);
    let clear = true;
    if (typeof frame?.blocked === 'function') {
      try { clear = frame.blocked([a.pos.x, a.pos.y + 0.45, a.pos.z], [edgeX, a.pos.y + 0.45, edgeZ]) !== true; }
      catch { clear = false; }
    }
    if (!clear) approachHorizontal = Infinity;
  }
  if (approachHorizontal > 0.8 && approachHorizontal < 12 && pathFinished) {
    let clear = true;
    if (engine.mode !== 'tower' && typeof frame?.blocked === 'function') {
      try { clear = frame.blocked([a.pos.x, a.pos.y, a.pos.z], [target.x, target.y, target.z]) !== true; }
      catch { clear = false; }
    }
    if (clear) move.set(approachDx / approachHorizontal, 0, approachDz / approachHorizontal);
  }
  const towerRide = engine.mode === 'tower' && action === 'ride';
  const towerPlatformAction = engine.mode === 'tower' && (action === 'ride' || action === 'defend');
  const row = frameActor(a, frame);
  const alreadyRiding = towerPlatformAction && a.grounded && (row.onTower === true
    || (horizontal < finite(engine.stage?.tower?.halfSize, 1.4) + 0.45
      && dy >= -0.32 && dy <= 0.28));
  if (alreadyRiding) move.set(0, 0, 0);

  const originalSpecial = !!it.special;
  const originalJump = !!it.jump;
  it.fire = ['paint', 'defend', 'barrier', 'carry'].includes(action) && finite(a.ink, 0) > 2;
  it.sub = false;
  it.special = originalSpecial;
  it.squid = a.groundTeam === 1 && horizontal > 3 && (!it.fire || action === 'carry');
  it.jump = originalJump;
  it.throw = false;

  let aim = aimTarget(a, aimGoal);
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
  if (towerRide && !alreadyRiding && a.grounded && dy > 0.25
    && horizontal <= finite(engine.stage?.tower?.halfSize, 1.4) + 1.35 && brain.jumpCd <= 0) {
    it.jump = true; brain.jumpCd = 0.65;
  }

  if (action === 'throw') {
    brain._rankedThrowCd = Math.max(0, finite(brain._rankedThrowCd) - dt);
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
  // Preserve the native aim spring: a throw must not leave the hand until its
  // actual smoothed ray is lined up with the rule-owned ballistic target.
  // Otherwise the cooldown starts on a miss even though the bot was turning.
  if (action === 'throw' && clamThrow?.reachable && brain._rankedThrowCd <= 0) {
    const actualYaw = Number.isFinite(brain.aimYaw) ? brain.aimYaw : wantYaw;
    const actualPitch = Number.isFinite(brain.aimPitch) ? brain.aimPitch : wantPitch;
    const yawError = Math.atan2(Math.sin(wantYaw - actualYaw), Math.cos(wantYaw - actualYaw));
    if (Math.abs(yawError) <= 0.05 && Math.abs(wantPitch - actualPitch) <= 0.05) {
      it.throw = true;
      brain._rankedThrowCd = 0.9;
    }
  }
  // Ranked objectives use a fixed six-unit eye ray in BotBrain's generic tail,
  // which can stop short of a Rainmaker shield that is farther away. Preserve
  // the native aim spring, but extend its smoothed ray to the actual target
  // distance so shooter flight and collision remain authoritative.
  if (engine.mode === 'rainmaker' && action === 'barrier' && aim) {
    const cp = Math.cos(a.aimPitch);
    a.aimPoint.set(a.pos.x + Math.sin(a.aimYaw) * cp * aimDist,
      a.pos.y + 1.1 + Math.sin(a.aimPitch) * aimDist,
      a.pos.z + Math.cos(a.aimYaw) * cp * aimDist);
  }
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
    // Ranked objective steering used to replace the native combat tail every
    // frame. That made nearby opponents invisible to the final action even
    // after BotBrain had acquired them, so every Rainmaker escort could keep
    // firing at the shield. Let the native combat controller own nearby,
    // genuinely visible duels and resume objective steering when they end.
    const enemy = this.target;
    const rankedEscort = engine.mode === 'rainmaker' && actor.slot % 2 === 1
      && ['barrier', 'defend'].includes(goal?.action)
      && engine.rule?.state?.carrier !== actorId(actor);
    if (rankedEscort && nativeTail && enemy?.alive && enemy.team !== actor.team && this.seeTimer > 0
      && Math.hypot(enemy.pos.x - actor.pos.x, enemy.pos.z - actor.pos.z) <= 16
      && typeof oldTail === 'function') {
      oldTail.apply(this, nativeTail);
      return result;
    }
    // Native perception and reaction timing still run; the final steering and
    // objective action then take ownership for this frame.
    if (!steerRanked(this, dt, goal, engine, frame, G, api.PLAYER) && nativeTail && typeof oldTail === 'function') oldTail.apply(this, nativeTail);
    return result;
  };
  return () => { proto.update = update; delete proto._rankedBotWrapped; };
}
