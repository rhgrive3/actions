// Roller-specific refinements. Timing comes from the existing gameplay profile;
// joint curves are visual calibration against Nintendo's public roller videos.
const EPS = 1e-10;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const READY_ANCHOR = [-.08, .90, .12];
const READY_ROTATION = [-2.95, .04, 1.0];
const ROLL_ANCHOR = [-.07, .885, .24];
const ROLL_ROTATION = [.9, .06, 0];

export function rollerMode(w, vertical) {
  return vertical ? { ...w, flickWindup: w.verticalWindup, flickInterval: w.verticalInterval ?? w.flickInterval, flickInk: w.verticalInk } : w;
}

export function installRollerLogic({ WeaponRunner }, _profile) {
  const roller = WeaponRunner.prototype._roller, reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    this.s3RollerAttack = null;
    if (this.a.character) {
      this.a.character.s3RollerFlick = null;
      this.a.character._s3CancelRollerFlick?.();
    }
    return result;
  };
  WeaponRunner.prototype._roller = function (dt, inp, w) {
    const a = this.a;
    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);
    if (starting) {
      this.cooldown = Math.min(0, this.cooldown);
      this.s3FlickVertical = !a.grounded;
      const mode = rollerMode(w, this.s3FlickVertical);
      this.s3RollerAttack = { vertical: this.s3FlickVertical, windup: mode.flickWindup, interval: mode.flickInterval, elapsed: 0, released: false, rolling: false };
      a.character.s3RollerFlick = this.s3RollerAttack;
      // Starting a new flick lifts the drum. The public runner otherwise leaves
      // rolling=true through its early windup return, including in the air.
      this.rolling = false; this.rollT = 0;
      this.rollLoop?.stop(.12); this.rollLoop = null;
    }
    const state = this.s3RollerAttack, mode = rollerMode(w, this.s3FlickVertical);
    const winding = this.flick >= 0;
    if (state && !starting) state.elapsed = Math.min(state.interval, state.elapsed + dt);
    // Float accumulation must not add a 22nd/27th tick to a 21F/26F windup.
    if (winding && this.flick + dt + EPS >= mode.flickWindup) this.flick = mode.flickWindup;
    const result = roller.call(this, dt, inp, mode);
    if (state) state.rolling = this.rolling;
    if (state && winding && this.flick < 0) {
      state.elapsed = mode.flickWindup;
      state.released = true;
    }
    if (state && state.elapsed + EPS >= state.interval) {
      this.s3RollerAttack = null;
      a.character.s3RollerFlick = null;
    }
    return result;
  };
}

// The X axis across the drum turns upright around the handle (local +Z).
// This is a pose target for the existing two-arm IK, not a second bone rig.
export function verticalRollerPose(elapsed, windup, interval) {
  const coil = ease(elapsed / (windup * .68));
  const whip = ease((elapsed - windup * .76) / (windup * .24));
  const follow = ease((elapsed - windup) / .12);
  const recover = ease((elapsed - windup - .12) / Math.max(.01, interval - windup - .12));
  const weight = ease(elapsed / (2 / 60)) * (1 - recover);
  const anchor = [mix(READY_ANCHOR[0], .015, coil), mix(READY_ANCHOR[1], 1.11, coil), mix(READY_ANCHOR[2], .025, coil)];
  const rotation = [mix(READY_ROTATION[0], -2.45, coil), mix(READY_ROTATION[1], .015, coil), mix(READY_ROTATION[2], Math.PI / 2, coil)];
  // Keep the upright drum clear of the floor through its follow-through. A
  // horizontal carry-height target clips the lower cap while the axis is tilted.
  const release = [-.025, 1.03, .23], end = [-.025, 1.10, .28];
  for (let i = 0; i < 3; i++) anchor[i] = mix(mix(anchor[i], release[i], whip), end[i], follow);
  rotation[0] = mix(mix(rotation[0], -.04, whip), .95, follow);
  rotation[1] = mix(rotation[1], 0, whip);
  return { anchor, rotation, weight, coil: coil * (1 - whip), whip: whip * (1 - recover) };
}

