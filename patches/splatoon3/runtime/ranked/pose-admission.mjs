// Host-only ranked objective pose admission. Cosmetic interpolation is unchanged.
// This is a plausibility gate, not a fully authoritative server movement simulator:
// it bounds what an owner-reported pose may do relative to the last admitted pose,
// on the host's own receive clock, but it does not re-run the owner's collision.
const ALIVE = 1, SQUID = 2, GROUNDED = 16, SPECIAL = 8192, SJ_CHARGE = 16384, SJ_FLIGHT = 32768;
const SJ = SJ_CHARGE | SJ_FLIGHT;
const ADOPTION_TAG = 'inkwave-adoption-v1';
const finite = Number.isFinite;
const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const flat = (a,b) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const vec = p => Array.isArray(p) ? (p.length >= 3 && p.slice(0,3).every(finite) ? [p[0],p[1],p[2]] : null)
  : p && [p.x,p.y,p.z].every(finite) ? [p.x,p.y,p.z] : null;

// Numeric provenance (#1648). Movement rates come from the pinned Ver. 11.3.0
// tables already used by INKWAVE; the margins are INKWAVE tolerances, not
// retail anti-cheat values (Splatoon 3 is peer-to-peer and publishes none).
export const RANKED_POSE_LIMITS = Object.freeze({
  // Leanny splat3 data/parameter/1130/misc/params.json MoveVel_Stealth reaches
  // 0.24 DU/F at 57 AP for every weight class (weapon-weight.mjs) = 14.4 WU/s.
  // ×1.25 for slopes/knockback/rounding. Long-run horizontal budget (token rate).
  sustainedSpeed: 18,
  // Fastest horizontal action implemented in INKWAVE: Reefslider dash top
  // speed .405 DU/F (WeaponSpSkewer, all-specials.mjs) = 24.3 WU/s, ×1.25.
  // Kraken dash 21, Zipcaster 19 and Dualie roll 5 WU / 0.2 s stay below.
  peakSpeed: 30.4,
  // Existing per-sample position slack, kept from the original gate.
  sampleSlack: 1,
  // Burst above sustainedSpeed: Reefslider ≤54F at 24.3 exceeds 18 WU/s by
  // ≈5.7 WU; Kraken (35F at 21) by ≈1.8; a Dualie roll by ≈1.4.
  burst: 6,
  // Original vertical bound (per-sample 2.5 + 19 WU/s), now on credited time.
  verticalSlack: 2.5, verticalSpeed: 19,
  // Host-observed time the sender clock may be ahead of the host receive clock
  // (bunched delivery after a spike). Larger spikes hold, then recover.
  clockSlack: .5, initialClockSlack: .25,
  // Without a host receive clock, the original 0.35 s per-sample cap applies.
  legacyMaxStep: .35,
  initialRadius: 15, floorTolerance: 2.5,
  // PLAYER.footRadius .24 + ledgeAssist .35: the native ground probe supports
  // ledge lips the actor centre is not above.
  floorProbe: .59,
  // Native Actor.respawn: spawn pad + 1.1 slot ring, 4.5 above, falling.
  respawnRadius: 4, respawnBelow: 2.5, respawnAbove: 6.5,
  // Fixed landings (home point, pad, Bubbler/Beakon, special return origin)
  // and teammates (1.1 offset, last-ground point, receive lag).
  landingRadius: 3, allyLandingRadius: 6, landingHeight: 4,
  // Native flight: XZ lerp from→to, apex 11 + 0.08·distance (actor.js).
  flightCorridor: 2, flightMargin: 3, flightApexBase: 11, flightApexScale: .08,
  // Host-time slack for bunched owner packets, not a retail network constant.
  flightClockSlack: .35, flightProgressMargin: 3,
  // Quick Super Jump at 57 AP leaves 80F×0.25 = 20F of charge (> 0.25 s).
  chargeMin: .25,
  boundsMargin: 16, ceiling: 40, floorBelow: 10,
});
const L = RANKED_POSE_LIMITS;
const FLOOR_PROBE_OFFSETS = [[0,0],[1,0],[-1,0],[0,1],[0,-1]];

