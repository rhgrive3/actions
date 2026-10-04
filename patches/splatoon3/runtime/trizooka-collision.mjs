// Native-pipeline connections for the Trizooka (issue 177, lane freebuff-2).
//
// Narrow query/adjust helpers called FROM the single native `Projectiles._step`
// and the native paint-credit lines. They never integrate a projectile, never
// own a list and never schedule anything: the native loop keeps its one pass,
// its one integration and its one contact resolution.
//
// VISUAL vs AUTHORITY is the central split:
//   - presentation (stage, orbit, growing radii, volley identity) runs for a
//     GHOST as well, so a remote volley looks right even after its transport is
//     gone;
//   - authority (damage, paint, turf, gauge) is refused for a ghost AND for a
//     side lobe, whatever the transport is doing.
//
// Every helper returns without touching anything unless the projectile belongs
// to this kit, so an un-composed build stays byte-identical to native.
import { selectTrizookaFlight, selectTrizookaCollision, trizookaOrbitOffset, TRIZOOKA_PROJECTILE_FIELDS } from './kit-trizooka.mjs';

export const TRIZOOKA_WID = 'trizooka';

let PLAYER_CONFIG = null;
let SPECIALS_CONFIG = null;
// The kit is configured by its installer; before that the helpers fall back to
// the same constants native config.js carries, so nothing is ever undefined.
export function configureTrizookaNative({ PLAYER, SPECIALS } = {}) {
  if (PLAYER) PLAYER_CONFIG = PLAYER;
  if (SPECIALS) SPECIALS_CONFIG = SPECIALS;
}
const playerRadius = () => PLAYER_CONFIG?.radius ?? 0.38;

// ---- identity ---------------------------------------------------------------

export function isKitProjectile(p) {
  return !!p && p.wid === TRIZOOKA_WID;
}

// A ghost keeps the kit identity for presentation but is never authoritative.
export function hasAuthority(p) {
  return isKitProjectile(p) && !p.ghost && p.damageOwner === true;
}

// Only the damage carrier may damage, paint or turf. Side lobes are visual only.
export function isDamageCarrier(p) {
  return hasAuthority(p);
}

// Only the carrier may lay ink or credit turf, and never a ghost.
export function hasPaintAuthority(p) {
  return hasAuthority(p);
}

// ---- flight stage ------------------------------------------------------------
//
// The native step applies one grav/drag pair. The Trizooka flies 16F straight,
// 10F braking, then free. Runs for ghosts too: that is presentation only.
//
// `p.age` is NOT touched, so the native clock and the `p.prev` snapshot stay put
// and the swept segment remains chronological.
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
  const c = selectTrizookaCollision(p);
  p.s3ActorRadius = c.actorRadius;
  p.s3WorldRadius = c.worldRadius;
  return true;
}

// ---- orbit -------------------------------------------------------------------
//
// An offset DIFFERENCE around the native centreline, applied after the native
// integration moved p.pos. Adding an absolute circle each frame would teleport
// the projectile and destroy the swept segment.
export function kitTrizookaOrbitDelta(system, p, dt) {
  if (!isKitProjectile(p)) return false;
  const step = dt > 0 ? dt : 0;
  if (!(step > 0)) return false;
  const now = trizookaOrbitOffset(p, step);
  const prev = { age: Math.max(0, (p.age ?? 0) - step), s3VolleyIndex: p.s3VolleyIndex, vel: p.vel, s3Yaw: p.s3Yaw };
  const before = trizookaOrbitOffset(prev, step);
  p.pos.x += now.x - before.x;
  p.pos.y += now.y - before.y;
  p.pos.z += now.z - before.z;
  p.s3OrbitApplied = true;
  return true;
}

