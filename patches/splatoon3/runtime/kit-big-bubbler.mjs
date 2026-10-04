// Big Bubbler (Splat Roller special; internal id SpGreatBarrier) for the
// composed public INKWAVE runtime.
//
// Reference: Splatoon 3 Ver. 11.3.0, splat3 commit
// 7280ff9cde8bb1c5dcef46c700c326471584d2e6. Pinned primary receipts:
//   evidence/actions-freebuff-20261004/kit-primary/
//     WeaponSpGreatBarrier.game__GameParameterTable.json
//       #/GameParameters/spl__BulletSpGreatBarrierMoveParam/BarrierParam
//       #/GameParameters/spl__BulletSpGreatBarrierMoveParam/DroneParam
//       #/GameParameters/spl__BulletSpGreatBarrierMoveParam/BaseParam
//     WeaponInfoSpecial.json  (__RowId "SpGreatBarrier", Id 2, StandAlone false)
//     base-kit-fields.json    (Roller_Normal_00 -> SpGreatBarrier, SpecialPoint 180)
//
// This module owns ONLY the deployed structure, its visual, its expiry and a
// projectile CONTACT QUERY. It never simulates paint, damage or physics on its
// own: paint goes through G.paint.splat and damage through the native
// Projectiles.applyHit. It is not a renamed Tidal Slam / Ink Tempest and it
// grants no invulnerability. Actors may walk into the dome and shoot from
// inside; only enemy rounds are stopped, and only when the native owner decides
// this dome is the first contact.
//
// One physics truth: the module integrates nothing and wraps no native step. The
// caller passes the segment the native pipeline is already stepping, the module
// answers a candidate, and only the caller's nearest-contact arbitration decides
// who wins. A candidate is inert: reading it changes no position, no HP, no turf
// and emits nothing. onHit() is the only mutation, and it is idempotent.
//
// There is NO predictive fallback. A previous revision wrapped
// Projectiles._step and intercepted by itself; that duplicated the native
// gravity/drag integration and could claim a contact that a nearer wall already
// owned, i.e. two physics truths. Projectiles.prototype._step is never touched
// here, and a test asserts it is byte-identical to the composed native one.
//
// Two hand-offs are provided and neither is wired by this lane:
//   * kitBarrierCandidate / Projectiles.prototype.kitBarrierCandidate - the round
//     and blast contact query the parent arbitrates (see the report).
//   * kitBarrierShelter - the explosion shielding handoff, which only adds one
//     more candidate to the native first-contact test and never touches invuln.
//
// Replay is concrete but deliberately limited: replayBigBubbler('deploy'|'hit'|
// 'expire', owner, plainPayload) ingests a validated, bounded, idempotent packet
// into a PRESENTATION-ONLY dome, and resetBigBubblerReplay() is the match reset.
// See BIG_BUBBLER_OWNERSHIP for the exact split. There is NO online parity claim:
// no net code, transport, prediction, reconciliation or rollback is implemented
// here, and a local round hitting a remote dome only PROPOSES damage.
//
// Everything in BIG_BUBBLER_CALIBRATION is a DECLARED mapping, not a source.
// The 11.3.0 tables pin raw internal numbers whose engine scale is not publicly
// documented; see reports/public-kit-big-bubbler-20261004.md.

const BUBBLER_ID = 'bubbler';
const INSTALL = Symbol.for('inkwave.s3.kit-big-bubbler.install.v1');

// Pinned raw 11.3.0 values (verbatim from the receipts above).
export const BIG_BUBBLER_RAW = Object.freeze({
  maxHp: 15360,                  // BarrierParam.MaxHP.Low        (0 AP Ink Resistance)
  maxFieldHp: 30720,             // BarrierParam.MaxFieldHP.Low
  maxHpMid: 16896,               // BarrierParam.MaxHP.Mid
  maxHpHigh: 18432,              // BarrierParam.MaxHP.High
  timeDamage: 921,               // BarrierParam.TimeDamage
  timeDamageOnVLift: 1842,       // BarrierParam.TimeDamageOnVLift
  minRadius: 2.255,              // BarrierParam.MinRadius
  maxRadius: 7.5,                // BarrierParam.MaxRadius
  canopyKnockBack: 700,          // BarrierParam.CanopyKnockBack
  damageRatio: 0.64,             // BarrierParam.DamgeRatio (spelling is Nintendo's)
  ascendFrames: 30,              // DroneParam.AscendFrame
  ascendHeight: 8.5,             // DroneParam.AscendHeight
  ignitionFrames: 15,            // DroneParam.IgnitionFrame
  fieldCollisionRadius: 0.4,     // DroneParam.FieldCollisionRadius
  overlapFieldDamage: 5,         // DroneParam.OverlapFieldDamage
  overlapFieldDamageInterval: 5, // DroneParam.OverlapFieldDamageInterval
  paintRadius: 4.5,              // BaseParam.PaintRadius
  radiusCurve: Object.freeze({   // BarrierParam.RadiusRatioCurve
    Data: Object.freeze([0.1940299, 0.0, 0.0, 0.6522388, 0.3726415, -0.02766653,
      0.8723881, 0.75, 1.1808, 1.0, 1.0, 4.740566]),
    MaxX: 1.0, Type: 'Hermit2DSmooth',
  }),
  ascendCurve: Object.freeze({   // DroneParam.AscendCurve
    Data: Object.freeze([0.0, 0.0, 0.0, 0.25, 0.1122642, 0.8181818, 0.5, 0.5,
      2.926098, 0.6830189, 0.8556603, 1.395833, 1.0, 1.0, 0.0]),
    MaxX: 1.0, Type: 'Hermit2DSmooth',
  }),
});

