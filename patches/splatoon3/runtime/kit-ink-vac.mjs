// Splat Charger special "Ink Vac" (Splatoon 3 SpBlower) for the public composed
// INKWAVE runtime. Owned by the freebuff-8 kit task. Native id: 'inkVac'.
//
// Pinned raw values (WeaponSpBlower.game__GameParameterTable.json, Leanny/splat3
// @7280ff9c 11.3.0):
//   InhaleParam.LengthMax 15 · RadiusMin{Low,Mid,High} .8/1.1/1.4
//                        · RadiusMax{Low,Mid,High} 3.3/3.8/4.3
//   ExhaleParam.DirectDamage 2200 · FlyGravity .003 · FlyPositionAirResist .01
//   ExhaleParam.SpawnSpeedZSpecUp{Low,Mid,High} .55 · SpawnSpeedZMaxCharge .7
//   ExhaleParam.SpawnBlastWaitFrame 50
//   WeaponParam.InhaleToExhaleWaitFrame 20 · ExhaleWaitFrame 150
//   ExhaleBlastParam{Min,Max}Charge.PaintRadius 6.0/11.0 · DistanceDamage.Damage 2200
//
// Damage uses the repository's established conversion rawDamageToHP "/10" (see
// profile.json calibration.unitConversions), so the pinned 2200 raw is 220 HP.
// That exceeds the 100 HP actor pool, i.e. the countershot splats on contact: a
// PHYSICAL SCALE LIMITATION of copying the raw Splatoon number into INKWAVE's HP
// pool, not a claim about the hardware. (rawToHp = 100/3000 is NOT used here.)
//
// Intake geometry INTERPRETATION (labelled calibration, not a source claim):
// RadiusMin/RadiusMax are read as the NEAR (muzzle-end) and FAR (LengthMax-end)
// radius of a frustum that widens away from the player, and Low/High as the ends
// of the charge range. The shape is therefore a widening frustum along the full 3D
// aim vector (not a cylinder, and not a cone of revolution about horizontal only).
// Nintendo's actual field meaning of RadiusMin/RadiusMax is UNCONFIRMED.
//
// REMOTE REPLAY: this module owns an explicit replay API (replayInkVac) that the
// parent wires into the native NetMatch transport. No native source, adapter,
// profile or network file is touched here; see INK_VAC_EVENTS below.

let api = null;
const INSTALL = Symbol.for('inkwave.s3.kit-ink-vac.install.v1');
export const VAC_ID = 'inkVac';

const RAW_TO_HP = 10;             // repository conversion rawDamageToHP: "/10"
const INHALE_LENGTH = 15;         // pinned LengthMax
const NEAR_LOW = 0.8, NEAR_HIGH = 1.4;   // pinned RadiusMin.Low/.High
const FAR_LOW = 3.3, FAR_HIGH = 4.3;     // pinned RadiusMax.Low/.High
const SPEED_LOW = 0.55, SPEED_HIGH = 0.7;// pinned SpawnSpeedZ (per frame)
const FLY_GRAVITY = 0.003;        // pinned per frame^2
const FLY_AIR_RESIST = 0.01;      // pinned per frame
const SPAWN_BLAST_WAIT = 50;      // pinned frames: native projectile LIFETIME before detonation
const INHALE_TO_EXHALE_WAIT = 20; // pinned frames
const BLAST_MIN = 6.0, BLAST_MAX = 11.0;// pinned blast paint radius
// Bounded duplicate-proposal memory per owner: a proposal is keyed by
// source projectile + activation, and only the last PROPOSAL_MEMORY keys count.
const PROPOSAL_MEMORY = 64;

