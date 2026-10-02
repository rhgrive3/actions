// Special-only presentation for the actual public Character. Tidal Slam is a
// native weapon strike, not Inkjet or an implementation of Triple Splashdown.
// Nintendo establishes the action families; all joint/reach values below are
// calibration for this rig. No Actor/Runner clocks or world transforms change.
const INSTALL = Symbol.for('inkwave.s3.special-motion.install.v1');
const states = new WeakMap();
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export const SPECIAL_MOTION_CALIBRATION = Object.freeze({
  stormReleasePose: .10, slamRecovery: .42,
  hangLeadHeight: .70, hangTrailHeight: .20, hangLeadForward: .30,
  status: 'engine visual calibration; original joint curves and frame timings unknown',
});

function state(ch) {
  let m = states.get(ch);
  if (!m) { m = { controlled: false, token: null, blocked: null, phase: null,
    kind: null, recovery: 0, weapon: ch.weaponKind, stormThrow: false, nativeOnly: false }; states.set(ch, m); }
  return m;
}
function clear(ch, block = true) {
  const m = states.get(ch); if (!m) return;
  if (block && m.token) m.blocked = m.token;
  m.token = null; m.phase = m.kind = null; m.recovery = 0;
  m.nativeOnly = false;
}
export function specialMotionSnapshot(ch) {
  const m = states.get(ch);
  return m ? { phase: m.phase, kind: m.kind, recoveryAge: m.recovery,
    controlled: m.controlled, originalMapping: m.kind === 'slam' ? 'native Tidal Slam; closest comparison Triple Splashdown'
      : m.kind === 'storm' ? 'Ink Tempest; closest comparison Ink Storm' : null } : null;
}
export function specialMotionOwnsPose(ch) { return ch.s3SpecialMotionEnabled !== false && !!states.get(ch)?.phase; }

export function installSpecialMotion({ Character, Actor, CHARACTER_CHANNELS: C }, _profile) {
  if (!Character || !C) throw new Error('Special motion requires actual Character and exact pose channels');
  const proto = Character.prototype;
  if (proto[INSTALL]) return;
  Object.defineProperty(proto, INSTALL, { value: true });
  const update = proto.update, leap = proto._poseLeap, slam = proto._poseSlam;
  const throwing = proto._poseThrow, trigger = proto.trigger, setWeapon = proto.setWeapon;
  const dispose = proto.dispose;
  proto.update = function (dt, input) {
    const m = state(this), owner = this._owner(), s = input || {};
    if (this.s3SpecialMotionEnabled !== false && owner) {
      m.controlled = true;
      const live = owner.specialActive, step = Math.max(0, Math.min(.1, dt || 0));
      const form = s.form || 'kid';
      const interrupted = !owner.alive || form !== 'kid' || this.dance || owner.superJumpState
        || owner.weaponRunner?.aimingSub || owner.weaponRunner?.dodge
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
    if (m.kind !== 'slam' || !['fall', 'slam-recovery'].includes(m.phase)) return;
    // The native impact springs and two-bone IK still run. Fade the weapon
    // strike into the normal hold once grounded, instead of its 1.4s timer
    // overriding the player's newly regained control.
    if (m.phase === 'slam-recovery') {
      // Native _poseSlam uses PX too, so keep a bounded, per-character buffer.
      m.base ||= new Float32Array(P.length); m.base.set(P);
      slam.call(this, P, elapsed);
      const weight = 1 - smooth(m.recovery / SPECIAL_MOTION_CALIBRATION.slamRecovery);
      for (let i = 0; i < P.length; i++) P[i] = m.base[i] + (P[i] - m.base[i]) * weight;
      return;
    }
    return slam.call(this, P, elapsed);
  };
  proto._poseThrow = function (P, elapsed) {
    const m = state(this);
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly || !m.stormThrow)
      return throwing.call(this, P, elapsed);
    if (!['storm-deploy', 'storm-recovery'].includes(m.phase)) return;
    // Actor.throwStorm already releases the device at activation. Start at
    // the native whip, rather than cocking an empty hand after deployment.
    return throwing.call(this, P, elapsed + SPECIAL_MOTION_CALIBRATION.stormReleasePose);
  };
  proto.trigger = function (name, ...args) {
    if (name === 'throw') state(this).stormThrow = this._owner()?.specialActive?.id === 'storm';
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
    const m = states.get(this); if (m) m.weapon = this.weaponKind;
    return result;
  };
  proto.dispose = function (...args) { states.delete(this); return dispose.apply(this, args); };
  if (Actor && !Actor.prototype[INSTALL]) {
    Object.defineProperty(Actor.prototype, INSTALL, { value: true });
    for (const name of ['reset', 'splat']) {
      const original = Actor.prototype[name];
      Actor.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (name === 'reset' || !this.alive) clear(this.character);
        return result;
      };
    }
  }
}