// DECLARED calibration: what is pinned and what is assumed.
export const BIG_BUBBLER_CALIBRATION = Object.freeze({
  status: 'declared calibration; the 11.3.0 raw internal scale for MaxHP/MaxFieldHP/TimeDamage is unconfirmed',
  // Raw dome HP units per one INKWAVE damage unit. DECLARED. It is NOT the
  // weapons' damage factor and is deliberately not HP/10.
  rawPerDamageUnit: 100,
  // TimeDamage cadence. DECLARED per second: a per-frame reading ends a full
  // canopy in 16.7 ticks (0.28 s), which contradicts the observable multi-second
  // dome, so that reading is rejected as an inference. One constant switches it.
  timeDamageIntervalSeconds: 1,
  // Radius growth window. DECLARED mapping onto the pinned drone frames.
  radiusGrowthSeconds: 45 / 60,
  // Landing point ahead of the owner. DECLARED: the tables carry no throw
  // distance or arc, and no throw animation is implemented.
  deployDistance: 3,
  // Paint the interior at ignition using the pinned BaseParam.PaintRadius.
  paintAtIgnition: true,
  // OverlapFieldDamage is left OFF: its unit is unresolved (read through the
  // canopy mapping it is 5/100 = 0.05 INKWAVE damage per tick), so enabling it
  // would assert gameplay that no receipt supports.
  overlapFieldDamage: false,
  // Owner respawn runs Actor.reset(); erasing there would delete the dome right
  // after the owner's own death, which the reference does not do.
  eraseOnOwnerReset: false,
});

// Two disjoint lists, never mixed:
//   domes       AUTHORITATIVE, owned by this client. Paint, TimeDamage burn and
//               incoming-shot HP happen here and nowhere else.
//   remoteDomes PRESENTATION ONLY. A replayed deploy is drawn and can intercept a
//               visual ghost, but this client never spends its HP: a local round
//               produces a damage PROPOSAL for the parent's authoritative path.
let api, tuning, raw, domes = [], remoteDomes = [];
let probeRecord = null, bestRecord = null;
let deploySerial = 0, localOwnerSerial = 0;
// Bounded FIFO of already-applied replay event keys, so duplicate packets are
// idempotent without an unbounded set.
const seenReplay = new Set();
const activating = new WeakSet();

const REPLAY_SEEN_LIMIT = 256;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// What this lane owns, stated explicitly so the network lane never has to guess
// whether a gap is a decision or an omission. There is NO online parity claim:
// no packet transport, no prediction, no reconciliation, no rollback lives here.
export const BIG_BUBBLER_OWNERSHIP = Object.freeze({
  owns: Object.freeze([
    'authoritative local dome lifecycle (deploy, growth, ignition, TimeDamage burn, expiry)',
    'presentation-only remote dome lifecycle driven by replayBigBubbler()',
    'side-effect-free contact candidate queries for local and remote domes',
    'bounded, idempotent replay ingest of deploy / hit / expire',
  ]),
  doesNotOwn: Object.freeze([
    'packet transport, framing, rate limiting or any NetMatch wiring',
    'authoritative HP of a remote dome: the host decides, this client only proposes',
    'client prediction, interpolation, reconciliation or rollback',
    'adjudicating whether a proposed remote hit is accepted',
  ]),
  remoteHpAuthority: 'the host; a local round hitting a remote dome yields kit:bubbler:damage-proposal and changes nothing here',
  neutralPolicy: 'a neutral or non-integer round team never spends HP; it can only intercept visually',
});

// Nintendo "Hermit2DSmooth": Data is [value, inSlope, outSlope] per point, x is
// uniform across [0, MaxX], and the curve is C1 through the pinned points.
export function hermite2d(curve, x) {
  const data = curve?.Data;
  if (!Array.isArray(data) || data.length < 6) return 0;
  const n = Math.floor(data.length / 3);
  if (n < 2) return 0;
  const maxX = curve.MaxX || 1;
  const u = clamp(x / maxX, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u)), t = u - i, t2 = t * t, t3 = t2 * t;
  const dx = maxX / (n - 1);
  const y0 = data[i * 3], m0 = data[i * 3 + 2];
  const y1 = data[(i + 1) * 3], m1 = data[(i + 1) * 3 + 1];
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * dx * m0
    + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * dx * m1;
}

export const bigBubblerDomes = () => domes;
export const bigBubblerRemoteDomes = () => remoteDomes;

/**
 * The real network identity of an actor, used to stamp dome ids.
 *
 * Actor.slot is NOT an identity: two actors on the same team can share it, and
 * combining it with stats.specials collides whenever two players deploy the same
 * number of specials. The live net id (Actor.nid, set by match.js from the room
 * roster) is used whenever it exists; otherwise this module mints one stable
 * per-actor-instance key rather than pretending slot identifies anybody.
 */
