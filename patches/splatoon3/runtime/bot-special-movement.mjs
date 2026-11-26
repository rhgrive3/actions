// INKWAVE bot movement helpers for active specials. They only write the
// admitted move vector through the context's own safe-path probe; they never
// start an effect. Kept outside bot-special-context.mjs so the context's
// observable shape and memory stay identical to its pinned parity baseline.
const navigation = new WeakMap();
const _probe = { x: 0, y: 0, z: 0 };
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Record the brain's own navigation move (objective / last-seen pursuit)
 * for this tick, before a special policy clears it. */
export function captureNav(ctx) {
  const actor = ctx?.actor;
  if (!actor) return;
  let nav = navigation.get(actor);
  if (!nav) { nav = { ctx: null, x: 0, z: 0 }; navigation.set(actor, nav); }
  if (nav.ctx !== ctx) { nav.ctx = ctx; nav.x = finite(ctx.move?.x); nav.z = finite(ctx.move?.z); }
}

/** Follow that navigation instead of idling in place. */
export function followNav(ctx, scale = 1) {
  const { actor, move } = ctx || {};
  const nav = actor ? navigation.get(actor) : null;
  const length = nav && nav.ctx === ctx ? Math.hypot(nav.x, nav.z) : 0;
  if (!move?.set || !finitePoint(actor?.pos) || length < 0.1 || !Number.isFinite(scale) || typeof ctx.safePath !== 'function') return false;
  const ux = nav.x / length, uz = nav.z / length;
  _probe.x = actor.pos.x + ux * 1.5; _probe.y = actor.pos.y; _probe.z = actor.pos.z + uz * 1.5;
  if (!ctx.safePath(_probe, 1.5)) return false;
  const amount = Math.max(0, Math.min(1, scale)) * Math.min(1, length);
  move.set(ux * amount, 0, uz * amount);
  return true;
}

/** Sidestep when the straight approach or retreat is blocked (wall, ledge or
 * water behind the bot) instead of standing still. Deterministic side. */
export function strafe(ctx, point = ctx?.enemy?.pos, scale = 1) {
  const { actor, move, memory } = ctx || {};
  if (!move?.set || !finitePoint(actor?.pos) || !finitePoint(point) || !Number.isFinite(scale) || typeof ctx.safePath !== 'function') return false;
  const dx = point.x - actor.pos.x, dz = point.z - actor.pos.z, length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length < 1e-5) return false;
  const preferred = memory?.strafeSide || ((finite(actor.slot, finite(actor.nid)) & 1) ? -1 : 1);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? preferred : -preferred;
    const sx = -dz / length * side, sz = dx / length * side;
    _probe.x = actor.pos.x + sx * 1.5; _probe.y = actor.pos.y; _probe.z = actor.pos.z + sz * 1.5;
    if (!ctx.safePath(_probe, 1.5)) continue;
    if (memory) memory.strafeSide = side;
    const amount = Math.max(0, Math.min(1, scale));
    move.set(sx * amount, 0, sz * amount);
    return true;
  }
  move.set(0, 0, 0);
  return false;
}

// Last confirmed sighting per bot. Special memory is replaced when the special
// activates, so a target seen on the activation tick would otherwise be
// forgotten immediately. Age advances on the bot's own special ticks and across
// uncharged gaps via world.time when available.
const sightings = new WeakMap();
export function noteSighting(ctx) {
  const actor = ctx?.actor;
  if (!actor) return;
  let s = sightings.get(actor);
  if (!s) { s = { x: 0, y: 0, z: 0, age: Infinity, life: actor.netLife, lastTime: NaN }; sightings.set(actor, s); }
  if (s.life !== actor.netLife) { s.age = Infinity; s.life = actor.netLife; s.lastTime = NaN; }
  const dt = Math.max(0, finite(ctx.dt));
  const now = ctx.world?.time;
  if (Number.isFinite(now)) {
    if (Number.isFinite(s.lastTime) && now < s.lastTime) s.age = Infinity;
    else if (Number.isFinite(s.lastTime) && now - s.lastTime > dt) s.age += now - s.lastTime;
    else s.age += dt;
    s.lastTime = now;
  } else {
    s.age += dt;
  }
  const e = ctx.enemy;
  if (e?.alive && e.team !== actor.team && ctx.visible === true && finitePoint(e.pos)) {
    s.x = e.pos.x; s.y = e.pos.y; s.z = e.pos.z; s.age = 0;
  }
}
export function recentSighting(ctx, maxAge) {
  const s = ctx?.actor && sightings.get(ctx.actor);
  return s && s.age <= maxAge && s.life === ctx.actor.netLife ? s : null;
}