export function installRollerMotion({ Character, CHARACTER_CHANNELS: C, CHARACTER_TIMERS: T }, _profile) {
  if (!Character || !C || !T) throw new Error('Roller motion requires exact upstream Character channels and timers');
  const flick = Character.prototype._poseFlick, animate = Character.prototype._animWeapon, setWeapon = Character.prototype.setWeapon;
  const updateStates = Character.prototype._updateStates, weaponPose = Character.prototype._poseWeapon;
  Character.prototype._s3CancelRollerFlick = function () {
    this.s3RollerFlick = null;
    // A cancelled runner must not fall back to the legacy 0.7s pose or its
    // 0.15s drum impulse on the next Character frame.
    if (this.tr) this.tr[T.T_FLICK] = 99;
    if (this._wst) this._wst.flickReleaseTime = undefined;
  };
  Character.prototype._updateStates = function (dt, s) {
    const previous = this.wRoll;
    const result = updateStates.call(this, dt, s);
    if (this.weaponKind === 'roller') {
      // The runner owns whether the drum is rolling. A fixed 0.6s flick timer
      // otherwise delays the arms after gameplay has already resumed painting.
      const rolling = this.kidForm && this.grounded && !this.dance && !!s.rolling;
      this.wRoll = mix(previous, rolling ? 1 : 0, 1 - Math.exp(-(rolling ? 11 : 6) * dt));
    }
    return result;
  };
  Character.prototype._poseWeapon = function (dt, s) {
    const result = weaponPose.call(this, dt, s);
    if (this.weaponKind !== 'roller' || !this.kidForm || this.dance || this.wSub > .01) return result;
    if (T && (this.tr[T.T_LEAP] < 1.9 || this.tr[T.T_SLAM] < 1.4 || this.tr[T.T_DODGE] < this.dodgeDur || this.tr[T.T_SPAWN] < 1.4)) return result;
    // Official footage carries the raised drum behind the shoulder, then lowers
    // it only to roll. These targets are rig calibration, not Nintendo joints.
    const P = this.P, roll = this.wRoll;
    for (let i = 0; i < 3; i++) {
      P[C.ANC + i] = mix(READY_ANCHOR[i], ROLL_ANCHOR[i], roll);
      P[C.ANCR + i] = mix(READY_ROTATION[i], ROLL_ROTATION[i], roll);
    }
    return result;
  };
  Character.prototype.setWeapon = function (...args) {
    this._s3CancelRollerFlick();
    return setWeapon.apply(this, args);
  };
  Character.prototype._poseFlick = function (P, ft) {
    const state = this.s3RollerFlick;
    if (!state) return flick.call(this, P, ft);
    if (!state.vertical) {
      // Preserve the upstream horizontal joints, retiming coil/whip/recovery to
      // the actual attack, including the existing calibrated cooldown.
      const age = state.elapsed < state.windup ? state.elapsed / state.windup * .23 : .23 + (state.elapsed - state.windup) / (state.interval - state.windup) * .45;
      const base = P.slice();
      flick.call(this, P, age);
      const coil = ease(state.elapsed / (state.windup * .65)) * (1 - ease((state.elapsed - state.windup * .65) / (state.windup * .35)));
      const recover = ease((age - .42) / .26);
      P[C.ANC + 1] -= .16 * coil;
      P[C.ANC + 1] += .18 * ease((state.elapsed - state.windup) / .08) * (1 - recover);
      // Start from the raised carry instead of first dropping to the upstream
      // low carry and lifting again. Keep its arm/body curves for the swing.
      const lift = ease(state.elapsed / (state.windup * .64));
      for (let i = 0; i < 3; i++) {
        P[C.ANC + i] = mix(base[C.ANC + i], P[C.ANC + i], lift);
        P[C.ANCR + i] = mix(base[C.ANCR + i], P[C.ANCR + i], lift);
      }
      const weight = ease(state.elapsed / (3 / 60)) * (state.released && state.rolling ? 1 - this.wRoll : 1);
      for (let i = 0; i < P.length; i++) P[i] = mix(base[i], P[i], weight);
      return;
    }
    const p = verticalRollerPose(state.elapsed, state.windup, state.interval), w = p.weight * (state.released && state.rolling ? 1 - this.wRoll : 1);
    for (let i = 0; i < 3; i++) {
      P[C.ANC + i] = mix(P[C.ANC + i], p.anchor[i], w);
      P[C.ANCR + i] = mix(P[C.ANCR + i], p.rotation[i], w);
    }
    P[C.AFOLT] = mix(P[C.AFOLT], .6, w); P[C.AFOLR] = mix(P[C.AFOLR], .25, w);
    P[C.IKR] = mix(P[C.IKR], 1, w); P[C.IKL] = mix(P[C.IKL], 1, w);
    P[C.SPINE] += (-.18 * p.coil + .32 * p.whip) * w;
    P[C.CHEST] += (-.12 * p.coil + .18 * p.whip) * w;
    P[C.HIPS_P + 1] -= (.025 * p.coil + .045 * p.whip) * w;
    P[C.HLP] += (.055 * p.coil - .09 * p.whip) * w;
    this._effort = Math.max(this._effort || 0, (p.coil + p.whip * .7) * w);
  };
  Character.prototype._animWeapon = function (dt, s, w) {
    const state = this.s3RollerFlick;
    this._wst.flickReleaseTime = state?.windup;
    return animate.call(this, dt, s, w);
  };
}
