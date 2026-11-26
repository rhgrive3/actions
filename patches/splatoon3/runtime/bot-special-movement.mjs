// INKWAVE bot movement helpers for active specials. They only write the
// admitted move vector through the context's own safe-path probe; they never
// start an effect. Kept outside bot-special-context.mjs so the context's
// observable shape and memory stay identical to its pinned parity baseline.
const navigation = new WeakMap();
const _probe = { x: 0, y: 0, z: 0 };
const _look = { x: 0, y: 0, z: 0 };
const _lookOpts = { height: 0.7 };
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Returns true when no special blocks normal main-weapon usage (either no
 * special is active, Killer Wail 5.1 is past its 40F startup, or Zipcaster is
 * in its 'ready' ground/wall combat phase). */
export function specialAllowsMain(actor) {
  const sa = actor?.specialActive;
  if (!sa) return true;
  const id = sa.id;
  const st = actor._s3AllSpecialState?.id === id ? actor._s3AllSpecialState : sa;
  if (id === 'killerWail') {
    const t = Number.isFinite(st?.t) ? st.t : (Number.isFinite(sa.t) ? sa.t : 0);
    return t >= 40 / 60;
  }
  if (id === 'zipcaster') {
    return (st?.phase ?? sa.phase) === 'ready';
  }
  return false;
}

/** Returns true when normal sub-weapon usage is allowed (no active special, or
 * Killer Wail 5.1 post-40F; Zipcaster uses sub for its grapple hook). */
export function specialAllowsSub(actor) {
  const sa = actor?.specialActive;
  if (!sa) return true;
  if (sa.id === 'killerWail') {
    const st = actor._s3AllSpecialState?.id === 'killerWail' ? actor._s3AllSpecialState : sa;
    const t = Number.isFinite(st?.t) ? st.t : (Number.isFinite(sa.t) ? sa.t : 0);
    return t >= 40 / 60;
  }
  return false;
}

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
  if (!ctx.safePath(_probe, 1.5)) {
    _probe.x = actor.pos.x + ux * 0.75; _probe.y = actor.pos.y; _probe.z = actor.pos.z + uz * 0.75;
    if (!ctx.safePath(_probe, 0.75)) return false;
  }
  const amount = Math.max(0, Math.min(1, scale)) * Math.min(1, length);
  move.set(ux * amount, 0, uz * amount);
  // Steer look toward navigation direction when no enemy is visible so holdLook
  // does not freeze the bot's gaze while actively roaming.
  if (!ctx.enemy && typeof ctx.aimAt === 'function') {
    _look.x = actor.pos.x + ux * 6; _look.y = actor.pos.y; _look.z = actor.pos.z + uz * 6;
    ctx.aimAt(_look, _lookOpts);
  }
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
    let ok = ctx.safePath(_probe, 1.5);
    if (!ok) {
      _probe.x = actor.pos.x + sx * 0.75; _probe.y = actor.pos.y; _probe.z = actor.pos.z + sz * 0.75;
      ok = ctx.safePath(_probe, 0.75);
    }
    if (!ok) continue;
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
