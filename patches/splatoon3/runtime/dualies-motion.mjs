// Dualies-only pose correction. Nintendo footage supplies the visible sequence,
// not joint curves or world units. The native rig, IK and shot impulses remain
// authoritative; gameplay state is only read here.
import { specialMotionAllowsAction, bombMotionAllowsAction } from './action-admission.mjs';
import { clearRemoteDodgeClock, remoteDodgePresentation } from './remote-dodge-clock.mjs';
const INSTALL = Symbol.for('inkwave.splatoon3.dualies-motion.v1');
const clamp01 = x => Math.max(0, Math.min(1, x));
// A single smoothstep over a roll goes almost motionless halfway through,
 // then snaps its remaining turn into the feet-plant. The native action clock
 // stays authoritative. Integrate a C1 rotation curve through the real roll.
export function dualiesTurnFraction(progress, calibration = DUALIES_MOTION_CALIBRATION) {
  const { turnStart: start, turnCruise: cruise, turnAtCruise: at, turnEnd: end } = calibration;
  const u = clamp01(progress);
  if (u <= start) return 0;
  if (u >= end) return 1;
  const h0 = cruise - start, h1 = end - cruise;
  if (!(h0 > 0 && h1 > 0 && at > 0 && at < 1)) return clamp01((u - start) / Math.max(1e-6, end - start));
  const a = at / h0, b = (1 - at) / h1;
  const tangent = (h0 + h1) / (h0 / a + h1 / b);
  const first = u <= cruise;
  const lo = first ? start : cruise, h = first ? h0 : h1;
  const v = (u - lo) / h, v2 = v * v, v3 = v2 * v;
  const startValue = first ? 0 : at, endValue = first ? at : 1;
  const m0 = first ? 0 : tangent, m1 = first ? tangent : 0;
  return Math.max(0, Math.min(1,
    (2 * v3 - 3 * v2 + 1) * startValue + (v3 - 2 * v2 + v) * h * m0
    + (-2 * v3 + 3 * v2) * endValue + (v3 - v2) * h * m1));
}

// Fraction of the roll's ground distance covered at progress u, for the same
// profile that moves the actor: geometric per-frame retention `kd` when the
// weapon sources MoveStepKd (catalogue Dualies), otherwise the cubic default
// 1.5u - .5u^3 shared by movement-physics and catalog-dualies-motion.
export function dualiesRollTravelFraction(progress, kd = null, durationSeconds = 0) {
  const u = clamp01(progress);
  if (kd > 0 && kd < 1 && durationSeconds > 0) {
    const log = Math.log(kd) * durationSeconds * 60;
    return clamp01(Math.expm1(log * u) / Math.expm1(log));
  }
  return clamp01(1.5 * u - .5 * u * u * u);
}

// Roll turn driven by distance, not by a separate clock: the tucked body turns
// in step with the ground it covers (fast at the push-off, slowing with the
// braking), completes one turn when 96 % of the distance is covered, and eases
// the last 15 % of the turn into the landing (C1, no snap at either end).
// INKWAVE calibration; no Nintendo joint curve is published.
export const DUALIES_ROLL_TURN = Object.freeze({ completeAtTravel: .96, landingEase: .15 });
export function dualiesRollTurnFraction(progress, motion = null) {
  const travel = dualiesRollTravelFraction(progress, motion?.kd, motion?.dur);
  const t = clamp01(travel / DUALIES_ROLL_TURN.completeAtTravel), e = DUALIES_ROLL_TURN.landingEase;
  if (t <= 1 - e) return t;
  const x = (t - (1 - e)) / e;
  return (1 - e) + e * (-x * x * x + x * x + x);
}

// Startup (sourced ChargeFrame / legacy 4F) leans into the tuck progressively
// instead of snapping into it on the first frame, and drops the body by the
// same amount the roll starts with, so the roll does not jump down 0.26.
export function dualiesStartupProgress(dodge) {
  const total = dodge?.startupDur;
  if (!(total > 0)) return 1;
  const remaining = Number.isFinite(dodge.startup) ? dodge.startup : 0;
  const p = clamp01(1 - remaining / total);
  return p * p * (3 - 2 * p);
}
export const DUALIES_ROLL_DROP = .26; // native tumbleDrop at full tuck

export const DUALIES_MOTION_CALIBRATION = Object.freeze({
  status: 'visual calibration on the public INKWAVE rig; not Nintendo joint data',
  turnStart: .12, turnCruise: .62, turnAtCruise: .76, turnEnd: .94,
});

export function dualiesMotionSnapshot(ch) {
  const installation = ch?.constructor?.prototype?.[INSTALL];
  const s = installation?.states.get(ch);
  return s ? { phase: s.phase, progress: s.progress, direction: [s.x, s.z],
    tumble: ch.tumble, tumbleDrop: ch.tumbleDrop, lockWeight: ch.lockW,
    blockedRoll: !!s.blockedRoll } : null;
}

