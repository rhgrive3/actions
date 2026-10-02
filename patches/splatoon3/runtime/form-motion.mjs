// Nintendo's public kid/swim demonstration shows a compact ink-column return
// into the weapon stance. These are INKWAVE visual calibrations, not published
// Nintendo joint curves, transformation frames, or gameplay timings.
export const FORM_MOTION_CALIBRATION = Object.freeze({
  settleStart: .10, settleEnd: .22, reversalBlend: .08, gestureEnd: .16,
  divePitch: .10, emergePitch: -.035, hipDropLegFraction: .025,
  status: 'visual calibration; original input-aligned curves and timings unknown',
});
const INSTALL = Symbol.for('inkwave.s3.form-motion.install.v1');
const RESET = Symbol.for('inkwave.s3.form-motion.reset.v1');
const states = new WeakMap();
const disposed = new WeakSet();
const smooth = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const kid = ch => ch.form === 'kid';
function shape(ch) {
  return { k: ch.kidScale, s: ch.sqScale, ky: ch.kidScale * ch.kidSY,
    kx: ch.kidScale * ch.kidSXZ, sy: ch.sqScale * ch.sqSY,
    sx: ch.sqScale * ch.sqSXZ, lift: ch.kidLift };
}
function put(ch, v) {
  ch.kidScale = v.k; ch.sqScale = v.s;
  ch.kidSY = v.k > 1e-10 ? v.ky / v.k : 1;
  ch.kidSXZ = v.k > 1e-10 ? v.kx / v.k : 1;
  ch.sqSY = v.s > 1e-10 ? v.sy / v.s : 1;
  ch.sqSXZ = v.s > 1e-10 ? v.sx / v.s : 1;
  ch.kidLift = v.lift; ch.kidPop = kid(ch) ? v.k : 0;
  ch.kid.visible = v.k > .001; ch.squidRoot.visible = v.s > .001;
}
function state(ch) {
  let m = states.get(ch);
  if (!m) {
    m = { toKid: kid(ch), clock: ch.formT, age: ch.formT, phase: null,
      previous: null, start: null, frame: null, blocked: false };
    states.set(ch, m);
  }
  return m;
}
// Only read the live actions. The runner, native timers and input are never
// retimed or cleared by this module. A nullable preview has no Actor/Runner.
function busy(ch, m, T) {
  const s = m.frame, a = ch._owner?.(), r = a?.weaponRunner;
  const f = s?.movementMotion;
  if (s?.hp === 0 || f?.alive === false || f?.special || f?.superJump ||
      f?.actions?.roll || f?.actions?.surge || a?.s3?.actions?.roll || a?.s3?.actions?.surge) return true;
  if (a?.alive === false || ch.dance || ch.fidget >= 0 || !ch.grounded || a?.specialActive || a?.superJumpState) return true;
  if (s?.firing || s?.charge > .01 || s?.subAim || s?.rolling || r?.aimingSub || r?.dodge ||
      r?.charge > .01 || r?.rolling || r?.firingPose?.()) return true;
  if (ch.lastShot < .5 || ch.lastRelease < .35) return true;
  if (Number.isInteger(T?.T_LAND) && ch.landAmp > .3 && ch.tr[T.T_LAND] < .8) return true;
  const limits = { T_THROW: .62, T_FLICK: .7, T_SLOSH: .66, T_DODGE: ch.dodgeDur + .5,
    T_LEAP: 1.9, T_SLAM: 1.4, T_SPAWN: 1.4 };
  for (const [name, limit] of Object.entries(limits)) {
    if (Number.isInteger(T?.[name]) && ch.tr[T[name]] < limit) return true;
  }
  return false;
}
export function resetFormMotion(ch) { ch?.[INSTALL]?.reset(ch); }
export function formMotionSnapshot(ch) {
  return ch?.[INSTALL]?.snapshot(ch) ?? null;
}
function snapshot(ch) {
  const m = ch && states.get(ch);
  return m ? { phase: m.phase, age: m.age, reversing: !!m.start,
    actionBlocked: m.blocked, shape: { ...shape(ch) },
    kidVisible: ch.kid.visible, squidVisible: ch.squidRoot.visible } : null;
}

