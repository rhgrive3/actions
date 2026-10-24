// #1431: display-only pose-order connection for catalogue main-weapon births.
//
// WeaponRunner.update emits a round before Actor._finishFrame poses the
// Character for the same fixed tick, so a round taken directly from the rig
// socket is born at the PREVIOUS pose's muzzle. The physical birth, velocity,
// damage, paint, network packet and ink are deliberately left unchanged here
// (Issue #1431 owner diagnosis 2026-10-19). Only presentation is connected:
//   - the muzzle FX request is issued after the pose, at birth + (post-pose
//     socket - emission socket), i.e. at the muzzle that is actually drawn;
//   - the drawn projectile history's birth sample receives the same offset
//     (projectile-visuals.mjs). Later history samples stay physical, so the
//     rod joins the rendered muzzle to the physical round and still detaches.
// Raw rig births and Quad's verified native right-hand aim prediction connect
// to the drawn socket. Physical prediction stays unchanged. LOS / obstruction
// fallback, player-local offsets and delayed births keep their position.
// Splatoon 3 does not publish its bullet-birth or pose order; this is an
// INKWAVE presentation rule, not a retail measurement.
export const POSE_BIRTH_TAG = Symbol.for('inkwave.s3.catalog-pose-birth.v1');
/** World units. A larger same-tick socket move (respawn, form or weapon change) is not connected. */
export const POSE_BIRTH_MAX_CONNECT = 0.5;
const RAW_SOCKET_EPS2 = 1e-10;

