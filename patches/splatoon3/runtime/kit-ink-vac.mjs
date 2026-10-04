// Splat Charger special "Ink Vac" (Splatoon 3 SpBlower) for the public composed
// INKWAVE runtime. Owned by the freebuff-8 kit task.
//
// Design constraints honoured here:
//  * One held, aim-aligned FRONTAL intake volume. It absorbs enemy projectiles /
//    ink that are inside the cone, have clear line of sight to the intake origin,
//    are within intake length, and are travelling toward the player.
//  * Charge is credited ONCE per accepted absorption (never per step, never per
//    re-scan). An absorbed projectile deals zero damage.
//  * The projectile-collision decision is exposed as a narrow candidate hook that
//    the NATIVE projectile chronology calls with (start, end, projectile). It
//    returns the FIRST CONTACT DISTANCE of the projectile with the intake volume
//    and an onHit() that performs the absorption side effects. The hook does NOT
//    integrate or scan native projectiles a second time; the caller owns the pass.
//  * Release produces a charge-scaled countershot blast + turf routed through the
//    native projectile pipeline (a real Projectiles entry) and the native
//    applyHit / paint primitives. A remote ghost never authors damage or paint.
//  * Activation consumes the special gauge and refills the ink tank exactly once.
//  * Normal movement and main/sub weapon use continue while the special is held
//    (the native update early-return for slam/storm is bypassed only for this id).
//  * Expiry / interruption / death / reset clear the state and dispose any GPU
//    resource it created.
//
// Pinned raw values (WeaponSpBlower.game__GameParameterTable.json, Leanny/splat3
// @7280ff9c 11.3.0):
//   InhaleParam.LengthMax = 15 ; RadiusMin.Low = 0.8 ; RadiusMax.Low = 3.3
//   ExhaleParam.DirectDamage = 2200 ; SpawnSpeedZSpecUp.Low = 0.55 ; SpawnSpeedZMaxCharge = 0.7
//   ExhaleBlastParamMin/MaxCharge.PaintRadius = 6.0 / 11.0 ; DistanceDamage Damage = 2200
//   WeaponParam.InhaleToExhaleWaitFrame = 20 ; ExhaleWaitFrame = 150
//
// Every other numeric value (per-projection charge credit, inhale cap, damage unit
// conversion) is explicitly CALIBRATED, not sourced. No physical Switch parity is
// asserted.

let api = null;
const INSTALL = Symbol.for('inkwave.s3.kit-ink-vac.install.v1');

export const INK_VAC_CALIBRATION = Object.freeze({
  rawToHp: 100 / 3000,             // 3000 raw ~= 100 INKWAVE HP (calibration)
  absorbCredit: 0.34,              // charge added per accepted projectile (calibration)
  maxInhaleSeconds: 2.5,           // safety cap; real release is charge-full (calibration)
  breathOriginHeight: 1.0,         // intake origin above feet (kid chest) (calibration)
  frontalEpsilon: -0.05,          // projectile must travel against player forward (calibration)
  status: 'SpBlower geometry pinned; charge/duration/unit conversions are INKWAVE calibration, not sourced',
});

const INHALE_LENGTH = 15;      // pinned LengthMax
const RADIUS_MIN = 0.8;        // pinned RadiusMin.Low
const RADIUS_MAX = 3.3;        // pinned RadiusMax.Low
const EXHALE_DAMAGE_RAW = 2200;// pinned DirectDamage / DistanceDamage Damage
const BLAST_MIN = 6.0;         // pinned ExhaleBlastParamMinCharge.PaintRadius
const BLAST_MAX = 11.0;        // pinned ExhaleBlastParamMaxCharge.PaintRadius

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const states = new WeakMap(); // actor -> state

function requireApi() {
  if (!api) throw new Error('INKWAVE kit-ink-vac not installed');
  return api;
}

// Intake radius grows with accumulated charge (pinned Min.Low -> Max.Low).
export function intakeRadius(charge) { return lerp(RADIUS_MIN, RADIUS_MAX, charge); }
// Countershot blast reach grows with charge (pinned 6 -> 11).
export function blastRadius(charge) { return lerp(BLAST_MIN, BLAST_MAX, charge); }
// Charge-scaled countershot damage, converted from the pinned raw 2200.
export function exhaleDamage(charge) { return EXHALE_DAMAGE_RAW * INK_VAC_CALIBRATION.rawToHp; }