// ---- actor hit sphere --------------------------------------------------------
//
// Native uses `PLAYER.radius * 0.95 + p.size`: the body capsule plus the
// projectile's own visual shell. The Trizooka GROWS on that same expression, so
// the visual shell is counted exactly once and the body radius is never dropped.
export function kitTrizookaActorRadius(system, p) {
  if (!isKitProjectile(p)) return null;
  const shell = Number.isFinite(p.size) ? p.size : 0;
  return playerRadius() * 0.95 + shell + selectTrizookaCollision(p).actorRadius;
}

// ---- swept sphere vs the native block OBBs -----------------------------------
//
// Native `Physics.segment` is a POINT ray, so it misses every glancing face,
// edge and corner contact. A plane back-off is not enough either: `r / facing`
// blows up as the normal turns away from the ray and reports false early
// contacts. This computes the genuine earliest entry of a swept sphere against
// the rounded box (OBB Minkowski-summed with a sphere of radius r) by testing
// the three exact candidate families and taking the minimum:
//
//   1. six OFFSET PLANES   (face regions of the Minkowski sum)
//   2. twelve EDGE CYLINDERS (r around each OBB edge line)
//   3. eight CORNER SPHERES  (r around each OBB corner)
//
// An inflated AABB is deliberately NOT used: it manufactures corner hits that
// the rounded box does not have.
//
// Block data is read from the real native level; nothing here re-implements the
// level, and the non-block/ground/world semantics stay exactly as native: this
// only ever replaces the BLOCK query, and any non-kit projectile goes straight
// to the native `Physics.segment`.

const _inv = [0, 0, 0];
const _ld = [0, 0, 0];

function blockCandidates(block, a, b, r) {
  // transform the swept segment into the block's own orthonormal frame
  const c = block.center, ax = block.axes;
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const s = { x: a.x - c.x, y: a.y - c.y, z: a.z - c.z };
  const h = [block.half.x, block.half.y, block.half.z];
  for (let k = 0; k < 3; k++) {
    const A = ax[k];
    _ld[k] = d.x * A.x + d.y * A.y + d.z * A.z;
    _inv[k] = s.x * A.x + s.y * A.y + s.z * A.z;
  }
  const len2 = _ld[0] * _ld[0] + _ld[1] * _ld[1] + _ld[2] * _ld[2];
  if (len2 < 1e-18) return null;                 // zero-length step

  let bestT = Infinity, bestKind = -1, bestAxis = 0, bestSign = 0;

  // A shell that STARTS overlapping is already in contact. Without this the
  // plane/edge/corner candidates all yield t < 0 and the overlap is missed.
  let cl = 0;
  for (let k = 0; k < 3; k++) cl += (_inv[k] < -h[k] ? _inv[k] + h[k] : (_inv[k] > h[k] ? _inv[k] - h[k] : 0)) ** 2;
  if (cl <= r * r) return { t: 0, kind: 2, axis: 0, sign: 0, block, overlap: true };

  // 1. face regions: the six planes offset outward by r
  for (let k = 0; k < 3; k++) {
    const D = _ld[k];
    if (Math.abs(D) < 1e-12) continue;
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const plane = sgn * (h[k] + r);
      const t = (plane - _inv[k]) / D;
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      // the other two axes must be inside their own extent
      const oa = [], ob = [];
      let n = 0;
      for (let m = 0; m < 3; m++) { if (m === k) continue; oa[n] = _inv[m] + t * _ld[m]; n += 1; }
      n = 0;
      for (let m = 0; m < 3; m++) { if (m === k) continue; ob[n] = _inv[m] + t * _ld[m]; n += 1; }
      const other = [0, 1, 2].filter((m) => m !== k);
      if (Math.abs(oa[0]) > h[other[0]] + 1e-9 || Math.abs(oa[1]) > h[other[1]] + 1e-9) continue;
      if (t < bestT) { bestT = t; bestKind = 0; bestAxis = k; bestSign = sgn; }
    }
  }

  // 2. edge regions: a cylinder of radius r around each of the 12 edges
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (let su = -1; su <= 1; su += 2) {
      for (let sv = -1; sv <= 1; sv += 2) {
        const cu = su * h[u], cv = sv * h[v];
        const ou = _inv[u] - cu, ov = _inv[v] - cv;
        const Du = _ld[u], Dv = _ld[v];
        const qa = Du * Du + Dv * Dv;
        if (qa < 1e-18) continue;
        const qb = 2 * (ou * Du + ov * Dv);
        const qc = ou * ou + ov * ov - r * r;
        const disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const root = Math.sqrt(disc);
        // both roots: the entry is the earlier one still inside the edge extent
        for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
          if (t < -1e-9 || t > 1 + 1e-9) continue;
          const oa = _inv[axis] + t * _ld[axis];
          if (Math.abs(oa) > h[axis] + 1e-9) continue;
          if (t < bestT) { bestT = t; bestKind = 1; bestAxis = axis; }
          break;
        }
      }
    }
  }

  // 3. corner regions: a sphere of radius r at each of the 8 corners
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const ox = _inv[0] - sx * h[0], oy = _inv[1] - sy * h[1], oz = _inv[2] - sz * h[2];
        const qa = len2;
        const qb = 2 * (ox * _ld[0] + oy * _ld[1] + oz * _ld[2]);
        const qc = ox * ox + oy * oy + oz * oz - r * r;
        const disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const t = (-qb - Math.sqrt(disc)) / (2 * qa);
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        if (t < bestT) { bestT = t; bestKind = 2; bestAxis = 0; }
      }
    }
  }

  if (bestT === Infinity) return null;
  return { t: Math.max(0, Math.min(1, bestT)), kind: bestKind, axis: bestAxis, sign: bestSign, block };
}

