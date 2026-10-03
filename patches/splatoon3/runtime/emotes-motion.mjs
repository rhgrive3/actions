// Presentation timing for the actual public Character. Nintendo's public
// emote preview shows an action followed by a held pose. Its joint curves,
// durations, and a named mapping for these custom variants are unpublished.
// These endpoints select existing native poses: they are engine calibration.
const INSTALL = Symbol.for('inkwave.splatoon3.emotes-motion.v1');
const ACTOR_INSTALL = Symbol.for('inkwave.splatoon3.emotes-motion.actor.v1');
const supported = new Set(['victory', 'defeat', 'menu_idle', 'lobby_pose', 'locker_idle']);
const interruptions = new Set(['shoot', 'throw', 'slosh', 'flick', 'charge_release',
  'dodge', 'leap', 'slam', 'special_leap', 'special_slam', 'hit', 'superjump',
  'spawn', 'movement_cancel', 'squidroll', 'squidsurge', 'squidsurge_top']);

export const EMOTES_MOTION_CALIBRATION = Object.freeze({
  // Pump's hero stance after wink recovery; flourish's camera stance;
  // hops' final landing. Do not freeze the pump with its eye still closed.
  victoryHoldAt: Object.freeze([7.95 / 2.1, 2.6, (8 - 1e-5) / 2.5]),
  provenance: 'existing INKWAVE pose endpoints; visually calibrated, not Nintendo frame values',
});

export function emotesMotionSnapshot(ch) {
  const record = ch?.[INSTALL]?.states.get(ch);
  if (!record) return null;
  const { reach, ...view } = record;
  return { ...view, variant: record.name && record.name === ch.dance ? ch.danceVar : record.variant };
}