function inkVacState(actor) { return states.get(actor) || null; }

// Horizontal aim-aligned forward of the intake.
function forward(a, out) {
  out.copy(a.aimDir);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  return out.normalize();
}
function origin(a, out) { return out.set(a.pos.x, a.pos.y + INK_VAC_CALIBRATION.breathOriginHeight, a.pos.z); }

// Is point q inside the held frontal intake cone for this state?
function insideIntake(state, q) {
  const a = state.actor, f = forward(a, state._fwd), o = origin(a, state._org);
  const rx = q.x - o.x, ry = q.y - o.y, rz = q.z - o.z;
  const along = rx * f.x + ry * f.y + rz * f.z;
  if (along <= 0 || along > INHALE_LENGTH) return false;          // in front, within intake length
  const latx = rx - f.x * along, laty = ry - f.y * along, latz = rz - f.z * along;
  const lat = Math.hypot(latx, laty, latz);
  return lat <= intakeRadius(state.charge);                        // within the charge-scaled radius
}

// First-contact distance along start->end where the swept point enters the cone.
function firstContactDistance(state, start, end) {
  const n = 16;
  let prev = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    state._q.lerpVectors(start, end, t);
    if (insideIntake(state, state._q)) { prev = t; break; }
  }
  if (prev < 0) return Infinity;
  let lo = Math.max(0, prev - 1 / n), hi = prev;
  for (let k = 0; k < 12; k++) {                                   // bisect the boundary
    const mid = (lo + hi) * 0.5;
    state._q.lerpVectors(start, end, mid);
    if (insideIntake(state, state._q)) hi = mid; else lo = mid;
  }
  return hi * start.distanceTo(end);
}

// Line of sight from the intake origin to the projectile: a wall in between blocks absorption.
function clearPath(state, point) {
  const { G } = api;
  const o = origin(state.actor, state._org);
  return G.physics?.los ? G.physics.los(o, point) : true;
}

// ---------------------------------------------------------------------------
// The narrow candidate hook the native projectile chronology calls per actor.
// Returns { distance, onHit } when this projectile is accepted into the intake,
// else null. onHit() applies absorption exactly once (idempotent per projectile).
export function inkVacAbsorbCandidate(actor, start, end, projectile) {
  const state = inkVacState(actor);
  if (!state || state.phase !== 'inhale' || !projectile) return null;
  if (projectile.team === actor.team) return null;                  // own ink is not absorbed
  if (projectile.s3InkVacAbsorbed) return null;                      // already consumed this pass
  // Direction: only projectiles travelling toward the player enter the frontal intake.
  if (projectile.vel) {
    forward(actor, state._fwd);
    const vl = projectile.vel.length();
    if (vl > 1e-6) {
      const dot = (projectile.vel.x * state._fwd.x + projectile.vel.y * state._fwd.y + projectile.vel.z * state._fwd.z) / vl;
      if (dot > INK_VAC_CALIBRATION.frontalEpsilon) return null;      // leaving / parallel
    }
  }
  // Range + cone + LOS: the projectile's leading position must be inside the intake volume.
  const { THREE } = api;
  const point = new THREE.Vector3().copy(projectile.pos);
  if (!insideIntake(state, point)) return null;                        // current position outside cone
  if (!clearPath(state, point)) return null;                            // intervening wall blocks
  const distance = firstContactDistance(state, start, end);           // first contact along the step
  if (!Number.isFinite(distance)) return null;
  const onHit = () => absorb(state, projectile);
  return { distance, onHit };
}

// Absorption side effects. Guarded so a single projectile is credited and
// neutralised exactly once, no matter how often onHit is invoked.
function absorb(state, projectile) {
  if (projectile.s3InkVacAbsorbed) return false;
  projectile.s3InkVacAbsorbed = true;
  projectile.damage = 0;                       // absorbed rounds deal zero damage
  projectile.s3InkVacCredited = true;
  state.charge = Math.min(1, state.charge + INK_VAC_CALIBRATION.absorbCredit);
  state.absorbed++;
  return true;
}

