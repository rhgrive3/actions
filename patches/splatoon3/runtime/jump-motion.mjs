// Ordinary shooter jump legs. Nintendo's public demonstration establishes the
// bent-knee / rearward-shoe silhouette, not these joint curves or dimensions.
// All values below are visual calibration in the native kid rig's space.
const GUARD = Symbol.for('inkwave.splatoon3.jump-motion.v1');
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const mix = (a, b, w) => a + (b - a) * w;
const CANCEL_EVENTS = new Set(['land', 'spawn', 'throw', 'slosh', 'flick', 'dodge', 'special_leap', 'special_slam',
  'movement_cancel', 'squidroll', 'squidsurge', 'squidsurge_top']);
function foot(P, position, rotation, side, height, rear, pitch, tuck, weight) {
  P[position] = mix(P[position], side * JUMP_MOTION_CALIBRATION.ankleWidth, weight);
  P[position + 1] = mix(P[position + 1], mix(.16, height, tuck), weight);
  P[position + 2] = mix(P[position + 2], mix(-.04, rear, tuck), weight);
  P[rotation] = mix(P[rotation], mix(.2, pitch, tuck), weight);
  P[rotation + 1] = mix(P[rotation + 1], .10 * side, weight);
  P[rotation + 2] = mix(P[rotation + 2], 0, weight);
}

export const JUMP_MOTION_CALIBRATION = Object.freeze({
  ankleWidth: .10, leftHeight: .35, rightHeight: .33,
  leftRear: -.20, rightRear: -.22, leftPitch: .95, rightPitch: 1.02,
});

export function jumpMotionSnapshot(ch) {
  const s = ch?.[GUARD]?.states.get(ch);
  return s ? { active: s.started !== null, age: s.started === null ? null : Math.max(0, ch.t - s.started),
    phase: s.phase, weight: s.weight } : null;
}

export function installJumpMotion({ Character, Actor, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !T || typeof Character.prototype._poseAir !== 'function')
    throw new Error('Jump motion requires the native Character, air hook and exact pose/timer exports');
  for (const name of ['FOOTL', 'FOOTR', 'FOOTLR', 'FOOTRR'])
    if (!Number.isInteger(C[name])) throw new Error(`Missing native jump channel ${name}`);
  for (const name of ['T_FLICK', 'T_THROW', 'T_SLOSH', 'T_SPAWN', 'T_LEAP', 'T_SLAM', 'T_DODGE'])
    if (!Number.isInteger(T[name])) throw new Error(`Missing native action timer ${name}`);
  const proto = Character.prototype;
  // A per-prototype shared symbol also guards duplicate module realms.
  if (Object.hasOwn(proto, GUARD)) return;
  const states = new WeakMap();
  Object.defineProperty(proto, GUARD, { value: { states } });
  const state = ch => {
    let s = states.get(ch);
    if (!s) { s = { started: null, phase: null, weight: 0, allowed: false }; states.set(ch, s); }
    return s;
  };
  const clear = ch => { const s = states.get(ch); if (s) { s.started = null; s.phase = null; s.weight = 0; s.allowed = false; } };
  const timerBusy = ch => ch.tr[T.T_THROW] < .62 || ch.tr[T.T_SLOSH] < .66
    || ch.tr[T.T_FLICK] < .7 || ch.tr[T.T_SPAWN] < 1.4
    || ch.tr[T.T_LEAP] < 1.9 || ch.tr[T.T_SLAM] < 1.4
    || ch.tr[T.T_DODGE] < ch.dodgeDur + .3;
  const interrupted = (ch, input) => {
    const a = ch._owner(), runner = ch._runner(input);
    return ch.s3JumpMotionEnabled === false || (input?.form || 'kid') !== 'kid'
      || a?.alive === false || a?.specialActive || a?.superJumpState || input?.alive === false
      || ch.dance || ch.wDance > .001 || ch.formT < .5 || ch.weaponKind !== 'shooter'
      || input?.subAim || runner?.aimingSub || runner?.dodge || runner?.s3Turret
      || ch.wSub > .001 || ch.bombHeld || timerBusy(ch);
  };
  const trigger = proto.trigger, update = proto.update, poseAir = proto._poseAir;
  const setWeapon = proto.setWeapon, dispose = proto.dispose;
  proto.trigger = function (name, arg) {
    const result = trigger.call(this, name, arg);
    if (name === 'jump') { const s = state(this); s.started = this.t; s.phase = null; s.weight = 0; }
    else if (CANCEL_EVENTS.has(name)) clear(this);
    return result;
  };
  proto.update = function (dt, input) {
    const s = state(this);
    // Evaluate interruptions even when the native hidden-character path skips
    // posing. Never advance our own clock or write a native gameplay clock.
    if (interrupted(this, input) || ((input?.grounded ?? true) && this.t > (s.started ?? this.t))) clear(this);
    s.allowed = s.started !== null && !(input?.grounded ?? true);
    s.phase = null; s.weight = 0;
    return update.call(this, dt, input);
  };
  proto._poseAir = function (P, dt, air) {
    const result = poseAir.call(this, P, dt, air), s = states.get(this);
    if (!s?.allowed || !this.kidForm || this.grounded || this.wAim <= .001) return result;
    const age = Math.max(0, this.t - s.started), vy = this.vyS;
    // Reuse the native launch, apex, ground reach and long-fall envelopes.
    // This keeps takeoff extension and pre-contact reach with their owners.
    const up = smooth(-1.5, 4, vy), apex = 1 - smooth(.6, 3.2, Math.abs(vy));
    const launch = age < .3 ? 1 - smooth(.03, .2, age) : 0;
    const reach = (1 - up) * smooth(.95, .15, this.gnd);
    const longFall = smooth(.4, 1, this.airT) * (1 - up) * (1 - reach);
    const tuck = Math.max(apex, up * .85);
    const w = clamp(air) * clamp(this.wAim) * (1 - launch) * (1 - reach) * (1 - longFall);
    s.weight = w; s.phase = launch > .5 ? 'takeoff' : vy > .6 ? 'rise' : vy < -.6 ? 'fall' : 'apex';
    const v = JUMP_MOTION_CALIBRATION;
    foot(P, C.FOOTL, C.FOOTLR, 1, v.leftHeight, v.leftRear, v.leftPitch, tuck, w);
    foot(P, C.FOOTR, C.FOOTRR, -1, v.rightHeight, v.rightRear, v.rightPitch, tuck, w);
    return result;
  };
  proto.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) clear(this);
    return setWeapon.apply(this, args);
  };
  proto.dispose = function (...args) { states.delete(this); return dispose.apply(this, args); };
  if (Actor) {
    const reset = Actor.prototype.reset;
    Actor.prototype.reset = function (...args) { clear(this.character); return reset.apply(this, args); };
  }
}