export function installDualiesMotion({ Character, WeaponRunner, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !T) throw Error('Dualies motion requires actual Character pose channels and timers');
  const proto = Character.prototype;
  if (Object.hasOwn(proto, INSTALL)) return;
  const states = new WeakMap(), disposed = new WeakSet();
  Object.defineProperty(proto, INSTALL, { value: { states, disposed, admission } });
  const updateStates = proto._updateStates, buildPose = proto._buildPose, dodge = proto._poseDodge;
  const poseLook = proto._poseLook;
  const poseWeapon = proto._poseWeapon, setWeapon = proto.setWeapon, dispose = proto.dispose;
  const setVisible = proto.setVisible;
  function state(ch) {
    let s = states.get(ch);
    if (!s) { s = { phase: null, progress: 0, x: 0, z: 1, blockedRoll: null }; states.set(ch, s); }
    return s;
  }
  function enabled(ch) { return ch.s3DualiesMotionEnabled !== false && !disposed.has(ch) && ch.dual && ch.weaponKind === 'dualies'; }
  function allowed(ch, input, runner) {
    const a = ch._owner();
    let shown = true;
    for (let p = ch.root; p; p = p.parent) if (p.visible === false) { shown = false; break; }
    return shown && ch.kidForm && !ch.dance && a?.alive !== false && !a?.superJumpState
      && !(input?.subAim ?? runner?.aimingSub) && !ch.bombHeld
      && bombMotionAllowsAction(ch, ch.tr[T.T_THROW] >= .62) && ch.tr[T.T_SPAWN] >= 1.4
      && specialMotionAllowsAction(ch, !a?.specialActive && ch.tr[T.T_LEAP] >= 1.9 && ch.tr[T.T_SLAM] >= 1.4);
  }
  function clear(ch) {
    states.delete(ch);
    ch.tumble = ch.tumbleDrop = ch.lockW = 0;
  }
  function prepare(ch, input, snapshot=true) {
    const s = state(ch), runner = ch._runner(input), actor = ch._owner();
    if (actor?.remote) {
      const presentation = remoteDodgePresentation(actor), clock = presentation?.clock || null;
      if (presentation) {
        const active = s.blockedRoll !== clock;
        s.phase = active ? presentation.phase : null;
        s.progress = active ? presentation.progress : 0;
        // A validated sender epoch owns visual admission even when the local
        // Character timer has expired (or the proxy Runner has not caught up).
        // A bare F.dodge bit never reaches this branch without a clock.
        s.managed = active;
        s.runner = runner;
        s.nativeFallback = false;
        s.remoteClock = active ? clock : null;
        return snapshot?{ s, runner, d: null, active }:undefined;
      }
      s.blockedRoll = null;
      const allowedPlant = allowed(ch, input, runner)
        && !runner?.dodge && ch.grounded && !!(runner && (runner.lockT > 0 || runner.s3Turret));
      s.phase = allowedPlant ? 'plant' : null;
      s.progress = allowedPlant ? 1 : 0;
      s.managed = false;
      s.runner = runner;
      s.nativeFallback = false;
      s.remoteClock = null;
      return snapshot?{ s, runner, d: null, active: allowedPlant }:undefined;
    }
    s.remoteClock = null;
    const d = runner?.dodge;
    const ok = allowed(ch, input, runner);
    if (!ok && d) s.blockedRoll = d;
    if (!d) s.blockedRoll = null;
    const active = ok && (!d || s.blockedRoll !== d);
    // A preview has no gameplay runner. Keep its native trigger usable without
    // treating an existing runner's cancelled roll as a preview animation.
    const previewAge = ch.tr[T.T_DODGE], preview = !runner && !ch._owner()?.weaponRunner;
    const mapped = !d || Number.isFinite(d.t) && Number.isFinite(d.dur) && d.dur > 0;
    const duration = d?.dur > 0 ? d.dur : ch.dodgeDur;
    s.progress = mapped ? clamp01((d ? d.t : previewAge) / duration) : 0;
    s.phase = mapped && active && (d || preview && previewAge < duration) ? 'roll'
      : active && ch.grounded && (runner ? runner.lockT > 0 || runner.s3Turret
        : preview && previewAge < duration + .5) ? 'plant' : null;
    s.managed = !!runner && mapped;
    s.runner = runner;
    s.nativeFallback = !mapped;
    return snapshot?{ s, runner, d, active }:undefined;
  }
  function admission(ch, runner) {
    const s = states.get(ch);
    const source = s?.runner || s?.remoteClock;
    if (!s?.managed || !source || runner !== undefined && s.runner && s.runner !== runner) return null;
    // State is prepared before calling the earlier/native hooks, then refreshed
    // after them. Helpers never allocate state or advance either action clock.
    return { lock: s.phase === 'plant' || s.phase === 'roll' && s.progress > .55,
      foot: s.phase !== 'roll' || s.progress > .86 };
  }
  proto._updateStates = function (dt, input) {
    const before = this.lockW;
    if (enabled(this)) prepare(this, input, false);
    const result = updateStates.call(this, dt, input);
    if (!enabled(this)) { states.delete(this); return result; }
    const { s, runner, d, active } = prepare(this, input);
    if (s.nativeFallback) return result;
    const remoteDirection = s.remoteClock?.direction;
    if (remoteDirection && s.remoteClock.directionSpace === 'root') {
      const len = Math.hypot(remoteDirection.x, remoteDirection.z);
      if (len > 1e-6) { s.x = remoteDirection.x / len; s.z = remoteDirection.z / len; }
      else { s.x = this.dodgeX; s.z = this.dodgeZ; }
    } else if (remoteDirection || d && runner._dodgeDir && Number.isFinite(runner._dodgeDir.x) && Number.isFinite(runner._dodgeDir.z)) {
      // Re-express the authoritative world direction in the current root frame.
      // A camera/aim turn during a roll must not rotate the physical tumble axis.
      const yaw = this.root.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const x = remoteDirection?.x ?? runner._dodgeDir.x;
      const z = remoteDirection?.z ?? runner._dodgeDir.z;
      const len = Math.hypot(x, z);
      if (len > 1e-6) { s.x = (x * cy - z * sy) / len; s.z = (x * sy + z * cy) / len; }
      else { s.x = this.dodgeX; s.z = this.dodgeZ; }
    } else { s.x = this.dodgeX; s.z = this.dodgeZ; }
    // Native lock admission also uses the old Character trigger age. Remove
    // that independent clock from action arbitration, keeping its blend rates.
    const target = s.phase === 'plant' ? 1 : s.phase === 'roll' && s.progress > .55 ? 1 : 0;
    this.lockW = active ? before + (target - before) * (1 - Math.exp(-(target ? 18 : 7) * dt)) : 0;
    if (s.phase !== 'roll') this.tumble = this.tumbleDrop = 0;
    return result;
  };
  proto._poseDodge = function (P, elapsed) {
    if (!enabled(this) || states.get(this)?.nativeFallback) return dodge.call(this, P, elapsed);
    const s = states.get(this);
    if (s) s.posed = true;
    if (s?.phase !== 'roll') {
      // Native D..D+.28 recovery was still layering foot/hip offsets over the
      // planted weapon pose and the first actual post-roll recoil impulses.
      this.tumble = this.tumbleDrop = 0;
      return;
    }
    // A roll that had a startup is already tucked: start the native pose at
    // its full-tuck point instead of un-tucking for one frame.
    const motion = s.remoteClock ? null : s.runner?.dodge;
    const tucked = motion?.startupDur > 0 ? Math.max(s.progress, .1) : s.progress;
    const result = dodge.call(this, P, tucked * this.dodgeDur);
    // Keep original native tuck, weapon grips and IK. The turn follows the
    // roll's own distance profile (see dualiesRollTurnFraction). Root-local
    // axis is reprojected from the fixed world dodge direction above, so
    // camera yaw does not rotate the physical tumble.
    this.tumble = s.progress < 1 ? 2 * Math.PI * dualiesRollTurnFraction(s.progress, motion) : 0;
    this.tumbleX = s.z; this.tumbleZ = -s.x;
    return result;
  };
  proto._buildPose = function (dt, input) {
    const s = states.get(this);
    if (s) s.posed = false;
    return buildPose.call(this, dt, input);
  };
  proto._poseLook = function (dt, input) {
    const s = states.get(this);
    // The native call site expires by Character's trigger age. A paused or
    // network runner can still be rolling after that visual window expires.
    // Keep the fallback at the native boundary before gaze/face/dance/life.
    // Applying it after _buildPose delayed effort and changed head composition.
    if (enabled(this) && s?.phase === 'roll' && !s.posed) this._poseDodge(this.P, 0);
    return poseLook.call(this, dt, input);
  };
  proto._poseWeapon = function (dt, input) {
    if (!enabled(this) || states.get(this)?.nativeFallback) return poseWeapon.call(this, dt, input);
    const s = states.get(this), lock = this.lockW;
    // The existing weapon-motion lane supplies the planted crouch. While it
    // is suppressed, native _poseWeapon must also leave other actions alone.
    if (!s?.phase) this.lockW = 0;
    try { return poseWeapon.call(this, dt, input); }
    finally { this.lockW = lock; }
  };
  proto.setWeapon = function (...args) {
    if (args[0] !== this.weaponKind) {
      const actor = this._owner();
      if (actor?.remote) clearRemoteDodgeClock(actor);
      if (enabled(this)) clear(this);
    }
    return setWeapon.apply(this, args);
  };
  proto.setVisible = function (value) {
    if (!value && enabled(this)) {
      // Rendering may stop completely while hidden. Retire the pose now and
      // retain the owner action token so showing it cannot replay a roll.
      const s = state(this);
      s.blockedRoll = remoteDodgePresentation(this._owner())?.clock || this._runner()?.dodge || null;
      s.phase = null; s.progress = 0;
      this.tumble = this.tumbleDrop = this.lockW = 0;
    }
    return setVisible.call(this, value);
  };
  proto.dispose = function (...args) {
    disposed.add(this);
    states.delete(this);
    return dispose.apply(this, args);
  };
  if (WeaponRunner) {
    const R = WeaponRunner.prototype, reset = R.reset;
    R.reset = function (...args) {
      const result = reset.apply(this, args), ch = this.a?.character;
      if (ch && enabled(ch)) clear(ch);
      return result;
    };
  }
}