export function installFormMotion({ Character, Actor, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !['SPINE', 'CHEST', 'HIPS_P'].every(k => Number.isInteger(C[k]))) {
    throw Error('Form motion requires the actual Character and exported pose channels');
  }
  const P = Character.prototype;
  if (Object.hasOwn(P, INSTALL)) return;
  const update = P.update, scales = P._updateFormScales, pose = P._poseForm;
  const trigger = P.trigger, weapon = P.setWeapon, dispose = P.dispose;
  if (![update, scales, pose, trigger, weapon, dispose].every(f => typeof f === 'function')) {
    throw Error('Form motion requires the native form, pose and lifecycle methods');
  }
  // Exports from another module realm must use the installed state's owner.
  Object.defineProperty(P, INSTALL, { value: Object.freeze({ snapshot,
    reset: ch => states.delete(ch) }) });
  P.update = function (dt, s) {
    if (disposed.has(this)) return;
    const m = state(this); m.frame = s || null;
    // Native update owns dt clamping, formEnter, input and the complete rig.
    try { return update.call(this, dt, s); }
    finally { m.frame = null; }
  };
  P._updateFormScales = function (dt) {
    if (disposed.has(this)) return;
    const m = state(this), toKid = kid(this), previous = m.previous;
    const changed = toKid !== m.toKid, rewound = this.formT < m.clock - 1e-10;
    const interrupted = changed && previous && m.phase !== null;
    if (changed || rewound) {
      m.age = Math.max(0, dt); m.start = interrupted ? { ...previous } : null;
    } else m.age = this.formT;
    // For a reversal the native formEnter may have skipped into its gesture.
    // Follow the native clock's deltas without ever changing that clock.
    if (!changed && !rewound && m.start) m.age = m.reversalAge + Math.max(0, this.formT - m.clock);
    m.reversalAge = m.age; m.clock = this.formT; m.toKid = toKid;
    const result = scales.call(this, dt);
    if (this.s3FormMotionEnabled === false) {
      m.phase = null; m.start = null; m.previous = shape(this); return result;
    }
    const transition = toKid !== (this.formPrev === 'kid') && this.formT < .45;
    m.phase = transition ? toKid ? 'emerge' : 'dive' : null;
    if (transition) {
      // Retain native disappearance/appearance and underwater lift. Remove
      // only the prolonged rest-scale wobble after the silhouettes exchange.
      const k = 1 - smooth((this.formT - FORM_MOTION_CALIBRATION.settleStart) /
        (FORM_MOTION_CALIBRATION.settleEnd - FORM_MOTION_CALIBRATION.settleStart));
      this.kidSY = 1 + (this.kidSY - 1) * k;
      this.kidSXZ = 1 + (this.kidSXZ - 1) * k;
      this.sqSY = 1 + (this.sqSY - 1) * k;
      this.sqSXZ = 1 + (this.sqSXZ - 1) * k;
      if (m.start) {
        const v = shape(this), weight = smooth(m.age / FORM_MOTION_CALIBRATION.reversalBlend);
        for (const key of Object.keys(v)) v[key] = m.start[key] + (v[key] - m.start[key]) * weight;
        put(this, v);
        if (weight === 1) m.start = null;
      } else if (!(dt > 0) && previous) put(this, previous);
    } else m.start = null;
    m.previous = shape(this);
    return result;
  };
  P._poseForm = function (out) {
    if (disposed.has(this)) return;
    if (this.s3FormMotionEnabled === false) return pose.call(this, out);
    const m = state(this); m.blocked = busy(this, m, T);
    if (!m.phase || m.blocked) return;
    const t = m.start ? m.age : this.formT;
    // Compact dip/return. Keep both native hand IK targets, weapon anchors,
    // all facial channels and hair springs intact; no raised-arm flourish.
    const w = smooth(t / .045) * (1 - smooth((t - .07) /
      (FORM_MOTION_CALIBRATION.gestureEnd - .07)));
    const pitch = m.phase === 'dive' ? FORM_MOTION_CALIBRATION.divePitch
      : FORM_MOTION_CALIBRATION.emergePitch;
    const leg = this.rest.hips.y - this.rest.footL.y;
    out[C.SPINE] += pitch * w; out[C.CHEST] += pitch * .4 * w;
    out[C.HIPS_P + 1] -= leg * FORM_MOTION_CALIBRATION.hipDropLegFraction * w;
  };
  P.trigger = function (name, ...args) {
    if (name === 'spawn') resetFormMotion(this);
    return trigger.call(this, name, ...args);
  };
  P.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) resetFormMotion(this);
    return weapon.apply(this, args);
  };
  P.dispose = function (...args) {
    if (disposed.has(this)) return;
    disposed.add(this);
    resetFormMotion(this); return dispose.apply(this, args);
  };
  if (Actor && !Actor.prototype[RESET]) {
    const A = Actor.prototype, reset = A.reset;
    Object.defineProperty(A, RESET, { value: true });
    A.reset = function (...args) {
      const result = reset.apply(this, args);
      resetFormMotion(this.character); return result;
    };
  }
}
