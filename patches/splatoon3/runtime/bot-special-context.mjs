// INKWAVE policy helpers. Recognition, terrain and the admitted Actor inputs
// stay authoritative; this module never starts an effect or spends/refills ink.
const memories = new WeakMap();
const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const angleDifference = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

export function resetBotSpecialMemory(actor) {
  if (actor) memories.delete(actor);
}

function bossEnemy(actor, target, brain, world) {
  const boss = world?.boss;
  if (!boss || boss.dead || target !== brain?.bTgt || target?.los !== true) return null;
  let pos;
  if (target.crab) {
    // A recycled perception record must not keep a dead/removed crablet alive.
    if (target.crab.dead || !boss.crabs?.values) return null;
    const crabs=boss.crabs, crab=target.crab, id=Object.getOwnPropertyDescriptor(crab,'id');
    // A native Map hit proves identity membership. A mismatched key or custom
    // collection still takes the original values path; never trust ID alone.
    const found=crabs instanceof Map && crabs.get===Map.prototype.get && id && Object.hasOwn(id,'value') && crabs.get(id.value)===crab;
    if(!found&&!Array.from(crabs.values()).includes(crab))return null;
    pos = { x: target.crab.x, y: target.crab.y + 0.35, z: target.crab.z };
  } else {
    if (!boss.visible || !target.shape?.active || !boss.model?.hitShapes?.includes(target.shape)) return null;
    pos = target.shape.pos;
  }
  return finitePoint(pos) ? { alive: true, team: 1 - actor.team, pos, vel: { x: 0, y: 0, z: 0 }, botBossTarget: target } : null;
}

// The internal inactive path needs validation and memory lifecycle only. Reuse
// the existing entry so an uncharged tick does not allocate a context snapshot.
export function prepareBotSpecialFrame(actor, intent, dt) {
  if (!actor?.alive || actor.remote || actor.isLocal || actor.isBot === false || !finitePoint(actor.pos)
    || !intent || !Number.isFinite(dt) || dt <= 0) {
    if (actor && !actor.alive) resetBotSpecialMemory(actor);
    return null;
  }
  const state = actor.specialActive || null;
  const special = actor.weapon?.special;
  let entry = memories.get(actor);
  if (!entry || entry.state !== state || entry.weapon !== actor.weapon || entry.weaponId !== actor.weaponId
    || entry.special !== special || entry.life !== actor.netLife) {
    entry = { state, weapon: actor.weapon, weaponId: actor.weaponId, special, life: actor.netLife,
      memory: { time: 0 } };
    memories.set(actor, entry);
  }
  const memory = entry.memory;
  if (state) memory.time += dt;
  else memory.time = 0;
  return entry;
}

function beginBotSpecialContext(actor, intent, dt, options, prepared) {
  const entry = prepared || prepareBotSpecialFrame(actor, intent, dt);
  if (!entry) return null;
  const { brain, world, move = intent.move } = options;
  const { special, state, memory } = entry;
  return { actor, intent, dt, special, state, memory, enemy: null, distance: Infinity, height: Infinity, visible: false,
    world, brain, move, handled: false, aimChanged: false,
    normalIntent: { fire: !!intent.fire, sub: !!intent.sub, jump: !!intent.jump, squid: !!intent.squid, booyah: !!intent.booyah },
    wantYaw: 0, wantPitch: 0, aimDistance: 0 };
}

// Internal dispatcher phase: validate and advance memory every tick, even when
// no special can be planned. Ordinary combat only consumes the control fields.
export function createBotSpecialFrame(actor, intent, dt, options = {}, prepared) {
  const ctx = beginBotSpecialContext(actor, intent, dt, options, prepared);
  if (!ctx) return null;
  const { brain } = ctx;
  const actualYaw = finite(brain?.aimYaw, finite(actor.aimYaw, actor.yaw));
  const actualPitch = finite(brain?.aimPitch, finite(actor.aimPitch));
  ctx.wantYaw = finite(options.wantYaw, actualYaw);
  ctx.wantPitch = finite(options.wantPitch, actualPitch);
  ctx.aimDistance = Math.max(0.1, finite(options.aimDistance, 6));
  return ctx;
}