export const INK_VAC_CALIBRATION = Object.freeze({
  rawToHp: RAW_TO_HP,
  framesPerSecond: 60,
  breathOriginHeight: 1.0,   // intake origin above feet (kid chest) — calibration
  frontalEpsilon: -0.05,    // projectile must travel against player aim — calibration
  absorbCreditPerProjectile: 0.34, // charge added per accepted projectile — calibration
  geometry: 'frustum: near radius at the muzzle growing linearly to far radius at LengthMax; RadiusMin/RadiusMax read as near/far and Low/High as charge ends',
  geometryStatus: 'interpretation / calibration; Nintendo field meaning unconfirmed',
  speedStatus: 'pinned per-frame values multiplied by 60 to per-second',
  damageStatus: 'pinned raw 2200 with repository /10 conversion; exceeds the 100 HP pool (instakill) — physical scale limitation',
  inhaleDurationSeconds: 2.5,
  inhaleDurationStatus: 'CALIBRATED: the SpBlower table carries no total inhale duration. ExhaleWaitFrame 150 is an exhale standby field and is deliberately NOT used as the inhale duration; minInhaleSeconds below interprets InhaleToExhaleWaitFrame 20.',
  minInhaleSeconds: INHALE_TO_EXHALE_WAIT / 60,
  minInhaleStatus: 'interpretation of pinned InhaleToExhaleWaitFrame 20 as the minimum inhale before a manual release',
  burstLifetimeSeconds: SPAWN_BLAST_WAIT / 60,
  burstLifetimeStatus: 'pinned SpawnBlastWaitFrame 50 used as the native projectile lifetime; delay stays 0 so the native integrator runs immediately and bursts on the age>life deadline',
  proposalMemory: PROPOSAL_MEMORY,
  replicaStuckGuardSeconds: 7.5,
  replicaStuckGuardStatus: 'CALIBRATED presentation-only failsafe: a replica cone is hidden when its release/dispose packet never arrives, after inhaleDurationSeconds (2.5) + 2x the 2.5 s owner cap. Generous by design so it can never pre-empt a real owner release. The owner packet remains authoritative.',
  status: 'pinned geometry/ballistics/timings; origin height, frontal epsilon and the frustum field reading are calibration',
});

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const clamp01 = v => Math.max(0, Math.min(1, v));
const states = new WeakMap();

// ---------------------------------------------------------------------------
// Remote replay contract.
//
// Native packEvent/unpackEvent only survive TOP-LEVEL scalars, [x,y,z] vectors
// and actors ({n: nid}) -- nested objects and any other array are dropped -- so
// every payload below is deliberately FLAT. Native `_onLocalEvent` and
// `_playEvent` both read `e.actor || e.victim`, so `actor` is the SHOOTER for an
// absorption proposal and the Vac OWNER for every owner-emitted event.
export const INK_VAC_EVENTS = Object.freeze({
  // { actor: owner, kit, serial, charge, nid? }
  activation: 'special:inkvac',
  // { actor: owner, kit, serial, charge }  owner-approved charge state
  charge: 'special:inkvac-charge',
  // { actor: shooter, target: vac owner, kit, serial, key }  credit PROPOSAL
  absorb: 'special:inkvac-absorb',
  // { actor: owner, kit, serial, charge }  the countershot itself travels as a
  // native recProj/ghostProjectile packet, so this carries NO projectile.
  release: 'special:inkvac-release',
  // { actor: owner, kit, serial }
  dispose: 'special:inkvac-dispose',
});

const seenProposals = new WeakMap();
let actorIdentSeq = 0, activationSeq = 0, proposalSeq = 0;
const idents = new WeakMap();
const remoteSerials = new WeakMap();

// Stable identity for actors the transport cannot address by nid (bots, tests).
function identityOf(a) {
  let i = idents.get(a);
  if (i === undefined) { i = ++actorIdentSeq; idents.set(a, i); }
  return i;
}
/** Public, collision-free activation id: the real nid when the transport has one. */
export function activationKey(actor, serial) { return `${actor.nid !== undefined ? actor.nid : 'i' + identityOf(actor)}#${serial}`; }

function proposalLedger(owner) {
  let s = seenProposals.get(owner);
  if (!s) { s = { set: new Set(), order: [] }; seenProposals.set(owner, s); }
  return s;
}

function requireApi() { if (!api) throw new Error('INKWAVE kit-ink-vac not installed'); return api; }
export function inkVacState(actor) { return states.get(actor) || null; }
function remoteStateOf(actor) {
  const s = actor && states.get(actor);
  return s && s.remote ? s : null;
}