export function bigBubblerOwnerId(owner) {
  const nid = owner?.nid ?? owner?.id;
  if (nid !== undefined && nid !== null && nid !== '') return `n${nid}`;
  if (!owner || typeof owner !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(owner, OWNER_KEY)) {
    Object.defineProperty(owner, OWNER_KEY, {
      value: `l${++localOwnerSerial}`, enumerable: false, configurable: true, writable: false,
    });
  }
  return owner[OWNER_KEY];
}
const OWNER_KEY = '__inkwaveKitBubblerOwnerKey';

// ---------------------------------------------------------------- structure

let groundProbeOut = null;

function groundHeightAt(x, z, fromY) {
  const physics = api.G.physics;
  if (physics?.groundProbe) {
    // The native probe fills a GroundHit: it copies .normal and reads .block, so
    // a bare {hit,y} stub makes it throw. Keep one reused full record.
    groundProbeOut = groundProbeOut || {
      hit: false, y: fromY, normal: new api.THREE.Vector3(0, 1, 0), block: -1,
      face: -1, u: 0, v: 0, center: false, grate: false,
    };
    groundProbeOut.hit = false; groundProbeOut.y = fromY;
    physics.groundProbe(x, fromY + 0.5, z, 0.5, 0.5, api.PLAYER?.footRadius ?? 0.24, groundProbeOut, false);
    if (groundProbeOut.hit) return groundProbeOut.y;
  }
  const h = api.G.level?.groundHeight?.(x, z, fromY + 0.6);
  return Number.isFinite(h) ? h : fromY;
}

function buildVisual(dome) {
  const { THREE } = api, scene = api.G.scene;
  if (!scene) return;
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: dome.color, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false }));
  shell.castShadow = false; shell.receiveShadow = false; shell.frustumCulled = false;
  const emitter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(raw.fieldCollisionRadius, 1),
    new THREE.MeshBasicMaterial({ color: dome.color }));
  emitter.frustumCulled = false;
  group.add(shell, emitter);
  group.position.copy(dome.pos);
  group.renderOrder = 4;
  scene.add(group);
  dome.group = group; dome.shell = shell; dome.emitterMesh = emitter;
}

function releaseVisual(dome) {
  if (api.G.scene && dome.group) api.G.scene.remove(dome.group);
  dome.group?.traverse(o => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach(x => x?.dispose?.()); else m?.dispose?.();
  });
  dome.group = dome.shell = dome.emitterMesh = null;
}

function listOf(dome) { return dome.remote ? remoteDomes : domes; }

function removeDome(dome, reason) {
  const list = listOf(dome);
  const i = list.indexOf(dome);
  if (i < 0) return false;
  list.splice(i, 1);
  dome.dead = true;
  releaseVisual(dome);
  // A remote dome's disappearance is presentation, not gameplay, so it is a
  // separate stream and never claims the authoritative collapse event.
  api.emit?.(dome.remote ? 'kit:bubbler:remote:gone' : 'kit:bubbler:collapse', {
    owner: dome.owner, domeId: dome.id, serial: dome.serial, team: dome.team,
    pos: dome.pos.clone(), reason,
  });
  return true;
}

function makeDome({ id, serial, owner, team, pos, remote }) {
  return {
    id, serial, owner, team, pos, t: 0, remote: !!remote,
    color: new api.THREE.Color(api.G.teamColors?.[team] ?? 0xffffff),
    hp: raw.maxHp, hpMax: raw.maxHp,
    fieldHp: raw.maxFieldHp, fieldHpMax: raw.maxFieldHp,
    radius: raw.minRadius, emitterY: 0, ignited: false,
    burnAccum: 0, overlapAccum: 0, dead: false,
  };
}

function deploy(owner) {
  const { THREE } = api;
  const yaw = owner.aimYaw ?? owner.yaw ?? 0;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  const x = owner.pos.x + forward.x * tuning.deployDistance;
  const z = owner.pos.z + forward.z * tuning.deployDistance;
  const pos = new THREE.Vector3(x, groundHeightAt(x, z, owner.pos.y), z);
  const serial = ++deploySerial;
  const dome = makeDome({
    id: `${owner.team}:${bigBubblerOwnerId(owner) ?? 'unknown'}:${serial}`,
    serial, owner, team: owner.team, pos, remote: false,
  });
  buildVisual(dome);
  domes.push(dome);
  syncVisual(dome);
  api.G.fx?.ring?.(pos.clone().setY(pos.y + 0.05), new THREE.Vector3(0, 1, 0), dome.color,
    { radius: raw.maxRadius, life: 0.5 });
  api.emit?.('kit:bubbler:deploy', {
    owner, domeId: dome.id, serial: dome.serial, team: owner.team,
    pos: pos.clone(), hp: dome.hp, fieldHp: dome.fieldHp,
  });
  return dome;
}

function radiusAt(t) {
  const ratio = hermite2d(raw.radiusCurve, clamp(t / (tuning.radiusGrowthSeconds || 1), 0, 1));
  return raw.minRadius + (raw.maxRadius - raw.minRadius) * ratio;
}