// Only the internal dispatcher defers this phase. The public constructor below
// still returns the complete, current-tick perception and action helpers.
export function completeBotSpecialContext(ctx, target, options = {}) {
  const { actor, state, world, brain, move, special } = ctx;

  let enemy = target?.alive && target.team !== actor.team && finitePoint(target.pos) ? target : bossEnemy(actor, target, brain, world);
  const recognized = enemy?.botBossTarget ? true : brain && brain.target === target && brain.seeTimer > 0;
  const eye = { x: actor.pos.x, y: actor.pos.y + 1.1, z: actor.pos.z };
  let visible = false;
  if (enemy && recognized && typeof world?.physics?.los === 'function') {
    const ep = enemy.pos;
    const targetEye = { x: ep.x, y: ep.y + (enemy.botBossTarget ? 0 : enemy.form === 'squid' ? 0.3 : 0.85), z: ep.z };
    visible = world.physics.los(eye, targetEye) === true;
  }
  // Do not expose a live position after recognition or line of sight is lost.
  if (!visible) enemy = null;
  const distance = enemy ? Math.hypot(enemy.pos.x - actor.pos.x, enemy.pos.z - actor.pos.z) : Infinity;
  const height = enemy ? enemy.pos.y - actor.pos.y : Infinity;
  // Native combat computes its desired look from the remembered Actor even
  // after LOS is lost. An active special must not inherit that live position;
  // hold the actual look unless its policy chooses a last-seen or world point.
  const holdLook = !!state && !visible;
  const actualYaw = finite(brain?.aimYaw, finite(actor.aimYaw, actor.yaw));
  const actualPitch = finite(brain?.aimPitch, finite(actor.aimPitch));
  const previousDistance = finitePoint(actor.aimPoint) ? Math.hypot(actor.aimPoint.x - eye.x,
    actor.aimPoint.y - eye.y, actor.aimPoint.z - eye.z) : 6;
  ctx.enemy = enemy; ctx.distance = distance; ctx.height = height; ctx.visible = visible;
  ctx.wantYaw = holdLook ? actualYaw : finite(options.wantYaw, actualYaw);
  ctx.wantPitch = holdLook ? actualPitch : finite(options.wantPitch, actualPitch);
  ctx.aimDistance = Math.max(0.1, holdLook ? previousDistance : finite(options.aimDistance, 6));

  ctx.aimAt = (point, { height: lift = 0, lead = 0 } = {}) => {
    if (!finitePoint(point)) return false;
    const velocity = point === enemy?.pos ? enemy.vel : null;
    const ahead = Math.max(0, Math.min(2, finite(lead)));
    const dx = point.x + finite(velocity?.x) * ahead - eye.x;
    const dy = point.y + finite(lift) + finite(velocity?.y) * ahead - eye.y;
    const dz = point.z + finite(velocity?.z) * ahead - eye.z;
    ctx.wantYaw = Math.atan2(dx, dz);
    ctx.wantPitch = Math.max(-1.1, Math.min(1, Math.atan2(dy, Math.hypot(dx, dz))));
    ctx.aimDistance = Math.max(0.1, Math.hypot(dx, dy, dz));
    ctx.aimChanged = true;
    return true;
  };
  ctx.isAimed = (tolerance = 0.13) => {
    const yaw = finite(brain?.aimYaw, finite(actor.aimYaw, actor.yaw));
    const pitch = finite(brain?.aimPitch, finite(actor.aimPitch));
    return Math.hypot(angleDifference(yaw, ctx.wantYaw), pitch - ctx.wantPitch) <= tolerance;
  };
  if (enemy) {
    const saved = [ctx.wantYaw, ctx.wantPitch, ctx.aimDistance];
    ctx.aimAt(enemy.pos, { height: enemy.botBossTarget ? 0 : 0.85 });
    ctx.aligned = ctx.isAimed();
    [ctx.wantYaw, ctx.wantPitch, ctx.aimDistance] = saved;
    ctx.aimChanged = false;
  } else ctx.aligned = false;

  ctx.safePath = (point, maxDistance = Infinity, halfWidth = 0.34) => {
    if (!finitePoint(point) || typeof world?.level?.groundHeight !== 'function'
      || typeof world?.physics?.los !== 'function' || !(maxDistance > 0)) return false;
    const dx = point.x - actor.pos.x, dz = point.z - actor.pos.z, length = Math.hypot(dx, dz);
    const reach = Math.min(length, maxDistance);
    if (reach < 1e-5) return true;
    const ux = dx / length, uz = dz / length, samples = Math.max(1, Math.ceil(reach / 0.45));
    const width = Math.max(0, Math.min(1, finite(halfWidth, 0.34)));
    let ground = actor.pos.y;
    const start = { x: 0, y: 0, z: 0 }, end = { x: 0, y: 0, z: 0 };
    // A zero-foot groundProbe still casts its complete nine-ray ring. These
    // already width-sampled path columns need only one downward ray each.
    const origin = special === 'krakenRoyale' ? actor.pos.clone?.() : null;
    const down = origin?.clone().set(0, -1, 0);
    const probe = origin ? { point: origin.clone(), normal: origin.clone() } : null;
    for (let i = 1; i <= samples; i++) {
      const travel = reach * i / samples;
      for (const side of [0, -width, width]) {
        const x = actor.pos.x + ux * travel - uz * side;
        const z = actor.pos.z + uz * travel + ux * side;
        let y;
        if (special === 'krakenRoyale') {
          // Kraken remains a squid and falls through grates. The ordinary
          // navigation height includes them, so probe the actual support too.
          if (!probe || typeof world.physics.raycast !== 'function') return false;
          origin.set(x, ground + 0.65, z);
          world.physics.raycast(origin, down, 1.2, probe, true);
          y = probe.hit && probe.normal.y >= 0.68 ? probe.point.y : -Infinity;
        } else y = world.level.groundHeight(x, z, ground + 0.65);
        if (!Number.isFinite(y) || y < ground - 0.55 || y > ground + 0.65) return false;
        if (side === 0) ground = y;
      }
    }
    for (const side of [0, -width, width]) {
      start.x = actor.pos.x - uz * side; start.y = actor.pos.y + 0.45; start.z = actor.pos.z + ux * side;
      end.x = actor.pos.x + ux * reach - uz * side; end.y = ground + 0.45; end.z = actor.pos.z + uz * reach + ux * side;
      if (!world.physics.los(start, end)) return false;
      // Unlike perception LOS, segment() includes solid grate/wall contacts.
      if (typeof world.physics.segment === 'function' && world.physics.segment(start, end)?.hit) return false;
    }
    return true;
  };
  ctx.moveToward = (point = enemy?.pos, scale = 1) => {
    if (!move?.set || !finitePoint(point) || !Number.isFinite(scale)) return false;
    const dx = point.x - actor.pos.x, dz = point.z - actor.pos.z, length = Math.hypot(dx, dz);
    const direction = scale < 0 ? { x: actor.pos.x - dx, y: actor.pos.y, z: actor.pos.z - dz } : point;
    if (length < 1e-5 || !ctx.safePath(direction, 1.2)) { move.set(0, 0, 0); return false; }
    const amount = Math.max(-1, Math.min(1, scale));
    move.set(dx / length * amount, 0, dz / length * amount);
    return true;
  };
  return ctx;
}

export function createBotSpecialContext(actor, intent, dt, target, options = {}) {
  const ctx = beginBotSpecialContext(actor, intent, dt, options);
  return ctx ? completeBotSpecialContext(ctx, target, options) : null;
}