// Charge-scaled frustum radii (pinned Low/High ends).
export function intakeNearRadius(charge) { return lerp(NEAR_LOW, NEAR_HIGH, charge); }
export function intakeFarRadius(charge) { return lerp(FAR_LOW, FAR_HIGH, charge); }
export function blastRadius(charge) { return lerp(BLAST_MIN, BLAST_MAX, charge); }
export function exhaleDamage() { return 2200 / RAW_TO_HP; }
// Pinned per-frame spawn speed -> INKWAVE units/second.
export function exhaleSpeed(charge) { return lerp(SPEED_LOW, SPEED_HIGH, charge) * INK_VAC_CALIBRATION.framesPerSecond; }

// Resolved special-blast descriptor consumed by the native burst. The parent adapts
// native _blastBurst to `p.s3SpecialWeapon || WEAPONS.blaster`, so every field the
// native burst reads is supplied here with provenance. Both `damageBands` and
// `splashBands` are provided because the parent supports either.
export function inkVacBlastDescriptor(charge) {
  const radius = blastRadius(charge), damage = exhaleDamage();
  return Object.freeze({
    id: VAC_ID, name: 'Ink Vac', kind: 'special',
    splashRadius: radius, burstRadius: radius, impactRadius: radius,
    splashDamageMax: damage, splashDamageMin: damage,
    splashBands: Object.freeze([[0, damage], [radius, damage]]),
    damageBands: Object.freeze([[0, damage], [radius, damage]]),
    provenance: Object.freeze({
      blastRadius: 'ExhaleBlastParam{Min,Max}Charge.PaintRadius 6.0/11.0 (pinned)',
      damage: 'ExhaleParam.DirectDamage & DistanceDamage.Damage = 2200 raw via repository rawDamageToHP /10 = 220 HP (exceeds 100 HP pool; scale limitation)',
      chargeScale: 'blast radius lerps 6.0 -> 11.0 with charge; damage flat inside the pinned radius',
    }),
  });
}

// Full 3D aim-aligned forward (vertical included) and the intake origin. A zero
// aim vector (before the first update, or after a reset) must not degenerate the
// intake, so fall back to the actor's facing and then to +Z.
function forwardOf(a, out) {
  out.copy(a.aimDir);
  if (out.lengthSq() < 1e-12) {
    out.set(Math.sin(a.aimYaw ?? 0), 0, Math.cos(a.aimYaw ?? 0));
    if (out.lengthSq() < 1e-12) out.set(0, 0, 1);
  }
  return out.normalize();
}
function originOf(a, out) { return out.set(a.pos.x, a.pos.y + INK_VAC_CALIBRATION.breathOriginHeight, a.pos.z); }

// Analytic first entry of segment start->end into the truncated frustum.
// Inside <=> 0 <= along(t) <= LengthMax AND F(t) <= 0, where
// F(t) = radial^2(t) - radius(along(t))^2 is a quadratic in t and along(t) is linear.
// The allowed t interval comes from the truncation, then the first F(t) <= 0 inside
// it is found from the quadratic roots. No sampling, no per-projectile allocation.
function firstEntry(state, start, end) {
  const { _org: o, _fwd: f, _m: m, _e: e } = state;
  originOf(state.actor, o); forwardOf(state.actor, f);
  m.copy(start).sub(o);
  e.copy(end).sub(start);
  const segLen = e.length();
  const L = INHALE_LENGTH, near = state.nearR, far = state.farR;
  const k = (far - near) / L;
  const a0 = m.dot(f), a1 = e.dot(f);

  // Allowed parameter interval from the truncated extent along the aim axis.
  let lo = 0, hi = 1;
  if (Math.abs(a1) < 1e-12) {
    if (a0 < -1e-9 || a0 > L + 1e-9) return Infinity;
  } else if (a1 > 0) {
    lo = Math.max(lo, -a0 / a1);
    hi = Math.min(hi, (L - a0) / a1);
  } else {
    lo = Math.max(lo, (L - a0) / a1);
    hi = Math.min(hi, -a0 / a1);
  }
  if (lo > hi) return Infinity;                       // the step never reaches the volume

  const M0 = m.lengthSq() - a0 * a0;
  const M1 = m.dot(e) - a0 * a1;
  const M2 = e.lengthSq() - a1 * a1;
  const C2 = M2 - k * k * a1 * a1;
  const C1 = 2 * (M1 - near * k * a1 - k * k * a0 * a1);
  const C0 = M0 - near * near - 2 * near * k * a0 - k * k * a0 * a0;
  const F = t => (C2 * t + C1) * t + C0;
  // A root that is analytically on the surface can land a few ulps outside after
  // rounding, so accept a small scale-relative tolerance instead of requiring F <= 0.
  const tol = 1e-9 * Math.max(1, Math.abs(C0), Math.abs(C1), Math.abs(C2));
  const inside = t => F(t) <= tol;

  if (segLen < 1e-9) return inside(lo) ? 0 : Infinity;   // degenerate segment: point test
  if (inside(lo)) return lo * segLen;                     // already inside at interval start
  const disc = C1 * C1 - 4 * C2 * C0;
  if (disc < 0) return Infinity;                           // never crosses the surface
  const sq = Math.sqrt(disc);
  const roots = Math.abs(C2) > 1e-12
    ? [(-C1 - sq) / (2 * C2), (-C1 + sq) / (2 * C2)]
    : (Math.abs(C1) > 1e-12 ? [-C0 / C1] : []);
  roots.sort((x, y) => x - y);
  for (const t of roots) {
    if (t < lo - 1e-9 || t > hi + 1e-9) continue;
    if (inside(t)) return Math.max(lo, t) * segLen;
  }
  return Infinity;
}