function syncVisual(dome) {
  if (!dome.shell) return;
  dome.shell.scale.setScalar(Math.max(0.001, dome.radius));
  dome.emitterMesh.position.set(0, dome.emitterY, 0);
}

// ------------------------------------------------------------------- damage

// Applies HP only. Called by the candidate's own handler once the native owner
// has selected this dome as the first contact.
//
// `cause` selects the event name so an INCOMING projectile contact
// ('kit:bubbler:hit', the only one a remote proxy replays as a hit) is never
// confused with the internal TimeDamage burn or the optional overlap tick.
function damageDome(dome, target, amount, cause = 'shot') {
  if (dome.dead || !(amount > 0)) return 0;
  if (target === 'field') dome.fieldHp = Math.max(0, dome.fieldHp - amount);
  else dome.hp = Math.max(0, dome.hp - amount);
  api.emit?.(cause === 'shot' ? 'kit:bubbler:hit' : `kit:bubbler:${cause}`, {
    owner: dome.owner, domeId: dome.id, team: dome.team, target, amount, cause,
    hp: dome.hp, fieldHp: dome.fieldHp,
  });
  if (dome.hp <= 0 || dome.fieldHp <= 0) removeDome(dome, target === 'field' ? 'emitter-destroyed' : 'canopy-destroyed');
  return amount;
}

// ------------------------------------------------------------------- query

// First entry of [start,end] into a sphere, or null. A segment that starts
// inside returns null, so a round fired from within the dome may leave.
function sphereEntry(cx, cy, cz, r, start, end) {
  const ox = start.x - cx, oy = start.y - cy, oz = start.z - cz;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  if (c <= 0) return null;
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t < 0 || t > 1 ? null : t;
}

// Earliest of the canopy shell and the (once ignited, exposed) emitter. Both are
// real targets: the emitter rises above the shell and stays reachable.
function domeEntry(dome, start, end, radius, out) {
  const tShell = sphereEntry(dome.pos.x, dome.pos.y, dome.pos.z, Math.max(0.01, dome.radius + radius), start, end);
  const tField = dome.ignited
    ? sphereEntry(dome.pos.x, dome.pos.y + dome.emitterY, dome.pos.z, raw.fieldCollisionRadius + radius, start, end)
    : null;
  if (tShell === null && tField === null) return null;
  const t = tField === null ? tShell : tShell === null ? tField : Math.min(tShell, tField);
  out.dome = dome; out.t = t;
  // Which of the two targets this exact segment can actually reach. Reported so
  // the caller can tell "the emitter is exposed" from "this shot passes over it".
  out.reachableCanopy = tShell !== null;
  out.reachableEmitter = tField !== null;
  out.target = tField !== null && (tShell === null || tField <= tShell) ? 'field' : 'canopy';
  return out;
}

/**
 * Side-effect-free contact candidate for the segment the native pipeline is
 * already stepping.
 *
 * `p` is the native projectile record; `start`/`end` are the two points the
 * native step is testing (normally p.prev -> p.pos). Nothing is mutated here:
 * the returned candidate carries no effect until the caller invokes onHit(),
 * which is idempotent.
 *
 * `distance` is a WORLD distance (first-entry fraction x segment length) so the
 * caller can compare it directly against native wall/actor/boss contact
 * distances. A dome that sits behind a nearer wall therefore reports a larger
 * distance and cannot outrank it.
 *
 * The candidate reuses one internal record, so it is valid only until the next
 * query. The caller must arbitrate and invoke onHit() before asking again.
 */