export function objectiveSpecialFor(actor, command) {
  return actor?.specialActive?.id ?? command?.special ?? null;
}

// Stage AABB from the level's declared bounds and its collision geometry.
const levelBounds = new WeakMap();
export function rankedStageBounds(level) {
  if (!level || typeof level !== 'object') return null;
  if (levelBounds.has(level)) return levelBounds.get(level);
  let b = null;
  const d = level.bounds;
  if (d && [d.minX,d.maxX,d.minZ,d.maxZ].every(finite)) b = { minX:d.minX, maxX:d.maxX, minZ:d.minZ, maxZ:d.maxZ, maxY:-Infinity };
  const grow = (min, max) => {
    if (![min?.x,min?.z,max?.x,max?.y,max?.z].every(finite)) return;
    b ||= { minX:Infinity, maxX:-Infinity, minZ:Infinity, maxZ:-Infinity, maxY:-Infinity };
    b.minX = Math.min(b.minX, min.x); b.maxX = Math.max(b.maxX, max.x);
    b.minZ = Math.min(b.minZ, min.z); b.maxZ = Math.max(b.maxZ, max.z); b.maxY = Math.max(b.maxY, max.y);
  };
  if (Array.isArray(level.blocks)) for (const block of level.blocks) grow(block?.aabbMin, block?.aabbMax);
  const n = level.triangleWorld?.nodes;
  if (n && n.length >= 6) grow({x:n[0],z:n[2]}, {x:n[3],y:n[4],z:n[5]});
  if (b && ![b.minX,b.maxX,b.minZ,b.maxZ].every(finite)) b = null;
  levelBounds.set(level, b);
  return b;
}
function insideStage(p, ctx) {
  const b = rankedStageBounds(ctx?.level);
  if (!b) return true;
  const m = L.boundsMargin;
  if (p[0] < b.minX - m || p[0] > b.maxX + m || p[2] < b.minZ - m || p[2] > b.maxZ + m) return false;
  if (finite(b.maxY) && p[1] > b.maxY + L.ceiling) return false;
  return !finite(ctx.fallDeathY) || p[1] >= ctx.fallDeathY - L.floorBelow;
}

// Nearest walkable floor around the feet; null when no column has one.
function nearestFloor(world, p) {
  if (typeof world?.floorAt !== 'function') return undefined;
  let best = null;
  for (const [ox,oz] of FLOOR_PROBE_OFFSETS) {
    const y = world.floorAt(p[0] + ox*L.floorProbe, p[2] + oz*L.floorProbe, p[1] + 1.8);
    if (finite(y) && (best === null || Math.abs(p[1]-y) < Math.abs(p[1]-best))) best = y;
  }
  return best;
}