export function installEmotesMotion({ Character, Actor, THREE }, _profile) {
  if (!Character?.prototype?._poseDance || !Character.prototype.setDance)
    throw Error('Emotes motion requires the actual public Character dance hooks');
  const C = Character.prototype;
  if (Object.prototype.hasOwnProperty.call(C, INSTALL)) return;
  const states = new WeakMap(), outgoing = new WeakMap(), disposed = new WeakSet();
  Object.defineProperty(C, INSTALL, { value: { states } });
  const pose = C._poseDance, setDance = C.setDance, update = C.update;
  const trigger = C.trigger, setWeapon = C.setWeapon, dispose = C.dispose, setVisible = C.setVisible;
  const enabled = ch => ch.s3EmotesMotionEnabled !== false && !disposed.has(ch);
  const managed = ch => enabled(ch) && (supported.has(ch.dance)
    || (!ch.dance && supported.has(ch.lastDance)));
  const cancel = (ch, reason) => {
    if (!ch || !managed(ch)) return;
    // Cancel only presentation channels. Native events, timers, actor/runner
    // state, physics, and root/world transforms retain their own authority.
    setDance.call(ch, null);
    ch.lastDance = ch.prevDance = null; ch.wDance = 0;
    outgoing.delete(ch);
    states.set(ch, { name: null, variant: null, phase: 'off', poseTime: null, reason });
  };
  C.setDance = function (name) {
    if (enabled(this) && this.dance === 'victory' && name !== this.dance)
      outgoing.set(this, { variant: this.danceVar, age: this.danceT });
    const previous = this.dance, result = setDance.call(this, name);
    if (enabled(this) && previous !== this.dance) {
      states.set(this, { name: this.dance, variant: this.danceVar,
        phase: this.dance ? 'native' : 'off', poseTime: null, reason: null });
    }
    return result;
  };
  C._poseDance = function (D, name, t, dt) {
    if (!enabled(this) || name !== 'victory') return pose.call(this, D, name, t, dt);
    const previous = name !== this.dance ? outgoing.get(this) : null;
    const variant = previous?.variant ?? this.danceVar;
    const endpoint = EMOTES_MOTION_CALIBRATION.victoryHoldAt[variant];
    if (endpoint === undefined) return pose.call(this, D, name, t, dt);
    // The source passes danceT + danceOfs (also for a previous crossfade).
    // Retiming the argument preserves explicit showcase t0, danceT, variant
    // selection, native blend weights, and the native pose/IK application.
    const age = Math.max(0, previous && !this.dance ? previous.age : t - this.danceOfs);
    const sample = Math.min(age, endpoint);
    if (D === this.PD && name === this.dance) {
      let record = states.get(this);
      if (!record) { record = {}; states.set(this, record); }
      record.name = name; record.variant = variant;
      record.phase = age + 1e-10 < endpoint ? 'action' : 'hold';
      record.poseTime = sample; record.reason = null;
    }
    // Native crossfades otherwise evaluate the outgoing pose using the new
    // dance's seed-selected variant. Preserve the actual outgoing selection.
    const currentVariant = this.danceVar;
    this.danceVar = variant;
    try { return pose.call(this, D, name, sample, dt); }
    finally { this.danceVar = currentVariant; }
  };
  const solve = C._solveLimb;
  C._solveLimb = function (limb, target, pole, endQuat, weight, slot) {
    const victory = this.dance === 'victory' || this.lastDance === 'victory' || this.prevDance === 'victory';
    if (!enabled(this) || !victory || this.wDance <= .001 || !endQuat || weight <= .999
      || !(limb === this.limbs.armR || this.dual && limb === this.limbs.armL))
      return solve.call(this, limb, target, pole, endQuat, weight, slot);
    // Preserve the authored native pose and real IK. Project only an unreachable
    // held-hand target onto the actual arm span, including the outgoing fade.
    let x = states.get(this)?.reach;
    if (!x) {
      const record = states.get(this) || {}; states.set(this, record);
      x = record.reach = { shoulder: new THREE.Vector3(), delta: new THREE.Vector3(),
        point: new THREE.Vector3(), parentQ: new THREE.Quaternion() };
    }
    this._kidXform(limb.up.parent, x.shoulder, x.parentQ);
    x.shoulder.add(x.delta.copy(limb.up.position).applyQuaternion(x.parentQ));
    x.delta.subVectors(target, x.shoulder);
    const radius = (limb.a + limb.b) * .9995, distance = x.delta.length();
    const point = distance > radius ? x.point.copy(x.shoulder).addScaledVector(x.delta, radius / distance) : target;
    return solve.call(this, limb, point, pole, endQuat, weight, slot);
  };
  C.update = function (dt, s) {
    if (disposed.has(this)) return;
    if (managed(this)) {
      const owner = this._owner?.();
      const reason = owner?.alive === false ? 'death'
        : !this.root.visible ? 'hidden'
        : (s?.form || owner?.form || 'kid') !== 'kid' ? 'form'
        : s?.subAim || owner?.weaponRunner?.aimingSub ? 'sub'
        : s?.firing || s?.rolling || s?.charge > 0 || owner?.specialActive
          || owner?.superJumpState || owner?.weaponRunner?.dodge ? 'action' : null;
      if (reason) cancel(this, reason);
    }
    return update.call(this, dt, s);
  };
  C.trigger = function (name, arg) {
    if (interruptions.has(name)) cancel(this, name);
    return trigger.call(this, name, arg);
  };
  C.setWeapon = function (kind) {
    if (this.weaponKind && kind !== this.weaponKind) cancel(this, 'weapon');
    return setWeapon.call(this, kind);
  };
  C.setVisible = function (value) {
    if (!value) cancel(this, 'hidden');
    return setVisible.call(this, value);
  };
  C.dispose = function (...args) {
    if (disposed.has(this)) return;
    disposed.add(this); states.delete(this); outgoing.delete(this);
    return dispose.apply(this, args);
  };
  if (Actor?.prototype && !Object.prototype.hasOwnProperty.call(Actor.prototype, ACTOR_INSTALL)) {
    const A = Actor.prototype, reset = A.reset, splat = A.splat;
    Object.defineProperty(A, ACTOR_INSTALL, { value: true });
    A.reset = function (...args) {
      const result = reset.apply(this, args); cancel(this.character, 'reset'); return result;
    };
    A.splat = function (...args) {
      const result = splat.apply(this, args);
      if (!this.alive) cancel(this.character, 'death');
      return result;
    };
  }
}