// Fills the native-shaped Hit for a swept sphere. Returns true when it hit.
function sweepFill(out, a, b, hit) {
  const level = out.__level;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  const ids = level.queryBlocks(x0, z0, x1, z1, out.__ids || (out.__ids = []));
  let best = null;
  for (let i = 0; i < ids.length; i++) {
    const blk = level.blocks[ids[i]];
    if (!blk || !blk.solid) continue;
    const c = blockCandidates(blk, a, b, hit.radius);
    if (c && (!best || c.t < best.t)) best = c;
  }
  out.hit = false; out.dist = 0; out.block = -1; out.face = -1;
  if (!best) return false;
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const dist = best.t * len;
  out.hit = true;
  out.dist = dist;
  out.block = best.block.id ?? -1;
  out.point.set(a.x + (b.x - a.x) * best.t, a.y + (b.y - a.y) * best.t, a.z + (b.z - a.z) * best.t);
  // the surface normal: face/edge candidates use the axis, corner candidates use
  // the direction from the rounded corner to the contact point
  if (best.kind === 0) {
    const A = best.block.axes[best.axis];
    out.normal.copy(A).multiplyScalar(best.sign);
  } else if (best.kind === 1) {
    const c = best.block.center, ax = best.block.axes;
    const dx = out.point.x - c.x, dy = out.point.y - c.y, dz = out.point.z - c.z;
    const o = [dx * ax[0].x + dy * ax[0].y + dz * ax[0].z, dx * ax[1].x + dy * ax[1].y + dz * ax[1].z, dx * ax[2].x + dy * ax[2].y + dz * ax[2].z];
    o[best.axis] = 0;
    if (Math.hypot(o[0], o[1], o[2]) < 1e-9) out.normal.set(0, 1, 0); else {
    out.normal.set(
      ax[0].x * o[0] + ax[1].x * o[1] + ax[2].x * o[2],
      ax[0].y * o[0] + ax[1].y * o[1] + ax[2].y * o[2],
      ax[0].z * o[0] + ax[1].z * o[1] + ax[2].z * o[2],
    ).normalize();
    }
  } else {
    const c = best.block.center, h = best.block.half;
    const sx = Math.sign(out.point.x - c.x) || 1, sy = Math.sign(out.point.y - c.y) || 1, sz = Math.sign(out.point.z - c.z) || 1;
    out.normal.set(out.point.x - (c.x + sx * h.x), out.point.y - (c.y + sy * h.y), out.point.z - (c.z + sz * h.z)).normalize();
  }
  return true;
}