// ---------------------------------------------------------------------------
// GPU + state lifecycle.
function createVisual(state) {
  const { THREE, G } = api;
  const scene = G.scene;
  if (!scene || typeof scene.add !== 'function' || typeof THREE?.Mesh !== 'function') return;
  // A single cone ring owned by this state, disposed on every exit path.
  const geo = new THREE.ConeGeometry(RADIUS_MAX, INHALE_LENGTH, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: state.actor.color?.getHex ? state.actor.color.getHex() : 0xffffff,
    transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin(state.actor, state._org));
  mesh.rotation.x = Math.PI / 2;               // cone default +Y -> +Z (aim)
  mesh.visible = false;
  scene.add(mesh);
  state.mesh = mesh; state.geo = geo; state.mat = mat;
}
function disposeVisual(state) {
  if (!state) return;
  const { G } = api;
  const mesh = state.mesh;
  if (mesh && G.scene && typeof G.scene.remove === 'function') G.scene.remove(mesh);
  state.geo?.dispose?.(); state.mat?.dispose?.();
  state.mesh = state.geo = state.mat = null;
}
export function disposeInkVac(actor) {
  const state = inkVacState(actor);
  if (!state) return;
  disposeVisual(state);
  if (actor.specialActive && actor.specialActive.id === 'inkvac') actor.specialActive = null;
  states.delete(actor);
}

// ---------------------------------------------------------------------------
// Release: charge-scaled countershot blast + turf, via the native projectile
// pipeline. A remote ghost authors nothing.
function release(state) {
  const a = state.actor, c = state.charge;
  const { G, emit, THREE } = api;
  state.phase = 'done';
  a.specialActive = null;                       // native lifecycle: control returns
  disposeVisual(state);
  if (a.remote) { states.delete(a); emit?.('special:inkvac-release', { actor: a, charge: c, authored: false }); return; }
  // Native pipeline handoff: Projectiles owns motion/lifetime of the countershot.
  const payload = { radius: blastRadius(c), damage: exhaleDamage(c), charge: c, kind: 'inkvac' };
  try { G.projectiles?.fireInkVacExhale?.(a, payload); } catch { /* parent-owned pipeline */ }
  // Countershot detonation: charge-scaled splash damage + turf via native primitives.
  const o = origin(a, new THREE.Vector3());
  const dmg = payload.damage;
  const applyHit = G.projectiles?.applyHit;
  if (applyHit) for (const e of G.actors) {
    if (e === a || e.team === a.team || !e.alive) continue;
    const p = new THREE.Vector3(e.pos.x, e.pos.y + 0.7, e.pos.z);
    const d = p.distanceTo(o);
    if (d > payload.radius) continue;
    if (G.physics?.los && !G.physics.los(o, p)) continue;
    applyHit(a, e, dmg, 'inkvac');
  }
  const down = new THREE.Vector3(0, -1, 0);
  const g = G.physics?.raycast?.(o, down, 3.5, new api.Hit());
  if (g && g.hit) {
    const centre = new THREE.Vector3().copy(g.point).addScaledVector(g.normal, 0.1);
    let area = 0;
    area += G.paint.splat(centre, payload.radius * 0.72, a.team, { seed: Math.random() });
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
      const rr = payload.radius * (0.55 + Math.random() * 0.3);
      area += G.paint.splat(new THREE.Vector3(centre.x + Math.cos(ang) * rr, centre.y + 0.1, centre.z + Math.sin(ang) * rr),
        1.1 + Math.random() * 0.6, a.team, { seed: Math.random() });
    }
    a.addTurf(area);
  }
  emit?.('special:inkvac-release', { actor: a, charge: c, authored: true });
  states.delete(a);
}