// Owner-claimed Super Jump flight geometry (adoption sidecar row[23][5]).
function flightOf(row) {
  const a = row[23];
  if (!Array.isArray(a) || a[0] !== ADOPTION_TAG) return null;
  const j = a[5];
  if (!Array.isArray(j) || j.length !== 16 || j[0] !== 1) return null;
  const from = vec(j.slice(3,6)), to = vec(j.slice(6,9));
  return from && to ? { from, to } : null;
}
function nearLanding(p, ctx, state, actor) {
  const near = (q, r) => q && flat(p,q) <= r && Math.abs(p[1]-q[1]) <= L.landingHeight;
  for (const q of ctx?.landings?.(actor) || []) if (near(vec(q), L.landingRadius)) return true;
  for (const q of ctx?.allies?.(actor) || []) if (near(vec(q), L.allyLandingRadius)) return true;
  return near(state.specialOrigin, L.landingRadius);
}
function inFlightCorridor(p, f) {
  const dx = f.to[0]-f.from[0], dz = f.to[2]-f.from[2], len2 = dx*dx + dz*dz;
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((p[0]-f.from[0])*dx + (p[2]-f.from[2])*dz) / len2)) : 0;
  const off = Math.hypot(p[0] - (f.from[0] + dx*t), p[2] - (f.from[2] + dz*t));
  const apex = L.flightApexBase + L.flightApexScale * dist(f.from, f.to);
  return off <= L.flightCorridor && p[1] >= Math.min(f.from[1], f.to[1]) - L.flightMargin &&
    p[1] <= Math.max(f.from[1], f.to[1]) + apex + L.flightMargin;
}
// A sender can forge a valid SJ destination and charge flags. Its in-bounds
// flight corridor alone cannot authorize arrival at that destination in one tick.
// Compare horizontal ease-out progress to the receiver's clock, not a sender
// supplied `jump.t` or packet timestamp (except in pure legacy test contexts).
function inFlightTime(p, f, clock) {
  const length = flat(f.from, f.to);
  if (length < 1e-6) return true;
  const duration = 1.15 + Math.min(.6, length / 80);
  const elapsed = Math.max(0, clock - f.startedAt);
  const u = Math.min(1, (elapsed + L.flightClockSlack) / duration);
  const ease = u < .5 ? 2*u*u : 1 - 2*(1-u)*(1-u);
  const dx = f.to[0]-f.from[0], dz=f.to[2]-f.from[2];
  const along = ((p[0]-f.from[0])*dx+(p[2]-f.from[2])*dz)/length;
  return along <= length*ease + L.flightProgressMargin;
}
function nearRespawn(p, actor, ctx) {
  const pad = vec(ctx?.level?.spawnPads?.[actor?.team]);
  if (!pad) return false;
  return flat(p,pad) <= L.respawnRadius && p[1] >= pad[1] - L.respawnBelow && p[1] <= pad[1] + L.respawnAbove;
}