// Replaces the native block query for a growing kit shell only.
export function kitTrizookaWorldSweep(system, p, out, physics) {
  if (!isKitProjectile(p)) return physics.segment(p.prev, p.pos, out, true);
  const r = selectTrizookaCollision(p).worldRadius;
  if (!(r > 0)) return physics.segment(p.prev, p.pos, out, true);
  const level = physics.level;
  if (!level?.blocks?.length) return physics.segment(p.prev, p.pos, out, true);
  out.__level = level;
  // an already-overlapping shell is in contact at t = 0
  const probe = { radius: r };
  if (!sweepFill(out, p.prev, p.pos, probe)) return physics.segment(p.prev, p.pos, out, true);
  return out;
}

// ---- paint and turf credit ---------------------------------------------------
//
// A shared pure helper for the three native projectile paint-credit sites.
//
// The gauge policy after a special ends is UNKNOWN, so the ordinary native
// `addTurf` semantics are preserved exactly. What this does refuse is authority:
// a ghost or a side lobe lays no ink and credits no turf, even after the
// transport is disposed. `_impact` lays paint BEFORE the credit line, so the
// ghost guard is applied before any splat as well.
// Only a KIT projectile can be refused here. Anything else keeps the native
// behaviour untouched: this helper must never block an ordinary main round.
export function kitPaintAuthority(p) {
  return !isKitProjectile(p) || hasAuthority(p);
}

export function kitPaintCredit(p, area) {
  if (!kitPaintAuthority(p)) return 0;
  const a = p.owner;
  if (!a) return 0;
  if (typeof a.addTurf === 'function') a.addTurf(area);
  return area;
}

// ---- pooled reuse ------------------------------------------------------------
export function kitTrizookaClearPooled(p) {
  if (!p) return p;
  // native _new does not reset damage/grav/drag, so a kit round must, or the
  // next borrower of this pooled object inherits them
  const wasKit = isKitProjectile(p) || p.s3SpecialWeapon?.kind === TRIZOOKA_WID;
  for (const k of TRIZOOKA_PROJECTILE_FIELDS) delete p[k];
  for (const k of ['s3Stage', 's3StageFrames', 's3StageTransition', 's3ActorRadius', 's3WorldRadius', 's3SizeBase', 's3OrbitApplied']) delete p[k];
  if (wasKit) { p.damage = 0; p.dmgFar = undefined; p.grav = 0; p.drag = 0; }
  return p;
}

// ---- ghost reconstruction ----------------------------------------------------
//
// The native packet is a fixed tuple, so it is NOT widened: the descriptor is
// rebuilt from SPECIALS[wid].projectileDescriptor, which is the contract the
// parent established. A ghost keeps the presentation state and never authority.
export function kitTrizookaGhost(p, actor, SPECIALS) {
  if (!isKitProjectile(p)) return p;
  const entry = (SPECIALS || SPECIALS_CONFIG)?.[TRIZOOKA_WID];
  const descriptor = typeof entry?.projectileDescriptor === 'function'
    ? entry.projectileDescriptor(p)
    : entry?.descriptor ?? null;
  if (descriptor) p.s3SpecialWeapon = descriptor;
  // a ghost that arrives without an explicit owner keeps its volley index so the
  // side lobes stay in order; authority is forced off regardless
  if (p.damageOwner === undefined) p.damageOwner = false;
  p.ghost = true;
  return p;
}

// The Trizooka table gives two discrete distance-damage points (53 @2.5 and
// 35 @4.0). A continuous lerp would invent intermediate damage the table never
// states, so the blast steps instead.
export function kitTrizookaSteppedBands(p) {
  return hasAuthority(p);
}