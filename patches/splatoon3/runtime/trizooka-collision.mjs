// Native-pipeline connections for the Trizooka (issue 177, lane freebuff-2).
//
// These are narrow query/adjust helpers called FROM the single native
// `Projectiles._step`. They never integrate a projectile, never own a list and
// never schedule anything: the native loop keeps its one pass, its one
// integration and its one contact resolution.
//
// Every helper returns without touching anything unless the projectile is a
// Trizooka one, so an un-composed build stays byte-identical to native.
import { selectTrizookaFlight, selectTrizookaCollision, trizookaOrbitOffset, TRIZOOKA_PROJECTILE_FIELDS } from './kit-trizooka.mjs';

export const TRIZOOKA_WID = 'trizooka';

// A projectile belongs to this kit only when the native cause id says so and a
// live descriptor rides along. A ghost keeps the identity for presentation but
// never gains authority: it must not damage, paint, turf or burst.
export function isKitProjectile(p, { authority = true } = {}) {
  if (!p || p.wid !== TRIZOOKA_WID) return false;
  if (authority && p.ghost) return false;
  return true;
}

// The damage carrier is the ONLY lobe that may damage, paint or turf. Side
// lobes are visual only and must stay completely inert in the native pipeline.
export function isDamageCarrier(p, { authority = true } = {}) {
  return isKitProjectile(p, { authority }) && p.damageOwner === true;
}

// ---- flight stage ------------------------------------------------------------
//
// The native step applies one grav/drag pair. The Trizooka flies 16F straight,
// 10F braking, then free. This returns TRUE when it has taken the stage over, so
// the caller can skip the native gravity/drag lines for this projectile only.
//
// `p.age` is NOT touched: the native clock and the native `p.prev` snapshot stay
// exactly where they were, so the swept segment remains chronological.
export function kitTrizookaFlight(system, p, dt) {
  if (!isKitProjectile(p)) return false;
  const s = selectTrizookaFlight(p, dt);
  p.s3Stage = s.stage;
  p.s3StageFrames = s.stageFrames;
  if (s.stage === 'straight') {
    // genuinely gravity-free and drag-free, not "leave the launch gravity"
    p.grav = 0;
    p.drag = 0;
  } else {
    p.grav = s.grav;
    p.drag = s.drag;
  }
  if (s.transition) {
    // raw table transition velocities, applied once at the boundary frame
    const horiz = Math.hypot(p.vel.x, p.vel.z);
    if (s.stage === 'brake') {
      const cap = s.brakeVelocityXZ * 60;
      if (horiz > cap && horiz > 0) { const k = cap / horiz; p.vel.x *= k; p.vel.z *= k; }
      p.vel.y = s.brakeVelocityY * 60;
      p.s3StageTransition = true;
    } else if (s.stage === 'free') {
      p.s3StageTransition = true;
    }
  }
  // the radius the sweep should use this frame, grown by the selector
  const c = selectTrizookaCollision(p);
  p.s3ActorRadius = c.actorRadius;
  p.s3WorldRadius = c.worldRadius;
  return true;
}

// ---- orbit -------------------------------------------------------------------
//
// The spiral is applied as an offset DIFFERENCE around the native centreline:
// after the native integration moved p.pos, the position is corrected by
// (offset(age) - offset(age - dt)). Adding an absolute circle each frame would
// teleport the projectile and destroy the swept segment.
export function kitTrizookaOrbitDelta(system, p, dt) {
  if (!isKitProjectile(p, { authority: false })) return false;
  const step = dt > 0 ? dt : 0;
  if (!(step > 0)) return false;
  const now = trizookaOrbitOffset(p, step);
  // rebuild the previous-age offset on the same centreline
  const prev = { age: Math.max(0, (p.age ?? 0) - step), s3VolleyIndex: p.s3VolleyIndex, vel: p.vel, s3Yaw: p.s3Yaw };
  const before = trizookaOrbitOffset(prev, step);
  p.pos.x += now.x - before.x;
  p.pos.y += now.y - before.y;
  p.pos.z += now.z - before.z;
  p.s3OrbitApplied = true;
  return true;
}

// ---- hit radii ---------------------------------------------------------------
//
// Distinct, INCREASING radii per projectile. Metadata alone is not enough: the
// number below is what actually inflates the native capsule and sweep queries.
export function kitTrizookaActorRadius(system, p) {
  if (!isKitProjectile(p)) return null;
  const c = selectTrizookaCollision(p);
  // the body capsule stays the native PLAYER.radius; the Trizooka sphere is
  // added on top and grows from 0.01 to 0.75 over 10F
  return p.s3SizeBase + c.actorRadius;
}