export function kitBarrierCandidate(p, start, end) {
  if (!p || !start || !end) return null;
  const radius = p.size || 0;
  // A neutral round (no team, or a non-integer one) may only ever be intercepted
  // visually; it must never be able to spend a dome budget.
  const hostile = Number.isInteger(p.team);
  let found = false;
  for (const pool of [domes, remoteDomes]) {
    for (const dome of pool) {
      if (dome.dead) continue;
      if (hostile && dome.team === p.team) continue;
      const hit = domeEntry(dome, start, end, radius, probeRecord);
      if (!hit) continue;
      if (!found || hit.t < bestRecord.t) {
        const segmentLength = start.distanceTo(end);
        bestRecord.dome = hit.dome; bestRecord.target = hit.target;
        bestRecord.t = hit.t;
        bestRecord.distance = hit.t * segmentLength;
        bestRecord.point.set(start.x + (end.x - start.x) * hit.t,
          start.y + (end.y - start.y) * hit.t, start.z + (end.z - start.z) * hit.t);
        bestRecord.normal.set(bestRecord.point.x - hit.dome.pos.x,
          bestRecord.point.y - hit.dome.pos.y, bestRecord.point.z - hit.dome.pos.z).normalize();
        bestRecord.domeId = hit.dome.id; bestRecord.serial = hit.dome.serial;
        bestRecord.team = hit.dome.team; bestRecord.remote = hit.dome.remote;
        bestRecord.reachableCanopy = hit.reachableCanopy;
        bestRecord.reachableEmitter = hit.reachableEmitter;
        found = true;
      }
    }
  }
  if (!found) return null;
  const candidate = bestRecord;
  // Ghost rounds are replayed visual copies: they may be stopped at the dome so
  // the remote image matches, but they must never spend HP, paint or turf. A
  // NEUTRAL round is treated the same way: nothing about it is authoritative here.
  candidate.visualOnly = !!p.ghost || !hostile;
  // A remote dome has no authoritative HP on this client, so a local round can
  // only ever PROPOSE damage. The parent adjudicates; nothing is mutated here.
  candidate.ownership = candidate.remote ? 'remote-presentation' : 'authoritative';
  candidate.damage = (p.damage || 0) * tuning.rawPerDamageUnit;
  candidate.settled = false;
  candidate.proposal = null;
  candidate.damageProposal = () => ({
    domeId: candidate.domeId, serial: candidate.serial, team: candidate.team,
    target: candidate.target, amount: candidate.damage,
    // Built as literals, not Vector3.toArray(): the vendor THREE is loaded from
    // the host module, so toArray() would hand callers an array whose prototype
    // comes from that realm and every JSON / prototype comparison downstream
    // would silently depend on which realm built it.
    point: [candidate.point.x, candidate.point.y, candidate.point.z],
    normal: [candidate.normal.x, candidate.normal.y, candidate.normal.z],
  });
  candidate.onHit = () => {
    if (candidate.settled || candidate.visualOnly) return 0;
    candidate.settled = true;
    if (candidate.remote) {
      // Hand the parent a serializable proposal; spend nothing.
      candidate.proposal = candidate.damageProposal();
      api.emit?.('kit:bubbler:damage-proposal', { ...candidate.proposal });
      return 0;
    }
    // Re-check liveness: the parent may have queried before the dome collapsed.
    if (candidate.dome.dead || !domes.includes(candidate.dome)) return 0;
    const applied = damageDome(candidate.dome, candidate.target, candidate.damage);
    api.G.fx?.burst?.(candidate.point, candidate.normal, candidate.dome.color,
      { count: 6, speed: 3, size: 0.07 });
    api.emit?.('weapon:impact', { pos: candidate.point.clone(), normal: candidate.normal.clone(),
      team: candidate.team, kind: 'shot', radius: candidate.dome.radius * 0.5 });
    return applied;
  };
  return candidate;
}

/**
 * Explosion shielding HANDOFF (read-only, no native integration).
 *
 * The native blast path already decides reach with Physics.los plus its own first
 * contact. This adds exactly one more candidate to that same arbitration: when the
 * dome is the first thing the blast segment touches, the parent consumes the blast
 * at the dome instead of at the target.
 *
 * It deliberately does NOT:
 *   - touch Actor.invuln, so nobody inside the dome becomes invulnerable;
 *   - shield a blast that STARTS inside the dome (an inside origin yields no
 *     candidate), so an attacker standing in the dome keeps its native hostile
 *     behaviour and is still hittable;
 *   - add a wall test or replace Physics.los, so native cover keeps working.
 *
 * Returns a fresh plain descriptor. It never mutates and never spends HP.
 */
export function kitBarrierShelter(p, start, end) {
  const candidate = kitBarrierCandidate(p, start, end);
  if (!candidate) return null;
  return {
    dome: candidate.dome, domeId: candidate.domeId, team: candidate.team,
    target: candidate.target, distance: candidate.distance,
    point: candidate.point.clone(), normal: candidate.normal.clone(),
    visualOnly: candidate.visualOnly,
  };
}

// Replay record for remote proxies: plain data, no live objects.
export function kitBarrierHitRecord(candidate) {
  if (!candidate) return null;
  return {
    domeId: candidate.domeId, serial: candidate.serial, team: candidate.team,
    target: candidate.target, distance: candidate.distance,
    // Built as literals, not Vector3.toArray(): the vendor THREE is loaded from
    // the host module, so toArray() would hand callers an array whose prototype
    // comes from that realm and every JSON / prototype comparison downstream
    // would silently depend on which realm built it.
    point: [candidate.point.x, candidate.point.y, candidate.point.z],
    normal: [candidate.normal.x, candidate.normal.y, candidate.normal.z],
    visualOnly: !!candidate.visualOnly, remote: !!candidate.remote,
    ownership: candidate.ownership,
    reachable: { canopy: !!candidate.reachableCanopy, emitter: !!candidate.reachableEmitter },
  };
}

// -------------------------------------------------------------------- tick

