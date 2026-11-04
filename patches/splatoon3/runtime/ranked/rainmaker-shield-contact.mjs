// Player contact with the Rainmaker shield (barrier) while it is active.
//
// Inkipedia, Rainmaker shield: "A player touching the Rainmaker shield receives
// 10.0 damage every three frames." Nothing public states a push or bounce
// speed; INKWAVE previously applied neither, so bodies walked straight through.
// Here the body is kept outside the shield sphere (the same sphere shots use:
// centre 1 m above the device, radius 1.5 + 1.2 * |balance| / max) and leaves
// with an outward horizontal speed. SHIELD_BOUNCE_SPEED is an INKWAVE
// calibration, not a retail value. Contact damage follows the Inkipedia rate
// on the simulation clock (first touch, then every 3/60 s while touching).
export const SHIELD_CONTACT_DAMAGE = 10;
export const SHIELD_CONTACT_INTERVAL = 3 / 60;
export const SHIELD_BOUNCE_SPEED = 5;

export function rainmakerShieldSphere(state) {
  const b = state?.barrier;
  if (!b?.active || !Array.isArray(state.pos) || !state.pos.every(Number.isFinite)) return null;
  const radius = 1.5 + 1.2 * Math.abs(b.balance || 0) / (b.max || 1000);
  return { x: state.pos[0], y: state.pos[1] + 1, z: state.pos[2], radius };
}

/** Push one local body out of the active shield. Returns the contact or null. */
export function resolveRainmakerShieldContact(actor, state, dt, { radius = 0.38, height = 1.45, squidHeight = 0.55 } = {}) {
  if (!actor?.alive || actor.remote || !(dt > 0)) return null;
  const s = rainmakerShieldSphere(state);
  const pos = actor.pos;
  if (!s || !pos) { if (actor.s3) actor.s3.shieldContactClock = null; return null; }
  const top = actor.form === 'squid' || actor.submerged ? squidHeight : height;
  // Closest point of the body's vertical capsule axis to the shield centre.
  const lo = pos.y + radius, hi = pos.y + Math.max(radius, top - radius);
  const cy = Math.min(hi, Math.max(lo, s.y));
  let dx = pos.x - s.x, dz = pos.z - s.z;
  const dy = cy - s.y, reach = s.radius + radius;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal * horizontal + dy * dy >= reach * reach) { if (actor.s3) actor.s3.shieldContactClock = null; return null; }
  // Horizontal escape keeps feet on their floor; a body at the exact centre
  // leaves along its facing.
  if (horizontal < 1e-6) { dx = Math.sin(actor.yaw || 0); dz = Math.cos(actor.yaw || 0); }
  else { dx /= horizontal; dz /= horizontal; }
  const ring = Math.sqrt(Math.max(0, reach * reach - dy * dy));
  pos.x = s.x + dx * ring; pos.z = s.z + dz * ring;
  if (actor.vel) {
    const outward = actor.vel.x * dx + actor.vel.z * dz;
    if (outward < SHIELD_BOUNCE_SPEED) {
      actor.vel.x += dx * (SHIELD_BOUNCE_SPEED - outward);
      actor.vel.z += dz * (SHIELD_BOUNCE_SPEED - outward);
    }
  }
  actor.s3 ||= {};
  let clock = actor.s3.shieldContactClock;
  let damaged = 0;
  if (!Number.isFinite(clock)) clock = SHIELD_CONTACT_INTERVAL; else clock += dt;
  while (clock + 1e-9 >= SHIELD_CONTACT_INTERVAL && actor.alive) {
    clock -= SHIELD_CONTACT_INTERVAL;
    damaged += SHIELD_CONTACT_DAMAGE;
    actor.damage?.(SHIELD_CONTACT_DAMAGE, null, 'rainmaker-shield');
  }
  actor.s3.shieldContactClock = actor.alive ? clock : null;
  return { normal: [dx, 0, dz], damaged };
}
