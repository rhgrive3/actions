// State-driven Super Jump presentation on the actual public rig. No trajectory,
// physics, form change, gameplay timer or input is written here. Nintendo's
// public report establishes preparation/flight, not a published joint curve.
const INSTALLED = Symbol.for('inkwave.s3.superjump-motion.installed.v1');
const STATE = Symbol.for('inkwave.s3.superjump-motion.state.v1');
const clamp = x => Math.max(0, Math.min(1, x));
function shown(ch) {
  for (let p = ch.root; p; p = p.parent) if (p.visible === false) return false;
  return true;
}
const flightPhase = phase => phase === 'takeoff' || phase === 'flight' || phase === 'descent';
const CLEAR_EVENTS = new Set(['spawn', 'movement_cancel', 'jump', 'dodge', 'shoot', 'throw',
  'flick', 'slosh', 'charge_release', 'special_leap', 'special_slam']);

// Reuse the native dolphin-arc shape/deformation calibration for every Super
// Jump flight, including short/vertical flights missed by its hs > 3 gate.
export const SUPERJUMP_MOTION_CALIBRATION = Object.freeze({
  flightStretch: .22, flightWiggleAmplitude: .03, flightWiggleFrequency: 16,
  touchdownWindow: .8,
});

export function superjumpMotionSnapshot(ch) {
  const m = ch?.[STATE];
  return m ? { phase: m.phase, progress: m.progress, applied: m.applied,
    touchdown: m.touchdown, disposed: m.disposed,
    mantleWorld: m.mantle.toArray(), resources: 0 } : null;
}

function restore(ch, m) {
  if (!m.applied) return;
  ch.squid.pivot.quaternion.copy(m.baseQuaternion);
  ch.squid.pivot.scale.copy(m.baseScale);
  ch.u.uWig.value.copy(m.baseWiggle);
  m.applied = false;
}
function clear(ch, m, block = true) {
  restore(ch, m);
  const token = ch._owner()?.superJumpState ?? m.token;
  if (block && token) m.blocked = token;
  m.phase = null; m.progress = 0; m.touchdown = false;
  m.token = null;
  m.mantle.set(0, 0, 0);
}