// The structure's own clock. It integrates nothing native and reads no round
// list; the caller may drive it from Projectiles.update or from its own
// composition.
//
// dt <= 0 is a STRICT no-op: a paused match must not grow a dome, ignite it,
// paint, or start the TimeDamage burn. No epsilon fudge.
export function tickBigBubblers(dt) {
  if (!(dt > 0) || !domes.length) return;
  for (const dome of [...domes]) {
    if (dome.dead) continue;
    dome.t += dt;
    dome.radius = radiusAt(dome.t);
    const ascend = clamp(dome.t / (raw.ascendFrames / 60), 0, 1);
    dome.emitterY = raw.ascendHeight * hermite2d(raw.ascendCurve, ascend);
    if (!dome.ignited && dome.t + 1e-10 >= raw.ignitionFrames / 60) {
      dome.ignited = true;
      if (tuning.paintAtIgnition) {
        const area = api.G.paint?.splat?.(dome.pos.clone().setY(dome.pos.y + raw.paintRadius * 0.35),
          raw.paintRadius, dome.team, { seed: Math.random() }) || 0;
        dome.owner.addTurfNoSpecial?.(area);
      }
      api.emit?.('kit:bubbler:ignite', {
        owner: dome.owner, domeId: dome.id, team: dome.team, pos: dome.pos.clone(),
      });
    }
    if (dome.ignited) {
      const interval = tuning.timeDamageIntervalSeconds;
      dome.burnAccum += dt;
      while (dome.burnAccum + 1e-10 >= interval && !dome.dead) {
        dome.burnAccum -= interval;
        damageDome(dome, 'canopy', raw.timeDamage, 'burn');
      }
      if (tuning.overlapFieldDamage && !dome.dead) {
        const tickSeconds = raw.overlapFieldDamageInterval / 60;
        dome.overlapAccum += dt;
        while (dome.overlapAccum + 1e-10 >= tickSeconds && !dome.dead) {
          dome.overlapAccum -= tickSeconds;
          overlapDamage(dome);
        }
      }
    }
    syncVisual(dome);
  }
}

// ------------------------------------------------------- remote presentation

// The presentation clock for replayed remote domes. It advances ONLY what the
// client may draw: age, radius and emitter height, plus the arming flag. It
// applies NO paint, NO TimeDamage burn and NO authoritative HP, and it emits a
// distinctly named presentation stream so nothing downstream mistakes it for the
// authoritative one. dt <= 0 is a strict no-op here too.
export function tickRemoteBigBubblers(dt) {
  if (!(dt > 0) || !remoteDomes.length) return;
  for (const dome of [...remoteDomes]) {
    if (dome.dead) continue;
    dome.t += dt;
    dome.radius = radiusAt(dome.t);
    const ascend = clamp(dome.t / (raw.ascendFrames / 60), 0, 1);
    dome.emitterY = raw.ascendHeight * hermite2d(raw.ascendCurve, ascend);
    if (!dome.ignited && dome.t + 1e-10 >= raw.ignitionFrames / 60) {
      dome.ignited = true;
      api.emit?.('kit:bubbler:remote:ignite', {
        owner: dome.owner, domeId: dome.id, serial: dome.serial, team: dome.team,
        pos: dome.pos.clone(), presentationOnly: true,
      });
    }
    syncVisual(dome);
  }
}

const LIMITS = Object.freeze({
  domeId: 64, teamMax: 3, coord: 1e4, hp: 1e9, age: 600,
});

const ok = (reason, extra) => ({ ok: true, reason, ...extra });
const no = reason => ({ ok: false, reason });

const finiteNumber = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Bounded validation for an inbound replay payload. Nothing here allocates from
 * the payload: a string is length-capped before it is stored or used as a key,
 * the position must be exactly three finite in-range numbers, and the caller
 * always gets an explicit reason instead of a silent drop.
 */
function validateDeploy(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return no('not-an-object');
  const { domeId, team, pos, t, hp, fieldHp, serial } = payload;
  if (typeof domeId !== 'string' || domeId.length === 0) return no('bad-dome-id');
  if (domeId.length > LIMITS.domeId) return no('dome-id-too-long');
  if (!Number.isInteger(team) || team < 0 || team > LIMITS.teamMax) return no('bad-team');
  if (!Array.isArray(pos) || pos.length !== 3) return no('bad-position');
  for (const v of pos) if (!finiteNumber(v, -LIMITS.coord, LIMITS.coord)) return no('bad-position');
  if (!finiteNumber(t, 0, LIMITS.age)) return no('bad-age');
  if (!finiteNumber(hp, 0, LIMITS.hp)) return no('bad-hp');
  if (!finiteNumber(fieldHp, 0, LIMITS.hp)) return no('bad-field-hp');
  if (serial !== undefined && (!Number.isSafeInteger(serial) || serial < 0)) return no('bad-serial');
  return ok('valid', { value: { domeId, team, pos: [...pos], t, hp, fieldHp, serial: serial ?? 0 } });
}

function validateContact(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return no('not-an-object');
  const { domeId, target, amount, serial } = payload;
  if (typeof domeId !== 'string' || domeId.length === 0) return no('bad-dome-id');
  if (domeId.length > LIMITS.domeId) return no('dome-id-too-long');
  if (target !== 'canopy' && target !== 'field') return no('bad-target');
  if (!finiteNumber(amount, 0, LIMITS.hp)) return no('bad-amount');
  if (serial !== undefined && (!Number.isSafeInteger(serial) || serial < 0)) return no('bad-serial');
  return ok('valid', { value: { domeId, target, amount, serial: serial ?? 0 } });
}

function remember(key) {
  if (seenReplay.has(key)) return false;
  seenReplay.add(key);
  // Bounded FIFO: the oldest key is dropped once the window is full, so a long
  // match cannot grow this without limit.
  if (seenReplay.size > REPLAY_SEEN_LIMIT) seenReplay.delete(seenReplay.values().next().value);
  return true;
}

