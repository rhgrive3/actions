// Retain seven reusable coordinate probes without importing browser-only 'three'.
// The native Physics.los() reads x/y/z through Vector3.copy, so probe records
// can stay realm-independent in Node regression tests and in the browser.
const EPS = 1e-9;
const probes = Array.from({ length: 7 }, () => ({ x: 0, y: 0, z: 0,
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }));

// #1043: A Blaster burst reaches the player volume when any canonical point on
// the same vertical capsule used by main-weapon hit tests is visible. This is
// deliberately different from the old single centre ray: a thin ledge or wall
// edge may hide the torso sample without fully occluding the blast volume.
// Full cover still blocks every probe.
export function blasterBlastExposed(physics, center, actor, player) {
  if (!physics?.los || !center || !actor?.pos || !player) return true;
  const baseY = actor.pos.y + (actor.smoothY || 0);
  const height = actor.form === 'squid' ? player.squidHeight : player.height;
  const radius = Math.max(0, player.radius * 0.95);
  const low = baseY + Math.min(radius, height * 0.5);
  const high = baseY + Math.max(Math.min(radius, height * 0.5), height - radius);
  const mid = Math.max(low, Math.min(high, center.y));
  const dx = actor.pos.x - center.x, dz = actor.pos.z - center.z;
  const len = Math.hypot(dx, dz);
  const fx = len > EPS ? dx / len : 0, fz = len > EPS ? dz / len : 1;
  const sx = -fz, sz = fx;

  probes[0].set(actor.pos.x, mid, actor.pos.z);
  probes[1].set(actor.pos.x, low, actor.pos.z);
  probes[2].set(actor.pos.x, high, actor.pos.z);
  probes[3].set(actor.pos.x + sx * radius, mid, actor.pos.z + sz * radius);
  probes[4].set(actor.pos.x - sx * radius, mid, actor.pos.z - sz * radius);
  probes[5].set(actor.pos.x - fx * radius, mid, actor.pos.z - fz * radius);
  probes[6].set(actor.pos.x - fx * radius, high, actor.pos.z - fz * radius);

  for (const point of probes) if (physics.los(center, point)) return true;
  return false;
}