// ---------------------------------------------------------------------------
// Narrow candidate hook. Returns { distance, onHit } when the projectile enters
// the held intake, else null. Does not integrate or scan native projectiles.
export function inkVacAbsorbCandidate(actor, start, end, projectile) {
  const state = states.get(actor);
  if (!state || state.phase !== 'inhale' || !projectile) return null;
  if (projectile.team === actor.team) return null;
  if (projectile.s3InkVacAbsorbed) return null;
  const { G } = api;
  // Direction: only projectiles travelling toward the player enter the intake.
  if (projectile.vel) {
    forwardOf(actor, state._fwd);
    const vl = projectile.vel.length();
    if (vl > 1e-6) {
      const dot = projectile.vel.dot(state._fwd) / vl;
      if (dot > INK_VAC_CALIBRATION.frontalEpsilon) return null;
    }
  }
  const distance = firstEntry(state, start, end);
  if (!Number.isFinite(distance)) return null;
  // Line of sight at the first-contact point (an intervening wall blocks intake).
  const q = state._q.copy(start).lerp(end, start.distanceTo(end) > 0 ? distance / start.distanceTo(end) : 0);
  if (G.physics?.los && !G.physics.los(originOf(actor, state._org), q)) return null;
  return { distance, onHit: () => absorb(state, projectile) };
}

// Credit the held local intake by its OWN calibration value. Only the owner may
// credit; a replica never calls this from a replayed packet.
function creditCharge(state) {
  state.charge = Math.min(1, state.charge + INK_VAC_CALIBRATION.absorbCreditPerProjectile);
  state.absorbed++;
  updateVisual(state);
  api.emit?.(INK_VAC_EVENTS.charge, { actor: state.actor, kit: VAC_ID, serial: state.serial, charge: state.charge });
  return state.charge;
}

// Absorption PROPOSAL for a replica intake. The shooter is the authority over its
// own round, so it neutralises the shooter-authoritative damage at first contact
// and asks the owner to credit once. `actor` is the shooter and `target` the Vac
// owner, both flat actor references the native packer keeps.
function proposeAbsorption(state, projectile) {
  const shooter = projectile.owner;
  if (!shooter || shooter.remote === true) return false;   // only a locally owned shooter may propose
  if (!Number.isInteger(state.serial)) return false;
  const key = `${shooter.nid !== undefined ? shooter.nid : 'i' + identityOf(shooter)}#p${++proposalSeq}`;
  api.emit?.(INK_VAC_EVENTS.absorb, { actor: shooter, target: state.actor, kit: VAC_ID, serial: state.serial, key });
  return true;
}

