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
import { selectTrizookaFlight, selectTrizookaCollision, trizookaOrbitOffset, TRIZOOKA_PROJECTILE_FIELDS, TRIZOOKA_ORBIT } from './kit-trizooka.mjs';

export const TRIZOOKA_WID = 'trizooka';

// Wids whose replayed ghost must never lay ink. This is a declared IDENTITY
// list, not another kit's logic: the rule a kit ghost needs is intrinsic (it is
// not the owner of the ink) and therefore independent of `G.netm`. A native
// transport mute only suppresses RECORDING, so it cannot be the authority test:
// once `G.netm` is null, or a ghost is stepped outside the mute window, a mute
// based guard would quietly start letting ghost ink through.
const KIT_GHOST_WIDS = new Set([TRIZOOKA_WID, 'inkVac']);

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

// A ghost keeps the kit identity for presentation but is never authoritative,
// and neither is a side lobe: only the one damage carrier of a volley is.
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
// The native step applies exactly one grav/drag pair, and it is the ONLY
// integrator. This helper therefore never applies a force: it publishes this
// stage's constants onto `p.grav` / `p.drag` and the transition velocity, and
// the native pair that follows runs for EVERY projectile, kit or not, exactly
// once. An earlier revision returned true here, which made the adapter skip
// that pair, so every brake and free tick flew with no gravity and no drag at
// all and only the transition frame ever moved the velocity.
//
// Runs for ghosts too: that is presentation only. `p.age` is NOT touched, so the
// native clock and the `p.prev` snapshot stay put and the swept segment remains
// chronological.
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
  // EXACTLY ONCE per stage. The stage is entered when it differs from the stage
  // this projectile was last stepped in; a symmetric `|age - boundary| <= dt`
  // window is true on BOTH frames that straddle the boundary, so the vertical
  // was reset twice and a slow frame could reset it again on either side. The
  // flag is re-stamped every call, so it never latches from an older step.
  // The FIRST step never transitions: a projectile is born in the straight
  // stage, so an undefined memory means "no boundary has been crossed yet" -
  // not "the brake just started", which would clamp a round that only ever
  // appeared mid-flight (a ghost, or a pooled round aged by its previous life).
  const entered = p.s3AppliedStage !== undefined && p.s3AppliedStage !== s.stage;
  p.s3AppliedStage = s.stage;
  p.s3StageTransition = false;
  if (s.transition && entered) {
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
  return false;
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
// Native reaches an actor with `PLAYER.radius * 0.95 + p.size`: the BODY
// allowance plus the projectile's own round shell. The Trizooka table's
// actorRadius IS that projectile sphere, so it REPLACES the `p.size` term.
//
// `p.size` must NOT be added as well. It is the render-only shell an ordinary
// round happens to use, and adding it on top of the table radius counted the
// projectile twice: a lobe reached further than the table states, and it grew
// when only the drawing was supposed to grow. The body allowance is kept, so no
// part of the native reach is lost.
//
// The reach is passed as `segmentCapsuleEntry`'s last argument, which is a
// distance from the capsule AXIS (the function solves against the axis and the
// two cap spheres). The adapter region that calls it already used the axis form
// for every ordinary round; that convention is untouched here.
export function kitTrizookaActorRadius(system, p) {
  if (!isKitProjectile(p)) return null;
  return playerRadius() * 0.95 + selectTrizookaCollision(p).actorRadius;
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

// The real closest point on a rotated box, mirroring native
// `Physics.closestOnBlock` (clamp each axis projection to its own half extent).
// Used for the contact normal, so a rotated corner or edge gets the true surface
// normal instead of an axis-aligned approximation.
function closestOnBlock(block, px, py, pz) {
  const c = block.center, ax = block.axes, h = block.half;
  const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
  const hs = [h.x, h.y, h.z];
  let lx = 0, ly = 0, lz = 0;
  for (let k = 0; k < 3; k++) {
    const A = ax[k];
    let d = dx * A.x + dy * A.y + dz * A.z;
    const lim = hs[k];
    if (d > lim) d = lim; else if (d < -lim) d = -lim;
    lx += A.x * d; ly += A.y * d; lz += A.z * d;
  }
  return { x: c.x + lx, y: c.y + ly, z: c.z + lz };
}

// Fills the native-shaped Hit for a swept sphere. Returns true when it hit.
function sweepFill(out, a, b, hit) {
  const level = out.__level;
  const r = hit.radius > 0 ? hit.radius : 0;
  // The broadphase rect must contain the whole SPHERE, not just the centre line.
  // Un-expanded, a block whose face the shell only grazes lies outside the rect
  // and is never even considered, so the grazing contact was silently lost. The
  // native ray rect is exact for a point; for a sphere it is not.
  const x0 = Math.min(a.x, b.x) - r, x1 = Math.max(a.x, b.x) + r;
  const z0 = Math.min(a.z, b.z) - r, z1 = Math.max(a.z, b.z) + r;
  const ids = level.queryBlocks(x0, z0, x1, z1, out.__ids || (out.__ids = []));
  let best = null;
  for (let i = 0; i < ids.length; i++) {
    const blk = level.blocks[ids[i]];
    if (!blk || !blk.solid) continue;
    // native `physics.segment(..., true)` means "skip grates"; this sweep
    // replaces exactly that call, so it must skip them too
    if (blk.grate) continue;
    const c = blockCandidates(blk, a, b, r);
    if (c && (!best || c.t < best.t)) best = c;
  }
  out.hit = false; out.dist = 0; out.block = -1; out.face = -1; out.u = 0; out.v = 0;
  out.center = false; out.grate = false;
  if (!best) return false;
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  out.hit = true;
  out.dist = best.t * len;
  out.block = best.block.id ?? -1;
  // the SPHERE CENTRE at the contact parameter
  const cx = a.x + (b.x - a.x) * best.t;
  const cy = a.y + (b.y - a.y) * best.t;
  const cz = a.z + (b.z - a.z) * best.t;
  // The normal is centre minus the real closest surface point. That is the true
  // outward direction for a rotated box on a face, an edge AND a corner; the
  // previous face/edge/corner case analysis used WORLD half extents and a radial
  // direction from the box centre, which is wrong as soon as the box is rotated
  // or the contact is not on a face.
  const q = closestOnBlock(best.block, cx, cy, cz);
  let nx = cx - q.x, ny = cy - q.y, nz = cz - q.z;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9) {
    // degenerate (the centre sits exactly on the surface): fall back to the axis
    // the candidate family reported
    const A = best.block.axes[best.axis] || best.block.axes[0];
    nx = A.x * (best.sign || 1); ny = A.y * (best.sign || 1); nz = A.z * (best.sign || 1);
    const al = Math.hypot(nx, ny, nz) || 1;
    nx /= al; ny /= al; nz /= al;
  } else { nx /= nl; ny /= nl; nz /= nl; }
  out.normal.set(nx, ny, nz);
  // The contact POINT is on the shell, not at the centre: a centre-based point
  // sits one radius INSIDE the solid, and native `_impact` offsets by only 0.14
  // along the normal, so the impact ink was laid inside the geometry.
  out.point.set(cx - nx * r, cy - ny * r, cz - nz * r);
  // face + uv from the dominant normal axis, with native's own indexing
  const ax = best.block.axes;
  let faceK = 0, faceD = -1, faceSign = 1;
  for (let k = 0; k < 3; k++) {
    const d = nx * ax[k].x + ny * ax[k].y + nz * ax[k].z;
    const ad = d < 0 ? -d : d;
    if (ad > faceD) { faceD = ad; faceK = k; faceSign = d >= 0 ? 1 : -1; }
  }
  const faces = best.block.faces;
  out.face = faces ? (faces[faceK * 2 + (faceSign > 0 ? 0 : 1)] ?? -1) : -1;
  if (out.face >= 0) {
    const f = level.faces?.[out.face];
    if (f) {
      const px = out.point.x - f.origin.x, py = out.point.y - f.origin.y, pz = out.point.z - f.origin.z;
      out.u = px * f.u.x + py * f.u.y + pz * f.u.z;
      out.v = px * f.v.x + py * f.v.y + pz * f.v.z;
    }
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
// A shared PURE helper for the three native projectile paint-credit sites.
//
// The gauge policy after a special ends is UNKNOWN, so the ordinary native
// `addTurf` semantics are preserved exactly. What this refuses is authority: a
// ghost or a side lobe lays no ink and credits no turf.
//
// It is PURE. It used to call `owner.addTurf(area)` itself, and the native line
// still called `owner.addTurf(kitPaintCredit(...))` around it, so every
// authoritative projectile credited turf TWICE - ordinary guns included - and a
// refused projectile still reached `addTurf(0)`. It returns the credit amount and
// nothing else; the native `addTurf` stays the single credit site.
//
// Paint MUST NOT run before the credit test for a projectile with no authority,
// so each native site gates the whole statement on `kitPaintAuthority` first.
// `_impact` lays paint at its own top, and that method is already refused there.
//
// The rule is intrinsic: it reads the projectile's own identity, never
// `G.netm`. A transport mute only stops RECORDING, so it cannot be the test - a
// mute based guard would start letting kit ghost ink through as soon as
// `G.netm` is null.
export function kitPaintAuthority(p) {
  if (!p) return false;
  if (isKitProjectile(p)) return hasAuthority(p);
  // every ordinary native projectile keeps the native rule exactly
  return !(p.ghost && KIT_GHOST_WIDS.has(p.wid));
}

// The credit amount for one paint: the area for an authoritative projectile,
// zero for a ghost, a side lobe or anything without an owner.
export function kitPaintCredit(p, area) {
  if (!kitPaintAuthority(p)) return 0;
  const a = p.owner;
  if (!a || typeof a.addTurf !== 'function') return 0;
  return area;
}

// The shared volley ledger (`p.vol.hits`) is the native one-hit-per-victim
// dedupe. Native appends the victim even when the projectile deals no damage, so
// a visual side lobe that is stepped BEFORE the carrier marks the victim as
// already hit and silently suppresses the carrier's real hit; the order of the
// lobes in the one native list then decides whether the volley damages anything.
// Only the carrier may write this ledger, for any projectile.
// Ordinary drop / slosh rounds keep the native shared-vol semantics untouched.
export function kitVolleyHitAuthority(p) {
  if (!isKitProjectile(p)) return true;
  return hasAuthority(p);
}

// ---- pooled reuse ------------------------------------------------------------
export function kitTrizookaClearPooled(p) {
  if (!p) return p;
  // native _new does not reset damage/grav/drag, so a kit round must, or the
  // next borrower of this pooled object inherits them
  const wasKit = isKitProjectile(p) || p.s3SpecialWeapon?.kind === TRIZOOKA_WID;
  for (const k of TRIZOOKA_PROJECTILE_FIELDS) delete p[k];
  for (const k of ['s3Stage', 's3StageFrames', 's3StageTransition', 's3AppliedStage', 's3ActorRadius', 's3WorldRadius', 's3SizeBase', 's3OrbitApplied']) delete p[k];
  if (wasKit) { p.damage = 0; p.dmgFar = undefined; p.grav = 0; p.drag = 0; }
  return p;
}

// ---- ghost reconstruction ----------------------------------------------------
//
// The descriptor is rebuilt from SPECIALS[wid].projectileDescriptor, which is
// the contract the parent established. A ghost keeps the presentation state and
// never authority.
//
// The volley identity is appended to the MAIN PROJECTILE packet only (never the
// bomb or the sub event) and is validated here: without it a replayed volley
// arrives as three ghosts that all orbit on phase 0, so the lobes overlap
// instead of staying 120 degrees apart. Values are bounded on the way in, so a
// malformed or hostile packet cannot inject a large phase or a negative index,
// and an OLD packet that has no such field simply restores lobe 0.
function wireIndex(v, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const i = Math.floor(n);
  return i > max ? max : i;
}

// Packer side of the same bound, so a malformed local value can never put a
// negative, fractional or unbounded index on the wire.
export function kitVolleyPacketIndex(v) {
  return wireIndex(v, 255);
}

export function kitTrizookaGhost(p, actor, SPECIALS, wire) {
  if (!isKitProjectile(p)) return p;
  const ap = wire?.specialPowerAP;
  p.s3TrizookaAP = Number.isFinite(ap) ? Math.max(0, Math.min(57, ap)) : 0;
  const entry = (SPECIALS || SPECIALS_CONFIG)?.[TRIZOOKA_WID];
  const descriptor = typeof entry?.projectileDescriptor === 'function'
    ? entry.projectileDescriptor(p)
    : entry?.descriptor ?? null;
  if (descriptor) p.s3SpecialWeapon = descriptor;
  if (wire) {
    p.s3VolleyIndex = wireIndex(wire.volleyIndex, 2);
    p.s3ActionIndex = wireIndex(wire.actionIndex, 255);
    p.s3OrbitPhase = p.s3VolleyIndex * TRIZOOKA_ORBIT.lobePhase;
  }
  // authority is forced off regardless of what the packet claimed
  p.damageOwner = false;
  p.ghost = true;
  return p;
}

// The Trizooka table gives two discrete distance-damage points (53 @2.5 and
// 35 @4.0). A continuous lerp would invent intermediate damage the table never
// states, so the blast steps instead.
export function kitTrizookaSteppedBands(p) {
  return hasAuthority(p);
}