export function kitTrizookaWorldRadius(system, p) {
  if (!isKitProjectile(p)) return null;
  return selectTrizookaCollision(p).worldRadius;
}

// ---- world sphere sweep ------------------------------------------------------
//
// Native `Physics.segment` is a POINT ray against the block OBBs, so a growing
// Trizooka shell cannot be represented by calling it unchanged. This inflates
// the native result by the sphere radius along the surface normal:
//
//     back = r / max(dot(dir, -normal), eps)
//     contact = nativePoint - dir * back
//
// That is EXACT against a plane, and every block face is a plane locally, so
// face contact is correct. Near a box EDGE or CORNER the true sphere contacts
// earlier than a plane back-off predicts, so this reports the contact slightly
// late there. The direction of the error is known and bounded (it never reports
// a contact the point ray did not really have), and correcting it properly needs
// a real sphere-vs-OBB sweep inside Physics, which is upstream-owned work.
//
// UNCERTAINTY IS EXPLICIT: exact on faces, late on edges and corners.
export function kitTrizookaWorldSweep(system, p, out, physics) {
  const r = kitTrizookaWorldRadius(system, p);
  if (r == null) return physics.segment(p.prev, p.pos, out, true);
  const hit = physics.segment(p.prev, p.pos, out, true);
  if (!hit.hit || !(r > 0)) return hit;
  const dx = p.pos.x - p.prev.x, dy = p.pos.y - p.prev.y, dz = p.pos.z - p.prev.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0)) return hit;
  const ix = dx / len, iy = dy / len, iz = dz / len;
  // dot of the incoming direction with the outward normal: positive when the ray
  // enters the block through that face
  const facing = -(ix * hit.normal.x + iy * hit.normal.y + iz * hit.normal.z);
  const back = facing > 1e-4 ? r / facing : r;
  const contact = Math.max(0, hit.dist - back);
  hit.dist = contact;
  hit.point.set(p.prev.x + ix * contact, p.prev.y + iy * contact, p.prev.z + iz * contact);
  return hit;
}

// ---- pooled reuse ------------------------------------------------------------
//
// `_new` hands back a pooled object that still carries the previous round's
// kit fields. Every transient is removed so nothing leaks into the next volley.
export function kitTrizookaClearPooled(p) {
  if (!p) return p;
  // a pooled object that came from a Trizooka volley still carries the damage,
  // size and radius values that volley used. Native _new does not reset those,
  // so a kit round must, or the next borrower inherits them.
  const wasKit = p.s3SpecialWeapon?.kind === TRIZOOKA_WID || p.wid === TRIZOOKA_WID;
  for (const k of TRIZOOKA_PROJECTILE_FIELDS) delete p[k];
  for (const k of ['s3Stage', 's3StageFrames', 's3StageTransition', 's3ActorRadius', 's3WorldRadius', 's3SizeBase', 's3OrbitApplied']) delete p[k];
  if (wasKit) { p.damage = 0; p.dmgFar = undefined; p.grav = 0; p.drag = 0; }
  return p;
}

export function kitTrizookaMarkSize(p) {
  if (!p) return p;
  p.s3SizeBase = p.size ?? 0;
  return p;
}

// The Trizooka table gives two discrete distance-damage points (53 @2.5 and
// 35 @4.0). A continuous lerp between them would invent intermediate damage the
// table never states, so the blast steps instead.
export function kitTrizookaSteppedBands(p) {
  return isKitProjectile(p);
}

// ---- ghost reconstruction ----------------------------------------------------
//
// The native packet is a fixed tuple. Rather than widen it, the descriptor is
// rebuilt from SPECIALS[wid].projectileDescriptor, which is exactly the contract
// the parent established. Ghosts get presentation state and never authority.
export function kitTrizookaGhost(p, actor, SPECIALS) {
  if (!p || p.wid !== TRIZOOKA_WID) return p;
  const entry = SPECIALS?.[TRIZOOKA_WID];
  const descriptor = typeof entry?.projectileDescriptor === 'function'
    ? entry.projectileDescriptor(p)
    : entry?.descriptor ?? null;
  if (descriptor) p.s3SpecialWeapon = descriptor;
  if (p.damageOwner === undefined) p.damageOwner = !p.ghost ? true : false;
  // a ghost keeps the flight/orbit selectors for its visual trajectory, but the
  // authoritative flag is forced off so no damage, paint, turf or burst can run
  p.ghost = true;
  return p;
}