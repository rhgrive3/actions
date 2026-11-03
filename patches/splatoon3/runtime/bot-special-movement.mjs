// INKWAVE bot movement helpers for active specials. They only write the
// admitted move vector through the context's own safe-path probe; they never
// start an effect. Kept outside bot-special-context.mjs so the context's
// observable shape and memory stay identical to its pinned parity baseline.
const navigation = new WeakMap();
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Record the brain's own navigation move (objective / last-seen pursuit)
 * for this tick, before a special policy clears it. */
export function captureNav(ctx) {
  if (ctx && !navigation.has(ctx)) navigation.set(ctx, { x: finite(ctx.move?.x), z: finite(ctx.move?.z) });
}

/** Follow that navigation instead of idling in place. */
export function followNav(ctx, scale = 1) {
  const nav = navigation.get(ctx), { actor, move } = ctx || {};
  const length = nav ? Math.hypot(nav.x, nav.z) : 0;
  if (!move?.set || length < 0.1 || !Number.isFinite(scale) || typeof ctx.safePath !== 'function') return false;
  const ux = nav.x / length, uz = nav.z / length;
  const ahead = { x: actor.pos.x + ux * 1.5, y: actor.pos.y, z: actor.pos.z + uz * 1.5 };
  if (!ctx.safePath(ahead, 1.5)) return false;
  const amount = Math.max(0, Math.min(1, scale)) * Math.min(1, length);
  move.set(ux * amount, 0, uz * amount);
  return true;
}

/** Sidestep when the straight approach or retreat is blocked (wall, ledge or
 * water behind the bot) instead of standing still. Deterministic side. */
export function strafe(ctx, point = ctx?.enemy?.pos, scale = 1) {
  const { actor, move, memory } = ctx || {};
  if (!move?.set || !finitePoint(point) || typeof ctx.safePath !== 'function') return false;
  const dx = point.x - actor.pos.x, dz = point.z - actor.pos.z, length = Math.hypot(dx, dz);
  if (length < 1e-5) return false;
  const preferred = memory?.strafeSide || ((finite(actor.slot, finite(actor.nid)) & 1) ? -1 : 1);
  for (const side of [preferred, -preferred]) {
    const sx = -dz / length * side, sz = dx / length * side;
    const probe = { x: actor.pos.x + sx * 1.5, y: actor.pos.y, z: actor.pos.z + sz * 1.5 };
    if (!ctx.safePath(probe, 1.5)) continue;
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
// forgotten immediately. Age advances on the bot's own special ticks.
const sightings = new WeakMap();
export function noteSighting(ctx) {
  const actor = ctx?.actor;
  if (!actor) return;
  let s = sightings.get(actor);
  if (!s) { s = { x: 0, y: 0, z: 0, age: Infinity, life: actor.netLife }; sightings.set(actor, s); }
  if (s.life !== actor.netLife) { s.age = Infinity; s.life = actor.netLife; }
  s.age += finite(ctx.dt);
  const e = ctx.enemy;
  if (e?.alive && e.team !== actor.team && ctx.visible === true && finitePoint(e.pos)) {
    s.x = e.pos.x; s.y = e.pos.y; s.z = e.pos.z; s.age = 0;
  }
}
export function recentSighting(ctx, maxAge) {
  const s = ctx?.actor && sightings.get(ctx.actor);
  return s && s.age <= maxAge && s.life === ctx.actor.netLife ? s : null;
}