/**
 * The concrete replay ingest the parent calls from its typed NetMatch events.
 *
 * eventName is 'deploy' | 'hit' | 'expire'. `owner` is the LOCAL actor proxy
 * representing the remote owner; the payload is treated as untrusted plain data
 * and never dereferenced (a payload-supplied owner is ignored).
 *
 * Guarantees:
 *   - DEPLOY restores the transmitted position EXACTLY. It is never re-derived
 *     from the owner's aim, because aim is local state the sender does not own.
 *   - Every stage is idempotent: a duplicate packet is detected and reported,
 *     never applied twice.
 *   - A remote dome never gains authoritative HP, paint or turf here.
 *   - Every call returns an explicit { ok, reason }; nothing is silently ignored.
 *
 * NO online parity is claimed: this is ingest and presentation, not transport,
 * prediction, reconciliation or rollback.
 */
export function replayBigBubbler(eventName, owner, plainPayload) {
  if (!api) return no('not-installed');
  switch (eventName) {
    case 'deploy': return replayDeploy(owner, plainPayload);
    case 'hit': return replayHit(owner, plainPayload);
    case 'expire': return replayExpire(owner, plainPayload);
    default: return no('unknown-event');
  }
}

function replayDeploy(owner, payload) {
  const checked = validateDeploy(payload);
  if (!checked.ok) return checked;
  const v = checked.value;
  if (remoteDomes.some(d => d.id === v.domeId)) return ok('duplicate', { domeId: v.domeId });
  const key = `deploy|${v.domeId}`;
  if (!remember(key)) return ok('duplicate', { domeId: v.domeId });
  const dome = makeDome({
    id: v.domeId, serial: v.serial, owner: owner ?? null, team: v.team,
    pos: new api.THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]), remote: true,
  });
  // The transmitted state is authoritative for the IMAGE only.
  dome.t = v.t;
  dome.hp = Math.min(v.hp, dome.hpMax);
  dome.fieldHp = Math.min(v.fieldHp, dome.fieldHpMax);
  dome.radius = radiusAt(v.t);
  const ascend = clamp(v.t / (raw.ascendFrames / 60), 0, 1);
  dome.emitterY = raw.ascendHeight * hermite2d(raw.ascendCurve, ascend);
  dome.ignited = v.t + 1e-10 >= raw.ignitionFrames / 60;
  buildVisual(dome);
  remoteDomes.push(dome);
  syncVisual(dome);
  return ok('deployed', { domeId: v.domeId, serial: dome.serial });
}

function replayHit(owner, payload) {
  const checked = validateContact(payload);
  if (!checked.ok) return checked;
  const v = checked.value;
  const key = `hit|${v.domeId}|${v.serial}`;
  if (!remember(key)) return ok('duplicate', { domeId: v.domeId });
  const dome = remoteDomes.find(d => d.id === v.domeId);
  if (!dome || dome.dead) return no('unknown-dome');
  // Displayed HP only. The host decides whether this damage is real; nothing
  // here becomes authoritative, and an expire packet still removes the dome.
  if (v.target === 'field') dome.fieldHp = Math.max(0, dome.fieldHp - v.amount);
  else dome.hp = Math.max(0, dome.hp - v.amount);
  return ok('displayed', { domeId: v.domeId, hp: dome.hp, fieldHp: dome.fieldHp });
}

function replayExpire(owner, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return no('not-an-object');
  const { domeId } = payload;
  if (typeof domeId !== 'string' || domeId.length === 0) return no('bad-dome-id');
  if (domeId.length > LIMITS.domeId) return no('dome-id-too-long');
  const key = `expire|${domeId}`;
  if (!remember(key)) return ok('duplicate', { domeId });
  const dome = remoteDomes.find(d => d.id === domeId);
  if (!dome) return ok('already-absent', { domeId });
  removeDome(dome, 'replay-expire');
  return ok('expired', { domeId });
}

/**
 * Match reset for the replay side: every remote dome is removed and its scene
 * resources released, the duplicate-packet window is cleared so a new match
 * cannot inherit stale dedupe state, and a reset marker is emitted so a parent
 * can drop its own net-side caches at the same moment. Projectiles.clear() (the
 * match-disposal path) calls this.
 */
export function resetBigBubblerReplay(reason = 'match-reset') {
  const removed = [];
  for (const dome of [...remoteDomes]) { removed.push(dome.id); removeDome(dome, reason); }
  seenReplay.clear();
  api.emit?.('kit:bubbler:replay:reset', { reason, removed, presentationOnly: true });
  return { removed };
}

function overlapDamage(dome) {
  const actors = api.G.actors;
  if (!actors) return;
  const damage = raw.overlapFieldDamage / tuning.rawPerDamageUnit;
  for (const e of actors) {
    if (!e.alive || e.team === dome.team) continue;
    const dx = e.pos.x - dome.pos.x, dy = e.pos.y + 0.5 - dome.pos.y, dz = e.pos.z - dome.pos.z;
    if (dx * dx + dy * dy + dz * dz <= dome.radius * dome.radius) {
      api.G.projectiles?.applyHit?.(dome.owner, e, damage, 'bubbler');
    }
  }
}

// ------------------------------------------------------------------ install

