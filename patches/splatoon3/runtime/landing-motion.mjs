// Nintendo's public shooter film shows knee absorption while the gun stays
// presented. These offsets are INKWAVE visual calibration, not Nintendo joint
// angles or game-frame timings. Native contact, springs and limb IK still run.
import { specialMotionAllowsFootPlant } from './special-motion.mjs';
export const LANDING_MOTION_CALIBRATION = Object.freeze({
  normalPeak: .04, hardPeak: .055, normalRecovery: .22, hardRecovery: .34,
  normalDrop: .045, hardDrop: .08, hipPitch: .07, spinePitch: .10,
  chestPitch: .035, kneeOut: .07, aimedTorso: .25,
});
const INSTALLED = Symbol.for('inkwave.splatoon3.landing-motion.v1');
const ACTOR_INSTALLED = Symbol.for('inkwave.splatoon3.landing-motion.actor.v1');
const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, u) => a + (b - a) * u;
function smooth(a, b, x) { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); }

export function landingMotionSnapshot(ch) {
  return ch?.[INSTALLED]?.snapshot(ch) ?? null;
}

export function installLandingMotion(api, _profile) {
  const { Character, Actor, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T } = api;
  if (!Character || !C || !T || !Number.isInteger(T.T_LAND))
    throw Error('Landing motion requires the native Character pose/timer contract');
  const proto = Character.prototype;
  if (Object.hasOwn(proto, INSTALLED)) return;
  const states = new WeakMap();
  const state = ch => {
    let m = states.get(ch);
    if (!m) { m = { cancelled: false, phase: null, age: null, compression: 0, drop: 0, aimed: 0 }; states.set(ch, m); }
    return m;
  };
  const clear = ch => { if (ch) { const m = state(ch); m.cancelled = true; m.phase = null; m.compression = m.drop = 0; } };
  const snapshot = ch => { const m = states.get(ch); return m ? { ...m } : null; };
  Object.defineProperty(proto, INSTALLED, { value: Object.freeze({ snapshot }) });
  const native = { land: proto._poseLand, states: proto._updateStates,
    trigger: proto.trigger, weapon: proto.setWeapon, dispose: proto.dispose };

  function eligible(ch, s) {
    const owner = ch._owner(), runner = s?.runner ?? owner?.weaponRunner;
    const tr = ch.tr;
    for (let p = ch.root; p; p = p.parent) if (p.visible === false) return false;
    return ch.kidForm && ch.grounded && !ch.dance && ch.wDance < .001 &&
      (!owner || (owner.alive !== false && !owner.specialActive && !owner.superJumpState)) &&
      s?.hp !== 0 && !s?.subAim && !runner?.aimingSub && ch.wSub < .001 &&
      tr[T.T_SPAWN] > 1.4 && specialMotionAllowsFootPlant(ch, tr[T.T_LEAP] > 1.9 && tr[T.T_SLAM] > 1.4) &&
      tr[T.T_DODGE] > ch.dodgeDur + .3 && ch.lockW < .001 &&
      tr[T.T_THROW] > .62 &&
      !(ch.weaponKind === 'roller' && (ch.s3RollerFlick
        ? ch.s3RollerFlick.elapsed < ch.s3RollerFlick.interval : tr[T.T_FLICK] < .7)) &&
      !(ch.hold.fire === 'slosh' && tr[T.T_SLOSH] < .66);
  }

  proto._updateStates = function (dt, s) {
    const result = native.states.call(this, dt, s);
    if (this.s3LandingMotionEnabled === false) return result;
    const m = state(this);
    m.phase = null; m.compression = m.drop = 0;
    if (!eligible(this, s)) clear(this);
    return result;
  };
  proto.trigger = function (name, arg) {
    const result = native.trigger.call(this, name, arg);
    if (this.s3LandingMotionEnabled === false) return result;
    if (name === 'land') {
      const m = state(this); m.cancelled = false; m.age = 0;
      m.phase = null; m.compression = m.drop = 0;
    } else if (['jump', 'spawn', 'leap', 'slam', 'special_leap', 'special_slam', 'movement_cancel', 'dodge', 'throw', 'flick', 'slosh',
      'squidroll', 'squidsurge', 'squidsurge_top'].includes(name)) clear(this);
    return result;
  };
  proto.setWeapon = function (...args) {
    const previous = this.weaponKind, result = native.weapon.apply(this, args);
    if (previous !== undefined && previous !== this.weaponKind) clear(this);
    return result;
  };
  proto._poseLand = function (P, age) {
    if (this.s3LandingMotionEnabled === false) return native.land.call(this, P, age);
    const m = state(this);
    if (m.cancelled || !eligible(this) || !Number.isFinite(age) || age < 0) return;
    const a = clamp(this.landAmp), hard = smooth(.65, .95, a), V = LANDING_MOTION_CALIBRATION;
    const peak = mix(V.normalPeak, V.hardPeak, hard), end = mix(V.normalRecovery, V.hardRecovery, hard);
    const k = smooth(0, peak, age) * (1 - smooth(peak, end, age));
    const impact = smooth(.3, .8, a), aim = clamp(this.wAim);
    const absorb = k * impact, torso = absorb * mix(1, V.aimedTorso, aim);
    m.age = age; m.aimed = aim; m.compression = absorb;
    m.drop = mix(V.normalDrop, V.hardDrop, hard) * absorb;
    m.phase = absorb > 1e-6 ? (age <= peak ? 'absorb' : 'recover') : null;
    // Lower the pelvis over native planted shoes. The actual two-bone solver
    // converts this into knee/ankle flexion; do not replace contact or foot FK.
    P[C.HIPS_P + 1] -= m.drop;
    P[C.HIPS_P + 2] -= .012 * absorb;
    P[C.HIPS] += V.hipPitch * torso;
    P[C.SPINE] += V.spinePitch * torso;
    P[C.CHEST] += V.chestPitch * torso;
    P[C.KNEEL] += V.kneeOut * absorb;
    P[C.KNEER] -= V.kneeOut * absorb;
    // Arm/hand/grip, weapon anchor, head/face, squash and gameplay channels
    // belong to their existing layers. No speculative hand-to-deck gesture.
  };
  proto.dispose = function (...args) {
    try { return native.dispose.apply(this, args); } finally { states.delete(this); }
  };
  if (Actor && !Object.hasOwn(Actor.prototype, ACTOR_INSTALLED)) {
    Object.defineProperty(Actor.prototype, ACTOR_INSTALLED, { value: true });
    for (const method of ['reset', 'splat']) {
      const original = Actor.prototype[method];
      Actor.prototype[method] = function (...args) {
        const result = original.apply(this, args); clear(this.character); return result;
      };
    }
  }
}