// Absorption side effects, guarded so one projectile is credited/neutralised once.
// A captured state that has been disposed (or already released) is stale: its
// onHit closure must be a no-op.
function absorb(state, projectile) {
  if (!projectile) return false;
  if (states.get(state.actor) !== state || state.phase !== 'inhale') return false;  // stale / disposed
  if (projectile.s3InkVacAbsorbed) return false;
  projectile.s3InkVacAbsorbed = true;
  // A net ghost is a replay of an authoritative shot: this module applies no
  // authority to it, so it may be consumed VISUALLY only -- no damage edit, no
  // charge, no proposal, no paint.
  if (projectile.ghost) return false;
  projectile.damage = 0;      // neutralise the shooter-authoritative damage here
  // A replica may not claim charge from a replayed ghost; it proposes instead.
  if (state.remote) return proposeAbsorption(state, projectile);
  creditCharge(state);
  return true;
}

// ---------------------------------------------------------------------------
// Presentation. Owned cone built with its apex at the origin so it can never
// extend behind the owner, oriented to the full 3D aim and visible while active.
function makeState(actor, opts = {}) {
  const remote = opts.remote === true;
  return { actor, remote, serial: opts.serial, t: 0, phase: 'inhale', charge: 0, absorbed: 0,
    nearR: intakeNearRadius(0), farR: intakeFarRadius(0), baseFar: FAR_HIGH,
    mesh: null, geo: null, mat: null,
    _fwd: new api.THREE.Vector3(), _org: new api.THREE.Vector3(), _q: new api.THREE.Vector3(),
    _m: new api.THREE.Vector3(), _e: new api.THREE.Vector3(), _up: new api.THREE.Vector3(0, 1, 0) };
}