export function installKitBigBubbler(context, profile) {
  if (context[INSTALL]) throw new Error('INKWAVE Big Bubbler already installed');
  if (!context?.Actor || !context?.Projectiles) throw new Error('Big Bubbler needs the composed Actor and Projectiles');
  api = context;
  raw = { ...BIG_BUBBLER_RAW, ...(profile?.kits?.bigBubbler?.raw || {}) };
  tuning = { ...BIG_BUBBLER_CALIBRATION, ...(profile?.kits?.bigBubbler || {}) };
  for (const dome of [...domes]) { domes.splice(domes.indexOf(dome), 1); releaseVisual(dome); }
  for (const dome of [...remoteDomes]) { remoteDomes.splice(remoteDomes.indexOf(dome), 1); releaseVisual(dome); }
  domes = [];
  remoteDomes = [];
  seenReplay.clear();
  probeRecord = { dome: null, t: 0, target: 'canopy' };
  bestRecord = {
    dome: null, domeId: null, serial: 0, team: 0, target: 'canopy', t: 0, distance: 0,
    damage: 0, visualOnly: false, settled: false, proposal: null,
    remote: false, ownership: 'authoritative',
    reachableCanopy: false, reachableEmitter: false,
    onHit: () => 0, damageProposal: () => null,
    point: new api.THREE.Vector3(), normal: new api.THREE.Vector3(),
  };

  const { Actor, Projectiles } = api;
  const startSpecial = Actor.prototype._startSpecial;
  Actor.prototype._startSpecial = function (...args) {
    // Deploy ONLY on a real, single, native activation:
    //   charged  - the gauge actually held a full special before the call;
    //   usedOnce - the native activation ran exactly once and spent exactly one
    //               charge (stats.specials +1 and special back to 0);
    //   ready    - the actor is alive;
    //   top-level- not a re-entrant call from inside the activation itself.
    // A manual _startSpecial() on a dead, uncharged or re-entrant actor must not
    // create a structure. Ink refill stays with the parent's resources module:
    // this module never touches `ink`.
    const reentrant = activating.has(this);
    const cost = typeof this.specialCost === 'function' ? this.specialCost() : 0;
    const charged = cost > 0 && finiteNumber(Number(this.special), cost, Infinity);
    const specialsBefore = this.stats?.specials ?? 0;
    activating.add(this);
    let result;
    try {
      result = startSpecial.apply(this, args);
    } finally {
      if (!reentrant) activating.delete(this);
    }
    const usedOnce = !reentrant
      && (this.stats?.specials ?? 0) === specialsBefore + 1
      && this.special === 0;
    const ready = this.alive !== false;
    if (charged && usedOnce && ready && !this.specialActive && this.weapon?.special === BUBBLER_ID) {
      deploy(this);
    }
    return result;
  };
  const reset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    const value = reset.apply(this, args);
    if (tuning.eraseOnOwnerReset) {
      for (const dome of [...domes]) if (dome.owner === this) removeDome(dome, 'owner-reset');
    }
    return value;
  };

  // The contact query the parent wires into the native first-contact
  // arbitration (Projectiles._step, after the round is integrated, beside the
  // existing wall/actor/boss tests). It is inert; the caller compares
  // candidate.distance with the native contact distance and invokes onHit() on
  // the winner only. The module never touches _step itself.
  Projectiles.prototype.kitBarrierCandidate = function (p, start, end) {
    return kitBarrierCandidate(p, start || p.prev, end || p.pos);
  };
  // Explosion shielding handoff for the native blast path. Read-only.
  Projectiles.prototype.kitBarrierShelter = function (p, start, end) {
    return kitBarrierShelter(p, start || p.prev, end || p.pos);
  };
  // Replay ingest the parent calls from its typed NetMatch events. Presentational
  // only; see BIG_BUBBLER_OWNERSHIP for exactly what this does and does not own.
  Projectiles.prototype.kitBubbleReplay = function (eventName, owner, payload) {
    return replayBigBubbler(eventName, owner, payload);
  };

  const update = Projectiles.prototype.update;
  Projectiles.prototype.update = function (dt) {
    tickBigBubblers(dt);            // authoritative structure clock
    tickRemoteBigBubblers(dt);      // presentation-only remote clock
    return update.call(this, dt);
  };
  const clear = Projectiles.prototype.clear;
  Projectiles.prototype.clear = function (...args) {
    for (const dome of [...domes]) removeDome(dome, 'match-disposal');
    resetBigBubblerReplay('match-disposal');   // clears remote domes + dedupe window
    return clear.apply(this, args);
  };
  Object.defineProperty(context, INSTALL, { value: true, enumerable: false });
  return api;
}

// The wire form of a LOCAL dome. Every field is plain and JSON-safe, and the
// payload replayBigBubbler('deploy', ...) validates is exactly this shape.
export function bigBubblerSnapshot() {
  return domes.map(d => ({
    id: d.id, domeId: d.id, serial: d.serial, team: d.team, t: d.t,
    pos: [d.pos.x, d.pos.y, d.pos.z], radius: d.radius,
    emitterY: d.emitterY, hp: d.hp, fieldHp: d.fieldHp, ignited: d.ignited,
  }));
}

export function clearBigBubblers(reason = 'external') {
  for (const dome of [...domes]) removeDome(dome, reason);
  resetBigBubblerReplay(reason);
}

export const BUBBLER_SPECIAL_ID = BUBBLER_ID;