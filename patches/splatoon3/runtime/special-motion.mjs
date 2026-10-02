// Special-only presentation for the actual public Character. Tidal Slam is a
// native weapon strike, not Inkjet or an implementation of Triple Splashdown.
// Nintendo establishes the action families; all joint/reach values below are
// calibration for this rig. No Actor/Runner clocks or world transforms change.
const INSTALL = Symbol.for('inkwave.s3.special-motion.install.v1');
const states = new WeakMap();
const stateMap = ch => ch?.[INSTALL]?.states ?? states;
function shown(ch) {
  for (let p = ch.root; p; p = p.parent) if (p.visible === false) return false;
  return true;
}
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export const SPECIAL_MOTION_CALIBRATION = Object.freeze({
  stormReleasePose: .10, slamRecovery: .42,
  hangLeadHeight: .70, hangTrailHeight: .20, hangLeadForward: .30,
  status: 'engine visual calibration; original joint curves and frame timings unknown',
});

function state(ch) {
  const map = stateMap(ch);
  let m = map.get(ch);
  if (!m) { m = { controlled: false, token: null, blocked: null, phase: null,
    kind: null, recovery: 0, weapon: ch.weaponKind, stormThrow: false, nativeOnly: false,
    impactPending: false }; map.set(ch, m); }
  return m;
}
function clear(ch, block = true) {
  const m = stateMap(ch).get(ch); if (!m) return;
  // Interruption can precede the first visual observation of a live action.
  const token = ch._owner()?.specialActive ?? m.token;
  if (block && token) m.blocked = token;
  m.token = null; m.phase = m.kind = null; m.recovery = 0;
  m.nativeOnly = false;
}
export function specialMotionSnapshot(ch) {
  const m = stateMap(ch).get(ch);
  return m ? { phase: m.phase, kind: m.kind, recoveryAge: m.recovery, impactPending: m.impactPending,
    controlled: m.controlled, originalMapping: m.kind === 'slam' ? 'native Tidal Slam; closest comparison Triple Splashdown'
      : m.kind === 'storm' ? 'Ink Tempest; closest comparison Ink Storm' : null } : null;
}
export function specialMotionOwnsPose(ch) { return ch?.s3SpecialMotionEnabled !== false && !!stateMap(ch).get(ch)?.phase; }

// Replace ONLY a caller's legacy leap/slam timer conjunction. Every other
// contact/gait criterion stays with that caller. Detached, disabled and
// unmapped network presentation retains the supplied native timer decision.
export function specialMotionAllowsFootPlant(ch, nativeEligible) {
  const m = stateMap(ch).get(ch);
  if (!ch?.[INSTALL] || ch.s3SpecialMotionEnabled === false || !m?.controlled || m.nativeOnly)
    return nativeEligible;
  return !(m.kind === 'slam' && m.phase);
}

