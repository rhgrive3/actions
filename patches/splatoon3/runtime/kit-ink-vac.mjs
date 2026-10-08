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
const EXHALE_WAIT = 150;           // pinned frames: maximum return-shot hold
const BLAST_MIN = 6.0, BLAST_MAX = 11.0;// pinned blast paint radius
// Bounded duplicate-proposal memory per owner: a proposal is keyed by
// source projectile + activation, and only the last PROPOSAL_MEMORY keys count.
const PROPOSAL_MEMORY = 64;
// Bounded release/dispose tombstones per replica: a delayed activation naming an
// ended serial must never resurrect a cone. Only the last TOMBSTONE_MEMORY end.
const TOMBSTONE_MEMORY = 32;
// An absorption key is a short transport token, never free-form text.
const MAX_KEY_LENGTH = 64;
const KEY_PATTERN = /^[A-Za-z0-9#._:-]{1,64}$/;

export const INK_VAC_CALIBRATION = Object.freeze({
  rawToHp: RAW_TO_HP,
  framesPerSecond: 60,
  breathOriginHeight: 1.0,   // intake origin above feet (kid chest) — calibration
  frontalEpsilon: -0.05,    // projectile must travel against player aim — calibration
  absorbCapacityDamage: 1100, // S3 11.3.0: approximate damage-equivalent intake capacity
  geometry: 'frustum: near radius at the muzzle growing linearly to far radius at LengthMax; RadiusMin/RadiusMax read as near/far and Low/High as charge ends',
  geometryStatus: 'interpretation / calibration; Nintendo field meaning unconfirmed',
  speedStatus: 'pinned per-frame values multiplied by 60 to per-second',
  damageStatus: 'pinned raw 2200 with repository /10 conversion; exceeds the 100 HP pool (instakill) — physical scale limitation',
  // #1042: S3 suction lasts up to 360F / 6 s. ExhaleWaitFrame is a
  // separate 150F / 2.5 s return-shot hold and must never cap suction.
  inhaleDurationSeconds: 6,
  inhaleDurationStatus: 'community-verified S3 suction cap: 360F / 6.0 s',
  exhaleHoldSeconds: EXHALE_WAIT / 60,
  exhaleHoldStatus: 'pinned ExhaleWaitFrame 150: post-suction return-shot hold / automatic-fire deadline',
  minInhaleSeconds: INHALE_TO_EXHALE_WAIT / 60,
  minInhaleStatus: 'pinned InhaleToExhaleWaitFrame 20: earliest inhale-to-exhale transition after charge completion',
  burstLifetimeSeconds: SPAWN_BLAST_WAIT / 60,
  burstLifetimeStatus: 'pinned SpawnBlastWaitFrame 50 used as the native projectile lifetime; delay stays 0 so the native integrator runs immediately and bursts on the age>life deadline',
  proposalMemory: PROPOSAL_MEMORY,
  tombstoneMemory: TOMBSTONE_MEMORY,
  proposalKeyMaxLength: MAX_KEY_LENGTH,
  authorityStatus: 'the absorb branch validates the claimed sender against the transport-resolved actor, the installed peer-binding validator, team, liveness, the locally-owned live target and the exact live serial. WITHOUT a parent-installed validator the peer binding cannot be checked from a replayed payload and that gap is not papered over.',
  replicaStuckGuardSeconds: 11,
  replicaStuckGuardStatus: 'presentation-only failsafe: 6 s suction + 2x the pinned 2.5 s return-shot hold; owner release/dispose remains authoritative.',
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
  // { actor: owner, kit, serial, charge, power, nid? }
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
// Sender/peer ownership cannot be decided from a replayed payload alone: only the
// native transport knows which peer a packet arrived from. The parent installs
// that binding; until it does, this module records the gap instead of assuming it.
let senderValidator = null;
const tombstones = new WeakMap();
const KNOWN_EVENTS = new Set(Object.values(INK_VAC_EVENTS));
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

/** Parent hook: fn(actor, fromPeerId) must be true only when the transport really
 *  delivered that packet from the peer that owns `actor`. */
export function installInkVacSenderValidator(fn) {
  senderValidator = typeof fn === 'function' ? fn : null;
  return senderValidator;
}

function tombstoneLedger(subject) {
  let s = tombstones.get(subject);
  if (!s) { s = { set: new Set(), order: [] }; tombstones.set(subject, s); }
  return s;
}
// Recorded even when no live replica state exists, so a release that overtakes its
// own activation still blocks the delayed activation.
function addTombstone(subject, serial) {
  const s = tombstoneLedger(subject);
  if (s.set.has(serial)) return false;
  s.set.add(serial); s.order.push(serial);
  while (s.order.length > TOMBSTONE_MEMORY) s.set.delete(s.order.shift());
  return true;
}
function hasTombstone(subject, serial) { return !!tombstones.get(subject)?.set.has(serial); }

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
export function inkVacChargeFromDamage(damage, capacity = INK_VAC_CALIBRATION.absorbCapacityDamage) {
  return Number.isFinite(damage) && Number.isFinite(capacity) && capacity > 0
    ? Math.max(0, Math.min(1, damage / capacity)) : 0;
}
// Native shots carry their authoritative damage in projectile.damage. If a
// special object has no such value, neutralise it without inventing credit.
function absorbedDamageEquivalent(projectile) {
  const raw = projectile?.damage;
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
// The Vac owner does not trust an arbitrary damage amount from a client.
// Its independently known, authenticated shooter's weapon bounds proposals.
function proposalWeaponDamage(weapon) {
  if (!weapon) return 0;
  const value = [weapon.damage, weapon.damageHead, weapon.directDamage,
    weapon.flickDamageNear].find(v => Number.isFinite(v) && v > 0);
  return value || 0;
}
function creditCharge(state, damageEquivalent) {
  const delta = Number.isFinite(damageEquivalent) ? Math.max(0, damageEquivalent) : 0;
  if (!(delta > 0)) return state.charge;
  const capacity = INK_VAC_CALIBRATION.absorbCapacityDamage;
  state.absorbedDamage = Math.min(capacity, (state.absorbedDamage || 0) + delta);
  state.charge = inkVacChargeFromDamage(state.absorbedDamage, capacity);
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
  const nativeBomb = projectile.s3InkVacBomb;
  if (projectile.s3InkVacAbsorbed || nativeBomb?.s3InkVacAbsorbed) return false;
  projectile.s3InkVacAbsorbed = true;
  if (nativeBomb) nativeBomb.s3InkVacAbsorbed = true; // #1118 native bomb lifetime owner consumes it
  // A net ghost is a replay of an authoritative shot: this module applies no
  // authority to it, so it may be consumed VISUALLY only -- no damage edit, no
  // charge, no proposal, no paint.
  if (projectile.ghost) return false;
  const absorbedDamage = absorbedDamageEquivalent(projectile);
  projectile.damage = 0;      // neutralise the shooter-authoritative damage here
  // A replica may not claim charge from a replayed ghost; it proposes instead.
  if (state.remote) return proposeAbsorption(state, projectile);
  creditCharge(state, absorbedDamage);
  return true;
}

// ---------------------------------------------------------------------------
// Presentation. Owned cone built with its apex at the origin so it can never
// extend behind the owner, oriented to the full 3D aim and visible while active.
function makeState(actor, opts = {}) {
  const remote = opts.remote === true;
  // #1010: suction geometry is selected by Special Power Up, not absorbed charge.
  const specialPower = clamp01(Number.isFinite(opts.specialPower)
    ? opts.specialPower : actor?.s3?.modifiers?.specialPower || 0);
  return { actor, remote, serial: opts.serial, t: 0, phase: 'inhale', charge: 0, absorbed: 0, specialPower,
    fireHeld: false, exhaleArmed: false,
    nearR: intakeNearRadius(specialPower), farR: intakeFarRadius(specialPower), baseFar: FAR_HIGH,
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
function beginExhale(state) {
  if (!state || state.phase !== 'inhale') return false;
  state.phase = 'exhale';
  state.t = 0;
  // #1120: a ZR hold carried out of suction arms a later RELEASE edge; the
  // held level itself never authors the return shot.
  state.exhaleArmed = !!state.fireHeld;
  disposeVisual(state);
  const active = state.actor?.specialActive;
  if (active?.id === VAC_ID) active.phase = 'exhale';
  return true;
}
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
  updateVisual(state);
  if (state.t + 1e-10 >= INK_VAC_CALIBRATION.inhaleDurationSeconds ||
      state.charge >= 1 && state.t + 1e-10 >= INK_VAC_CALIBRATION.minInhaleSeconds) {
    beginExhale(state);
  }
}

// Per-frame advance of a REPLICA cone. Remote actors are driven by the native
// NetMatch applyRemote path rather than Actor.update, so the parent calls this
// (directly, or via the applyRemote wrapper installed below). Presentation only:
// it authors no projectile, paint, damage, gauge or refill.
export function advanceInkVacReplica(actor, dt) {
  const state = states.get(actor);
  if (!state || !state.remote || !(dt > 0)) return false;
  state.t += dt;
  if (state.phase === 'inhale') {
    updateVisual(state);
    if (state.t + 1e-10 >= INK_VAC_CALIBRATION.inhaleDurationSeconds ||
        state.charge >= 1 && state.t + 1e-10 >= INK_VAC_CALIBRATION.minInhaleSeconds) beginExhale(state);
  } else if (state.phase === 'exhale' && state.t >= INK_VAC_CALIBRATION.exhaleHoldSeconds + 5) {
    state.phase = 'done';
    states.delete(actor);
  }
  return true;
}

// ---------------------------------------------------------------------------
// REMOTE REPLAY API.
//
// replayInkVac(eventName, actor, payload, opts) is the single entry point the
// parent calls from the native NetMatch transport. `actor` is whatever native
// _onLocalEvent/_playEvent resolve as `e.actor || e.victim`; for an absorption
// PROPOSAL that is the SHOOTER and the Vac owner arrives as payload.target, so a
// proposal can never be credited to the shooter by accident. `opts.from` is the
// peer the packet arrived from -- information this module cannot recover on its
// own, so the parent must pass it and install a sender validator
// (installInkVacSenderValidator) to bind a sender actor to its real owner.
//
// Validation order is deliberate: the event name, payload shape, kit tag, serial
// and subject are all checked BEFORE any state is touched, so a malformed or
// unknown packet can never mutate anything. Every branch returns a verdict
// instead of throwing:
//   { applied: true, ... } | { applied: false, reason }
export function replayInkVac(eventName, actor, payload, opts = {}) {
  const drop = reason => ({ applied: false, reason });
  if (!api) return drop('not-installed');
  const EV = INK_VAC_EVENTS;
  // 1. Unknown event names are refused before anything is read or written.
  if (!KNOWN_EVENTS.has(eventName)) return drop('unknown-event');
  // 2. Shape, tag, serial and subject.
  if (!actor || typeof actor !== 'object') return drop('missing-event-or-actor');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return drop('malformed-payload');
  if (payload.kit !== VAC_ID) return drop('not-inkvac');
  const serial = payload.serial;
  if (!Number.isSafeInteger(serial) || serial < 0) return drop('malformed-serial');
  const subject = eventName === EV.absorb ? payload.target : actor;
  if (!subject || typeof subject !== 'object') return drop('malformed-subject');

  if (eventName === EV.absorb) {
    // --- sender authority -------------------------------------------------
    // The claimed sender must BE the actor the transport resolved, must come
    // from the peer that really owns it, and must be a live enemy.
    if (payload.actor !== actor) return drop('sender-actor-mismatch');
    if (senderValidator) {
      if (opts.from === undefined || opts.from === null) return drop('no-peer-binding-for-sender');
      let owned = false;
      try { owned = senderValidator(actor, opts.from) === true; }
      catch { owned = false; }                     // a throwing validator never grants trust
      if (!owned) return drop('sender-not-owned-by-peer');
    }
    if (actor === subject) return drop('self-proposal');
    if (actor.team === subject.team) return drop('same-team-sender');
    if (actor.alive !== true) return drop('dead-sender');
    // --- target authority -------------------------------------------------
    // Only a live, LOCALLY owned actor holding this exact activation may credit.
    if (subject.remote === true) return drop('replica-is-not-an-authority');
    if (subject.alive !== true) return drop('dead-target');
    const state = states.get(subject);
    if (!state || state.remote) return drop('no-local-activation');
    if (state.phase !== 'inhale' || state.serial !== serial) return drop('stale-or-mismatched-serial');
    const key = payload.key;
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) {
      return drop('malformed-proposal-key');
    }
    const ledger = proposalLedger(subject);
    if (ledger.set.has(key)) return drop('duplicate-proposal');
    ledger.set.add(key); ledger.order.push(key);
    while (ledger.order.length > PROPOSAL_MEMORY) ledger.set.delete(ledger.order.shift());
    creditCharge(state, proposalWeaponDamage(actor.weapon)); // owner-derived, never packet-supplied
    return { applied: true, serial, charge: state.charge };
  }

  // --- owner -> replica state; it may only present ------------------------
  if (subject.remote !== true) return drop('replica-events-need-a-remote-actor');

  if (eventName === EV.release || eventName === EV.dispose) {
    // The tombstone is recorded FIRST and unconditionally, so a release that
    // overtakes its own activation still blocks the delayed activation, and a
    // release for a serial that never reached us still cannot resurrect later.
    const fresh = addTombstone(subject, serial);
    const live = remoteStateOf(subject);
    if (subject.alive !== true) {
      if (live) disposeInkVac(subject);
      return { applied: false, reason: 'dead-actor', serial, tombstoned: fresh };
    }
    if (!live) return { applied: false, reason: 'no-replica-activation', serial, tombstoned: fresh };
    if (live.serial !== serial) return { applied: false, reason: 'stale-or-mismatched-serial', serial, tombstoned: fresh };
    disposeInkVac(subject);          // presentation only: no projectile, paint or damage
    return { applied: true, serial, ended: eventName };
  }

  if (eventName === EV.activation) {
    if (subject.alive !== true) return drop('dead-actor');
    if (hasTombstone(subject, serial)) return drop('activation-after-release-or-dispose');
    const last = remoteSerials.get(subject);
    if (Number.isSafeInteger(last) && serial <= last) return drop('duplicate-or-out-of-order-activation');
    const current = states.get(subject);
    if (current && current.serial === serial) return drop('duplicate-activation');
    if (current) disposeVisual(current);        // a newer activation supersedes an older cone
    const charge = Number.isFinite(payload.charge) ? clamp01(payload.charge) : 0;
    const power = Number.isFinite(payload.power) ? clamp01(payload.power) : 0;
    const state = makeState(subject, { remote: true, serial, specialPower: power });
    state.charge = charge;
    states.set(subject, state);
    remoteSerials.set(subject, serial);
    createVisual(state);
    updateVisual(state);
    return { applied: true, serial, charge };
  }

  // The only remaining event is EV.charge.
  const state = remoteStateOf(subject);
  if (subject.alive !== true) {
    if (state) disposeInkVac(subject);
    return drop('dead-actor');
  }
  if (!state) return drop('no-replica-activation');
  if (state.serial !== serial) return drop('stale-or-mismatched-serial');
  if (!Number.isFinite(payload.charge)) return drop('malformed-charge');
  // Charge is a high-water mark: a reordered packet can never walk a replica's
  // cone backwards, so a stale low value is refused rather than applied.
  const next = clamp01(payload.charge);
  if (next < state.charge) {
    return { applied: false, reason: 'charge-regression-rejected', serial, charge: state.charge };
  }
  state.charge = next;
  if (state.phase === 'inhale' && state.charge >= 1 &&
      state.t + 1e-10 >= INK_VAC_CALIBRATION.minInhaleSeconds) beginExhale(state);
  updateVisual(state);
  return { applied: true, serial, charge: state.charge };
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
      if (!this.alive) { disposeInkVac(this); return update.call(this, dt); }
      if (!(dt > 0)) return undefined;

      const it = this.intent;
      const fire = it.fire, sub = it.sub, squid = it.squid;
      it.fire = false; it.sub = false; it.squid = false;
      this.form = 'kid';
      this.specialActive = null;
      let result;
      try { result = update.call(this, dt); }
      finally {
        it.fire = fire; it.sub = sub; it.squid = squid;
        if (this.alive && states.get(this) === state && !this.specialActive) this.specialActive = s;
      }

      if (states.get(this) !== state || !this.alive) return result;
      if (state.phase === 'inhale') {
        // Keep the physical ZR level across the inhale→exhale boundary. A held
        // suction input may arm the future release edge but cannot fire here.
        state.fireHeld = !!fire;
        inkVacUpdate(this, dt);
      } else if (state.phase === 'exhale') {
        state.t += dt;
        const releaseEdge = state.exhaleArmed && state.fireHeld && !fire;
        if (fire) state.exhaleArmed = true;
        state.fireHeld = !!fire;
        if (releaseEdge || state.t + 1e-10 >= INK_VAC_CALIBRATION.exhaleHoldSeconds) release(state);
      }
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
      const state = makeState(this, { remote: false, serial: ++activationSeq,
        specialPower: this.s3?.modifiers?.specialPower || 0 });
      states.set(this, state);
      this.specialActive = { id: VAC_ID, t: 0, phase: 'inhale', armor: false };
      this.ink = api.PLAYER.inkMax;                 // tank refill, once per activation
      createVisual(state);
      api.emit?.(INK_VAC_EVENTS.activation, { actor: this, kit: VAC_ID, serial: state.serial,
        charge: 0, power: state.specialPower, ...(this.nid !== undefined ? { nid: this.nid } : {}) });
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

  // Native recProj already transports impact radius; it uniquely identifies the
  // charge-scaled 6..11 blast radius, so ghosts restore the same descriptor without
  // a second projectile packet or an authoritative release action.
  api.SPECIALS[VAC_ID] = { ...api.SPECIALS[VAC_ID], id: VAC_ID, name: 'Ink Vac', cost: 190,
    projectileDescriptor: p => inkVacBlastDescriptor(Number.isFinite(p.radius)
      ? clamp01((p.radius - BLAST_MIN) / (BLAST_MAX - BLAST_MIN)) : 0) };
  api.inkVacAbsorbCandidate = inkVacAbsorbCandidate;
  api.inkVacState = inkVacState;
  // Remote replay surface. The parent wires these into the native NetMatch
  // transport: add INK_VAC_EVENTS names to the native FORWARD list and call
  // api.replayInkVac(name, e.actor || e.victim, e) from the replay path.
  api.replayInkVac = replayInkVac;
  // The parent MUST bind the sender actor to the peer the packet came from:
  // installInkVacSenderValidator((actor, fromPeerId) => senderPeerId(actor) === fromPeerId)
  // and pass the peer id as replayInkVac(name, actor, payload, { from }).
  api.installInkVacSenderValidator = installInkVacSenderValidator;
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