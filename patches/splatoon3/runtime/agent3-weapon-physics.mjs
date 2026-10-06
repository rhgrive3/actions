const INSTALL = Symbol.for('inkwave.agent3.weapon-physics.v1');
export const EPSILON = 1e-10;
let api = null;
let completion = null;

const clamp01 = value => Math.max(0, Math.min(1, value));

function hashUnit(seed, salt = 0) {
  const n = Number(seed);
  let x = Number.isFinite(n) ? Math.floor(Math.abs(n) * 0x100000000) >>> 0 : 0;
  x = (x ^ Math.imul((salt + 1) >>> 0, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

function inclusiveFrames(min, max, draw) {
  min = Math.max(0, Math.round(Number(min) || 0));
  max = Math.max(min, Math.round(Number(max) || min));
  return Math.min(max, min + Math.floor(draw * (max - min + 1)));
}

function sourceGravity(type) {
  if (Number.isFinite(type)) return type * 3600;
  const match = /^value_(\d+)_(\d+)$/.exec(String(type ?? ''));
  return match ? Number(`${match[1]}.${match[2]}`) * 3600 : 0;
}

function wallDropTrackPlan(move, paint, seed, salt, scale, spawn = null) {
  if (!move || !paint) return null;
  scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    firstFrames: inclusiveFrames(move.FallPeriodFirstFrameMin, move.FallPeriodFirstFrameMax, hashUnit(seed, salt)),
    secondFrames: Math.max(0, Number(move.FallPeriodSecondFrame) || 0),
    lastFrames: inclusiveFrames(move.FallPeriodLastFrameMin, move.FallPeriodLastFrameMax, hashUnit(seed, salt + 1)),
    firstSpeed: Math.max(0, Number(move.FallPeriodFirstTargetSpeed) || 0) * 60 * scale,
    secondSpeed: Math.max(0, Number(move.FallPeriodSecondTargetSpeed) || 0) * 60 * scale,
    gravity: Math.max(0, sourceGravity(move.FreeGravityType)) * scale,
    alpha: clamp01(Number(paint.FallPeriodFirstSecondTargetAlp ?? 1)),
    scale,
    paint: {
      shock: Math.max(0, Number(paint.PaintRadiusShock) || 0) * scale,
      fall: Math.max(0, Number(paint.PaintRadiusFall) || 0) * scale,
      ground: Math.max(0, Number(paint.PaintRadiusGround) || 0) * scale,
    },
    spawn: spawn ? { ...spawn } : null,
  };
}

export function slosherWallDropPlan(unit, order = 0, seed = 0, scale = 1) {
  if (!unit?.WallDropMoveParam || !unit?.WallDropCollisionPaintParam) return null;
  const main = wallDropTrackPlan(unit.WallDropMoveParam, unit.WallDropCollisionPaintParam, seed, 1, scale);
  const wallHits = [];
  const source = unit.SplashAndSplashWallHitSpawnPrm;
  for (const combination of source?.Combination || []) {
    if ((combination.OrderNum ?? -1) !== order) continue;
    const raw = source.SplashWallHitParam?.[combination.SplashWallHitArrayOrderNum];
    if (!raw) continue;
    const total = Math.max(0, Math.trunc(combination.TotalNum || 0));
    for (let i = 0; i < total; i++) {
      wallHits.push(wallDropTrackPlan(
        raw.WallDropMoveParam,
        raw.WallDropCollisionPaintParam,
        seed,
        100 + order * 17 + i,
        scale,
        { ...(raw.SpawnParam || {}), index: i, total },
      ));
    }
  }
  return { main, wallHits };
}

export function rollerBodyOverlap(fwd, lat, dy, horizontalSpeed, body, playerRadius, scale = 1) {
  scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const radius = Number(body?.Radius) * scale;
  const widthHalf = Number(body?.WidthHalf) * scale;
  const targetRadius = Number(playerRadius);
  if (![radius, widthHalf, targetRadius].every(Number.isFinite) || radius < 0 || widthHalf < radius || targetRadius < 0) return false;
  if (!(horizontalSpeed > 1 && fwd > -0.2 && fwd < 1.35 && Math.abs(dy) < 1.2)) return false;
  const coreHalf = widthHalf - radius;
  const lateralFromCore = Math.max(0, Math.abs(lat) - coreHalf);
  return lateralFromCore <= radius + targetRadius + EPSILON;
}

export function agent3RollerBodyContact(actor, target, horizontalSpeed) {
  const body = completion?.weapons?.roller?.BodyParam?.CollisionParam;
  if (!api || !body || !actor || !target) return false;
  const fx = Math.sin(actor.yaw);
  const fz = Math.cos(actor.yaw);
  const dx = target.pos.x - actor.pos.x;
  const dz = target.pos.z - actor.pos.z;
  const dy = target.pos.y - actor.pos.y;
  return rollerBodyOverlap(
    dx * fx + dz * fz,
    dx * fz - dz * fx,
    dy,
    horizontalSpeed,
    body,
    api.PLAYER.radius,
    completion.worldUnitsPerSourceUnit,
  );
}

function eligibleSlosherWallHit(hit) {
  if (!hit?.hit || Math.abs(hit.normal?.y ?? 1) >= 0.6) return false;
  const level = api?.G?.physics?.level;
  const block = Number.isInteger(hit.block) ? level?.blocks?.[hit.block] : null;
  if (block?.grate || block?.solid === false) return false;
  const face = Number.isInteger(hit.face) && hit.face >= 0 ? level?.faces?.[hit.face] : null;
  return face?.paintable !== false;
}

function makeWallDropTrack(p, hit, plan, salt, ordinal = 0, total = 1) {
  const normal = hit.normal.clone().normalize();
  const pos = hit.point.clone().addScaledVector(normal, 0.08);
  if (plan.spawn) {
    // The source gives XZ spacing, not a recovered full spawn transform. Keep the
    // configured spacing on the contacted wall plane and label that mapping here.
    const tangent = p.vel.clone().addScaledVector(normal, -p.vel.dot(normal));
    tangent.y = 0;
    if (tangent.lengthSq() < EPSILON) tangent.set(-normal.z, 0, normal.x);
    else tangent.normalize();
    const rank = Math.floor(ordinal / 2);
    const sign = total > 1 && ordinal % 2 ? -1 : 1;
    const distance = ((Number(plan.spawn.FirstDistance) || 0) + rank * (Number(plan.spawn.BetweenDistance) || 0)) *
      Math.max(0, Number(plan.spawn.DistanceXZRate) || 1) * plan.scale;
    pos.addScaledVector(tangent, sign * distance);
  }
  const incomingDown = Math.max(0, -(p.vel?.y || 0));
  return {
    plan,
    salt,
    pos,
    prev: pos.clone(),
    normal,
    frame: 0,
    speed: incomingDown * Math.max(0, Number(plan.spawn?.VelocityMinusYRate) || 0),
    paintCarry: 0,
    paintIndex: 0,
    done: false,
  };
}

function paintWallDrop(p, track, radius) {
  if (p.ghost || !(radius > 0)) return 0;
  const area = api.G.paint.splat(track.pos, radius, p.team, {
    seed: hashUnit(p.seed, track.salt * 4096 + track.paintIndex++),
    kind: 'drop',
  });
  if (Number.isFinite(area)) p.owner?.addTurf?.(area);
  return Number.isFinite(area) ? area : 0;
}

export function beginAgent3SlosherWallDrop(system, p, hit) {
  if (p.type !== 'slosh' || !p.fidelitySloshUnit || !eligibleSlosherWallHit(hit)) return false;
  const plan = slosherWallDropPlan(
    p.fidelitySloshUnit,
    p.fidelitySloshIndex || 0,
    p.seed,
    completion?.worldUnitsPerSourceUnit || 1,
  );
  if (!plan?.main) return false;
  const tracks = [makeWallDropTrack(p, hit, plan.main, 1)];
  for (let i = 0; i < plan.wallHits.length; i++) {
    tracks.push(makeWallDropTrack(p, hit, plan.wallHits[i], 100 + i, i, plan.wallHits.length));
  }
  p.agent3SlosherWallDrop = { tracks, main: tracks[0] };
  p.prev.copy(p.pos);
  p.pos.copy(tracks[0].pos);
  p.vel.set(0, 0, 0);
  p.trailEvery = 0;
  for (const track of tracks) paintWallDrop(p, track, track.plan.paint.shock);
  api.G.fx?.burst(hit.point, hit.normal, p.owner.color, { count: 5, speed: 3, size: 0.07, paint: false });
  api.emit?.('weapon:impact', {
    pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: 'drop', radius: plan.main.paint.shock, victim: null,
  });
  return true;
}

function stepTrack(system, p, track, dt) {
  let remaining = Math.max(0, dt);
  const firstEnd = track.plan.firstFrames;
  const secondEnd = firstEnd + track.plan.secondFrames;
  const totalEnd = secondEnd + track.plan.lastFrames;
  const hit = system._agent3WallDropHit || (system._agent3WallDropHit = new api.Hit());
  while (remaining > EPSILON && !track.done) {
    let phaseEnd;
    let target = 0;
    let gravity = 0;
    if (track.frame < firstEnd - EPSILON) {
      phaseEnd = firstEnd;
      target = track.plan.firstSpeed;
    } else if (track.frame < secondEnd - EPSILON) {
      phaseEnd = secondEnd;
      target = track.plan.secondSpeed;
    } else if (track.frame < totalEnd - EPSILON) {
      phaseEnd = totalEnd;
      gravity = track.plan.gravity;
    } else {
      track.done = true;
      break;
    }
    const slice = Math.min(remaining, Math.max(0, (phaseEnd - track.frame) / 60));
    if (slice <= EPSILON) {
      track.frame = phaseEnd;
      continue;
    }
    if (gravity > 0) {
      track.speed += gravity * slice;
    } else {
      const alpha = track.plan.alpha;
      const blend = alpha >= 1 - EPSILON ? 1 : 1 - Math.pow(1 - alpha, slice * 60);
      track.speed += (target - track.speed) * blend;
    }
    track.prev.copy(track.pos);
    track.pos.y -= Math.max(0, track.speed) * slice;
    const contact = api.G.physics.segment(track.prev, track.pos, hit, true);
    track.frame += slice * 60;
    remaining -= slice;
    if (contact.hit && contact.normal.y > 0.55) {
      track.pos.copy(contact.point).addScaledVector(contact.normal, 0.06);
      paintWallDrop(p, track, track.plan.paint.ground);
      track.done = true;
      break;
    }
    track.paintCarry += track.prev.distanceTo(track.pos);
    // Source supplies paint radii but not INKWAVE raster call spacing. Keep that
    // implementation detail proportional to the pinned fall radius.
    const spacing = Math.max(0.18 * track.plan.scale, track.plan.paint.fall * 0.45);
    while (track.paintCarry + EPSILON >= spacing) {
      track.paintCarry -= spacing;
      paintWallDrop(p, track, track.plan.paint.fall);
    }
  }
}

export function stepAgent3SlosherWallDrop(system, p, dt) {
  const state = p.agent3SlosherWallDrop;
  if (!state) return null;
  p.age += Math.max(0, dt);
  p.prev.copy(p.pos);
  for (const track of state.tracks) stepTrack(system, p, track, dt);
  p.pos.copy(state.main.pos);
  if (dt > EPSILON) p.vel.copy(p.pos).sub(p.prev).multiplyScalar(1 / dt);
  else p.vel.set(0, 0, 0);
  return state.tracks.every(track => track.done);
}

export function installAgent3WeaponPhysics(context, profile) {
  api = context;
  completion = profile?.weaponsFidelityCompletion;
  if (!completion || completion.schema !== 1) throw new Error('Missing completion source table');
  if (!Number.isFinite(completion.worldUnitsPerSourceUnit) || completion.worldUnitsPerSourceUnit <= 0) {
    throw new Error('Missing source-to-world scale');
  }
  const body = completion.weapons?.roller?.BodyParam?.CollisionParam;
  if (!body || ![body.Radius, body.WidthHalf].every(Number.isFinite) || body.Radius < 0 || body.WidthHalf < body.Radius) {
    throw new Error('Missing Roller body collision source');
  }
  const units = completion.weapons?.slosher?.UnitGroupParam?.Unit;
  if (!Array.isArray(units) || !units.every(unit => unit.WallDropMoveParam && unit.WallDropCollisionPaintParam)) {
    throw new Error('Missing Slosher wall-drop source');
  }
  const { Projectiles } = context;
  if (Object.hasOwn(Projectiles.prototype, INSTALL)) return;
  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true });
  const fresh = Projectiles.prototype._new;
  Projectiles.prototype._new = function (...args) {
    const p = fresh.apply(this, args);
    p.agent3SlosherWallDrop = null;
    return p;
  };
  const clear = Projectiles.prototype.clear;
  Projectiles.prototype.clear = function (...args) {
    const result = clear.apply(this, args);
    this._agent3WallDropHit = null;
    return result;
  };
}