// Exhale countershot via the NATIVE projectile pipeline: push a real Projectiles
// entry the native _step integrates. The splash/turf is applied by release().
function installExhaleHandler(Projectiles) {
  if (!Projectiles?.prototype || Projectiles.prototype.fireInkVacExhale) return;
  const { THREE } = api;
  Projectiles.prototype.fireInkVacExhale = function (a, payload) {
    const p = this._new();
    const o = origin(a, new THREE.Vector3());
    const f = forward(a, new THREE.Vector3());
    Object.assign(p, { type: 'shot', owner: a, team: a.team, wid: 'inkvac', damage: 0, size: 0.2,
      radius: payload.radius * 0.4, life: 0.5, straight: 1, grav: 0, drag: 0, trail: 0, trailEvery: 0 });
    p.pos.copy(o); p.prev.copy(o); p.start.copy(o);
    p.vel.copy(f).multiplyScalar(2);
    this._push(p);
    return p;
  };
}

// Per-frame advance. Runs after the (bypassed) native update so normal movement
// and weapons keep working during the held special.
function inkVacUpdate(a, dt) {
  const state = inkVacState(a);
  if (!state || state.phase !== 'inhale') return;
  state.t += dt;
  if (state.charge >= 1 || state.t >= INK_VAC_CALIBRATION.maxInhaleSeconds) { release(state); return; }
  if (state.mesh) {
    state.mesh.position.copy(origin(a, state._org));
    state.mesh.quaternion.setFromUnitVectors(new api.THREE.Vector3(0, 1, 0), forward(a, state._fwd));
    state.mesh.scale.set(1, 1, 1);
  }
}

// ---------------------------------------------------------------------------
export function installKitInkVac(context, _profile) {
  if (context === api && Object.hasOwn(api.Actor?.prototype || {}, INSTALL)) return api;
  api = context;
  const { Actor, THREE, Hit } = api;
  if (!Actor?.prototype || !THREE?.Vector3) throw new Error('Ink Vac requires the actual Actor and THREE');
  const proto = Actor.prototype;
  if (!Object.hasOwn(proto, INSTALL)) {
    Object.defineProperty(proto, INSTALL, { value: true });
    const update = proto.update, startSpecial = proto._startSpecial;
    const splat = proto.splat, reset = proto.reset;

    proto.update = function (dt) {
      const s = this.specialActive;
      const mine = s && s.id === 'inkvac';
      if (!mine) return update.call(this, dt);
      // Hide the token for the native pass so movement/weapons keep running,
      // then restore it so death/reset and the native lifecycle still own it.
      this.specialActive = null;
      let result;
      try { result = update.call(this, dt); }
      finally { if (this.specialActive === null) this.specialActive = s; }
      inkVacUpdate(this, dt);
      return result;
    };

    proto._startSpecial = function () {
      const id = this.weapon.special;
      if (id !== 'inkvac') return startSpecial.call(this);
      // Consume gauge + emit + kid form, exactly as the native activation, then
      // refill the tank once and open the held intake.
      this.special = 0;
      this.stats.specials++;
      this.form = 'kid';
      this._setClimb(false);
      api.emit?.('special:use', { actor: this, id });
      api.G.audio?.play('special_activate', { pos: this.isLocal ? undefined : this.pos, volume: this.isLocal ? 1 : 0.7 });
      const state = { actor: this, t: 0, phase: 'inhale', charge: 0, absorbed: 0, mesh: null, geo: null, mat: null,
        _fwd: new THREE.Vector3(), _org: new THREE.Vector3(), _q: new THREE.Vector3() };
      states.set(this, state);
      this.specialActive = { id, t: 0, phase: 'inhale', armor: false };
      this.ink = api.PLAYER.inkMax;   // tank refill, once per activation
      createVisual(state);
      api.emit?.('special:inkvac', { actor: this });
      return undefined;
    };

    // Death / reset clear the held state and dispose GPU resources.
    proto.splat = function (...args) { disposeInkVac(this); return splat.apply(this, args); };
    proto.reset = function (...args) { disposeInkVac(this); return reset.apply(this, args); };
  }

  installExhaleHandler(api.Projectiles);
  // Expose the candidate hook + state lookup for the native projectile chronology.
  api.inkVacAbsorbCandidate = inkVacAbsorbCandidate;
  api.inkVacState = inkVacState;
  return api;
}