export function installSpecialMotion({ Character, Actor, THREE, CHARACTER_CHANNELS: C,
  CHARACTER_TIMERS: T, CHARACTER_BOMB_POSE: nativePose }, _profile) {
  if (!Character || !THREE || !C || !Number.isInteger(T?.T_THROW) || !Number.isInteger(T?.T_SLAM)
    || typeof nativePose?.throw !== 'function')
    throw new Error('Special motion requires actual Character, pose/timer channels and native throw method');
  const proto = Character.prototype;
  if (Object.hasOwn(proto, INSTALL)) return;
  Object.defineProperty(proto, INSTALL, { value: Object.freeze({ states }) });
  const update = proto.update, leap = proto._poseLeap, slam = proto._poseSlam;
  const throwing = proto._poseThrow, trigger = proto.trigger, setWeapon = proto.setWeapon;
  const dispose = proto.dispose, build = proto._buildPose, solve = proto._solveLimb;
  const stormOwned = (ch, m) => ch.s3SpecialMotionEnabled !== false && m.controlled && !m.nativeOnly && m.stormThrow;
  proto.update = function (dt, input) {
    const m = state(this), owner = this._owner(), s = input || {};
    if (this.s3SpecialMotionEnabled !== false && owner) {
      m.controlled = true;
      const live = owner.specialActive, step = Math.max(0, Math.min(.1, dt || 0));
      const form = s.form || 'kid';
      const interrupted = !owner.alive || s.hp === 0 || form !== 'kid' || this.dance || !shown(this) || owner.superJumpState
        || s.subAim || s.rolling || owner.weaponRunner?.aimingSub || owner.weaponRunner?.dodge
        || (!live && owner.weaponRunner?.firingPose())
        || this.weaponKind !== m.weapon;
      if (interrupted) clear(this);
      else if (live && live !== m.blocked && (live.id === 'slam' || live.id === 'storm')) {
        m.token = live; m.kind = live.id; m.recovery = 0;
        // Network proxies may supply only {id, net:true}; the local physics
        // phase cannot be inferred from it. Retain native replay presentation.
        m.nativeOnly = !Number.isFinite(live.t) || (live.id === 'slam' && !['rise', 'hang', 'fall'].includes(live.phase));
        m.phase = m.nativeOnly ? 'native-unmapped' : live.id === 'storm' ? 'storm-deploy' : live.phase;
      } else if (!live && m.token) {
        // Only a completed grounded fall earns impact recovery. Cancellation
        // in rise/hang must not resurrect a slam after returning to kid form.
        const completed = m.kind === 'slam' && m.phase === 'fall' && s.grounded;
        const stormEnd = m.kind === 'storm' && m.phase === 'storm-deploy';
        m.token = null; m.recovery = step; m.nativeOnly = false;
        m.phase = completed ? 'slam-recovery' : stormEnd ? 'storm-recovery' : null;
        if (!m.phase) m.kind = null;
      } else if (m.phase === 'slam-recovery' || m.phase === 'storm-recovery') {
        m.recovery += step;
        if (m.recovery >= SPECIAL_MOTION_CALIBRATION.slamRecovery) clear(this, false);
      } else if (live !== m.blocked) clear(this, false);
      m.weapon = this.weaponKind;
      if (this.tr[T.T_SLAM] >= 1.4) m.impactPending = false;
    } else if (m.controlled) {
      clear(this);
      if (!owner) m.controlled = false;
    }
    return update.call(this, dt, input);
  };
  proto._poseLeap = function (P, elapsed) {
    const m = state(this);
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly) return leap.call(this, P, elapsed);
    if (m.kind !== 'slam' || !['rise', 'hang'].includes(m.phase)) return;
    const result = leap.call(this, P, elapsed);
    // Nintendo's airborne Triple Splashdown render has a clearly lifted lead
    // knee and a trailing foot below it. Borrow only that readable silhouette
    // for Tidal Slam's hang; preserve its own somersault and weapon strike.
    const k = m.phase === 'hang' ? 1 : smooth((elapsed - .44) / .14);
    const span = this.rest.hips.y - this.rest.footL.y, v = SPECIAL_MOTION_CALIBRATION;
    P[C.FOOTL + 1] += (this.rest.footL.y + span * v.hangLeadHeight - P[C.FOOTL + 1]) * k;
    P[C.FOOTL + 2] += (span * v.hangLeadForward - P[C.FOOTL + 2]) * k;
    P[C.FOOTR + 1] += (this.rest.footR.y + span * v.hangTrailHeight - P[C.FOOTR + 1]) * k;
    return result;
  };
  proto._poseSlam = function (P, elapsed) {
    const m = state(this);
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly) return slam.call(this, P, elapsed);
    if (m.kind !== 'slam' || !['fall', 'slam-recovery'].includes(m.phase)) {
      // A low ceiling can make actual Physics impact occur at st <= .02.
      // Native _poseSlam defers its impact clock/spring/hair impulse until a
      // later grounded pose. A new shot may already own that pose. Delegate
      // the pending native effect once, discarding only the old strike pose.
      if (m.impactPending && this.grounded && elapsed > .02 && !this.slamGround) {
        m.base ||= new Float32Array(P.length); m.base.set(P);
        try { slam.call(this, P, elapsed); } finally { P.set(m.base); }
        if (this.slamGround) m.impactPending = false;
      }
      return;
    }
    // The native impact springs and two-bone IK still run. Fade the weapon
    // strike into the normal hold once grounded, instead of its 1.4s timer
    // overriding the player's newly regained control.
    if (m.phase === 'slam-recovery') {
      // Native _poseSlam uses PX too, so keep a bounded, per-character buffer.
      m.base ||= new Float32Array(P.length); m.base.set(P);
      slam.call(this, P, elapsed);
      if (this.slamGround) m.impactPending = false;
      const weight = 1 - smooth(m.recovery / SPECIAL_MOTION_CALIBRATION.slamRecovery);
      for (let i = 0; i < P.length; i++) P[i] = m.base[i] + (P[i] - m.base[i]) * weight;
      return;
    }
    const result = slam.call(this, P, elapsed);
    if (this.slamGround) m.impactPending = false;
    return result;
  };
  proto._poseThrow = function (P, elapsed) {
    const m = state(this);
    if (!stormOwned(this, m))
      return throwing.call(this, P, elapsed);
    // Managed Storm is applied once after all build layers below.
  };
  proto._solveLimb = function (limb, target, pole, endQuat, weight, slot) {
    const m = state(this), R = this.limbs.armR, L = this.limbs.armL;
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly || m.kind !== 'slam'
      || !m.phase || !endQuat || weight <= .99 || (limb !== R && !(this.dual && limb === L)))
      return solve.call(this, limb, target, pole, endQuat, weight, slot);
    const x = m.reach ||= { right: new THREE.Vector3(), left: new THREE.Vector3(), delta: new THREE.Vector3(),
      leftCenter: new THREE.Vector3(), point: new THREE.Vector3(), parentQ: new THREE.Quaternion(),
      weaponQ: new THREE.Quaternion() };
    this._kidXform(limb.up.parent, x.right, x.parentQ);
    x.right.add(x.delta.copy(limb.up.position).applyQuaternion(x.parentQ));
    // Use the actual native solver's arm span limit, not a longer limb or a
    // fabricated reach residual. A two-handed hold constrains the weapon's
    // right socket by the support arm's sphere as well. Native IK still solves
    // both limbs and the weapon is still attached to the actual solved hand.
    const radius = (limb.a + limb.b) * .9995;
    const support = limb === R && !this.dual && this.P[C.IKL] > .99 && this.P[C.LTW] < .001;
    if (support) {
      this._kidXform(L.up.parent, x.left, x.parentQ);
      x.left.add(x.delta.copy(L.up.position).applyQuaternion(x.parentQ));
      const d = this.weapon.def;
      x.weaponQ.copy(d.handR.quat).invert().premultiply(endQuat);
      x.delta.subVectors(d.handL.pos, d.handR.pos).applyQuaternion(x.weaponQ);
      x.leftCenter.copy(x.left).sub(x.delta);
    }
    x.point.copy(target);
    for (let i = 0; i < (support ? 16 : 1); i++) {
      x.delta.subVectors(x.point, x.right);
      let distance = x.delta.length();
      if (distance > radius) x.point.copy(x.right).addScaledVector(x.delta, radius / distance);
      if (support) {
        x.delta.subVectors(x.point, x.leftCenter); distance = x.delta.length();
        const leftRadius = (L.a + L.b) * .9995;
        if (distance > leftRadius) x.point.copy(x.leftCenter).addScaledVector(x.delta, leftRadius / distance);
      }
    }
    return solve.call(this, limb, x.point, pole, endQuat, weight, slot);
  };
  proto._buildPose = function (...args) {
    const m = state(this);
    if (!stormOwned(this, m)) return build.apply(this, args);
    // Bomb also observes the native 'throw' event and applies its pose after
    // _poseThrow. Use its public opt-out only during this build transaction,
    // so a Storm token (including cancellation) has one presentation owner.
    const descriptor = Object.getOwnPropertyDescriptor(this, 's3BombMotionEnabled');
    let result;
    try {
      Object.defineProperty(this, 's3BombMotionEnabled', { value: false, configurable: true, writable: true });
      result = build.apply(this, args);
    } finally {
      if (descriptor) Object.defineProperty(this, 's3BombMotionEnabled', descriptor);
      else delete this.s3BombMotionEnabled;
    }
    if (['storm-deploy', 'storm-recovery'].includes(m.phase) && this.tr[T.T_THROW] < .62)
      nativePose.throw.call(this, this.P, this.tr[T.T_THROW] + SPECIAL_MOTION_CALIBRATION.stormReleasePose);
    return result;
  };
  proto.trigger = function (name, ...args) {
    if (name === 'throw') state(this).stormThrow = this._owner()?.specialActive?.id === 'storm';
    if ((name === 'throw' && !state(this).stormThrow) || name === 'flick') clear(this);
    if (name === 'special_slam') {
      const m = state(this), live = this._owner()?.specialActive;
      // A short fall can begin and land in one physics tick. The native event
      // is enough to retain that transition when the next visual frame sees
      // specialActive already cleared; no invented gameplay phase clock.
      if (live?.id === 'slam' && live !== m.blocked) { m.token = live; m.kind = 'slam'; m.phase = 'fall'; }
    }
    if (this.s3SpecialMotionEnabled !== false &&
      ['spawn', 'jump', 'superjump', 'squidroll', 'squidsurge', 'squidsurge_top', 'dodge', 'slosh', 'shoot', 'charge_release', 'movement_cancel'].includes(name)) clear(this);
    return trigger.call(this, name, ...args);
  };
  proto.setWeapon = function (kind, ...args) {
    if (kind !== this.weaponKind) clear(this);
    const result = setWeapon.call(this, kind, ...args);
    const m = stateMap(this).get(this); if (m) m.weapon = this.weaponKind;
    return result;
  };
  proto.dispose = function (...args) { stateMap(this).delete(this); return dispose.apply(this, args); };
  if (Actor && !Object.hasOwn(Actor.prototype, INSTALL)) {
    Object.defineProperty(Actor.prototype, INSTALL, { value: true });
    const impact = Actor.prototype._slamImpact;
    Actor.prototype._slamImpact = function (...args) {
      if (this.character && this.character.s3SpecialMotionEnabled !== false) state(this.character).impactPending = true;
      return impact.apply(this, args);
    };
    for (const name of ['reset', 'splat']) {
      const original = Actor.prototype[name];
      Actor.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (name === 'reset' || !this.alive) {
          clear(this.character);
          const m = stateMap(this.character).get(this.character);
          if (m) m.impactPending = false;
        }
        return result;
      };
    }
  }
}