export function installSuperjumpMotion({ Character, Actor, THREE, CHARACTER_TIMERS }, profile) {
  if (!Character || !Actor || !THREE || !Number.isInteger(CHARACTER_TIMERS?.T_LAND)
    || !profile?.superJump) throw new Error('Super Jump motion requires the native rig, Actor, landing timer and tuning');
  const C = Character.prototype, A = Actor.prototype;
  // Symbol.for belongs to the actual prototype, so a second module realm does
  // not stack wrappers or acquire independent state on the same Character.
  if (Object.hasOwn(C, INSTALLED)) return;
  const get = ch => {
    if (!ch[STATE]) Object.defineProperty(ch, STATE, { value: {
      phase: null, progress: 0, touchdown: false, applied: false, disposed: false,
      token: null, blocked: null,
      baseQuaternion: new THREE.Quaternion(), baseScale: new THREE.Vector3(),
      baseWiggle: new THREE.Vector3(), worldQuaternion: new THREE.Quaternion(),
      modelQuaternion: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ'),
      mantle: new THREE.Vector3(),
    } });
    return ch[STATE];
  };
  Object.defineProperty(C, INSTALLED, { value: true });
  const update = C.update, squid = C._updateSquid, trigger = C.trigger,
    dispose = C.dispose, setWeapon = C.setWeapon, setDance = C.setDance;
  C.update = function (dt, s) {
    const m = get(this);
    // Restore before upstream hooks compute their pose. Nothing feeds back
    // into sqQuat/sqPos, pose springs, other action layers or later frames.
    restore(this, m);
    if (m.disposed) return;
    s = s || {};
    const f = s.movementMotion, owner = this._owner();
    const sj = owner ? owner.superJumpState : f?.superJump;
    const eligible = f && f.alive && owner?.alive !== false && !f.special && !owner?.specialActive && !this.dance
      && this.s3SuperjumpMotionEnabled !== false && !s.firing && !s.subAim && !s.rolling;
    if (!eligible) clear(this, m);
    const allowed = eligible && (!sj || sj !== m.blocked);
    m.phase = null; m.progress = 0; m.mantle.set(0, 0, 0);
    if (!allowed) m.touchdown = false;
    else if (sj?.phase === 'charge' && (s.form || 'kid') !== 'kid') {
      m.token = sj;
      m.touchdown = false; m.phase = 'charge';
      m.progress = clamp(sj.t / Math.max(1e-10, f.chargeTime ?? profile.superJump.chargeTime));
    } else if (sj?.phase === 'flight') {
      m.token = sj;
      m.touchdown = false; m.progress = clamp(sj.t / Math.max(1e-10, sj.dur ?? profile.superJump.flightTime));
      m.phase = (s.form || 'kid') === 'kid' ? 'descent' : sj.t === 0 ? 'takeoff' : 'flight';
    } else if (m.touchdown && !sj && s.grounded && (s.form || 'kid') === 'kid'
      && this.tr[CHARACTER_TIMERS.T_LAND] + Math.max(0, Math.min(.1, dt || 0)) < SUPERJUMP_MOTION_CALIBRATION.touchdownWindow) {
      // Only observe the existing native landing clock/pose; no parallel age.
      m.phase = 'touchdown';
    } else m.touchdown = false;
    return update.call(this, dt, s);
  };
  C._updateSquid = function (dt, s) {
    const result = squid.call(this, dt, s), m = get(this);
    if (!flightPhase(m.phase) || !shown(this) || this.sqScale <= .001) return result;
    const velocity = s.movementMotion.superJumpVelocity;
    if (!velocity || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y) || !Number.isFinite(velocity.z)) return result;
    const horizontal = Math.hypot(velocity.x, velocity.z), speed = Math.hypot(horizontal, velocity.y);
    // Launch tick has zero velocity before the native trajectory's first step.
    // Keep the mantle up then; subsequent samples follow actual world velocity.
    const yaw = horizontal > 1e-10 ? Math.atan2(velocity.x, velocity.z) : this.root.rotation.y;
    const pitch = speed > 1e-10 ? Math.PI / 2 - Math.atan2(velocity.y, horizontal) : 0;
    m.worldQuaternion.setFromEuler(m.euler.set(pitch, yaw, 0, 'YXZ'));
    this.model.getWorldQuaternion(m.modelQuaternion);
    const pivot = this.squid.pivot;
    m.baseQuaternion.copy(pivot.quaternion); m.baseScale.copy(pivot.scale);
    m.baseWiggle.copy(this.u.uWig.value);
    pivot.quaternion.copy(m.modelQuaternion.invert().multiply(m.worldQuaternion));
    const stretch = 1 + SUPERJUMP_MOTION_CALIBRATION.flightStretch * Math.min(1, speed / 10);
    pivot.scale.set(this.sqSXZ / Math.sqrt(stretch), this.sqSY * stretch, this.sqSXZ / Math.sqrt(stretch));
    this.u.uWig.value.set(SUPERJUMP_MOTION_CALIBRATION.flightWiggleAmplitude,
      SUPERJUMP_MOTION_CALIBRATION.flightWiggleFrequency, clamp(horizontal / 11));
    m.mantle.set(0, 1, 0).applyQuaternion(m.worldQuaternion);
    m.applied = true;
    return result;
  };
  C.trigger = function (name, arg) {
    const m = get(this);
    if (name === 'land') {
      const touchdown = flightPhase(m.phase);
      clear(this, m, false); m.touchdown = touchdown;
    } else if (CLEAR_EVENTS.has(name)) clear(this, m);
    return trigger.call(this, name, arg);
  };
  C.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) clear(this, get(this));
    return setWeapon.apply(this, args);
  };
  C.setDance = function (name, ...args) {
    if (name) clear(this, get(this));
    return setDance.call(this, name, ...args);
  };
  C.dispose = function (...args) {
    const m = get(this); if (m.disposed) return;
    clear(this, m); m.blocked = null; m.disposed = true;
    return dispose.apply(this, args);
  };
  if (!Object.hasOwn(A, INSTALLED)) {
    Object.defineProperty(A, INSTALLED, { value: true });
    const finish = A._finishFrame;
    A._finishFrame = function (...args) {
      const f = this.anim.movementMotion ||= {};
      f.superJump = this.superJumpState; f.superJumpVelocity = this.vel;
      f.alive = this.alive; f.special = this.specialActive; f.chargeTime = this.s3?.jumpChargeTime;
      return finish.apply(this, args);
    };
    for (const method of ['reset', 'splat', '_startSpecial']) {
      const original = A[method];
      A[method] = function (...args) {
        const result = original.apply(this, args);
        if (method === 'reset' || !this.alive || this.specialActive) {
          if (this.character) clear(this.character, get(this.character));
          if (this.anim?.movementMotion) delete this.anim.movementMotion.superJumpVelocity;
        }
        return result;
      };
    }
  }
}