export function installCatalogPoseBirth({ Actor, THREE, G }) {
  const proto = Actor?.prototype;
  if (!proto || !THREE) throw new TypeError('Actor and THREE are required for the catalogue pose-birth connection');
  if (Object.hasOwn(proto, POSE_BIRTH_TAG)) return proto[POSE_BIRTH_TAG];
  const raw = new THREE.Vector3(), live = new THREE.Vector3(), at = new THREE.Vector3();
  const pool = [];
  let open = null; // the emission between origin() and notify() of one action

  function socket(ch, hand, out) {
    if (!ch) return null;
    if (hand === null) return typeof ch.getMuzzle === 'function' ? ch.getMuzzle(out) : null;
    return typeof ch.getMuzzleHand === 'function' ? ch.getMuzzleHand(out, hand) : null;
  }
  const finite = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  function entry() {
    const e = pool.pop() || { actor: null, hand: null, raw: false, time: 0, sx: 0, sy: 0, sz: 0,
      ox: 0, oy: 0, oz: 0, rounds: [], seeds: [], fx: false, dir: new THREE.Vector3(), color: null, kind: 'shooter' };
    e.rounds.length = 0; e.seeds.length = 0; e.fx = false; e.color = null; e.actor = null;
    return e;
  }
  function release(e) { e.rounds.length = 0; e.seeds.length = 0; e.actor = null; e.color = null; pool.push(e); }

  // Called by origin() right after the native muzzle selection.
  function begin(actor, hand, origin, offset) {
    if (open) release(open);
    open = null;
    if (!actor || actor.remote || !origin || !finite(origin)) return;
    const e = entry();
    e.actor = actor; e.hand = hand; e.time = G.time;
    e.ox = origin.x; e.oy = origin.y; e.oz = origin.z;
    const s = offset ? null : socket(actor.character, hand, raw);
    e.raw = !!s && finite(s) && s.distanceToSquared(origin) <= RAW_SOCKET_EPS2;
    // Quad's first right shot can use _muzzle's native full-aim interpolation
    // before aimReady reaches .98. Match that exact selection, so an unrelated
    // or collision-constrained origin cannot acquire a visual connection.
    const ch = actor.character;
    if (!e.raw && s && !offset && hand === 0 &&
        actor.weapon?.catalogRecord?.id === 's3-maneuver-stepper') {
      const weight = ch.aimReady?.();
      if (Number.isFinite(weight) && weight >= 0 && weight < .98 &&
          ch.getAimMuzzle?.(live, actor.aimPitch) && finite(live)) {
        raw.lerp(live, 1 - weight);
        e.raw = finite(raw) && raw.distanceToSquared(origin) <= RAW_SOCKET_EPS2;
      }
    }
    if (e.raw) { e.sx = origin.x; e.sy = origin.y; e.sz = origin.z; }
    open = e;
  }
  // Called by spawn() for every round created from that origin.
  function attach(p, birth) {
    const e = open;
    if (!e || !e.raw || !p || p.owner !== e.actor || p.ghost || p.delay > 0) return;
    if (Math.abs(birth.x - e.ox) + Math.abs(birth.y - e.oy) + Math.abs(birth.z - e.oz) > 1e-12) return;
    p._s3PoseBirthOffset = null;
    e.rounds.push(p); e.seeds.push(p.seed);
  }
  // Called once by notify() for the action. With wantFx, returns true when the
  // muzzle FX request was taken over (issued after the pose); false means the
  // caller must issue it immediately at origin, exactly as before.
  function commit(actor, origin, direction, color, kind, wantFx) {
    const e = open;
    open = null;
    if (!e) return false;
    if (!e.raw || e.actor !== actor) { release(e); return false; }
    if (wantFx && origin && direction &&
        Math.abs(origin.x - e.ox) + Math.abs(origin.y - e.oy) + Math.abs(origin.z - e.oz) <= 1e-12) {
      e.fx = true; e.dir.copy(direction); e.color = color; e.kind = kind;
    }
    if (!e.fx && e.rounds.length === 0) { release(e); return false; }
    (actor._s3PoseBirths || (actor._s3PoseBirths = [])).push(e);
    return e.fx;
  }
  function close() { if (open) { release(open); open = null; } }

  function resolve(actor, posed) {
    const queue = actor._s3PoseBirths;
    if (!queue || queue.length === 0) return;
    for (let i = 0; i < queue.length; i++) {
      const e = queue[i];
      let dx = 0, dy = 0, dz = 0;
      if (posed && e.time === G.time && actor.alive !== false) {
        const s = socket(actor.character, e.hand, live);
        if (s && finite(s)) {
          dx = s.x - e.sx; dy = s.y - e.sy; dz = s.z - e.sz;
          const d2 = dx * dx + dy * dy + dz * dz;
          at.set(e.ox, e.oy, e.oz);
          if (!(d2 <= POSE_BIRTH_MAX_CONNECT * POSE_BIRTH_MAX_CONNECT) ||
              (d2 > 0 && typeof G.physics?.los === 'function' && !G.physics.los(at, s))) dx = dy = dz = 0;
        }
      }
      if (dx !== 0 || dy !== 0 || dz !== 0) for (let j = 0; j < e.rounds.length; j++) {
        const p = e.rounds[j];
        // A pooled round reused within the tick is never offset.
        if (p.owner !== actor || p.seed !== e.seeds[j] || p.ghost) continue;
        const o = p._s3PoseBirthOffset || (p._s3PoseBirthOffset = { x: 0, y: 0, z: 0, seed: 0 });
        o.x = dx; o.y = dy; o.z = dz; o.seed = p.seed;
      }
      if (e.fx) G.fx?.muzzle(at.set(e.ox + dx, e.oy + dy, e.oz + dz), e.dir, e.color, e.kind);
      release(e);
    }
    queue.length = 0;
  }
  const finish = proto._finishFrame, update = proto.update;
  proto._finishFrame = function (...args) {
    const result = finish.apply(this, args);
    resolve(this, true);
    return result;
  };
  // A frame that never reaches _finishFrame (early death / water return)
  // still issues its FX, unconnected, before the next tick.
  proto.update = function (...args) {
    try { return update.apply(this, args); }
    finally { close(); resolve(this, false); }
  };
  const api = Object.freeze({ begin, attach, commit, close, resolve });
  Object.defineProperty(proto, POSE_BIRTH_TAG, { value: api });
  return api;
}

/** Drawn birth-sample offset for a projectile at local age; null when it has none. */
export function poseBirthOffset(p, age) {
  const o = p?._s3PoseBirthOffset;
  return o && o.seed === p.seed && !(age > 1e-9) ? o : null;
}