function createVisual(state) {
  const { THREE, G } = api;
  const scene = G.scene;
  if (!scene || typeof scene.add !== 'function' || typeof THREE?.Mesh !== 'function') return;
  const L = INHALE_LENGTH;
  const geo = new THREE.ConeGeometry(FAR_HIGH, L, 20, 1, true);   // wide end at -y
  geo.rotateX(Math.PI);                                            // wide end now at +y
  geo.translate(0, L / 2, 0);                                      // apex at origin, extends forward
  const mat = new THREE.MeshBasicMaterial({ color: state.actor.color?.getHex ? state.actor.color.getHex() : 0xffffff,
    transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(originOf(state.actor, state._org));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forwardOf(state.actor, state._fwd));
  mesh.visible = true;
  scene.add(mesh);
  state.mesh = mesh; state.geo = geo; state.mat = mat; state.baseFar = FAR_HIGH;
}
function disposeVisual(state) {
  if (!state) return;
  const { G } = api;
  if (state.mesh && G.scene && typeof G.scene.remove === 'function') G.scene.remove(state.mesh);
  state.geo?.dispose?.(); state.mat?.dispose?.();
  state.mesh = state.geo = state.mat = null;
}

// Presentation advance, shared by the held local intake and by a replica cone.
function updateVisual(state) {
  if (!state.mesh) return;
  const a = state.actor;
  state.mesh.position.copy(originOf(a, state._org));
  state.mesh.quaternion.setFromUnitVectors(state._up, forwardOf(a, state._fwd));
  const r = state.farR / state.baseFar;
  state.mesh.scale.set(r, 1, r);        // radial only: never lengthens behind the owner
}

export function disposeInkVac(actor) {
  const state = states.get(actor);
  if (!state) return;
  disposeVisual(state);
  if (actor.specialActive && actor.specialActive.id === VAC_ID) actor.specialActive = null;
  states.delete(actor);
  // A locally owned activation must tell its replicas to drop the cone. A replayed
  // dispose never re-emits, so replay cannot loop.
  if (!state.remote && Number.isInteger(state.serial)) {
    api.emit?.(INK_VAC_EVENTS.dispose, { actor, kit: VAC_ID, serial: state.serial });
  }
}

// ---------------------------------------------------------------------------
// Release: queue the native type:'blast' countershot carrying the resolved
// descriptor. Native integrator and _blastBurst remain the authority for motion and
// detonation; this module applies no manual splash/paint. Errors are NOT swallowed.
// A replica NEVER reaches here: it only ever hides its presentation.
function release(state) {
  const a = state.actor, c = state.charge, { G, emit } = api;
  state.phase = 'done';
  a.specialActive = null;
  disposeVisual(state);
  let authored = false;
  if (!state.remote && !a.remote && G.projectiles?.fireInkVacExhale) {
    const projectile = G.projectiles.fireInkVacExhale(a, { charge: c, descriptor: inkVacBlastDescriptor(c) });
    authored = !!projectile;
  }
  // Flat payload: the countershot itself is a native recProj packet, so replicas
  // get it through ghostProjectile and this event allocates nothing for them.
  emit?.(INK_VAC_EVENTS.release, { actor: a, kit: VAC_ID, serial: state.serial, charge: c, authored });
  states.delete(a);
}

// Per-frame advance of a LOCALLY owned inhale. dt <= 0 is a strict no-op.
function inkVacUpdate(a, dt) {
  const state = states.get(a);
  if (!state || state.phase !== 'inhale' || !(dt > 0)) return;
  state.t += dt;
  state.nearR = intakeNearRadius(state.charge);
  state.farR = intakeFarRadius(state.charge);
  updateVisual(state);
  if (state.charge >= 1 || state.t >= INK_VAC_CALIBRATION.inhaleDurationSeconds) release(state);
}

// Per-frame advance of a REPLICA cone. Remote actors are driven by the native
// NetMatch applyRemote path rather than Actor.update, so the parent calls this
// (directly, or via the applyRemote wrapper installed below). Presentation only:
// it authors no projectile, paint, damage, gauge or refill.
export function advanceInkVacReplica(actor, dt) {
  const state = states.get(actor);
  if (!state || !state.remote || state.phase !== 'inhale' || !(dt > 0)) return false;
  state.t += dt;
  state.nearR = intakeNearRadius(state.charge);
  state.farR = intakeFarRadius(state.charge);
  updateVisual(state);
  // Presentation-only failsafe if the owner's release/dispose packet is lost.
  if (state.t >= INK_VAC_CALIBRATION.replicaStuckGuardSeconds) {
    disposeVisual(state);
    state.phase = 'done';
    states.delete(actor);
  }
  return true;
}

// ---------------------------------------------------------------------------
// REMOTE REPLAY API.
//
// replayInkVac(eventName, actor, payload) is the single entry point the parent
// calls from the native NetMatch transport. `actor` is whatever native
// _onLocalEvent/_playEvent resolve as `e.actor || e.victim`; for an absorption
// PROPOSAL that is the SHOOTER and the Vac owner arrives as payload.target, so a
// proposal can never be credited to the shooter by accident.
//
// Every branch is guarded and returns a verdict instead of throwing, so a
// malformed or out-of-order packet is dropped rather than half-applied:
//   { applied: true, ... } | { applied: false, reason }
export function replayInkVac(eventName, actor, payload) {
  const drop = reason => ({ applied: false, reason });
  if (!api) return drop('not-installed');
  if (typeof eventName !== 'string' || !actor) return drop('missing-event-or-actor');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return drop('malformed-payload');
  if (payload.kit !== VAC_ID) return drop('not-inkvac');
  const serial = payload.serial;
  if (!Number.isInteger(serial) || serial < 0) return drop('malformed-serial');
  const EV = INK_VAC_EVENTS;
  const subject = eventName === EV.absorb ? payload.target : actor;
  if (!subject || typeof subject !== 'object') return drop('malformed-subject');

  // A dead owner drops its replica whatever arrives next, so a lost dispose
  // packet cannot leave a cone hanging in the scene.
  if (subject.alive !== true && states.has(subject)) disposeInkVac(subject);

  if (eventName === EV.absorb) {
    // The credit authority is the Vac OWNER, never a replayed ghost.
    const state = states.get(subject);
    if (!state || state.remote) return drop('no-local-activation');
    if (state.phase !== 'inhale' || state.serial !== serial) return drop('stale-or-mismatched-serial');
    const key = payload.key;
    if (typeof key !== 'string' || !key) return drop('malformed-proposal-key');
    const ledger = proposalLedger(subject);
    if (ledger.set.has(key)) return drop('duplicate-proposal');
    ledger.set.add(key); ledger.order.push(key);
    while (ledger.order.length > PROPOSAL_MEMORY) ledger.set.delete(ledger.order.shift());
    creditCharge(state);            // owner's own calibration, once
    return { applied: true, serial, charge: state.charge };
  }

  // Everything below is owner->replica state. It may only present.
  if (subject.remote !== true) return drop('replica-events-need-a-remote-actor');
  if (eventName === EV.activation) {
    if (subject.alive !== true) return drop('dead-actor');
    const last = remoteSerials.get(subject);
    if (Number.isInteger(last) && serial <= last) return drop('duplicate-or-out-of-order-activation');
    const current = states.get(subject);
    if (current && current.serial === serial) return drop('duplicate-activation');
    if (current) disposeVisual(current);        // a newer activation supersedes an older cone
    const charge = Number.isFinite(payload.charge) ? clamp01(payload.charge) : 0;
    const state = makeState(subject, { remote: true, serial });
    state.charge = charge;
    state.nearR = intakeNearRadius(charge); state.farR = intakeFarRadius(charge);
    states.set(subject, state);
    remoteSerials.set(subject, serial);
    createVisual(state);
    updateVisual(state);
    return { applied: true, serial, charge };
  }

  // charge / release / dispose all require the exact live activation.
  const state = remoteStateOf(subject);
  if (!state) return drop('no-replica-activation');
  if (state.serial !== serial) return drop('stale-or-mismatched-serial');
  if (eventName === EV.charge) {
    if (!Number.isFinite(payload.charge)) return drop('malformed-charge');
    state.charge = clamp01(payload.charge);
    state.nearR = intakeNearRadius(state.charge); state.farR = intakeFarRadius(state.charge);
    updateVisual(state);
    return { applied: true, serial, charge: state.charge };
  }
  if (eventName !== EV.release && eventName !== EV.dispose) return drop('unknown-event');
  disposeInkVac(subject);          // presentation only: no projectile, paint or damage
  return { applied: true, serial, ended: eventName };
}

// ---------------------------------------------------------------------------
export function installKitInkVac(context, _profile) {
  if (context === api && Object.hasOwn(api.Actor?.prototype || {}, INSTALL)) return api;
  api = context;
  const { Actor, THREE } = api;
  if (!Actor?.prototype || !THREE?.Vector3) throw new Error('Ink Vac requires the actual Actor and THREE');
  const proto = Actor.prototype;
  if (!Object.hasOwn(proto, INSTALL)) {
    Object.defineProperty(proto, INSTALL, { value: true });
    const update = proto.update, startSpecial = proto._startSpecial;
    const splat = proto.splat, reset = proto.reset;

    proto.update = function (dt) {
      const s = this.specialActive;
      const state = s && s.id === VAC_ID ? states.get(this) : null;
      if (!state) return update.call(this, dt);
      // A held state whose owner died is dropped whatever the frame step is.
      if (!this.alive) { disposeInkVac(this); return update.call(this, dt); }
      // STRICT PAUSE: with no time passing the held special must touch nothing --
      // not form, not _prevIntent, not the weapons, not the inhale clock. Early
      // return before any mutation and before the native pass.
      if (!(dt > 0)) return undefined;
      const it = this.intent;
      // Primary fire releases the countershot: the special replaces the main/sub.
      if (it.fire && state.t >= INK_VAC_CALIBRATION.minInhaleSeconds) {
        release(state);
        // The release frame still suppresses the replaced weapons, so the player
        // cannot also shoot the main weapon or the sub on the same frame.
        const fire = it.fire, sub = it.sub, squid = it.squid;
        it.fire = false; it.sub = false; it.squid = false;
        try { return update.call(this, dt); }
        finally { it.fire = fire; it.sub = sub; it.squid = squid; }
      }
      // Inhale: normal movement continues; main, sub and squid form are withheld.
      const fire = it.fire, sub = it.sub, squid = it.squid;
      it.fire = false; it.sub = false; it.squid = false;
      this.form = 'kid';
      this.specialActive = null;                    // so the native pass does not early-return
      let result;
      try { result = update.call(this, dt); }
      finally {
        it.fire = fire; it.sub = sub; it.squid = squid;
        // Only restore the token if this actor is still alive and still owns it.
        if (this.alive && states.get(this) === state && !this.specialActive) this.specialActive = s;
      }
      inkVacUpdate(this, dt);
      return result;
    };

    proto._startSpecial = function () {
      if (this.weapon.special !== VAC_ID) return startSpecial.call(this);
      // A genuine native activation, exactly once: alive, not already holding a
      // special, no live state (reentrancy), and the special actually ready.
      if (!this.alive) return undefined;
      if (this.specialActive || states.has(this)) return undefined;
      if (typeof this.specialReady === 'function' && !this.specialReady()) return undefined;
      this.special = 0;
      this.stats.specials++;
      this.form = 'kid';
      this._setClimb(false);
      api.emit?.('special:use', { actor: this, id: VAC_ID });
      api.G.audio?.play('special_activate', { pos: this.isLocal ? undefined : this.pos, volume: this.isLocal ? 1 : 0.7 });
      const state = makeState(this, { remote: false, serial: ++activationSeq });
      states.set(this, state);
      this.specialActive = { id: VAC_ID, t: 0, phase: 'inhale', armor: false };
      this.ink = api.PLAYER.inkMax;                 // tank refill, once per activation
      createVisual(state);
      api.emit?.(INK_VAC_EVENTS.activation, { actor: this, kit: VAC_ID, serial: state.serial,
        charge: 0, ...(this.nid !== undefined ? { nid: this.nid } : {}) });
      return undefined;
    };

    proto.splat = function (...args) { disposeInkVac(this); return splat.apply(this, args); };
    proto.reset = function (...args) { disposeInkVac(this); return reset.apply(this, args); };
  }

  const { Projectiles } = api;
  if (Projectiles?.prototype && !Projectiles.prototype.fireInkVacExhale) {
    Projectiles.prototype.fireInkVacExhale = function (a, payload) {
      const p = this._new();
      const o = originOf(a, new THREE.Vector3());
      const f = forwardOf(a, new THREE.Vector3());
      const charge = payload.charge ?? 0;
      const d = payload.descriptor || inkVacBlastDescriptor(charge);
      Object.assign(p, {
        type: 'blast', owner: a, team: a.team,
        age: 0,                                     // native _step integrates from this clock
        wid: d.id,                                  // native splash cause id
        s3SpecialWeapon: d,                         // set BEFORE _push (parent preserves it)
        damage: exhaleDamage(),                     // direct damage travels on p.damage
        size: 0.2, radius: d.impactRadius,
        splashRadius: d.splashRadius, splashDamageMax: d.splashDamageMax,
        splashDamageMin: d.splashDamageMin, burstRadius: d.burstRadius,
        damageBands: d.damageBands,
        // pinned ballistics: per-frame spawn speed x60, per-frame^2 gravity x3600,
        // per-frame air resistance x60. SpawnBlastWaitFrame is the native LIFETIME
        // before detonation; delay stays 0 so the native integrator runs at once and
        // the native step bursts the projectile on the age > life deadline.
        vel: f.multiplyScalar(exhaleSpeed(charge)),
        life: SPAWN_BLAST_WAIT / INK_VAC_CALIBRATION.framesPerSecond,
        delay: 0,
        straight: 0, grav: FLY_GRAVITY * 3600, drag: FLY_AIR_RESIST * 60,
        trail: 0, trailEvery: 0,
      });
      p.pos.copy(o); p.prev.copy(o); p.start.copy(o);
      this._push(p);
      return p;
    };
  }

  api.inkVacAbsorbCandidate = inkVacAbsorbCandidate;
  api.inkVacState = inkVacState;
  // Remote replay surface. The parent wires these into the native NetMatch
  // transport: add INK_VAC_EVENTS names to the native FORWARD list and call
  // api.replayInkVac(name, e.actor || e.victim, e) from the replay path.
  api.replayInkVac = replayInkVac;
  api.advanceInkVacReplica = advanceInkVacReplica;
  api.INK_VAC_EVENTS = INK_VAC_EVENTS;

  // Remote actors are driven by NetMatch.applyRemote, not Actor.update, so the
  // replica cone is advanced from there when the real NetMatch is available.
  const NM = api.NetMatch;
  if (NM?.prototype?.applyRemote && !NM.prototype[INSTALL]) {
    Object.defineProperty(NM.prototype, INSTALL, { value: true });
    const applyRemote = NM.prototype.applyRemote;
    NM.prototype.applyRemote = function (a, dt) {
      const r = applyRemote.call(this, a, dt);
      advanceInkVacReplica(a, dt);
      return r;
    };
  }
  return api;
}