// ctx (host only): { now: host receive clock seconds, level, fallDeathY,
//   landings(actor) fixed Super Jump points, allies(actor) teammate points }.
export function admitRankedPose(state, row, actor, ts, world, ctx = null) {
  if (!state || !Array.isArray(row) || row.length < 21 || !finite(ts) ||
      !row.slice(1,4).every(finite) || !Number.isSafeInteger(row[10]) ||
      !Number.isSafeInteger(row[16]) || row[16] < 0) return false;
  const next = [row[1],row[2],row[3]], flags = row[10], prev = state.last;
  const now = finite(ctx?.now) ? ctx.now : null;
  if ((flags & ALIVE) && !insideStage(next, ctx)) return false;
  let grounded = !!(flags & GROUNDED);
  if (grounded) {
    const floor = nearestFloor(world, next);
    if (finite(floor) && Math.abs(next[1] - floor) > L.floorTolerance) return false;
    // A grounded claim with no walkable floor in any probed column is not
    // objective support; the pose itself is still judged by motion bounds.
    if (floor === null) grounded = false;
  }
  let flight = state.flight ?? null, tokens = prev?.tokens ?? L.burst, slack = prev?.slack ?? L.initialClockSlack;
  let specialOrigin = state.specialOrigin;
  if (!prev) {
    const spawn = vec(actor?.pos);
    if (!spawn || dist(next, spawn) > L.initialRadius) return false;
  } else {
    const elapsed = ts - prev.t;
    if (!finite(elapsed) || elapsed <= 0) return false;
    const hostDt = now !== null && finite(prev.host) ? Math.max(0, now - prev.host) : null;
    // Sender time is credited only as fast as the host clock advances (plus
    // a bounded bank for bunched delivery): a forged ts gains nothing.
    const credit = hostDt === null ? Math.min(L.legacyMaxStep, elapsed) : Math.min(elapsed, hostDt + slack);
    if (hostDt !== null) slack = Math.min(L.clockSlack, slack + hostDt - credit);
    const charged = state.jumpSince !== undefined && ts - state.jumpSince >= L.chargeMin;
    if (row[16] !== prev.tp) {
      if (row[16] !== prev.tp + 1) return false;
      // #1728: only a verified death-to-respawn transition can advance netTp.
      // Native Super Jump/return flight keeps its epoch; sender-controlled SJ flags
      // and a host-known landing are not proof of authority to teleport instantly.
      const respawn = !(prev.flags & ALIVE) && !!(flags & ALIVE) && nearRespawn(next, actor, ctx);
      if (!respawn) return false;
      tokens = L.burst; flight = null; specialOrigin = undefined;
      slack = L.initialClockSlack;
    } else {
      const claimed = (flags & SJ_FLIGHT) && (flags & ALIVE) ? flightOf(row) : null;
      const same = claimed && flight && dist(claimed.to, flight.to) < 1e-3 && dist(claimed.from, flight.from) < 1e-3;
      if (claimed && !same && (prev.flags & SJ) && charged && dist(claimed.from, prev.pos) <= L.flightCorridor + L.sampleSlack &&
          nearLanding(claimed.to, ctx, state, actor)) flight = { ...claimed, startedAt: now ?? ts };
      else if (!same) flight = null;
      if (flight && inFlightCorridor(next, flight) && inFlightTime(next, flight, now ?? ts)) {
        // An approved flight follows its host-checked corridor, not run speed.
      } else {
        if (!(flags & SJ_FLIGHT)) flight = null;
        const dx = next[0]-prev.pos[0], dz = next[2]-prev.pos[2], horizontal = Math.hypot(dx,dz);
        if (horizontal > L.sampleSlack + L.peakSpeed * credit ||
            Math.abs(next[1]-prev.pos[1]) > L.verticalSlack + L.verticalSpeed * credit) return false;
        const available = tokens + L.sustainedSpeed * credit;
        if (horizontal > available) return false;
        if (horizontal > 1.5 && world?.blocked?.(
          [prev.pos[0],prev.pos[1]+.8,prev.pos[2]], [next[0],next[1]+.8,next[2]])) return false;
        tokens = Math.min(L.burst, available - horizontal);
      }
    }
    if ((flags & SPECIAL) && !(prev.flags & SPECIAL)) specialOrigin = prev.pos.slice();
  }
  if ((flags & SJ) && state.jumpSince === undefined) state.jumpSince = ts;
  if (!(flags & SJ)) { state.jumpSince = undefined; flight = null; }
  state.flight = flight; state.specialOrigin = specialOrigin;
  state.last = {pos:next,t:ts,tp:row[16],flags,grounded,squid:!!(flags & SQUID),host:now,tokens,slack};
  return true;
}

// One input edge belongs to the native actor/life/session that admitted it.
// Keep object capabilities out of snapshots and debug JSON.
const inputOwners = new WeakMap();
export function bindRankedInput(input, actor, match, nm) {
  const life=actor?.net?.lastLife;
  if (!input || typeof input!=='object' || !actor || typeof actor.owner!=='string' || !actor.owner || !match || !nm?.s || nm.match!==match ||
      !Number.isSafeInteger(life) || life<0) return null;
  inputOwners.set(input,{actor,match,session:nm.s,owner:actor.owner,life,matchId:nm.cfg?.id});
  return input;
}
export function rankedInputFor(input, actor, match, nm) {
  const own=input&&inputOwners.get(input);
  if (own && nm?.s && nm.match===match && own.actor===actor && own.match===match &&
      own.session===nm.s && own.owner===actor?.owner && own.life===actor?.net?.lastLife &&
      own.matchId===nm.cfg?.id) return input;
  if (own) inputOwners.delete(input); // Observed epoch retirement cannot revive.
  return null;
}
